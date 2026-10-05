/*
  ARBEITSZEITGRENZEN NACH AZG, ARG UND KJBG (Stand-Datei 11.1, Punkt 4)

  Die Mitarbeiterübersicht zeigt je Monat, wo gebuchte Zeiten eine
  gesetzliche Grenze überschreiten (`src/features/accounting/
  arbeitszeitGrenzen.ts`). Dafür braucht es zweierlei, das es noch nicht gab:

  1. DAS GEBURTSDATUM — nur, um zu wissen, wer unter 18 ist. Eigene Tabelle,
     nicht `users`: die liest jeder im Betrieb. Lesen dürfen die Person
     selbst und Büro samt Leitung, schreiben Geschäftsführung und
     Administration. Der Support nie.

  2. DIE BEGRÜNDUNG JE FALL. Notdienst und Gefahr in Verzug sind zulässig,
     aber nur begründet. Geschrieben vom Büro; wer und wann setzt die
     Datenbank, nicht der Browser.

  Beide gehören in Datenauskunft und Löschung einer Person: das Geburtsdatum
  geht mit der Löschung, die Begründungen bleiben wie die Zeitbuchungen, zu
  denen sie gehören, für die Aufbewahrungsfrist.
*/

-- ---------------------------------------------------------------------------
-- 1. Geburtsdatum
-- ---------------------------------------------------------------------------

create table if not exists public.geburtsdaten (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_id text not null references public.companies(id),
  geburtsdatum date not null,
  updated_at timestamptz not null default now(),
  constraint geburtsdaten_plausibel check (geburtsdatum between date '1900-01-01' and date '2100-01-01')
);

create index if not exists geburtsdaten_betrieb on public.geburtsdaten (company_id);

comment on table public.geburtsdaten is
  'Geburtsdatum je Person — nur für die Schutzregeln für Jugendliche (KJBG). Lesen: die Person und Büro samt Leitung; schreiben: Geschäftsführung, Administration.';

alter table public.geburtsdaten enable row level security;
revoke all on public.geburtsdaten from public, anon, authenticated;
grant select, insert, update, delete on public.geburtsdaten to authenticated;

drop policy if exists geburtsdaten_lesen on public.geburtsdaten;
create policy geburtsdaten_lesen on public.geburtsdaten for select
  using (app.betriebsmitglied(company_id)
         and (user_id = auth.uid() or app.ist_buch_oder_spitze()));
drop policy if exists geburtsdaten_anlegen on public.geburtsdaten;
create policy geburtsdaten_anlegen on public.geburtsdaten for insert
  with check (app.betriebsmitglied(company_id) and app.ist_spitze());
drop policy if exists geburtsdaten_aendern on public.geburtsdaten;
create policy geburtsdaten_aendern on public.geburtsdaten for update
  using (app.betriebsmitglied(company_id) and app.ist_spitze())
  with check (app.betriebsmitglied(company_id) and app.ist_spitze());
drop policy if exists geburtsdaten_loeschen on public.geburtsdaten;
create policy geburtsdaten_loeschen on public.geburtsdaten for delete
  using (app.betriebsmitglied(company_id) and app.ist_spitze());

drop trigger if exists geburtsdaten_updated_at on public.geburtsdaten;
create trigger geburtsdaten_updated_at before update on public.geburtsdaten
  for each row execute function app.updated_at_setzen();
drop trigger if exists geburtsdaten_betrieb_fest on public.geburtsdaten;
create trigger geburtsdaten_betrieb_fest before update on public.geburtsdaten
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists geburtsdaten_support_niemals on public.geburtsdaten;
create trigger geburtsdaten_support_niemals
  before insert or update or delete on public.geburtsdaten
  for each row execute function app.support_niemals();

-- ---------------------------------------------------------------------------
-- 2. Begründungen je Fall
-- ---------------------------------------------------------------------------

create table if not exists public.arbeitszeit_begruendungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  user_id uuid not null references public.users(id),
  art text not null,
  bezug date not null,
  text text not null,
  von_uid uuid,
  von_name text,
  am timestamptz not null default now(),
  constraint arbeitszeit_begruendungen_art check (art in ('tag', 'woche', 'ruhezeit', 'wochenruhe', 'nacht', 'wochenfrei')),
  constraint arbeitszeit_begruendungen_text check (char_length(btrim(text)) between 1 and 500),
  constraint arbeitszeit_begruendungen_einmal unique (company_id, user_id, art, bezug)
);

create index if not exists arbeitszeit_begruendungen_zeit
  on public.arbeitszeit_begruendungen (company_id, bezug);

comment on table public.arbeitszeit_begruendungen is
  'Begründung je überschrittener Arbeitszeitgrenze (AZG, ARG, KJBG). Lesen: die Person und Büro samt Leitung; schreiben: Büro samt Leitung.';

alter table public.arbeitszeit_begruendungen enable row level security;
revoke all on public.arbeitszeit_begruendungen from public, anon, authenticated;
grant select, insert, update, delete on public.arbeitszeit_begruendungen to authenticated;

drop policy if exists arbeitszeit_begruendungen_lesen on public.arbeitszeit_begruendungen;
create policy arbeitszeit_begruendungen_lesen on public.arbeitszeit_begruendungen for select
  using (app.betriebsmitglied(company_id)
         and (user_id = auth.uid() or app.ist_buch_oder_spitze()));
drop policy if exists arbeitszeit_begruendungen_anlegen on public.arbeitszeit_begruendungen;
create policy arbeitszeit_begruendungen_anlegen on public.arbeitszeit_begruendungen for insert
  with check (app.betriebsmitglied(company_id) and app.ist_buch_oder_spitze());
drop policy if exists arbeitszeit_begruendungen_aendern on public.arbeitszeit_begruendungen;
create policy arbeitszeit_begruendungen_aendern on public.arbeitszeit_begruendungen for update
  using (app.betriebsmitglied(company_id) and app.ist_buch_oder_spitze())
  with check (app.betriebsmitglied(company_id) and app.ist_buch_oder_spitze());
drop policy if exists arbeitszeit_begruendungen_loeschen on public.arbeitszeit_begruendungen;
create policy arbeitszeit_begruendungen_loeschen on public.arbeitszeit_begruendungen for delete
  using (app.betriebsmitglied(company_id) and app.ist_buch_oder_spitze());

drop trigger if exists arbeitszeit_begruendungen_betrieb_fest on public.arbeitszeit_begruendungen;
create trigger arbeitszeit_begruendungen_betrieb_fest before update on public.arbeitszeit_begruendungen
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists arbeitszeit_begruendungen_support_niemals on public.arbeitszeit_begruendungen;
create trigger arbeitszeit_begruendungen_support_niemals
  before insert or update or delete on public.arbeitszeit_begruendungen
  for each row execute function app.support_niemals();

/*
  WER UND WANN SETZT DIE DATENBANK. Aus dem Browser käme, was dort jemand
  hineinschreibt; der Vermerk soll beweisen, wer begründet hat. Gleichzeitig
  die Prüfung, dass die Person zu diesem Betrieb gehört — wie bei Einsätzen
  und Terminen, damit eine fremde Kennung keine Spur hinterlässt.
*/
create or replace function app.begruendung_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.betrieb() is not null and new.company_id is distinct from app.betrieb() then
    return new;
  end if;
  if not app.personen_im_betrieb(new.company_id, array[new.user_id]) then
    raise exception 'Diese Person gehört nicht zu diesem Betrieb.' using errcode = '42501';
  end if;
  new.text := btrim(new.text);
  new.von_uid := auth.uid();
  new.von_name := (select u.name from public.users u where u.id = auth.uid());
  new.am := now();
  return new;
end;
$$;

revoke all on function app.begruendung_setzen() from public, anon, authenticated;

drop trigger if exists arbeitszeit_begruendungen_setzen on public.arbeitszeit_begruendungen;
create trigger arbeitszeit_begruendungen_setzen
  before insert or update on public.arbeitszeit_begruendungen
  for each row execute function app.begruendung_setzen();

create or replace function app.geburtsdatum_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.betrieb() is not null and new.company_id is distinct from app.betrieb() then
    return new;
  end if;
  if not app.personen_im_betrieb(new.company_id, array[new.user_id]) then
    raise exception 'Diese Person gehört nicht zu diesem Betrieb.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.geburtsdatum_pruefen() from public, anon, authenticated;

drop trigger if exists geburtsdaten_personen_im_betrieb on public.geburtsdaten;
create trigger geburtsdaten_personen_im_betrieb
  before insert or update on public.geburtsdaten
  for each row execute function app.geburtsdatum_pruefen();

-- ---------------------------------------------------------------------------
-- 3. Datenauskunft und Löschung einer Person — mit beiden Tabellen
-- (Rumpf wie in 20261004400000_gesamtplan_abo.sql bzw.
--  20261004300000_termine.sql, die beiden Tabellen ergänzt)
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
                 'zuletzt_angemeldet', a.last_sign_in_at)
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


create or replace function public.person_loeschen(
  p_art text,
  p_id uuid,
  p_nur_pruefen boolean default true
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  person public.users;
  kunde public.customers;
  sofort jsonb;
  aufbewahren jsonb;
  ganz boolean := false;
  rechtsgrund constant text := '§ 132 BAO — sieben Jahre ab Ende des Kalenderjahrs';
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Eine Löschung nach DSGVO veranlasst die Geschäftsführung'
      using errcode = '42501';
  end if;

  if p_art = 'mitarbeiter' then
    select * into person from public.users u where u.id = p_id and u.company_id = betrieb;
    if person.id is null then
      raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;
    if person.active is distinct from false then
      raise exception 'Zuerst das Konto deaktivieren — wer noch arbeitet, braucht Einsätze und Zeiten'
        using errcode = '55000';
    end if;

    sofort := jsonb_build_object(
      'einstellungen', (select count(*) from public.user_prefs p where p.user_id = p_id),
      'fehlerprotokoll', (select count(*) from public.fehlerprotokoll f
                           where f.company_id = betrieb and f.user_id = p_id),
      'einsaetze', (select count(*) from public.assignments e
                     where e.company_id = betrieb and e.user_id = p_id),
      'ruestlisten', (select count(*) from public.einsatz_material r
                       where r.company_id = betrieb and p_id = any(r.uids)),
      'baustellen', (select count(*) from public.projects b
                      where b.company_id = betrieb
                        and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers))),
      'termine', (select count(*) from public.termine t
                   where t.company_id = betrieb and p_id = any(t.teilnehmer)),
      'geburtsdatum', (select count(*) from public.geburtsdaten g
                        where g.company_id = betrieb and g.user_id = p_id));

    select coalesce(jsonb_agg(z) filter (where (z ->> 'anzahl')::integer > 0), '[]'::jsonb)
      into aufbewahren
      from (
        select jsonb_build_object('was', 'Zeitbuchungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(t.date)), 'grund', rechtsgrund) as z
          from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all
        select jsonb_build_object('was', 'Urlaube und Zeitausgleich', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(v.bis)), 'grund', rechtsgrund)
          from public.vacations v where v.company_id = betrieb and v.user_id = p_id
        union all
        select jsonb_build_object('was', 'Krankmeldungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(k.bis)), 'grund', rechtsgrund)
          from public.krankmeldungen k where k.company_id = betrieb and k.user_id = p_id
        union all
        select jsonb_build_object('was', 'Sonderurlaub und Freistellungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(f.bis)), 'grund', rechtsgrund)
          from public.freistellungen f where f.company_id = betrieb and f.user_id = p_id
        union all
        -- Sie bestimmen den Resturlaub — Teil der Lohnverrechnung wie die Urlaube.
        select jsonb_build_object('was', 'Anpassungen des Urlaubsanspruchs', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(make_date(a.urlaubsjahr + 1, 12, 31))),
                                  'grund', rechtsgrund)
          from public.urlaubsanspruch_anpassungen a where a.company_id = betrieb and a.user_id = p_id
        union all
        select jsonb_build_object('was', 'Monatsbilanzen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis((m.monat || '-01')::date)), 'grund', rechtsgrund)
          from public.monthly_stats m where m.company_id = betrieb and m.user_id = p_id
        union all
        select jsonb_build_object('was', 'Materialanforderungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(o.created_at::date)), 'grund', rechtsgrund)
          from public.material_orders o where o.company_id = betrieb and o.user_id = p_id
        union all
        -- Sie gehören zu den Arbeitszeitaufzeichnungen und bleiben mit ihnen.
        select jsonb_build_object('was', 'Begründungen zu Arbeitszeitgrenzen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(b.bezug)), 'grund', rechtsgrund)
          from public.arbeitszeit_begruendungen b where b.company_id = betrieb and b.user_id = p_id
      ) teile;

    if not p_nur_pruefen then
      delete from public.user_prefs p where p.user_id = p_id;
      delete from public.fehlerprotokoll f where f.company_id = betrieb and f.user_id = p_id;
      delete from public.assignments e where e.company_id = betrieb and e.user_id = p_id;
      update public.einsatz_material r
         set uids = array_remove(r.uids, p_id)
       where r.company_id = betrieb and p_id = any(r.uids);
      update public.projects b
         set assigned_employees = array_remove(b.assigned_employees, p_id),
             project_managers = array_remove(b.project_managers, p_id)
       where b.company_id = betrieb
         and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers));
      update public.termine t
         set teilnehmer = array_remove(t.teilnehmer, p_id)
       where t.company_id = betrieb and p_id = any(t.teilnehmer);
      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;
    end if;

    return jsonb_build_object(
      'art', 'mitarbeiter', 'person', person.name, 'geloescht', not p_nur_pruefen,
      'sofort', sofort, 'aufbewahren', aufbewahren, 'ganz', false,
      'hinweis', 'Das Konto bleibt deaktiviert. Name und Anmeldename bleiben, solange Einträge aufbewahrt werden müssen — sie stehen auf ihnen.');

  elsif p_art = 'kunde' then
    select * into kunde from public.customers c where c.id = p_id and c.company_id = betrieb;
    if kunde.id is null then
      raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    sofort := jsonb_build_object(
      'wartungen', (select count(*) from public.wartungen w
                     where w.company_id = betrieb and w.customer_id = p_id),
      'termine', (select count(*) from public.termine t
                   where t.company_id = betrieb and t.customer_id = p_id),
      'kontaktdaten', (select count(*) from (
                         select 1 where num_nonnulls(kunde.contact_name, kunde.contact_phone,
                                                     kunde.email, kunde.notes) > 0
                         union all
                         select 1 from public.projects b
                          where b.company_id = betrieb and b.customer_id = p_id
                            and num_nonnulls(b.contact_name, b.contact_phone) > 0) k));

    -- Über Kennung ODER Namen: im Zweifel bleibt der Kunde gesperrt.
    select coalesce(jsonb_agg(z) filter (where (z ->> 'anzahl')::integer > 0), '[]'::jsonb)
      into aufbewahren
      from (
        select jsonb_build_object('was', 'Rechnungen samt Zahlungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(r.invoice_date)), 'grund', rechtsgrund) as z
          from public.invoices r
         where r.company_id = betrieb
           and (r.customer_id = p_id or lower(btrim(r.customer_name)) = lower(btrim(kunde.name)))
        union all
        select jsonb_build_object('was', 'Scheine samt Unterschrift und Fotos', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(s.datum)), 'grund', rechtsgrund)
          from public.work_sheets s
         where s.company_id = betrieb
           and (s.customer_id = p_id or lower(btrim(s.customer_name)) = lower(btrim(kunde.name)))
        union all
        select jsonb_build_object('was', 'Angebote', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(q.quote_date)), 'grund', rechtsgrund)
          from public.quotes q
         where q.company_id = betrieb
           and (q.customer_id = p_id or lower(btrim(q.customer_name)) = lower(btrim(kunde.name)))
        union all
        -- Die Baustelle trägt Zeiten und Material der Belegschaft; sie geht
        -- mit dem letzten Beleg an ihr, frühestens sieben Jahre nach Anlage.
        select jsonb_build_object('was', 'Baustellen mit Name und Adresse', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(coalesce(b.end_date, b.created_at::date))),
                                  'grund', rechtsgrund)
          from public.projects b
         where b.company_id = betrieb
           and (b.customer_id = p_id or lower(btrim(b.customer_name)) = lower(btrim(kunde.name)))
      ) teile;

    ganz := jsonb_array_length(aufbewahren) = 0;

    if not p_nur_pruefen then
      delete from public.wartungen w where w.company_id = betrieb and w.customer_id = p_id;
      delete from public.termine t where t.company_id = betrieb and t.customer_id = p_id;
      if ganz then
        delete from public.customers c where c.id = p_id;
      else
        update public.customers c
           set contact_name = null, contact_phone = null, email = null, notes = null, active = false
         where c.id = p_id;
        update public.projects b
           set contact_name = null, contact_phone = null
         where b.company_id = betrieb and b.customer_id = p_id
           and num_nonnulls(b.contact_name, b.contact_phone) > 0;
      end if;
    end if;

    return jsonb_build_object(
      'art', 'kunde', 'person', kunde.name, 'geloescht', not p_nur_pruefen,
      'sofort', sofort, 'aufbewahren', aufbewahren, 'ganz', ganz,
      'hinweis', case when ganz
        then 'Keine Belege — der Kunde geht ganz.'
        else 'Der Kunde bleibt inaktiv. Name, Adresse und UID bleiben, solange Belege aufbewahrt werden müssen — sie stehen auf ihnen.'
      end);

  else
    raise exception 'Unbekannte Art: % — erwartet „mitarbeiter" oder „kunde"', p_art
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.person_auskunft(text, uuid, integer) from public, anon;
grant execute on function public.person_auskunft(text, uuid, integer) to authenticated;
revoke all on function public.person_loeschen(text, uuid, boolean) from public, anon;
grant execute on function public.person_loeschen(text, uuid, boolean) to authenticated;
