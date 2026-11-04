-- INNOVTECH production tables requested by the app. Run AFTER 202611040001 if that migration was already applied.
-- Fresh projects may run this migration directly: it is self-contained for the new table set.
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  shop_name text not null default 'Ma boutique',
  country text not null default 'Tchad' check (country in ('Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo')),
  role text not null default 'merchant' check (role in ('merchant','admin')),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.produits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 180),
  categorie text not null default 'Général',
  prix numeric(14,2) not null check (prix >= 0),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);
create index if not exists produits_user_idx on public.produits(user_id,created_at desc);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 180),
  telephone text,
  credit_fcfa numeric(14,2) not null default 0 check (credit_fcfa >= 0),
  created_at timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients(user_id,nom);

create table if not exists public.ventes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  user_id uuid not null references public.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_nom text not null default 'Client comptant',
  moyen_paiement text not null check (moyen_paiement in ('Espèces','MTN MoMo','Orange Money','Airtel Money','Crédit')),
  total_fcfa numeric(14,2) not null default 0 check (total_fcfa >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ventes_user_date_idx on public.ventes(user_id,created_at desc);

create table if not exists public.vente_lignes (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  produit_id uuid references public.produits(id) on delete set null,
  produit_nom text not null,
  quantite numeric(14,3) not null check (quantite > 0),
  prix_unitaire numeric(14,2) not null check (prix_unitaire >= 0),
  total_ligne numeric(14,2) not null check (total_ligne >= 0)
);

create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  vente_id uuid not null unique references public.ventes(id) on delete cascade,
  numero_facture text not null,
  client_nom text not null,
  total_fcfa numeric(14,2) not null check (total_fcfa >= 0),
  statut text not null check (statut in ('Payée','Crédit')),
  created_at timestamptz not null default now(),
  unique(user_id,numero_facture)
);
create index if not exists factures_user_date_idx on public.factures(user_id,created_at desc);

create table if not exists public.abonnements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  formule text not null default 'Découverte' check (formule in ('Découverte','Boutique','Pro','Entreprise')),
  statut text not null default 'essai' check (statut in ('essai','actif','impayé','annulé')),
  montant_fcfa numeric(14,2) not null default 0 check (montant_fcfa >= 0),
  periode_fin timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.innovtech_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.is_blocked=false);
$$;

create or replace function public.innovtech_is_active_merchant()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_blocked=false);
$$;

create or replace function public.innovtech_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := new.id;
begin
  insert into public.users(id,full_name,email,shop_name,country)
  values (
    v_user_id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.email,''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'shop_name'),''),'Ma boutique'),
    case when new.raw_user_meta_data->>'country' in ('Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo')
         then new.raw_user_meta_data->>'country' else 'Tchad' end
  ) on conflict(id) do nothing;
  insert into public.abonnements(user_id,formule,statut,montant_fcfa)
  values(v_user_id,'Découverte','essai',0) on conflict(user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists innovtech_auth_user_created on auth.users;
create trigger innovtech_auth_user_created after insert on auth.users
for each row execute procedure public.innovtech_new_user();

-- One transaction creates a sale, decrements stock, adds debt if applicable, and creates an invoice.
create or replace function public.innovtech_create_vente(
  p_client_id uuid,
  p_moyen_paiement text,
  p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sale_id uuid;
  v_sale_num bigint;
  v_total numeric(14,2) := 0;
  v_item jsonb;
  v_product public.produits%rowtype;
  v_qty numeric(14,3);
  v_line numeric(14,2);
  v_client_nom text := 'Client comptant';
  v_invoice text;
begin
  if v_user is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  if exists(select 1 from public.users where id=v_user and is_blocked=true) then
    raise exception 'Compte bloqué' using errcode='42501';
  end if;
  if p_moyen_paiement not in ('Espèces','MTN MoMo','Orange Money','Airtel Money','Crédit') then raise exception 'Mode de paiement invalide'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'La vente doit contenir un produit'; end if;
  if p_moyen_paiement='Crédit' and p_client_id is null then raise exception 'Un client est requis pour une vente à crédit'; end if;
  if p_client_id is not null then
    select nom into v_client_nom from public.clients where id=p_client_id and user_id=v_user for update;
    if not found then raise exception 'Client introuvable'; end if;
  end if;
  insert into public.ventes(user_id,client_id,client_nom,moyen_paiement,total_fcfa)
    values(v_user,p_client_id,v_client_nom,p_moyen_paiement,0) returning id,numero into v_sale_id,v_sale_num;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantite')::numeric;
    if v_qty<=0 then raise exception 'Quantité invalide'; end if;
    select * into v_product from public.produits
      where id=(v_item->>'produit_id')::uuid and user_id=v_user for update;
    if not found then raise exception 'Produit introuvable'; end if;
    if v_product.stock<v_qty then raise exception 'Stock insuffisant : %',v_product.nom; end if;
    v_line := round(v_product.prix*v_qty,2);
    update public.produits set stock=stock-v_qty where id=v_product.id;
    insert into public.vente_lignes(vente_id,user_id,produit_id,produit_nom,quantite,prix_unitaire,total_ligne)
      values(v_sale_id,v_user,v_product.id,v_product.nom,v_qty,v_product.prix,v_line);
    v_total := v_total+v_line;
  end loop;
  update public.ventes set total_fcfa=v_total where id=v_sale_id;
  if p_moyen_paiement='Crédit' then
    update public.clients set credit_fcfa=credit_fcfa+v_total where id=p_client_id and user_id=v_user;
  end if;
  v_invoice := 'IT-'||to_char(now(),'YYYYMMDD')||'-'||v_sale_num;
  insert into public.factures(user_id,vente_id,numero_facture,client_nom,total_fcfa,statut)
    values(v_user,v_sale_id,v_invoice,v_client_nom,v_total,case when p_moyen_paiement='Crédit' then 'Crédit' else 'Payée' end);
  return jsonb_build_object('vente_id',v_sale_id,'numero',v_sale_num,'facture',v_invoice,'total_fcfa',v_total);
end;
$$;

create or replace function public.innovtech_admin_set_block(p_user_id uuid,p_blocked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.innovtech_is_admin() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  update public.users set is_blocked=p_blocked where id=p_user_id and role='merchant';
end;
$$;

alter table public.users enable row level security;
alter table public.produits enable row level security;
alter table public.clients enable row level security;
alter table public.ventes enable row level security;
alter table public.vente_lignes enable row level security;
alter table public.factures enable row level security;
alter table public.abonnements enable row level security;

-- Public profile table: a merchant reads their own row; admin can list all merchants.
create policy users_read_self_admin on public.users for select to authenticated
  using(id=(select auth.uid()) or public.innovtech_is_admin());
create policy users_update_self on public.users for update to authenticated
  using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy users_admin_update on public.users for update to authenticated
  using(public.innovtech_is_admin()) with check(public.innovtech_is_admin());

create policy produits_select_owner_admin on public.produits for select to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy produits_insert_owner on public.produits for insert to authenticated
  with check(user_id=(select auth.uid()) and public.innovtech_is_active_merchant());
create policy produits_update_owner_admin on public.produits for update to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin())
  with check((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy produits_delete_owner_admin on public.produits for delete to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());

create policy clients_select_owner_admin on public.clients for select to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy clients_insert_owner on public.clients for insert to authenticated
  with check(user_id=(select auth.uid()) and public.innovtech_is_active_merchant());
create policy clients_update_owner_admin on public.clients for update to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin())
  with check((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy clients_delete_owner_admin on public.clients for delete to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());

create policy ventes_select_owner_admin on public.ventes for select to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy vente_lignes_select_owner_admin on public.vente_lignes for select to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy factures_select_owner_admin on public.factures for select to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy abonnements_select_owner_admin on public.abonnements for select to authenticated
  using((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());

-- Disallow client-side inserts/updates that could forge sales, invoices, roles, or billing.
revoke all on public.users,public.produits,public.clients,public.ventes,public.vente_lignes,public.factures,public.abonnements from anon,authenticated;
grant select on public.users,public.produits,public.clients,public.ventes,public.vente_lignes,public.factures,public.abonnements to authenticated;
grant insert(user_id,nom,categorie,prix,stock) on public.produits to authenticated;
grant update(nom,categorie,prix,stock) on public.produits to authenticated;
grant delete on public.produits to authenticated;
grant insert(user_id,nom,telephone) on public.clients to authenticated;
grant update(nom,telephone) on public.clients to authenticated;
grant delete on public.clients to authenticated;
grant update(full_name,shop_name,country) on public.users to authenticated;
revoke execute on function public.innovtech_create_vente(uuid,text,jsonb) from public,anon;
grant execute on function public.innovtech_create_vente(uuid,text,jsonb) to authenticated;
revoke execute on function public.innovtech_admin_set_block(uuid,boolean) from public,anon;
grant execute on function public.innovtech_admin_set_block(uuid,boolean) to authenticated;
grant execute on function public.innovtech_is_admin() to authenticated;
grant execute on function public.innovtech_is_active_merchant() to authenticated;

-- After creating your own account, promote it once from Supabase SQL Editor:
-- update public.users set role='admin' where id='YOUR_AUTH_USER_UUID';
