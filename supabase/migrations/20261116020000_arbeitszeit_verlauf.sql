-- ===========================================================================
-- ARBEITSZEIT UND URLAUBSANSPRUCH MIT „GÜLTIG AB“ (Durchsicht 15.11.2026,
-- Z3 + F2; trägt L1 und L2)
-- ===========================================================================
--
-- WAS FALSCH WAR. Wochenstunden, Arbeitstage, Tagessoll und „Urlaubstage pro
-- Jahr“ standen ohne Datum an der Person. Jede Änderung rechnete rückwirkend
-- ab dem Saldo-Start: 40 → 30 Wochenstunden ab 1.12. machten aus jedem alten
-- Monat einen anderen (im Beispiel +936 Std Gesamtsaldo), 25 → 30 Urlaubstage
-- gaben auch dem Jahrgang des Vorjahres 30. Dazu lud jeder Saldo mit eigenem
-- Tagessoll alle Buchungen seit dem Eintritt (L1), und der Gesamtsaldo der
-- Mitarbeiterübersicht holte je Eintrittsmonat den ganzen Betrieb (L2).
--
-- ENTWURF DES DATENMODELLS
--
--   1. ZWEI VERLÄUFE AN DER PERSON, nach dem Vorbild von `einstufung_verlauf`
--      (20261006220000):
--        users.arbeitszeit_verlauf      [{ab, wochenstunden, arbeitstage,
--                                         tagessoll, am, von}]
--        users.urlaubsanspruch_verlauf  [{jahr, tage, am, von}]
--      Aufsteigend, je `ab` bzw. `jahr` höchstens ein Eintrag. Ein Eintrag
--      gilt bis zum nächsten; der erste gilt auch für alles davor.
--      WARUM AN DER ZEILE UND NICHT IN EINER EIGENEN TABELLE: dieselben, die
--      heute Wochenstunden und Arbeitstage lesen, lesen den Verlauf (der
--      Zeilenschutz von `users`); er geht mit der Zeile in die Datenauskunft
--      (`person_auskunft` gibt die ganze Zeile aus) und bleibt bei der
--      Löschung wie Einstufung und Wochenstunden, die er erklärt. Kein Grund
--      und kein Freitext darin — die Kollegen im Büro lesen die Zeile mit,
--      und „Elternteilzeit“ geht sie nichts an.
--   2. ZWEI VERLÄUFE, NICHT EINER: die Arbeitszeit gilt ab einem TAG, der
--      Urlaubsanspruch je URLAUBSJAHR (benannt nach dem Kalenderjahr, in dem
--      es beginnt, wie `urlaubsJahrVon`). Ein Anspruch, der mitten im Jahr
--      wechselte, müsste aliquotiert werden — dafür gibt es die Anpassungen
--      des Anspruchs (`urlaubsanspruch_anpassungen`). Ein gemeinsamer
--      Eintrag hätte zudem bei jeder Änderung des einen die Werte des anderen
--      mit dem Stand von heute überschrieben.
--   3. DIE SPALTEN `weekly_target_hours`, `work_days`, `tagessoll`,
--      `yearly_vacation_days` BLEIBEN und tragen den Wert, der HEUTE gilt.
--      Die alte App, die Benutzeranlage und alle Datenbankfunktionen, die sie
--      lesen, arbeiten weiter. Sie werden aus dem Verlauf nachgezogen (beim
--      Schreiben und stündlich, wenn ein vorgemerkter Eintrag fällig wird).
--   4. DIE MONATSBILANZ MIT DEM SOLL DES MONATS: `zeitkonto_monate` liefert je
--      Person und Monat Soll, Ist, Gutschrift (Krank, Urlaub, Schule,
--      Freistellung) und Lücken — das Soll mit der Arbeitszeit, die an jedem
--      Tag galt. `zeitkonto_salden` summiert sie zum Saldo (L1, L2). Wie
--      `monthly_stats` eine Rechnung bei jeder Abfrage und kein Bestand: ein
--      gespeicherter Stand müsste nachgeführt werden und könnte unvollständig
--      sein (der Grund, aus dem der Firestore-Nachtlauf wegfiel). Fest wird
--      das Soll alter Monate durch den Verlauf: eine Änderung „ab 1.12.“
--      erreicht keinen Tag davor.
--
-- ÜBERGANG DER ALTDATEN — NICHTS WIRD UMGESCHRIEBEN. Die Spalten kommen mit
-- dem Vorgabewert `[]` (ohne Umschreiben der Tabelle). Ein leerer Verlauf
-- heisst: die Werte der Zeile gelten für jeden Tag und jedes Jahr — also
-- genau die bisherige Rechnung. Der Eintrag „gültig ab Saldo-Start mit den
-- heutigen Werten“ entsteht erst mit der ersten Änderung, in derselben
-- Anweisung (`app.arbeitszeit_basis`, `app.urlaubsanspruch_basis`). Für jede
-- Person ohne Änderung ändert sich damit keine Zahl.
--
-- DIE ALTE APP schreibt die Spalten direkt. Ändert sie sie, wird daraus ein
-- Eintrag „ab heute“ (Urlaub: ab dem laufenden Urlaubsjahr) — nie mehr
-- rückwirkend über den ganzen Verlauf.
--
-- DIE DATENBANKFUNKTIONEN, die Abwesenheitstage schreiben (Urlaub, Krank,
-- Freistellung, Schule, Betriebsurlaub), zählen die Arbeitstage jedes Tages
-- nach dem Verlauf (`app.urlaubstage_person`); `app.tagessoll_minuten` gibt
-- das Tagessoll des Tages. Ohne Verlauf dieselben Tage wie bisher.
-- ===========================================================================

alter table public.users
  add column if not exists arbeitszeit_verlauf jsonb not null default '[]'::jsonb,
  add column if not exists urlaubsanspruch_verlauf jsonb not null default '[]'::jsonb;

comment on column public.users.arbeitszeit_verlauf is
  'Arbeitszeit ab einem Tag: [{ab, wochenstunden, arbeitstage, tagessoll, am, von}], aufsteigend; leer = die Spalten gelten immer. Schreiben nur arbeitszeit_aendern/_entfernen (Z3).';
comment on column public.users.urlaubsanspruch_verlauf is
  'Urlaubsanspruch je Urlaubsjahr: [{jahr, tage, am, von}], aufsteigend; leer = yearly_vacation_days gilt immer. Schreiben nur urlaubsanspruch_aendern/_entfernen (Z3).';

/*
  DIE FORM DER VERLÄUFE. Die Datenbank prüft sie selbst, weil der Rücklauf
  (Dienstschlüssel) die Spalten ungeprüft schreiben darf.
*/
create or replace function app.arbeitszeit_verlauf_gueltig(p jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(p) with ordinality e(v, n)
        where jsonb_typeof(v) <> 'object'
           or coalesce(v ->> 'ab', '') !~ '^\d{4}-\d{2}-\d{2}$'
           or jsonb_typeof(v -> 'arbeitstage') <> 'array'
           or jsonb_array_length(v -> 'arbeitstage') = 0
           or exists (select 1 from jsonb_array_elements(v -> 'arbeitstage') t
                       where jsonb_typeof(t) <> 'number' or (t #>> '{}') !~ '^[0-6]$')
           or (v ? 'wochenstunden' and jsonb_typeof(v -> 'wochenstunden') not in ('number', 'null'))
           or (jsonb_typeof(v -> 'wochenstunden') = 'number'
               and ((v ->> 'wochenstunden')::numeric < 0 or (v ->> 'wochenstunden')::numeric >= 1000))
           or not app.tagessoll_gueltig(nullif(v -> 'tagessoll', 'null'::jsonb))
           -- aufsteigend und je Tag einmal
           or (n > 1 and (v ->> 'ab') <= (p -> (n::integer - 2) ->> 'ab')))
$$;

create or replace function app.urlaubsanspruch_verlauf_gueltig(p jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(p) with ordinality e(v, n)
        where jsonb_typeof(v) <> 'object'
           or jsonb_typeof(v -> 'jahr') <> 'number'
           or (v ->> 'jahr') !~ '^\d{4}$'
           or jsonb_typeof(v -> 'tage') <> 'number'
           or (v ->> 'tage') !~ '^\d{1,3}$'
           or (n > 1 and (v ->> 'jahr')::integer <= (p -> (n::integer - 2) ->> 'jahr')::integer))
$$;

revoke all on function app.arbeitszeit_verlauf_gueltig(jsonb) from public, anon, authenticated;
revoke all on function app.urlaubsanspruch_verlauf_gueltig(jsonb) from public, anon, authenticated;

alter table public.users drop constraint if exists users_arbeitszeit_verlauf_form;
alter table public.users add constraint users_arbeitszeit_verlauf_form
  check (app.arbeitszeit_verlauf_gueltig(arbeitszeit_verlauf));
alter table public.users drop constraint if exists users_urlaubsanspruch_verlauf_form;
alter table public.users add constraint users_urlaubsanspruch_verlauf_form
  check (app.urlaubsanspruch_verlauf_gueltig(urlaubsanspruch_verlauf));

/*
  DIE ABSCHNITTE DER ARBEITSZEIT: je Eintrag von `ab` bis zum nächsten
  (ausschliesslich). Der erste beginnt bei `null` = „schon immer“: vor dem
  ersten Eintrag gilt er, nicht nichts. Ohne Verlauf ein einziger Abschnitt
  mit den Werten der Zeile — die bisherige Rechnung.
*/
create or replace function app.arbeitszeit_abschnitte(
  p_verlauf jsonb, p_wochenstunden numeric, p_arbeitstage smallint[], p_tagessoll jsonb
) returns table (ab date, bis date, wochenstunden numeric, arbeitstage smallint[], tagessoll jsonb)
  language sql
  immutable
  set search_path = ''
as $$
  select case when x.n = 1 then null else x.ab end,
         lead(x.ab) over (order by x.ab),
         x.wochenstunden, x.arbeitstage, x.tagessoll
    from (
      select (v ->> 'ab')::date as ab,
             row_number() over (order by (v ->> 'ab')::date) as n,
             (v ->> 'wochenstunden')::numeric as wochenstunden,
             array(select (t #>> '{}')::smallint from jsonb_array_elements(v -> 'arbeitstage') t) as arbeitstage,
             nullif(v -> 'tagessoll', 'null'::jsonb) as tagessoll
        from jsonb_array_elements(coalesce(p_verlauf, '[]'::jsonb)) v
    ) x
  union all
  select null::date, null::date, p_wochenstunden, p_arbeitstage, p_tagessoll
   where jsonb_array_length(coalesce(p_verlauf, '[]'::jsonb)) = 0
$$;

revoke all on function app.arbeitszeit_abschnitte(jsonb, numeric, smallint[], jsonb) from public, anon, authenticated;

/* Der Abschnitt, der an einem Tag gilt. */
create or replace function app.arbeitszeit_am(p_person public.users, p_tag date)
  returns table (wochenstunden numeric, arbeitstage smallint[], tagessoll jsonb)
  language sql
  stable
  set search_path = ''
as $$
  select a.wochenstunden, a.arbeitstage, a.tagessoll
    from app.arbeitszeit_abschnitte(p_person.arbeitszeit_verlauf, p_person.weekly_target_hours,
                                    p_person.work_days, p_person.tagessoll) a
   where (a.ab is null or p_tag >= a.ab) and (a.bis is null or p_tag < a.bis)
   limit 1
$$;

revoke all on function app.arbeitszeit_am(public.users, date) from public, anon, authenticated;

/*
  Das Tagessoll eines Tages in Stunden — die Regel von `tagessollStunden`:
  das eigene Soll des Wochentags, sonst Wochenstunden durch Arbeitstage
  (0 oder leer zählt wie bisher als 40 bzw. Montag bis Freitag).
*/
create or replace function app.tagessoll_stunden(
  p_wochenstunden numeric, p_arbeitstage smallint[], p_tagessoll jsonb, p_tag date
) returns numeric
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(
    case when jsonb_typeof(p_tagessoll -> extract(dow from p_tag)::integer::text) = 'number'
         then (p_tagessoll ->> extract(dow from p_tag)::integer::text)::numeric end,
    coalesce(nullif(p_wochenstunden, 0), 40)
      / (case when coalesce(cardinality(p_arbeitstage), 0) = 0 then 5 else cardinality(p_arbeitstage) end)::numeric)
$$;

revoke all on function app.tagessoll_stunden(numeric, smallint[], jsonb, date) from public, anon, authenticated;

/*
  DIE FEIERTAGE EINES ZEITRAUMS ALS MENGE — dieselbe Liste wie
  `app.ist_feiertag`. Je Tag gefragt kostet `ist_feiertag` rund 0,7 ms (Ostern
  wird jedes Mal neu gerechnet); über zehn Jahre und fünfzig Personen wären
  das Minuten. So wird Ostern einmal je Jahr gerechnet.
*/
create or replace function app.feiertage(p_von date, p_bis date) returns table (tag date)
  language sql
  stable
  set search_path = ''
as $$
  select x.tag
    from (
      select make_date(j, substr(m, 1, 2)::integer, substr(m, 4, 2)::integer) as tag
        from generate_series(extract(year from p_von)::integer, extract(year from p_bis)::integer) j,
             unnest(array['01-01', '01-06', '05-01', '08-15', '10-26', '11-01', '12-08', '12-25', '12-26']) m
      union
      select app.ostersonntag(j) + v
        from generate_series(extract(year from p_von)::integer, extract(year from p_bis)::integer) j,
             unnest(array[1, 39, 50, 60]) v
    ) x
   where p_von is not null and p_bis is not null and x.tag between p_von and p_bis
$$;

revoke all on function app.feiertage(date, date) from public, anon, authenticated;

/* Ist der Tag nach seinem Abschnitt ein Arbeitstag (ohne Feiertag)? */
create or replace function app.ist_arbeitstag(p_arbeitstage smallint[], p_tag date) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select extract(dow from p_tag)::smallint = any(
           case when coalesce(cardinality(p_arbeitstage), 0) = 0 then array[1, 2, 3, 4, 5]::smallint[]
                else p_arbeitstage end)
     and not app.ist_feiertag(p_tag)
$$;

revoke all on function app.ist_arbeitstag(smallint[], date) from public, anon, authenticated;

/* Das Urlaubsjahr eines Tages im Betrieb — wie `urlaubsJahrVon`. */
create or replace function app.urlaubsjahr_von(p_betrieb text, p_tag date) returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case when to_char(p_tag, 'MM-DD') >= coalesce(nullif(c.urlaub_jahresbeginn, ''), '01-01')
              then extract(year from p_tag)::integer
              else extract(year from p_tag)::integer - 1 end
    from (select (select x.urlaub_jahresbeginn from public.companies x where x.id = p_betrieb) as urlaub_jahresbeginn) c
$$;

revoke all on function app.urlaubsjahr_von(text, date) from public, anon, authenticated;

/* Der Anspruch eines Urlaubsjahres: der letzte Eintrag bis dahin, sonst der erste. */
create or replace function app.urlaubsanspruch_im(p_verlauf jsonb, p_tage integer, p_jahr integer)
  returns integer
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(
    (select (v ->> 'tage')::integer from jsonb_array_elements(coalesce(p_verlauf, '[]'::jsonb)) v
      where (v ->> 'jahr')::integer <= p_jahr order by (v ->> 'jahr')::integer desc limit 1),
    (select (v ->> 'tage')::integer from jsonb_array_elements(coalesce(p_verlauf, '[]'::jsonb)) v
      order by (v ->> 'jahr')::integer limit 1),
    p_tage)
$$;

revoke all on function app.urlaubsanspruch_im(jsonb, integer, integer) from public, anon, authenticated;

/*
  DER EINTRAG „GÜLTIG AB SALDO-START MIT DEN HEUTIGEN WERTEN“ — der Übergang
  der Altdaten, gebildet erst, wenn der Verlauf zum ersten Mal etwas
  aufnimmt. `null`, solange es nichts festzuhalten gibt: ohne Saldo-Start
  oder mit einem Saldo-Start ab `p_ab` hat noch keine Rechnung die alten
  Werte benutzt, und der neue Eintrag gilt dann allein.
*/
create or replace function app.arbeitszeit_basis(p_person public.users, p_ab date) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select case
    when jsonb_array_length(p_person.arbeitszeit_verlauf) > 0 then null
    when p_person.app_start_date is null or p_person.app_start_date >= p_ab then null
    else jsonb_build_object(
      'ab', p_person.app_start_date,
      'wochenstunden', p_person.weekly_target_hours,
      'arbeitstage', to_jsonb(coalesce(nullif(p_person.work_days, '{}'), array[1, 2, 3, 4, 5]::smallint[])),
      'tagessoll', p_person.tagessoll,
      'am', now(),
      'von', null)
  end
$$;

create or replace function app.urlaubsanspruch_basis(p_person public.users, p_jahr integer) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select case
    when jsonb_array_length(p_person.urlaubsanspruch_verlauf) > 0 then null
    when p_person.app_start_date is null
      or app.urlaubsjahr_von(p_person.company_id, p_person.app_start_date) >= p_jahr then null
    else jsonb_build_object(
      'jahr', app.urlaubsjahr_von(p_person.company_id, p_person.app_start_date),
      'tage', coalesce(p_person.yearly_vacation_days, 25),
      'am', now(),
      'von', null)
  end
$$;

revoke all on function app.arbeitszeit_basis(public.users, date) from public, anon, authenticated;
revoke all on function app.urlaubsanspruch_basis(public.users, integer) from public, anon, authenticated;

/* Einen Eintrag einsetzen: gleicher Tag ersetzt, sonst eingereiht. */
create or replace function app.verlauf_einsetzen(p_verlauf jsonb, p_eintrag jsonb, p_schluessel text)
  returns jsonb
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(v order by v ->> p_schluessel), '[]'::jsonb)
    from (
      select v from jsonb_array_elements(coalesce(p_verlauf, '[]'::jsonb)) v
       where (v ->> p_schluessel) is distinct from (p_eintrag ->> p_schluessel)
      union all
      select p_eintrag where p_eintrag is not null
    ) x
$$;

revoke all on function app.verlauf_einsetzen(jsonb, jsonb, text) from public, anon, authenticated;

/*
  DIE VERLÄUFE FÜHREN UND DIE HEUTIGEN WERTE NACHZIEHEN — ein Auslöser für
  alles, damit keine zweite Stelle die Spalten anders setzen kann.

  1. Den Verlauf schreiben nur die Funktionen dieser Migration (Merker
     `app.arbeitszeit_eigen`) und der Rücklauf. Was die App mitschickt, wird
     verworfen — sonst liesse sich das Soll alter Monate über ihn ändern.
  2. Ändert jemand die Spalten direkt (die alte App), wird daraus ein Eintrag
     ab heute bzw. ab dem laufenden Urlaubsjahr.
  3. Mit Verlauf tragen die Spalten danach, was heute gilt.
*/
create or replace function app.arbeitszeit_verlauf_fuehren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  eigen boolean := coalesce(current_setting('app.arbeitszeit_eigen', true), '') = 'an';
  dienst boolean := app.ist_dienst();
  jahr integer;
  az record;
begin
  if tg_op = 'INSERT' then
    if not dienst then
      new.arbeitszeit_verlauf := '[]'::jsonb;
      new.urlaubsanspruch_verlauf := '[]'::jsonb;
    end if;
  else
    if not dienst and not eigen then
      new.arbeitszeit_verlauf := old.arbeitszeit_verlauf;
      new.urlaubsanspruch_verlauf := old.urlaubsanspruch_verlauf;

      if (new.weekly_target_hours, new.work_days, new.tagessoll)
         is distinct from (old.weekly_target_hours, old.work_days, old.tagessoll)
         and (jsonb_array_length(old.arbeitszeit_verlauf) > 0 or app.arbeitszeit_basis(old, heute) is not null) then
        new.arbeitszeit_verlauf := app.verlauf_einsetzen(
          app.verlauf_einsetzen(old.arbeitszeit_verlauf, app.arbeitszeit_basis(old, heute), 'ab'),
          jsonb_build_object(
            'ab', heute,
            'wochenstunden', new.weekly_target_hours,
            'arbeitstage', to_jsonb(coalesce(nullif(new.work_days, '{}'), array[1, 2, 3, 4, 5]::smallint[])),
            'tagessoll', new.tagessoll,
            'am', now(),
            'von', auth.uid()),
          'ab');
      end if;

      jahr := app.urlaubsjahr_von(new.company_id, heute);
      if new.yearly_vacation_days is distinct from old.yearly_vacation_days
         and new.yearly_vacation_days is not null
         and (jsonb_array_length(old.urlaubsanspruch_verlauf) > 0 or app.urlaubsanspruch_basis(old, jahr) is not null) then
        new.urlaubsanspruch_verlauf := app.verlauf_einsetzen(
          app.verlauf_einsetzen(old.urlaubsanspruch_verlauf, app.urlaubsanspruch_basis(old, jahr), 'jahr'),
          jsonb_build_object('jahr', jahr, 'tage', new.yearly_vacation_days, 'am', now(), 'von', auth.uid()),
          'jahr');
      end if;
    end if;
  end if;

  if jsonb_array_length(new.arbeitszeit_verlauf) > 0 then
    select * into az from app.arbeitszeit_am(new, heute);
    new.weekly_target_hours := az.wochenstunden;
    new.work_days := az.arbeitstage;
    new.tagessoll := az.tagessoll;
  end if;
  if jsonb_array_length(new.urlaubsanspruch_verlauf) > 0 then
    new.yearly_vacation_days := app.urlaubsanspruch_im(
      new.urlaubsanspruch_verlauf, new.yearly_vacation_days, app.urlaubsjahr_von(new.company_id, heute));
  end if;
  return new;
end;
$$;

revoke all on function app.arbeitszeit_verlauf_fuehren() from public, anon, authenticated;

-- Vor `users_einstufung_verlauf` und den Einlässen: Auslöser laufen nach Namen.
drop trigger if exists users_arbeitszeit_verlauf on public.users;
create trigger users_arbeitszeit_verlauf
  before insert or update on public.users
  for each row execute function app.arbeitszeit_verlauf_fuehren();

/*
  WIRD EIN VORGEMERKTER EINTRAG FÄLLIG (ab 1.12., heute ist der 1.12.),
  ziehen die Spalten nach — stündlich, nur wo sich etwas ändert.
*/
create or replace function app.arbeitszeit_heute_nachziehen() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  anzahl integer;
begin
  perform set_config('app.arbeitszeit_eigen', 'an', true);
  update public.users u
     set updated_at = u.updated_at
   where (jsonb_array_length(u.arbeitszeit_verlauf) > 0
          and exists (select 1 from app.arbeitszeit_am(u, heute) a
                       where (a.wochenstunden, a.arbeitstage, a.tagessoll)
                             is distinct from (u.weekly_target_hours, u.work_days, u.tagessoll)))
      or (jsonb_array_length(u.urlaubsanspruch_verlauf) > 0
          and app.urlaubsanspruch_im(u.urlaubsanspruch_verlauf, u.yearly_vacation_days,
                                     app.urlaubsjahr_von(u.company_id, heute))
              is distinct from u.yearly_vacation_days);
  get diagnostics anzahl = row_count;
  perform set_config('app.arbeitszeit_eigen', '', true);
  return anzahl;
end;
$$;

revoke all on function app.arbeitszeit_heute_nachziehen() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('arbeitszeit-heute') where exists (select 1 from cron.job where jobname = 'arbeitszeit-heute');
  perform cron.schedule('arbeitszeit-heute', '7 * * * *', 'select app.arbeitszeit_heute_nachziehen()');
exception when others then
  raise warning 'Das Nachziehen der Arbeitszeit konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;

/*
  DIE VERLÄUFE STEHEN NICHT IM ÄNDERUNGSJOURNAL — jeder Eintrag trägt selbst,
  wann und von wem (wie `einstufung_verlauf`). Was sich an den Spalten von
  heute ändert, steht weiter darin.
*/
drop trigger if exists users_journal on public.users;
create trigger users_journal
  after insert or update or delete on public.users
  for each row execute function app.journal_protokollieren(
    'benutzer', '{id,company_id,created_at,updated_at,einstufung_verlauf,arbeitszeit_verlauf,urlaubsanspruch_verlauf}');

-- ---------------------------------------------------------------------------
-- Ändern und entfernen — wer die Akte ändert (Geschäftsführung, Administration)
-- ---------------------------------------------------------------------------

create or replace function app.arbeitszeit_person(p_user uuid) returns public.users
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  person public.users;
begin
  if betrieb is null or auth.uid() is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Arbeitszeit und Urlaubsanspruch ändern Geschäftsführung oder Administration'
      using errcode = '42501';
  end if;
  select * into person from public.users u where u.id = p_user and u.company_id = betrieb;
  if person.id is null then
    raise exception 'Diesen Mitarbeiter gibt es nicht' using errcode = 'P0002';
  end if;
  return person;
end;
$$;

revoke all on function app.arbeitszeit_person(uuid) from public, anon, authenticated;

/*
  ARBEITSZEIT AB EINEM TAG. Gilt bis zum nächsten Eintrag; spätere Einträge
  bleiben. Ein Tag vor dem Saldo-Start berichtigt den Anfang — dann gilt der
  Eintrag für alles bis zum nächsten. Mit eigenem Tagessoll sind die
  Wochenstunden seine Summe (wie in der Akte, `alsProfil`).
*/
create or replace function public.arbeitszeit_aendern(
  p_user uuid,
  p_ab date,
  p_wochenstunden numeric,
  p_arbeitstage smallint[],
  p_tagessoll jsonb default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  person public.users := app.arbeitszeit_person(p_user);
  tage smallint[];
  stunden numeric := p_wochenstunden;
  soll jsonb := nullif(p_tagessoll, 'null'::jsonb);
  verlauf jsonb;
begin
  if p_ab is null then
    raise exception 'Bitte angeben, ab wann die Arbeitszeit gilt' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into tage from unnest(p_arbeitstage) t where t between 0 and 6;
  if cardinality(tage) = 0 then
    raise exception 'Bitte mindestens einen Arbeitstag wählen' using errcode = '22023';
  end if;
  if soll = '{}'::jsonb then
    soll := null;
  end if;
  if not app.tagessoll_gueltig(soll) then
    raise exception 'Bitte für jeden Arbeitstag ein Tagessoll zwischen 0 und 24 Stunden angeben.' using errcode = '22023';
  end if;
  if soll is not null then
    if exists (select 1 from unnest(tage) t where not soll ? t::text)
       or exists (select 1 from jsonb_object_keys(soll) k where not k::smallint = any(tage)) then
      raise exception 'Bitte für jeden Arbeitstag ein Tagessoll zwischen 0 und 24 Stunden angeben.' using errcode = '22023';
    end if;
    select round(sum(value::numeric), 2) into stunden from jsonb_each_text(soll);
  end if;
  if stunden is null or stunden < 0 or stunden >= 1000 then
    raise exception 'Bitte die Wochenstunden angeben' using errcode = '22023';
  end if;

  verlauf := app.verlauf_einsetzen(
    app.verlauf_einsetzen(person.arbeitszeit_verlauf, app.arbeitszeit_basis(person, p_ab), 'ab'),
    jsonb_build_object('ab', p_ab, 'wochenstunden', stunden, 'arbeitstage', to_jsonb(tage),
                       'tagessoll', soll, 'am', now(), 'von', auth.uid()),
    'ab');

  perform set_config('app.arbeitszeit_eigen', 'an', true);
  update public.users u set arbeitszeit_verlauf = verlauf where u.id = person.id;
  perform set_config('app.arbeitszeit_eigen', '', true);
  return verlauf;
end;
$$;

revoke all on function public.arbeitszeit_aendern(uuid, date, numeric, smallint[], jsonb) from public, anon;
grant execute on function public.arbeitszeit_aendern(uuid, date, numeric, smallint[], jsonb) to authenticated;

/*
  EINEN EINTRAG ZURÜCKNEHMEN. Der erste bleibt — ohne ihn gäbe es für die
  Zeit davor keine Arbeitszeit. Danach gilt wieder der vorige.
*/
create or replace function public.arbeitszeit_aenderung_entfernen(p_user uuid, p_ab date) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  person public.users := app.arbeitszeit_person(p_user);
  verlauf jsonb;
begin
  if not exists (select 1 from jsonb_array_elements(person.arbeitszeit_verlauf) v where (v ->> 'ab')::date = p_ab) then
    raise exception 'Diese Änderung gibt es nicht' using errcode = 'P0002';
  end if;
  if (person.arbeitszeit_verlauf -> 0 ->> 'ab')::date = p_ab then
    raise exception 'Die erste Arbeitszeit bleibt — sie gilt für alles davor. Stattdessen berichtigen.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(v order by v ->> 'ab'), '[]'::jsonb) into verlauf
    from jsonb_array_elements(person.arbeitszeit_verlauf) v where (v ->> 'ab')::date <> p_ab;

  perform set_config('app.arbeitszeit_eigen', 'an', true);
  update public.users u set arbeitszeit_verlauf = verlauf where u.id = person.id;
  perform set_config('app.arbeitszeit_eigen', '', true);
  return verlauf;
end;
$$;

revoke all on function public.arbeitszeit_aenderung_entfernen(uuid, date) from public, anon;
grant execute on function public.arbeitszeit_aenderung_entfernen(uuid, date) to authenticated;

/* URLAUBSANSPRUCH AB EINEM URLAUBSJAHR — gilt für ganze Jahre, bis zum nächsten Eintrag. */
create or replace function public.urlaubsanspruch_aendern(p_user uuid, p_jahr integer, p_tage integer) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  person public.users := app.arbeitszeit_person(p_user);
  verlauf jsonb;
begin
  if p_jahr is null or p_jahr not between 2000 and 2100 then
    raise exception 'Bitte das Urlaubsjahr angeben, ab dem der Anspruch gilt' using errcode = '22023';
  end if;
  if p_tage is null or p_tage < 0 or p_tage > 366 then
    raise exception 'Bitte die Urlaubstage pro Jahr angeben' using errcode = '22023';
  end if;

  verlauf := app.verlauf_einsetzen(
    app.verlauf_einsetzen(person.urlaubsanspruch_verlauf, app.urlaubsanspruch_basis(person, p_jahr), 'jahr'),
    jsonb_build_object('jahr', p_jahr, 'tage', p_tage, 'am', now(), 'von', auth.uid()),
    'jahr');

  perform set_config('app.arbeitszeit_eigen', 'an', true);
  update public.users u set urlaubsanspruch_verlauf = verlauf where u.id = person.id;
  perform set_config('app.arbeitszeit_eigen', '', true);
  return verlauf;
end;
$$;

revoke all on function public.urlaubsanspruch_aendern(uuid, integer, integer) from public, anon;
grant execute on function public.urlaubsanspruch_aendern(uuid, integer, integer) to authenticated;

create or replace function public.urlaubsanspruch_aenderung_entfernen(p_user uuid, p_jahr integer) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  person public.users := app.arbeitszeit_person(p_user);
  verlauf jsonb;
begin
  if not exists (select 1 from jsonb_array_elements(person.urlaubsanspruch_verlauf) v where (v ->> 'jahr')::integer = p_jahr) then
    raise exception 'Diese Änderung gibt es nicht' using errcode = 'P0002';
  end if;
  if (person.urlaubsanspruch_verlauf -> 0 ->> 'jahr')::integer = p_jahr then
    raise exception 'Der erste Anspruch bleibt — er gilt für alle Jahre davor. Stattdessen berichtigen.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(v order by (v ->> 'jahr')::integer), '[]'::jsonb) into verlauf
    from jsonb_array_elements(person.urlaubsanspruch_verlauf) v where (v ->> 'jahr')::integer <> p_jahr;

  perform set_config('app.arbeitszeit_eigen', 'an', true);
  update public.users u set urlaubsanspruch_verlauf = verlauf where u.id = person.id;
  perform set_config('app.arbeitszeit_eigen', '', true);
  return verlauf;
end;
$$;

revoke all on function public.urlaubsanspruch_aenderung_entfernen(uuid, integer) from public, anon;
grant execute on function public.urlaubsanspruch_aenderung_entfernen(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Abwesenheiten zählen die Arbeitstage des jeweiligen Tages
-- ---------------------------------------------------------------------------

/*
  Wie `app.urlaubstage`, aber je Tag mit den Arbeitstagen, die an ihm gelten.
  Ohne Verlauf liefert es genau dieselben Tage.
*/
create or replace function app.urlaubstage_person(p_person public.users, p_von date, p_bis date)
  returns date[]
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(array_agg(s.t::date order by s.t), '{}')
    from generate_series(p_von, p_bis, interval '1 day') s(t)
    join app.arbeitszeit_abschnitte(p_person.arbeitszeit_verlauf, p_person.weekly_target_hours,
                                    p_person.work_days, p_person.tagessoll) a
      on (a.ab is null or s.t::date >= a.ab) and (a.bis is null or s.t::date < a.bis)
   where p_von is not null and p_bis is not null and p_bis >= p_von
     and app.ist_arbeitstag(a.arbeitstage, s.t::date)
$$;

revoke all on function app.urlaubstage_person(public.users, date, date) from public, anon, authenticated;

/* Das Tagessoll des Tages in Minuten — mit der Arbeitszeit, die an ihm gilt. */
create or replace function app.tagessoll_minuten(p_person public.users, p_tag date) returns numeric
  language sql
  stable
  set search_path = ''
as $$
  select 60 * app.tagessoll_stunden(a.wochenstunden, a.arbeitstage, a.tagessoll, p_tag)
    from app.arbeitszeit_am(p_person, p_tag) a
$$;

revoke all on function app.tagessoll_minuten(public.users, date) from public, anon, authenticated;

/* Die Wochenstunden an einem Tag (Pflegefreistellung: eine Woche). */
create or replace function app.wochenstunden_am(p_person public.users, p_tag date) returns numeric
  language sql
  stable
  set search_path = ''
as $$
  select a.wochenstunden from app.arbeitszeit_am(p_person, p_tag) a
$$;

revoke all on function app.wochenstunden_am(public.users, date) from public, anon, authenticated;

/*
  DIE FUNKTIONEN, DIE ABWESENHEITSTAGE SCHREIBEN, fragen dieselbe Stelle.
  Ersetzt wird je Funktion genau die Zeile, die die Arbeitstage der Zeile
  benutzte — der übrige Text bleibt Wort für Wort, wie er zuletzt eingespielt
  wurde. Fehlt die erwartete Zeile, bricht die Migration ab, statt still eine
  Stelle zu übergehen.
*/
do $migration$
declare
  ersetzen constant text[][] := array[
    ['public.urlaub_entscheiden(uuid,text,text,text)',
     'app.urlaubstage(arbeitstage, a.von, a.bis)',
     'app.urlaubstage_person((select u from public.users u where u.id = a.user_id), a.von, a.bis)'],
    ['app.betriebsurlaub_fuer_person(uuid,uuid,date)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, '],
    ['public.urlaub_eintragen(uuid,date,date,text,text)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, '],
    ['app.dezember_urlaub_nachziehen(text,boolean)',
     'app.urlaubstage(u.work_days, ', 'app.urlaubstage_person(u, '],
    ['public.freistellung_beantragen(text,text,date,date,date,time without time zone,time without time zone,boolean,boolean,text)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, '],
    ['public.freistellung_beantragen(text,text,date,date,date,time without time zone,time without time zone,boolean,boolean,text)',
     'coalesce(nullif(person.weekly_target_hours, 0), 40)', 'coalesce(nullif(app.wochenstunden_am(person, p_von), 0), 40)'],
    ['public.berufsschule_eintragen(uuid,date,date,text,integer,integer)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, '],
    ['public.arztbesuch_vorschlag(uuid)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, '],
    ['public.freistellung_entscheiden(uuid,text,text,boolean,jsonb,text,text,numeric,text,text)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, '],
    ['public.krankmeldung_speichern(uuid,uuid,date,date,text,text,boolean)',
     'app.urlaubstage(person.work_days, ', 'app.urlaubstage_person(person, ']
  ];
  i integer;
  quelle text;
  neu text;
begin
  for i in 1 .. array_length(ersetzen, 1) loop
    quelle := pg_get_functiondef(ersetzen[i][1]::regprocedure);
    if position(ersetzen[i][2] in quelle) = 0 then
      raise exception 'Erwartete Stelle in % nicht gefunden: %', ersetzen[i][1], ersetzen[i][2];
    end if;
    neu := replace(quelle, ersetzen[i][2], ersetzen[i][3]);
    execute neu;
  end loop;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Die Monatsbilanz mit dem Soll des Monats, der Saldo aus ihr (L1, L2)
-- ---------------------------------------------------------------------------

/*
  JE PERSON UND MONAT, gerechnet wie `calcOverallSaldo` in der App — die
  Prüfung `tests/supabase/zeitkontoSaldo.test.ts` vergleicht beide auf einem
  gewachsenen Bestand:

    Soll        jeder Arbeitstag ab dem Saldo-Start bis gestern (höchstens
                bis zum Austritt), ohne Feiertage, mit dem Tagessoll SEINES
                Abschnitts, am 24./31.12. halb, wo der Betrieb das so führt.
    Ist         gearbeitete Minuten ab dem Saldo-Start bis heute.
    Gutschrift  Krank, Urlaub, Berufsschule, ganztägige Freistellung mit dem
                Tagessoll des Tages (Schultag mit Arbeit danach weniger,
                `schultagGutschriftMin`), stundenweise Freistellung mit ihren
                Minuten — erst, wenn der Tag vorbei ist.
    Lücken      Arbeitstage bis gestern ohne jede Buchung.

  Gelesen wird, was `time_entries_lesen` erlaubt: die eigenen Zahlen, und
  Buchhaltung, Geschäftsführung und Administration alle.
*/
create or replace function app.zeitkonto_rechnung(p_personen uuid[], p_von date, p_bis date)
  returns table (user_id uuid, monat date, soll_min numeric, ist_min numeric, gutschrift_min numeric,
                 pflichttage numeric, ohne_buchung integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with heute as (select (now() at time zone 'Europe/Vienna')::date as d),
  personen as (
    select u.id, u.company_id, u.app_start_date, u.austritt,
           u.arbeitszeit_verlauf, u.weekly_target_hours, u.work_days, u.tagessoll,
           coalesce(c.dezember_halbtage, true) as halbe
      from public.users u
      join public.companies c on c.id = u.company_id
     where u.id = any(p_personen) and u.app_start_date is not null
  ),
  /*
    Je Abschnitt das Tagessoll aller sieben Wochentage, einmal gerechnet
    (`std[dow + 1]`, der 7.1.2024 ist ein Sonntag) — je Tag und Buchung eine
    Funktion zu rufen, die Postgres nicht einbetten kann, kostete das
    Zwanzigfache.
  */
  abschnitte as (
    select p.id as user_id, a.ab, a.bis,
           case when coalesce(cardinality(a.arbeitstage), 0) = 0 then array[1, 2, 3, 4, 5]::smallint[]
                else a.arbeitstage end as arbeitstage,
           array(select app.tagessoll_stunden(a.wochenstunden, a.arbeitstage, a.tagessoll, date '2024-01-07' + k)
                   from generate_series(0, 6) k order by k) as std
      from personen p,
           lateral app.arbeitszeit_abschnitte(p.arbeitszeit_verlauf, p.weekly_target_hours, p.work_days, p.tagessoll) a
  ),
  buchungen as (
    select e.user_id, e.company_id, e.date, e.status, e.start_time, e.end_time, e.unterricht_min, p.halbe,
           case
             when e.status <> 'Anwesend' then 0
             when e.start_time is null or e.end_time is null then
               case when e.hours is not null then greatest(0, round(e.hours * 60)::integer) else 0 end
             else greatest(0, (
               extract(epoch from (
                 ((case when e.end_time < e.start_time then e.date + 1 else e.date end) + e.end_time)
                   at time zone 'Europe/Vienna'
                 - (e.date + e.start_time) at time zone 'Europe/Vienna'
               )) / 60
             )::integer - coalesce(e.break_duration, 0))
           end as arbeit_min
      from public.time_entries e
      join personen p on p.id = e.user_id and p.company_id = e.company_id, heute h
     where e.date >= p.app_start_date and e.date <= h.d
       and e.date >= p_von and e.date <= p_bis
  ),
  ist as (
    select b.user_id, date_trunc('month', b.date)::date as monat, sum(b.arbeit_min) as ist_min
      from buchungen b
     where b.status = 'Anwesend'
     group by b.user_id, date_trunc('month', b.date)
  ),
  /*
    Gutschrift nur für die Buchungen, die keine Arbeit sind — erst, wenn ihr
    Tag vorbei ist. Die Arbeit des Schultags holt eine Unterabfrage über den
    Index, und nur für Schultage mit Unterrichtszeit.
  */
  gutschrift as (
    select b.user_id, date_trunc('month', b.date)::date as monat,
           sum(case
                 when b.status in ('Krank', 'Urlaub', 'Berufsschule', 'Unbezahlt')
                   or (b.status in ('Dienstverhinderung', 'Pflegefreistellung')
                       and (b.start_time is null or b.end_time is null)) then
                   case
                     when b.status = 'Berufsschule' and coalesce(b.unterricht_min, 0) > 0 then (
                       select case when x.arbeit > 0
                                   then greatest(least(b.unterricht_min, s.soll), s.soll - x.arbeit)
                                   else s.soll end
                         from (
                           select coalesce(sum(case
                                    when w.start_time is null or w.end_time is null then
                                      case when w.hours is not null then greatest(0, round(w.hours * 60)::integer) else 0 end
                                    else greatest(0, (
                                      extract(epoch from (
                                        ((case when w.end_time < w.start_time then w.date + 1 else w.date end) + w.end_time)
                                          at time zone 'Europe/Vienna'
                                        - (w.date + w.start_time) at time zone 'Europe/Vienna'
                                      )) / 60
                                    )::integer - coalesce(w.break_duration, 0))
                                  end), 0) as arbeit
                             from public.time_entries w
                            where w.company_id = b.company_id and w.user_id = b.user_id
                              and w.date = b.date and w.status = 'Anwesend'
                         ) x)
                     else s.soll
                   end
                 when b.status in ('Dienstverhinderung', 'Pflegefreistellung') and b.end_time > b.start_time then
                   extract(epoch from (b.end_time - b.start_time)) / 60
                 else 0
               end) as gutschrift_min
      from buchungen b
      join abschnitte a on a.user_id = b.user_id
                       and (a.ab is null or b.date >= a.ab) and (a.bis is null or b.date < a.bis)
      cross join lateral (
        select (case when b.halbe and to_char(b.date, 'MM-DD') in ('12-24', '12-31') then 0.5 else 1 end)
               * a.std[extract(dow from b.date)::integer + 1] * 60 as soll
      ) s,
      heute h
     where b.status <> 'Anwesend' and b.date < h.d
     group by b.user_id, date_trunc('month', b.date)
  ),
  gebucht as (
    select distinct b.user_id, b.date from buchungen b
  ),
  feiertage as (
    select f.tag from heute h,
           app.feiertage((select min(p.app_start_date) from personen p), h.d) f
  ),
  tage as (
    select p.id as user_id, p.halbe, g.tag::date as tag
      from personen p, heute h,
           generate_series(greatest(p.app_start_date, p_von),
                           least(h.d - 1, p_bis, coalesce(p.austritt, h.d - 1)),
                           interval '1 day') g(tag)
  ),
  soll as (
    select t.user_id, date_trunc('month', t.tag)::date as monat,
           sum((case when t.halbe and to_char(t.tag, 'MM-DD') in ('12-24', '12-31') then 0.5 else 1 end)
               * a.std[extract(dow from t.tag)::integer + 1] * 60) as soll_min,
           sum(case when t.halbe and to_char(t.tag, 'MM-DD') in ('12-24', '12-31') then 0.5 else 1 end) as pflichttage,
           count(*) filter (where g.date is null)::integer as ohne_buchung
      from tage t
      join abschnitte a on a.user_id = t.user_id
                       and (a.ab is null or t.tag >= a.ab) and (a.bis is null or t.tag < a.bis)
      left join gebucht g on g.user_id = t.user_id and g.date = t.tag
      left join feiertage f on f.tag = t.tag
     where f.tag is null
       and extract(dow from t.tag)::smallint = any(a.arbeitstage)
     group by t.user_id, date_trunc('month', t.tag)
  ),
  monate as (
    select x.user_id, x.monat from soll x
    union select x.user_id, x.monat from ist x
    union select x.user_id, x.monat from gutschrift x
  )
  select m.user_id, m.monat,
         coalesce(s.soll_min, 0), coalesce(i.ist_min, 0), coalesce(g.gutschrift_min, 0),
         coalesce(s.pflichttage, 0), coalesce(s.ohne_buchung, 0)
    from monate m
    left join soll s on s.user_id = m.user_id and s.monat = m.monat
    left join ist i on i.user_id = m.user_id and i.monat = m.monat
    left join gutschrift g on g.user_id = m.user_id and g.monat = m.monat
$$;

revoke all on function app.zeitkonto_rechnung(uuid[], date, date) from public, anon, authenticated;

/* Wessen Zeitkonto der Aufrufer lesen darf — wie `time_entries_lesen`. */
create or replace function app.zeitkonto_lesbar(p_user uuid) returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(u.id), '{}')
    from public.users u
   where u.company_id = (select app.lesebetrieb())
     and (p_user is null or u.id = p_user)
     and (u.id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
$$;

revoke all on function app.zeitkonto_lesbar(uuid) from public, anon, authenticated;

/*
  DIE MONATSBILANZEN MIT DEM SOLL DES MONATS — je Person und Monat zwischen
  `p_von` und `p_bis` (erste Tage der Monate).
*/
create or replace function public.zeitkonto_monate(p_von date, p_bis date, p_user uuid default null)
  returns table (user_id uuid, monat text, soll_min numeric, ist_min numeric, gutschrift_min numeric,
                 saldo_min numeric, pflichttage numeric, ohne_buchung integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.user_id, to_char(r.monat, 'YYYY-MM'), round(r.soll_min, 2), round(r.ist_min, 2),
         round(r.gutschrift_min, 2), round(r.ist_min + r.gutschrift_min - r.soll_min, 2),
         r.pflichttage, r.ohne_buchung
    from app.zeitkonto_rechnung(app.zeitkonto_lesbar(p_user), date_trunc('month', p_von)::date,
                                (date_trunc('month', p_bis) + interval '1 month - 1 day')::date) r
   order by r.user_id, r.monat
$$;

revoke all on function public.zeitkonto_monate(date, date, uuid) from public, anon;
grant execute on function public.zeitkonto_monate(date, date, uuid) to authenticated;

/*
  DER SALDO JE PERSON — dieselbe Zahl wie `calcOverallSaldo`, eine Zeile je
  Person statt aller Buchungen (L1) und für alle in einer Anfrage (L2).
  Ohne Zeitkonto (Geschäftsführung ohne Konto, Leitung) 0 ohne Aussage, ohne
  Saldo-Start der Anfangsstand ohne Aussage — wie in der App.
*/
create or replace function public.zeitkonto_salden(p_user uuid default null)
  returns table (user_id uuid, saldo_h numeric, tage_ohne_buchung integer, hat_konfig boolean)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with lesbar as (select app.zeitkonto_lesbar(p_user) as ids),
  personen as (
    select u.id, u.role, u.fuehrt_zeitkonto, u.app_start_date,
           coalesce(za.initial_overtime, 0) as anfang,
           (u.role in ('Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter')
            or (u.role = 'Geschäftsführung' and u.fuehrt_zeitkonto)) as konto
      from public.users u
      left join public.zeitkonto_anfang za on za.user_id = u.id, lesbar l
     where u.id = any(l.ids)
  ),
  summen as (
    select r.user_id, sum(r.ist_min + r.gutschrift_min - r.soll_min) as diff, sum(r.ohne_buchung)::integer as luecken
      from app.zeitkonto_rechnung(
             array(select p.id from personen p where p.konto and p.app_start_date is not null),
             '0001-01-01'::date, '9999-12-31'::date) r
     group by r.user_id
  )
  select p.id,
         case when not p.konto then 0
              when p.app_start_date is null then p.anfang
              -- Wie `Math.round` in der App: halbe Hundertstel nach oben, auch im Minus.
              else floor((p.anfang + coalesce(s.diff, 0) / 60) * 100 + 0.5) / 100 end,
         case when p.konto and p.app_start_date is not null then coalesce(s.luecken, 0) else 0 end,
         p.konto and p.app_start_date is not null
    from personen p
    left join summen s on s.user_id = p.id
   order by p.id
$$;

revoke all on function public.zeitkonto_salden(uuid) from public, anon;
grant execute on function public.zeitkonto_salden(uuid) to authenticated;
