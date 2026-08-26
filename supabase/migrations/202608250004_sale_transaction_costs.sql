-- Phase 1.1: Biaya transaksi penjualan
-- Biaya dicatat di transaksi penjualan, tetapi TIDAK otomatis mengurangi total yang dibayar customer.
-- Ini agar omzet/revenue tetap terpisah dari biaya operasional penjualan.

create table if not exists sale_costs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  cost_type text not null check (
    cost_type in (
      'shipping',
      'admin',
      'packing',
      'payment_fee',
      'platform_fee',
      'affiliate',
      'other'
    )
  ),
  description text not null,
  amount numeric(18,2) not null check(amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_costs_sale
  on sale_costs(sale_id);

-- Wrapper RPC. Memakai post_sale_multi() yang sudah ada untuk posting stok,
-- lalu mencatat biaya transaksi.
create or replace function post_sale_multi_with_costs(
  p_sale_id uuid,
  p_business_unit_id uuid,
  p_items jsonb,
  p_discount numeric default 0,
  p_costs jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
  v_cost jsonb;
  v_total_cost numeric := 0;
begin
  v_result := post_sale_multi(
    p_sale_id,
    p_business_unit_id,
    p_items,
    coalesce(p_discount, 0)
  );

  delete from sale_costs
  where sale_id = p_sale_id;

  for v_cost in
    select * from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb))
  loop
    if coalesce((v_cost->>'amount')::numeric, 0) < 0 then
      raise exception 'Biaya transaksi tidak boleh negatif';
    end if;

    if coalesce(trim(v_cost->>'description'), '') = '' then
      raise exception 'Deskripsi biaya transaksi wajib diisi';
    end if;

    if coalesce((v_cost->>'amount')::numeric, 0) > 0 then
      insert into sale_costs(
        sale_id,
        cost_type,
        description,
        amount
      )
      values (
        p_sale_id,
        coalesce(v_cost->>'cost_type', 'other'),
        trim(v_cost->>'description'),
        (v_cost->>'amount')::numeric
      );

      v_total_cost := v_total_cost + (v_cost->>'amount')::numeric;
    end if;
  end loop;

  return v_result ||
    jsonb_build_object(
      'transaction_cost_total',
      v_total_cost
    );
end;
$$;
