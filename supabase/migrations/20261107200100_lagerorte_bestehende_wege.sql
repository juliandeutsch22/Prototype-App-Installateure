/*
  DIE BESTEHENDEN LAGERWEGE JE ORT (SHK-Ausbau M04a, Teil a2; E10)

  Grundregel: Jede Funktion bekommt einen OPTIONALEN Ort, Vorgabe
  Hauptlager. Ohne Ort verhält sie sich exakt wie bisher — der Rumpf ohne
  Ort ist jeweils Wort für Wort der der letzten Fassung (genannt bei jeder
  Funktion), der Ort ist ein eigener Zweig daneben.

    lager_eingang, einkauf_geliefert   Zielort wählbar
    lager_inventur                     je Ort; die bestätigte Zählung ist der
                                       Eröffnungsbestand eines Ortes
    laden_umschalten (Rüstliste)       Quellort: Hauptlager oder ein Fahrzeug
    retoure_anlegen                    Zielort; „neu“ zurück in den gewählten Ort
    anforderung_abschliessen           Quellort

  Ein Ort wird als Kennung übergeben; leer oder die Kennung des Hauptlagers
  heißt Hauptlager (`app.ort_pruefen`).

  RESERVIERUNGEN (`lager_frei`): reserviert wird weiter gegen das
  Hauptlager, so wie bisher; „frei“ am Hauptlager rechnet wie bisher. An
  einem weiteren Ort gibt es keine Reservierung — dort ist frei, was liegt,
  und die Ware im Fahrzeug steht der Rüstliste dieses Fahrzeugs zur
  Verfügung (Abhaken mit Quellort). EINE Ausnahme gehört dazu: Eine
  Anforderung, deren Ware über die Einkaufsliste an einen weiteren Ort
  geliefert wurde, liegt dort und nicht im Hauptlager — sie trägt den Ort
  (`material_orders.lagerort_id`) und zählt nicht mehr gegen das Freie des
  Hauptlagers. Alle bisherigen Anforderungen tragen keinen Ort und rechnen
  wie bisher.

  RECHNUNGSVORSCHLAG (`ausgegebenes_material`) bleibt unverändert: er zählt
  erledigte Anforderungen, eingeladene Rüstlistenpositionen und Retouren —
  eine Umlagerung ist keines davon und damit kein Verbrauch. Erst die
  Ausgabe an die Baustelle zählt, gleich aus welchem Ort.

  RECHTE wie bisher; neu nur, wer einen Ort wählen darf:
  - Wareneingang, Einkaufsliste, Inventur: Verwaltung und Leitung (wie
    bisher) — jeden aktiven Ort.
  - Abhaken: wer eingeteilt ist — aus dem Hauptlager oder aus einem
    Fahrzeug, das ein Eingeteilter oder er selbst fährt oder das keinen
    Standardfahrer hat (Poolfahrzeug); die Leitung aus jedem.
  - Retoure und Abholen durch den Besteller: ins bzw. aus dem Hauptlager
    oder dem eigenen Fahrzeug; Lager und Leitung jeden aktiven Ort.

  GEPRÜFT AM SERVER (E51, V3) NUR DER NEUE ZWEIG: Wer einen weiteren Ort
  wählt, braucht die Unterfähigkeit `material.lagerorte_fahrzeuglager`
  (`app.lagerort_wahl_pruefen`). Ohne Ort — und mit dem Hauptlager als Ort —
  läuft jeder Weg wie bisher, ob sie an ist oder nicht: bestehende
  Schreibwege bleiben, wie sie sind. Was schon an einem Ort liegt, folgt
  seinem Ort weiter (das Abholen einer dorthin gelieferten Anforderung, das
  Zurücknehmen eines Hakens am selben Tag): das ist keine Wahl, sondern die
  Buchung, die zur Ware gehört.
*/

-- ---------------------------------------------------------------------------
-- 0. Darf hier ein weiterer Ort gewählt werden?
-- ---------------------------------------------------------------------------

/*
  V3 für den Zweig mit Ort. Ein eigener Helfer, weil `einkauf_geliefert` mit
  den Rechten des Aufrufers läuft und `app.modul_aktiv` nicht ausführen darf.
  Er antwortet nur für den eigenen Betrieb — sonst ließe sich damit
  abfragen, was ein fremder Betrieb eingeschaltet hat.
*/
create or replace function app.lagerort_wahl_pruefen(p_betrieb text) returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not (app.ist_dienst() or app.betriebsmitglied(p_betrieb) or app.support_schreibt(p_betrieb)) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.modul_aktiv(p_betrieb, 'material.lagerorte_fahrzeuglager') then
    raise exception 'Lagerorte und Fahrzeuglager sind in diesem Betrieb ausgeschaltet (Einstellungen → Module) — gebucht wird im Hauptlager'
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function app.lagerort_wahl_pruefen(text) from public, anon;
grant execute on function app.lagerort_wahl_pruefen(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Wo die Ware einer Anforderung liegt
-- ---------------------------------------------------------------------------

alter table public.material_orders
  add column if not exists lagerort_id uuid references public.lagerorte (id);

comment on column public.material_orders.lagerort_id is
  'Weiterer Lagerort der Ware (M04a): bei einer Anforderung, wohin die Einkaufsliste sie geliefert hat bzw. woraus sie abgeholt wurde; bei einer Retoure, wohin sie zurückging. Leer = Hauptlager (alle Altdaten). Setzt nur die Datenbank.';

create index if not exists material_orders_lagerort
  on public.material_orders (lagerort_id) where lagerort_id is not null;

/*
  NUR DIE DATENBANK SETZT DEN ORT — wie das Protokoll der Übersteuerung
  (`app.uebersteuerung_fest`). Er entscheidet, ob eine Zusage das Freie des
  Hauptlagers mindert; frei setzbar wäre er ein Weg, Reservierungen
  verschwinden zu lassen. Beim Anlegen ohne Freigabe bleibt er leer (eine
  neue Anforderung liegt nirgends), ändern ohne Freigabe wird abgewiesen.
*/
create or replace function app.anforderung_ort_fest() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() or app.lager_wert('app.ort_setzen') is not null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.lagerort_id := null;
    return new;
  end if;
  if new.lagerort_id is distinct from old.lagerort_id then
    raise exception 'Den Lagerort einer Anforderung setzt nur die Datenbank — beim Liefern und beim Abholen'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.anforderung_ort_fest() from public, anon, authenticated;

drop trigger if exists material_orders_ort_fest on public.material_orders;
create trigger material_orders_ort_fest
  before insert or update on public.material_orders
  for each row execute function app.anforderung_ort_fest();

-- ---------------------------------------------------------------------------
-- 2. Reservierung gegen das Hauptlager — ohne Ware, die woanders liegt
-- ---------------------------------------------------------------------------

/* Rumpf wie in 20260930390000_ruestliste_reserviert.sql; neu nur `lagerort_id is null`. */
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
     and o.lagerort_id is null
     and (o.beschaffung = 'lager'
          or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
          or (o.beschaffung is null and o.status = 'Abholbereit'))
  ) + app.ruest_reserviert(p_material)
$$;

revoke all on function app.lager_zugesagt(uuid, uuid) from public, anon;
grant execute on function app.lager_zugesagt(uuid, uuid) to authenticated;

/* Rumpf wie in 20261027400000_r6_ruestliste_fehlmenge.sql; neu nur `lagerort_id is null`. */
create or replace function public.lager_frei(p_ids uuid[] DEFAULT NULL::uuid[])
  returns TABLE(material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
AS $$
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
   -- Feste Reihenfolge: wer ohne Liste seitenweise fragt, verliert keine Zeile.
   order by a.id
$$;

revoke all on function public.lager_frei(uuid[]) from public, anon;
grant execute on function public.lager_frei(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Wareneingang mit Zielort
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20260930380000_lagerbewegungen.sql. Neu: `p_ort`. Zurück
  kommt der Bestand des gebuchten Ortes. Die Signatur wächst um einen
  Parameter mit Vorgabe; die alte wird ersetzt, damit ein Aufruf mit fünf
  Werten eindeutig bleibt.
*/
drop function if exists public.lager_eingang(uuid, numeric, text, text, text);

create or replace function public.lager_eingang(
  p_material uuid, p_menge numeric, p_lieferant text, p_lieferschein text, p_bezug text, p_ort uuid default null
) returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  artikel public.materials%rowtype;
  fehler text;
  neu numeric;
  ort public.lagerorte;
begin
  select * into artikel from public.materials where id = p_material for update;
  if artikel.id is null or not app.darf(artikel.company_id) then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  fehler := app.menge_fehler(p_menge, artikel.unit);
  if fehler is not null then
    raise exception '%', fehler using errcode = '23514';
  end if;
  if nullif(btrim(coalesce(p_lieferant, '')), '') is null then
    raise exception 'Von welchem Lieferanten kommt die Ware?' using errcode = '23514';
  end if;
  ort := app.ort_pruefen(artikel.company_id, p_ort, true);
  if ort.id is not null then
    perform app.lagerort_wahl_pruefen(artikel.company_id);
  end if;
  perform app.lager_kontext('eingang', null, btrim(p_lieferant),
    nullif(btrim(coalesce(p_lieferschein, '')), ''), nullif(btrim(coalesce(p_bezug, '')), ''), null);
  if ort.id is null then
    perform set_config('app.lager_buchung', 'ja', true);
    update public.materials set stock = stock + p_menge where id = p_material returning stock into neu;
    perform set_config('app.lager_buchung', '', true);
  else
    neu := app.ort_anpassen(ort.id, p_material, p_menge, false);
  end if;
  perform app.lager_kontext_leeren();
  return neu;
end;
$$;

revoke all on function public.lager_eingang(uuid, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.lager_eingang(uuid, numeric, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Inventur je Ort
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20260930380000_lagerbewegungen.sql. Neu: `p_ort` — gezählt
  wird an diesem Ort, mit Grund im Protokoll. Die erste Zählung an einem Ort
  ist sein Eröffnungsbestand: der Bestand eines weiteren Ortes entsteht so
  oder durch eine Umlagerung, nie aus einer Annahme.
*/
drop function if exists public.lager_inventur(uuid, numeric, text);

create or replace function public.lager_inventur(p_material uuid, p_bestand numeric, p_grund text, p_ort uuid default null)
  returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  artikel public.materials%rowtype;
  grund text := nullif(btrim(coalesce(p_grund, '')), '');
  ort public.lagerorte;
  vorher numeric;
begin
  select * into artikel from public.materials where id = p_material for update;
  if artikel.id is null or not app.darf(artikel.company_id) then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Die Inventur bucht die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  if grund is null then
    raise exception 'Ohne Grund keine Korrektur — etwa „Inventur 31.12.“ oder „Bruch“' using errcode = '23514';
  end if;
  if p_bestand is null or p_bestand < 0 then
    raise exception 'Der gezählte Bestand ist null oder mehr' using errcode = '23514';
  end if;
  if p_bestand > 0 and app.menge_fehler(p_bestand, artikel.unit) is not null then
    raise exception '%', app.menge_fehler(p_bestand, artikel.unit) using errcode = '23514';
  end if;

  ort := app.ort_pruefen(artikel.company_id, p_ort, true);
  if ort.id is not null then
    perform app.lagerort_wahl_pruefen(artikel.company_id);
    vorher := app.ort_sperren(ort.id, p_material);
    if p_bestand = vorher then
      -- Gezählt und gestimmt: auch das gehört ins Protokoll — am Ort.
      insert into public.lagerbewegungen (
        company_id, material_id, art, menge, bestand_nachher, grund, erfasst_von, erfasst_von_name, lagerort_id
      ) values (
        artikel.company_id, artikel.id, 'inventur', 0, vorher, grund,
        auth.uid(), (select u.name from public.users u where u.id = auth.uid()), ort.id
      );
      return vorher;
    end if;
    perform app.lager_kontext('inventur', grund, null, null, null, null);
    perform app.ort_anpassen(ort.id, p_material, p_bestand - vorher, false);
    perform app.lager_kontext_leeren();
    return p_bestand;
  end if;

  if p_bestand = artikel.stock then
    -- Gezählt und gestimmt: auch das gehört ins Protokoll.
    insert into public.lagerbewegungen (
      company_id, material_id, art, menge, bestand_nachher, grund, erfasst_von, erfasst_von_name
    ) values (
      artikel.company_id, artikel.id, 'inventur', 0, artikel.stock, grund,
      auth.uid(), (select u.name from public.users u where u.id = auth.uid())
    );
    return artikel.stock;
  end if;

  perform app.lager_kontext('inventur', grund, null, null, null, null);
  perform set_config('app.lager_buchung', 'ja', true);
  update public.materials set stock = p_bestand where id = p_material;
  perform set_config('app.lager_buchung', '', true);
  perform app.lager_kontext_leeren();
  return p_bestand;
end;
$$;

revoke all on function public.lager_inventur(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.lager_inventur(uuid, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rüstliste abhaken aus dem Hauptlager oder einem Fahrzeug
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261027400000_r6_ruestliste_fehlmenge.sql. Neu: `p_ort`, der
  Quellort beim Abhaken. Gebucht wird dort genau so wie im Hauptlager: nur
  der Teil aus dem Regal (ohne den Teil der Anforderung), höchstens was da
  liegt. Der Eintrag merkt sich den Ort (`ort`); das Zurücknehmen am selben
  Tag bucht dorthin zurück. Ohne Ort bleibt der Eintrag, wie er war.
*/
drop function if exists public.laden_umschalten(date, text, text, boolean, text);

create or replace function public.laden_umschalten(p_datum date, p_baustelle text, p_position text, p_an boolean, p_von text, p_ort uuid default null)
  returns numeric
  language plpgsql
  security definer
  set search_path = ''
AS $$
declare
  betrieb text := app.arbeitsbetrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  kopf public.einsatz_material;
  pos public.einsatz_material_positionen;
  artikel public.materials;
  eintrag jsonb;
  gebucht numeric(12,3) := 0;
  material uuid;
  ort public.lagerorte;
  ort_id uuid;
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
      return 0;
    end if;
    /*
      M04a: DER QUELLORT. Ein Fahrzeug — eines, das ein Eingeteilter oder
      wer abhakt fährt, oder ein Poolfahrzeug ohne Standardfahrer; die
      Leitung aus jedem. Ein weiteres Lager ist hier kein Quellort.
    */
    ort := app.ort_pruefen(betrieb, p_ort, true);
    ort_id := ort.id;
    if ort_id is not null then
      if ort.art <> 'fahrzeug' then
        raise exception 'Abgehakt wird aus dem Hauptlager oder aus einem Fahrzeug' using errcode = '22023';
      end if;
      if not (app.ist_dienst() or app.ist_fuehrung()) and not exists (
        select 1 from public.fahrzeuge f
         where f.id = ort.fahrzeug_id
           and (f.standardfahrer_uid is null or f.standardfahrer_uid = auth.uid()
                or f.standardfahrer_uid = any(kopf.uids))
      ) then
        raise exception 'Aus diesem Fahrzeug hakt ab, wer es fährt oder auf diesem Einsatz ist'
          using errcode = '42501';
      end if;
      perform app.lagerort_wahl_pruefen(betrieb);
    end if;
    select * into pos from public.einsatz_material_positionen
     where id = p_position and einsatz_material_id = kopf.id;
    if pos.material_id is not null then
      select * into artikel from public.materials
       where id = pos.material_id and company_id = betrieb;
      if artikel.id is not null and artikel.lagerartikel then
        if ort_id is null then
          /*
            NUR DER TEIL AUS DEM REGAL (Runde 6, M5): was eine Anforderung zu
            dieser Position bringt, bucht deren Abholung. Vorher buchte der
            Haken die ganze Menge — und die Abholung der Fehlmenge noch einmal.
          */
          gebucht := least(greatest(coalesce(pos.menge, 0) - app.ruest_angefordert(kopf.id, pos.id), 0),
                           greatest(artikel.stock, 0));
          if gebucht > 0 then
            perform app.lager_kontext('entnahme',
              'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen von ' || coalesce(nullif(btrim(p_von), ''), '—'),
              null, null, 'Baustelle ' || p_baustelle, null);
            perform public.bestand_anpassen(artikel.id, -gebucht);
            perform app.lager_kontext_leeren();
            material := artikel.id;
          end if;
        else
          -- Dieselbe Rechnung, gegen den Bestand des Fahrzeugs.
          gebucht := least(greatest(coalesce(pos.menge, 0) - app.ruest_angefordert(kopf.id, pos.id), 0),
                           greatest(app.ort_sperren(ort_id, artikel.id), 0));
          if gebucht > 0 then
            perform app.lager_kontext('entnahme',
              'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen von ' || coalesce(nullif(btrim(p_von), ''), '—'),
              null, null, 'Baustelle ' || p_baustelle, null);
            perform app.ort_anpassen(ort_id, artikel.id, -gebucht, true);
            perform app.lager_kontext_leeren();
            material := artikel.id;
          end if;
        end if;
      end if;
    end if;
    update public.einsatz_material
       set geladen = geladen || jsonb_build_object(
             p_position,
             jsonb_build_object('von', p_von, 'am', (extract(epoch from now()) * 1000)::bigint)
               || case when gebucht > 0
                       then jsonb_build_object('gebucht', gebucht, 'material', material)
                            || case when ort_id is not null then jsonb_build_object('ort', ort_id) else '{}'::jsonb end
                       else '{}'::jsonb end)
     where id = kopf.id;
    return gebucht;
  end if;

  if eintrag is null then
    return 0;
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
  ort_id := nullif(eintrag ->> 'ort', '')::uuid;
  if gebucht > 0 and material is not null
     and exists (select 1 from public.materials m where m.id = material and m.company_id = betrieb) then
    -- Eine eigene Art, keine „Retoure“ (G15): das Material war nie auf der Baustelle.
    perform app.lager_kontext('einladen_zurueck',
      'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen zurückgenommen',
      null, null, 'Baustelle ' || p_baustelle, null);
    if ort_id is null then
      perform public.bestand_anpassen(material, gebucht);
    else
      -- M04a: zurück an den Ort, aus dem abgebucht wurde.
      ort := app.ort_pruefen(betrieb, ort_id, true);
      perform app.ort_anpassen(ort_id, material, gebucht, false);
    end if;
    perform app.lager_kontext_leeren();
  else
    gebucht := 0;
  end if;
  update public.einsatz_material set geladen = geladen - p_position where id = kopf.id;
  return gebucht;
end;
$$;

revoke all on function public.laden_umschalten(date, text, text, boolean, text, uuid) from public, anon;
grant execute on function public.laden_umschalten(date, text, text, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Retoure mit Zielort
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261024500000_retoure_wer.sql. Neu: `lagerort_id` im Beleg —
  der Zielort; „neu“ geht dorthin zurück statt ins Hauptlager. Fehlt er,
  ist alles wie bisher. Der Besteller wählt das Hauptlager oder sein eigenes
  Fahrzeug, Lager und Leitung jeden aktiven Ort.
*/
create or replace function public.retoure_anlegen(p_beleg jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  neu uuid := coalesce((p_beleg ->> 'id')::uuid, gen_random_uuid());
  betrieb text := p_beleg ->> 'company_id';
  katalog uuid := nullif(p_beleg ->> 'material_id', '')::uuid;
  person uuid := nullif(p_beleg ->> 'user_id', '')::uuid;
  personname text;
  ort public.lagerorte;
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or person is null then
    raise exception 'Eine Retoure legt man im eigenen Betrieb an'
      using errcode = '42501';
  end if;

  /*
    FÜR JEMAND ANDEREN nur das Lager und die Führung — sie nehmen am Regal
    entgegen, was ein anderer hereinbringt. Die Person muss zum Betrieb
    gehören; sonst stünde eine Retoure auf einer fremden Kennung.
  */
  if person is distinct from auth.uid() then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
      raise exception 'Eine Retoure für jemand anderen erfasst das Lager'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.users u where u.id = person and u.company_id = betrieb) then
      raise exception 'Diese Person gehört nicht zu diesem Betrieb'
        using errcode = '42501';
    end if;
  end if;
  personname := coalesce((select u.name from public.users u where u.id = person), p_beleg ->> 'user_name');

  -- M04a: der Zielort.
  ort := app.ort_pruefen(betrieb, nullif(p_beleg ->> 'lagerort_id', '')::uuid, true);
  if ort.id is not null then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung() or app.eigenes_fahrzeug(ort.id)) then
      raise exception 'An diesen Ort bucht das Lager zurück — der Fahrer in sein eigenes Fahrzeug'
        using errcode = '42501';
    end if;
    perform app.lagerort_wahl_pruefen(betrieb);
    if coalesce((p_beleg ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'Die Menge muss größer als null sein.' using errcode = '23514';
    end if;
  end if;

  -- Ein Katalogartikel eines anderen Betriebs bekäme sonst die Gutschrift.
  if katalog is not null and not exists (
    select 1 from public.materials m where m.id = katalog and m.company_id = betrieb
  ) then
    katalog := null;
  end if;

  if katalog is null and (p_beleg ->> 'condition') = 'neu' then
    katalog := app.katalogeintrag(betrieb, p_beleg ->> 'material_name');
  end if;

  perform set_config('app.ort_setzen', case when ort.id is not null then 'ja' else '' end, true);
  insert into public.material_orders (
    id, company_id, material_id, material_name, quantity, note,
    project_number, status, is_urgent, transaction_type, condition,
    user_id, user_name, processed, source, lagerort_id
  ) values (
    neu, betrieb, katalog, p_beleg ->> 'material_name',
    (p_beleg ->> 'quantity')::numeric, p_beleg ->> 'note',
    p_beleg ->> 'project_number', 'Erledigt',
    coalesce((p_beleg ->> 'is_urgent')::boolean, false), 'return',
    p_beleg ->> 'condition', person,
    personname, true, p_beleg ->> 'source', ort.id
  );
  perform set_config('app.ort_setzen', '', true);

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' then
    perform app.lager_kontext('retoure', null, null, null,
      coalesce('Baustelle ' || nullif(p_beleg ->> 'project_number', ''), 'Retoure') || ' · ' || coalesce(personname, ''), neu);
    if ort.id is null then
      perform public.bestand_anpassen(katalog, (p_beleg ->> 'quantity')::numeric);
    else
      perform app.ort_anpassen(ort.id, katalog, (p_beleg ->> 'quantity')::numeric, false);
    end if;
    perform app.lager_kontext_leeren();
  end if;

  return neu;
end;
$$;

revoke all on function public.retoure_anlegen(jsonb) from public, anon;
grant execute on function public.retoure_anlegen(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Abholen mit Quellort
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261031210000_r7_anforderung_status.sql. Neu: `p_ort`, der
  Quellort. Ohne Angabe der Ort, an den die Einkaufsliste die Ware geliefert
  hat (`lagerort_id`) — bei allen bisherigen Anforderungen leer, also wie
  bisher das Hauptlager. Der Besteller selbst wählt das Hauptlager oder sein
  eigenes Fahrzeug.
*/
drop function if exists public.anforderung_abschliessen(uuid, text);

create or replace function public.anforderung_abschliessen(p_order uuid, p_status text default null, p_ort uuid default null)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  katalog uuid;
  ort public.lagerorte;
  ort_id uuid;
begin
  select * into a from public.material_orders where id = p_order for update;
  if not found then
    return 0;
  end if;

  if not (app.betriebsmitglied(a.company_id) or app.support_schreibt(a.company_id))
     or not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
             or a.user_id = auth.uid()) then
    return 0;
  end if;

  -- Ein anderer war schneller: nichts abbuchen, nichts überschreiben.
  if p_status is not null and a.status is distinct from p_status then
    return 0;
  end if;

  if a.processed then
    if a.status = 'Erledigt' then
      return 0;
    end if;
    update public.material_orders set status = 'Erledigt' where id = p_order;
    return 1;
  end if;

  -- M04a: der Quellort.
  if p_ort is null then
    ort_id := a.lagerort_id;
  else
    ort := app.ort_pruefen(a.company_id, p_ort, true);
    ort_id := ort.id;
    if ort_id is not null
       and not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung() or app.eigenes_fahrzeug(ort_id)) then
      raise exception 'Aus diesem Ort bucht das Lager ab — der Besteller nur aus seinem eigenen Fahrzeug'
        using errcode = '42501';
    end if;
    if ort_id is not null then
      perform app.lagerort_wahl_pruefen(a.company_id);
    end if;
  end if;

  if a.transaction_type <> 'return' then
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    -- Mit Eigentümerrechten hält kein Zeilenschutz mehr einen Artikel eines
    -- anderen Betriebs fern; der Fremdschlüssel prüft nur, dass es ihn gibt.
    if katalog is not null and not exists (
      select 1 from public.materials m where m.id = katalog and m.company_id = a.company_id
    ) then
      katalog := null;
    end if;
    if katalog is not null then
      if ort_id is null then
        if a.beschaffung = 'einkauf' and a.geliefert_am is null then
          perform app.lager_kontext('eingang', null, null, null, 'Anforderung, beim Abholen geliefert', a.id);
          perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
        end if;
        perform app.lager_kontext('entnahme', null, null, null,
          coalesce('Baustelle ' || nullif(a.project_number, ''), 'Anforderung') || ' · ' || coalesce(a.user_name, ''), a.id);
        perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
        perform app.lager_kontext_leeren();
      else
        -- Dieselben Buchungen am Quellort.
        if a.beschaffung = 'einkauf' and a.geliefert_am is null then
          perform app.lager_kontext('eingang', null, null, null, 'Anforderung, beim Abholen geliefert', a.id);
          perform app.ort_anpassen(ort_id, katalog, coalesce(a.quantity, 0), false);
        end if;
        perform app.lager_kontext('entnahme', null, null, null,
          coalesce('Baustelle ' || nullif(a.project_number, ''), 'Anforderung') || ' · ' || coalesce(a.user_name, ''), a.id);
        perform app.ort_anpassen(ort_id, katalog, -coalesce(a.quantity, 0), true);
        perform app.lager_kontext_leeren();
      end if;
    end if;
  end if;

  perform set_config('app.ort_setzen', 'ja', true);
  update public.material_orders
     set status = 'Erledigt',
         processed = true,
         material_id = coalesce(a.material_id, katalog),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end,
         lagerort_id = ort_id
   where id = p_order;
  perform set_config('app.ort_setzen', '', true);
  return 1;
end;
$$;

revoke all on function public.anforderung_abschliessen(uuid, text, uuid) from public, anon;
grant execute on function public.anforderung_abschliessen(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. „Geliefert“ aus der Einkaufsliste mit Zielort
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20260930380000_lagerbewegungen.sql (mit den Rechten des
  Aufrufers, wie bisher). Neu: `p_ort`, der Zielort für alles, was dieser
  Aufruf als geliefert bucht. Eine Anforderung, deren Ware an einen weiteren
  Ort kommt, trägt ihn danach (siehe oben).
*/
drop function if exists public.einkauf_geliefert(uuid[]);

create or replace function public.einkauf_geliefert(p_ids uuid[], p_ort uuid default null)
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  p public.einkauf_posten%rowtype;
  katalog uuid;
  n integer := 0;
  ort public.lagerorte;
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
    if katalog is not null then
      perform app.lager_kontext('eingang', null,
        (select s.name from public.suppliers s where s.id = a.supplier_id), null,
        'Einkaufsliste · Anforderung' || coalesce(' Baustelle ' || nullif(a.project_number, ''), ''), a.id);
      if ort.id is null then
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      else
        perform app.ort_anpassen(ort.id, katalog, coalesce(a.quantity, 0), false);
      end if;
      perform app.lager_kontext_leeren();
    end if;
    perform set_config('app.ort_setzen', case when ort.id is not null then 'ja' else '' end, true);
    update public.material_orders
       set geliefert_am = now(),
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
        (select s.name from public.suppliers s where s.id = p.supplier_id), null, 'Einkaufsliste · fürs Lager', null);
      if ort.id is null then
        perform public.bestand_anpassen(katalog, p.menge);
      else
        perform app.ort_anpassen(ort.id, katalog, p.menge, false);
      end if;
      perform app.lager_kontext_leeren();
    end if;
    update public.einkauf_posten
       set geliefert_am = now(),
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(p.material_id, katalog)
     where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.einkauf_geliefert(uuid[], uuid) from public, anon;
grant execute on function public.einkauf_geliefert(uuid[], uuid) to authenticated;
