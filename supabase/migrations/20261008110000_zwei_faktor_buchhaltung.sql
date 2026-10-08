-- Buchhaltung erhält denselben vollständigen Faktor- und Wiederherstellungsweg.
-- Bestehende Betriebspflichten bleiben unverändert; keine pauschale Umschaltung.


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
       where u.id = p_uid and u.role in ('Administrator', 'Geschäftsführung', 'Buchhaltung')
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
    'angeboten', plattform or coalesce(rolle in ('Administrator', 'Geschäftsführung', 'Buchhaltung'), false) or eingerichtet,
    'pflicht', plattform or (coalesce(rolle in ('Administrator', 'Geschäftsführung', 'Buchhaltung'), false) and coalesce(betrieb_pflicht, false)),
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
       and u.role in ('Administrator', 'Geschäftsführung', 'Buchhaltung')
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
  if ziel.role not in ('Administrator', 'Geschäftsführung', 'Buchhaltung') then
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

revoke all on function app.zweiter_faktor_verlangt(uuid) from public, anon, authenticated;
revoke all on function public.mein_zweiter_faktor() from public, anon;
revoke all on function public.plattform_leitung_mit_zweitem_faktor(text) from public, anon;
revoke all on function public.plattform_zweiter_faktor_zuruecksetzen(uuid, text, text) from public, anon;
grant execute on function public.mein_zweiter_faktor() to authenticated;
grant execute on function public.plattform_leitung_mit_zweitem_faktor(text) to authenticated;
grant execute on function public.plattform_zweiter_faktor_zuruecksetzen(uuid, text, text) to authenticated;

comment on column public.companies.zwei_faktor_pflicht is
  'Zwei-Faktor-Anmeldung ist für Administrator, Geschäftsführung und Buchhaltung Pflicht.';
