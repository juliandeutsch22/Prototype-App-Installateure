-- ===========================================================================
-- ZWEI-FAKTOR-ANMELDUNG (Testbericht Runde 3, H1 Teil 2)
-- ===========================================================================
--
-- Das Plattformkonto legt Betriebe an, löscht sie und setzt Passwörter über
-- den Notzugang. Bisher schützte es nur ein Passwort. Ebenso die Leitung der
-- Betriebe mit Rechnungs- und Lohndaten.
--
-- WAS GILT:
--   - Plattformkonto: zweiter Faktor (TOTP über Supabase Auth) PFLICHT. Jede
--     Plattformfunktion fragt `app.ist_plattform()`, und die verlangt jetzt
--     `aal2` im Token. Ohne zweiten Faktor ist das Konto angemeldet, darf
--     aber nichts.
--   - Administrator und Geschäftsführung: angeboten; je Betrieb als Pflicht
--     schaltbar (`companies.zwei_faktor_pflicht`).
--   - Wer einen zweiten Faktor eingerichtet hat, braucht ihn auch — gleich
--     welche Rolle. Sonst wäre er nur Zierde: das Passwort allein genügte.
--   - Durchgesetzt in `app.aktiv()`. Daran hängt jede Zeilenregel über
--     `app.angemeldet()`; ein Konto, dem der zweite Faktor fehlt, sieht und
--     ändert nichts. Die Edge Functions fragen dasselbe über
--     `public.zweiter_faktor_fehlt` (sie lesen mit dem Dienstschlüssel und
--     kämen sonst an der Regel vorbei).
--
-- WIEDERHERSTELLUNGSCODES: zehn Einmalcodes, nur als Hashwert gespeichert.
-- Ein Code entfernt den zweiten Faktor genau einmal; bei Pflicht verlangt die
-- App danach sofort die neue Einrichtung. Fehlversuche sind begrenzt.
--
-- ZURÜCKSETZEN durch den Support: nur über den Notzugang des Betriebs, mit
-- Grund und Rückruf an die Nummer aus Firmenbuch oder Gewerberegister — wie
-- beim Passwort (20260930310000), und mit Eintrag im Protokoll des Betriebs.

-- ---------------------------------------------------------------------------
-- 1. Schalter je Betrieb
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists zwei_faktor_pflicht boolean not null default false;

comment on column public.companies.zwei_faktor_pflicht is
  'Zwei-Faktor-Anmeldung ist für Administrator und Geschäftsführung Pflicht (Runde 3, H1).';

/*
  EINSCHALTEN NUR MIT EIGENEM ZWEITEN FAKTOR. Wer die Pflicht ohne ihn
  einschaltet, sperrt sich im selben Augenblick selbst aus: `app.aktiv()`
  verlangt ihn ab der nächsten Abfrage. Ausschalten geht ohne — dafür muss man
  ohnehin schon hineinkommen.
*/
create or replace function app.zwei_faktor_pflicht_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.zwei_faktor_pflicht and not coalesce(old.zwei_faktor_pflicht, false)
     and auth.uid() is not null
     and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Zuerst für das eigene Konto die Zwei-Faktor-Anmeldung einrichten — sonst sperrt die Pflicht dich selbst aus'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_zwei_faktor_pflicht on public.companies;
create trigger companies_zwei_faktor_pflicht
  before update of zwei_faktor_pflicht on public.companies
  for each row execute function app.zwei_faktor_pflicht_pruefen();

-- ---------------------------------------------------------------------------
-- 2. Fehlt der zweite Faktor?
-- ---------------------------------------------------------------------------

create or replace function app.zweiter_faktor_eingerichtet(p_uid uuid) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
     where f.user_id = p_uid and f.status = 'verified' and f.factor_type = 'totp')
$$;

/*
  Wird für dieses Konto ein zweiter Faktor verlangt — unabhängig davon, ob die
  laufende Sitzung ihn schon hat?
*/
create or replace function app.zweiter_faktor_verlangt(p_uid uuid) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select p_uid is not null and (
    app.zweiter_faktor_eingerichtet(p_uid)
    or exists (select 1 from public.platform_admins p where p.id = p_uid)
    or exists (
      select 1 from public.users u
        join public.companies c on c.id = u.company_id
       where u.id = p_uid and u.role in ('Administrator', 'Geschäftsführung')
         and c.zwei_faktor_pflicht))
$$;

create or replace function app.zweiter_faktor_fehlt_fuer(p_uid uuid, p_aal text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(p_aal, '') <> 'aal2' and app.zweiter_faktor_verlangt(p_uid)
$$;

create or replace function app.zweiter_faktor_fehlt() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.zweiter_faktor_fehlt_fuer(auth.uid(), auth.jwt() ->> 'aal')
$$;

revoke all on function app.zweiter_faktor_eingerichtet(uuid) from public, anon, authenticated;
revoke all on function app.zweiter_faktor_verlangt(uuid) from public, anon, authenticated;
revoke all on function app.zweiter_faktor_fehlt_fuer(uuid, text) from public, anon, authenticated;
revoke all on function app.zweiter_faktor_fehlt() from public, anon;
grant execute on function app.zweiter_faktor_fehlt() to authenticated, service_role;

/*
  Für die Edge Functions: sie lesen den Aufrufer mit dem Dienstschlüssel und
  bekommen das `aal` aus seinem (vom Anmeldedienst geprüften) Token.
*/
create or replace function public.zweiter_faktor_fehlt(p_uid uuid, p_aal text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.zweiter_faktor_fehlt_fuer(p_uid, p_aal)
$$;

revoke all on function public.zweiter_faktor_fehlt(uuid, text) from public, anon, authenticated;
grant execute on function public.zweiter_faktor_fehlt(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Durchsetzen: aktiv nur mit zweitem Faktor, Plattform nur mit aal2
-- ---------------------------------------------------------------------------

/* Rumpf wie 20261002100000, dazu der zweite Faktor. */
create or replace function app.aktiv() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select u.active and not app.betrieb_ruht(u.company_id) and not app.zweiter_faktor_fehlt()
       from public.users u where u.id = auth.uid()),
    case when nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '') is not null
         then false end,
    (auth.jwt() -> 'app_metadata' ->> 'active')::boolean,
    true)
$$;

revoke all on function app.aktiv() from public;
grant execute on function app.aktiv() to authenticated, anon, service_role;

/* Rumpf wie 20260926113500, dazu `aal2`: ohne zweiten Faktor ist das Plattformkonto keines. */
create or replace function app.ist_plattform() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'plattform_admin')::boolean, false)
      then coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
           and exists (select 1 from public.platform_admins p where p.id = auth.uid())
    else false
  end
$$;

revoke all on function app.ist_plattform() from public;
grant execute on function app.ist_plattform() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 4. Der eigene Stand — auch ohne zweiten Faktor lesbar
-- ---------------------------------------------------------------------------

create table if not exists public.zwei_faktor_codes (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  code_hash     text not null,
  verbraucht_am timestamptz,
  -- Gesetzt, wenn der zweite Faktor entfernt wurde: die Codes gehörten zu ihm.
  ungueltig_am  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists zwei_faktor_codes_person on public.zwei_faktor_codes (user_id);

comment on table public.zwei_faktor_codes is
  'Wiederherstellungscodes der Zwei-Faktor-Anmeldung, nur als Hashwert. Nur über Funktionen.';

alter table public.zwei_faktor_codes enable row level security;
revoke all on public.zwei_faktor_codes from anon, authenticated;

create table if not exists public.zwei_faktor_fehlversuche (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  am      timestamptz not null default now()
);

create index if not exists zwei_faktor_fehlversuche_person on public.zwei_faktor_fehlversuche (user_id, am desc);

alter table public.zwei_faktor_fehlversuche enable row level security;
revoke all on public.zwei_faktor_fehlversuche from anon, authenticated;

/*
  WAS DIE APP VOR DEM ERSTEN LESEN WISSEN MUSS. Ohne zweiten Faktor sieht
  ein Konto mit Pflicht keine Zeile — auch nicht die eigene. Diese Funktion
  sieht an der Regel vorbei und sagt nur etwas über den Aufrufer.
*/
create or replace function public.mein_zweiter_faktor() returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  plattform boolean;
  rolle text;
  betrieb_pflicht boolean := false;
  eingerichtet boolean;
begin
  if ich is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  plattform := exists (select 1 from public.platform_admins p where p.id = ich);
  select u.role, coalesce(c.zwei_faktor_pflicht, false) into rolle, betrieb_pflicht
    from public.users u left join public.companies c on c.id = u.company_id
   where u.id = ich;
  eingerichtet := app.zweiter_faktor_eingerichtet(ich);
  return jsonb_build_object(
    'angeboten', plattform or coalesce(rolle in ('Administrator', 'Geschäftsführung'), false) or eingerichtet,
    'pflicht', plattform or (coalesce(rolle in ('Administrator', 'Geschäftsführung'), false) and coalesce(betrieb_pflicht, false)),
    'plattform', plattform,
    'betrieb_pflicht', coalesce(betrieb_pflicht, false),
    'eingerichtet', eingerichtet,
    'codes_offen', case when eingerichtet then (
      select count(*) from public.zwei_faktor_codes z
       where z.user_id = ich and z.verbraucht_am is null and z.ungueltig_am is null) else 0 end,
    'code_zuletzt_verwendet', (
      select max(z.verbraucht_am) from public.zwei_faktor_codes z where z.user_id = ich));
end;
$$;

revoke all on function public.mein_zweiter_faktor() from public, anon;
grant execute on function public.mein_zweiter_faktor() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Wiederherstellungscodes
-- ---------------------------------------------------------------------------

/* Ohne Bindestrich und Leerzeichen, in Grossbuchstaben — so wird gehasht. */
create or replace function app.code_normal(p_code text) returns text
  language sql immutable
  set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.zwei_faktor_codes_erzeugen() returns text[]
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  -- Ohne 0/O, 1/I/L: Codes werden abgeschrieben.
  zeichen constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  codes text[] := '{}';
  code text;
  b bytea;
  i integer;
  j integer;
begin
  if ich is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' or not app.zweiter_faktor_eingerichtet(ich) then
    raise exception 'Neue Wiederherstellungscodes gibt es nur mit eingerichtetem und bestätigtem zweiten Faktor'
      using errcode = '42501';
  end if;
  delete from public.zwei_faktor_codes z where z.user_id = ich;
  for i in 1..10 loop
    b := extensions.gen_random_bytes(8);
    code := '';
    for j in 0..7 loop
      code := code || substr(zeichen, (get_byte(b, j) % length(zeichen)) + 1, 1);
    end loop;
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    codes := codes || code;
    insert into public.zwei_faktor_codes (user_id, code_hash)
    values (ich, encode(sha256(convert_to(app.code_normal(code), 'UTF8')), 'hex'));
  end loop;
  return codes;
end;
$$;

/*
  EIN CODE ENTFERNT DEN ZWEITEN FAKTOR — GENAU EINMAL. Danach sind alle Codes
  dieses Faktors ungültig; wer weiter einen braucht (Pflicht), richtet ihn
  sofort neu ein und bekommt neue Codes.

  Ein falscher Code wirft keinen Fehler, sondern gibt `false` zurück: sonst
  rollte der Fehler den Eintrag des Fehlversuchs mit zurück, und die Grenze
  zählte nie. Fünf Fehlversuche in einer Viertelstunde sperren.
*/
create or replace function public.zwei_faktor_code_einloesen(p_code text) returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  treffer bigint;
begin
  if ich is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if (select count(*) from public.zwei_faktor_fehlversuche v
       where v.user_id = ich and v.am > now() - interval '15 minutes') >= 5 then
    raise exception 'Zu viele falsche Codes — bitte in einer Viertelstunde wieder versuchen'
      using errcode = '42501';
  end if;
  select z.id into treffer from public.zwei_faktor_codes z
   where z.user_id = ich and z.verbraucht_am is null and z.ungueltig_am is null
     and z.code_hash = encode(sha256(convert_to(app.code_normal(p_code), 'UTF8')), 'hex')
   limit 1;
  if treffer is null then
    insert into public.zwei_faktor_fehlversuche (user_id) values (ich);
    return false;
  end if;
  update public.zwei_faktor_codes set verbraucht_am = now() where id = treffer;
  update public.zwei_faktor_codes set ungueltig_am = now()
   where user_id = ich and id <> treffer and ungueltig_am is null;
  delete from auth.mfa_factors f where f.user_id = ich;
  delete from public.zwei_faktor_fehlversuche v where v.user_id = ich;
  return true;
end;
$$;

/* Nach dem Ausschalten (der Faktor ist über Supabase Auth schon weg): die Codes gehörten zu ihm. */
create or replace function public.zwei_faktor_codes_verwerfen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if app.zweiter_faktor_eingerichtet(auth.uid()) then
    raise exception 'Der zweite Faktor ist noch eingerichtet' using errcode = '22023';
  end if;
  update public.zwei_faktor_codes set ungueltig_am = now()
   where user_id = auth.uid() and ungueltig_am is null and verbraucht_am is null;
end;
$$;

revoke all on function app.code_normal(text) from public, anon, authenticated;
revoke all on function public.zwei_faktor_codes_erzeugen() from public, anon;
revoke all on function public.zwei_faktor_code_einloesen(text) from public, anon;
revoke all on function public.zwei_faktor_codes_verwerfen() from public, anon;
grant execute on function public.zwei_faktor_codes_erzeugen() to authenticated;
grant execute on function public.zwei_faktor_code_einloesen(text) to authenticated;
grant execute on function public.zwei_faktor_codes_verwerfen() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Zurücksetzen durch den Support — über den Notzugang
-- ---------------------------------------------------------------------------

create or replace function public.plattform_leitung_mit_zweitem_faktor(p_company text)
  returns table (uid uuid, name text, rolle text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.plattform_pflicht();
  if not exists (
    select 1 from public.support_freigaben f
     where f.company_id = p_company and f.notzugang
       and f.widerrufen_am is null and f.gilt_bis > now()
  ) then
    raise exception 'Für diesen Betrieb ist kein Notzugang offen' using errcode = '42501';
  end if;
  return query
    select u.id, u.name, u.role
      from public.users u
     where u.company_id = p_company and u.active
       and u.role in ('Administrator', 'Geschäftsführung')
       and app.zweiter_faktor_eingerichtet(u.id)
     order by u.name;
end;
$$;

create or replace function public.plattform_zweiter_faktor_zuruecksetzen(
  p_uid uuid, p_grund text, p_rueckruf text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ziel public.users;
  freigabe uuid;
begin
  perform app.plattform_pflicht();
  if btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Ohne Grund kein Zurücksetzen' using errcode = '22023';
  end if;
  if btrim(coalesce(p_rueckruf, '')) = '' then
    raise exception 'Ohne Identitätsprüfung kein Zurücksetzen' using errcode = '22023';
  end if;
  select * into ziel from public.users u where u.id = p_uid;
  if ziel.id is null then
    raise exception 'Dieses Konto gibt es nicht' using errcode = 'P0002';
  end if;
  if not ziel.active then
    raise exception 'Das Konto ist deaktiviert — das entscheidet der Betrieb' using errcode = '42501';
  end if;
  if ziel.role not in ('Administrator', 'Geschäftsführung') then
    raise exception 'Nur für Konten der Administration oder Geschäftsführung' using errcode = '42501';
  end if;
  select f.id into freigabe from public.support_freigaben f
   where f.company_id = ziel.company_id and f.notzugang
     and f.widerrufen_am is null and f.gilt_bis > now()
   order by f.gilt_bis desc limit 1;
  if freigabe is null then
    raise exception 'Für diesen Betrieb ist kein Notzugang offen' using errcode = '42501';
  end if;
  if not app.zweiter_faktor_eingerichtet(p_uid) then
    raise exception 'Für dieses Konto ist kein zweiter Faktor eingerichtet' using errcode = '22023';
  end if;

  delete from auth.mfa_factors f where f.user_id = p_uid;
  update public.zwei_faktor_codes set ungueltig_am = now()
   where user_id = p_uid and ungueltig_am is null and verbraucht_am is null;
  perform app.sitzungen_beenden(p_uid);

  insert into public.support_zugriffe (company_id, freigabe_id, admin_uid, bereich)
  values (
    ziel.company_id, freigabe, auth.uid(),
    format(
      'Zwei-Faktor-Anmeldung von %s durch den Senklot-Support zurückgesetzt (alle Sitzungen beendet) — Grund: %s — Identität geprüft per Rückruf an %s',
      ziel.name, btrim(p_grund), btrim(p_rueckruf)
    )
  );
end;
$$;

revoke all on function public.plattform_leitung_mit_zweitem_faktor(text) from public, anon;
revoke all on function public.plattform_zweiter_faktor_zuruecksetzen(uuid, text, text) from public, anon;
grant execute on function public.plattform_leitung_mit_zweitem_faktor(text) to authenticated;
grant execute on function public.plattform_zweiter_faktor_zuruecksetzen(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Datenauskunft und Löschung einer Person
--    (Rumpf wie in 20261005300000_arbeitszeit_grenzen.sql, zwei Stellen ergänzt)
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
      -- Runde 3, H1: der zweite Faktor und seine Codes gehen sofort — sie dienen nur der Anmeldung.
      delete from public.zwei_faktor_codes z where z.user_id = p_id;
      delete from public.zwei_faktor_fehlversuche v where v.user_id = p_id;
      delete from auth.mfa_factors f where f.user_id = p_id;
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
