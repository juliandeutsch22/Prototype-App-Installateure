-- Unveränderliche Änderungsgeschichte; keine erfundenen Ereignisse für Altbestände.
create table public.zeitbuchungs_aenderungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  -- Ohne Fremdschlüssel: der Nachweis bleibt auch nach Löschen der Buchung bestehen.
  entry_id uuid not null,
  user_id uuid not null,
  user_name text not null,
  datum date not null,
  art text not null check (art in ('angelegt', 'geaendert', 'geloescht')),
  durch uuid,
  durch_name text not null,
  vorher jsonb,
  nachher jsonb,
  aufbewahren_bis date not null,
  created_at timestamptz not null default clock_timestamp()
);
create index zeitjournal_person on public.zeitbuchungs_aenderungen(company_id, user_id, created_at desc, id desc);
create index zeitjournal_betrieb on public.zeitbuchungs_aenderungen(company_id, created_at desc, id desc);
create index zeitjournal_buchung on public.zeitbuchungs_aenderungen(entry_id);
alter table public.zeitbuchungs_aenderungen enable row level security;
create policy zeitjournal_lesen on public.zeitbuchungs_aenderungen for select using (
  app.betriebsmitglied(company_id)
  and (user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
);
revoke all on public.zeitbuchungs_aenderungen from public, anon, authenticated;
grant select on public.zeitbuchungs_aenderungen to authenticated;
grant all on public.zeitbuchungs_aenderungen to service_role;
create trigger zeitjournal_support before insert or update or delete on public.zeitbuchungs_aenderungen
  for each row execute function app.support_niemals();

create or replace function app.zeitjournal_schreiben() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  davor jsonb;
  danach jsonb;
  zeile public.time_entries%rowtype;
  urheber uuid := auth.uid();
  name text;
  person_name text;
  ausschluss text[] := array['id', 'company_id', 'user_id', 'user_name', 'created_at', 'updated_at',
    'last_edited_by', 'last_edited_by_uid', 'angelegt_von'];
begin
  -- Dienstimporte und Rückläufe bewahren die ursprünglichen Ereignisse; sie sind keine Neuanlage durch Menschen.
  if tg_op = 'INSERT' and app.ist_dienst() then return new; end if;
  if tg_op <> 'INSERT' then davor := to_jsonb(old) - ausschluss; end if;
  if tg_op <> 'DELETE' then danach := to_jsonb(new) - ausschluss; end if;
  if tg_op = 'UPDATE' and davor is not distinct from danach then return new; end if;
  zeile := case when tg_op = 'DELETE' then old else new end;
  select u.name into person_name from public.users u where u.id = zeile.user_id and u.company_id = zeile.company_id;
  if app.ist_dienst() then urheber := null; end if;
  if urheber is not null then
    select u.name into name from public.users u where u.id = urheber;
  end if;
  insert into public.zeitbuchungs_aenderungen(company_id, entry_id, user_id, user_name, datum, art,
    durch, durch_name, vorher, nachher, aufbewahren_bis)
  values (zeile.company_id, zeile.id, zeile.user_id, coalesce(person_name, zeile.user_name, 'Unbekannt'),
    zeile.date, case tg_op when 'INSERT' then 'angelegt' when 'DELETE' then 'geloescht' else 'geaendert' end,
    urheber, coalesce(name, 'System'), davor, danach,
    app.aufbewahrt_bis(greatest(zeile.date, (davor->>'date')::date, current_date)));
  return coalesce(new, old);
end;
$$;
revoke all on function app.zeitjournal_schreiben() from public, anon, authenticated;
create trigger time_entries_journal after insert or update or delete on public.time_entries
  for each row execute function app.zeitjournal_schreiben();

create or replace function app.zeitjournal_unveraenderlich() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not app.ist_dienst() then
    raise exception 'Das Änderungsprotokoll bleibt unverändert' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function app.zeitjournal_unveraenderlich() from public, anon, authenticated;
create trigger zeitjournal_unveraenderlich before update or delete on public.zeitbuchungs_aenderungen
  for each row execute function app.zeitjournal_unveraenderlich();
