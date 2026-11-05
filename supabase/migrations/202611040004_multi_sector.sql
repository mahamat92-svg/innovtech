-- Multi-sector workspaces: commerce, education, health, food, transport, agriculture, NGO.
-- Apply after 202611040002_live_saas.sql and 202611040003_credit_repayments.sql.

alter table public.users add column if not exists secteur text not null default 'Commerce';
alter table public.users drop constraint if exists users_secteur_check;
alter table public.users add constraint users_secteur_check
  check (secteur in ('Commerce','École','Clinique','Restaurant','Transport','Agriculture','ONG'));

-- Signup keeps the selected sector on the server-created user profile.
create or replace function public.innovtech_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sector text;
begin
  v_sector := coalesce(new.raw_user_meta_data->>'secteur','Commerce');
  if v_sector not in ('Commerce','École','Clinique','Restaurant','Transport','Agriculture','ONG') then
    v_sector := 'Commerce';
  end if;
  insert into public.users(id,full_name,email,shop_name,country,secteur)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.email,''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'shop_name'),''),'Ma organisation'),
    case when new.raw_user_meta_data->>'country' in ('Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo')
         then new.raw_user_meta_data->>'country' else 'Tchad' end,
    v_sector
  ) on conflict(id) do nothing;
  insert into public.abonnements(user_id,formule,statut,montant_fcfa)
  values(new.id,'Découverte','essai',0) on conflict(user_id) do nothing;
  return new;
end;
$$;

create table if not exists public.activites_sectorielles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  secteur text not null check (secteur in ('École','Clinique','Restaurant','Transport','Agriculture','ONG')),
  module text not null check (length(trim(module)) between 1 and 80),
  titre text not null check (length(trim(titre)) between 1 and 180),
  reference text not null default '',
  contact text not null default '',
  montant_fcfa numeric(14,2) check (montant_fcfa is null or montant_fcfa >= 0),
  statut text not null default 'En cours' check (statut in ('En cours','À traiter','Payé','Terminé','Annulé')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activites_sectorielles_user_date_idx
  on public.activites_sectorielles(user_id,created_at desc);

alter table public.activites_sectorielles enable row level security;
create policy activites_sectorielles_read_owner_admin on public.activites_sectorielles for select to authenticated
  using ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy activites_sectorielles_insert_owner on public.activites_sectorielles for insert to authenticated
  with check (
    user_id=(select auth.uid()) and public.innovtech_is_active_merchant()
    and secteur=(select u.secteur from public.users u where u.id=(select auth.uid()))
  );
create policy activites_sectorielles_update_owner_admin on public.activites_sectorielles for update to authenticated
  using ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin())
  with check ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
create policy activites_sectorielles_delete_owner_admin on public.activites_sectorielles for delete to authenticated
  using ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());

revoke all on public.activites_sectorielles from anon,authenticated;
grant select on public.activites_sectorielles to authenticated;
grant insert(user_id,secteur,module,titre,reference,contact,montant_fcfa,statut,notes) on public.activites_sectorielles to authenticated;
grant update(module,titre,reference,contact,montant_fcfa,statut,notes,updated_at) on public.activites_sectorielles to authenticated;
grant delete on public.activites_sectorielles to authenticated;

grant execute on function public.innovtech_is_active_merchant() to authenticated;
grant execute on function public.innovtech_is_admin() to authenticated;
