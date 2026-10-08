-- Nur die Priorität ändern; weder Beschaffung noch Abschluss oder Lager berühren.
create or replace function public.anforderung_eilig(p_id uuid, p_eilig boolean) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
begin
  select * into a from public.material_orders where id = p_id for update;
  if not found or not coalesce(
    (app.betriebsmitglied(a.company_id) or app.support_schreibt(a.company_id))
      and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()), false) then
    raise exception 'Diese Anforderung kann nicht geändert werden' using errcode = '42501';
  end if;
  if p_eilig is null then
    raise exception 'Die Priorität fehlt' using errcode = '22023';
  end if;
  if a.status = 'Erledigt' or a.transaction_type = 'return' then
    raise exception 'Nur laufende Anforderungen können als eilig markiert werden' using errcode = '55000';
  end if;
  if a.is_urgent is distinct from p_eilig then
    update public.material_orders set is_urgent = p_eilig where id = p_id;
  end if;
end;
$$;
revoke all on function public.anforderung_eilig(uuid, boolean) from public, anon;
grant execute on function public.anforderung_eilig(uuid, boolean) to authenticated;
