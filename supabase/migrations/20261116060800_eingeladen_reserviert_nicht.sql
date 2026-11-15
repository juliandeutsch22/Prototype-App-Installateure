/*
  M10 (Befund B11 der Durchsicht 15.11.2026): EINE EINGELADENE
  RÜSTLISTENPOSITION RESERVIERT NICHTS MEHR — AUCH OHNE BUCHUNG.

  WAS FALSCH WAR. Die Reservierung einer Rüstlistenposition endete erst, wenn
  am Haken „gebucht“ stand (`geladen -> Position ? 'gebucht'`). Das steht nur,
  wenn beim Einladen mehr als null abgebucht wurde. Eingeladen, aber nichts
  gebucht — ein Katalogartikel ohne Lagerführung, ein leeres Regal, oder die
  ganze Menge kam über die Anforderung —, galt die Position bis zum Einsatztag
  weiter als „geplant“: im Lager „frei −5“ und „5 fehlen“, auf der Startseite
  knapp, in den Bestellvorschlägen eine Fehlmenge für Ware, die längst im Bus
  liegt. Die erklärte Absicht war immer „bis eingeladen reserviert“
  (20260930390000_ruestliste_reserviert.sql, 20261001100000_…: „Eingeladen
  und gebucht reserviert nichts mehr“) — gemeint ist der Haken, nicht die
  gebuchte Menge.

  WIE ES JETZT IST. Die Reservierung endet mit dem Haken „eingeladen“ — mit
  oder ohne Buchung — oder mit dem Entfernen der Position (die Zeile ist dann
  weg, wie bisher). Nimmt jemand das Einladen am selben Tag zurück, ist der
  Haken weg und die Position reserviert wieder. Betroffen sind alle fünf
  Stellen, die diese Frage stellen: `app.ruest_reserviert`, `lager_frei`,
  `app.deckung_frei_vor`, `materialdeckung` (das Feld `gebucht` der Position
  heißt dort weiter so und meint „eingeladen, reserviert nichts mehr“ — so
  liest es die App, `materialDeckung.ts`) und `app.bestellvorschlag_stand`.
  Sonst unverändert: die Rümpfe sind die laufenden Fassungen, geändert ist
  nur diese eine Bedingung.

  Mit P1 (`einsatz_fassung`) verträglich: die Fassungsprüfung betrifft das
  Speichern der Liste, nicht das Lesen des Freien. RECHTE unverändert
  (`create or replace` behält sie). DATENSCHUTZ: nichts Neues.
*/

CREATE OR REPLACE FUNCTION app.ruest_reserviert(p_material uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(greatest(p.menge - app.ruest_angefordert(e.id, p.id), 0)), 0)
    from public.einsatz_material_positionen p
    join public.einsatz_material e on e.id = p.einsatz_material_id
   where p.material_id = p_material
     and e.date >= (now() at time zone 'Europe/Vienna')::date
     and not coalesce(e.geladen ? p.id, false)
$function$

;

CREATE OR REPLACE FUNCTION public.lager_frei(p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with artikel as (
    select m.id, m.stock
      from public.materials m
     where p_ids is not null
       and m.id = any (p_ids)
       and m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
    union all
    select m.id, m.stock
      from public.materials m
     where p_ids is null
       and m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
  ),
  zusage as (
    select o.material_id, sum(o.quantity) as menge
      from public.material_orders o
     where o.company_id = (select app.betrieb())
       and o.material_id is not null
       and (p_ids is null or o.material_id = any (p_ids))
       and o.transaction_type = 'order'
       and not o.processed
       -- M04a: Ware, die an einen weiteren Ort geliefert wurde, liegt dort.
       and o.lagerort_id is null
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
     group by o.material_id
  ),
  plan as (
    -- Was eine Anforderung zu dieser Position bringt, reserviert die Anforderung (M5).
    select p.material_id, sum(greatest(p.menge - app.ruest_angefordert(e.id, p.id), 0)) as menge
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     where e.company_id = (select app.betrieb())
       and p.material_id is not null
       and (p_ids is null or p.material_id = any (p_ids))
       and e.date >= (now() at time zone 'Europe/Vienna')::date
       and not coalesce(e.geladen ? p.id, false)
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
   -- Feste Reihenfolge: wer ohne Liste seitenweise fragt, verliert keine Zeile.
   order by a.id
$function$

;

CREATE OR REPLACE FUNCTION app.deckung_frei_vor(p_betrieb text, p_material uuid, p_datum date, p_angelegt timestamp with time zone, p_liste uuid, p_heute date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select m.stock from public.materials m
                    where m.id = p_material and m.company_id = p_betrieb), 0)
       - (select coalesce(sum(o.quantity), 0)
            from public.material_orders o
           where o.company_id = p_betrieb
             and o.material_id = p_material
             and o.transaction_type = 'order'
             and not o.processed
             and o.lagerort_id is null
             and (o.beschaffung = 'lager'
                  or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
                  or (o.beschaffung is null and o.status = 'Abholbereit')))
       - (select coalesce(sum(greatest(p.menge - app.ruest_angefordert(e.id, p.id), 0)), 0)
            from public.einsatz_material_positionen p
            join public.einsatz_material e on e.id = p.einsatz_material_id
           where p.material_id = p_material
             and e.company_id = p_betrieb
             and e.date >= p_heute
             and not coalesce(e.geladen ? p.id, false)
             and (p_datum < p_heute
                  or (e.date, e.created_at, e.id) < (p_datum, p_angelegt, p_liste)))
$function$

;

CREATE OR REPLACE FUNCTION public.materialdeckung(p_von date, p_bis date, p_baustelle text DEFAULT NULL::text, p_dazu uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  betrieb text := app.lesebetrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  fuer_liste public.einsatz_material;
begin
  if betrieb is null or not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Die Materialbereitschaft sehen Verwaltung und Leitung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 30 then
    raise exception 'Der Zeitraum umfasst einen bis höchstens 31 Tage' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_dazu), 0) > 500 then
    raise exception 'Höchstens 500 Artikel je Anfrage' using errcode = '22023';
  end if;
  if p_baustelle is not null then
    if p_von <> p_bis then
      raise exception 'Das Formular einer Liste fragt nach genau einem Tag' using errcode = '22023';
    end if;
    select * into fuer_liste from public.einsatz_material e
     where e.company_id = betrieb and e.date = p_von and e.project_number = p_baustelle;
  end if;

  return (
    with listen as (
      select e.id, e.date, e.project_number, e.created_at, e.geladen
        from public.einsatz_material e
       where e.company_id = betrieb
         and e.date between p_von and p_bis
    ),
    pos as (
      select l.id as liste, p.id, p.position, p.material_id, p.menge,
             coalesce(l.geladen ? p.id, false) as gebucht
        from listen l
        join public.einsatz_material_positionen p on p.einsatz_material_id = l.id
    ),
    anf_roh as (
      select o.ruestliste_id as liste, o.ruest_position as position, o.quantity as menge, o.liefertermin,
             case when o.processed or o.status = 'Erledigt' then 'abgeholt'
                  when o.beschaffung = 'lager'
                       or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
                       or (o.beschaffung is null and o.status = 'Abholbereit') then 'bereit'
                  when o.beschaffung = 'einkauf' and o.bestellt_am is not null then 'bestellt'
                  when o.beschaffung = 'einkauf' then 'auf_liste'
                  else 'offen' end as stand
        from public.material_orders o
       where o.company_id = betrieb
         and o.transaction_type = 'order'
         and o.ruestliste_id in (select l.id from listen l)
    ),
    anf as (
      select a.liste, a.position,
             jsonb_build_object(
               'angefordert', sum(a.menge),
               'abgeholt', coalesce(sum(a.menge) filter (where a.stand = 'abgeholt'), 0),
               'bereit', coalesce(sum(a.menge) filter (where a.stand = 'bereit'), 0),
               'bestellt', coalesce(sum(a.menge) filter (where a.stand = 'bestellt'), 0),
               'termin', max(a.liefertermin) filter (where a.stand = 'bestellt'),
               'termin_offen', coalesce(bool_or(a.liefertermin is null) filter (where a.stand = 'bestellt'), false),
               'auf_liste', coalesce(sum(a.menge) filter (where a.stand = 'auf_liste'), 0),
               'offen', coalesce(sum(a.menge) filter (where a.stand = 'offen'), 0)) as stand
        from anf_roh a
       group by a.liste, a.position
    ),
    paare as (
      select distinct p.liste, p.material_id from pos p where p.material_id is not null
    ),
    frei as (
      select pa.liste,
             jsonb_object_agg(pa.material_id::text,
               app.deckung_frei_vor(betrieb, pa.material_id, l.date, l.created_at, l.id, heute)) as frei_vor
        from paare pa
        join listen l on l.id = pa.liste
       group by pa.liste
    ),
    artikel as (
      select m.id, m.lagerartikel
        from public.materials m
       where m.company_id = betrieb
         and (m.id in (select p.material_id from pos p where p.material_id is not null)
              or m.id = any (coalesce(p_dazu, '{}'::uuid[])))
    ),
    zulauf as (
      select k.material_id,
             jsonb_agg(jsonb_build_object('menge', k.menge, 'bestellt', k.bestellt_am is not null, 'termin', k.liefertermin)
                       order by (k.bestellt_am is null), k.liefertermin nulls last, k.created_at, k.id) as eintraege
        from public.einkauf_posten k
       where k.company_id = betrieb
         and k.geliefert_am is null
         and k.material_id in (select a.id from artikel a)
       group by k.material_id
    )
    select jsonb_build_object(
      'heute', heute,
      'listen', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', l.id,
                 'datum', l.date,
                 'baustelle', l.project_number,
                 'frei_vor', coalesce(f.frei_vor, '{}'::jsonb),
                 'positionen', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', p.id, 'material', p.material_id, 'menge', p.menge,
                            'gebucht', p.gebucht, 'anf', a.stand)
                          order by p.position, p.id)
                     from pos p
                     left join anf a on a.liste = p.liste and a.position = p.id
                    where p.liste = l.id), '[]'::jsonb))
               order by l.date, l.created_at, l.id)
          from listen l
          left join frei f on f.liste = l.id), '[]'::jsonb),
      'lagerartikel', coalesce((select jsonb_object_agg(a.id::text, a.lagerartikel) from artikel a), '{}'::jsonb),
      'zulauf', coalesce((select jsonb_object_agg(z.material_id::text, z.eintraege) from zulauf z), '{}'::jsonb),
      'fuer', case when p_baustelle is null then null else jsonb_build_object(
        'liste', fuer_liste.id,
        'frei_vor', coalesce((
          select jsonb_object_agg(a.id::text,
                   app.deckung_frei_vor(betrieb, a.id, p_von,
                     coalesce(fuer_liste.created_at, 'infinity'::timestamptz),
                     coalesce(fuer_liste.id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid), heute))
            from artikel a
           where a.id = any (coalesce(p_dazu, '{}'::uuid[]))
              or a.id in (select p.material_id from pos p where p.liste = fuer_liste.id)), '{}'::jsonb))
      end)
  );
end;
$function$

;

CREATE OR REPLACE FUNCTION app.bestellvorschlag_stand(p_betrieb text, p_ids uuid[])
 RETURNS TABLE(material_id uuid, name text, einheit text, artikelnummer text, mindestmenge numeric, sollbestand numeric, verpackungseinheit numeric, frei numeric, zulauf numeric, grund text, menge numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with heute as (
    select (now() at time zone 'Europe/Vienna')::date as d
  ),
  kandidaten as (
    select m.id
      from public.materials m
     where m.company_id = p_betrieb
       and m.lagerartikel
       and m.mindestmenge is not null
       and (p_ids is null or m.id = any (p_ids))
    union
    select p.material_id
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     cross join heute h
     where e.company_id = p_betrieb
       and p.material_id is not null
       and e.date >= h.d
       and not coalesce(e.geladen ? p.id, false)
       and (p_ids is null or p.material_id = any (p_ids))
    union
    select o.material_id
      from public.material_orders o
     where o.company_id = p_betrieb
       and o.material_id is not null
       and o.transaction_type = 'order'
       and not o.processed
       and o.lagerort_id is null
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
       and (p_ids is null or o.material_id = any (p_ids))
  ),
  rechnung as (
    select m.id, m.name, m.unit, m.article_number, m.mindestmenge, m.sollbestand, m.verpackungseinheit,
           app.deckung_frei_vor(p_betrieb, m.id, h.d - 1, null, null, h.d) as frei,
           coalesce((select sum(k.menge) from public.einkauf_posten k
                      where k.company_id = p_betrieb and k.material_id = m.id and k.geliefert_am is null), 0) as zulauf
      from kandidaten c
      join public.materials m on m.id = c.id and m.company_id = p_betrieb and not m.ausgelaufen
     cross join heute h
  ),
  bewertet as (
    select r.*,
           case when r.frei + r.zulauf < 0 then 'fehlmenge'
                when r.mindestmenge is not null and r.frei + r.zulauf < r.mindestmenge then 'mindestmenge'
           end as grund,
           greatest(coalesce(r.sollbestand, r.mindestmenge, 0), 0) - (r.frei + r.zulauf) as roh
      from rechnung r
  )
  select b.id, b.name, b.unit, b.article_number, b.mindestmenge, b.sollbestand, b.verpackungseinheit,
         b.frei, b.zulauf, b.grund, app.bestellmenge(b.roh, b.verpackungseinheit, b.unit)
    from bewertet b
   where b.grund is not null
     and b.roh > 0
$function$

;

