/*
  EIN WEG FÜR EINE LIEFERUNG (M12, B17 der Durchsicht 15.11.2026).

  Für dieselbe Lieferung gab es zwei Wege: den Wareneingang im Lager (mit
  Lieferant und Lieferschein) und „Geliefert“ auf der Einkaufsliste. Beide
  buchen den Eingang in den Bestand; keiner wusste vom anderen. Wer die Ware
  im Lager eingebucht hatte, sah die Bestellung weiter offen und hakte sie
  später auf der Einkaufsliste ab — die Menge stand doppelt im Bestand. Wer
  nur den Wareneingang nahm, ließ die Anforderung „bestellt“ stehen, und der
  Monteur erfuhr nie, dass sein Material da ist.

  Jetzt: der Wareneingang nimmt die offenen Bestellungen dieses Artikels mit
  (`p_bestellungen`, Anforderungen und eigene Posten der Einkaufsliste; die
  App bietet alle bestellten an und hakt sie vor). Er erledigt sie in der
  übergebenen Reihenfolge über dieselben Funktionen wie „Geliefert“
  (`einkauf_geliefert`, bei zu wenig Ware die letzte als Teillieferung über
  `einkauf_teillieferung`) — mit dem Lieferschein, an den gewählten Ort; die
  Anforderung wird abholbereit, der Besteller bekommt seine Meldung. Nur was
  darüber hinaus kam, geht frei in den Bestand, wie bisher. „Geliefert“ auf
  der Einkaufsliste bucht den Eingang ohnehin selbst; gebucht wird also
  genau einmal, gleich wo man beginnt.

  Ist eine der genannten Bestellungen inzwischen geliefert, storniert oder
  gehört sie nicht zu diesem Artikel, wird nichts gebucht (55000) — sonst
  ginge die Menge still in den freien Bestand, und die Bestellung bliebe
  offen.

  Die Wiederholung desselben Vorgangs (E58) liefert ihr Ergebnis von damals;
  die Auswahl gehört zur Nutzlast, eine andere Auswahl mit derselben
  Kennung weist die Datenbank ab.

  ALTE APP: ruft ohne `p_bestellungen` und bucht wie bisher nur den Eingang
  (benannte Grenze — die Produktion wird nicht umgeschrieben, und alte
  Aufrufe ändern ihre Bedeutung nicht). ALTDATEN: unberührt.
  DATENSCHUTZ: keine neue Tabelle.
*/

drop function if exists public.lager_eingang(uuid, numeric, text, text, text, uuid, uuid);

-- Rumpf wie in 20261110120000_material_ablauf_luecken.sql; neu sind `p_bestellungen` und Abschnitt „Bestellungen“.
create or replace function public.lager_eingang(
  p_material uuid, p_menge numeric, p_lieferant text, p_lieferschein text, p_bezug text,
  p_ort uuid default null, p_vorgang uuid default null, p_bestellungen uuid[] default null
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
  frueher jsonb;
  bestellungen uuid[] := coalesce(p_bestellungen, '{}');
  schein text := nullif(btrim(coalesce(p_lieferschein, '')), '');
  zeile record;
  rest numeric := p_menge;
  teil numeric;
  gueltig integer;
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
  if (select count(distinct b) from unnest(bestellungen) b) <> cardinality(bestellungen) then
    raise exception 'Eine Bestellung ist doppelt genannt' using errcode = '22023';
  end if;
  ort := app.ort_pruefen(artikel.company_id, p_ort, true);

  -- Eine Wiederholung liefert ihr Ergebnis von damals.
  if p_vorgang is not null then
    frueher := app.befehl_beginnen(artikel.company_id, p_vorgang, 'wareneingang', jsonb_build_object(
      'material', p_material, 'menge', p_menge, 'lieferant', btrim(p_lieferant),
      'lieferschein', schein,
      'bezug', nullif(btrim(coalesce(p_bezug, '')), ''), 'ort', ort.id)
      -- Nur mit Auswahl: ein Vorgang der alten App behält seine Nutzlast von damals.
      || case when cardinality(bestellungen) > 0
              then jsonb_build_object('bestellungen', to_jsonb(bestellungen)) else '{}'::jsonb end);
    if frueher is not null then
      return (frueher ->> 'bestand')::numeric;
    end if;
  end if;

  if ort.id is not null then
    perform app.lagerort_wahl_pruefen(artikel.company_id);
  end if;

  -- NEU: Bestellungen — zuerst gesperrt und geprüft, dann der Reihe nach erledigt.
  if cardinality(bestellungen) > 0 then
    perform 1 from public.material_orders o
     where o.id = any(bestellungen) and o.company_id = artikel.company_id
     order by o.id for update;
    perform 1 from public.einkauf_posten e
     where e.id = any(bestellungen) and e.company_id = artikel.company_id
     order by e.id for update;
    select count(*) into gueltig from (
      select o.id from public.material_orders o
       where o.id = any(bestellungen) and o.company_id = artikel.company_id
         and o.material_id = p_material and o.transaction_type = 'order'
         and o.beschaffung = 'einkauf' and o.geliefert_am is null and not o.processed
      union all
      select e.id from public.einkauf_posten e
       where e.id = any(bestellungen) and e.company_id = artikel.company_id
         and e.material_id = p_material and e.geliefert_am is null
    ) x;
    if gueltig <> cardinality(bestellungen) then
      raise exception 'Eine der Bestellungen ist inzwischen geliefert oder geändert — bitte den Wareneingang neu öffnen.'
        using errcode = '55000';
    end if;

    for zeile in
      select x.id, x.menge from (
        select o.id, o.quantity as menge from public.material_orders o
         where o.id = any(bestellungen) and o.company_id = artikel.company_id
        union all
        select e.id, e.menge from public.einkauf_posten e
         where e.id = any(bestellungen) and e.company_id = artikel.company_id
      ) x
      order by array_position(bestellungen, x.id)
    loop
      exit when rest <= 0;
      teil := least(rest, zeile.menge);
      if teil < zeile.menge then
        perform public.einkauf_teillieferung(zeile.id, teil, schein, ort.id);
      else
        perform public.einkauf_geliefert(array[zeile.id], ort.id, schein);
      end if;
      rest := rest - teil;
    end loop;
  end if;

  -- Was über die Bestellungen hinaus kam, geht frei in den Bestand — wie bisher.
  if rest > 0 then
    perform app.lager_kontext('eingang', null, btrim(p_lieferant),
      schein, nullif(btrim(coalesce(p_bezug, '')), ''), null);
    if ort.id is null then
      perform set_config('app.lager_buchung', 'ja', true);
      update public.materials set stock = stock + rest where id = p_material;
      perform set_config('app.lager_buchung', '', true);
    else
      perform app.ort_anpassen(ort.id, p_material, rest, false);
    end if;
    perform app.lager_kontext_leeren();
  end if;

  if ort.id is null then
    select m.stock into neu from public.materials m where m.id = p_material;
  else
    -- Null dazu: liefert den Stand am Ort, ohne zu buchen.
    neu := app.ort_anpassen(ort.id, p_material, 0, false);
  end if;

  if p_vorgang is not null then
    perform app.befehl_abschliessen(artikel.company_id, p_vorgang,
      jsonb_build_object('ergebnis', 'ausgefuehrt', 'vorgang', p_vorgang, 'bestand', neu));
  end if;
  return neu;
end;
$$;

revoke all on function public.lager_eingang(uuid, numeric, text, text, text, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.lager_eingang(uuid, numeric, text, text, text, uuid, uuid, uuid[]) to authenticated;
