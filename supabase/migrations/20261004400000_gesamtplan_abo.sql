-- DER GESAMTE EINSATZPLAN ALS KALENDER-ABO FÜR DIE LEITUNG (Plan 10.4, PR B;
-- Abschnitt 5 des Stands) — und die Termine in beiden Abos.
--
-- Geschäftsführung, Administrator und Projektleitung sehen den ganzen Plan
-- in der App ohnehin; das Abo erspart nur das Öffnen. Je Baustelle und Tag
-- EIN Eintrag, nicht je Person: bei zehn Leuten bliebe der Kalender sonst
-- unlesbar. Keine Abwesenheiten (entschieden am 03.10.2026) — es geht um
-- „wer ist heute wo", nicht um Urlaub oder Krankenstand.
--
-- ZWEI GETRENNTE LINKS: das eigene Abo bleibt, wie es ist; der Gesamtplan
-- ist ein zweites, mit eigenem Schlüssel.

alter table public.kalender_abos add column if not exists art text not null default 'eigen';
alter table public.kalender_abos drop constraint if exists kalender_abos_art;
alter table public.kalender_abos add constraint kalender_abos_art check (art in ('eigen', 'gesamt'));
alter table public.kalender_abos drop constraint if exists kalender_abos_user_id_key;
alter table public.kalender_abos drop constraint if exists kalender_abos_person_art;
alter table public.kalender_abos add constraint kalender_abos_person_art unique (user_id, art);

comment on table public.kalender_abos is
  'Je Person höchstens ein eigenes Kalender-Abo und eines für den Gesamtplan. Gespeichert ist nur der SHA-256 des geheimen Links.';

/*
  Ist die Einsatzplanung im Betrieb an? Dieselbe Regel wie `aktiveModule` in
  der App: gespeichert ist nur die Abweichung, ab Werk ist sie an.
*/
create or replace function app.einsatzplanung_an(p_betrieb text) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((select (c.modules ->> 'einsatzplanung')::boolean
                     from public.companies c where c.id = p_betrieb), true)
$$;

/*
  Wer den Gesamtplan abonnieren darf: wer die Einsatzplanung sieht — in der
  App `/assignments`, also Projektleitung, Geschäftsführung, Administrator —,
  solange das Modul an ist. Geprüft beim Anlegen UND bei jedem Abruf.
*/
create or replace function app.sieht_gesamtplan(p_person uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = p_person
       and u.active is not distinct from true
       and u.role in ('Projektleiter', 'Geschäftsführung', 'Administrator')
       and app.einsatzplanung_an(u.company_id))
$$;

revoke all on function app.einsatzplanung_an(text) from public, anon, authenticated;
revoke all on function app.sieht_gesamtplan(uuid) from public, anon, authenticated;

-- Die Art kommt dazu. Ohne Angabe bleibt es das eigene Abo — so ruft die
-- ausgelieferte App bis zum nächsten Laden weiter auf.
drop function if exists public.kalender_abo_anlegen();
drop function if exists public.kalender_abo_beenden();

create or replace function public.kalender_abo_anlegen(p_art text default 'eigen') returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users;
  schluessel text;
begin
  if p_art is null or p_art not in ('eigen', 'gesamt') then
    raise exception 'Unbekannte Art: % — erwartet „eigen" oder „gesamt"', p_art using errcode = '22023';
  end if;
  select * into ich from public.users u where u.id = auth.uid();
  if ich.id is null or ich.active is distinct from true
     or not app.betriebsmitglied(ich.company_id) then
    raise exception 'Kein aktives Konto in diesem Betrieb' using errcode = '42501';
  end if;
  if app.betrieb_ruht(ich.company_id) then
    raise exception 'Der Betrieb ist deaktiviert' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c
                  where c.id = ich.company_id and c.kalender_abo_erlaubt) then
    raise exception 'Das Kalender-Abo ist in diesem Betrieb nicht eingeschaltet' using errcode = '42501';
  end if;
  if p_art = 'gesamt' and not app.sieht_gesamtplan(ich.id) then
    raise exception 'Den ganzen Einsatzplan abonniert nur, wer die Einsatzplanung sieht' using errcode = '42501';
  end if;

  -- 32 Zufallsbytes, für eine Adresse lesbar (Base64 ohne „+/=“).
  schluessel := translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  delete from public.kalender_abos a where a.user_id = ich.id and a.art = p_art;
  insert into public.kalender_abos (company_id, user_id, art, schluessel_hash)
  values (ich.company_id, ich.id, p_art, encode(sha256(convert_to(schluessel, 'UTF8')), 'hex'));
  return schluessel;
end;
$$;

create or replace function public.kalender_abo_beenden(p_art text default 'eigen') returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.kalender_abos a where a.user_id = auth.uid() and a.art = p_art;
$$;

revoke all on function public.kalender_abo_anlegen(text) from public, anon;
revoke all on function public.kalender_abo_beenden(text) from public, anon;
grant execute on function public.kalender_abo_anlegen(text) to authenticated;
grant execute on function public.kalender_abo_beenden(text) to authenticated;

/*
  Ein Termin, wie er im Abo steht: Art, Tag, Uhrzeit, Ort, Notiz und die
  Teilnehmer mit Namen. Für beide Abos gleich — ein Termin sieht im eigenen
  Kalender aus wie im Gesamtplan.
*/
create or replace function app.termin_fuers_abo(t public.termine) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'art', t.art,
    'datum', t.datum,
    'von', to_char(t.zeit_von, 'HH24:MI'),
    'bis', to_char(t.zeit_bis, 'HH24:MI'),
    'baustelle', t.project_number,
    'ort', t.ort_name,
    'adresse', t.ort_adresse,
    'notiz', t.notiz,
    'teilnehmer', (select coalesce(jsonb_agg(u.name order by u.name), '[]'::jsonb)
                     from public.users u where u.id = any(t.teilnehmer)))
$$;

revoke all on function app.termin_fuers_abo(public.termine) from public, anon, authenticated;

/*
  Der Abruf — nur der Dienstschlüssel (Serverfunktion `kalender`). Gibt
  `null` zurück, wenn es den Link nicht (mehr) gibt oder er nicht mehr gilt;
  die Serverfunktion sagt in allen Fällen dasselbe. Zwei Monate zurück, ein
  Jahr voraus.

  EIGENES ABO: dieselben Einsätze wie im Kalender von „Mein Einsatzplan“ —
  auch an Tagen, an denen die Person abwesend ist; das Büro plant sie dort
  neu. Dazu die Termine wie dort: die, an denen sie teilnimmt, und die auf
  einer Baustelle, auf der sie an dem Tag eingeteilt ist.

  GESAMTPLAN: je Baustelle und Tag die Eingeteilten mit Einstufung und
  Uhrzeit, dazu alle Termine des Betriebs. Ob die Person ihn noch sehen
  darf, wird bei JEDEM Abruf neu gefragt.
*/
create or replace function public.kalender_abruf(p_schluessel_hash text) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  abo public.kalender_abos;
  person public.users;
  von date := (now() at time zone 'Europe/Vienna')::date - 62;
  bis date := (now() at time zone 'Europe/Vienna')::date + 366;
  einsaetze jsonb;
  baustellen jsonb;
  termine jsonb;
begin
  select * into abo from public.kalender_abos a where a.schluessel_hash = p_schluessel_hash;
  if abo.id is null then
    return null;
  end if;
  select * into person from public.users u where u.id = abo.user_id and u.company_id = abo.company_id;
  if person.id is null or person.active is distinct from true
     or app.betrieb_ruht(abo.company_id)
     or not exists (select 1 from public.companies c
                     where c.id = abo.company_id and c.kalender_abo_erlaubt) then
    return null;
  end if;
  if abo.art = 'gesamt' and not app.sieht_gesamtplan(person.id) then
    return null;
  end if;

  update public.kalender_abos a set zuletzt_abgerufen = now() where a.id = abo.id;

  if abo.art = 'gesamt' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'datum', g.date,
             'baustelle', g.project_number,
             'kunde', g.customer_name,
             'adresse', g.address,
             'leute', g.leute)
             order by g.date, g.project_number), '[]'::jsonb)
      into baustellen
      from (
        select e.date, e.project_number, b.customer_name, b.address,
               jsonb_agg(jsonb_build_object(
                 'name', coalesce(u.name, e.user_name),
                 'helfer', coalesce(e.as_helper, false),
                 'einstufung', u.einstufung,
                 'von', to_char(e.zeit_von, 'HH24:MI'),
                 'bis', to_char(e.zeit_bis, 'HH24:MI'))
                 order by coalesce(u.name, e.user_name)) as leute
          from public.assignments e
          left join public.projects b
            on b.company_id = e.company_id and b.project_number = e.project_number
          left join public.users u on u.id = e.user_id
         where e.company_id = abo.company_id
           and e.date between von and bis
         group by e.date, e.project_number, b.customer_name, b.address
      ) g;

    select coalesce(jsonb_agg(app.termin_fuers_abo(t) order by t.datum, t.zeit_von nulls first), '[]'::jsonb)
      into termine
      from public.termine t
     where t.company_id = abo.company_id
       and t.datum between von and bis;

    return jsonb_build_object(
      'art', 'gesamt',
      'kennung', person.id,
      'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
      'baustellen', baustellen,
      'termine', termine);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'datum', e.date,
           'baustelle', e.project_number,
           'von', to_char(e.zeit_von, 'HH24:MI'),
           'bis', to_char(e.zeit_bis, 'HH24:MI'),
           'helfer', coalesce(e.as_helper, false),
           'kommentar', e.comment,
           'kunde', b.customer_name,
           'adresse', b.address,
           'ansprechpartner', b.contact_name,
           'telefon', b.contact_phone)
           order by e.date, e.zeit_von nulls first, e.project_number), '[]'::jsonb)
    into einsaetze
    from public.assignments e
    left join public.projects b
      on b.company_id = e.company_id and b.project_number = e.project_number
   where e.company_id = abo.company_id
     and e.user_id = abo.user_id
     and e.date between von and bis;

  select coalesce(jsonb_agg(app.termin_fuers_abo(t) order by t.datum, t.zeit_von nulls first), '[]'::jsonb)
    into termine
    from public.termine t
   where t.company_id = abo.company_id
     and t.datum between von and bis
     and (abo.user_id = any(t.teilnehmer)
          or (t.project_number is not null and exists (
                select 1 from public.assignments a
                 where a.company_id = t.company_id and a.date = t.datum
                   and a.project_number = t.project_number and a.user_id = abo.user_id)));

  return jsonb_build_object(
    'art', 'eigen',
    'kennung', person.id,
    'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
    'einsaetze', einsaetze,
    'termine', termine);
end;
$$;

revoke all on function public.kalender_abruf(text) from public, anon, authenticated;
grant execute on function public.kalender_abruf(text) to service_role;

/*
  DAS GESAMTPLAN-ABO ENDET, sobald die Person die Einsatzplanung nicht mehr
  sieht — Rolle gewechselt — oder das Modul ausgeschaltet wird. Sofort, nicht
  erst beim nächsten Abruf (der fragt trotzdem noch einmal). Deaktivierung
  und Schalter „Kalender-Abo“ beenden schon bisher beide Arten.
*/
create or replace function app.gesamtplan_abo_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'users' then
    if not app.sieht_gesamtplan(new.id) then
      delete from public.kalender_abos a where a.user_id = new.id and a.art = 'gesamt';
    end if;
  elsif not app.einsatzplanung_an(new.id) then
    delete from public.kalender_abos a where a.company_id = new.id and a.art = 'gesamt';
  end if;
  return null;
end;
$$;
revoke all on function app.gesamtplan_abo_pruefen() from public, anon, authenticated;

drop trigger if exists users_gesamtplan_abo on public.users;
create trigger users_gesamtplan_abo
  after update of role on public.users
  for each row when (old.role is distinct from new.role)
  execute function app.gesamtplan_abo_pruefen();

drop trigger if exists companies_gesamtplan_abo on public.companies;
create trigger companies_gesamtplan_abo
  after update of modules on public.companies
  for each row when (old.modules is distinct from new.modules)
  execute function app.gesamtplan_abo_pruefen();

-- ---------------------------------------------------------------------------
-- Datenauskunft — die Art des Abos dazu
-- (Rumpf wie in 20261004300000_termine.sql, eine Stelle ergänzt)
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
