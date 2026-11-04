-- INNOVTECH core schema for Supabase (PostgreSQL + Supabase Auth).
-- Run once in Supabase SQL Editor for a NEW project. Never expose service_role keys in a browser.

create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 140),
  country text not null check (country in ('Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  plan text not null default 'Découverte' check (plan in ('Découverte','Boutique','Pro','Entreprise')),
  account_status text not null default 'active' check (account_status in ('active','blocked','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner','manager','cashier')),
  created_at timestamptz not null default now(),
  primary key (shop_id,user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 180),
  category text not null default 'Général',
  sku text,
  emoji text not null default '📦',
  price numeric(14,2) not null check (price >= 0),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  low_stock_threshold numeric(14,3) not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id,sku)
);
create index products_shop_idx on public.products(shop_id, is_active);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 180),
  phone text,
  credit_balance numeric(14,2) not null default 0 check (credit_balance >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_shop_idx on public.customers(shop_id, name);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number bigint generated always as identity unique,
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sold_by uuid not null references auth.users(id),
  payment_method text not null check (payment_method in ('cash','mtn_momo','orange_money','airtel_money','credit')),
  currency char(3) not null default 'XAF' check (currency in ('XAF','XOF')),
  status text not null default 'completed' check (status in ('completed','cancelled','refunded')),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);
create index sales_shop_date_idx on public.sales(shop_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index sale_items_sale_idx on public.sale_items(sale_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid not null unique references public.sales(id) on delete cascade,
  invoice_number text not null,
  customer_name text not null,
  total numeric(14,2) not null check (total >= 0),
  currency char(3) not null default 'XAF' check (currency in ('XAF','XOF')),
  status text not null check (status in ('paid','credit','cancelled')),
  created_at timestamptz not null default now(),
  unique (shop_id,invoice_number)
);
create index invoices_shop_date_idx on public.invoices(shop_id, created_at desc);

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  received_by uuid not null references auth.users(id),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','mtn_momo','orange_money','airtel_money')),
  currency char(3) not null check (currency in ('XAF','XOF')),
  created_at timestamptz not null default now()
);
create index credit_payments_shop_date_idx on public.credit_payments(shop_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id) on delete cascade,
  plan text not null default 'Découverte' check (plan in ('Découverte','Boutique','Pro','Entreprise')),
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);

-- Ledger only records confirmed subscription receipts. Insert through a trusted server/webhook.
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null check (currency in ('XAF','XOF')),
  status text not null check (status in ('pending','succeeded','failed','refunded')),
  provider text not null,
  provider_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider,provider_reference)
);
create index subscription_payments_date_idx on public.subscription_payments(created_at desc);

-- Access helpers are SECURITY DEFINER so row policies can check membership without recursion.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.is_platform_admin = true);
$$;

create or replace function public.can_access_shop(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.shop_members sm
    join public.shops s on s.id = sm.shop_id
    where sm.shop_id = p_shop_id and sm.user_id = (select auth.uid()) and s.account_status = 'active'
  );
$$;

create or replace function public.can_manage_shop(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.shop_members sm
    join public.shops s on s.id = sm.shop_id
    where sm.shop_id = p_shop_id and sm.user_id = (select auth.uid())
      and sm.member_role in ('owner','manager') and s.account_status = 'active'
  );
$$;

-- New user profile and (if supplied) first shop are created only by the trusted Auth trigger.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_shop_id uuid;
  v_name text;
  v_country text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  insert into public.profiles(user_id, full_name) values (new.id, v_name)
  on conflict (user_id) do nothing;

  if nullif(trim(new.raw_user_meta_data ->> 'shop_name'), '') is not null then
    v_country := new.raw_user_meta_data ->> 'country';
    if v_country not in ('Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo') then
      raise exception 'Pays non pris en charge';
    end if;
    insert into public.shops(name,country,owner_id)
      values (trim(new.raw_user_meta_data ->> 'shop_name'),v_country,new.id)
      returning id into v_shop_id;
    insert into public.shop_members(shop_id,user_id,member_role) values (v_shop_id,new.id,'owner');
    insert into public.subscriptions(shop_id,plan,status) values (v_shop_id,'Découverte','trial');
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trusted, atomic sale transaction: server checks membership, product ownership, stock and prices.
create or replace function public.create_sale(
  p_shop_id uuid,
  p_customer_id uuid,
  p_payment_method text,
  p_currency text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sale_id uuid;
  v_country text;
  v_sale_number bigint;
  v_total numeric(14,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric(14,3);
  v_line numeric(14,2);
  v_customer_name text := 'Client comptant';
  v_status text;
  v_invoice_id uuid;
begin
  if auth.uid() is null or not public.can_access_shop(p_shop_id) then
    raise exception 'Accès refusé à cette boutique' using errcode = '42501';
  end if;
  if p_payment_method not in ('cash','mtn_momo','orange_money','airtel_money','credit') then
    raise exception 'Mode de paiement invalide';
  end if;
  select country into v_country from public.shops where id=p_shop_id;
  if (v_country in ('Tchad','Cameroun','Gabon','Congo') and p_currency <> 'XAF')
     or (v_country in ('Togo','Bénin','Sénégal','Niger','Mali') and p_currency <> 'XOF') then
    raise exception 'Devise non conforme au pays de la boutique';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La vente doit contenir au moins un article';
  end if;
  if p_payment_method = 'credit' and p_customer_id is null then
    raise exception 'Un client est requis pour une vente à crédit';
  end if;
  if p_customer_id is not null then
    select c.name into v_customer_name from public.customers c
      where c.id=p_customer_id and c.shop_id=p_shop_id for update;
    if not found then raise exception 'Client introuvable dans cette boutique'; end if;
  end if;

  insert into public.sales(shop_id,customer_id,sold_by,payment_method,currency,total)
    values (p_shop_id,p_customer_id,auth.uid(),p_payment_method,p_currency,0)
    returning id,sale_number into v_sale_id,v_sale_number;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantité invalide'; end if;
    select * into v_product from public.products p
      where p.id=(v_item ->> 'product_id')::uuid and p.shop_id=p_shop_id and p.is_active=true
      for update;
    if not found then raise exception 'Produit introuvable'; end if;
    if v_product.stock < v_qty then raise exception 'Stock insuffisant pour %',v_product.name; end if;
    v_line := round(v_product.price * v_qty,2);
    update public.products set stock=stock-v_qty,updated_at=now() where id=v_product.id;
    insert into public.sale_items(sale_id,shop_id,product_id,product_name,quantity,unit_price,line_total)
      values (v_sale_id,p_shop_id,v_product.id,v_product.name,v_qty,v_product.price,v_line);
    v_total := v_total+v_line;
  end loop;

  update public.sales set total=v_total where id=v_sale_id;
  if p_payment_method='credit' then
    update public.customers set credit_balance=credit_balance+v_total,updated_at=now() where id=p_customer_id;
  end if;
  v_status := case when p_payment_method='credit' then 'credit' else 'paid' end;
  insert into public.invoices(shop_id,sale_id,invoice_number,customer_name,total,currency,status)
    values (p_shop_id,v_sale_id,'IT-'||to_char(now(),'YYYYMMDD')||'-'||v_sale_number,v_customer_name,v_total,p_currency,v_status)
    returning id into v_invoice_id;

  return jsonb_build_object('sale_id',v_sale_id,'sale_number',v_sale_number,'invoice_id',v_invoice_id,'total',v_total,'currency',p_currency);
end;
$$;

-- Atomic credit repayment. A customer cannot pay more than the outstanding balance.
create or replace function public.record_credit_payment(
  p_shop_id uuid, p_customer_id uuid, p_amount numeric,
  p_payment_method text, p_currency text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_balance numeric(14,2);
  v_country text;
begin
  if auth.uid() is null or not public.can_access_shop(p_shop_id) then
    raise exception 'Accès refusé à cette boutique' using errcode = '42501';
  end if;
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;
  if p_payment_method not in ('cash','mtn_momo','orange_money','airtel_money') then raise exception 'Mode de paiement invalide'; end if;
  select country into v_country from public.shops where id=p_shop_id;
  if (v_country in ('Tchad','Cameroun','Gabon','Congo') and p_currency <> 'XAF')
     or (v_country in ('Togo','Bénin','Sénégal','Niger','Mali') and p_currency <> 'XOF') then
    raise exception 'Devise non conforme au pays de la boutique';
  end if;
  select credit_balance into v_balance from public.customers
    where id=p_customer_id and shop_id=p_shop_id for update;
  if not found then raise exception 'Client introuvable'; end if;
  if p_amount > v_balance then raise exception 'Le montant dépasse le solde dû'; end if;
  update public.customers set credit_balance=credit_balance-p_amount,updated_at=now()
    where id=p_customer_id and shop_id=p_shop_id;
  insert into public.credit_payments(shop_id,customer_id,received_by,amount,payment_method,currency)
    values (p_shop_id,p_customer_id,auth.uid(),p_amount,p_payment_method,p_currency);
  return jsonb_build_object('customer_id',p_customer_id,'paid',p_amount,'remaining',v_balance-p_amount);
end;
$$;

-- Owner-safe admin operations. The public app must call these RPCs rather than write billing/admin fields.
create or replace function public.admin_set_shop(
  p_shop_id uuid, p_account_status text, p_plan text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Réservé à l’administrateur' using errcode = '42501';
  end if;
  if p_account_status not in ('active','blocked','pending') or p_plan not in ('Découverte','Boutique','Pro','Entreprise') then
    raise exception 'Statut ou formule invalide';
  end if;
  update public.shops set account_status=p_account_status,plan=p_plan,updated_at=now() where id=p_shop_id;
  if not found then raise exception 'Boutique introuvable'; end if;
  update public.subscriptions set plan=p_plan,updated_at=now() where shop_id=p_shop_id;
end;
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Réservé à l’administrateur' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'merchant_count',(select count(*) from public.shops),
    'active_count',(select count(*) from public.shops where account_status='active'),
    'blocked_count',(select count(*) from public.shops where account_status='blocked'),
    'paid_subscriptions',(select count(*) from public.subscriptions where status='active'),
    'past_due_subscriptions',(select count(*) from public.subscriptions where status='past_due'),
    'revenue_month',coalesce((select sum(amount) from public.subscription_payments
      where status='succeeded' and paid_at >= date_trunc('month',now())
      and paid_at < date_trunc('month',now()) + interval '1 month'),0),
    'by_country',(select coalesce(jsonb_object_agg(country,cnt),'{}'::jsonb) from
      (select country,count(*) as cnt from public.shops group by country) c)
  ) into v_result;
  return v_result;
end;
$$;

-- Enable RLS everywhere; deny direct financial mutations and use the atomic RPC above.
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.invoices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_payments enable row level security;
alter table public.subscription_payments enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (user_id=(select auth.uid()) or public.is_platform_admin());
-- Authenticated users may edit their name only; admin flag and user_id are not client-writable.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;
create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create policy shops_read_member_or_admin on public.shops for select to authenticated
  using (public.can_access_shop(id));
create policy shops_update_managers on public.shops for update to authenticated
  using (public.can_manage_shop(id)) with check (public.can_manage_shop(id));

create policy members_read_self_shop_or_admin on public.shop_members for select to authenticated
  using (user_id=(select auth.uid()) or public.can_access_shop(shop_id));

create policy products_read_shop on public.products for select to authenticated
  using (public.can_access_shop(shop_id));
create policy products_insert_managers on public.products for insert to authenticated
  with check (public.can_manage_shop(shop_id));
create policy products_update_managers on public.products for update to authenticated
  using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));
create policy products_delete_managers on public.products for delete to authenticated
  using (public.can_manage_shop(shop_id));

create policy customers_read_shop on public.customers for select to authenticated
  using (public.can_access_shop(shop_id));
create policy customers_insert_managers on public.customers for insert to authenticated
  with check (public.can_manage_shop(shop_id));
create policy customers_update_managers on public.customers for update to authenticated
  using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));
create policy customers_delete_managers on public.customers for delete to authenticated
  using (public.can_manage_shop(shop_id));

create policy sales_read_shop on public.sales for select to authenticated
  using (public.can_access_shop(shop_id));
create policy sale_items_read_shop on public.sale_items for select to authenticated
  using (public.can_access_shop(shop_id));
create policy invoices_read_shop on public.invoices for select to authenticated
  using (public.can_access_shop(shop_id));

create policy credit_payments_read_shop on public.credit_payments for select to authenticated
  using (public.can_access_shop(shop_id));

create policy subscriptions_read_owner_or_admin on public.subscriptions for select to authenticated
  using (public.is_platform_admin() or exists (
    select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
  ));
create policy subscription_payments_admin_read on public.subscription_payments for select to authenticated
  using (public.is_platform_admin());

-- Remove default client writes; allow only the intended RPC for sales and invoices.
revoke insert, update, delete on public.sales, public.sale_items, public.invoices from anon, authenticated;
revoke insert, update, delete on public.shop_members, public.subscriptions, public.subscription_payments, public.credit_payments from anon, authenticated;
revoke execute on function public.create_sale(uuid,uuid,text,text,jsonb) from public, anon;
revoke execute on function public.record_credit_payment(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.create_sale(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.record_credit_payment(uuid,uuid,numeric,text,text) to authenticated;
revoke execute on function public.admin_set_shop(uuid,text,text) from public, anon;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_set_shop(uuid,text,text) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.can_access_shop(uuid) to authenticated;
grant execute on function public.can_manage_shop(uuid) to authenticated;

-- Promote the first platform administrator manually from the SQL editor (never from the public signup form):
-- update public.profiles set is_platform_admin=true where user_id='AUTH_USER_UUID';

-- Explicit client privileges; RLS policies above are the row-level security boundary.
grant select on public.shops, public.shop_members, public.products, public.customers,
  public.sales, public.sale_items, public.invoices, public.subscriptions,
  public.credit_payments, public.subscription_payments to authenticated;
grant insert, delete on public.products to authenticated;
grant update(name,category,sku,emoji,price,stock,low_stock_threshold,is_active) on public.products to authenticated;
grant insert(shop_id,name,category,sku,emoji,price,stock,low_stock_threshold) on public.products to authenticated;
grant insert(shop_id,name,phone,notes) on public.customers to authenticated;
grant update(name,phone,notes) on public.customers to authenticated;
grant delete on public.customers to authenticated;
grant update(name) on public.shops to authenticated;
