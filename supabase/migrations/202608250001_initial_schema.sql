-- Yanit Group Management System: foundational PostgreSQL schema
create extension if not exists "pgcrypto";

create type business_unit_type as enum ('group', 'store');
create type document_status as enum ('draft', 'posted', 'received', 'completed', 'void');
create type product_type as enum ('stock', 'non_stock', 'service');
create type inventory_movement_type as enum ('purchase', 'sale', 'customer_return', 'supplier_return', 'adjustment_in', 'adjustment_out', 'damage', 'lost', 'transfer_out', 'transfer_in', 'void_reversal');

create table business_units (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  unit_type business_unit_type not null, parent_id uuid references business_units(id),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table product_categories (id uuid primary key default gen_random_uuid(), name text not null, parent_id uuid references product_categories(id), is_active boolean not null default true);
create table units (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, is_active boolean not null default true);
create table products (
  id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null,
  category_id uuid references product_categories(id), unit_id uuid references units(id), product_type product_type not null default 'stock',
  default_selling_price numeric(18,2) not null default 0 check(default_selling_price >= 0),
  reorder_min_qty numeric(18,3) not null default 0, target_stock_qty numeric(18,3) not null default 0,
  barcode text unique, image_url text, notes text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table sales_channels (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, channel_type text not null check(channel_type in ('online','offline')), is_active boolean not null default true);
create table payment_methods (id uuid primary key default gen_random_uuid(), name text not null unique, is_active boolean not null default true);
create table suppliers (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, contact_person text, phone text, email text, address text, bank_info text, payment_terms text, notes text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table warehouses (id uuid primary key default gen_random_uuid(), business_unit_id uuid not null references business_units(id), code text not null, name text not null, is_active boolean not null default true, unique(business_unit_id, code));
create table stock_locations (id uuid primary key default gen_random_uuid(), warehouse_id uuid not null references warehouses(id), parent_id uuid references stock_locations(id), code text not null, name text not null, location_type text not null check(location_type in ('area','rack','level','bin')), path_code text not null, is_active boolean not null default true, unique(warehouse_id,path_code));
create table inventory_balances (id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id), location_id uuid not null references stock_locations(id), quantity_on_hand numeric(18,3) not null default 0 check(quantity_on_hand >= 0), average_unit_cost numeric(18,2) not null default 0 check(average_unit_cost >= 0), updated_at timestamptz not null default now(), unique(product_id, location_id));
create table sales (
  id uuid primary key default gen_random_uuid(), transaction_no text not null unique, transaction_date timestamptz not null default now(), business_unit_id uuid not null references business_units(id), channel_id uuid not null references sales_channels(id), payment_method_id uuid references payment_methods(id), customer_name text, status document_status not null default 'draft',
  gross_amount numeric(18,2) not null default 0, discount_amount numeric(18,2) not null default 0, voucher_amount numeric(18,2) not null default 0, platform_fee_amount numeric(18,2) not null default 0, affiliate_fee_amount numeric(18,2) not null default 0, payment_fee_amount numeric(18,2) not null default 0, service_fee_amount numeric(18,2) not null default 0, other_deduction_amount numeric(18,2) not null default 0, total_deduction_amount numeric(18,2) not null default 0, net_sales_amount numeric(18,2) not null default 0, notes text, void_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table sale_items (id uuid primary key default gen_random_uuid(), sale_id uuid not null references sales(id), product_id uuid not null references products(id), source_location_id uuid not null references stock_locations(id), quantity numeric(18,3) not null check(quantity > 0), unit_selling_price numeric(18,2) not null check(unit_selling_price >= 0), gross_amount numeric(18,2) not null, discount_amount numeric(18,2) not null default 0, net_amount numeric(18,2) not null, unit_cogs numeric(18,2) not null default 0, cogs_amount numeric(18,2) not null default 0);
create table inventory_movements (id uuid primary key default gen_random_uuid(), movement_no text not null unique, occurred_at timestamptz not null default now(), product_id uuid not null references products(id), business_unit_id uuid not null references business_units(id), source_location_id uuid references stock_locations(id), destination_location_id uuid references stock_locations(id), movement_type inventory_movement_type not null, quantity_in numeric(18,3) not null default 0 check(quantity_in >= 0), quantity_out numeric(18,3) not null default 0 check(quantity_out >= 0), unit_cost numeric(18,2) not null default 0, source_document_type text not null, source_document_id uuid not null, reason text, created_at timestamptz not null default now(), check((quantity_in = 0) <> (quantity_out = 0)));
create index idx_inventory_movements_product_date on inventory_movements(product_id, occurred_at desc);
create index idx_sales_date_store on sales(transaction_date desc, business_unit_id);
create table expense_categories (id uuid primary key default gen_random_uuid(), parent_id uuid references expense_categories(id), name text not null, is_active boolean not null default true);
create table expenses (id uuid primary key default gen_random_uuid(), expense_no text not null unique, expense_date date not null, owner_business_unit_id uuid not null references business_units(id), expense_category_id uuid not null references expense_categories(id), payment_method_id uuid references payment_methods(id), description text not null, amount numeric(18,2) not null check(amount > 0), attachment_url text, notes text, status document_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table audit_logs (id uuid primary key default gen_random_uuid(), actor_user_id uuid, action text not null, entity_type text not null, entity_id uuid not null, before_data jsonb, after_data jsonb, occurred_at timestamptz not null default now());
