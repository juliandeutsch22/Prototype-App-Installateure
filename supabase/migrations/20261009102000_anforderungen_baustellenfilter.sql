-- Filterwerte dürfen weder von der geladenen Bildschirmseite noch von
-- deren Suchtreffern abhängen. Dieselben Leserechte wie material_orders.
create or replace function public.anforderungen_baustellen(p_company text)
  returns table (project_number text)
  language plpgsql stable security definer set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  alle boolean := app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung();
begin
  if not coalesce(app.darf(p_company), false) then return; end if;
  return query
    select distinct o.project_number from public.material_orders o
     where o.company_id = p_company and o.transaction_type <> 'return'
       and o.project_number is not null and o.project_number <> ''
       and (alle or o.user_id = ich)
     order by o.project_number;
end;
$$;
revoke all on function public.anforderungen_baustellen(text) from public, anon;
grant execute on function public.anforderungen_baustellen(text) to authenticated;
