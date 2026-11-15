/*
  M6 (Durchsicht 15.11.2026): LAGERFÜHRUNG IST EINE EIGENSCHAFT DES ARTIKELS,
  NICHT DIE FOLGE EINER LIEFERUNG.

  WAS FALSCH WAR. Jede über die Einkaufsliste gelieferte Kommissionsware
  wurde dauerhaft Lagerartikel: `einkauf_geliefert` und „beim Abholen
  geliefert“ (`anforderung_abschliessen`) buchten den Eingang in den Bestand,
  `app.lager_folgt_bestand` setzte daraufhin `lagerartikel`, und zurück
  setzte es nichts. Nach der Abholung stand der Artikel mit Bestand null in
  der Lagerliste, unter „knapp“ und auf der Startseite; im Katalog des
  Monteurs hieß es „nichts frei“ statt „wird bestellt“. Bei einem Katalog mit
  zehntausenden Artikeln sammeln sich so übers Jahr Hunderte solcher Zeilen,
  und die Knapp-Warnung verliert ihren Wert.

  WIE ES JETZT IST. Ware für eine Anforderung, deren Artikel das Lager nicht
  führt, liegt bei der Anforderung (Kommission), nicht im Bestand: die
  Lieferung bucht keinen Eingang, die Abholung keine Entnahme. Die Anforderung
  merkt sich das (`kommission`), damit die Abholung nichts abbucht, was nie
  eingebucht wurde — auch wenn der Artikel inzwischen geführt wird.
  Ein geführter Artikel bucht wie bisher. Bestand, der bewusst ins Lager
  kommt (Wareneingang, eigener Posten des Büros, Inventur, Umlagerung,
  Retoure), macht den Artikel weiter zum Lagerartikel — dort entscheidet das
  Lager, ihn zu führen.

  ALTDATEN. Artikel, die so schon Lagerartikel geworden sind, bleiben es —
  die Produktion wird nicht umgeschrieben. Das Lager kann sie in einem
  Schritt aus dem Lager nehmen (`kommissionsartikel_im_lager`): genau die
  Lagerartikel ohne Bestand (auch an keinem weiteren Ort), ohne Mindest- und
  Sollmenge, deren Eingänge allesamt aus Lieferungen für Anforderungen
  stammen. Was nie anders als so ins Lager kam, hat niemand bewusst geführt.

  RECHTE: Lesen und Ausführen für die Verwaltung und die Führung, wie das
  Ändern der Lagerführung im Katalog (`materialfelder_geschuetzt`).
  DATENSCHUTZ: keine neue Tabelle, keine Personendaten.
*/

alter table public.material_orders
  add column if not exists kommission boolean not null default false;

comment on column public.material_orders.kommission is
  'M6: geliefert, ohne in den Bestand zu gehen (Artikel nicht im Lager geführt) — die Abholung bucht dann auch nichts ab.';

create or replace function public.anforderung_abschliessen(
  p_order uuid, p_status text default null, p_ort uuid default null, p_herkunft text default null)
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
  kommissionsartikel uuid;
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

  if p_herkunft is not null and p_herkunft not in ('lager', 'haendler') then
    raise exception 'Herkunft ist „lager“ oder „haendler“' using errcode = '22023';
  end if;
  /*
    BEIM HÄNDLER MITGENOMMEN (C7, E89) geht nur, solange das Büro nichts
    bereitgestellt hat und nichts beim Großhändler bestellt ist: liegt die
    Ware schon abholbereit im Lager oder ist sie unterwegs, kam sie nicht
    vom Händler um die Ecke.
  */
  if p_herkunft = 'haendler' and (
       a.transaction_type = 'return' or a.processed
       or a.status not in ('Offen', 'In Bearbeitung')
       or (a.beschaffung = 'einkauf' and (a.bestellt_am is not null or a.geliefert_am is not null))) then
    raise exception 'Beim Händler mitgenommen geht nur, solange nichts bereitgestellt oder bestellt ist' using errcode = '23514';
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

  -- Vom Händler: das Lager hat nichts ausgegeben, also wird nichts abgebucht (und keine Lieferung erwartet).
  if a.transaction_type <> 'return' and coalesce(p_herkunft, 'lager') = 'lager' then
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    -- Mit Eigentümerrechten hält kein Zeilenschutz mehr einen Artikel eines
    -- anderen Betriebs fern; der Fremdschlüssel prüft nur, dass es ihn gibt.
    if katalog is not null and not exists (
      select 1 from public.materials m where m.id = katalog and m.company_id = a.company_id
    ) then
      katalog := null;
    end if;
    /*
      NEU (M6): KOMMISSIONSWARE BERÜHRT KEINEN BESTAND. Ein Artikel, den das
      Lager nicht führt, kam für genau diese Anforderung (Einkaufsliste) —
      er lag nie im Regal und geht nicht aus ihm. Vorher buchte die Abholung
      Eingang und Entnahme zugleich; der Eingang machte den Artikel für immer
      zum Lagerartikel (`app.lager_folgt_bestand`), der danach mit Bestand
      null als „knapp“ dastand.
    */
    if katalog is not null and (a.kommission or not exists (
      select 1 from public.materials m where m.id = katalog and m.lagerartikel
    )) then
      kommissionsartikel := katalog;
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
         material_id = coalesce(a.material_id, katalog, kommissionsartikel, app.katalogeintrag(a.company_id, a.material_name)),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end,
         lagerort_id = ort_id,
         abgeholt_herkunft = case when a.transaction_type = 'return' then null else coalesce(p_herkunft, 'lager') end
   where id = p_order;
  perform set_config('app.ort_setzen', '', true);
  return 1;
end;
$$;


revoke all on function public.anforderung_abschliessen(uuid, text, uuid, text) from public, anon;
grant execute on function public.anforderung_abschliessen(uuid, text, uuid, text) to authenticated;

/*
  Rumpf wie in 20261107200100_lagerorte_bestehende_wege.sql; neu ist nur die
  Frage nach der Lagerführung bei der Anforderung (M6). Der eigene Posten des
  Büros ist ein Einkauf fürs Lager und bucht wie bisher.
*/
create or replace function public.einkauf_geliefert(p_ids uuid[], p_ort uuid default null)
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
        (select s.name from public.suppliers s where s.id = a.supplier_id), null,
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

-- ---------------------------------------------------------------------------
-- Altdaten: Kommissionsartikel, die schon im Lager stehen
-- ---------------------------------------------------------------------------

/*
  `p_ausfuehren = false`: die Artikel nennen (für die Rückfrage).
  `p_ausfuehren = true`: genau diese aus dem Lager nehmen (`p_ids`, aus der
  Rückfrage) — nur, wenn sie die Bedingung noch erfüllen; was inzwischen
  Bestand bekam, bleibt. Antwort: [{id, name}] der betroffenen Artikel.
*/
create or replace function public.kommissionsartikel_im_lager(
  p_ausfuehren boolean default false, p_ids uuid[] default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  liste jsonb;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Die Lagerführung ändert die Verwaltung oder die Leitung' using errcode = '42501';
  end if;

  with treffer as (
    select m.id, m.name
      from public.materials m
     where m.company_id = betrieb
       and m.lagerartikel
       and m.stock = 0
       and m.mindestmenge is null
       and m.sollbestand is null
       and not exists (select 1 from public.lagerbestaende b where b.material_id = m.id and b.menge <> 0)
       -- Mindestens ein Eingang aus einer Lieferung für eine Anforderung …
       and exists (select 1 from public.lagerbewegungen l
                    where l.company_id = betrieb and l.material_id = m.id and l.art = 'eingang'
                      and l.material_order_id is not null)
       -- … und keine Bewegung, mit der jemand bewusst Bestand ins Lager gelegt hat.
       and not exists (select 1 from public.lagerbewegungen l
                        where l.company_id = betrieb and l.material_id = m.id
                          and (l.art in ('anfangsbestand', 'inventur', 'zugang', 'umlagerung', 'retoure')
                               or (l.art = 'eingang' and l.material_order_id is null)))
       and (p_ids is null or m.id = any(p_ids))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name, t.id), '[]'::jsonb)
    into liste
    from treffer t;

  if coalesce(p_ausfuehren, false) then
    if p_ids is null then
      raise exception 'Welche Artikel? Die Liste kommt aus der Rückfrage.' using errcode = '22023';
    end if;
    update public.materials m
       set lagerartikel = false
     where m.company_id = betrieb
       and m.id in (select (e ->> 'id')::uuid from jsonb_array_elements(liste) e);
  end if;
  return liste;
end;
$$;

revoke all on function public.kommissionsartikel_im_lager(boolean, uuid[]) from public, anon;
grant execute on function public.kommissionsartikel_im_lager(boolean, uuid[]) to authenticated;
