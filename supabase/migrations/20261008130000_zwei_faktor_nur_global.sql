-- Nutzerentscheidung 08.10.: Einrichtung ausschließlich für den globalen Admin Pflicht.
-- Bestehende Betriebsschalter werden ignoriert, keine Änderung an Bestandsdaten.
-- Ein freiwillig eingerichteter Faktor schützt weiterhin sein Konto.
create or replace function app.zweiter_faktor_verlangt(p_uid uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_uid is not null and (
    app.zweiter_faktor_eingerichtet(p_uid)
    or exists (select 1 from public.platform_admins p where p.id = p_uid))
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
  eingerichtet boolean;
begin
  if ich is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  plattform := exists (select 1 from public.platform_admins p where p.id = ich);
  select u.role into rolle from public.users u where u.id = ich;
  eingerichtet := app.zweiter_faktor_eingerichtet(ich);
  return jsonb_build_object(
    'angeboten', plattform or coalesce(rolle in ('Administrator', 'Geschäftsführung', 'Buchhaltung'), false) or eingerichtet,
    'pflicht', plattform,
    'plattform', plattform,
    'betrieb_pflicht', false,
    'eingerichtet', eingerichtet,
    'codes_offen', case when eingerichtet then (
      select count(*) from public.zwei_faktor_codes z
       where z.user_id = ich and z.verbraucht_am is null and z.ungueltig_am is null) else 0 end,
    'code_zuletzt_verwendet', (
      select max(z.verbraucht_am) from public.zwei_faktor_codes z where z.user_id = ich));
end;
$$;

create or replace function app.zwei_faktor_pflicht_pruefen() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not app.ist_dienst() and new.zwei_faktor_pflicht
     and new.zwei_faktor_pflicht is distinct from old.zwei_faktor_pflicht then
    raise exception 'Die Zwei-Faktor-Pflicht gilt ausschließlich für den globalen Administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.zweiter_faktor_verlangt(uuid) from public, anon, authenticated;
revoke all on function app.zwei_faktor_pflicht_pruefen() from public, anon, authenticated;
revoke all on function public.mein_zweiter_faktor() from public, anon;
grant execute on function public.mein_zweiter_faktor() to authenticated;
comment on column public.companies.zwei_faktor_pflicht is
  'Altbestand; seit 08.10.2026 für Anmeldung ohne Wirkung. Pflicht nur für globale Administratoren.';
