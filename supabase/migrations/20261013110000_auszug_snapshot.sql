-- Nur vorübergehende Arbeitskopien der Sicherung, kein zweiter Geschäftsbestand.
-- STABLE liest alle Tabellen mit dem Snapshot des einen INSERT-Statements.
create table if not exists app.auszug_arbeitsstand (
  lauf uuid not null,
  betrieb text not null references public.companies(id) on delete cascade,
  nr bigint generated always as identity,
  inhalt jsonb not null,
  erstellt timestamptz not null default now(),
  primary key(lauf, nr)
);
revoke all on app.auszug_arbeitsstand from public, anon, authenticated, service_role;
create index if not exists auszug_arbeitsstand_alter on app.auszug_arbeitsstand(erstellt);

create or replace function app.auszug_snapshot_zeilen(p_betrieb text) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare firma jsonb; t text;
begin
  select to_jsonb(c) into firma from public.companies c where id = p_betrieb;
  if firma is null then raise exception 'Der Firmenstammsatz fehlt. Die Sicherung wurde abgebrochen.'; end if;
  return next jsonb_build_object('sammlung', 'companies', 'daten', firma);
  foreach t in array app.auszug_tabellen() loop
    return query execute format(
      'select jsonb_build_object(''sammlung'', $2, ''daten'', to_jsonb(z) - $3) from public.%I z where company_id = $1', t)
      using p_betrieb, t, case when t = 'user_prefs' then array['push_tokens'] else array[]::text[] end;
  end loop;
end; $$;
revoke all on function app.auszug_snapshot_zeilen(text) from public, anon, authenticated;

create or replace function public.auszug_snapshot_start(p_betrieb text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare kennung uuid := gen_random_uuid();
begin
  insert into app.auszug_arbeitsstand(lauf, betrieb, inhalt)
    select kennung, p_betrieb, z from app.auszug_snapshot_zeilen(p_betrieb) z;
  return kennung;
end; $$;
create or replace function public.auszug_snapshot_seite(p_lauf uuid, p_nach bigint default 0)
returns table(nr bigint, inhalt jsonb)
language sql stable security definer set search_path = '' as $$
  select a.nr, a.inhalt from app.auszug_arbeitsstand a
    where lauf = p_lauf and a.nr > p_nach order by a.nr limit 500;
$$;
create or replace function public.auszug_snapshot_ende(p_lauf uuid) returns void
language sql security definer set search_path = '' as $$
  delete from app.auszug_arbeitsstand where lauf = p_lauf;
$$;
revoke all on function public.auszug_snapshot_start(text), public.auszug_snapshot_seite(uuid,bigint), public.auszug_snapshot_ende(uuid) from public, anon, authenticated;
grant execute on function public.auszug_snapshot_start(text), public.auszug_snapshot_seite(uuid,bigint), public.auszug_snapshot_ende(uuid) to service_role;
-- Auch nach abgebrochener Edge Function verschwinden Kopien spätestens am Folgetag.
select cron.schedule('auszug-arbeitsstand-raeumen', '17 * * * *',
  $cron$delete from app.auszug_arbeitsstand where erstellt < now() - interval '24 hours'$cron$);
