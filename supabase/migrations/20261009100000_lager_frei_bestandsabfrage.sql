-- Kataloge überschreiten sonst das SQL-Zeitlimit durch Rechteprüfung je Artikel.
-- Zugang einmal prüfen; Reservierungsregeln und alter Aufruf bleiben erhalten.
create or replace function public.lager_frei(p_material_ids uuid[])
  returns table (material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
begin
  if betrieb is null or not app.darf(betrieb) then return; end if;
  return query
    with artikel as (
      select m.id, m.stock from public.materials m
       where m.company_id = betrieb
         and (p_material_ids is null or m.id = any(p_material_ids))
    ), zusage as (
      select o.material_id, sum(o.quantity) as menge from public.material_orders o
       where o.company_id = betrieb
         and o.material_id is not null
         and (p_material_ids is null or o.material_id = any(p_material_ids))
         and o.transaction_type = 'order' and not o.processed
         and (o.beschaffung = 'lager'
              or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
              or (o.beschaffung is null and o.status = 'Abholbereit'))
       group by o.material_id
    ), plan as (
      select p.material_id, sum(p.menge) as menge
        from public.einsatz_material_positionen p
        join public.einsatz_material e on e.id = p.einsatz_material_id
       where e.company_id = betrieb and p.material_id is not null
         and (p_material_ids is null or p.material_id = any(p_material_ids))
         and e.date >= (now() at time zone 'Europe/Vienna')::date
         and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
       group by p.material_id
    )
    select a.id, a.stock, coalesce(z.menge, 0), coalesce(pl.menge, 0),
           a.stock - coalesce(z.menge, 0) - coalesce(pl.menge, 0)
      from artikel a left join zusage z on z.material_id = a.id
      left join plan pl on pl.material_id = a.id
     order by a.id;
end;
$$;
revoke all on function public.lager_frei(uuid[]) from public, anon;
grant execute on function public.lager_frei(uuid[]) to authenticated;

create or replace function public.lager_frei()
  returns table (material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language sql stable security definer set search_path = ''
as $$ select * from public.lager_frei(null::uuid[]) $$;
revoke all on function public.lager_frei() from public, anon;
grant execute on function public.lager_frei() to authenticated;

-- Die Startseite zählt über das gesamte Lager, ohne den Großhandelskatalog
-- oder die Bildschirmgrenze der Lagerliste in den Browser zu laden.
create or replace function public.lager_knapp(p_grenze numeric)
  returns table (id uuid, name text, unit text, frei numeric, mindestmenge numeric)
  language sql stable security definer set search_path = ''
as $$
  select m.id, m.name, m.unit, s.frei, m.mindestmenge
    from public.lager_frei() s join public.materials m on m.id = s.material_id
   where m.lagerartikel
     and ((m.mindestmenge is not null and s.frei < m.mindestmenge)
       or (m.mindestmenge is null and s.frei <= p_grenze))
   order by m.id
$$;
revoke all on function public.lager_knapp(numeric) from public, anon;
grant execute on function public.lager_knapp(numeric) to authenticated;
