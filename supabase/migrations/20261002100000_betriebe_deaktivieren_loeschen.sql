-- ===========================================================================
-- BETRIEBE DEAKTIVIEREN UND LÖSCHEN (Nachtest 01.10.2026, Paket D)
-- ===========================================================================
--
-- Der globale Administrator konnte bisher einen Betrieb anlegen und mit
-- Freigabe hineinsehen — aber weder sperren noch entfernen. Nicht einmal die
-- Testbetriebe liessen sich aufräumen.
--
-- ZWEI GETRENNTE STUFEN.
--
--   DEAKTIVIEREN (rückgängig jederzeit, mit Pflichtgrund und Protokoll):
--     - `app.aktiv()` ist für jedes Konto des Betriebs falsch — damit greift
--       keine einzige Richtlinie mehr, auch nicht für ein noch laufendes
--       Token. Ein Supportzugang greift ebenso wenig.
--     - Jedes Anmeldekonto wird gesperrt, offene Sitzungen enden.
--     - Push und der Nachtlauf ruhen für diesen Betrieb.
--     - Die Daten bleiben unverändert.
--
--   LÖSCHEN (nie sofort, nie mit einem Klick):
--     1. nur aus „deaktiviert“;
--     2. vorher ein vollständiger Export (bei einem Testbetrieb entbehrlich),
--        das Datum steht im Protokoll;
--     3. mit Frist geplant (vorgeschlagen 30 Tage, mindestens 7; ein
--        Testbetrieb ab sofort), abbrechbar;
--     4. ausgeführt erst nach der Frist, mit eingetippter Kennung und Grund;
--     5. weg sind Datenbankzeilen, Dateien, Anmeldekonten, Push-Geräte und
--        die Einträge im Fehlerprotokoll;
--     6. das Löschprotokoll bleibt — ohne Inhaltsdaten;
--     7. die Kennung wird nie wieder vergeben.
--
-- Die Sicherung ausser Haus löscht das hier bewusst nicht: ihr Schlüssel darf
-- nur anlegen. Dort braucht der Speicher eine Ablaufregel (siehe
-- docs/DEPLOYMENT.md, Abschnitt „Einen Betrieb deaktivieren oder löschen“).
--
-- WARUM ZWEI EIGENE TABELLEN statt Spalten an `companies`: deren Zeile
-- verschwindet beim Löschen, das Protokoll darf es nicht. Und an
-- `companies` schreibt ein Plattformkonto nie (`support_schreibt_betrieb_nicht`).
-- Beide stehen wie `betriebsanlagen` ausserhalb: kein `company_id`,
-- Zeilenschutz an, keine Richtlinie — gelesen und geschrieben wird nur über
-- die Funktionen unten.

-- ---------------------------------------------------------------------------
-- 1. Zustand und Protokoll
-- ---------------------------------------------------------------------------

create table if not exists public.betrieb_zustand (
  betrieb_kennung        text primary key,
  name                   text not null,
  testbetrieb            boolean not null default false,
  deaktiviert_am         timestamptz,
  deaktiviert_grund      text,
  deaktiviert_von        uuid,
  export_am              timestamptz,
  loeschung_geplant_fuer timestamptz,
  loeschung_grund        text,
  geloescht_am           timestamptz,
  geloescht_von          uuid,
  -- Geplant wird nur, was deaktiviert ist; gelöscht nur, was geplant war.
  constraint betrieb_zustand_plan_nur_deaktiviert
    check (loeschung_geplant_fuer is null or deaktiviert_am is not null),
  constraint betrieb_zustand_geloescht_nur_geplant
    check (geloescht_am is null or loeschung_geplant_fuer is not null)
);

comment on table public.betrieb_zustand is
  'Lebenslauf eines Betriebs für die Plattform: Testbetrieb, deaktiviert, Export, geplante und vollzogene Löschung. Überdauert die Löschung als Sperre der Kennung.';

alter table public.betrieb_zustand enable row level security;
revoke all on public.betrieb_zustand from anon, authenticated;
-- Der Nachtlauf liest mit dem Dienstschlüssel, welche Betriebe ruhen.
grant select on public.betrieb_zustand to service_role;

create table if not exists public.betrieb_protokoll (
  id              bigint generated always as identity primary key,
  betrieb_kennung text not null,
  aktion          text not null check (aktion in (
                    'deaktiviert', 'aktiviert', 'testbetrieb', 'export',
                    'loeschung_geplant', 'loeschung_abgebrochen', 'geloescht')),
  grund           text,
  von             uuid,
  am              timestamptz not null default now(),
  -- Nur Zahlen und Fristen, nie Inhalte des Betriebs.
  angaben         jsonb not null default '{}'::jsonb
);

create index if not exists betrieb_protokoll_betrieb on public.betrieb_protokoll (betrieb_kennung, am desc);

comment on table public.betrieb_protokoll is
  'Was die Plattform mit einem Betrieb getan hat — wer, wann, warum. Ohne Inhaltsdaten; bleibt nach der Löschung als Löschprotokoll.';

alter table public.betrieb_protokoll enable row level security;
revoke all on public.betrieb_protokoll from anon, authenticated;
grant select on public.betrieb_protokoll to service_role;

-- Ein Protokoll, das sich nachträglich ändern lässt, ist keines.
create or replace function app.protokoll_unveraenderlich() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'Das Protokoll der Plattform wird nur ergänzt, nie geändert'
    using errcode = '42501';
end;
$$;

drop trigger if exists betrieb_protokoll_unveraenderlich on public.betrieb_protokoll;
create trigger betrieb_protokoll_unveraenderlich
  before update or delete on public.betrieb_protokoll
  for each row execute function app.protokoll_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 2. Ruht der Betrieb?
-- ---------------------------------------------------------------------------

create or replace function app.betrieb_ruht(p_betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.betrieb_zustand z
     where z.betrieb_kennung = p_betrieb
       and z.deaktiviert_am is not null)
$$;

revoke all on function app.betrieb_ruht(text) from public, anon, authenticated;
grant execute on function app.betrieb_ruht(text) to service_role;

/*
  WIE BISHER (20260926113500), DAZU DER BETRIEB: ein Konto ist nur aktiv,
  wenn es selbst aktiv ist UND sein Betrieb nicht ruht. Hier und nicht in
  jeder Richtlinie, weil jede Richtlinie über `app.angemeldet()` genau diese
  Frage stellt — auch die Speicherregeln.
*/
create or replace function app.aktiv() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select u.active and not app.betrieb_ruht(u.company_id)
       from public.users u where u.id = auth.uid()),
    case when nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '') is not null
         then false end,
    (auth.jwt() -> 'app_metadata' ->> 'active')::boolean,
    true)
$$;

revoke all on function app.aktiv() from public;
grant execute on function app.aktiv() to authenticated, anon, service_role;

/*
  DER SUPPORT BLEIBT AUCH DRAUSSEN. Rumpf wie 20260929110000, dazu die Frage
  nach dem Betrieb der Freigabe — sonst sähe ein Notzugang in einen Betrieb,
  den niemand mehr betreten darf.
*/
create or replace function app.support_liest(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.id = app.einblick_aktuell()
       and f.company_id = betrieb
       and not app.betrieb_ruht(f.company_id))
$$;

create or replace function app.support_schreibt(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.id = app.einblick_aktuell()
       and f.company_id = betrieb
       and f.stufe = 'mitarbeiten'
       and not app.betrieb_ruht(f.company_id))
$$;

create or replace function app.support_arbeitet() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.id = app.einblick_aktuell()
       and f.stufe = 'mitarbeiten'
       and not app.betrieb_ruht(f.company_id))
$$;

/*
  DIE SPERRE HÄLT. Rumpf wie 20260926113500 — nur entsperrt eine Änderung an
  der Belegschaft kein Konto eines ruhenden Betriebs wieder.
*/
create or replace function app.ansprueche_aus_belegschaft() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.ansprueche_setzen(
    new.id,
    jsonb_build_object('company_id', new.company_id, 'role', new.role,
                       'active', new.active));
  perform app.konto_sperren(new.id, new.active and not app.betrieb_ruht(new.company_id));
  if tg_op = 'UPDATE' and new.active and new.role is distinct from old.role then
    perform app.sitzungen_beenden(new.id);
  end if;
  return null;
end;
$$;

/*
  PUSH RUHT. Rumpf wie 20260915180000; vorn die Frage nach dem Betrieb. Die
  Ereignisse tragen ihn in `nachher` (Anforderungen) oder `zeile`
  (Abwesenheiten).
*/
create or replace function app.push_anstossen(p_ereignis jsonb) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
  anfrage bigint;
begin
  if app.betrieb_ruht(coalesce(p_ereignis -> 'nachher' ->> 'company_id',
                               p_ereignis -> 'zeile' ->> 'company_id')) then
    return;
  end if;

  select decrypted_secret into adresse
    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'push_schluessel';

  if adresse is null or schluessel is null then
    raise warning 'Push nicht eingerichtet: push_url oder push_schluessel fehlt im Tresor.';
    return;
  end if;

  select net.http_post(
    url := adresse,
    headers := app.anstoss_kopfzeilen(schluessel),
    body := p_ereignis,
    timeout_milliseconds := 20000)
  into anfrage;

  insert into app.anstoss_wache (anfrage, art) values (anfrage, 'push');
exception when others then
  raise warning 'Push konnte nicht angestossen werden: %', sqlerrm;
end;
$$;

revoke all on function app.push_anstossen(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Eine gelöschte Kennung kommt nie wieder
-- ---------------------------------------------------------------------------

/*
  Sie steht in den Pfaden der Sicherungen und in alten Exporten. Ein neuer
  Betrieb unter derselben Kennung erbte dort fremde Stände. Der Wortlaut
  trägt „vergeben“, damit `betrieb-anlegen` wie bei einer belegten Kennung
  mit 409 antwortet.
*/
create or replace function app.kennung_nicht_gesperrt() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if exists (select 1 from public.betrieb_zustand z
              where z.betrieb_kennung = new.id and z.geloescht_am is not null) then
    raise exception 'Die Kennung „%“ ist vergeben — sie gehörte einem gelöschten Betrieb und wird nicht neu vergeben', new.id
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_kennung_gesperrt on public.companies;
create trigger companies_kennung_gesperrt
  before insert on public.companies
  for each row execute function app.kennung_nicht_gesperrt();

-- ---------------------------------------------------------------------------
-- 4. Beim Löschen: eingefrorene Scheinpositionen
-- ---------------------------------------------------------------------------

/*
  Rumpf wie 20260911130000. Die Ausnahme gilt NUR innerhalb von
  `betrieb_loeschen_ausfuehren` (die Einstellung lebt bis zum Ende der
  Transaktion und nennt den Betrieb) und nur mit dem Dienstschlüssel.
*/
create or replace function app.scheinpositionen_eingefroren() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  zustand text;
  schein uuid;
begin
  if app.ist_dienst()
     and current_setting('app.betrieb_loeschung', true) = coalesce(new.company_id, old.company_id) then
    return coalesce(new, old);
  end if;
  schein := coalesce(new.work_sheet_id, old.work_sheet_id);
  select w.status into zustand from public.work_sheets w where w.id = schein;
  if zustand is not null and zustand <> 'Entwurf' then
    raise exception 'Der Schein ist %, seine Positionen sind eingefroren', zustand
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Hilfen
-- ---------------------------------------------------------------------------

create or replace function app.zustand_zeile(p_kennung text) returns public.betrieb_zustand
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
begin
  insert into public.betrieb_zustand (betrieb_kennung, name)
  select c.id, c.name from public.companies c where c.id = p_kennung
  on conflict (betrieb_kennung) do nothing;
  select * into z from public.betrieb_zustand where betrieb_kennung = p_kennung;
  if z.betrieb_kennung is null then
    raise exception 'Den Betrieb „%“ gibt es nicht', p_kennung using errcode = 'P0002';
  end if;
  if z.geloescht_am is not null then
    raise exception 'Der Betrieb „%“ ist gelöscht', p_kennung using errcode = 'P0002';
  end if;
  return z;
end;
$$;

create or replace function app.grund_pflicht(p_grund text) returns text
  language plpgsql immutable
  set search_path = ''
as $$
begin
  if btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Ohne Grund geht das nicht — er steht im Protokoll' using errcode = '22023';
  end if;
  return btrim(p_grund);
end;
$$;

create or replace function app.plattform_pflicht() returns void
  language plpgsql stable
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Das darf nur die Plattform' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.zustand_zeile(text) from public, anon, authenticated;
revoke all on function app.grund_pflicht(text) from public, anon, authenticated;
revoke all on function app.plattform_pflicht() from public, anon, authenticated;
revoke all on function app.kennung_nicht_gesperrt() from public, anon, authenticated;
revoke all on function app.protokoll_unveraenderlich() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Deaktivieren und wieder aktivieren
-- ---------------------------------------------------------------------------

create or replace function public.plattform_betrieb_deaktivieren(p_kennung text, p_grund text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
  g text;
  u record;
  konten integer := 0;
begin
  perform app.plattform_pflicht();
  g := app.grund_pflicht(p_grund);
  z := app.zustand_zeile(p_kennung);
  if z.deaktiviert_am is not null then
    raise exception 'Der Betrieb ist schon deaktiviert' using errcode = '22023';
  end if;

  update public.betrieb_zustand
     set deaktiviert_am = now(), deaktiviert_grund = g, deaktiviert_von = auth.uid()
   where betrieb_kennung = p_kennung;

  -- Jedes Konto gesperrt, jede Sitzung beendet (`konto_sperren` tut beides).
  for u in select id from public.users where company_id = p_kennung loop
    perform app.konto_sperren(u.id, false);
    konten := konten + 1;
  end loop;

  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'deaktiviert', g, auth.uid(), jsonb_build_object('konten_gesperrt', konten));
end;
$$;

create or replace function public.plattform_betrieb_aktivieren(p_kennung text, p_grund text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
  g text;
  u record;
  konten integer := 0;
begin
  perform app.plattform_pflicht();
  g := app.grund_pflicht(p_grund);
  z := app.zustand_zeile(p_kennung);
  if z.deaktiviert_am is null then
    raise exception 'Der Betrieb ist nicht deaktiviert' using errcode = '22023';
  end if;

  -- Wer wieder aufmacht, will nicht mehr löschen: eine geplante Löschung endet mit.
  update public.betrieb_zustand
     set deaktiviert_am = null, deaktiviert_grund = null, deaktiviert_von = null,
         loeschung_geplant_fuer = null, loeschung_grund = null
   where betrieb_kennung = p_kennung;

  -- Entsperrt wird, wer in der Belegschaft aktiv ist — nicht mehr.
  for u in select id, active from public.users where company_id = p_kennung loop
    perform app.konto_sperren(u.id, u.active);
    if u.active then konten := konten + 1; end if;
  end loop;

  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'aktiviert', g, auth.uid(),
          jsonb_build_object('konten_entsperrt', konten,
                             'loeschung_abgebrochen', z.loeschung_geplant_fuer is not null));
end;
$$;

create or replace function public.plattform_testbetrieb(p_kennung text, p_testbetrieb boolean, p_grund text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  g text;
begin
  perform app.plattform_pflicht();
  g := app.grund_pflicht(p_grund);
  perform app.zustand_zeile(p_kennung);
  update public.betrieb_zustand set testbetrieb = coalesce(p_testbetrieb, false)
   where betrieb_kennung = p_kennung;
  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'testbetrieb', g, auth.uid(), jsonb_build_object('testbetrieb', coalesce(p_testbetrieb, false)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Löschung planen und abbrechen
-- ---------------------------------------------------------------------------

create or replace function public.plattform_loeschung_planen(p_kennung text, p_grund text, p_tage integer default null)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
  g text;
  tage integer;
  wann timestamptz;
begin
  perform app.plattform_pflicht();
  g := app.grund_pflicht(p_grund);
  z := app.zustand_zeile(p_kennung);
  if z.deaktiviert_am is null then
    raise exception 'Gelöscht wird nur ein deaktivierter Betrieb — zuerst deaktivieren' using errcode = '22023';
  end if;
  if z.loeschung_geplant_fuer is not null then
    raise exception 'Die Löschung ist schon geplant' using errcode = '22023';
  end if;
  if not z.testbetrieb and z.export_am is null then
    raise exception 'Vor dem Löschen braucht der Betrieb seinen vollständigen Export' using errcode = '22023';
  end if;
  tage := coalesce(p_tage, case when z.testbetrieb then 0 else 30 end);
  if tage < case when z.testbetrieb then 0 else 7 end or tage > 365 then
    raise exception 'Die Frist liegt zwischen % und 365 Tagen', case when z.testbetrieb then 0 else 7 end
      using errcode = '22023';
  end if;
  wann := now() + make_interval(days => tage);

  update public.betrieb_zustand
     set loeschung_geplant_fuer = wann, loeschung_grund = g
   where betrieb_kennung = p_kennung;

  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'loeschung_geplant', g, auth.uid(),
          jsonb_build_object('frist_tage', tage, 'frühestens', wann, 'testbetrieb', z.testbetrieb));
  return wann;
end;
$$;

create or replace function public.plattform_loeschung_abbrechen(p_kennung text, p_grund text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
  g text;
begin
  perform app.plattform_pflicht();
  g := app.grund_pflicht(p_grund);
  z := app.zustand_zeile(p_kennung);
  if z.loeschung_geplant_fuer is null then
    raise exception 'Es ist keine Löschung geplant' using errcode = '22023';
  end if;
  update public.betrieb_zustand
     set loeschung_geplant_fuer = null, loeschung_grund = null
   where betrieb_kennung = p_kennung;
  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von)
  values (p_kennung, 'loeschung_abgebrochen', g, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Lesen: Liste, Protokoll, gelöschte Betriebe
-- ---------------------------------------------------------------------------

/*
  Rumpf wie 20260930300000, dazu der Zustand. Die Rückgabe ändert sich —
  deshalb neu angelegt statt ersetzt.
*/
drop function if exists public.plattform_betriebe();
create function public.plattform_betriebe()
  returns table (
    kennung text,
    name text,
    angelegt_am timestamptz,
    leitungskonten integer,
    leitung_mit_mail integer,
    notzugang_bis timestamptz,
    testbetrieb boolean,
    deaktiviert_am timestamptz,
    deaktiviert_grund text,
    export_am timestamptz,
    loeschung_geplant_fuer timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Die Liste der Betriebe sieht nur die Plattform' using errcode = '42501';
  end if;
  return query
    select
      c.id,
      c.name,
      coalesce(b.angelegt_am, c.created_at),
      (select count(*)::integer from public.users u
        where u.company_id = c.id and u.active
          and u.role in ('Administrator', 'Geschäftsführung')),
      (select count(*)::integer from public.users u
        where u.company_id = c.id and u.active
          and u.role in ('Administrator', 'Geschäftsführung')
          and lower(u.email) not like '%@benutzer.senklot.invalid'),
      (select max(f.gilt_bis) from public.support_freigaben f
        where f.company_id = c.id and f.notzugang
          and f.widerrufen_am is null and f.gilt_bis > now()),
      coalesce(z.testbetrieb, false),
      z.deaktiviert_am,
      z.deaktiviert_grund,
      z.export_am,
      z.loeschung_geplant_fuer
    from public.companies c
    left join public.betriebsanlagen b on b.betrieb_kennung = c.id
    left join public.betrieb_zustand z on z.betrieb_kennung = c.id
    order by lower(c.name);
end;
$$;

revoke all on function public.plattform_betriebe() from public, anon;
grant execute on function public.plattform_betriebe() to authenticated;

create or replace function public.plattform_betrieb_protokoll(p_kennung text default null, p_grenze integer default 100)
  returns table (betrieb_kennung text, aktion text, grund text, von uuid, am timestamptz, angaben jsonb)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_pflicht();
  return query
    select p.betrieb_kennung, p.aktion, p.grund, p.von, p.am, p.angaben
      from public.betrieb_protokoll p
     where p_kennung is null or p.betrieb_kennung = p_kennung
     order by p.am desc, p.id desc
     limit least(greatest(coalesce(p_grenze, 100), 1), 500);
end;
$$;

create or replace function public.plattform_geloeschte_betriebe()
  returns table (kennung text, name text, geloescht_am timestamptz, testbetrieb boolean)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_pflicht();
  return query
    select z.betrieb_kennung, z.name, z.geloescht_am, z.testbetrieb
      from public.betrieb_zustand z
     where z.geloescht_am is not null
     order by z.geloescht_am desc
     limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Nur mit dem Dienstschlüssel: Export vermerken, Löschung ausführen
-- ---------------------------------------------------------------------------

create or replace function app.plattform_konto_pflicht(p_admin uuid) returns void
  language plpgsql stable
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_dienst() then
    raise exception 'Nur über die Plattformfunktionen' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_admins p where p.id = p_admin) then
    raise exception 'Das darf nur die Plattform' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.plattform_konto_pflicht(uuid) from public, anon, authenticated;

create or replace function public.betrieb_export_festhalten(p_admin uuid, p_kennung text, p_grund text, p_angaben jsonb)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  g text;
  jetzt timestamptz := now();
begin
  perform app.plattform_konto_pflicht(p_admin);
  g := app.grund_pflicht(p_grund);
  perform app.zustand_zeile(p_kennung);
  update public.betrieb_zustand set export_am = jetzt where betrieb_kennung = p_kennung;
  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'export', g, p_admin, coalesce(p_angaben, '{}'::jsonb));
  return jetzt;
end;
$$;

/*
  DIE ÜBERGABE: welche Dateien zum Export gehören (Scheinfotos,
  Baustellendokumente — die eigenen Sicherungsstände nicht). Nur für einen
  deaktivierten Betrieb: solange er arbeitet, exportiert er selbst.
*/
create or replace function public.betrieb_uebergabe_dateien(p_admin uuid, p_kennung text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_konto_pflicht(p_admin);
  if not app.betrieb_ruht(p_kennung) then
    raise exception 'Die Übergabe gibt es für einen deaktivierten Betrieb — solange er arbeitet, exportiert er selbst'
      using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('eimer', o.bucket_id, 'pfad', o.name) order by o.bucket_id, o.name)
      from storage.objects o
     where o.bucket_id in (select e.eimer from app.datei_eimer() e where e.gesichert)
       and (storage.foldername(o.name))[2] = p_kennung), '[]'::jsonb);
end;
$$;

/*
  WAS VOR DEM LÖSCHEN FESTSTEHEN MUSS — und was weg muss, bevor die Zeilen
  gehen: die Dateien. Die Function holt sich hier die Liste, räumt den
  Speicher ab (über dessen Schnittstelle; in die Tabellen von `storage`
  schreibt niemand direkt) und ruft dann `betrieb_loeschen_ausfuehren`.
*/
create or replace function app.loeschung_pruefen(p_kennung text, p_bestaetigung text) returns public.betrieb_zustand
  language plpgsql stable
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
begin
  select * into z from public.betrieb_zustand where betrieb_kennung = p_kennung;
  if z.betrieb_kennung is null or not exists (select 1 from public.companies c where c.id = p_kennung) then
    raise exception 'Den Betrieb „%“ gibt es nicht', p_kennung using errcode = 'P0002';
  end if;
  if z.deaktiviert_am is null then
    raise exception 'Gelöscht wird nur ein deaktivierter Betrieb' using errcode = '22023';
  end if;
  if z.loeschung_geplant_fuer is null then
    raise exception 'Die Löschung ist nicht geplant' using errcode = '22023';
  end if;
  if z.loeschung_geplant_fuer > now() then
    raise exception 'Die Frist läuft noch bis %', to_char(z.loeschung_geplant_fuer at time zone 'Europe/Vienna', 'DD.MM.YYYY HH24:MI')
      using errcode = '22023';
  end if;
  if coalesce(btrim(p_bestaetigung), '') <> p_kennung then
    raise exception 'Zur Bestätigung die Kennung genau so eintippen: %', p_kennung using errcode = '22023';
  end if;
  return z;
end;
$$;

revoke all on function app.loeschung_pruefen(text, text) from public, anon, authenticated;

create or replace function public.betrieb_loeschen_pruefen(p_admin uuid, p_kennung text, p_bestaetigung text, p_grund text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_konto_pflicht(p_admin);
  perform app.grund_pflicht(p_grund);
  perform app.loeschung_pruefen(p_kennung, p_bestaetigung);
  return jsonb_build_object(
    'dateien', coalesce((
      select jsonb_agg(jsonb_build_object('eimer', o.bucket_id, 'pfad', o.name) order by o.bucket_id, o.name)
        from storage.objects o
       where o.bucket_id in (select e.eimer from app.datei_eimer() e)
         and (storage.foldername(o.name))[2] = p_kennung), '[]'::jsonb),
    'konten', coalesce((
      select jsonb_agg(u.id) from public.users u where u.company_id = p_kennung), '[]'::jsonb));
end;
$$;

/*
  DIE ZEILEN. Über jede Tabelle mit `company_id` (dieselbe Liste wie der
  Auszug, aus dem Katalog — eine künftige Tabelle ist von selbst dabei), in
  Runden: was an einem Fremdschlüssel hängt, geht in der nächsten Runde, wenn
  das Verweisende weg ist. Jeder andere Fehler bricht ab, und die ganze
  Transaktion mit ihm — halb gelöscht gibt es nicht.

  Die Belegschaft geht mit; die Anmeldekonten löscht danach die Function über
  den Anmeldedienst (ihre Liste kommt zurück). Bis dahin sind sie gesperrt
  und ohne Ansprüche.
*/
create or replace function public.betrieb_loeschen_ausfuehren(p_admin uuid, p_kennung text, p_bestaetigung text, p_grund text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  z public.betrieb_zustand;
  g text;
  t text;
  tabellen text[];
  offen text[];
  runde integer := 0;
  n bigint;
  zeilen bigint := 0;
  konten jsonb;
  dateien integer;
begin
  perform app.plattform_konto_pflicht(p_admin);
  g := app.grund_pflicht(p_grund);
  z := app.loeschung_pruefen(p_kennung, p_bestaetigung);

  -- Die Dateien müssen vorher weg sein: eine Zeile, deren Foto noch im Speicher liegt, bliebe sonst ohne Weg dorthin.
  select count(*) into dateien from storage.objects o
   where o.bucket_id in (select e.eimer from app.datei_eimer() e)
     and (storage.foldername(o.name))[2] = p_kennung;
  if dateien > 0 then
    raise exception 'Im Speicher liegen noch % Dateien dieses Betriebs', dateien using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(u.id), '[]'::jsonb) into konten from public.users u where u.company_id = p_kennung;

  perform set_config('app.betrieb_loeschung', p_kennung, true);

  tabellen := app.auszug_tabellen();
  loop
    runde := runde + 1;
    offen := '{}';
    foreach t in array tabellen loop
      begin
        execute format('delete from public.%I where company_id = $1', t) using p_kennung;
        get diagnostics n = row_count;
        zeilen := zeilen + n;
      exception when foreign_key_violation then
        offen := offen || t;
      end;
    end loop;
    exit when cardinality(offen) = 0;
    if runde > cardinality(app.auszug_tabellen()) + 1 then
      raise exception 'Nicht alles liess sich löschen: %', array_to_string(offen, ', ');
    end if;
    tabellen := offen;
  end loop;

  delete from public.companies where id = p_kennung;

  update public.betrieb_zustand
     set geloescht_am = now(), geloescht_von = p_admin
   where betrieb_kennung = p_kennung;

  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'geloescht', g, p_admin,
          jsonb_build_object('zeilen', zeilen, 'konten', jsonb_array_length(konten),
                             'testbetrieb', z.testbetrieb, 'export_am', z.export_am,
                             'antrag', z.loeschung_grund));

  return jsonb_build_object('zeilen', zeilen, 'konten', konten);
end;
$$;

/*
  BEIM ANLEGEN ALS TESTBETRIEB GEKENNZEICHNET — aus `betrieb-anlegen`, mit
  dem Dienstschlüssel und dem Plattformkonto, das anlegt.
*/
create or replace function public.betrieb_als_testbetrieb(p_admin uuid, p_kennung text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_konto_pflicht(p_admin);
  perform app.zustand_zeile(p_kennung);
  update public.betrieb_zustand set testbetrieb = true where betrieb_kennung = p_kennung;
  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'testbetrieb', 'Beim Anlegen als Testbetrieb gekennzeichnet', p_admin,
          jsonb_build_object('testbetrieb', true));
end;
$$;

-- Rechte: die Plattformfunktionen für angemeldete Konten (sie prüfen selbst), die Dienstfunktionen nur für den Dienst.
revoke all on function public.plattform_betrieb_deaktivieren(text, text) from public, anon;
revoke all on function public.plattform_betrieb_aktivieren(text, text) from public, anon;
revoke all on function public.plattform_testbetrieb(text, boolean, text) from public, anon;
revoke all on function public.plattform_loeschung_planen(text, text, integer) from public, anon;
revoke all on function public.plattform_loeschung_abbrechen(text, text) from public, anon;
revoke all on function public.plattform_betrieb_protokoll(text, integer) from public, anon;
revoke all on function public.plattform_geloeschte_betriebe() from public, anon;
grant execute on function public.plattform_betrieb_deaktivieren(text, text) to authenticated;
grant execute on function public.plattform_betrieb_aktivieren(text, text) to authenticated;
grant execute on function public.plattform_testbetrieb(text, boolean, text) to authenticated;
grant execute on function public.plattform_loeschung_planen(text, text, integer) to authenticated;
grant execute on function public.plattform_loeschung_abbrechen(text, text) to authenticated;
grant execute on function public.plattform_betrieb_protokoll(text, integer) to authenticated;
grant execute on function public.plattform_geloeschte_betriebe() to authenticated;

revoke all on function public.betrieb_export_festhalten(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.betrieb_loeschen_pruefen(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.betrieb_loeschen_ausfuehren(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.betrieb_als_testbetrieb(uuid, text) from public, anon, authenticated;
revoke all on function public.betrieb_uebergabe_dateien(uuid, text) from public, anon, authenticated;
grant execute on function public.betrieb_uebergabe_dateien(uuid, text) to service_role;
grant execute on function public.betrieb_export_festhalten(uuid, text, text, jsonb) to service_role;
grant execute on function public.betrieb_loeschen_pruefen(uuid, text, text, text) to service_role;
grant execute on function public.betrieb_loeschen_ausfuehren(uuid, text, text, text) to service_role;
grant execute on function public.betrieb_als_testbetrieb(uuid, text) to service_role;
