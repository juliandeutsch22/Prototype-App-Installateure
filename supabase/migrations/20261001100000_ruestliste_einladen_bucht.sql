-- NACHTEST 01.10.2026 — RÜSTLISTE: ABBUCHUNG BEIM EINLADEN (Entscheidung des Betreibers).
--
--   - Bis „eingeladen“ ist das Material reserviert, wie bisher.
--   - Mit „eingeladen“ bucht die Datenbank einen Lagerabgang (Art
--     „entnahme“) mit der Baustelle als Bezug — im Bewegungsprotokoll.
--   - Was übrig bleibt, kommt über die bestehende Retoure zurück.
--   - Der Schein bucht keinen Bestand; er dient der Verrechnung. Damit
--     mindert Material, das später auf dem Schein steht, den Bestand nicht
--     noch einmal.
--   - „Eingeladen“ lässt sich am selben Tag zurücknehmen; die Buchung wird
--     dann zurückgebucht (Art „retoure“).
--
-- Gebucht wird nur bei Katalogartikeln, die im Lager geführt werden, und
-- höchstens so viel, wie da ist. Was gebucht wurde, steht am Haken
-- (`geladen -> Position -> gebucht`); genau das geht beim Zurücknehmen zurück.

/*
  MIT EIGENTÜMERRECHTEN, weil der Monteur den Bestand nicht selbst bewegen
  darf (`materials_felder`). Wer abhaken darf, prüft die Funktion wie der
  Wächter der Rüstliste: die Leitung oder wer für den Einsatz eingeteilt ist.
*/
create or replace function public.laden_umschalten(
  p_datum date,
  p_baustelle text,
  p_position text,
  p_an boolean,
  p_von text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  kopf public.einsatz_material;
  pos public.einsatz_material_positionen;
  artikel public.materials;
  eintrag jsonb;
  gebucht numeric(12,3) := 0;
  material uuid;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select * into kopf from public.einsatz_material
   where company_id = betrieb and date = p_datum and project_number = p_baustelle
   for update;
  if kopf.id is null then
    raise exception 'Für diesen Einsatz gibt es keine Rüstliste'
      using errcode = 'P0002';
  end if;
  if not (app.ist_dienst() or app.ist_fuehrung() or auth.uid() = any(kopf.uids)) then
    raise exception 'Abhaken darf nur, wer für diesen Einsatz eingeteilt ist'
      using errcode = '42501';
  end if;

  eintrag := kopf.geladen -> p_position;

  if p_an then
    -- Schon eingeladen: nichts doppelt buchen.
    if eintrag is not null then
      return;
    end if;
    select * into pos from public.einsatz_material_positionen
     where id = p_position and einsatz_material_id = kopf.id;
    if pos.material_id is not null then
      select * into artikel from public.materials
       where id = pos.material_id and company_id = betrieb;
      if artikel.id is not null and artikel.lagerartikel then
        gebucht := least(coalesce(pos.menge, 0), greatest(artikel.stock, 0));
        if gebucht > 0 then
          perform app.lager_kontext('entnahme',
            'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen von ' || coalesce(nullif(btrim(p_von), ''), '—'),
            null, null, 'Baustelle ' || p_baustelle, null);
          perform public.bestand_anpassen(artikel.id, -gebucht);
          perform app.lager_kontext_leeren();
          material := artikel.id;
        end if;
      end if;
    end if;
    update public.einsatz_material
       set geladen = geladen || jsonb_build_object(
             p_position,
             jsonb_build_object('von', p_von, 'am', (extract(epoch from now()) * 1000)::bigint)
               || case when gebucht > 0
                       then jsonb_build_object('gebucht', gebucht, 'material', material)
                       else '{}'::jsonb end)
     where id = kopf.id;
    return;
  end if;

  if eintrag is null then
    return;
  end if;
  /*
    NUR AM SELBEN TAG. Später ist das Material längst im Bus oder verbaut;
    was übrig bleibt, kommt über die Retoure zurück — mit Menge und Grund.
  */
  if eintrag ? 'am'
     and (to_timestamp((eintrag ->> 'am')::numeric / 1000) at time zone 'Europe/Vienna')::date <> heute
     and not app.ist_dienst() then
    raise exception 'Eingeladen lässt sich nur am selben Tag zurücknehmen. Was übrig bleibt, geht über die Retoure zurück.'
      using errcode = '55000';
  end if;
  gebucht := coalesce((eintrag ->> 'gebucht')::numeric, 0);
  material := nullif(eintrag ->> 'material', '')::uuid;
  if gebucht > 0 and material is not null
     and exists (select 1 from public.materials m where m.id = material and m.company_id = betrieb) then
    perform app.lager_kontext('retoure',
      'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen zurückgenommen',
      null, null, 'Baustelle ' || p_baustelle, null);
    perform public.bestand_anpassen(material, gebucht);
    perform app.lager_kontext_leeren();
  end if;
  update public.einsatz_material set geladen = geladen - p_position where id = kopf.id;
end;
$$;

revoke all on function public.laden_umschalten(date, text, text, boolean, text) from public, anon;
grant execute on function public.laden_umschalten(date, text, text, boolean, text) to authenticated;

/*
  EINGELADEN UND GEBUCHT RESERVIERT NICHTS MEHR — der Bestand ist schon
  gesunken; zählte die Position weiter, fehlte sie zweimal.
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
     and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
$$;
revoke all on function app.ruest_reserviert(uuid) from public, anon;
grant execute on function app.ruest_reserviert(uuid) to authenticated;

-- Dieselbe Regel in der Übersicht des Lagers.
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
       and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
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
