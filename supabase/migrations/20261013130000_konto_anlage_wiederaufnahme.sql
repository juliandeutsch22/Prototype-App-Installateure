-- Keine Suche allein nach E-Mail: nur der ursprüngliche, von der Edge Function
-- festgehaltene Aufrufer erhält sein Konto bei einer verlorenen Antwort zurück.
create or replace function public.konto_anlage_finden(p_email text, p_vorgang text, p_aufrufer uuid, p_betrieb text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where lower(u.email) = lower(p_email)
    and u.raw_app_meta_data->>'anlage_vorgang' = p_vorgang
    and u.raw_app_meta_data->>'anlage_aufrufer' = p_aufrufer::text
    and u.raw_app_meta_data->>'anlage_betrieb' = p_betrieb
    and u.created_at > now() - interval '24 hours'
    and not exists(select 1 from public.users p where p.id = u.id and p.company_id <> p_betrieb);
$$;
revoke all on function public.konto_anlage_finden(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.konto_anlage_finden(text,text,uuid,text) to service_role;

-- Ein verlorener Tab verhindert nicht das Fertigstellen des eigenen Profils.
-- Das unbekannte Anfangspasswort bleibt dabei unverändert.
create or replace function public.konto_anlage_offen(p_email text, p_aufrufer uuid, p_betrieb text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where lower(u.email) = lower(p_email)
    and u.raw_app_meta_data->>'anlage_aufrufer' = p_aufrufer::text
    and u.raw_app_meta_data->>'anlage_betrieb' = p_betrieb
    and not exists(select 1 from public.users p where p.id = u.id);
$$;
revoke all on function public.konto_anlage_offen(text,uuid,text) from public, anon, authenticated;
grant execute on function public.konto_anlage_offen(text,uuid,text) to service_role;
