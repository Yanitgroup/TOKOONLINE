-- Complements the initial schema with purchase documents, stock locations per store, and reporting views.
create type purchase_status as enum ('draft','posted','received','void');

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null unique,
  purchase_date timestamptz not null default now(),
  business_unit_id uuid not null references business_units(id),
  supplier_id uuid not null references suppliers(id),
  status purchase_status not null default 'draft',
  subtotal numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  shipping_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id),
  destination_location_id uuid not null references stock_locations(id),
  quantity numeric(18,3) not null check(quantity > 0),
  unit_cost numeric(18,2) not null check(unit_cost >= 0),
  gross_amount numeric(18,2) not null,
  discount_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null
);
create index if not exists idx_purchase_date_store on purchases(purchase_date desc,business_unit_id);

create or replace view v_product_stock as
select p.id,p.sku,p.name,p.category_id,p.unit_id,p.default_selling_price,p.reorder_min_qty,p.target_stock_qty,
       coalesce(sum(ib.quantity_on_hand),0)::numeric as stock_qty,
       min(sl.path_code) filter (where ib.quantity_on_hand > 0) as sample_location
from products p left join inventory_balances ib on ib.product_id=p.id
left join stock_locations sl on sl.id=ib.location_id
group by p.id,p.sku,p.name,p.category_id,p.unit_id,p.default_selling_price,p.reorder_min_qty,p.target_stock_qty;

create or replace view v_daily_sales as
select date(transaction_date) as sale_date,
       coalesce(sum(gross_amount),0) as gross_sales,
       coalesce(sum(discount_amount),0) as discounts,
       coalesce(sum(net_sales_amount),0) as net_sales
from sales where status in ('posted','completed')
group by date(transaction_date);

create or replace view v_expenses_summary as
select expense_date, coalesce(sum(amount),0) as total_expense
from expenses where status <> 'void'
group by expense_date;

-- Default storage bins for every store so stock posting always has a valid location.
insert into warehouses (business_unit_id, code, name)
select bu.id, 'WH-' || bu.code, 'Gudang ' || bu.name
from business_units bu
where bu.unit_type='store'
  and not exists (select 1 from warehouses w where w.business_unit_id=bu.id);

insert into stock_locations (warehouse_id, code, name, location_type, path_code)
select w.id, 'B01', 'Bin Utama', 'bin', w.code || '-R01-L01-B01'
from warehouses w
where not exists (select 1 from stock_locations sl where sl.warehouse_id=w.id);

create or replace function ensure_default_location(p_business_unit_id uuid)
returns uuid
language plpgsql
as $$
declare v_location uuid;
begin
  select sl.id into v_location
  from stock_locations sl
  join warehouses w on w.id=sl.warehouse_id
  where w.business_unit_id=p_business_unit_id and sl.is_active
  order by sl.path_code
  limit 1;
  if v_location is null then
    insert into warehouses (business_unit_id,code,name)
    select p_business_unit_id,'WH-'||bu.code,'Gudang '||bu.name
    from business_units bu where bu.id=p_business_unit_id
    returning id into v_location;
    insert into stock_locations (warehouse_id,code,name,location_type,path_code)
    values (v_location,'B01','Bin Utama','bin','WH-'||p_business_unit_id::text||'-R01-L01-B01')
    returning id into v_location;
  end if;
  return v_location;
end;
$$;

create or replace function receive_purchase(
  p_purchase_id uuid,
  p_product_id uuid,
  p_business_unit_id uuid,
  p_quantity numeric,
  p_unit_cost numeric
) returns jsonb
language plpgsql
as $$
declare
  v_location uuid;
  v_balance inventory_balances%rowtype;
  v_new_qty numeric;
  v_new_cost numeric;
  v_no text;
begin
  if p_quantity <= 0 then raise exception 'Quantity pembelian harus > 0'; end if;
  if p_unit_cost < 0 then raise exception 'Harga beli tidak boleh negatif'; end if;
  v_location := ensure_default_location(p_business_unit_id);

  select * into v_balance from inventory_balances
  where product_id=p_product_id and location_id=v_location
  for update;

  if not found then
    v_new_qty := p_quantity;
    v_new_cost := p_unit_cost;
    insert into inventory_balances(product_id,location_id,quantity_on_hand,average_unit_cost)
    values(p_product_id,v_location,v_new_qty,v_new_cost);
  else
    v_new_qty := v_balance.quantity_on_hand + p_quantity;
    v_new_cost := case when v_new_qty=0 then 0 else ((v_balance.quantity_on_hand*v_balance.average_unit_cost)+(p_quantity*p_unit_cost))/v_new_qty end;
    update inventory_balances set quantity_on_hand=v_new_qty,average_unit_cost=v_new_cost,updated_at=now()
    where id=v_balance.id;
  end if;

  v_no := 'MOV-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into inventory_movements(movement_no,product_id,business_unit_id,destination_location_id,movement_type,quantity_in,quantity_out,unit_cost,source_document_type,source_document_id)
  values(v_no,p_product_id,p_business_unit_id,v_location,'purchase',p_quantity,0,p_unit_cost,'purchase',p_purchase_id);

  update purchases set status='received',updated_at=now() where id=p_purchase_id;
  return jsonb_build_object('purchase_id',p_purchase_id,'location_id',v_location,'quantity',p_quantity,'stock_after',v_new_qty,'average_cost',v_new_cost);
end;
$$;

create or replace function post_sale(
  p_sale_id uuid,
  p_product_id uuid,
  p_business_unit_id uuid,
  p_quantity numeric,
  p_unit_selling_price numeric,
  p_discount numeric default 0
) returns jsonb
language plpgsql
as $$
declare
  v_balance inventory_balances%rowtype;
  v_sale sales%rowtype;
  v_location uuid;
  v_cogs numeric;
  v_gross numeric;
  v_net numeric;
  v_no text;
begin
  if p_quantity <= 0 then raise exception 'Quantity penjualan harus > 0'; end if;
  if p_unit_selling_price < 0 then raise exception 'Harga jual tidak boleh negatif'; end if;

  select * into v_sale from sales where id=p_sale_id for update;
  v_gross := p_quantity*p_unit_selling_price;
  v_net := greatest(0,v_gross-coalesce(p_discount,0));

  select ib.*, sl.id as location_id into v_balance, v_location
  from inventory_balances ib join stock_locations sl on sl.id=ib.location_id
  join warehouses w on w.id=sl.warehouse_id
  where ib.product_id=p_product_id and w.business_unit_id=p_business_unit_id and ib.quantity_on_hand >= p_quantity
  order by ib.quantity_on_hand desc
  limit 1
  for update;

  if v_location is null then raise exception 'Stok produk tidak mencukupi untuk store ini'; end if;
  v_cogs := p_quantity*v_balance.average_unit_cost;

  update inventory_balances
  set quantity_on_hand=quantity_on_hand-p_quantity,updated_at=now()
  where id=v_balance.id;

  insert into sale_items(sale_id,product_id,source_location_id,quantity,unit_selling_price,gross_amount,discount_amount,net_amount,unit_cogs,cogs_amount)
  values(p_sale_id,p_product_id,v_location,p_quantity,p_unit_selling_price,v_gross,coalesce(p_discount,0),v_net,v_balance.average_unit_cost,v_cogs);

  update sales
  set gross_amount=v_gross,discount_amount=coalesce(p_discount,0),total_deduction_amount=coalesce(p_discount,0),net_sales_amount=v_net,status='completed',updated_at=now()
  where id=p_sale_id;

  v_no := 'MOV-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into inventory_movements(movement_no,product_id,business_unit_id,source_location_id,movement_type,quantity_in,quantity_out,unit_cost,source_document_type,source_document_id)
  values(v_no,p_product_id,v_business_unit_id,v_location,'sale',0,p_quantity,v_balance.average_unit_cost,'sale',p_sale_id);

  return jsonb_build_object('sale_id',p_sale_id,'quantity',p_quantity,'cogs',v_cogs,'net_sales',v_net,'stock_after',v_balance.quantity_on_hand-p_quantity);
end;
$$;
