-- TESTBERICHT 30.09.2026, P2 — EIN AUSGESPERRTER BETRIEB WIRD ÜBER DEN
-- NOTZUGANG WIEDERHERGESTELLT, UND ZWAR ENG.
--
-- Der Notzugang liest und schreibt nichts (`app.support_schreibt_nicht`).
-- Hat ein Betrieb nur Leitungskonten mit Benutzername und hat deren Inhaber
-- das Passwort vergessen, kommt er ohne Hilfe nicht mehr hinein — „Passwort
-- vergessen“ per Mail gibt es für Benutzernamen nicht.
--
-- Deshalb KEINE allgemeine Schreibfreigabe, sondern zwei Funktionen, die
-- ausschliesslich der Dienstschlüssel ausführt — also nur die Edge Function
-- `notzugang-passwort`, die davor Anmeldung und Plattformtabelle prüft:
--
--   1. nur für Benutzernamen-Konten
--   2. nur für aktive Konten mit Administration oder Geschäftsführung
--   3. nur solange für diesen Betrieb ein Notzugang offen ist
--   4. mit Pflichtgrund und dokumentierter Identitätsprüfung (Rückruf an die
--      Nummer aus Firmenbuch oder Gewerberegister; entschieden am 30.09.)
--   5. alle offenen Sitzungen des Kontos werden beendet
--   6. Eintrag im Protokoll des Betriebs (`support_zugriffe`), den die
--      Leitung unter Supportzugang liest
--
-- Das Passwort selbst setzt die Function im Anmeldedienst: ein einmaliges
-- Startpasswort, das beim nächsten Anmelden ersetzt werden muss.

-- ---------------------------------------------------------------------------
-- Welche Konten in Frage kommen — für die Auswahl auf der Plattformseite
-- ---------------------------------------------------------------------------

create or replace function public.plattform_leitungskonten(p_company text)
  returns table (uid uuid, name text, rolle text, benutzername text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Nur die Plattform' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.support_freigaben f
     where f.company_id = p_company and f.notzugang
       and f.widerrufen_am is null and f.gilt_bis > now()
  ) then
    raise exception 'Für diesen Betrieb ist kein Notzugang offen' using errcode = '42501';
  end if;
  return query
    select u.id, u.name, u.role,
           split_part(lower(u.email), '@', 1)
      from public.users u
     where u.company_id = p_company and u.active
       and u.role in ('Administrator', 'Geschäftsführung')
       and lower(u.email) like '%@benutzer.senklot.invalid'
     order by u.name;
end;
$$;

revoke all on function public.plattform_leitungskonten(text) from public, anon;
grant execute on function public.plattform_leitungskonten(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Prüfen, bevor die Function das Passwort setzt
-- ---------------------------------------------------------------------------

create or replace function public.notzugang_passwort_pruefen(p_admin uuid, p_uid uuid)
  returns table (company_id text, freigabe_id uuid, name text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ziel public.users;
  freigabe uuid;
begin
  if not exists (select 1 from public.platform_admins p where p.id = p_admin) then
    raise exception 'Nur der globale Administrator' using errcode = '42501';
  end if;
  select * into ziel from public.users u where u.id = p_uid;
  if ziel.id is null then
    raise exception 'Dieses Konto gibt es nicht' using errcode = 'P0002';
  end if;
  if not ziel.active then
    raise exception 'Das Konto ist deaktiviert — das entscheidet der Betrieb' using errcode = '42501';
  end if;
  if ziel.role not in ('Administrator', 'Geschäftsführung') then
    raise exception 'Nur für Konten der Administration oder Geschäftsführung — alle anderen setzt der Betrieb selbst zurück'
      using errcode = '42501';
  end if;
  if lower(ziel.email) not like '%@benutzer.senklot.invalid' then
    raise exception 'Dieses Konto meldet sich mit E-Mail an — es setzt sein Passwort über „Passwort vergessen“ selbst'
      using errcode = '42501';
  end if;
  select f.id into freigabe from public.support_freigaben f
   where f.company_id = ziel.company_id and f.notzugang
     and f.widerrufen_am is null and f.gilt_bis > now()
   order by f.gilt_bis desc limit 1;
  if freigabe is null then
    raise exception 'Für diesen Betrieb ist kein Notzugang offen' using errcode = '42501';
  end if;
  return query select ziel.company_id, freigabe, ziel.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Festhalten, nachdem das Passwort gesetzt ist
-- ---------------------------------------------------------------------------

create or replace function public.notzugang_passwort_festhalten(
  p_admin uuid, p_uid uuid, p_grund text, p_rueckruf text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  geprueft record;
begin
  if btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Ohne Grund kein neues Passwort' using errcode = '22023';
  end if;
  if btrim(coalesce(p_rueckruf, '')) = '' then
    raise exception 'Ohne Identitätsprüfung kein neues Passwort' using errcode = '22023';
  end if;
  -- Dieselben Bedingungen noch einmal: zwischen Prüfen und Festhalten kann
  -- der Betrieb den Notzugang beendet haben.
  select * into geprueft from public.notzugang_passwort_pruefen(p_admin, p_uid);

  perform app.sitzungen_beenden(p_uid);

  insert into public.support_zugriffe (company_id, freigabe_id, admin_uid, bereich)
  values (
    geprueft.company_id, geprueft.freigabe_id, p_admin,
    format(
      'Passwort von %s durch den Senklot-Support neu gesetzt (Startpasswort, alle Sitzungen beendet) — Grund: %s — Identität geprüft per Rückruf an %s',
      geprueft.name, btrim(p_grund), btrim(p_rueckruf)
    )
  );
end;
$$;

-- AUSSCHLIESSLICH DER DIENSTSCHLÜSSEL. Kein angemeldetes Konto, auch nicht
-- das Plattformkonto selbst, ruft diese beiden direkt.
revoke all on function public.notzugang_passwort_pruefen(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notzugang_passwort_festhalten(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.notzugang_passwort_pruefen(uuid, uuid) to service_role;
grant execute on function public.notzugang_passwort_festhalten(uuid, uuid, text, text) to service_role;
