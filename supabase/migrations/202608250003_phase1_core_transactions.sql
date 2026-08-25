
-- Phase 1: Core Transaction - multi-item sales & purchases.
-- Safe additive migration. Existing single-item RPCs remain available.

create or replace function post_sale_multi(
  p_sale_id uuid,
  p_business_unit_id uuid,
  p_items jsonb,
  p_discount numeric default 0
) returns jsonb
language plpgsql
as $$
declare
  v_sale sales%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_item_discount numeric;
  v_gross numeric := 0;
  v_discount_total numeric := coalesce(p_discount,0);
  v_net numeric;
  v_cogs numeric := 0;
  v_balance inventory_balances%rowtype;
  v_location uuid;
  v_movement_no text;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'Minimal satu item penjualan diperlukan';
  end if;

  if v_discount_total < 0 then
    raise exception 'Diskon penjualan tidak boleh negatif';
  end if;

  select * into v_sale
  from sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Dokumen penjualan tidak ditemukan';
  end if;

  if v_sale.status not in ('draft','posted') then
    raise exception 'Dokumen penjualan sudah diproses atau tidak valid';
  end if;

  -- Remove accidental pre-existing details when re-posting a draft.
  delete from sale_items where sale_id = p_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_price := coalesce((v_item->>'unit_selling_price')::numeric,0);
    v_item_discount := coalesce((v_item->>'discount_amount')::numeric,0);

    if v_qty <= 0 then raise exception 'Quantity produk harus > 0'; end if;
    if v_price < 0 then raise exception 'Harga jual tidak boleh negatif'; end if;
    if v_item_discount < 0 then raise exception 'Diskon item tidak boleh negatif'; end if;

    select ib.*, sl.id as resolved_location
      into v_balance, v_location
    from inventory_balances ib
    join stock_locations sl on sl.id = ib.location_id
    join warehouses w on w.id = sl.warehouse_id
    where ib.product_id = v_product_id
      and w.business_unit_id = p_business_unit_id
      and sl.is_active
      and ib.quantity_on_hand >= v_qty
    order by ib.quantity_on_hand desc, sl.path_code
    limit 1
    for update;

    if v_location is null then
      raise exception 'Stok produk % tidak mencukupi untuk store ini', v_product_id;
    end if;

    insert into sale_items(
      sale_id, product_id, source_location_id, quantity,
      unit_selling_price, gross_amount, discount_amount,
      net_amount, unit_cogs, cogs_amount
    )
    values(
      p_sale_id, v_product_id, v_location, v_qty,
      v_price, v_qty*v_price, v_item_discount,
      greatest(0,v_qty*v_price-v_item_discount),
      v_balance.average_unit_cost,
      v_qty*v_balance.average_unit_cost
    );

    update inventory_balances
    set quantity_on_hand = quantity_on_hand - v_qty,
        updated_at = now()
    where id = v_balance.id;

    v_gross := v_gross + (v_qty*v_price);
    v_cogs := v_cogs + (v_qty*v_balance.average_unit_cost);

    v_movement_no := 'MOV-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    insert into inventory_movements(
      movement_no, product_id, business_unit_id,
      source_location_id, movement_type, quantity_in,
      quantity_out, unit_cost, source_document_type,
      source_document_id
    )
    values(
      v_movement_no, v_product_id, p_business_unit_id,
      v_location, 'sale', 0, v_qty,
      v_balance.average_unit_cost, 'sale', p_sale_id
    );
  end loop;

  v_discount_total := least(v_discount_total, v_gross);
  v_net := greatest(0,v_gross-v_discount_total);

  update sales
  set gross_amount = v_gross,
      discount_amount = v_discount_total,
      total_deduction_amount = v_discount_total,
      net_sales_amount = v_net,
      status = 'completed',
      updated_at = now()
  where id = p_sale_id;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'gross_amount', v_gross,
    'discount_amount', v_discount_total,
    'net_sales_amount', v_net,
    'cogs_amount', v_cogs,
    'item_count', jsonb_array_length(p_items)
  );
end;
$$;


create or replace function receive_purchase_multi(
  p_purchase_id uuid,
  p_business_unit_id uuid,
  p_items jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_purchase purchases%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_location uuid;
  v_balance inventory_balances%rowtype;
  v_new_qty numeric;
  v_new_cost numeric;
  v_subtotal numeric := 0;
  v_movement_no text;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'Minimal satu item pembelian diperlukan';
  end if;

  select * into v_purchase
  from purchases
  where id = p_purchase_id
  for update;

  if not found then raise exception 'Dokumen pembelian tidak ditemukan'; end if;
  if v_purchase.status not in ('draft','posted') then
    raise exception 'Dokumen pembelian sudah diproses atau tidak valid';
  end if;

  delete from purchase_items where purchase_id = p_purchase_id;

  v_location := ensure_default_location(p_business_unit_id);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_cost := coalesce((v_item->>'unit_cost')::numeric,0);

    if v_qty <= 0 then raise exception 'Quantity pembelian harus > 0'; end if;
    if v_cost < 0 then raise exception 'Harga beli tidak boleh negatif'; end if;

    insert into purchase_items(
      purchase_id, product_id, destination_location_id,
      quantity, unit_cost, gross_amount, discount_amount, net_amount
    )
    values(
      p_purchase_id, v_product_id, v_location,
      v_qty, v_cost, v_qty*v_cost, 0, v_qty*v_cost
    );

    select * into v_balance
    from inventory_balances
    where product_id = v_product_id
      and location_id = v_location
    for update;

    if not found then
      v_new_qty := v_qty;
      v_new_cost := v_cost;
      insert into inventory_balances(
        product_id, location_id, quantity_on_hand, average_unit_cost
      )
      values(v_product_id, v_location, v_new_qty, v_new_cost);
    else
      v_new_qty := v_balance.quantity_on_hand + v_qty;
      v_new_cost := case
        when v_new_qty = 0 then 0
        else (
          (v_balance.quantity_on_hand * v_balance.average_unit_cost) +
          (v_qty * v_cost)
        ) / v_new_qty
      end;

      update inventory_balances
      set quantity_on_hand = v_new_qty,
          average_unit_cost = v_new_cost,
          updated_at = now()
      where id = v_balance.id;
    end if;

    v_subtotal := v_subtotal + (v_qty*v_cost);

    v_movement_no := 'MOV-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    insert into inventory_movements(
      movement_no, product_id, business_unit_id,
      destination_location_id, movement_type,
      quantity_in, quantity_out, unit_cost,
      source_document_type, source_document_id
    )
    values(
      v_movement_no, v_product_id, p_business_unit_id,
      v_location, 'purchase',
      v_qty, 0, v_cost,
      'purchase', p_purchase_id
    );
  end loop;

  update purchases
  set subtotal = v_subtotal,
      total_amount = v_subtotal - coalesce(discount_amount,0) + coalesce(shipping_amount,0),
      status = 'received',
      updated_at = now()
  where id = p_purchase_id;

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'subtotal', v_subtotal,
    'item_count', jsonb_array_length(p_items),
    'location_id', v_location
  );
end;
$$;
