-- ===========================================================================
-- JUGENDSCHUTZ IN DER ZEITERFASSUNG (Testbericht Runde 3, M1 und M2)
-- ===========================================================================
--
-- M2: „Der Lehrling selbst ... kann die vom Büro gebuchte Zeit bearbeiten
-- oder löschen.“ Eine Zeit, die das Büro für einen Jugendlichen über der
-- Grenze gebucht hat, ist der Nachweis, dass der Betrieb davon weiss. Löscht
-- der Lehrling sie, ist der Verstoss aus der Prüfung verschwunden, nicht aus
-- der Welt. Deshalb ändert oder löscht eine solche Buchung nur das Büro.
--
-- M1: Der Berufsschultag zählte in der Prüfung mit dem Tagessoll. Jetzt
-- lässt sich beim Eintragen die Unterrichtszeit je Schultag angeben; leer
-- bleibt es beim Tagessoll. Die Regel selbst wartet auf die WKO-Klärung.
--
-- WAS DIE DATENBANK PRÜFT (und was nicht, benannt):
--   - Gesperrt wird nur, was (a) das Büro angelegt hat, (b) einer Person
--     unter 18 gehört — Geburtsdatum aus `geburtsdaten` — und (c) am Tag
--     mehr als 8 Std. ergibt (Summe aller Arbeitszeiten des Tages) oder in
--     die Nachtruhe von 20 bis 6 Uhr fällt.
--   - NICHT hier: Ruhezeit, Wochenarbeitszeit und Wochenfreizeit. Sie hängen
--     an Nachbartagen und an der Woche; die Prüfung dafür steht in der App
--     (`src/features/accounting/arbeitszeitGrenzen.ts`) und warnt vor dem
--     Speichern. Ohne Geburtsdatum ist niemand jugendlich — auch hier nicht.
--   - Die Ausnahme bis 9 Std. bei anderer Verteilung der Wochenarbeitszeit
--     (§ 11 Abs 2 KJBG) kennt diese Sperre nicht: sie schützt eine Buchung,
--     sie beurteilt sie nicht. Eine Buchung über 8 Std. bleibt beim Büro.

-- ---------------------------------------------------------------------------
-- 1. Wer eine Buchung angelegt hat
-- ---------------------------------------------------------------------------

alter table public.time_entries add column if not exists angelegt_von uuid;

comment on column public.time_entries.angelegt_von is
  'Wer die Buchung angelegt hat — gesetzt von der Datenbank, nie vom Browser (Runde 3, M2). Leer bei älteren Buchungen, deren Anleger sich nicht eindeutig ableiten liess.';

/*
  AUS DEM TOKEN, NICHT AUS DEM BROWSER. `last_edited_by_uid` schreibt die App
  selbst, und nach jeder Korrektur steht dort jemand anderes; zur Frage „wer
  hat das gebucht?“ taugt es nicht. Beim Ändern bleibt der Anleger, wer er
  war. Der Dienstschlüssel (Rücklauf aus der Sicherung) bringt mit, was war.
*/
create or replace function app.angelegt_von_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.angelegt_von := coalesce(auth.uid(), new.angelegt_von);
  else
    new.angelegt_von := old.angelegt_von;
  end if;
  return new;
end;
$$;

revoke all on function app.angelegt_von_setzen() from public, anon, authenticated;

drop trigger if exists time_entries_angelegt_von on public.time_entries;
create trigger time_entries_angelegt_von
  before insert or update on public.time_entries
  for each row execute function app.angelegt_von_setzen();

/*
  DER BESTAND — nur, wo der Anleger eindeutig ist: das Büro hat für jemand
  anderen gebucht (`last_edited_by_uid` ist nicht der Eigentümer), und seither
  hat niemand die Buchung geändert (`updated_at` = `created_at`). Eine später
  korrigierte Buchung kann ebenso gut der Lehrling selbst angelegt haben; sie
  bleibt leer und damit ungesperrt.

  OHNE AUSLÖSER: die Prüfungen an `time_entries` rechneten sonst Stunden,
  Satz und Nachtkennzeichen neu und verschöben `updated_at`. Hier ändert sich
  nur, wer angelegt hat. Als Funktion, damit `tests/supabase/jugendschutz.test.ts`
  genau diesen Weg mit bestehenden Zeilen nachstellt.
*/
create or replace function app.angelegt_von_nachtragen() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  n integer;
begin
  alter table public.time_entries disable trigger user;
  update public.time_entries t
     set angelegt_von = t.last_edited_by_uid
   where t.angelegt_von is null
     and t.last_edited_by_uid is not null
     and t.last_edited_by_uid <> t.user_id
     and t.created_at = t.updated_at;
  get diagnostics n = row_count;
  alter table public.time_entries enable trigger user;
  return n;
end;
$$;

revoke all on function app.angelegt_von_nachtragen() from public, anon, authenticated;

select app.angelegt_von_nachtragen();

-- ---------------------------------------------------------------------------
-- 2. Vom Büro gebucht, über der Grenze: nur das Büro ändert oder löscht
-- ---------------------------------------------------------------------------

/*
  Ist diese Buchung für ihren Eigentümer gesperrt — und warum? `tag`,
  `nacht` oder leer. Antwortet nur dem Eigentümer selbst und nie dem Büro:
  wer fragt, erfährt nichts über die Tage anderer.

  Unter 18 heisst: vor dem 18. Geburtstag, genau wie `istJugendlich` in der
  App (wer am 29. Februar geboren ist, wird dort am 1. März volljährig;
  deshalb `- 1 … + 1`).
*/
create or replace function app.jugendschutz_gesperrt(p_id uuid) returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  z public.time_entries;
  geboren date;
  tag_min integer;
begin
  select * into z from public.time_entries t where t.id = p_id;
  if z.id is null
     or z.user_id is distinct from auth.uid()
     or app.ist_buch_oder_spitze()
     or z.angelegt_von is null
     or z.angelegt_von = z.user_id
     or z.status <> 'Anwesend' then
    return null;
  end if;

  select g.geburtsdatum into geboren
    from public.geburtsdaten g
   where g.user_id = z.user_id and g.company_id = z.company_id;
  if geboren is null or z.date >= ((geboren - 1) + interval '18 years')::date + 1 then
    return null;
  end if;

  select coalesce(sum(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                                         t.break_duration, t.hours, t.date)), 0)
    into tag_min
    from public.time_entries t
   where t.company_id = z.company_id
     and t.user_id = z.user_id
     and t.date = z.date
     and t.status = 'Anwesend';
  if tag_min > 8 * 60 then
    return 'tag';
  end if;
  if app.nacht_minuten(z.start_time, z.end_time, '20:00', '06:00') > 0 then
    return 'nacht';
  end if;
  return null;
end;
$$;

revoke all on function app.jugendschutz_gesperrt(uuid) from public, anon;
-- Der Wächter unten läuft mit den Rechten des Lehrlings und ruft sie.
grant execute on function app.jugendschutz_gesperrt(uuid) to authenticated;

/*
  DER WÄCHTER LÄUFT MIT DEN RECHTEN DESSEN, DER ÄNDERT — bewusst nicht
  `security definer`. Nur so sagt `current_user`, ob jemand selbst über die
  Schnittstelle ändert („authenticated“) oder eine Funktion des Betriebs es
  tut (dann steht dort ihr Eigentümer). Funktionen wie das Umbenennen einer
  Baustelle ziehen Buchungen nach; die soll der Wächter nicht aufhalten.
  Gelesen wird über `app.jugendschutz_gesperrt`, die selbst nur dem
  Eigentümer antwortet. Wie `app.berufsschule_nur_ueber_eintrag`.
*/
create or replace function app.jugendschutz_buerobuchung() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  grund text;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  grund := app.jugendschutz_gesperrt(old.id);
  if grund = 'tag' then
    raise exception 'Diese Zeit hat das Büro gebucht, und der Tag liegt über der Grenze für Jugendliche (mehr als 8 Std.). Ändern oder löschen kann sie nur das Büro.'
      using errcode = '42501';
  elsif grund = 'nacht' then
    raise exception 'Diese Zeit hat das Büro gebucht, und sie liegt in der Nachtruhe für Jugendliche (20 bis 6 Uhr). Ändern oder löschen kann sie nur das Büro.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function app.jugendschutz_buerobuchung() from public, anon, authenticated;

drop trigger if exists time_entries_jugendschutz on public.time_entries;
create trigger time_entries_jugendschutz
  before update or delete on public.time_entries
  for each row execute function app.jugendschutz_buerobuchung();

-- ---------------------------------------------------------------------------
-- 3. Unterrichtszeit am Berufsschultag (M1, vorbereitet)
-- ---------------------------------------------------------------------------

alter table public.time_entries add column if not exists unterricht_min integer;
alter table public.time_entries drop constraint if exists time_entries_unterricht;
alter table public.time_entries add constraint time_entries_unterricht
  check (unterricht_min is null or (status = 'Berufsschule' and unterricht_min between 1 and 720));

comment on column public.time_entries.unterricht_min is
  'Unterrichtszeit des Berufsschultags in Minuten — zählt in der Prüfung der Arbeitszeitgrenzen statt des Tagessolls (Runde 3, M1). Leer = Tagessoll. Das Zeitkonto rechnet den Tag weiter mit dem Tagessoll.';

/*
  Rumpf wie in 20260930400000_lehrlinge.sql, dazu `p_unterricht_min`. Eine
  ältere App ruft ohne den Wert — dann bleibt es beim Tagessoll. Die alte
  Fassung mit vier Werten fällt weg: zwei Fassungen nebeneinander machten
  den Aufruf mit benannten Werten mehrdeutig.
*/
drop function if exists public.berufsschule_eintragen(uuid, date, date, text);

create or replace function public.berufsschule_eintragen(
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null,
  p_unterricht_min integer default null
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
  if p_unterricht_min is not null and (p_unterricht_min < 1 or p_unterricht_min > 720) then
    raise exception 'Die Unterrichtszeit liegt zwischen einer Minute und 12 Stunden' using errcode = '22023';
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
    id, company_id, user_id, date, status, break_duration, user_name, comment, unterricht_min)
  select gen_random_uuid(), betrieb, person.id, t, 'Berufsschule', 0, person.name,
         coalesce(nullif(btrim(coalesce(p_notiz, '')), ''), 'Berufsschule'),
         p_unterricht_min
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

revoke all on function public.berufsschule_eintragen(uuid, date, date, text, integer) from public, anon;
grant execute on function public.berufsschule_eintragen(uuid, date, date, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Datenauskunft: wer für andere gebucht hat
--    (Rumpf wie in 20261006110000_zwei_faktor.sql, eine Zeile ergänzt:
--     `zeitbuchungen_angelegt` neben `zeitbuchungen_bearbeitet`)
-- ---------------------------------------------------------------------------

create or replace function public.person_auskunft(
  p_art text,
  p_id uuid,
  p_max_bytes integer default null
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  grenze bigint := least(coalesce(p_max_bytes, 8 * 1024 * 1024), 8 * 1024 * 1024);
  person public.users;
  kunde public.customers;
  daten jsonb;
  bearbeitet jsonb;
  ergebnis jsonb;
  groesse bigint;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Eine Datenauskunft stellt die Geschäftsführung aus'
      using errcode = '42501';
  end if;

  if p_art = 'mitarbeiter' then
    select * into person from public.users u where u.id = p_id and u.company_id = betrieb;
    if person.id is null then
      raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    daten := jsonb_build_object(
      'konto', to_jsonb(person) - array['initial_overtime', 'initial_vacation_days'],
      'anmeldung', (
        select jsonb_build_object(
                 'anmeldename', a.email, 'angelegt_am', a.created_at,
                 'zuletzt_angemeldet', a.last_sign_in_at,
                 -- Runde 3, H1: ob und seit wann ein zweiter Faktor besteht — nie das Geheimnis, nie die Codes.
                 'zweiter_faktor_seit', (
                   select min(f.created_at) from auth.mfa_factors f
                    where f.user_id = p_id and f.status = 'verified'),
                 'wiederherstellungscode_verwendet', (
                   select max(z.verbraucht_am) from public.zwei_faktor_codes z where z.user_id = p_id))
          from auth.users a where a.id = p_id),
      'zeitkonto_anfang', (
        select to_jsonb(z) - array['id', 'company_id', 'user_id']
          from public.zeitkonto_anfang z where z.user_id = p_id),
      'einstellungen', (
        select to_jsonb(p) - 'push_tokens'
               || jsonb_build_object('geraete_fuer_mitteilungen', coalesce(cardinality(p.push_tokens), 0))
          from public.user_prefs p where p.user_id = p_id),
      'zeitbuchungen', (
        select coalesce(jsonb_agg(to_jsonb(t) order by t.date, t.start_time), '[]'::jsonb)
          from public.time_entries t where t.company_id = betrieb and t.user_id = p_id),
      'urlaube_und_zeitausgleich', (
        select coalesce(jsonb_agg(to_jsonb(v) order by v.von), '[]'::jsonb)
          from public.vacations v where v.company_id = betrieb and v.user_id = p_id),
      'krankmeldungen', (
        select coalesce(jsonb_agg(to_jsonb(k) order by k.von), '[]'::jsonb)
          from public.krankmeldungen k where k.company_id = betrieb and k.user_id = p_id),
      -- Ohne den Pfad einer Datei: die Datei selbst geht nie in eine Auskunft.
      'sonderurlaub_und_freistellungen', (
        select coalesce(jsonb_agg(to_jsonb(f) - array['company_id', 'nachweis_pfad'] order by f.von), '[]'::jsonb)
          from public.freistellungen f where f.company_id = betrieb and f.user_id = p_id),
      'urlaubsanspruch_anpassungen', (
        select coalesce(jsonb_agg(to_jsonb(a) - array['company_id'] order by a.urlaubsjahr, a.created_at), '[]'::jsonb)
          from public.urlaubsanspruch_anpassungen a where a.company_id = betrieb and a.user_id = p_id),
      'monatsbilanzen', (
        select coalesce(jsonb_agg(to_jsonb(m) order by m.monat), '[]'::jsonb)
          from public.monthly_stats m where m.company_id = betrieb and m.user_id = p_id),
      'einsaetze', (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.date), '[]'::jsonb)
          from public.assignments e where e.company_id = betrieb and e.user_id = p_id),
      'ruestlisten', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'datum', r.date, 'baustelle', r.project_number) order by r.date), '[]'::jsonb)
          from public.einsatz_material r where r.company_id = betrieb and p_id = any(r.uids)),
      'baustellen', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'baustelle', b.project_number,
                 'als', case when p_id = any(b.project_managers) then 'Leitung' else 'Team' end)
                 order by b.project_number), '[]'::jsonb)
          from public.projects b
         where b.company_id = betrieb
           and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers))),
      'materialanforderungen', (
        select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at), '[]'::jsonb)
          from public.material_orders o where o.company_id = betrieb and o.user_id = p_id),
      'scheine_erstellt', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'schein', s.id, 'datum', s.datum, 'baustelle', s.project_number,
                 'status', s.status) order by s.datum), '[]'::jsonb)
          from public.work_sheets s where s.company_id = betrieb and s.erstellt_von_uid = p_id),
      -- Nach dem Namen: die Stundenzeilen am Schein tragen keine Kennung.
      'stunden_auf_scheinen', (
        select coalesce(jsonb_agg(to_jsonb(h) - array['company_id'] order by h.datum, h.von), '[]'::jsonb)
          from public.work_sheet_hours h
         where h.company_id = betrieb and lower(btrim(h.mitarbeiter)) = lower(btrim(person.name))),
      'fehlerprotokoll', (
        select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]'::jsonb)
          from public.fehlerprotokoll f where f.company_id = betrieb and f.user_id = p_id),
      'kontoumstellungen', (
        select coalesce(jsonb_agg(to_jsonb(k) - array['company_id'] order by k.am), '[]'::jsonb)
          from public.konto_umstellungen k where k.company_id = betrieb and k.user_id = p_id),
      'kalenderabo', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'art', case a.art when 'gesamt' then 'ganzer Einsatzplan' else 'eigene Einsätze' end,
                 'angelegt_am', a.angelegt_am, 'zuletzt_abgerufen', a.zuletzt_abgerufen)
                 order by a.art), '[]'::jsonb)
          from public.kalender_abos a where a.company_id = betrieb and a.user_id = p_id),
      -- Ohne die übrigen Teilnehmer: deren Namen gehören ihnen.
      'termine', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'art', t.art, 'datum', t.datum, 'von', t.zeit_von, 'bis', t.zeit_bis,
                 'baustelle', t.project_number, 'notiz', t.notiz) order by t.datum), '[]'::jsonb)
          from public.termine t where t.company_id = betrieb and p_id = any(t.teilnehmer)),
      'geburtsdatum', (
        select g.geburtsdatum from public.geburtsdaten g
         where g.company_id = betrieb and g.user_id = p_id),
      'begruendungen_arbeitszeit', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'grenze', b.art, 'bezug', b.bezug, 'begruendung', b.text,
                 'eingetragen_von', b.von_name, 'am', b.am) order by b.bezug, b.art), '[]'::jsonb)
          from public.arbeitszeit_begruendungen b where b.company_id = betrieb and b.user_id = p_id)
    );

    bearbeitet := jsonb_build_object(
      'urlaube_entschieden', (select count(*) from public.vacations v
        where v.company_id = betrieb and v.entschieden_von_uid = p_id and v.user_id <> p_id),
      'krankmeldungen_eingetragen', (select count(*) from public.krankmeldungen k
        where k.company_id = betrieb and k.gemeldet_von_uid = p_id and k.user_id <> p_id),
      'zeitbuchungen_bearbeitet', (select count(*) from public.time_entries t
        where t.company_id = betrieb and t.last_edited_by_uid = p_id and t.user_id <> p_id),
      -- Runde 3, M2: für andere angelegt (der Anleger steht seither an der Buchung).
      'zeitbuchungen_angelegt', (select count(*) from public.time_entries t
        where t.company_id = betrieb and t.angelegt_von = p_id and t.user_id <> p_id),
      'zahlungen_erfasst', (select count(*) from public.zahlungseingaenge z
        where z.company_id = betrieb and z.erfasst_von = p_id),
      'betriebsurlaube_angelegt', (select count(*) from public.betriebsurlaube b
        where b.company_id = betrieb and b.angelegt_von_uid = p_id),
      'einkaufsposten_angelegt', (select count(*) from public.einkauf_posten e
        where e.company_id = betrieb and e.angelegt_von_uid = p_id),
      'plaene_hochgeladen', (select count(*) from public.project_documents d
        where d.company_id = betrieb and d.hochgeladen_von = p_id),
      'kataloge_eingespielt', (select count(*) from public.datanorm_laeufe l
        where l.company_id = betrieb and l.angelegt_von = p_id),
      'supportfreigaben', (select count(*) from public.support_freigaben f
        where f.company_id = betrieb and (f.gewaehrt_von = p_id or f.widerrufen_von = p_id)),
      'lagerbewegungen_erfasst', (select count(*) from public.lagerbewegungen l
        where l.company_id = betrieb and l.erfasst_von = p_id),
      'konten_umgestellt', (select count(*) from public.konto_umstellungen k
        where k.company_id = betrieb and k.durch = p_id and k.user_id <> p_id),
      'uids_geprueft', (select count(*) from public.uid_pruefungen u
        where u.company_id = betrieb and u.durch = p_id),
      'freistellungen_entschieden', (select count(*) from public.freistellungen f
        where f.company_id = betrieb and f.entschieden_von_uid = p_id and f.user_id <> p_id),
      'urlaubsansprueche_angepasst', (select count(*) from public.urlaubsanspruch_anpassungen a
        where a.company_id = betrieb and a.user_id <> p_id
          and (a.angelegt_von_uid = p_id or a.entfernt_von_uid = p_id)),
      'termine_angelegt', (select count(*) from public.termine t
        where t.company_id = betrieb and t.angelegt_von_uid = p_id and not (p_id = any(t.teilnehmer))),
      'arbeitszeit_begruendet', (select count(*) from public.arbeitszeit_begruendungen b
        where b.company_id = betrieb and b.von_uid = p_id and b.user_id <> p_id)
    );

    ergebnis := jsonb_build_object(
      'art', 'mitarbeiter',
      'person', person.name,
      'hinweis', 'Stunden auf Scheinen sind über den Namen zugeordnet — bei Namensgleichheit bitte vor dem Weitergeben durchsehen. Bei „als Bearbeiter" steht nur die Anzahl: der Inhalt gehört den anderen Personen.',
      'daten', daten,
      'als_bearbeiter', bearbeitet);

  elsif p_art = 'kunde' then
    select * into kunde from public.customers c where c.id = p_id and c.company_id = betrieb;
    if kunde.id is null then
      raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    daten := jsonb_build_object(
      'stammdaten', to_jsonb(kunde),
      'baustellen', (
        select coalesce(jsonb_agg(to_jsonb(b) - array['assigned_employees', 'project_managers']
                                  order by b.created_at), '[]'::jsonb)
          from public.projects b
         where b.company_id = betrieb
           and (b.customer_id = p_id
                or (b.customer_id is null and lower(btrim(b.customer_name)) = lower(btrim(kunde.name))))),
      'angebote', (
        select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('positionen', (
                 select coalesce(jsonb_agg(to_jsonb(l) - array['company_id'] order by l.position), '[]'::jsonb)
                   from public.quote_lines l where l.quote_id = q.id)) order by q.quote_date), '[]'::jsonb)
          from public.quotes q
         where q.company_id = betrieb
           and (q.customer_id = p_id
                or (q.customer_id is null and lower(btrim(q.customer_name)) = lower(btrim(kunde.name))))),
      'rechnungen', (
        select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
                 'positionen', (
                   select coalesce(jsonb_agg(to_jsonb(l) - array['company_id'] order by l.position), '[]'::jsonb)
                     from public.invoice_lines l where l.invoice_id = r.id),
                 'zahlungen', (
                   select coalesce(jsonb_agg(jsonb_build_object(
                            'datum', z.datum, 'betrag', z.betrag, 'art', z.art, 'hinweis', z.hinweis)
                            order by z.datum), '[]'::jsonb)
                     from public.zahlungseingaenge z where z.invoice_id = r.id))
                 order by r.invoice_date), '[]'::jsonb)
          from public.invoices r
         where r.company_id = betrieb
           and (r.customer_id = p_id
                or (r.customer_id is null and lower(btrim(r.customer_name)) = lower(btrim(kunde.name))))),
      'scheine', (
        select coalesce(jsonb_agg(
                 to_jsonb(s) - array['erstellt_von_uid', 'unterschrift_monteur']
                 || jsonb_build_object(
                   'stunden', (
                     select coalesce(jsonb_agg(to_jsonb(h) - array['company_id'] order by h.position), '[]'::jsonb)
                       from public.work_sheet_hours h where h.work_sheet_id = s.id),
                   'material', (
                     select coalesce(jsonb_agg(to_jsonb(m) - array['company_id'] order by m.position), '[]'::jsonb)
                       from public.work_sheet_material m where m.work_sheet_id = s.id),
                   'fotos', (
                     select coalesce(jsonb_agg(jsonb_build_object('ablage', f.pfad, 'bytes', f.bytes)
                                               order by f.position), '[]'::jsonb)
                       from public.work_sheet_photos f where f.work_sheet_id = s.id))
                 order by s.datum), '[]'::jsonb)
          from public.work_sheets s
         where s.company_id = betrieb
           and (s.customer_id = p_id
                or (s.customer_id is null and lower(btrim(s.customer_name)) = lower(btrim(kunde.name))))),
      'wartungen', (
        select coalesce(jsonb_agg(to_jsonb(w) order by w.faellig_am), '[]'::jsonb)
          from public.wartungen w
         where w.company_id = betrieb
           and (w.customer_id = p_id
                or (w.customer_id is null and lower(btrim(w.customer_name)) = lower(btrim(kunde.name))))),
      'uid_pruefungen', (
        select coalesce(jsonb_agg(to_jsonb(u) - array['company_id', 'durch'] order by u.am), '[]'::jsonb)
          from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id),
      -- Ohne Teilnehmer und Anleger: das sind Mitarbeiter, nicht der Kunde.
      'termine', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'art', t.art, 'datum', t.datum, 'von', t.zeit_von, 'bis', t.zeit_bis,
                 'baustelle', t.project_number, 'notiz', t.notiz) order by t.datum), '[]'::jsonb)
          from public.termine t
         where t.company_id = betrieb
           and (t.customer_id = p_id
                or t.project_id in (select b.id from public.projects b
                                     where b.company_id = betrieb and b.customer_id = p_id)))
    );

    ergebnis := jsonb_build_object(
      'art', 'kunde',
      'person', kunde.name,
      'hinweis', 'Ältere Baustellen, Angebote, Rechnungen, Scheine und Wartungen ohne Kundenkennung sind über den Namen zugeordnet — bei Namensgleichheit bitte vor dem Weitergeben durchsehen. Fotos stehen mit ihrem Ablageort darin; die Dateien selbst liegen im Speicher.',
      'daten', daten);

  else
    raise exception 'Unbekannte Art: % — erwartet „mitarbeiter" oder „kunde"', p_art
      using errcode = '22023';
  end if;

  ergebnis := ergebnis || jsonb_build_object(
    'betrieb', (select jsonb_build_object('id', c.id, 'name', c.name)
                  from public.companies c where c.id = betrieb),
    'erstellt_am', now(),
    'anzahl', (select coalesce(jsonb_object_agg(k, case jsonb_typeof(v)
                                                     when 'array' then jsonb_array_length(v)
                                                     when 'null' then 0
                                                     else 1 end), '{}'::jsonb)
                 from jsonb_each(ergebnis -> 'daten') as e(k, v)));

  groesse := octet_length(ergebnis::text);
  if groesse > grenze then
    raise exception 'Die Auskunft ist mit % MB zu groß für den Abruf in der App. Bitte die Datensicherung herunterladen und die Zeilen dieser Person daraus nehmen.',
      round(groesse / 1048576.0, 1)
      using errcode = '54000';
  end if;

  return ergebnis;
end;
$$;

revoke all on function public.person_auskunft(text, uuid, integer) from public, anon;
grant execute on function public.person_auskunft(text, uuid, integer) to authenticated;
