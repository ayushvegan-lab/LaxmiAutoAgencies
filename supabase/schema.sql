-- Sales Billing Desk: database for Supabase.
-- Run in the Supabase SQL Editor (Dashboard > SQL Editor > New query > paste everything > Run).
-- Safe to run again: it creates only what is missing and never deletes data.

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  username text not null unique,
  role text not null check (role in ('sales', 'billing', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '',
  unit text not null default 'Nos' check (unit in ('L', 'Nos')),
  per numeric not null default 1 check (per > 0),   -- litres or nos in one quantity
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists public.order_no_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('SO-' || lpad(nextval('public.order_no_seq')::text, 4, '0')),
  order_date date not null,
  order_time text not null default '',
  sp_id uuid not null references public.profiles (id),
  customer_id uuid references public.customers (id),
  customer_name text not null,
  lines jsonb not null default '[]'::jsonb,          -- [{item, itemId, category, unit, per, qty, billedQty, isNew}]
  description text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approval', 'approved', 'part', 'billed', 'rejected')),
  invoice_no text not null default '',
  bill_date date,
  bill_note text not null default '',
  req_note text not null default '',
  req_by uuid,
  req_at timestamptz,
  decision text not null default '',
  decision_note text not null default '',
  decided_at timestamptz,
  reject_note text not null default '',
  rejected_by text not null default '',
  rejected_at timestamptz,
  billed_by uuid,
  billed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  visit_date date not null,
  visit_time text not null default '',
  sp_id uuid not null references public.profiles (id),
  customer_id uuid references public.customers (id),
  customer_name text not null,
  note text not null default '',
  outcome text not null check (outcome in ('order', 'no_order')),
  reason text not null default '',
  reason_other text not null default '',
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists orders_date_idx on public.orders (order_date);
create index if not exists orders_sp_date_idx on public.orders (sp_id, order_date);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists visits_date_idx on public.visits (visit_date);
create index if not exists visits_sp_date_idx on public.visits (sp_id, visit_date);

-- ---------- who is signed in ----------
-- Role of the signed-in user, or null when the login is switched off or unknown.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

-- ---------- order rules the database enforces ----------
create or replace function public.orders_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  r text := public.my_role();
  l jsonb;
begin
  for l in select * from jsonb_array_elements(new.lines) loop
    if coalesce((l ->> 'billedQty')::numeric, 0) < 0
       or coalesce((l ->> 'billedQty')::numeric, 0) > coalesce((l ->> 'qty')::numeric, 0) then
      raise exception 'Billed quantity cannot be more than the ordered quantity.';
    end if;
  end loop;
  if tg_op = 'INSERT' or r is null then
    return new;   -- r is null for server-side maintenance with the secret key
  end if;
  if new.sp_id <> old.sp_id or new.order_no <> old.order_no or new.order_date <> old.order_date then
    raise exception 'The order number, date and salesperson cannot be changed.';
  end if;
  if r = 'billing' then
    if old.status in ('approval', 'rejected') then
      raise exception 'This order is locked until the admin decides.';
    end if;
    if new.status not in ('billed', 'part', 'approval', 'rejected') then
      raise exception 'Billing cannot set this status.';
    end if;
    if new.status = 'approval' and old.status <> 'pending' then
      raise exception 'Only an order that is waiting to be billed can be sent for approval.';
    end if;
    if new.decision is distinct from old.decision or new.decision_note is distinct from old.decision_note then
      raise exception 'Only the admin can approve.';
    end if;
    if (select jsonb_agg(e - 'billedQty') from jsonb_array_elements(new.lines) e)
       is distinct from (select jsonb_agg(e - 'billedQty') from jsonb_array_elements(old.lines) e) then
      raise exception 'Billing can change only the billed quantity.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before insert or update on public.orders
  for each row execute function public.orders_guard();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.stock_items enable row level security;
alter table public.orders enable row level security;
alter table public.visits enable row level security;

-- Users: everyone signed in sees names; only the admin switches logins on or off.
-- Logins are created and renamed by the app's server function with the secret key.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.my_role() is not null);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Customers and stock items: everyone reads, the admin maintains.
drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated
  using (public.my_role() is not null);
drop policy if exists customers_admin_insert on public.customers;
create policy customers_admin_insert on public.customers for insert to authenticated
  with check (public.my_role() = 'admin');
drop policy if exists customers_admin_update on public.customers;
create policy customers_admin_update on public.customers for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists stock_read on public.stock_items;
create policy stock_read on public.stock_items for select to authenticated
  using (public.my_role() is not null);
drop policy if exists stock_admin_insert on public.stock_items;
create policy stock_admin_insert on public.stock_items for insert to authenticated
  with check (public.my_role() = 'admin');
drop policy if exists stock_admin_update on public.stock_items;
create policy stock_admin_update on public.stock_items for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Visits: a salesperson sees and records only their own; admin and billing see all.
drop policy if exists visits_read on public.visits;
create policy visits_read on public.visits for select to authenticated
  using (public.my_role() in ('admin', 'billing') or (public.my_role() = 'sales' and sp_id = auth.uid()));
drop policy if exists visits_sales_insert on public.visits;
create policy visits_sales_insert on public.visits for insert to authenticated
  with check (public.my_role() = 'sales' and sp_id = auth.uid());
drop policy if exists visits_admin_delete on public.visits;
create policy visits_admin_delete on public.visits for delete to authenticated
  using (public.my_role() = 'admin');

-- Orders: a salesperson places and sees only their own; billing and admin see and update all.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
  using (public.my_role() in ('admin', 'billing') or (public.my_role() = 'sales' and sp_id = auth.uid()));
drop policy if exists orders_sales_insert on public.orders;
create policy orders_sales_insert on public.orders for insert to authenticated
  with check (public.my_role() = 'sales' and sp_id = auth.uid() and status = 'pending');
drop policy if exists orders_office_update on public.orders;
create policy orders_office_update on public.orders for update to authenticated
  using (public.my_role() in ('billing', 'admin')) with check (public.my_role() in ('billing', 'admin'));
drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders for delete to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'sales' and sp_id = auth.uid() and status = 'pending'));

-- ---------- privileges ----------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.my_role() to authenticated, service_role;
