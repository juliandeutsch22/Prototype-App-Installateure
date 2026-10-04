-- TERMINE, DIE KEIN EINSATZ SIND (Plan 10.4, PR A; Abschnitt 7 des Stands).
--
-- Eine Besichtigung beim Kunden vor der Baustelle, eine Baustellen-
-- besprechung, eine Abnahme, ein Behördentermin — und das Aviso: der
-- Großhändler liefert am Dienstag zwischen 8 und 10 direkt auf die
-- Baustelle, und jemand muss dort sein. Ein Einsatz passt dafür nicht: er
-- bedeutet Arbeitszeit mit Satz und Budget. Ein Termin bucht nichts.
--
-- DIE TEILNEHMER STEHEN ALS LISTE AM TERMIN, nicht in einer zweiten Tabelle
-- (Abweichung vom Plan, im Stand vermerkt). So geht ein Termin in EINEM
-- Schreibvorgang durch die Zeilenregel, und die Prüfung „nur Personen des
-- eigenen Betriebs" ist dieselbe wie an der Rüstliste (`personen_pruefen`).

create table if not exists public.termine (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  art text not null,
  datum date not null,
  zeit_von time,
  zeit_bis time,
  -- Baustelle ODER Kunde: die Besichtigung findet vor der Baustelle statt.
  project_number text,
  project_id uuid references public.projects(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  teilnehmer uuid[] not null default '{}',
  /*
    WO ES IST, AM TERMIN SELBST: Name und Adresse von Baustelle bzw. Kunde,
    gesetzt von `termin_pruefen`. Ein Monteur liest keine Kunden
    (`customers_lesen`) — zur Besichtigung, an der er teilnimmt, muss er
    trotzdem wissen, wohin. Ändert sich Name oder Adresse, ziehen die Auslöser
    unten nach.
  */
  ort_name text,
  ort_adresse text,
  notiz text,
  angelegt_von_uid uuid references public.users(id),
  angelegt_von_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint termine_art check (art in ('Kundentermin', 'Besichtigung', 'Baustellenbesprechung',
                                        'Abnahme', 'Lieferung', 'Behörde', 'Sonstiges')),
  constraint termine_zeit_folge check (zeit_von is null or zeit_bis is null or zeit_bis > zeit_von),
  constraint termine_bezug check (num_nonnulls(nullif(btrim(project_number), ''), customer_id) = 1)
);

create index if not exists termine_betrieb_datum on public.termine (company_id, datum);
create index if not exists termine_baustelle on public.termine (company_id, project_number);
create index if not exists termine_kunde on public.termine (customer_id);
create index if not exists termine_projekt on public.termine (project_id);

comment on table public.termine is
  'Termine ohne Arbeitszeit: Kundentermin, Besichtigung, Besprechung, Abnahme, Lieferung (Aviso), Behörde. Lesen: Leitung, Verwaltung, Teilnehmer, am Tag auf der Baustelle Eingeteilte. Schreiben: Leitung und Verwaltung.';

alter table public.termine enable row level security;
revoke all on public.termine from anon, authenticated;
grant select, insert, update, delete on public.termine to authenticated;

/*
  WER EINEN TERMIN SIEHT: wer plant (Leitung) und wer die Anrufe annimmt
  (Verwaltung), die Teilnehmer — und wer an diesem Tag auf dieser Baustelle
  eingeteilt ist, auch ohne Teilnehmer zu sein: er nimmt die Lieferung an.
  Buchhaltung und die übrigen Monteure sehen ihn nicht.
*/
drop policy if exists termine_lesen on public.termine;
create policy termine_lesen on public.termine for select
  using (app.darf(company_id) and (
    app.ist_fuehrung()
    or app.hat_rolle(array['Verwaltung'])
    or auth.uid() = any(teilnehmer)
    or (project_number is not null and exists (
          select 1 from public.assignments a
           where a.company_id = termine.company_id
             and a.date = termine.datum
             and a.project_number = termine.project_number
             and a.user_id = auth.uid()))));

-- Wie die Einsatzplanung, und dazu die Verwaltung: sie nimmt das Aviso entgegen.
drop policy if exists termine_schreiben on public.termine;
create policy termine_schreiben on public.termine for insert
  with check (app.darf(company_id) and (app.ist_fuehrung() or app.hat_rolle(array['Verwaltung'])));
drop policy if exists termine_aendern on public.termine;
create policy termine_aendern on public.termine for update
  using (app.darf(company_id) and (app.ist_fuehrung() or app.hat_rolle(array['Verwaltung'])))
  with check (app.darf(company_id) and (app.ist_fuehrung() or app.hat_rolle(array['Verwaltung'])));
drop policy if exists termine_loeschen on public.termine;
create policy termine_loeschen on public.termine for delete
  using (app.darf(company_id) and (app.ist_fuehrung() or app.hat_rolle(array['Verwaltung'])));

drop trigger if exists termine_updated_at on public.termine;
create trigger termine_updated_at before update on public.termine
  for each row execute function app.updated_at_setzen();
drop trigger if exists termine_betrieb_fest on public.termine;
create trigger termine_betrieb_fest before update on public.termine
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists termine_baustelle on public.termine;
create trigger termine_baustelle before insert or update on public.termine
  for each row execute function app.baustelle_aufloesen();
drop trigger if exists termine_kein_support_schreiben on public.termine;
create trigger termine_kein_support_schreiben
  before insert or update or delete on public.termine
  for each row execute function app.support_schreibt_nicht();

/*
  BAUSTELLE UND KUNDE AUS DEM EIGENEN BETRIEB, und wer anlegt, steht fest.

  Die Fremdschlüssel prüfen nur, ob es die Zeile GIBT. Eine Baustellen-
  nummer, die es im Betrieb nicht gibt, ließe `baustelle_aufloesen` ohne
  Kennung stehen — dann hinge der Termin an nichts und tauchte nirgends auf.
  Läuft nach `termine_baustelle` (Name in alphabetischer Reihenfolge), damit
  die Kennung schon aufgelöst ist.
*/
create or replace function app.termin_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Die Zeilenregel antwortet bei einem fremden Betrieb, nicht dieser Auslöser.
  if app.betrieb() is not null and new.company_id is distinct from app.betrieb() then
    return new;
  end if;
  if new.project_number is not null and btrim(new.project_number) <> '' and new.project_id is null then
    raise exception 'Diese Baustelle gibt es in diesem Betrieb nicht.' using errcode = '23503';
  end if;
  if new.customer_id is not null and not exists (
       select 1 from public.customers c where c.id = new.customer_id and c.company_id = new.company_id) then
    raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht.' using errcode = '23503';
  end if;
  if new.project_id is not null then
    select p.customer_name, p.address into new.ort_name, new.ort_adresse
      from public.projects p where p.id = new.project_id;
  else
    select c.name, c.address into new.ort_name, new.ort_adresse
      from public.customers c where c.id = new.customer_id;
  end if;
  if tg_op = 'INSERT' then
    new.angelegt_von_uid := coalesce(auth.uid(), new.angelegt_von_uid);
    if auth.uid() is not null then
      select u.name into new.angelegt_von_name from public.users u where u.id = auth.uid();
    end if;
  else
    new.angelegt_von_uid := old.angelegt_von_uid;
    new.angelegt_von_name := old.angelegt_von_name;
  end if;
  return new;
end;
$$;
revoke all on function app.termin_pruefen() from public, anon, authenticated;

drop trigger if exists termine_pruefen on public.termine;
create trigger termine_pruefen before insert or update on public.termine
  for each row execute function app.termin_pruefen();

/*
  ÄNDERT SICH DIE BAUSTELLE ODER DER KUNDE, ZIEHT DER TERMIN MIT — die neue
  Nummer, der neue Name, die neue Adresse.

  An Baustelle und Kunde selbst und nicht in `baustelle_umnummern` oder im
  Kundenformular: so gilt es für jeden Weg, auf dem sich etwas ändert.
  Gefunden wird der Termin über die Kennung, die sich nie ändert; Name und
  Adresse setzt danach `termin_pruefen` neu.
*/
create or replace function app.termine_nachziehen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'projects' then
    update public.termine t
       set project_number = new.project_number
     where t.project_id = new.id;
  else
    update public.termine t
       set customer_id = new.id
     where t.customer_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function app.termine_nachziehen() from public, anon, authenticated;

drop trigger if exists projects_termine_nachziehen on public.projects;
create trigger projects_termine_nachziehen
  after update of project_number, customer_name, address on public.projects
  for each row when (old.project_number is distinct from new.project_number
                     or old.customer_name is distinct from new.customer_name
                     or old.address is distinct from new.address)
  execute function app.termine_nachziehen();

drop trigger if exists customers_termine_nachziehen on public.customers;
create trigger customers_termine_nachziehen
  after update of name, address on public.customers
  for each row when (old.name is distinct from new.name or old.address is distinct from new.address)
  execute function app.termine_nachziehen();

-- ---------------------------------------------------------------------------
-- Nur Personen des eigenen Betriebs als Teilnehmer
-- (unverändert aus 20260928090000_personen_im_betrieb.sql, bis auf `termine`)
-- ---------------------------------------------------------------------------

create or replace function app.personen_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  neu uuid[];
  alt uuid[] := '{}';
begin
  /*
    EINE ZEILE FÜR EINEN FREMDEN BETRIEB weist die Zeilenregel ab — sie soll
    es auch sein, die antwortet. Prüfte der Auslöser hier, liefe er VOR der
    Regel, und an seiner Meldung liesse sich ablesen, ob eine Kennung zu
    einem fremden Betrieb gehört. Ohne Anmeldekontext (Dienstzugang,
    Rücklauf) gibt es keinen „eigenen" Betrieb: dann wird immer geprüft.
  */
  if app.betrieb() is not null and new.company_id is distinct from app.betrieb() then
    return new;
  end if;

  if tg_table_name in ('assignments', 'time_entries') then
    neu := array[new.user_id];
    if tg_op = 'UPDATE' and old.company_id = new.company_id then alt := array[old.user_id]; end if;
  elsif tg_table_name = 'einsatz_material' then
    neu := new.uids;
    if tg_op = 'UPDATE' and old.company_id = new.company_id then alt := old.uids; end if;
  elsif tg_table_name = 'termine' then
    neu := new.teilnehmer;
    if tg_op = 'UPDATE' and old.company_id = new.company_id then alt := old.teilnehmer; end if;
  elsif tg_table_name = 'projects' then
    neu := coalesce(new.assigned_employees, '{}') || coalesce(new.project_managers, '{}');
    if tg_op = 'UPDATE' and old.company_id = new.company_id then
      alt := coalesce(old.assigned_employees, '{}') || coalesce(old.project_managers, '{}');
    end if;
  end if;

  -- Nur, was neu hinzukommt.
  neu := array(select unnest(neu) except select unnest(alt));

  if not app.personen_im_betrieb(new.company_id, neu) then
    raise exception 'Diese Person gehört nicht zu diesem Betrieb.'
      using errcode = '42501', hint = 'Nur Konten des eigenen Betriebs lassen sich eintragen.';
  end if;
  return new;
end;
$$;

revoke all on function app.personen_pruefen() from public, anon, authenticated;

drop trigger if exists termine_personen_im_betrieb on public.termine;
create trigger termine_personen_im_betrieb
  before insert or update of teilnehmer, company_id on public.termine
  for each row execute function app.personen_pruefen();

-- ---------------------------------------------------------------------------
-- Datenauskunft und Löschung einer Person — mit den Terminen
-- (Rumpf wie in 20261004200000_freistellungen.sql, die Termine ergänzt)
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
                 'angelegt_am', a.angelegt_am, 'zuletzt_abgerufen', a.zuletzt_abgerufen)), '[]'::jsonb)
          from public.kalender_abos a where a.company_id = betrieb and a.user_id = p_id),
      -- Ohne die übrigen Teilnehmer: deren Namen gehören ihnen.
      'termine', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'art', t.art, 'datum', t.datum, 'von', t.zeit_von, 'bis', t.zeit_bis,
                 'baustelle', t.project_number, 'notiz', t.notiz) order by t.datum), '[]'::jsonb)
          from public.termine t where t.company_id = betrieb and p_id = any(t.teilnehmer))
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
        where t.company_id = betrieb and t.angelegt_von_uid = p_id and not (p_id = any(t.teilnehmer)))
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
                   where t.company_id = betrieb and p_id = any(t.teilnehmer)));

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

revoke all on function public.person_loeschen(text, uuid, boolean) from public, anon;
grant execute on function public.person_loeschen(text, uuid, boolean) to authenticated;
