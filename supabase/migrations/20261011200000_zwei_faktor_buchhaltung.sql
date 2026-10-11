/*
  ZWEI-FAKTOR-ANMELDUNG AUCH FÜR DIE BUCHHALTUNG (11.10.2026, Plan 17 C)

  Bisher bot die App den zweiten Faktor nur Administrator und
  Geschäftsführung an, und nur für sie galt die Pflicht des Betriebs. Die
  Buchhaltung sieht aber dasselbe Geld: Rechnungen, Zahlungen, Mahnungen, die
  Ausleitung an die Kanzlei und die Lohndaten der Mitarbeiterübersicht. Ein
  erratenes Passwort öffnete ihr Konto ohne zweite Hürde.

  WAS SICH ÄNDERT, an genau vier Stellen — sonst nichts:
    - `app.zweiter_faktor_verlangt`: die Pflicht des Betriebs umfasst die
      Buchhaltung. Daran hängen `app.aktiv()` und damit jede Zeilenregel und
      die Edge Functions (`public.zweiter_faktor_fehlt`).
    - `public.mein_zweiter_faktor`: angeboten und Pflicht auch für sie.
    - `public.plattform_leitung_mit_zweitem_faktor` und
      `public.plattform_zweiter_faktor_zuruecksetzen`: der Support kann ihn
      über den Notzugang auch für sie zurücksetzen — sonst stünde eine
      Buchhaltung ohne Telefon und Codes bei eingeschalteter Pflicht vor
      verschlossener Tür, ohne Weg zurück.

  WELCHE ROLLEN, steht jetzt an EINER Stelle (`app.zwei_faktor_rolle`). Vorher
  stand die Liste viermal da; eine fünfte Fassung in einer späteren
  Migration hätte leicht eine davon vergessen.

  Die Rümpfe sind sonst unverändert aus 20261006110000_zwei_faktor.sql.
  Bestehende Pflicht: Eine Buchhaltung ohne zweiten Faktor in einem Betrieb
  mit Pflicht richtet ihn bei der nächsten Anmeldung ein — wie die Leitung,
  als die Pflicht eingeschaltet wurde.
*/

create or replace function app.zwei_faktor_rolle(p_rolle text) returns boolean
  language sql immutable
  security definer
  set search_path = ''
as $$
  select coalesce(p_rolle in ('Administrator', 'Geschäftsführung', 'Buchhaltung'), false)
$$;

revoke all on function app.zwei_faktor_rolle(text) from public, anon, authenticated;

comment on column public.companies.zwei_faktor_pflicht is
  'Zwei-Faktor-Anmeldung ist für Administrator, Geschäftsführung und Buchhaltung Pflicht (Runde 3, H1; Buchhaltung seit 11.10.2026).';

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
       where u.id = p_uid and app.zwei_faktor_rolle(u.role)
         and c.zwei_faktor_pflicht))
$$;

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
    'angeboten', plattform or app.zwei_faktor_rolle(rolle) or eingerichtet,
    'pflicht', plattform or (app.zwei_faktor_rolle(rolle) and coalesce(betrieb_pflicht, false)),
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
       and app.zwei_faktor_rolle(u.role)
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
  if not app.zwei_faktor_rolle(ziel.role) then
    raise exception 'Nur für Konten der Administration, Geschäftsführung oder Buchhaltung' using errcode = '42501';
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

-- Rechte wie bisher (create or replace behält sie; hier ausdrücklich).
revoke all on function app.zweiter_faktor_verlangt(uuid) from public, anon, authenticated;
revoke all on function public.mein_zweiter_faktor() from public, anon;
grant execute on function public.mein_zweiter_faktor() to authenticated;
revoke all on function public.plattform_leitung_mit_zweitem_faktor(text) from public, anon;
revoke all on function public.plattform_zweiter_faktor_zuruecksetzen(uuid, text, text) from public, anon;
grant execute on function public.plattform_leitung_mit_zweitem_faktor(text) to authenticated;
grant execute on function public.plattform_zweiter_faktor_zuruecksetzen(uuid, text, text) to authenticated;
