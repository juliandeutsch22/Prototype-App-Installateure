/*
  VERLÄUFE MIT DATUM (12.10.2026, Plan 17 G)

  Die Seitenfenster zeigen einen Verlauf — aber nur aus dem, was die
  Datenbank festhielt, und das war oft nur der letzte Stand:

    - ANGEBOT: wann versendet, angenommen oder abgelehnt wurde, stand
      nirgends; der Verlauf zeigte den Status ohne Datum.
    - WARTUNG: „zuletzt gewartet“ überschrieb die vorige Ausführung. Wann
      die Anlage davor gewartet wurde, war weg.
    - URLAUB UND SONDERURLAUB: eine Rücknahme überschrieb die Genehmigung
      (`entschieden_am`). Der Verlauf zeigte „Beantragt“ und „Storniert“ —
      dass der Urlaub einmal genehmigt war, nicht mehr.

  Jetzt hält die Datenbank fest, was geschieht — am Status selbst, durch
  Trigger. So gilt es für jeden Weg, der den Status ändert (App,
  Datenbankfunktion), und es gibt keine zweite Fassung der Regeln in der App.

  KEINE NEUEN PERSONENDATEN. Festgehalten werden Zeitpunkte, bei der
  Wartung dazu die Baustelle — nicht, wer es war. Wer entschieden hat,
  steht wie bisher nur bei der letzten Entscheidung. Die Ausführungen einer
  Wartung gehören zum Kunden: sie stehen in seiner Datenauskunft bei der
  Wartung und gehen mit ihr, wenn seine Daten gelöscht werden. Wird eine
  Baustelle umnummeriert, geht die Nummer auch in den Ausführungen mit.

  DER DIENST (Rücklauf einer Sicherung) WIRD NICHT ÜBERSCHRIEBEN: er spielt
  die festgehaltenen Zeitpunkte selbst zurück; ein Trigger, der „jetzt“
  einsetzte, verfälschte sie.

  Ältere Einträge bleiben ohne Datum — es wird keines erfunden.
*/

-- ---------------------------------------------------------------------------
-- 1. Angebote: wann versendet, angenommen, abgelehnt
-- ---------------------------------------------------------------------------

alter table public.quotes
  add column if not exists versendet_am timestamptz,
  add column if not exists angenommen_am timestamptz,
  add column if not exists abgelehnt_am timestamptz;

create or replace function app.angebot_status_zeit() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  case new.status
    when 'Versendet' then new.versendet_am := now();
    when 'Angenommen' then new.angenommen_am := now();
    when 'Abgelehnt' then new.abgelehnt_am := now();
    else null;
  end case;
  return new;
end;
$$;

revoke all on function app.angebot_status_zeit() from public, anon, authenticated;

drop trigger if exists quotes_status_zeit on public.quotes;
create trigger quotes_status_zeit
  before insert or update of status on public.quotes
  for each row execute function app.angebot_status_zeit();

-- ---------------------------------------------------------------------------
-- 2. Urlaub und Sonderurlaub: die Genehmigung bleibt, auch nach Rücknahme
-- ---------------------------------------------------------------------------

alter table public.vacations add column if not exists genehmigt_am timestamptz;
alter table public.freistellungen add column if not exists bestaetigt_am timestamptz;

/*
  Läuft NACH den übrigen „before“-Triggern der Tabelle (Name „…_verlauf“):
  `entschieden_am` ist dann schon gesetzt, und dieser Zeitpunkt wird
  übernommen — Genehmigung und Verlauf nennen denselben Augenblick.
*/
create or replace function app.urlaub_genehmigt_zeit() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.status = 'Genehmigt'
     and (tg_op = 'INSERT' or old.status is distinct from 'Genehmigt') then
    new.genehmigt_am := coalesce(new.entschieden_am, now());
  end if;
  return new;
end;
$$;

create or replace function app.freistellung_bestaetigt_zeit() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.status = 'Bestätigt'
     and (tg_op = 'INSERT' or old.status is distinct from 'Bestätigt') then
    new.bestaetigt_am := coalesce(new.entschieden_am, now());
  end if;
  return new;
end;
$$;

revoke all on function app.urlaub_genehmigt_zeit() from public, anon, authenticated;
revoke all on function app.freistellung_bestaetigt_zeit() from public, anon, authenticated;

drop trigger if exists vacations_verlauf on public.vacations;
create trigger vacations_verlauf
  before insert or update on public.vacations
  for each row execute function app.urlaub_genehmigt_zeit();

drop trigger if exists freistellungen_verlauf on public.freistellungen;
create trigger freistellungen_verlauf
  before insert or update on public.freistellungen
  for each row execute function app.freistellung_bestaetigt_zeit();

-- ---------------------------------------------------------------------------
-- 3. Wartungen: jede Ausführung
-- ---------------------------------------------------------------------------

/*
  EINE ZEILE JE TAG UND ANLAGE. Wird derselbe Tag noch einmal eingetragen,
  bleibt es eine Ausführung (die Baustelle wird ergänzt, nicht verdoppelt).

  OHNE PERSON: wer gewartet hat, steht auf dem Handwerksschein der
  Baustelle; hier genügen Tag und Baustelle.

  MIT DER WARTUNG GELÖSCHT (`on delete cascade`): ohne Anlage ist ihre
  Geschichte nichts mehr wert — und die Löschung eines Kunden nimmt seine
  Anlagen samt Verlauf mit.
*/
create table if not exists public.wartung_ausfuehrungen (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.companies (id),
  wartung_id  uuid not null references public.wartungen (id) on delete cascade,
  am          date not null,
  baustelle   text,
  created_at  timestamptz not null default now(),
  unique (wartung_id, am)
);

create index if not exists wartung_ausfuehrungen_wartung on public.wartung_ausfuehrungen (company_id, wartung_id, am desc);

alter table public.wartung_ausfuehrungen enable row level security;

-- Lesen wie die Wartungen selbst. Geschrieben wird nur über den Trigger.
drop policy if exists wartung_ausfuehrungen_lesen on public.wartung_ausfuehrungen;
create policy wartung_ausfuehrungen_lesen on public.wartung_ausfuehrungen
  for select using (
    (company_id = (select app.lesebetrieb())) or (company_id = (select app.supportbetrieb()))
  );

revoke all on public.wartung_ausfuehrungen from anon, authenticated;
grant select on public.wartung_ausfuehrungen to authenticated;

-- Derselbe Riegel wie an den Wartungen: der Support schreibt nur mit „mitarbeiten“.
drop trigger if exists wartung_ausfuehrungen_kein_support_schreiben on public.wartung_ausfuehrungen;
create trigger wartung_ausfuehrungen_kein_support_schreiben
  before insert or update or delete on public.wartung_ausfuehrungen
  for each row execute function app.support_schreibt_nicht();

/*
  FESTGEHALTEN, WENN „ZULETZT GEWARTET“ EINEN NEUEN TAG BEKOMMT — über
  „Wartung erledigt“ oder im Formular. Ein gelöschtes Datum hält nichts
  fest. Nach dem Schreiben (`after`), damit nur eine Wartung, die es gibt,
  eine Ausführung bekommt.
*/
create or replace function app.wartung_ausfuehrung_festhalten() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Der Rücklauf spielt die Ausführungen selbst zurück (siehe oben).
  if app.ist_dienst() or new.zuletzt_am is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.zuletzt_am is not distinct from old.zuletzt_am then
    return null;
  end if;
  insert into public.wartung_ausfuehrungen (company_id, wartung_id, am, baustelle)
  values (new.company_id, new.id, new.zuletzt_am, nullif(btrim(new.letzte_baustelle), ''))
  on conflict (wartung_id, am) do update
    set baustelle = coalesce(excluded.baustelle, public.wartung_ausfuehrungen.baustelle);
  return null;
end;
$$;

revoke all on function app.wartung_ausfuehrung_festhalten() from public, anon, authenticated;

drop trigger if exists wartungen_ausfuehrung on public.wartungen;
create trigger wartungen_ausfuehrung
  after insert or update of zuletzt_am on public.wartungen
  for each row execute function app.wartung_ausfuehrung_festhalten();

/*
  DER BESTAND: was „zuletzt gewartet“ heute sagt, ist eine Ausführung, die
  festgehalten ist — sie wird einmal übernommen. Ohne das verschwände sie
  beim ersten „Erledigt“ nach dieser Fassung aus dem Verlauf. Frühere
  Ausführungen hat die Datenbank nie gekannt; sie bleiben weg.
*/
insert into public.wartung_ausfuehrungen (company_id, wartung_id, am, baustelle)
select w.company_id, w.id, w.zuletzt_am, nullif(btrim(w.letzte_baustelle), '')
  from public.wartungen w
 where w.zuletzt_am is not null
on conflict (wartung_id, am) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Datenauskunft eines Kunden — die Ausführungen stehen bei ihrer Wartung
--    (Rumpf wie in 20261010700000_mahnungen_einzeln.sql, eine Stelle ergänzt)
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
                     from public.zahlungseingaenge z where z.invoice_id = r.id),
                 'mahnungen', (
                   select coalesce(jsonb_agg(jsonb_build_object(
                            'stufe', m.stufe, 'datum', m.datum, 'frist', m.frist,
                            'spesen', m.spesen, 'inhalt', m.inhalt)
                            order by m.datum, m.angelegt_am), '[]'::jsonb)
                     from public.mahnungen m where m.invoice_id = r.id))
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
        select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('ausfuehrungen', (
                 select coalesce(jsonb_agg(jsonb_build_object('am', a.am, 'baustelle', a.baustelle)
                                           order by a.am), '[]'::jsonb)
                   from public.wartung_ausfuehrungen a where a.wartung_id = w.id))
                 order by w.faellig_am), '[]'::jsonb)
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

-- ---------------------------------------------------------------------------
-- 5. Umnummern einer Baustelle — auch in den Ausführungen
--    (Fassung aus 20260930090000_wiedervorlagen_entfernt.sql, eine Anweisung ergänzt)
-- ---------------------------------------------------------------------------

create or replace function public.baustelle_umnummern(p_projekt uuid, p_neu text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  p public.projects;
  neu text := btrim(coalesce(p_neu, ''));
  alt text;
  gesperrt text[] := '{}';
  n integer;
  bewegt jsonb := '{}';
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  -- Dieselbe Grenze wie `projects_aendern`: wer die Baustelle nicht ändern
  -- darf, darf auch ihre Nummer nicht ändern.
  if not app.ist_fuehrung() then
    raise exception 'Die Nummer einer Baustelle ändert nur die Leitung' using errcode = '42501';
  end if;
  if neu = '' then
    raise exception 'Ohne Projektnummer geht es nicht' using errcode = '22023';
  end if;

  select * into p from public.projects
   where id = p_projekt and company_id = betrieb
   for update;
  if p.id is null then
    raise exception 'Diese Baustelle gibt es nicht' using errcode = 'P0002';
  end if;
  alt := p.project_number;
  if alt = neu then
    return jsonb_build_object('geaendert', false);
  end if;

  if exists (select 1 from public.projects
              where company_id = betrieb and project_number = neu) then
    raise exception 'Die Nummer „%" ist schon vergeben', neu using errcode = '23505';
  end if;

  -- Was die Nummer festhält — gesammelt, damit die Meldung ALLE Gründe nennt.
  select count(*) into n from public.invoices
   where company_id = betrieb and project_number = alt;
  if n > 0 then gesperrt := gesperrt || format('%s Rechnung(en)', n); end if;

  select count(*) into n from public.work_sheets
   where company_id = betrieb and project_number = alt
     and status in ('Unterschrieben', 'Storniert');
  if n > 0 then gesperrt := gesperrt || format('%s unterschriebene(r) Schein(e)', n); end if;

  select count(*) into n from public.time_entries
   where company_id = betrieb and project_number = alt and is_billed;
  if n > 0 then gesperrt := gesperrt || format('%s verrechnete Buchung(en)', n); end if;

  select count(*) into n from public.material_orders
   where company_id = betrieb and project_number = alt and is_billed;
  if n > 0 then gesperrt := gesperrt || format('%s verrechnete Anforderung(en)', n); end if;

  if array_length(gesperrt, 1) > 0 then
    raise exception 'Die Nummer steht schon auf Belegen und bleibt: %',
      array_to_string(gesperrt, ', ') using errcode = '55000';
  end if;

  -- ZUERST die Baustelle, DANN die Zeilen: `baustelle_aufloesen` sucht die
  -- Kennung über die neue Nummer und soll sie dort auch finden.
  update public.projects set project_number = neu where id = p.id;

  update public.time_entries set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('buchungen', n);

  update public.assignments set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('einsaetze', n);

  update public.einsatz_material set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('ruestlisten', n);

  -- Entwürfe UND verworfene Entwürfe. Der verworfene blieb bisher auf der
  -- alten Nummer stehen — wer ihn zurückholte, hatte einen Schein zu einer
  -- Baustelle, die es so nicht mehr gibt. `schein_zustandswechsel` lässt an
  -- ihm genau diese eine Änderung zu, und nur aus dieser Funktion heraus.
  -- Unterschriebene und stornierte Scheine halten die Nummer ohnehin fest
  -- (siehe oben): der Kunde hat sie so unterschrieben.
  update public.work_sheets set project_number = neu
   where company_id = betrieb and project_number = alt and status in ('Entwurf', 'Verworfen');
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('scheine', n);

  update public.material_orders set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('anforderungen', n);

  update public.quotes set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('angebote', n);

  -- Die Wartungen merken sich die letzte und die offene Baustelle als Text.
  -- Blieb dort die alte Nummer, führte „zur Baustelle" aus der Wartung ins
  -- Leere.
  update public.wartungen
     set letzte_baustelle = case when letzte_baustelle = alt then neu else letzte_baustelle end,
         offene_baustelle = case when offene_baustelle = alt then neu else offene_baustelle end
   where company_id = betrieb and (letzte_baustelle = alt or offene_baustelle = alt);
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('wartungen', n);

  -- Ebenso jede Ausführung (17 G): sonst nennte der Verlauf der Anlage eine
  -- Baustelle, die es unter dieser Nummer nicht mehr gibt.
  update public.wartung_ausfuehrungen set baustelle = neu
   where company_id = betrieb and baustelle = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('ausfuehrungen', n);

  return jsonb_build_object('geaendert', true, 'alt', alt, 'neu', neu, 'bewegt', bewegt);
end;
$$;

revoke all on function public.baustelle_umnummern(uuid, text) from public, anon;
grant execute on function public.baustelle_umnummern(uuid, text) to authenticated;
