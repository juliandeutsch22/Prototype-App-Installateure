-- ANPASSUNGEN DES URLAUBSANSPRUCHS (Plan 10.3, Entscheidung 6 vom 03.10.2026).
--
-- Für manche Zeiten entsteht kein oder weniger Urlaub: gesetzliche
-- Elternkarenz, Präsenz- und Zivildienst, ein längerer unbezahlter Urlaub.
-- Bisher liess sich das nur über den Jahresanspruch der Person abbilden —
-- und der gilt für jedes Jahr, nicht für eines. Eine Anpassung gilt für
-- genau ein Urlaubsjahr und trägt ihren Grund.
--
-- GERECHNET WIRD IN DER APP (`urlaubsStand`): der Jahrgang eines
-- Urlaubsjahres ist der Jahresanspruch plus die Summe seiner Anpassungen.
-- Übertrag und Verjährung rechnen mit dem angepassten Jahrgang.
--
-- ENTFERNT WIRD MIT GRUND und ohne die Zeile zu löschen: eine Anpassung
-- ändert den Resturlaub, und wer später fragt, warum er einmal anders
-- stand, bekommt eine Antwort (Datenauskunft).

create table if not exists public.urlaubsanspruch_anpassungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  user_id uuid not null references public.users(id),
  -- Benannt nach dem Kalenderjahr, in dem das Urlaubsjahr beginnt (`urlaubsJahrVon`).
  urlaubsjahr integer not null,
  -- Negativ = weniger Anspruch. Zwei Stellen, wie der aliquote Anspruch.
  tage numeric(6,2) not null,
  grund text not null,
  angelegt_von_uid uuid,
  angelegt_von_name text,
  entfernt_am timestamptz,
  entfernt_von_uid uuid,
  entfernt_von_name text,
  entfernt_grund text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint urlaubsanspruch_anpassungen_jahr check (urlaubsjahr between 2000 and 2100),
  constraint urlaubsanspruch_anpassungen_tage check (tage <> 0 and abs(tage) <= 366),
  constraint urlaubsanspruch_anpassungen_grund check (length(btrim(grund)) >= 3),
  constraint urlaubsanspruch_anpassungen_entfernt check (
    (entfernt_am is null and entfernt_grund is null)
    or (entfernt_am is not null and length(btrim(coalesce(entfernt_grund, ''))) >= 3))
);

create index if not exists urlaubsanspruch_anpassungen_person
  on public.urlaubsanspruch_anpassungen (company_id, user_id, urlaubsjahr);

comment on table public.urlaubsanspruch_anpassungen is
  'Anpassung des Urlaubsanspruchs je Person und Urlaubsjahr, mit Grund. Entfernt wird mit Grund, nicht gelöscht.';

alter table public.urlaubsanspruch_anpassungen enable row level security;
revoke all on public.urlaubsanspruch_anpassungen from anon, authenticated;
grant select on public.urlaubsanspruch_anpassungen to authenticated;

/*
  LESEN: die Person, das Büro und die Spitze — und wer über Urlaub
  entscheidet. Letztere rechnen beim Entscheiden den Resturlaub der
  Antragsteller; ohne die Anpassung sähen sie einen zu hohen.
*/
drop policy if exists urlaubsanspruch_anpassungen_lesen on public.urlaubsanspruch_anpassungen;
create policy urlaubsanspruch_anpassungen_lesen on public.urlaubsanspruch_anpassungen
  for select using (
    app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze() or app.darf_urlaub_entscheiden(company_id)));

drop trigger if exists urlaubsanspruch_anpassungen_updated_at on public.urlaubsanspruch_anpassungen;
create trigger urlaubsanspruch_anpassungen_updated_at before update on public.urlaubsanspruch_anpassungen
  for each row execute function app.updated_at_setzen();
drop trigger if exists urlaubsanspruch_anpassungen_betrieb_fest on public.urlaubsanspruch_anpassungen;
create trigger urlaubsanspruch_anpassungen_betrieb_fest before update on public.urlaubsanspruch_anpassungen
  for each row execute function app.betrieb_unveraenderlich();
-- Wie Urlaub und Zeitbuchungen: der Support schreibt hier nie.
drop trigger if exists urlaubsanspruch_anpassungen_support_niemals on public.urlaubsanspruch_anpassungen;
create trigger urlaubsanspruch_anpassungen_support_niemals
  before insert or update or delete on public.urlaubsanspruch_anpassungen
  for each row execute function app.support_niemals();

/*
  ANLEGEN NUR DURCH GESCHÄFTSFÜHRUNG UND ADMINISTRATION. Der Name kommt aus
  der Tabelle, nicht vom Aufrufer — er steht dauerhaft an der Anpassung.
*/
create or replace function public.urlaubsanspruch_anpassen(
  p_user uuid,
  p_urlaubsjahr integer,
  p_tage numeric,
  p_grund text
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  person public.users;
  wer_name text;
  begruendung text := btrim(coalesce(p_grund, ''));
  kennung uuid;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Den Urlaubsanspruch passen Geschäftsführung oder Administration an'
      using errcode = '42501';
  end if;
  select * into person from public.users where id = p_user and company_id = betrieb;
  if person.id is null then
    raise exception 'Diesen Mitarbeiter gibt es nicht' using errcode = 'P0002';
  end if;
  if p_urlaubsjahr is null or p_urlaubsjahr not between 2000 and 2100 then
    raise exception 'Bitte ein Urlaubsjahr angeben' using errcode = '22023';
  end if;
  if p_tage is null or p_tage = 0 or abs(p_tage) > 366 then
    raise exception 'Bitte die Tage angeben (nicht 0)' using errcode = '22023';
  end if;
  if length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;

  select u.name into wer_name from public.users u where u.id = wer;

  insert into public.urlaubsanspruch_anpassungen (
    company_id, user_id, urlaubsjahr, tage, grund, angelegt_von_uid, angelegt_von_name)
  values (betrieb, person.id, p_urlaubsjahr, round(p_tage, 2), begruendung, wer, wer_name)
  returning id into kennung;
  return kennung;
end;
$$;

revoke all on function public.urlaubsanspruch_anpassen(uuid, integer, numeric, text) from public, anon;
grant execute on function public.urlaubsanspruch_anpassen(uuid, integer, numeric, text) to authenticated;

create or replace function public.urlaubsanspruch_anpassung_entfernen(
  p_id uuid,
  p_grund text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  a public.urlaubsanspruch_anpassungen;
  wer_name text;
  begruendung text := btrim(coalesce(p_grund, ''));
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Den Urlaubsanspruch passen Geschäftsführung oder Administration an'
      using errcode = '42501';
  end if;
  if length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  select * into a from public.urlaubsanspruch_anpassungen where id = p_id for update;
  if a.id is null or a.company_id is distinct from betrieb then
    raise exception 'Diese Anpassung gibt es nicht' using errcode = 'P0002';
  end if;
  if a.entfernt_am is not null then
    raise exception 'Diese Anpassung ist schon entfernt' using errcode = '55000';
  end if;

  select u.name into wer_name from public.users u where u.id = wer;

  update public.urlaubsanspruch_anpassungen
     set entfernt_am = now(),
         entfernt_von_uid = wer,
         entfernt_von_name = wer_name,
         entfernt_grund = begruendung
   where id = p_id;
end;
$$;

revoke all on function public.urlaubsanspruch_anpassung_entfernen(uuid, text) from public, anon;
grant execute on function public.urlaubsanspruch_anpassung_entfernen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Datenauskunft: die Anpassungen gehören dazu, samt Entfernten
-- (Rumpf wie in 20261002400000_uid_vies_und_kalender.sql, zwei Stellen ergänzt)
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
          from public.kalender_abos a where a.company_id = betrieb and a.user_id = p_id)
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
      'urlaubsansprueche_angepasst', (select count(*) from public.urlaubsanspruch_anpassungen a
        where a.company_id = betrieb and a.user_id <> p_id
          and (a.angelegt_von_uid = p_id or a.entfernt_von_uid = p_id))
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
          from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id)
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
-- Löschung je Person: die Anpassungen werden aufbewahrt wie die Urlaube
-- (Rumpf wie in 20260929140000_person_loeschen.sql, eine Stelle ergänzt)
-- ---------------------------------------------------------------------------

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
                        and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers))));

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
