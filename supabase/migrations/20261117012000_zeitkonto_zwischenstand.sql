-- ===========================================================================
-- ZWISCHENSTÄNDE DES ZEITKONTOS JE PERSON UND MONAT (Durchsicht 15.11.2026,
-- L13)
-- ===========================================================================
--
-- NACHGESTELLT: `zeitkonto_salden` rechnet bei jedem Aufruf jeden Monat seit
-- dem Saldo-Start neu (`app.zeitkonto_rechnung` über alle Tage und alle
-- Buchungen). 50 Personen, bis zu zehn Jahre, 119.000 Buchungen: 750 ms je
-- Aufruf — und die Mitarbeiterübersicht ruft ihn nach jeder Buchung im Blick
-- erneut, die Startseite und die Zeiterfassung bei jedem Besuch. Die Zeit
-- wächst mit den Jahren, nicht mit dem, was sich ändert. Der laufende Monat
-- allein: 14 ms.
--
-- WARUM EIN ZWISCHENSPEICHER UND NICHT DER MONATSABSCHLUSS. Der Abschluss
-- (`zeit_monatsabschluesse`, Z6) ist eine Einstellung je Betrieb, ab Werk
-- aus; ein abgeschlossener Monat lässt sich mit Grund wieder öffnen, und der
-- Korrekturantrag schreibt auch in ihn. Festgehaltene Stände daran hätten nur
-- Betrieben geholfen, die ihn führen, und wären beim Wiederöffnen genauso
-- nachzuführen. Der Zwischenspeicher hilft jedem Betrieb.
--
-- WARUM DAS SICHER BLEIBT — die Zahl geht auf den Lohnzettel:
--
--   1. GESPEICHERT WERDEN NUR VERGANGENE MONATE (Monatsende vor heute): an
--      ihnen hängt `heute` nicht mehr. Der laufende Monat und alles, was nicht
--      gespeichert ist, rechnet `app.zeitkonto_rechnung` wie bisher.
--   2. JEDE EINGABE DER RECHNUNG NIMMT IHREN MONAT AUS DEM SPEICHER, in
--      derselben Transaktion wie die Änderung (Auslöser):
--        time_entries  Person, Betrieb, Tag, Status, Von/Bis, Pause, Stunden,
--                      Unterricht — alter und neuer Monat; TRUNCATE leert alles
--        users         Betrieb, Saldo-Start, Austritt, Arbeitszeitverlauf,
--                      Wochenstunden, Arbeitstage, Tagessoll — alle Monate
--        companies     halbe Tage am 24./31.12. — alle Monate des Betriebs
--      Die Feiertage stehen im Code (`app.feiertage`), die Zeitzone auch.
--   3. ÄNDERT SICH DIE RECHNUNG SELBST (eine spätere Migration an
--      `app.zeitkonto_rechnung` oder einer Funktion, die sie benutzt), gilt
--      kein gespeicherter Stand mehr: jede Zeile trägt den Fingerabdruck der
--      Definitionen (`app.zeitkonto_rechenstand`), gelesen wird nur, was dazu
--      passt.
--   4. KEIN WETTLAUF ZWISCHEN RECHNEN UND ÄNDERN. Gefüllt wird stündlich
--      (`zeitkonto-zwischenstand`). Wer Zeiten ändert, hält eine geteilte
--      Sperre auf den Betrieb (`pg_advisory_xact_lock_shared`) bis zum Ende
--      seiner Transaktion; das Füllen nimmt die ausschließliche nur, wenn
--      niemand ändert (`pg_try_…`, sonst nächste Stunde) und rechnet erst
--      danach. So rechnet es nie auf einem Stand, den eine noch offene
--      Änderung gleich ungültig macht, ohne dass deren Auslöser die Zeile
--      danach sähe. Wer ändert, wartet höchstens, bis das Füllen fertig ist.
--   5. LESEN SCHREIBT NICHT. `zeitkonto_salden` nimmt je Person die
--      gespeicherten Monate bis zur ersten Lücke und rechnet ab dort wie
--      bisher — ein ungültig gewordener Monat kostet Zeit, nie Richtigkeit.
--
-- GLEICHES ERGEBNIS: `tests/supabase/zeitkontoZwischenstand.test.ts` (der
-- gewachsene Bestand aus `tests/fixtures/zeitkontoBestand.ts` gegen
-- `calcOverallSaldo`, vor und nach dem Füllen und nach Änderungen jeder
-- Eingabe) und ein großer Bestand gegen die Rechnung ohne Speicher.
--
-- DATENSCHUTZ. Die Stände sind aus den Zeitbuchungen und der Arbeitszeit
-- gerechnet und nur über `zeitkonto_salden` erreichbar (dieselbe Regel wie
-- die Buchungen). Sie stehen in der Datenauskunft der Person; die Löschung
-- einer Person nimmt sie mit, und gefüllt wird nur für aktive Konten, damit
-- sie danach nicht neu entstehen. Ausgeschiedene rechnen wie bisher.
-- ===========================================================================

create table if not exists app.zeitkonto_monatsstand (
  user_id         uuid not null references public.users (id) on delete cascade,
  monat           date not null check (monat = date_trunc('month', monat)::date),
  company_id      text not null,
  soll_min        numeric not null,
  ist_min         numeric not null,
  gutschrift_min  numeric not null,
  pflichttage     numeric not null,
  ohne_buchung    integer not null,
  rechenstand     text not null,
  gerechnet_am    timestamptz not null default now(),
  primary key (user_id, monat)
);

create index if not exists zeitkonto_monatsstand_betrieb on app.zeitkonto_monatsstand (company_id);

-- Nur die Funktionen dieser Migration lesen und schreiben ihn.
alter table app.zeitkonto_monatsstand enable row level security;
revoke all on app.zeitkonto_monatsstand from public, anon, authenticated;

comment on table app.zeitkonto_monatsstand is
  'Zwischenstand des Zeitkontos je Person und vergangenem Monat (L13) — gerechnet, nie eingegeben; Zeilen ohne passenden rechenstand gelten nicht.';

/*
  DER FINGERABDRUCK DER RECHNUNG: die Definitionen von
  `app.zeitkonto_rechnung` und allem, was sie aufruft. Ändert eine Migration
  eine davon, passt kein gespeicherter Stand mehr. Kommt eine Funktion
  hinzu, die die Rechnung benutzt, gehört sie hierher.
*/
create or replace function app.zeitkonto_rechenstand() returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select md5(string_agg(pg_get_functiondef(f), '' order by f::text))
    from unnest(array[
      'app.zeitkonto_rechnung(uuid[], date, date)'::regprocedure,
      'app.arbeitszeit_abschnitte(jsonb, numeric, smallint[], jsonb)'::regprocedure,
      'app.tagessoll_stunden(numeric, smallint[], jsonb, date)'::regprocedure,
      'app.feiertage(date, date)'::regprocedure,
      'app.ostersonntag(integer)'::regprocedure]) f
$$;

revoke all on function app.zeitkonto_rechenstand() from public, anon, authenticated;

/* Der Schlüssel der Sperre je Betrieb (siehe 4. oben). */
create or replace function app.zeitkonto_sperre(p_betrieb text) returns bigint
  language sql
  immutable
  set search_path = ''
as $$
  select hashtextextended('zeitkonto-zwischenstand:' || coalesce(p_betrieb, ''), 0)
$$;

revoke all on function app.zeitkonto_sperre(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ungültig machen — in derselben Transaktion wie die Änderung
-- ---------------------------------------------------------------------------

create or replace function app.zeitkonto_stand_buchung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform pg_advisory_xact_lock_shared(app.zeitkonto_sperre(old.company_id));
    delete from app.zeitkonto_monatsstand z
     where z.user_id = old.user_id and z.monat = date_trunc('month', old.date)::date;
  end if;
  if tg_op in ('UPDATE', 'INSERT') then
    perform pg_advisory_xact_lock_shared(app.zeitkonto_sperre(new.company_id));
    delete from app.zeitkonto_monatsstand z
     where z.user_id = new.user_id and z.monat = date_trunc('month', new.date)::date;
  end if;
  return null;
end;
$$;

revoke all on function app.zeitkonto_stand_buchung() from public, anon, authenticated;

drop trigger if exists time_entries_zeitkonto_stand on public.time_entries;
create trigger time_entries_zeitkonto_stand
  after insert or delete on public.time_entries
  for each row execute function app.zeitkonto_stand_buchung();

-- Nur, wenn sich etwas ändert, das die Rechnung liest: „verrechnet“ setzen oder ein Kommentar sperren nichts.
drop trigger if exists time_entries_zeitkonto_stand_aendern on public.time_entries;
create trigger time_entries_zeitkonto_stand_aendern
  after update on public.time_entries
  for each row
  when ((old.user_id, old.company_id, old.date, old.status, old.start_time, old.end_time,
         old.break_duration, old.hours, old.unterricht_min)
        is distinct from
        (new.user_id, new.company_id, new.date, new.status, new.start_time, new.end_time,
         new.break_duration, new.hours, new.unterricht_min))
  execute function app.zeitkonto_stand_buchung();

create or replace function app.zeitkonto_stand_leeren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from app.zeitkonto_monatsstand;
  return null;
end;
$$;

revoke all on function app.zeitkonto_stand_leeren() from public, anon, authenticated;

drop trigger if exists time_entries_zeitkonto_stand_leeren on public.time_entries;
create trigger time_entries_zeitkonto_stand_leeren
  after truncate on public.time_entries
  for each statement execute function app.zeitkonto_stand_leeren();

create or replace function app.zeitkonto_stand_person() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock_shared(app.zeitkonto_sperre(old.company_id));
  perform pg_advisory_xact_lock_shared(app.zeitkonto_sperre(new.company_id));
  delete from app.zeitkonto_monatsstand z where z.user_id = new.id;
  return null;
end;
$$;

revoke all on function app.zeitkonto_stand_person() from public, anon, authenticated;

drop trigger if exists users_zeitkonto_stand on public.users;
create trigger users_zeitkonto_stand
  after update on public.users
  for each row
  when ((old.company_id, old.app_start_date, old.austritt, old.arbeitszeit_verlauf,
         old.weekly_target_hours, old.work_days, old.tagessoll)
        is distinct from
        (new.company_id, new.app_start_date, new.austritt, new.arbeitszeit_verlauf,
         new.weekly_target_hours, new.work_days, new.tagessoll))
  execute function app.zeitkonto_stand_person();

create or replace function app.zeitkonto_stand_betrieb() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock_shared(app.zeitkonto_sperre(new.id));
  delete from app.zeitkonto_monatsstand z where z.company_id = new.id;
  return null;
end;
$$;

revoke all on function app.zeitkonto_stand_betrieb() from public, anon, authenticated;

drop trigger if exists companies_zeitkonto_stand on public.companies;
create trigger companies_zeitkonto_stand
  after update on public.companies
  for each row
  when (old.dezember_halbtage is distinct from new.dezember_halbtage)
  execute function app.zeitkonto_stand_betrieb();

-- ---------------------------------------------------------------------------
-- Füllen — stündlich, nur vergangene Monate, nur wenn niemand ändert
-- ---------------------------------------------------------------------------

/*
  Je Betrieb: die Sperre versuchen, dann je aktiver Person ab dem ersten
  fehlenden Monat bis zum letzten vergangenen rechnen und schreiben — auch
  Monate ohne Ergebnis (mit null), damit die gespeicherten Monate lückenlos
  sind. Nach zwei Sekunden beginnt kein weiterer Betrieb mehr: die Sperren
  halten bis zum Ende der Transaktion, und so lange warten Änderungen in
  diesen Betrieben. Der Rest kommt in der nächsten Stunde.

  `p_betrieb`: nur dieser Betrieb (Prüfungen; ein Nachrechnen von Hand) —
  ohne ihn alle, wie stündlich.
*/
create or replace function app.zeitkonto_zwischenstand_fuellen(p_betrieb text default null) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  stand text := app.zeitkonto_rechenstand();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  letzter date := (date_trunc('month', heute) - interval '1 month')::date;
  beginn timestamptz := clock_timestamp();
  betrieb text;
  anzahl integer := 0;
  geschrieben integer;
begin
  /*
    Jede Anweisung muss den Stand NACH der Sperre sehen. Das gilt nur bei
    „read committed“; mit festem Schnappschuss rechnete das Füllen auf einem
    Stand von vor der Sperre.
  */
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Zwischenstände füllen nur mit read committed';
  end if;

  delete from app.zeitkonto_monatsstand z
   where z.rechenstand <> stand and (p_betrieb is null or z.company_id = p_betrieb);

  for betrieb in
    select distinct u.company_id from public.users u
     where u.active and u.app_start_date is not null and u.app_start_date <= (letzter + interval '1 month - 1 day')::date
       and (p_betrieb is null or u.company_id = p_betrieb)
     order by u.company_id
  loop
    exit when clock_timestamp() - beginn > interval '2 seconds';
    continue when not pg_try_advisory_xact_lock(app.zeitkonto_sperre(betrieb));

    with personen as (
      select u.id, u.company_id, x.ab
        from public.users u
        cross join lateral (
          select min(g)::date as ab
            from generate_series(date_trunc('month', u.app_start_date)::date, letzter, interval '1 month') g
           where not exists (select 1 from app.zeitkonto_monatsstand z
                              where z.user_id = u.id and z.monat = g::date and z.rechenstand = stand)
        ) x
       where u.company_id = betrieb and u.active and u.app_start_date is not null and x.ab is not null
    ),
    gruppen as (
      select p.ab, array_agg(p.id) as ids from personen p group by p.ab
    ),
    gerechnet as (
      select r.* from gruppen g,
             lateral app.zeitkonto_rechnung(g.ids, g.ab, (letzter + interval '1 month - 1 day')::date) r
    ),
    monate as (
      select p.id as user_id, p.company_id, m::date as monat
        from personen p, generate_series(p.ab, letzter, interval '1 month') m
    )
    insert into app.zeitkonto_monatsstand
           (user_id, monat, company_id, soll_min, ist_min, gutschrift_min, pflichttage, ohne_buchung, rechenstand)
    select m.user_id, m.monat, m.company_id,
           coalesce(r.soll_min, 0), coalesce(r.ist_min, 0), coalesce(r.gutschrift_min, 0),
           coalesce(r.pflichttage, 0), coalesce(r.ohne_buchung, 0), stand
      from monate m
      left join gerechnet r on r.user_id = m.user_id and r.monat = m.monat
    on conflict (user_id, monat) do update
       set company_id = excluded.company_id, soll_min = excluded.soll_min, ist_min = excluded.ist_min,
           gutschrift_min = excluded.gutschrift_min, pflichttage = excluded.pflichttage,
           ohne_buchung = excluded.ohne_buchung, rechenstand = excluded.rechenstand, gerechnet_am = now();
    get diagnostics geschrieben = row_count;
    anzahl := anzahl + geschrieben;
  end loop;
  return anzahl;
end;
$$;

revoke all on function app.zeitkonto_zwischenstand_fuellen(text) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('zeitkonto-zwischenstand') where exists (select 1 from cron.job where jobname = 'zeitkonto-zwischenstand');
  perform cron.schedule('zeitkonto-zwischenstand', '23 * * * *', 'select app.zeitkonto_zwischenstand_fuellen()');
exception when others then
  raise warning 'Das Füllen der Zwischenstände konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lesen — gespeicherte Monate bis zur ersten Lücke, ab dort gerechnet
-- ---------------------------------------------------------------------------

/*
  Dieselben Spalten wie `app.zeitkonto_rechnung` über den ganzen Zeitraum,
  dazu Monate ohne Ergebnis als Nullzeilen (sie ändern keine Summe). Je
  Person: gespeichert bis vor `ab`, dem ersten vergangenen Monat ohne
  gültigen Stand (sonst dem laufenden), ab dort die Rechnung wie bisher —
  für alle Personen mit demselben `ab` in einem Aufruf.
*/
create or replace function app.zeitkonto_monate_gemerkt(p_personen uuid[])
  returns table (user_id uuid, monat date, soll_min numeric, ist_min numeric, gutschrift_min numeric,
                 pflichttage numeric, ohne_buchung integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with stand as (select app.zeitkonto_rechenstand() as s),
  grenze as (
    select (date_trunc('month', (now() at time zone 'Europe/Vienna')::date) - interval '1 month')::date as letzter
  ),
  personen as (
    select u.id, coalesce(
             (select min(g)::date
                from generate_series(date_trunc('month', u.app_start_date)::date, gr.letzter, interval '1 month') g
               where not exists (select 1 from app.zeitkonto_monatsstand z
                                  where z.user_id = u.id and z.monat = g::date and z.rechenstand = st.s)),
             (gr.letzter + interval '1 month')::date) as ab
      from public.users u, grenze gr, stand st
     where u.id = any(p_personen) and u.app_start_date is not null
  ),
  gruppen as (
    select p.ab, array_agg(p.id) as ids from personen p group by p.ab
  )
  select z.user_id, z.monat, z.soll_min, z.ist_min, z.gutschrift_min, z.pflichttage, z.ohne_buchung
    from app.zeitkonto_monatsstand z
    join personen p on p.id = z.user_id, stand st
   where z.monat < p.ab and z.rechenstand = st.s
  union all
  select r.user_id, r.monat, r.soll_min, r.ist_min, r.gutschrift_min, r.pflichttage, r.ohne_buchung
    from gruppen g, lateral app.zeitkonto_rechnung(g.ids, g.ab, '9999-12-31'::date) r
$$;

revoke all on function app.zeitkonto_monate_gemerkt(uuid[]) from public, anon, authenticated;

/*
  `zeitkonto_salden` NIMMT DIE GESPEICHERTEN MONATE — gezielter Textersatz an
  der einen Stelle, an der die Rechnung über den ganzen Zeitraum läuft; alles
  andere an der Funktion (Leserecht, Anfangssaldo, Rundung) bleibt, wie es
  20261116020000 ff. gebaut haben.
*/
do $migration$
declare
  quelle text := pg_get_functiondef('public.zeitkonto_salden(uuid)'::regprocedure);
  alt text := 'from app.zeitkonto_rechnung(
             array(select p.id from personen p where p.konto and p.app_start_date is not null),
             ''0001-01-01''::date, ''9999-12-31''::date) r';
begin
  if position(alt in quelle) > 0 then
    execute replace(quelle, alt, 'from app.zeitkonto_monate_gemerkt(
             array(select p.id from personen p where p.konto and p.app_start_date is not null)) r');
  elsif position('app.zeitkonto_monate_gemerkt(' in quelle) = 0 then
    raise exception 'zeitkonto_salden: die Stelle mit app.zeitkonto_rechnung über den ganzen Zeitraum fehlt';
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Datenauskunft und Löschung einer Person
-- ---------------------------------------------------------------------------

do $migration$
declare
  quelle text := pg_get_functiondef('public.person_auskunft(text, uuid, integer)'::regprocedure);
  marke text := '    bearbeitet := jsonb_build_object(';
begin
  if position('zeitkonto_monatsstaende' in quelle) = 0 then
    if position(marke in quelle) = 0 then
      raise exception 'Personenauskunft: Einfügestelle fehlt';
    end if;
    execute replace(quelle, marke, $eintrag$    -- L13: die Zwischenstände des Zeitkontos, aus den Zeitbuchungen gerechnet.
    daten := daten || jsonb_build_object('zeitkonto_monatsstaende', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'monat', z.monat, 'soll_min', z.soll_min, 'ist_min', z.ist_min,
               'gutschrift_min', z.gutschrift_min, 'pflichttage', z.pflichttage,
               'tage_ohne_buchung', z.ohne_buchung, 'gerechnet_am', z.gerechnet_am) order by z.monat), '[]'::jsonb)
        from app.zeitkonto_monatsstand z where z.company_id = betrieb and z.user_id = p_id));

$eintrag$ || marke);
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text, uuid, boolean)'::regprocedure);
  marke := '      delete from public.user_prefs p where p.user_id = p_id;';
  if position('app.zeitkonto_monatsstand' in quelle) = 0 then
    if position(marke in quelle) = 0 then
      raise exception 'Löschung einer Person: Einfügestelle fehlt';
    end if;
    execute replace(quelle, marke, marke || '
      -- L13: gerechnete Zwischenstände; gefüllt wird nur für aktive Konten, sie entstehen nicht neu.
      delete from app.zeitkonto_monatsstand z where z.user_id = p_id;');
  end if;
end;
$migration$;
