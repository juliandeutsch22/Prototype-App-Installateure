/*
  JEDE MAHNUNG EINZELN GESPEICHERT (Grenze G3 aus dem Stand vom 10.10.2026)

  Bisher hielt die Rechnung nur ihre LETZTE Mahnung fest: Stufe, Tag, Frist
  und Spesen. Das Schreiben selbst war nirgends, frühere Stufen auch nicht —
  das Belegarchiv konnte Mahnungen deshalb nur als Liste mitgeben. Ein PDF
  aus dem Rechnungsstand neu zu drucken hätte Zinsen und Kosten von heute
  genommen, also ein Schreiben, das so nie hinausging.

  Jetzt bekommt jede Mahnung eine Zeile mit dem, was auf ihr stand
  (`inhalt`: Empfänger, Betragszeilen, offener Betrag, Texte). Das Archiv und
  „erneut laden“ drucken daraus genau dieses Schreiben. Briefkopf und
  Bankverbindung kommen wie beim Nachdruck einer Rechnung aus den heutigen
  Betriebsdaten.

  UNVERÄNDERLICH. Eine Mahnung ist hinausgegangen; ändern oder löschen kann
  sie niemand. Sie hängt an ihrer Rechnung und geht nur mit ihr (wie die
  Zahlungen) — eine ausgestellte Rechnung wird nie gelöscht, also bleibt
  auch die Mahnung für die Aufbewahrungsfrist. Darum braucht die Löschung
  eines Kunden nichts Neues: die Rechnungen samt allem daran bleiben dort
  ohnehin stehen. In die Datenauskunft des Kunden gehen sie mit der Rechnung.

  KEIN PERSONENFELD ZUR BELEGSCHAFT. Wer gemahnt hat, hielt auch die
  Rechnung bisher nicht fest; die Tabelle bleibt damit ohne Bezug zu einer
  Person im Betrieb.

  IN EINEM ZUG MIT DER RECHNUNG (`mahnung_festhalten`). Erst stand die Stufe
  an der Rechnung und kein Schreiben dazu, oder umgekehrt — beides wäre ein
  Widerspruch im Bestand.
*/

create table if not exists public.mahnungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  stufe smallint not null,
  datum date not null,
  frist date not null,
  spesen numeric(12,2) not null default 0,
  inhalt jsonb not null,
  angelegt_am timestamptz not null default now(),
  constraint mahnungen_stufe check (stufe between 1 and 3),
  constraint mahnungen_inhalt check (jsonb_typeof(inhalt) = 'object')
);

create index if not exists mahnungen_rechnung on public.mahnungen (invoice_id);
create index if not exists mahnungen_zeit on public.mahnungen (company_id, datum);

comment on table public.mahnungen is
  'Jede erzeugte Mahnung mit dem, was auf ihr stand. Unveränderlich; entsteht nur über mahnung_festhalten zusammen mit dem Mahnstand der Rechnung.';

alter table public.mahnungen enable row level security;
revoke all on public.mahnungen from public, anon, authenticated;
grant select, insert on public.mahnungen to authenticated;

-- Lesen wie die Zahlungseingänge: Büro samt Leitung, der Support im Einblick.
drop policy if exists mahnungen_lesen on public.mahnungen;
create policy mahnungen_lesen on public.mahnungen for select
  using ((company_id = (select app.lesebetrieb()) and (select app.ist_buch_oder_spitze()))
         or company_id = (select app.supportbetrieb()));
drop policy if exists mahnungen_anlegen on public.mahnungen;
create policy mahnungen_anlegen on public.mahnungen for insert
  with check (company_id = (select app.lesebetrieb()) and (select app.ist_buch_oder_spitze()));

drop trigger if exists mahnungen_support_niemals on public.mahnungen;
create trigger mahnungen_support_niemals
  before insert or update or delete on public.mahnungen
  for each row execute function app.support_niemals();

/*
  NUR ÜBER `mahnung_festhalten`. Der Merker ist dasselbe Muster wie
  `app.rechnung_legt`: PostgREST reicht keine beliebigen Einstellungen
  durch, ein Browser kann ihn nicht setzen. Der Dienstschlüssel geht vorbei
  — der Rücklauf einer Sicherung spielt zurück, was war.
*/
create or replace function app.mahnung_nur_mit_rechnung() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or coalesce(current_setting('app.mahnung_legt', true), '') = 'ja' then
    return new;
  end if;
  raise exception 'Eine Mahnung entsteht nur zusammen mit dem Mahnstand ihrer Rechnung'
    using errcode = '42501';
end;
$$;

revoke all on function app.mahnung_nur_mit_rechnung() from public, anon, authenticated;

drop trigger if exists mahnungen_nur_mit_rechnung on public.mahnungen;
create trigger mahnungen_nur_mit_rechnung before insert on public.mahnungen
  for each row execute function app.mahnung_nur_mit_rechnung();

/*
  MIT DEN RECHTEN DES AUFRUFERS (`security invoker`, wie `zeit_aufteilen`).
  Der Mahnstand der Rechnung geht durch dieselben Regeln wie bisher das
  direkte Ändern: Zeilenschutz (Büro samt Leitung), kein Schreiben durch den
  Support, Kundenart vor dem Mahnen, „Überfällig“ erst nach dem
  Zahlungsziel. Eine eigene Prüfung daneben liefe früher oder später
  auseinander.

  „ÜBERFÄLLIG“ NUR AUS „OFFEN“ — wie bisher in der App: bei einer
  angezahlten Rechnung sagt „Teilbezahlt“ mehr, und den Stand setzen dort
  die Zahlungseingänge.
*/
create or replace function public.mahnung_festhalten(
  p_invoice uuid,
  p_stufe integer,
  p_datum date,
  p_frist date,
  p_spesen numeric,
  p_inhalt jsonb
) returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  betrieb text;
  neu uuid;
begin
  if p_stufe is null or p_stufe not between 1 and 3 then
    raise exception 'Mahnstufe 1 bis 3' using errcode = '22023';
  end if;
  if p_datum is null or p_frist is null or p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    raise exception 'Tag, Frist und Inhalt der Mahnung fehlen' using errcode = '22023';
  end if;

  update public.invoices i
     set mahnstufe = p_stufe,
         gemahnt_am = p_datum,
         mahnfrist = p_frist,
         mahnspesen = p_spesen,
         payment_status = case when i.payment_status = 'Offen' then 'Überfällig' else i.payment_status end
   where i.id = p_invoice
  returning i.company_id into betrieb;

  if betrieb is null then
    raise exception 'Diese Rechnung gibt es hier nicht, oder sie darf von hier aus nicht gemahnt werden'
      using errcode = '42501';
  end if;

  perform set_config('app.mahnung_legt', 'ja', true);
  insert into public.mahnungen (company_id, invoice_id, stufe, datum, frist, spesen, inhalt)
  values (betrieb, p_invoice, p_stufe, p_datum, p_frist, coalesce(p_spesen, 0), p_inhalt)
  returning id into neu;
  perform set_config('app.mahnung_legt', '', true);

  return neu;
end;
$$;

revoke all on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb) from public, anon;
grant execute on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Datenauskunft eines Kunden — die Mahnungen stehen bei ihrer Rechnung
-- (Rumpf wie in 20261006300000_jugendschutz.sql, eine Stelle ergänzt)
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
