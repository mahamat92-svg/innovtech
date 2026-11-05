-- Additive client contacts and invoice snapshots. No commerce rows or tables are removed.
-- Apply after 0002/0003 and after 0005 if the sector update is being installed now.

alter table public.clients add column if not exists phone text not null default '';
alter table public.clients add column if not exists email text not null default '';
alter table public.factures add column if not exists phone text not null default '';
alter table public.factures add column if not exists email text not null default '';

-- Preserve existing contact data and populate the new snapshot columns on old invoices.
update public.clients
set phone=coalesce(nullif(phone,''),telephone,'')
where phone='';

update public.factures f
set phone=coalesce(nullif(f.phone,''),nullif(c.phone,''),c.telephone,''),
    email=coalesce(nullif(f.email,''),c.email,'')
from public.ventes v
left join public.clients c on c.id=v.client_id and c.user_id=v.user_id
where f.vente_id=v.id
  and (f.phone='' or f.email='');

-- Existing clients keep working with the old telephone field; new clients can use phone/email.
grant insert(user_id,nom,telephone,phone,email) on public.clients to authenticated;
grant update(nom,telephone,phone,email) on public.clients to authenticated;

-- Permit merchants to correct only invoice contact snapshots; totals and invoice lines remain server-controlled.
grant update(phone,email) on public.factures to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='factures' and policyname='factures_update_contact_owner') then
    create policy factures_update_contact_owner on public.factures for update to authenticated
      using (user_id=(select auth.uid()) and public.innovtech_is_active_merchant())
      with check (user_id=(select auth.uid()) and public.innovtech_is_active_merchant());
  end if;
end $$;

-- On invoice creation, copy the linked client's contact into the invoice snapshot.
create or replace function public.innovtech_invoice_contact_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.factures f
  set phone=coalesce(nullif(c.phone,''),nullif(c.telephone,''),''),
      email=coalesce(nullif(c.email,''),'')
  from public.ventes v
  left join public.clients c on c.id=v.client_id and c.user_id=v.user_id
  where f.id=new.id and v.id=new.vente_id;
  return new;
end;
$$;
revoke execute on function public.innovtech_invoice_contact_snapshot() from public,anon,authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.factures'::regclass
      and tgname='innovtech_invoice_contact_snapshot'
      and not tgisinternal
  ) then
    create trigger innovtech_invoice_contact_snapshot
      after insert on public.factures
      for each row execute procedure public.innovtech_invoice_contact_snapshot();
  end if;
end $$;

-- Keep invoice contact snapshots in sync if the merchant corrects a client's details.
create or replace function public.innovtech_sync_client_invoice_contacts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is distinct from old.phone or new.email is distinct from old.email or new.telephone is distinct from old.telephone then
    update public.factures f
    set phone=coalesce(nullif(new.phone,''),nullif(new.telephone,''),''),
        email=coalesce(nullif(new.email,''),'')
    from public.ventes v
    where f.vente_id=v.id and v.client_id=new.id and v.user_id=new.user_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.innovtech_sync_client_invoice_contacts() from public,anon,authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.clients'::regclass
      and tgname='innovtech_sync_client_invoice_contacts'
      and not tgisinternal
  ) then
    create trigger innovtech_sync_client_invoice_contacts
      after update of phone,email,telephone on public.clients
      for each row execute procedure public.innovtech_sync_client_invoice_contacts();
  end if;
end $$;
