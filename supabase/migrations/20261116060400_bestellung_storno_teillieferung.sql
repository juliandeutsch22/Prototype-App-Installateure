/*
  M4 (Durchsicht 15.11.2026): BESTELLUNG STORNIEREN MIT GRUND; „GELIEFERT“
  MIT MENGE UND LIEFERSCHEIN-NR. IN EINEM DIALOG.

  WAS FALSCH WAR.
  - „Bestellt“ ließ sich nicht zurücknehmen. Unter „Bestellt — noch nicht
    da“ gab es nur „Termin“ und „Geliefert“; „Als bestellt markieren“ gilt für
    die ganze Gruppe. Versehentlich markiert, vom Großhändler storniert oder
    nicht lieferbar: ein eigener Posten kam nur über „Geliefert“ von der
    Liste (Bestand, der nie kam → Inventur), eine Anforderung nur über
    Löschen und neu Anfordern.
  - „Geliefert“ war je Zeile alles oder nichts: 6 von 10 geliefert hieß 10
    oder 0 einbuchen.
  - Die Lieferschein-Nr. kannte nur der Wareneingang im Lager — für dieselbe
    Lieferung ein zweiter Weg (wer beide nutzte, buchte doppelt).

  WIE ES JETZT IST.
  - `einkauf_stornieren`: eine bestellte, noch nicht gelieferte Zeile
    (Anforderung oder eigener Posten) geht mit Grund zurück auf „zu
    bestellen“ — von dort wird sie neu bestellt oder von der Liste genommen,
    wie bisher. Grund und Zeitpunkt bleiben an der Zeile
    (`bestellung_storno_grund`, `bestellung_storniert_am`) und stehen im
    Verlauf.
  - `einkauf_geliefert` nimmt die Lieferschein-Nr. (ins Bewegungsprotokoll
    und an die Zeile, `lieferschein`).
  - `einkauf_teillieferung`: geliefert ist ein Teil; die Anforderung wird wie
    bei M5 geteilt (`app.anforderung_abspalten`), der eigene Posten ebenso —
    der gelieferte Teil wird gebucht, der Rest bleibt bestellt.
  So ist „Geliefert“ mit Menge und Lieferschein der eine Weg für eine
  Lieferung von der Einkaufsliste.

  RECHTE: Verwaltung und Führung, wie `einkauf_geliefert`.
  ALTE APP: `einkauf_geliefert` behält Namen und Reihenfolge seiner
  Parameter; der dritte hat eine Vorgabe.
  DATENSCHUTZ: keine neue Tabelle; der Grund ist Text zur Bestellung, keine
  Personendaten.
*/

alter table public.material_orders
  add column if not exists lieferschein text,
  add column if not exists bestellung_storniert_am timestamptz,
  add column if not exists bestellung_storno_grund text;

alter table public.einkauf_posten
  add column if not exists lieferschein text,
  add column if not exists bestellung_storniert_am timestamptz,
  add column if not exists bestellung_storno_grund text;

-- ---------------------------------------------------------------------------
-- 1. „Geliefert“ mit Lieferschein
-- ---------------------------------------------------------------------------

drop function if exists public.einkauf_geliefert(uuid[], uuid);

/*
  Rumpf wie in 20261116060200_lagerfuehrung_am_artikel.sql; neu ist die
  Lieferschein-Nr.
*/
create or replace function public.einkauf_geliefert(p_ids uuid[], p_ort uuid default null, p_lieferschein text default null)
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  p public.einkauf_posten%rowtype;
  katalog uuid;
  gebucht boolean;
  n integer := 0;
  ort public.lagerorte;
  schein text := nullif(btrim(coalesce(p_lieferschein, '')), '');
begin
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung'
      using errcode = '42501';
  end if;
  ort := app.ort_pruefen(app.arbeitsbetrieb(), p_ort, true);
  if ort.id is not null then
    perform app.lagerort_wahl_pruefen(app.arbeitsbetrieb());
  end if;
  for a in
    select * from public.material_orders
     where id = any(p_ids)
       and beschaffung = 'einkauf'
       and geliefert_am is null
       and not processed
     order by id
     for update
  loop
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    /*
      NEU (M6): Kommissionsware — ein Artikel, den das Lager nicht führt —
      kommt für diese Anforderung und liegt bis zur Abholung bei ihr, nicht
      im Bestand. Geführt wird ein Artikel, weil jemand es so eingestellt
      hat, nicht weil eine Lieferung kam.
    */
    if katalog is not null and exists (
      select 1 from public.materials m
       where m.id = katalog and m.company_id = a.company_id and m.lagerartikel
    ) then
      perform app.lager_kontext('eingang', null,
        (select s.name from public.suppliers s where s.id = a.supplier_id), schein,
        'Einkaufsliste · Anforderung' || coalesce(' Baustelle ' || nullif(a.project_number, ''), ''), a.id);
      if ort.id is null then
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      else
        perform app.ort_anpassen(ort.id, katalog, coalesce(a.quantity, 0), false);
      end if;
      perform app.lager_kontext_leeren();
      gebucht := true;
    else
      gebucht := false;
    end if;
    perform set_config('app.ort_setzen', case when ort.id is not null then 'ja' else '' end, true);
    update public.material_orders
       set geliefert_am = now(),
           -- NEU (M6): festgehalten, damit die Abholung nichts abbucht, was nie eingebucht wurde.
           kommission = not gebucht,
           -- NEU (M4): der Lieferschein auch an der Zeile — Kommissionsware hat keine Bewegung, die ihn trüge.
           lieferschein = coalesce(schein, lieferschein),
           -- Wer die Bestellung vergessen hat abzuhaken, hat sie trotzdem
           -- bekommen: ohne Datum sähe die Liste aus, als wäre nie bestellt.
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(a.material_id, katalog),
           status = case when status in ('Offen', 'In Bearbeitung') then 'Abholbereit' else status end,
           lagerort_id = coalesce(ort.id, lagerort_id)
     where id = a.id;
    perform set_config('app.ort_setzen', '', true);
    n := n + 1;
  end loop;

  for p in
    select * from public.einkauf_posten
     where id = any(p_ids)
       and geliefert_am is null
     order by id
     for update
  loop
    katalog := coalesce(p.material_id, app.katalogeintrag(p.company_id, p.material_name));
    if katalog is not null then
      perform app.lager_kontext('eingang', null,
        (select s.name from public.suppliers s where s.id = p.supplier_id), schein, 'Einkaufsliste · fürs Lager', null);
      if ort.id is null then
        perform public.bestand_anpassen(katalog, p.menge);
      else
        perform app.ort_anpassen(ort.id, katalog, p.menge, false);
      end if;
      perform app.lager_kontext_leeren();
    end if;
    update public.einkauf_posten
       set geliefert_am = now(),
           lieferschein = coalesce(schein, lieferschein),
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(p.material_id, katalog)
     where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.einkauf_geliefert(uuid[], uuid, text) from public, anon;
grant execute on function public.einkauf_geliefert(uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Teillieferung
-- ---------------------------------------------------------------------------

/*
  `p_menge` einer bestellten Zeile ist da. Weniger als bestellt: der Teil
  wird abgespalten und gebucht, der Rest bleibt bestellt (mit Termin). Die
  ganze Menge: wie `einkauf_geliefert`. Antwort: {ergebnis: 'geliefert',
  teil} oder {ergebnis: 'veraltet'} (weg, schon geliefert, oder nicht mehr
  bestellt).
*/
create or replace function public.einkauf_teillieferung(
  p_id uuid, p_menge numeric, p_lieferschein text default null, p_ort uuid default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  a public.material_orders%rowtype;
  p public.einkauf_posten%rowtype;
  teil uuid;
  menge numeric;
begin
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung'
      using errcode = '42501';
  end if;
  if p_menge is null or p_menge <= 0 then
    raise exception 'Die gelieferte Menge muss größer als null sein.' using errcode = '22023';
  end if;

  select * into a from public.material_orders
   where id = p_id and company_id = betrieb for update;
  if a.id is not null then
    if a.beschaffung is distinct from 'einkauf' or a.geliefert_am is not null or a.processed then
      return jsonb_build_object('ergebnis', 'veraltet');
    end if;
    menge := a.quantity;
    if p_menge > menge then
      raise exception 'Bestellt sind % — mehr lässt sich hier nicht als geliefert buchen. Was zusätzlich kam, geht über den Wareneingang im Lager.', trim_scale(menge)
        using errcode = '22023';
    end if;
    teil := case when p_menge < menge then app.anforderung_abspalten(a.id, p_menge) else a.id end;
    perform public.einkauf_geliefert(array[teil], p_ort, p_lieferschein);
    return jsonb_build_object('ergebnis', 'geliefert', 'teil', teil);
  end if;

  select * into p from public.einkauf_posten
   where id = p_id and company_id = betrieb for update;
  if p.id is null or p.geliefert_am is not null then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;
  if p_menge > p.menge then
    raise exception 'Bestellt sind % — mehr lässt sich hier nicht als geliefert buchen. Was zusätzlich kam, geht über den Wareneingang im Lager.', trim_scale(p.menge)
      using errcode = '22023';
  end if;
  if p_menge < p.menge then
    teil := gen_random_uuid();
    insert into public.einkauf_posten (
      id, company_id, supplier_id, material_id, material_name, menge, einheit, notiz,
      angelegt_von_uid, angelegt_von_name, bestellt_am, liefertermin, created_at
    ) values (
      teil, p.company_id, p.supplier_id, p.material_id, p.material_name, p_menge, p.einheit, p.notiz,
      p.angelegt_von_uid, p.angelegt_von_name, p.bestellt_am, p.liefertermin, p.created_at
    );
    update public.einkauf_posten set menge = p.menge - p_menge where id = p.id;
  else
    teil := p.id;
  end if;
  perform public.einkauf_geliefert(array[teil], p_ort, p_lieferschein);
  return jsonb_build_object('ergebnis', 'geliefert', 'teil', teil);
end;
$$;

revoke all on function public.einkauf_teillieferung(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.einkauf_teillieferung(uuid, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bestellung stornieren
-- ---------------------------------------------------------------------------

/*
  Bestellte, noch nicht gelieferte Zeilen zurück auf „zu bestellen“, mit
  Grund. Antwort: wie viele es traf (eine schon gelieferte oder nicht mehr
  bestellte zählt nicht — die Ansicht sagt dann „inzwischen geändert“).
*/
create or replace function public.einkauf_stornieren(p_ids uuid[], p_grund text)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  grund text := nullif(btrim(coalesce(p_grund, '')), '');
  n integer;
  m integer;
begin
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Eine Bestellung storniert die Verwaltung oder die Leitung'
      using errcode = '42501';
  end if;
  if grund is null then
    raise exception 'Ohne Grund keine Stornierung — er steht danach im Verlauf.' using errcode = '22023';
  end if;
  update public.material_orders
     set bestellt_am = null, liefertermin = null,
         bestellung_storniert_am = now(), bestellung_storno_grund = grund
   where company_id = betrieb
     and id = any(p_ids)
     and beschaffung = 'einkauf'
     and bestellt_am is not null
     and geliefert_am is null
     and not processed;
  get diagnostics n = row_count;
  update public.einkauf_posten
     set bestellt_am = null, liefertermin = null,
         bestellung_storniert_am = now(), bestellung_storno_grund = grund
   where company_id = betrieb
     and id = any(p_ids)
     and bestellt_am is not null
     and geliefert_am is null;
  get diagnostics m = row_count;
  return n + m;
end;
$$;

revoke all on function public.einkauf_stornieren(uuid[], text) from public, anon;
grant execute on function public.einkauf_stornieren(uuid[], text) to authenticated;
