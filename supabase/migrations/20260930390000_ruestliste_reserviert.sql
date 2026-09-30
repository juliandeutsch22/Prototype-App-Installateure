/*
  DIE RÜSTLISTE RESERVIERT BESTAND (Testbericht 30.09.2026, M32, G19)

  WAS DER BERICHT FAND. Die eingeplanten Stück einer Rüstliste konnte eine
  andere Anforderung wegnehmen, und der Monteur sah „5 Stk (knapp)“, obwohl
  nur 2 frei waren.

  WAS JETZT GILT.
  - Katalogartikel auf einer Rüstliste ab heute (Wiener Datum) gelten als
    reserviert, wie eine zugesagte Anforderung. „Aus Lager“ sagt nur zu, was
    nach beiden frei ist (`app.lager_zugesagt`, geprüft in
    `app.aus_lager_pruefen`).
  - Nach dem Einsatztag endet die Reservierung. Die Rüstliste bucht den
    Bestand weiterhin nicht ab — das tun Abholung und Inventur.
  - `lager_frei()` nennt je Artikel Bestand, Zugesagtes, Geplantes und das
    Freie — für alle im Betrieb, auch für den Monteur. Ein Abzug einer Zahl
    in der Ansicht würde sonst anders rechnen als die Datenbank.
*/

create or replace function app.ruest_reserviert(p_material uuid)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(sum(p.menge), 0)
    from public.einsatz_material_positionen p
    join public.einsatz_material e on e.id = p.einsatz_material_id
   where p.material_id = p_material
     and e.date >= (now() at time zone 'Europe/Vienna')::date
$$;

revoke all on function app.ruest_reserviert(uuid) from public, anon;
grant execute on function app.ruest_reserviert(uuid) to authenticated;

/* Wie bisher die offenen Zusagen — und dazu die geplanten Rüstlisten. */
create or replace function app.lager_zugesagt(p_material uuid, p_ausser uuid)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select (
  select coalesce(sum(o.quantity), 0)
    from public.material_orders o
   where o.material_id = p_material
     and o.id <> p_ausser
     and o.transaction_type = 'order'
     and not o.processed
     and (o.beschaffung = 'lager'
          or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
          or (o.beschaffung is null and o.status = 'Abholbereit'))
  ) + app.ruest_reserviert(p_material)
$$;

/*
  Je Artikel des eigenen Betriebs: Bestand, zugesagte Anforderungen, auf
  Rüstlisten Geplantes und was frei ist — unter null heisst „fehlt“.
*/
create or replace function public.lager_frei()
  returns table (material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with artikel as (
    select m.id, m.stock
      from public.materials m
     where m.company_id = app.betrieb()
       and app.darf(m.company_id)
  ),
  zusage as (
    select o.material_id, sum(o.quantity) as menge
      from public.material_orders o
     where o.company_id = app.betrieb()
       and o.material_id is not null
       and o.transaction_type = 'order'
       and not o.processed
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
     group by o.material_id
  ),
  plan as (
    select p.material_id, sum(p.menge) as menge
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     where e.company_id = app.betrieb()
       and p.material_id is not null
       and e.date >= (now() at time zone 'Europe/Vienna')::date
     group by p.material_id
  )
  select a.id,
         a.stock,
         coalesce(z.menge, 0),
         coalesce(pl.menge, 0),
         a.stock - coalesce(z.menge, 0) - coalesce(pl.menge, 0)
    from artikel a
    left join zusage z on z.material_id = a.id
    left join plan pl on pl.material_id = a.id
$$;

revoke all on function public.lager_frei() from public, anon;
grant execute on function public.lager_frei() to authenticated;
