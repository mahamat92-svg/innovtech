-- Additive multi-sector update for the existing users/produits/ventes schema.
-- Does not drop, truncate, rename, or rewrite existing commerce data.
-- Apply after 202611040002_live_saas.sql and 202611040003_credit_repayments.sql.

alter table public.users
  add column if not exists sector text not null default 'Commerce';

-- If the earlier, not-yet-applied 004 migration was run, carry its sector choice forward.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='secteur'
  ) then
    execute $copy$
      update public.users
      set sector = secteur
      where sector = 'Commerce'
        and secteur in ('École','Clinique','Restaurant','Transport','Agriculture','ONG')
    $copy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.users'::regclass and conname='users_sector_check'
  ) then
    alter table public.users add constraint users_sector_check
      check (sector in ('Commerce','École','Clinique','Restaurant','Transport','Agriculture','ONG'));
  end if;
end $$;

comment on column public.users.sector is
  'Workspace sector for the existing user profile; existing profiles default to Commerce.';

-- Existing auth/profile trigger remains untouched. This extra trigger synchronizes
-- only the new sector field after that trigger has created the user's profile row.
create or replace function public.innovtech_sync_signup_sector()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sector text;
begin
  v_sector := coalesce(nullif(new.raw_user_meta_data->>'sector',''), nullif(new.raw_user_meta_data->>'secteur',''), 'Commerce');
  if v_sector not in ('Commerce','École','Clinique','Restaurant','Transport','Agriculture','ONG') then
    v_sector := 'Commerce';
  end if;
  update public.users set sector=v_sector where id=new.id;
  return new;
end;
$$;
revoke execute on function public.innovtech_sync_signup_sector() from public,anon,authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='auth.users'::regclass
      and tgname='zz_innovtech_sync_sector'
      and not tgisinternal
  ) then
    create trigger zz_innovtech_sync_sector
      after insert on auth.users
      for each row execute procedure public.innovtech_sync_signup_sector();
  end if;
end $$;

-- Dedicated additive registries for non-commerce sectors. Existing products,
-- sales, invoices, clients and credit tables are left intact.
create table if not exists public.dossiers_ecole (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  module text not null default 'Inscriptions élèves',
  titre text not null check (length(trim(titre)) between 1 and 180),
  reference text not null default '',
  contact text not null default '',
  montant_fcfa numeric(14,2) check (montant_fcfa is null or montant_fcfa >= 0),
  statut text not null default 'En cours' check (statut in ('En cours','À traiter','Payé','Terminé','Annulé')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.dossiers_clinique (like public.dossiers_ecole including all);
create table if not exists public.activites_restaurant (like public.dossiers_ecole including all);
create table if not exists public.dossiers_transport (like public.dossiers_ecole including all);
create table if not exists public.dossiers_agriculture (like public.dossiers_ecole including all);
create table if not exists public.dossiers_ong (like public.dossiers_ecole including all);

-- CREATE TABLE LIKE copies the primary key/checks but not foreign keys; add them
-- idempotently in a guarded block for safe retry if a migration was interrupted.
do $$
declare
  t text;
  constraint_name text;
begin
  for t in select unnest(array['dossiers_clinique','activites_restaurant','dossiers_transport','dossiers_agriculture','dossiers_ong']) loop
    constraint_name := t || '_user_fk';
    if not exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid=c.conrelid
      join pg_namespace n on n.oid=r.relnamespace
      where n.nspname='public' and r.relname=t and c.conname=constraint_name
    ) then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references public.users(id) on delete cascade',t,constraint_name);
    end if;
  end loop;
end $$;

create index if not exists dossiers_ecole_user_date_idx on public.dossiers_ecole(user_id,created_at desc);
create index if not exists dossiers_clinique_user_date_idx on public.dossiers_clinique(user_id,created_at desc);
create index if not exists activites_restaurant_user_date_idx on public.activites_restaurant(user_id,created_at desc);
create index if not exists dossiers_transport_user_date_idx on public.dossiers_transport(user_id,created_at desc);
create index if not exists dossiers_agriculture_user_date_idx on public.dossiers_agriculture(user_id,created_at desc);
create index if not exists dossiers_ong_user_date_idx on public.dossiers_ong(user_id,created_at desc);

-- RLS, owner/admin policies and minimal grants for the six new registries.
do $$
declare
  item record;
  policy_name text;
begin
  for item in
    select * from (values
      ('dossiers_ecole','École'),
      ('dossiers_clinique','Clinique'),
      ('activites_restaurant','Restaurant'),
      ('dossiers_transport','Transport'),
      ('dossiers_agriculture','Agriculture'),
      ('dossiers_ong','ONG')
    ) as x(table_name, sector_name)
  loop
    execute format('alter table public.%I enable row level security',item.table_name);
    execute format('revoke all on table public.%I from anon, authenticated',item.table_name);
    execute format('grant select, delete on table public.%I to authenticated',item.table_name);
    execute format('grant insert(user_id,module,titre,reference,contact,montant_fcfa,statut,notes) on table public.%I to authenticated',item.table_name);

    policy_name := item.table_name || '_read_owner_admin';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=item.table_name and policyname=policy_name) then
      execute format('create policy %I on public.%I for select to authenticated using ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin())',policy_name,item.table_name);
    end if;
    policy_name := item.table_name || '_insert_owner';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=item.table_name and policyname=policy_name) then
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id=(select auth.uid()) and public.innovtech_is_active_merchant() and exists (select 1 from public.users u where u.id=(select auth.uid()) and u.sector=%L))',policy_name,item.table_name,item.sector_name);
    end if;
    policy_name := item.table_name || '_delete_owner_admin';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=item.table_name and policyname=policy_name) then
      execute format('create policy %I on public.%I for delete to authenticated using ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin())',policy_name,item.table_name);
    end if;
  end loop;
end $$;

grant execute on function public.innovtech_is_active_merchant() to authenticated;
grant execute on function public.innovtech_is_admin() to authenticated;
