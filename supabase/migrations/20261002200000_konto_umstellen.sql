/*
  KONTO UMSTELLEN — zwischen E-Mail und Benutzername (Entscheidung vom
  02.10.2026; offene Punkte E5).

  Ein Konto meldet sich entweder mit E-Mail an oder mit einem Benutzernamen
  (dann trägt es eine Kunstadresse auf `.invalid`, siehe
  `shared/benutzername.ts`). Bisher ließ sich das nach dem Anlegen nicht mehr
  ändern; ein neues Konto hätte alle Buchungen am alten gelassen.

  Umgestellt wird in der Serverfunktion `konto-umstellen`, weil nur der
  Dienstschlüssel die Anmeldeadresse ändert. Die Regeln stehen HIER, in zwei
  Funktionen, die nur der Dienstschlüssel ausführt — wie beim Notzugang:

    konto_umstellen_pruefen   wer darf wen in welche Richtung
    konto_umstellen_festhalten  Belegschaftszeile nachziehen, Protokoll,
                                beim Weg auf den Benutzernamen alle Sitzungen
                                beenden

  WARUM DER WEG AUF DEN BENUTZERNAMEN SITZUNGEN BEENDET UND EINEN GRUND
  VERLANGT. Danach kennt die Leitung das Startpasswort des Kontos. Bei einem
  Benutzernamen-Konto kann sie das ohnehin (`passwort-vergeben`); bei einem
  Konto mit E-Mail war genau das bisher ausgeschlossen. Darum geschieht es
  nicht still: die Person wird überall abgemeldet und merkt es beim nächsten
  Griff zum Telefon, der Grund steht im Protokoll, und das Protokoll liest die
  Leitung in der Akte. Das eigene Konto lässt sich so nicht umstellen.

  DER WEG AUF DIE E-MAIL beendet nichts: das Passwort bleibt, die Person kann
  sich ab sofort mit der Adresse anmelden, und die Serverfunktion schickt eine
  Passwort-Mail an die neue Adresse — kommt sie an, stimmt die Adresse. Das
  eigene Konto darf man so umstellen: genau das empfiehlt die Startseite,
  wenn die einzige Leitung keine E-Mail hat.

  DAS PROTOKOLL trägt keine Adressen — die aktuelle steht an der Person, eine
  frühere braucht niemand. Es gibt keine Richtlinie zum Schreiben, Ändern oder
  Löschen; nur diese Funktionen schreiben hinein. Es geht in die Datenauskunft
  der Person (Art. 15), und dort jetzt auch die Lagerbewegungen, die jemand
  erfasst hat — sie fehlten seit dem 30.09.2026.
*/

-- ---------------------------------------------------------------------------
-- 1. Das Protokoll
-- ---------------------------------------------------------------------------

create table if not exists public.konto_umstellungen (
  id         bigint generated always as identity primary key,
  company_id text not null references public.companies(id) on delete cascade,
  user_id    uuid not null,
  nach       text not null check (nach in ('mail', 'benutzername')),
  grund      text,
  durch      uuid not null,
  durch_name text,
  am         timestamptz not null default now()
);

create index if not exists konto_umstellungen_person
  on public.konto_umstellungen (company_id, user_id, am desc);

comment on table public.konto_umstellungen is
  'Wer wann ein Konto zwischen E-Mail und Benutzername umgestellt hat, mit Grund. Ohne Adressen.';

alter table public.konto_umstellungen enable row level security;
revoke all on public.konto_umstellungen from anon, authenticated;
grant select on public.konto_umstellungen to authenticated;

-- Wie an jeder Betriebstabelle: ein Supportzugang schreibt hier nie, auch
-- nicht über eine künftige Richtlinie.
drop trigger if exists konto_umstellungen_kein_support_schreiben on public.konto_umstellungen;
create trigger konto_umstellungen_kein_support_schreiben
  before insert or update or delete on public.konto_umstellungen
  for each row execute function app.support_schreibt_nicht();

drop policy if exists konto_umstellungen_lesen on public.konto_umstellungen;
create policy konto_umstellungen_lesen on public.konto_umstellungen
  for select using (app.darf(company_id) and app.ist_spitze());

-- ---------------------------------------------------------------------------
-- 2. Prüfen und Festhalten — nur der Dienstschlüssel
-- ---------------------------------------------------------------------------

create or replace function public.konto_umstellen_pruefen(
  p_aufrufer uuid, p_uid uuid, p_nach text
) returns table (company_id text, name text, rolle text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ich public.users;
  ziel public.users;
begin
  if p_nach is null or p_nach not in ('mail', 'benutzername') then
    raise exception 'Unbekannte Richtung: erwartet „mail“ oder „benutzername“' using errcode = '22023';
  end if;

  -- Die Tabelle entscheidet, nicht das Token: wer heute früh zurückgestuft
  -- wurde, stellt bis Mittag nichts mehr um.
  select * into ich from public.users u where u.id = p_aufrufer;
  if ich.id is null or ich.active is distinct from true then
    raise exception 'Kein aktives Konto' using errcode = '42501';
  end if;
  if ich.role not in ('Geschäftsführung', 'Administrator') then
    raise exception 'Ein Konto stellt nur die Geschäftsführung oder die Administration um' using errcode = '42501';
  end if;
  if app.betrieb_ruht(ich.company_id) then
    raise exception 'Der Betrieb ist deaktiviert' using errcode = '42501';
  end if;

  -- Fremder Betrieb und unbekannte Kennung sagen dasselbe.
  select * into ziel from public.users u where u.id = p_uid and u.company_id = ich.company_id;
  if ziel.id is null then
    raise exception 'Diesen Benutzer gibt es im eigenen Betrieb nicht' using errcode = 'P0002';
  end if;
  if ziel.role = 'Administrator' and ich.role <> 'Administrator' then
    raise exception 'Das Konto eines Administrators stellt nur ein Administrator um' using errcode = '42501';
  end if;
  if p_nach = 'benutzername' and ziel.id = ich.id then
    raise exception 'Das eigene Konto lässt sich nicht auf einen Benutzernamen umstellen — das macht eine zweite Leitung'
      using errcode = '42501';
  end if;

  return query select ziel.company_id, ziel.name, ziel.role;
end;
$$;

create or replace function public.konto_umstellen_festhalten(
  p_aufrufer uuid, p_uid uuid, p_nach text, p_anmeldung text, p_grund text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  geprueft record;
  wer text;
begin
  if p_nach = 'benutzername' and btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Ohne Grund keine Umstellung auf einen Benutzernamen' using errcode = '22023';
  end if;
  if btrim(coalesce(p_anmeldung, '')) = '' then
    raise exception 'Die neue Anmeldung fehlt' using errcode = '22023';
  end if;
  -- Dieselben Bedingungen noch einmal: zwischen Prüfen und Festhalten kann
  -- sich die Rolle des Aufrufers geändert haben.
  select * into geprueft from public.konto_umstellen_pruefen(p_aufrufer, p_uid, p_nach);
  select u.name into wer from public.users u where u.id = p_aufrufer;

  update public.users u set email = lower(btrim(p_anmeldung)) where u.id = p_uid;

  if p_nach = 'benutzername' then
    perform app.sitzungen_beenden(p_uid);
  end if;

  insert into public.konto_umstellungen (company_id, user_id, nach, grund, durch, durch_name)
  values (geprueft.company_id, p_uid, p_nach, nullif(btrim(coalesce(p_grund, '')), ''), p_aufrufer, wer);
end;
$$;

revoke all on function public.konto_umstellen_pruefen(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.konto_umstellen_festhalten(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.konto_umstellen_pruefen(uuid, uuid, text) to service_role;
grant execute on function public.konto_umstellen_festhalten(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Die Datenauskunft je Person — mit Kontoumstellungen und Lagerbewegungen
--    (Rumpf wie in 20260929130000_datenauskunft.sql, zwei Stellen ergänzt)
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
          from public.konto_umstellungen k where k.company_id = betrieb and k.user_id = p_id)
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
        where k.company_id = betrieb and k.durch = p_id and k.user_id <> p_id)
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
                or (w.customer_id is null and lower(btrim(w.customer_name)) = lower(btrim(kunde.name)))))
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
