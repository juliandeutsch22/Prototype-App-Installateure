/*
  UID BEI VIES PRÜFEN UND DEN EINSATZPLAN ALS KALENDER ABONNIEREN
  (Entscheidung vom 02.10.2026; offene Punkte E2 und aus E3 der
  Kalender-Export).

  1. UID-PRÜFUNG ÜBER VIES. Bisher prüfte die App nur die Form je EU-Staat
     (`app.uid_form_fehler`). Ob die Nummer vergeben ist, sagt der
     Abfragedienst der EU-Kommission. Abgefragt wird in der Serverfunktion
     `uid-pruefen` — VIES braucht keinen Schlüssel, aber der Browser darf ihn
     nicht direkt rufen (fremde Herkunft, und der Nachweis soll nicht vom
     Gerät kommen). Festgehalten wird jede Antwort mit Ergebnis, Zeitpunkt
     laut VIES, Name und Anschrift laut VIES und — wenn die eigene UID in den
     Firmendaten steht und VIES sie anerkennt — der Abfrage-ID. Das ist der
     Nachweis; er bleibt, auch wenn die UID am Kunden später geändert wird.

     Wer prüfen darf: wer die Kunden lesen darf (alle außer Monteuren). Die
     Prüfung ändert den Kunden nicht. Die Regeln stehen in zwei Funktionen,
     die nur der Dienstschlüssel ausführt, wie bei `konto_umstellen`.

  2. KALENDER-ABO. Eine Person bekommt eine geheime Adresse, unter der ihre
     Einsätze als Kalender (.ics) stehen; Google, Apple und Outlook holen sie
     selbst ab. Ein Kalender kann keine Anmeldung mitschicken — die Adresse
     IST die Berechtigung. Darum:
       - gespeichert wird nur der Hashwert; die Adresse sieht man einmal,
       - ein neuer Link ersetzt den alten, „Abo beenden“ löscht ihn,
       - wer deaktiviert wird, verliert das Abo sofort (Trigger), und der
         Abruf prüft bei jedem Mal, ob Konto und Betrieb aktiv sind,
       - der BETRIEB entscheidet, ob es das überhaupt gibt (ab Werk aus):
         im Kalender stehen Kundenname und Adresse, und die landen damit bei
         Google, Apple oder Microsoft. Ausschalten beendet alle Abos.
*/

-- ---------------------------------------------------------------------------
-- 1. UID-Prüfungen
-- ---------------------------------------------------------------------------

create table if not exists public.uid_pruefungen (
  id           bigint generated always as identity primary key,
  company_id   text not null references public.companies(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  uid          text not null,
  gueltig      boolean not null,
  name         text,
  adresse      text,
  abfrage_id   text,
  eigene_uid   text,
  abgefragt_am timestamptz not null,
  durch        uuid not null,
  durch_name   text,
  am           timestamptz not null default now()
);

create index if not exists uid_pruefungen_kunde
  on public.uid_pruefungen (company_id, customer_id, am desc);

comment on table public.uid_pruefungen is
  'Jede Abfrage einer Kunden-UID bei VIES mit Ergebnis, Zeitpunkt laut VIES und Abfrage-ID — der Nachweis.';

alter table public.uid_pruefungen enable row level security;
revoke all on public.uid_pruefungen from anon, authenticated;
grant select on public.uid_pruefungen to authenticated;

drop trigger if exists uid_pruefungen_kein_support_schreiben on public.uid_pruefungen;
create trigger uid_pruefungen_kein_support_schreiben
  before insert or update or delete on public.uid_pruefungen
  for each row execute function app.support_schreibt_nicht();

-- Wie die Kunden selbst (`customers_lesen`).
drop policy if exists uid_pruefungen_lesen on public.uid_pruefungen;
create policy uid_pruefungen_lesen on public.uid_pruefungen
  for select using (app.darf(company_id) and app.rolle() is distinct from 'Mitarbeiter');

create or replace function public.uid_pruefung_vorbereiten(
  p_aufrufer uuid, p_kunde uuid
) returns table (uid text, eigene_uid text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ich public.users;
  kunde public.customers;
  u text;
begin
  -- Die Tabelle entscheidet, nicht das Token.
  select * into ich from public.users x where x.id = p_aufrufer;
  if ich.id is null or ich.active is distinct from true then
    raise exception 'Kein aktives Konto' using errcode = '42501';
  end if;
  if ich.role = 'Mitarbeiter' then
    raise exception 'Eine UID prüft das Büro' using errcode = '42501';
  end if;
  if app.betrieb_ruht(ich.company_id) then
    raise exception 'Der Betrieb ist deaktiviert' using errcode = '42501';
  end if;

  -- Fremder Betrieb und unbekannte Kennung sagen dasselbe.
  select * into kunde from public.customers c where c.id = p_kunde and c.company_id = ich.company_id;
  if kunde.id is null then
    raise exception 'Diesen Kunden gibt es im eigenen Betrieb nicht' using errcode = 'P0002';
  end if;

  u := app.uid_normalisieren(kunde.vat_id);
  if u is null then
    raise exception 'Beim Kunden ist keine UID-Nummer hinterlegt' using errcode = '22023';
  end if;
  if app.uid_form_fehler(u) is not null then
    raise exception '%', app.uid_form_fehler(u) using errcode = '22023';
  end if;

  return query
    select u, app.uid_normalisieren(c.vat_id)
      from public.companies c where c.id = ich.company_id;
end;
$$;

create or replace function public.uid_pruefung_festhalten(
  p_aufrufer uuid,
  p_kunde uuid,
  p_uid text,
  p_gueltig boolean,
  p_name text,
  p_adresse text,
  p_abfrage_id text,
  p_eigene_uid text,
  p_abgefragt_am timestamptz
) returns public.uid_pruefungen
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  geprueft record;
  ich public.users;
  zeile public.uid_pruefungen;
begin
  if p_gueltig is null or p_abgefragt_am is null then
    raise exception 'Ergebnis und Zeitpunkt der Abfrage fehlen' using errcode = '22023';
  end if;
  -- Dieselben Bedingungen noch einmal, und die UID muss noch die sein, die
  -- abgefragt wurde: wer sie inzwischen geändert hat, bekäme sonst einen
  -- Nachweis für eine Nummer, die nicht mehr am Kunden steht.
  select * into geprueft from public.uid_pruefung_vorbereiten(p_aufrufer, p_kunde);
  if geprueft.uid is distinct from app.uid_normalisieren(p_uid) then
    raise exception 'Die UID-Nummer des Kunden wurde während der Abfrage geändert' using errcode = '40001';
  end if;
  select * into ich from public.users u where u.id = p_aufrufer;

  insert into public.uid_pruefungen (
    company_id, customer_id, uid, gueltig, name, adresse, abfrage_id, eigene_uid,
    abgefragt_am, durch, durch_name
  ) values (
    ich.company_id, p_kunde, geprueft.uid, p_gueltig,
    nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_adresse, '')), ''),
    nullif(btrim(coalesce(p_abfrage_id, '')), ''), app.uid_normalisieren(p_eigene_uid),
    p_abgefragt_am, p_aufrufer, ich.name
  ) returning * into zeile;
  return zeile;
end;
$$;

revoke all on function public.uid_pruefung_vorbereiten(uuid, uuid) from public, anon, authenticated;
revoke all on function public.uid_pruefung_festhalten(uuid, uuid, text, boolean, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.uid_pruefung_vorbereiten(uuid, uuid) to service_role;
grant execute on function public.uid_pruefung_festhalten(uuid, uuid, text, boolean, text, text, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Kalender-Abo
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists kalender_abo_erlaubt boolean not null default false;

comment on column public.companies.kalender_abo_erlaubt is
  'Mitarbeiter dürfen ihren Einsatzplan als Kalender abonnieren (Kundenname und Adresse '
  'gehen damit an den Kalenderdienst der Person). Ab Werk aus; Ausschalten beendet alle Abos.';

create table if not exists public.kalender_abos (
  id                bigint generated always as identity primary key,
  company_id        text not null references public.companies(id) on delete cascade,
  user_id           uuid not null unique,
  schluessel_hash   text not null unique,
  angelegt_am       timestamptz not null default now(),
  zuletzt_abgerufen timestamptz
);

create index if not exists kalender_abos_betrieb on public.kalender_abos (company_id, user_id);

comment on table public.kalender_abos is
  'Je Person höchstens ein Kalender-Abo. Gespeichert ist nur der SHA-256 des geheimen Links.';

alter table public.kalender_abos enable row level security;
revoke all on public.kalender_abos from anon, authenticated;
grant select on public.kalender_abos to authenticated;

drop trigger if exists kalender_abos_kein_support_schreiben on public.kalender_abos;
create trigger kalender_abos_kein_support_schreiben
  before insert or update or delete on public.kalender_abos
  for each row execute function app.support_schreibt_nicht();

-- Nur das eigene. Die Leitung beendet alle auf einmal über den Schalter.
drop policy if exists kalender_abos_lesen on public.kalender_abos;
create policy kalender_abos_lesen on public.kalender_abos
  for select using (app.betriebsmitglied(company_id) and user_id = auth.uid());

/*
  Einen neuen Link anlegen — der alte hört damit auf. Der Link kommt nur
  hier zurück; gespeichert wird sein Hashwert.
*/
create or replace function public.kalender_abo_anlegen() returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users;
  schluessel text;
begin
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

  -- 32 Zufallsbytes, für eine Adresse lesbar (Base64 ohne „+/=“).
  schluessel := translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  delete from public.kalender_abos a where a.user_id = ich.id;
  insert into public.kalender_abos (company_id, user_id, schluessel_hash)
  values (ich.company_id, ich.id, encode(sha256(convert_to(schluessel, 'UTF8')), 'hex'));
  return schluessel;
end;
$$;

create or replace function public.kalender_abo_beenden() returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.kalender_abos a where a.user_id = auth.uid();
$$;

revoke all on function public.kalender_abo_anlegen() from public, anon;
revoke all on function public.kalender_abo_beenden() from public, anon;
grant execute on function public.kalender_abo_anlegen() to authenticated;
grant execute on function public.kalender_abo_beenden() to authenticated;

/*
  Der Abruf — nur der Dienstschlüssel (Serverfunktion `kalender`). Gibt
  `null` zurück, wenn es den Link nicht (mehr) gibt oder er nicht mehr gilt;
  die Serverfunktion sagt in allen Fällen dasselbe.

  DIESELBEN EINSÄTZE WIE IM KALENDER VON „MEIN EINSATZPLAN“: auch an Tagen,
  an denen die Person abwesend ist — das Büro plant sie dort neu, und bis
  dahin steht im Abo, was im Plan steht. Zwei Monate zurück, ein Jahr voraus.
*/
create or replace function public.kalender_abruf(p_schluessel_hash text) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  abo public.kalender_abos;
  person public.users;
  einsaetze jsonb;
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

  update public.kalender_abos a set zuletzt_abgerufen = now() where a.id = abo.id;

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
     and e.date between (now() at time zone 'Europe/Vienna')::date - 62
                    and (now() at time zone 'Europe/Vienna')::date + 366;

  return jsonb_build_object(
    'kennung', person.id,
    'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
    'einsaetze', einsaetze);
end;
$$;

revoke all on function public.kalender_abruf(text) from public, anon, authenticated;
grant execute on function public.kalender_abruf(text) to service_role;

-- Wer deaktiviert wird, verliert das Abo sofort — nicht erst beim Abruf.
create or replace function app.kalender_abo_bei_deaktivierung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.active is distinct from true then
    delete from public.kalender_abos a where a.user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists users_kalender_abo_weg on public.users;
create trigger users_kalender_abo_weg
  after update of active on public.users
  for each row when (new.active is distinct from old.active)
  execute function app.kalender_abo_bei_deaktivierung();

-- Ausschalten beendet alle Abos; Wiedereinschalten belebt keinen alten Link.
create or replace function app.kalender_abos_beim_ausschalten() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not new.kalender_abo_erlaubt then
    delete from public.kalender_abos a where a.company_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_kalender_abos_weg on public.companies;
create trigger companies_kalender_abos_weg
  after update of kalender_abo_erlaubt on public.companies
  for each row when (old.kalender_abo_erlaubt and not new.kalender_abo_erlaubt)
  execute function app.kalender_abos_beim_ausschalten();

revoke all on function app.kalender_abo_bei_deaktivierung() from public, anon, authenticated;
revoke all on function app.kalender_abos_beim_ausschalten() from public, anon, authenticated;

-- Der Hashwert gehört nicht in den Auszug des Betriebs — wie die Push-Tokens.
create or replace function app.auszug_ausgenommen(p_tabelle text) returns text[]
  language sql immutable
  set search_path = ''
as $$
  select case p_tabelle
           when 'user_prefs' then array['push_tokens']
           when 'kalender_abos' then array['schluessel_hash']
           else '{}'::text[]
         end
$$;

-- ---------------------------------------------------------------------------
-- 3. Die Datenauskunft — mit Kalender-Abo und UID-Prüfungen
--    (Rumpf wie in 20261002200000_konto_umstellen.sql, drei Stellen ergänzt)
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
        where u.company_id = betrieb and u.durch = p_id)
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
