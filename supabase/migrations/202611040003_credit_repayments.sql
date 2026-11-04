-- Optional credit-repayment ledger. Apply after 202611040002_live_saas.sql.
create table if not exists public.remboursements_credit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  montant_fcfa numeric(14,2) not null check (montant_fcfa > 0),
  moyen_paiement text not null check (moyen_paiement in ('Espèces','MTN MoMo','Orange Money','Airtel Money')),
  created_at timestamptz not null default now()
);
create index if not exists remboursements_credit_user_date_idx on public.remboursements_credit(user_id,created_at desc);
alter table public.remboursements_credit enable row level security;
create policy remboursements_select_owner_admin on public.remboursements_credit for select to authenticated
  using ((user_id=(select auth.uid()) and public.innovtech_is_active_merchant()) or public.innovtech_is_admin());
revoke all on public.remboursements_credit from anon,authenticated;
grant select on public.remboursements_credit to authenticated;

create or replace function public.innovtech_rembourser_credit(
  p_client_id uuid, p_montant numeric, p_moyen_paiement text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric(14,2);
begin
  if v_user is null or not public.innovtech_is_active_merchant() then
    raise exception 'Connexion commerçant active requise' using errcode='42501';
  end if;
  if p_montant<=0 then raise exception 'Montant invalide'; end if;
  if p_moyen_paiement not in ('Espèces','MTN MoMo','Orange Money','Airtel Money') then raise exception 'Mode de paiement invalide'; end if;
  select credit_fcfa into v_balance from public.clients
    where id=p_client_id and user_id=v_user for update;
  if not found then raise exception 'Client introuvable'; end if;
  if p_montant>v_balance then raise exception 'Le paiement dépasse le solde dû'; end if;
  update public.clients set credit_fcfa=credit_fcfa-p_montant where id=p_client_id and user_id=v_user;
  insert into public.remboursements_credit(user_id,client_id,montant_fcfa,moyen_paiement)
    values(v_user,p_client_id,p_montant,p_moyen_paiement);
  return jsonb_build_object('client_id',p_client_id,'rembourse',p_montant,'reste',v_balance-p_montant);
end;
$$;
revoke execute on function public.innovtech_rembourser_credit(uuid,numeric,text) from public,anon;
grant execute on function public.innovtech_rembourser_credit(uuid,numeric,text) to authenticated;
