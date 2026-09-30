-- TESTBERICHT 30.09.2026, PAKET 7d — LEHRLINGE (4.1, Punkte 1–4).
--
--   1  Einstufung an der Person: Facharbeiter, Obermonteur, Helfer, Lehrling;
--      beim Lehrling Lehrbeginn und Lehrzeit, das Lehrjahr ergibt sich daraus.
--   2  Verrechnungs- und Kostensatz je Stufe bzw. Lehrjahr, ohne feste Vorgabe.
--   3  Die Buchung übernimmt den Satz aus der Einstufung; der Helfer-Haken
--      bleibt für Ausnahmen.
--   4  Status „Berufsschule“: erfüllt das Tagessoll, nicht verrechenbar, als
--      Zeitraum eintragbar (Blocklehrgang), im Wochenplan „abwesend“.
--
-- Die Schutzregeln für Jugendliche (KJBG) kommen erst nach der Klärung mit
-- der WKO.

-- ---------------------------------------------------------------------------
-- 1. Einstufung an der Person
-- ---------------------------------------------------------------------------

/*
  KEINE NEUE ROLLE. Die Rolle regelt, was jemand sehen und tun darf, und darin
  unterscheidet sich ein Lehrling nicht vom Monteur. Was sich unterscheidet,
  ist der Satz — und den trägt die Einstufung. Ohne Angabe zählt die Person
  wie ein Facharbeiter, also genau wie bisher.

  Lehrzeit in Monaten, zwei bis vier Jahre: 3½ Jahre sind 42 Monate, und eine
  Doppellehre dauert vier. Lehrbeginn und Lehrzeit stehen nur beim Lehrling —
  sonst lebten sie nach einem Wechsel unsichtbar weiter.
*/
alter table public.users
  add column if not exists einstufung text,
  add column if not exists lehrbeginn date,
  add column if not exists lehrzeit_monate smallint;

alter table public.users drop constraint if exists users_einstufung_wert;
alter table public.users add constraint users_einstufung_wert
  check (einstufung is null or einstufung in ('facharbeiter', 'obermonteur', 'helfer', 'lehrling'));

alter table public.users drop constraint if exists users_lehre_vollstaendig;
alter table public.users add constraint users_lehre_vollstaendig
  check ((einstufung = 'lehrling' and lehrbeginn is not null and lehrzeit_monate between 24 and 48)
      or (einstufung is distinct from 'lehrling' and lehrbeginn is null and lehrzeit_monate is null));

/*
  Das Lehrjahr an einem Tag: im ersten Jahr ab Lehrbeginn das 1., je volles
  Jahr eins mehr, höchstens das letzte der Lehrzeit (und nie mehr als das 4.).
  Vor dem Lehrbeginn das 1. — ein Schnuppertag ist kein 0. Lehrjahr.
  Dieselbe Rechnung steht in `src/lib/einstufung.ts` (`lehrjahr`).
*/
create or replace function app.lehrjahr(p_beginn date, p_monate integer, p_tag date)
  returns integer
  language sql
  immutable
  set search_path = ''
as $$
  select least(
           greatest(1, least(4, ceil(p_monate / 12.0)::integer)),
           case when p_tag < p_beginn then 1
                else extract(year from age(p_tag, p_beginn))::integer + 1 end)
$$;

/* Der Satz einer Person an einem Tag — wie `satzklasseAm` in der App. */
create or replace function app.satzklasse_am(p_user uuid, p_tag date)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case u.einstufung
           when 'obermonteur' then 'obermonteur'
           when 'helfer' then 'helfer'
           when 'lehrling' then 'lj' || app.lehrjahr(u.lehrbeginn, u.lehrzeit_monate, p_tag)
           else 'facharbeiter'
         end
    from public.users u
   where u.id = p_user
$$;

revoke all on function app.satzklasse_am(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Der Satz an der Buchung
-- ---------------------------------------------------------------------------

/*
  WAS VORHER GALT: die Stunden eines Lehrlings gingen zum Facharbeitersatz
  auf die Rechnung, ausser jemand hakte bei JEDER Buchung „als Helfer“ an.

  JETZT setzt die Datenbank den Satz aus der Einstufung am Tag der Buchung —
  nicht die Maske, damit ihn niemand vergisst und niemand anders wählt. Der
  Helfer-Haken bleibt und geht vor (etwa ein Facharbeiter, der zuarbeitet).

  SOLANGE NICHT VERRECHNET, FOLGT DER SATZ DER EINSTUFUNG: wird die
  Einstufung erst nach den ersten Buchungen gesetzt, ziehen die offenen
  Buchungen nach (`users_satz_nachziehen`). Eine verrechnete Buchung behält
  ihren Satz — die Rechnung und ihre Nachkalkulation bleiben, wie sie waren.

  Bestehende Buchungen bleiben leer: leer heisst Facharbeiter, und bis heute
  hatte niemand eine Einstufung. Der Rücklauf (Dienstschlüssel) bringt seinen
  Satz mit.
*/
alter table public.time_entries add column if not exists satz text;

alter table public.time_entries drop constraint if exists time_entries_satz_wert;
alter table public.time_entries add constraint time_entries_satz_wert
  check (satz is null or satz in ('facharbeiter', 'obermonteur', 'helfer', 'lj1', 'lj2', 'lj3', 'lj4'));

create or replace function app.satz_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_billed then
    new.satz := old.satz;
    return new;
  end if;
  if app.ist_dienst() and new.satz is not null
     and (tg_op = 'INSERT' or new.satz is distinct from old.satz) then
    return new;
  end if;
  new.satz := app.satzklasse_am(new.user_id, new.date);
  return new;
end;
$$;

revoke all on function app.satz_setzen() from public, anon, authenticated;

drop trigger if exists time_entries_satz on public.time_entries;
create trigger time_entries_satz
  before insert or update on public.time_entries
  for each row execute function app.satz_setzen();

/*
  Die offenen Buchungen ziehen nach, wenn sich Einstufung, Lehrbeginn oder
  Lehrzeit ändern. Nur Arbeitszeit — ein Krank- oder Urlaubstag hat keinen
  Satz, und ihre Wächter sollen dabei nicht anschlagen. Den neuen Wert setzt
  der Auslöser oben.
*/
create or replace function app.satz_nachziehen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.time_entries t
     set satz = null
   where t.company_id = new.company_id
     and t.user_id = new.id
     and t.status = 'Anwesend'
     and not coalesce(t.is_billed, false);
  return null;
end;
$$;

revoke all on function app.satz_nachziehen() from public, anon, authenticated;

drop trigger if exists users_satz_nachziehen on public.users;
create trigger users_satz_nachziehen
  after update of einstufung, lehrbeginn, lehrzeit_monate on public.users
  for each row
  when (old.einstufung is distinct from new.einstufung
        or old.lehrbeginn is distinct from new.lehrbeginn
        or old.lehrzeit_monate is distinct from new.lehrzeit_monate)
  execute function app.satz_nachziehen();

-- ---------------------------------------------------------------------------
-- 2. Sätze je Stufe
-- ---------------------------------------------------------------------------

/*
  OHNE FESTE VORGABE. Viele Betriebe verrechnen das 1. und 2. Lehrjahr gar
  nicht oder zum Helfersatz, das 3. und 4. zum Helfersatz — deshalb je Stufe
  einstellbar. Ein fehlender Wert heisst beim Obermonteur Facharbeiter-, beim
  Lehrling Helfersatz; eine 0 heisst „nicht verrechnet“.

  Verrechnungssätze unter `companies.rates -> 'stufen'`, Kostensätze in
  `betrieb_kostensaetze.stufen` (nur die Spitze liest sie, wie die übrigen).
*/
create or replace function app.stufen_gueltig(s jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select s is null
      or jsonb_typeof(s) = 'null'
      or (jsonb_typeof(s) = 'object'
          and not exists (
            select 1 from jsonb_each(s) e
             where e.key not in ('obermonteur', 'lj1', 'lj2', 'lj3', 'lj4')
                or jsonb_typeof(e.value) not in ('number', 'null')
                or (jsonb_typeof(e.value) = 'number'
                    and ((e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric > 10000))))
$$;

alter table public.companies drop constraint if exists companies_stufensaetze;
alter table public.companies add constraint companies_stufensaetze
  check (app.stufen_gueltig(rates -> 'stufen'));

alter table public.betrieb_kostensaetze add column if not exists stufen jsonb;
alter table public.betrieb_kostensaetze drop constraint if exists betrieb_kostensaetze_stufen;
alter table public.betrieb_kostensaetze add constraint betrieb_kostensaetze_stufen
  check (app.stufen_gueltig(stufen));

/*
  Der Einlass nimmt die Stufen mit. Schickt eine ältere Fassung der App nur
  Facharbeiter und Helfer, bleiben die Stufen stehen — ein fehlender Schlüssel
  ist keine Anweisung zum Leeren.
*/
create or replace function app.kostensaetze_einlass() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.cost_rates is null then
    return new;
  end if;
  insert into public.betrieb_kostensaetze (company_id, fach, helper, stufen)
  values (new.id, (new.cost_rates ->> 'fach')::numeric, (new.cost_rates ->> 'helper')::numeric,
          new.cost_rates -> 'stufen')
  on conflict (company_id) do update
    set fach = excluded.fach,
        helper = excluded.helper,
        stufen = case when new.cost_rates ? 'stufen' then excluded.stufen
                      else public.betrieb_kostensaetze.stufen end;
  new.cost_rates := null;
  return new;
end;
$$;

revoke all on function app.kostensaetze_einlass() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Berufsschule
-- ---------------------------------------------------------------------------

alter table public.time_entries drop constraint if exists time_entries_status_check;
alter table public.time_entries add constraint time_entries_status_check
  check (status in ('Anwesend', 'Krank', 'Urlaub', 'Zeitausgleich', 'Berufsschule'));

/*
  BERUFSSCHULE NUR ÜBER `berufsschule_eintragen` — wie Krank nur über die
  Krankmeldung. Die Funktion prüft, dass die Person Lehrling ist, wie weit
  sie selbst zurück eintragen darf, und legt einen Zeitraum (Blocklehrgang)
  in einem Zug an. Ein Berufsschultag wird nicht umgebaut, sondern gelöscht
  und neu eingetragen; das Löschen geht den gewohnten Weg.

  `current_user` statt der Rolle im Token, aus demselben Grund wie bei der
  Krankmeldung: in der Funktion steht im Token weiterhin „authenticated“.
*/
create or replace function app.berufsschule_nur_ueber_eintrag() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'Berufsschule' then
    raise exception 'Ein Berufsschultag wird nicht geändert — bitte löschen und neu eintragen'
      using errcode = '42501';
  end if;
  if new.status = 'Berufsschule' then
    raise exception 'Berufsschule wird über „Berufsschule eintragen“ erfasst'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.berufsschule_nur_ueber_eintrag() from public, anon, authenticated;

drop trigger if exists time_entries_berufsschule_nur_ueber_eintrag on public.time_entries;
create trigger time_entries_berufsschule_nur_ueber_eintrag
  before insert or update on public.time_entries
  for each row execute function app.berufsschule_nur_ueber_eintrag();

/*
  EINTRAGEN, AUCH ALS ZEITRAUM. Die Arbeitstage der Person im Zeitraum
  (ohne Feiertage) werden „Berufsschule“; ein Tag, an dem schon etwas steht,
  bleibt, wie er ist, und wird gezählt.

  Selbst trägt der Lehrling höchstens 14 Tage zurück ein, wie bei der
  Krankmeldung — sonst liessen sich beliebige Tage als Solltage gutschreiben.
  Weiter zurück und für andere trägt das Büro ein.
*/
create or replace function public.berufsschule_eintragen(
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  person public.users;
  tage date[];
  angelegt integer := 0;
  grenze date := (now() at time zone 'Europe/Vienna')::date - 14;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;

  select * into person from public.users
   where id = coalesce(p_user, wer) and company_id = betrieb;
  if person.id is null then
    raise exception 'Diesen Mitarbeiter gibt es nicht' using errcode = 'P0002';
  end if;
  if person.id <> wer and not app.ist_buch_oder_spitze() then
    raise exception 'Berufsschule für jemand anderen trägt das Büro ein'
      using errcode = '42501';
  end if;
  if person.einstufung is distinct from 'lehrling' then
    raise exception 'Berufsschule gibt es nur bei Lehrlingen — die Einstufung steht in der Benutzerakte'
      using errcode = '22023';
  end if;
  if not app.ist_buch_oder_spitze() and p_von < grenze then
    raise exception 'Selbst eintragen geht bis 14 Tage zurück (ab %). Was davor liegt, trägt das Büro ein.',
      to_char(grenze, 'DD.MM.YYYY')
      using errcode = '42501';
  end if;

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  if coalesce(array_length(tage, 1), 0) = 0 then
    raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
  end if;
  if array_length(tage, 1) > 120 then
    raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
  end if;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, comment)
  select gen_random_uuid(), betrieb, person.id, t, 'Berufsschule', 0, person.name,
         coalesce(nullif(btrim(coalesce(p_notiz, '')), ''), 'Berufsschule')
    from unnest(tage) t
   where not exists (
     select 1 from public.time_entries e
      where e.company_id = betrieb and e.user_id = person.id and e.date = t);
  get diagnostics angelegt = row_count;

  return jsonb_build_object(
    'tage', array_length(tage, 1),
    'angelegt', angelegt,
    'uebersprungen', array_length(tage, 1) - angelegt);
end;
$$;

revoke all on function public.berufsschule_eintragen(uuid, date, date, text) from public, anon;
grant execute on function public.berufsschule_eintragen(uuid, date, date, text) to authenticated;

-- Ganztägig wie Krank und Urlaub: daneben steht an diesem Tag nichts.
create or replace function app.ganzer_tag_allein() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ganztags boolean;
  anderer text;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.date is not distinct from old.date
     and new.status is not distinct from old.status
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time then
    return new;
  end if;

  ganztags := new.status in ('Krank', 'Urlaub', 'Berufsschule')
    or (new.status = 'Zeitausgleich' and (new.start_time is null or new.end_time is null));

  if ganztags then
    -- Ganztägig: daneben steht an diesem Tag gar nichts.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
     limit 1;
    if found then
      raise exception 'Für den % sind schon Einträge („%") gebucht. „%" gilt für den ganzen Tag — dafür müssen sie zuerst weg.',
        to_char(new.date, 'DD.MM.YYYY'), anderer, new.status
        using errcode = '23P01';
    end if;
  elsif new.status = 'Anwesend' then
    -- Arbeit: nicht an einem Tag, der schon ganz belegt ist.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
       and (t.status in ('Krank', 'Urlaub', 'Berufsschule')
            or (t.status = 'Zeitausgleich' and (t.start_time is null or t.end_time is null)))
     limit 1;
    if found then
      raise exception 'Für den % ist schon „%" eingetragen. Das gilt für den ganzen Tag — daneben lässt sich keine Arbeitszeit buchen.',
        to_char(new.date, 'DD.MM.YYYY'), anderer
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

-- Ein stundenweiser Zeitausgleich überspringt einen Berufsschultag wie einen Krank- oder Urlaubstag.
create or replace function public.urlaub_entscheiden(
  p_antrag uuid,
  p_entscheidung text,
  p_grund text default '',
  p_entscheider_name text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  a public.vacations;
  arbeitstage smallint[];
  tage date[];
  offen date[];
  entfernt integer := 0;
  begruendung text := btrim(coalesce(p_grund, ''));
  tagesstatus text;
begin
  if betrieb is null or wer is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_entscheidung not in ('Genehmigt', 'Abgelehnt', 'Storniert') then
    raise exception 'Unbekannte Entscheidung: %', p_entscheidung using errcode = '22023';
  end if;
  if p_entscheidung in ('Abgelehnt', 'Storniert') and length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if not app.darf_urlaub_entscheiden(betrieb) then
    raise exception 'Keine Berechtigung, Urlaub zu entscheiden' using errcode = '42501';
  end if;

  select * into a from public.vacations where id = p_antrag;
  if a.id is null or a.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;

  if p_entscheidung = 'Storniert' then
    if a.status <> 'Genehmigt' then
      raise exception 'Nur ein genehmigter Urlaub wird zurückgenommen'
        using errcode = '55000';
    end if;
    delete from public.time_entries
     where company_id = betrieb and vacation_id = p_antrag;
    get diagnostics entfernt = row_count;
  elsif a.status <> 'Beantragt' then
    raise exception 'Über den Antrag ist bereits entschieden' using errcode = '55000';
  end if;

  if p_entscheidung = 'Genehmigt' then
    if a.user_id is null or a.von is null or a.bis is null then
      raise exception 'Dem Antrag fehlen Zeitraum oder Antragsteller' using errcode = '55000';
    end if;

    select u.work_days into arbeitstage from public.users u where u.id = a.user_id;
    tage := app.urlaubstage(arbeitstage, a.von, a.bis);

    if coalesce(array_length(tage, 1), 0) = 0 then
      raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
    end if;
    if array_length(tage, 1) > 480 then
      raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
    end if;

    tagesstatus := case when a.art = 'Zeitausgleich' then 'Zeitausgleich' else 'Urlaub' end;

    if a.za_von is not null then
      -- Stundenweise: frei ist der Tag, solange nichts Ganztägiges und kein
      -- zweiter ZA darauf steht. Gearbeitete Zeit daneben ist der Normalfall.
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = a.user_id and e.date = t
            and (e.status in ('Krank', 'Urlaub', 'Zeitausgleich', 'Berufsschule')));
    else
      /*
        Bereits gebuchte Tage UEBERSPRINGEN, nicht ueberschreiben. Eine
        erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
        wegwerfen — und niemand wuerde es merken.
      */
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = a.user_id and e.date = t);
    end if;

    /*
      NICHTS MEHR FREI, NICHTS ZU GENEHMIGEN. Bisher ging die Genehmigung
      dann durch und buchte null Tage — der Antrag zählte trotzdem als
      genommener Urlaub.
    */
    if a.art = 'Urlaub' and coalesce(array_length(offen, 1), 0) = 0 then
      raise exception 'Im Zeitraum ist jeder Arbeitstag schon gebucht — es gibt nichts zu genehmigen'
        using errcode = '55000';
    end if;

    insert into public.time_entries (
      id, company_id, user_id, date, status, start_time, end_time, break_duration,
      user_name, vacation_id, comment
    )
    select gen_random_uuid(), betrieb, a.user_id, t, tagesstatus, a.za_von, a.za_bis, 0,
           coalesce(a.user_name, 'Mitarbeiter'), p_antrag,
           case when tagesstatus = 'Zeitausgleich' then 'Genehmigter Zeitausgleich'
                else 'Genehmigter Urlaub' end
      from unnest(offen) t;
  end if;

  update public.vacations
     set status = p_entscheidung,
         entschieden_von_uid = wer,
         entschieden_von_name = coalesce(p_entscheider_name, 'Leitung'),
         entschieden_am = now(),
         grund = case when begruendung = '' then public.vacations.grund else begruendung end,
         -- Genehmigt zählen die GEBUCHTEN Tage, nicht die beantragten: ein
         -- übersprungener Tag ist kein Urlaubstag, und der Resturlaub darf
         -- auf der Urlaubsseite nicht anders aussehen als im Zeitkonto.
         -- Der 24./31.12. zählt je einen halben Tag (`app.tagesanteil`).
         tage = case when p_entscheidung = 'Genehmigt' and a.art = 'Urlaub'
                     then (select sum(app.tagesanteil(betrieb, t)) from unnest(offen) t)
                     else public.vacations.tage end
   where id = p_antrag;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt);
end;
$$;

revoke all on function public.urlaub_entscheiden(uuid, text, text, text) from public;
grant execute on function public.urlaub_entscheiden(uuid, text, text, text) to authenticated;

/*
  DIE MONATSSICHT zählt die Berufsschultage; sie erfüllen das Tagessoll wie
  Krank- und Urlaubstage (auch der halbe Tag am 24./31.12.). Die Spalte kommt
  hinten dazu — eine Sicht lässt sich nur so erweitern.
*/
create or replace view public.monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                           t.break_duration, t.hours, t.date))   as anwesend_min,
    count(*) filter (where t.status = 'Krank')                   as krank_tage,
    count(*) filter (where t.status = 'Urlaub')                  as urlaub_tage,
    array_agg(distinct to_char(t.date, 'YYYY-MM-DD') order by to_char(t.date, 'YYYY-MM-DD'))
                                                                 as tage,
    count(*) filter (where t.status in ('Krank', 'Urlaub', 'Berufsschule')
                       and to_char(t.date, 'MM-DD') in ('12-24', '12-31'))
                                                                 as abwesend_halbtage,
    count(*) filter (where t.status = 'Berufsschule')            as berufsschule_tage
    from public.time_entries t
   group by t.company_id, t.user_id, to_char(t.date, 'YYYY-MM');

alter view public.monthly_stats set (security_invoker = on);

-- Im Wochenplan „abwesend“, für die Leitung „Berufsschule“.
create or replace function public.wochenplan_abwesend(p_von date, p_bis date)
  returns table (user_id uuid, von date, bis date, grund text, zeiten text)
  language sql stable
  security definer
  set search_path = ''
as $$
  with erlaubt as (
    select exists (
             select 1 from public.companies c
              where c.id = app.betrieb()
                and (c.wochenplan_fuer_alle or app.ist_fuehrung() or app.ist_buch_oder_spitze()))
           and app.betriebsmitglied(app.betrieb()) as ok,
           (app.ist_fuehrung() or app.ist_buch_oder_spitze()) as leitung,
           app.ist_buch_oder_spitze() as buero
  )
  select v.user_id, greatest(v.von, p_von), least(v.bis, p_bis),
         case when e.leitung then
           case when v.art = 'Zeitausgleich' then 'ZA' else 'Urlaub' end
         end,
         case when v.za_von is not null then
           to_char(v.za_von, 'HH24:MI') || '–' || to_char(v.za_bis, 'HH24:MI')
         end
    from public.vacations v, erlaubt e
   where e.ok
     and v.company_id = app.betrieb()
     and v.status = 'Genehmigt'
     and v.bis >= p_von and v.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  select k.user_id, greatest(k.von, p_von), least(k.bis, p_bis),
         case when e.buero then 'Krank' end,
         null::text
    from public.krankmeldungen k, erlaubt e
   where e.ok
     and k.company_id = app.betrieb()
     and k.bis >= p_von and k.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  -- Berufsschule (4.1): je Tag, wie sie gebucht ist. Die Leitung sieht den
  -- Grund, alle anderen „abwesend“ — wie beim Urlaub.
  select t.user_id, t.date, t.date,
         case when e.leitung then 'Berufsschule' end,
         null::text
    from public.time_entries t, erlaubt e
   where e.ok
     and t.company_id = app.betrieb()
     and t.status = 'Berufsschule'
     and t.date between p_von and p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated;
