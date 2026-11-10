/*
  MATERIALABLAUF: VIER LÜCKEN IN DER DATENBANK (Prüfbericht 10.11.2026)

  1. ZURÜCK AUF „OFFEN“ NIMMT DIE ZUSAGE AUS DEM LAGER ZURÜCK.
     Nach „Aus Lager“ (Beschaffung „lager“, abholbereit) ließ sich die
     Anforderung von Hand auf „Offen“ oder „In Bearbeitung“ setzen — sie blieb
     aber zugesagt (`app.lager_zugesagt` zählt jede unverbuchte Zeile mit
     Beschaffung „lager“), und die Ansicht bot weder „Aus Lager“ noch „Nicht
     auf Lager“ an: ein Stand ohne nächsten Schritt, der Ware im Regal
     festhielt. Jetzt heißt zurück vor „Abholbereit“ auch „noch nicht
     entschieden“: die Beschaffung wird leer, die Zusage fällt weg. Was schon
     abgeholt und verbucht ist, bleibt wie es ist.

  2. EINE RETOURE UND EIN WARENEINGANG BUCHEN BEI WIEDERHOLUNG NICHT DOPPELT.
     Riss nach dem Senden das Netz ab, schickte ein zweiter Tipp denselben
     Vorgang noch einmal — mit neuer Kennung, also ein zweiter Beleg und eine
     zweite Gutschrift. Jetzt trägt das Formular eine Kennung je Öffnen:
     - `retoure_anlegen`: dieselbe Kennung legt keine zweite Zeile an und
       schreibt nichts gut; zurück kommt die Kennung des ersten Belegs — nur,
       wenn Betrieb, Person und Inhalt passen. Sonst eine klare Ablehnung.
     - `lager_eingang`: nach dem Schreibbefehls-Vertrag (E58,
       `befehle_vorgaenge`), mit `p_vorgang`. Ohne Kennung bucht der Aufruf
       wie bisher.

  3. UMLAGERN AUS DEM HAUPTLAGER NIMMT KEINE ZUGESAGTE WARE MEHR STILL MIT.
     `umlagern` prüfte nur den Bestand. Zugesagte Anforderungen und
     Rüstlisten reservieren aber gegen das Hauptlager (`lager_frei`); lag
     danach weniger im Regal als zugesagt, sah der Monteur „abholbereit“ für
     Ware, die im Fahrzeug war. Jetzt rechnet die Umlagerung aus dem
     Hauptlager frei wie `lager_frei`. Mehr als frei: nichts gebucht, die
     Antwort „reserviert“ mit den Zahlen; gebucht wird erst mit der
     ausdrücklichen Bestätigung im Befehl (`trotz_reserviert`), und die steht
     dann im Bewegungsprotokoll. An einem weiteren Ort gibt es keine
     Reservierung — dort bleibt alles wie bisher.

  4. LÖSCHEN EINER VERBUCHTEN ANFORDERUNG ODER RETOURE BUCHT DEN BESTAND ZURÜCK.
     Gelöscht wurde an der Tabelle: die Zeile verschwand aus dem
     Rechnungsvorschlag (`ausgegebenes_material`), der Bestand blieb aber
     abgezogen bzw. gutgeschrieben. Jetzt löscht `anforderung_loeschen`:
     - es bucht in derselben Transaktion zurück, was die Zeile im Bestand
       bewirkt hat — genau die Bewegungen, die das Protokoll ihr zuordnet:
       bei einer Anforderung die Entnahme (die Ausgabe gilt als nicht
       geschehen; ein Wareneingang für sie bleibt, die Ware kam ja), bei einer
       Retoure die Gutschrift. Je Ort, an dem gebucht wurde;
     - es weist mit Grund ab, wenn das nicht sauber geht: die Ausgabe ist
       schon abgerechnet (Rechnung der Baustelle bis zu diesem Tag), die
       Buchung liegt vor dem Bewegungsprotokoll (ohne Beleg, was sie bewirkt
       hat), oder für das Zurückbuchen einer Gutschrift liegt nicht mehr genug
       am Ort;
     - mit `p_ausfuehren = false` sagt es nur, was geschähe — damit die
       Rückfrage die Folge nennt; ausgeführt wird nur auf dem Stand, den die
       Rückfrage zeigte (`p_erwartet`).
     Unverbuchte Zeilen löscht es wie bisher. An der Tabelle vorbei lässt ein
     Riegel keine verbuchte Zeile mehr löschen.

  RECHTE wie bisher: Status setzen Verwaltung, Buchhaltung, Leitung;
  löschen Verwaltung und Leitung (`material_orders_loeschen`); Retoure und
  Wareneingang unverändert. Der Supportzugang schreibt nie
  (`support_schreibt_nicht` an den Tabellen).

  DATENSCHUTZ: keine neue Tabelle, keine neuen Personendaten. Der
  Wareneingang mit Kennung steht wie die Umlagerung in `befehle_vorgaenge`
  (in der Datenauskunft schon gezählt). Die Gegenbuchung steht im
  Bewegungsprotokoll wie jede Buchung, mit `erfasst_von`.
*/

-- ---------------------------------------------------------------------------
-- 1. Status von Hand: zurück vor „Abholbereit“ nimmt die Lagerzusage zurück
-- ---------------------------------------------------------------------------

/* Rumpf wie in 20261031210000_r7_anforderung_status.sql; neu nur die Beschaffung. */
create or replace function public.anforderung_status_setzen(
  p_id uuid, p_von text, p_nach text, p_trotz_fehlbestand boolean default false
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders;
  neu public.material_orders;
  fehlt jsonb;
begin
  if p_nach is null or p_nach not in ('Offen', 'In Bearbeitung', 'Abholbereit') then
    raise exception 'Abgeschlossen wird über „Abgeholt“ — dabei geht die Ware aus dem Lager'
      using errcode = '22023';
  end if;

  select * into a from public.material_orders o where o.id = p_id for update;
  -- `coalesce`: ohne Supportzugang ist `app.supportbetrieb()` leer, und ein leerer Vergleich ließe durch.
  if a.id is null
     or not coalesce(a.company_id = (select app.lesebetrieb()) or a.company_id = (select app.supportbetrieb()), false) then
    return jsonb_build_object('ergebnis', 'veraltet', 'status', null);
  end if;
  if not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Stand einer Anforderung setzt das Lager — abgeholt wird über „Abgeholt“'
      using errcode = '42501';
  end if;
  if a.transaction_type <> 'order' then
    raise exception 'Eine Retoure hat keinen Stand zum Setzen' using errcode = '22023';
  end if;
  if (p_von is not null and a.status is distinct from p_von) or a.status = p_nach then
    return jsonb_build_object('ergebnis', 'veraltet', 'status', a.status);
  end if;

  neu := a;
  neu.status := p_nach;
  /*
    NEU: Zurück vor „Abholbereit“ heißt „noch nicht entschieden“. Die
    Zusage aus dem Regal fällt weg, und die Anforderung hat wieder ihre
    beiden nächsten Schritte („Aus Lager“, „Nicht auf Lager“). Was abgeholt
    und verbucht ist, behält seine Beschaffung — dort ist nichts mehr
    zugesagt, der Bestand ist schon abgezogen.
  */
  if a.beschaffung = 'lager' and not a.processed and p_nach in ('Offen', 'In Bearbeitung') then
    neu.beschaffung := null;
  end if;
  fehlt := app.regal_fehlt(a, neu);
  if fehlt is not null then
    if not coalesce(p_trotz_fehlbestand, false) then
      return jsonb_build_object('ergebnis', 'fehlbestand') || (fehlt - 'weg');
    end if;
    -- Nur für diese Zeile und nur in diesem Zug: der Riegel lässt sie durch und schreibt das Protokoll.
    perform set_config('app.abholbereit_trotzdem', a.id::text, true);
  end if;

  update public.material_orders set status = p_nach, beschaffung = neu.beschaffung where id = a.id;
  perform set_config('app.abholbereit_trotzdem', '', true);
  return jsonb_build_object('ergebnis', 'geaendert');
end;
$$;

revoke all on function public.anforderung_status_setzen(uuid, text, text, boolean) from public, anon;
grant execute on function public.anforderung_status_setzen(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2a. Retoure: dieselbe Kennung bucht nicht zweimal
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261107200100_lagerorte_bestehende_wege.sql. Neu: eine
  Kennung, die es schon gibt, legt nichts an und schreibt nichts gut.

  Geprüft wird zweimal: vorn, damit eine Wiederholung nichts anfasst (auch
  keinen Katalogeintrag sucht oder anlegt), und am Einfügen selbst
  (`on conflict do nothing`), weil zwei gleichzeitige Wiederholungen beide an
  der ersten Prüfung vorbeikommen — die zweite wartet dann am Schlüssel und
  fügt nichts ein.
*/
create or replace function app.retoure_wiederholt(p_id uuid, p_beleg jsonb, p_betrieb text, p_person uuid)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  alt public.material_orders;
begin
  select * into alt from public.material_orders o where o.id = p_id;
  if alt.id is null then
    return false;
  end if;
  /*
    Nur der eigene Beleg mit demselben Inhalt ist eine Wiederholung. Eine
    fremde Kennung bekommt keine Auskunft, eine geänderte Eingabe keinen
    stillen Erfolg — wer nach einem Abbruch die Menge änderte, muss wissen,
    dass die erste Fassung schon gebucht ist.
  */
  if alt.company_id is distinct from p_betrieb
     or alt.transaction_type is distinct from 'return'
     or alt.user_id is distinct from p_person then
    raise exception 'Diese Kennung gehört schon zu einem anderen Beleg — bitte das Fenster schließen und neu erfassen'
      using errcode = '23505';
  end if;
  if alt.material_name is distinct from p_beleg ->> 'material_name'
     or alt.quantity is distinct from (p_beleg ->> 'quantity')::numeric
     or alt.condition is distinct from p_beleg ->> 'condition' then
    raise exception 'Diese Retoure ist schon erfasst — mit anderen Angaben (% %). Bitte unter „Retouren“ nachsehen, bevor erneut erfasst wird.',
      trim_scale(alt.quantity), alt.material_name
      using errcode = '23505';
  end if;
  return true;
end;
$$;

revoke all on function app.retoure_wiederholt(uuid, jsonb, text, uuid) from public, anon, authenticated;

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

  -- NEU: eine Wiederholung derselben Retoure — nichts noch einmal.
  if app.retoure_wiederholt(neu, p_beleg, betrieb, person) then
    return neu;
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
  )
  on conflict (id) do nothing;
  perform set_config('app.ort_setzen', '', true);

  -- NEU: ohne neue Zeile keine Gutschrift — eine gleichzeitige Wiederholung war schneller.
  if not found then
    if app.retoure_wiederholt(neu, p_beleg, betrieb, person) then
      return neu;
    end if;
    raise exception 'Die Retoure ließ sich nicht anlegen' using errcode = '40001';
  end if;

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
-- 2b. Wareneingang: mit Vorgangskennung höchstens einmal
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261107200100_lagerorte_bestehende_wege.sql. Neu:
  `p_vorgang` — nach dem Schreibbefehls-Vertrag (E58): dieselbe Kennung mit
  denselben Angaben liefert den Bestand von damals und bucht nichts; mit
  anderen Angaben ist sie ein Konflikt. Ohne Kennung wie bisher. Die Signatur
  wächst um einen Parameter mit Vorgabe; die alte wird ersetzt, damit ein
  Aufruf mit sechs Werten eindeutig bleibt.
*/
drop function if exists public.lager_eingang(uuid, numeric, text, text, text, uuid);

create or replace function public.lager_eingang(
  p_material uuid, p_menge numeric, p_lieferant text, p_lieferschein text, p_bezug text,
  p_ort uuid default null, p_vorgang uuid default null
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

  -- NEU: eine Wiederholung liefert ihr Ergebnis von damals.
  if p_vorgang is not null then
    frueher := app.befehl_beginnen(artikel.company_id, p_vorgang, 'wareneingang', jsonb_build_object(
      'material', p_material, 'menge', p_menge, 'lieferant', btrim(p_lieferant),
      'lieferschein', nullif(btrim(coalesce(p_lieferschein, '')), ''),
      'bezug', nullif(btrim(coalesce(p_bezug, '')), ''), 'ort', ort.id));
    if frueher is not null then
      return (frueher ->> 'bestand')::numeric;
    end if;
  end if;

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

  if p_vorgang is not null then
    perform app.befehl_abschliessen(artikel.company_id, p_vorgang,
      jsonb_build_object('ergebnis', 'ausgefuehrt', 'vorgang', p_vorgang, 'bestand', neu));
  end if;
  return neu;
end;
$$;

revoke all on function public.lager_eingang(uuid, numeric, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.lager_eingang(uuid, numeric, text, text, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Umlagern aus dem Hauptlager: nur, was frei ist — sonst Rückfrage
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261107200000_lagerorte_fahrzeuge_umlagerung.sql. Neu im
  Befehl: `trotz_reserviert` (Wahrheitswert, Vorgabe nein). Neu in der
  Antwort: `reserviert` — nichts geschrieben: aus dem Hauptlager sollte mehr
  umgelagert werden als frei ist; dazu Bestand, zugesagt, frei, Menge und
  Einheit. Wer bestätigt, sendet den Befehl mit `trotz_reserviert` und einer
  neuen Vorgangskennung (die Nutzlast ist eine andere). Die Bestätigung steht
  in der Bewegung (Bezug).
*/
create or replace function public.umlagern(p_befehl jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  vorgang uuid;
  frueher jsonb;
  von_ort public.lagerorte;
  nach_ort public.lagerorte;
  von_id uuid;
  nach_id uuid;
  artikel public.materials;
  artikel_id uuid;
  menge numeric;
  erwartet numeric;
  einheit text;
  bestand_von numeric;
  bestand_nach numeric;
  ort uuid;
  ergebnis jsonb;
  notiz text := nullif(btrim(coalesce(p_befehl ->> 'grund', '')), '');
  trotz boolean := false;
  zugesagt numeric;
  frei numeric;
  vermerk text := '';
begin
  -- 1. Sitzung und Mandant, Form
  if betrieb is null or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb)) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  vorgang := app.befehl_vorgang(p_befehl);
  if p_befehl ->> 'aktion' is distinct from 'umlagerung' then
    raise exception 'Unbekannte Aktion — erwartet „umlagerung“' using errcode = '22023';
  end if;
  begin
    artikel_id := (p_befehl #>> '{ziel,artikel}')::uuid;
    menge := (p_befehl ->> 'menge')::numeric;
    erwartet := (p_befehl #>> '{erwartet,bestand_von}')::numeric;
    von_id := nullif(p_befehl #>> '{ziel,von}', '')::uuid;
    nach_id := nullif(p_befehl #>> '{ziel,nach}', '')::uuid;
    trotz := coalesce((p_befehl ->> 'trotz_reserviert')::boolean, false);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Der Befehl ist nicht vollständig: Artikel, Orte, Menge und erwarteter Bestand' using errcode = '22023';
  end;
  if artikel_id is null or erwartet is null or menge is null then
    raise exception 'Der Befehl ist nicht vollständig: Artikel, Menge und erwarteter Bestand am Quellort' using errcode = '22023';
  end if;
  von_ort := app.ort_pruefen(betrieb, von_id, true);
  nach_ort := app.ort_pruefen(betrieb, nach_id, true);
  von_id := von_ort.id;
  nach_id := nach_ort.id;
  if von_id is not distinct from nach_id then
    raise exception 'Quelle und Ziel sind derselbe Ort' using errcode = '22023';
  end if;

  -- Rechte: Verwaltung und Leitung; der Fahrer nur aus seinem Fahrzeug ins Hauptlager, wenn der Betrieb es erlaubt.
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    if not coalesce(von_ort.art = 'fahrzeug' and nach_id is null
                    and app.eigenes_fahrzeug(von_id)
                    and (select c.lager_rueckgabe_fahrer from public.companies c where c.id = betrieb), false) then
      raise exception 'Umlagern darf die Verwaltung oder die Leitung — der Fahrer gibt aus seinem Fahrzeug ins Hauptlager zurück, wenn der Betrieb es erlaubt'
        using errcode = '42501';
    end if;
  end if;

  -- Wiederholung?
  frueher := app.befehl_beginnen(betrieb, vorgang, 'umlagerung', p_befehl);
  if frueher is not null then
    return frueher;
  end if;
  /*
    V3 nach der Wiederholung: ein schon ausgeführter Vorgang liefert sein
    bestätigtes Ergebnis, auch wenn inzwischen abgeschaltet ist — sonst hielte
    der Aufrufer für gescheitert, was gebucht ist. Ein neuer wird abgewiesen;
    die Ausnahme nimmt den eben vermerkten Vorgang mit zurück.
  */
  if not app.modul_aktiv(betrieb, 'material.lagerorte_fahrzeuglager') then
    raise exception 'Lagerorte und Fahrzeuglager sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;

  -- 2. Sperren: der Artikel, dann die Orte nach ihrer Kennung
  select * into artikel from public.materials m
   where m.id = artikel_id and m.company_id = betrieb
   for no key update;
  if artikel.id is null then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = 'P0002';
  end if;
  for ort in select x from unnest(array[von_id, nach_id]) x where x is not null order by x loop
    perform app.ort_sperren(ort, artikel.id);
  end loop;

  -- 3. Erwarteter Stand
  bestand_von := case when von_id is null then coalesce(artikel.stock, 0)
                      else (select b.menge from public.lagerbestaende b
                             where b.lagerort_id = von_id and b.material_id = artikel.id) end;
  einheit := coalesce(nullif(btrim(artikel.unit), ''), 'Stk');
  if bestand_von is distinct from erwartet
     or lower(einheit) is distinct from lower(coalesce(nullif(btrim(p_befehl ->> 'einheit'), ''), 'Stk')) then
    return app.befehl_abschliessen(betrieb, vorgang, jsonb_build_object(
      'ergebnis', 'veraltet', 'vorgang', vorgang, 'artikel', artikel.id,
      'bestand_von', bestand_von, 'einheit', einheit));
  end if;

  -- 4. Prüfen
  if app.menge_fehler(menge, artikel.unit) is not null then
    raise exception '%', app.menge_fehler(menge, artikel.unit) using errcode = '23514';
  end if;
  if bestand_von < menge then
    return app.befehl_abschliessen(betrieb, vorgang, jsonb_build_object(
      'ergebnis', 'fehlbestand', 'vorgang', vorgang, 'artikel', artikel.id,
      'bestand_von', bestand_von, 'menge', menge, 'einheit', einheit));
  end if;
  /*
    NEU: AUS DEM HAUPTLAGER NUR, WAS FREI IST — dieselbe Rechnung wie
    `lager_frei` (Zusagen und Rüstlisten, `app.lager_zugesagt`). Die
    Kennung „kein Ausschluss“ ist die Null-Kennung: mit `null` fände der
    Vergleich `id <> null` keine Zeile.
  */
  if von_id is null then
    zugesagt := app.lager_zugesagt(artikel.id, '00000000-0000-0000-0000-000000000000'::uuid);
    frei := bestand_von - zugesagt;
    if menge > frei then
      if not trotz then
        return app.befehl_abschliessen(betrieb, vorgang, jsonb_build_object(
          'ergebnis', 'reserviert', 'vorgang', vorgang, 'artikel', artikel.id,
          'bestand_von', bestand_von, 'zugesagt', zugesagt, 'frei', frei,
          'menge', menge, 'einheit', einheit));
      end if;
      vermerk := ' · trotz Reservierung (frei ' || trim_scale(greatest(frei, 0)) || ' von '
                 || trim_scale(bestand_von) || ' ' || einheit || ')';
    end if;
  end if;

  -- 5./6. Schreiben, die Bewegungen schreiben die Auslöser in derselben Transaktion
  perform app.lager_kontext('umlagerung', notiz, null, null,
    'Umlagerung ' || app.ort_name(betrieb, von_id) || ' → ' || app.ort_name(betrieb, nach_id) || vermerk, null);
  perform app.lager_kontext_ort(nach_id, vorgang);
  if von_id is null then
    perform set_config('app.lager_buchung', 'ja', true);
    update public.materials set stock = stock - menge where id = artikel.id;
    perform set_config('app.lager_buchung', '', true);
  else
    perform app.ort_anpassen(von_id, artikel.id, -menge, false);
  end if;
  perform app.lager_kontext_ort(von_id, vorgang);
  if nach_id is null then
    perform set_config('app.lager_buchung', 'ja', true);
    update public.materials set stock = stock + menge where id = artikel.id;
    perform set_config('app.lager_buchung', '', true);
  else
    perform app.ort_anpassen(nach_id, artikel.id, menge, false);
  end if;
  perform app.lager_kontext_leeren();

  -- 7. Das bestätigte Ergebnis
  select case when von_id is null then m.stock end, case when nach_id is null then m.stock end
    into bestand_von, bestand_nach
    from public.materials m where m.id = artikel.id;
  ergebnis := jsonb_build_object(
    'ergebnis', 'ausgefuehrt',
    'vorgang', vorgang,
    'artikel', artikel.id,
    'von', von_id,
    'nach', nach_id,
    'menge', menge,
    'einheit', einheit,
    'bestand_von', coalesce(bestand_von, (select b.menge from public.lagerbestaende b
                                           where b.lagerort_id = von_id and b.material_id = artikel.id)),
    'bestand_nach', coalesce(bestand_nach, (select b.menge from public.lagerbestaende b
                                             where b.lagerort_id = nach_id and b.material_id = artikel.id)),
    'revision_von', (select b.revision from public.lagerbestaende b where b.lagerort_id = von_id and b.material_id = artikel.id),
    'revision_nach', (select b.revision from public.lagerbestaende b where b.lagerort_id = nach_id and b.material_id = artikel.id),
    'am', now());
  return app.befehl_abschliessen(betrieb, vorgang, ergebnis);
end;
$$;

revoke all on function public.umlagern(jsonb) from public, anon;
grant execute on function public.umlagern(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Löschen mit Gegenbuchung
-- ---------------------------------------------------------------------------

/*
  Was das Löschen einer Zeile im Bestand zurückbucht — oder warum es nicht
  geht. Antwort:
    {moeglich: true, gegenbuchung: [{material_id, name, einheit, ort_id, ort, menge}]}
    {moeglich: false, grund: '…'}
  `menge` ist die Gegenbuchung mit Vorzeichen (+ zurück ins Lager, − wieder
  heraus). Sortiert nach Artikel und Ort, damit `p_erwartet` vergleichbar ist.

  Grundlage sind die Bewegungen, die das Protokoll der Zeile zuordnet — bei
  einer Anforderung die Entnahmen, bei einer Retoure die Gutschriften —, je
  Ort zusammengezählt. Nur sie belegen, was wirklich gebucht wurde (eine
  Entnahme bei leerem Regal bleibt bei null stehen).
*/
create or replace function app.loeschen_gegenbuchung(a public.material_orders)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  grenze date;
  datum date;
  wirkung boolean;
  plan jsonb;
  z record;
  da numeric;
begin
  if a.is_billed or coalesce(a.invoice_number, '') <> '' then
    return jsonb_build_object('moeglich', false, 'grund',
      'Steht schon auf einer Rechnung' || coalesce(' (' || nullif(a.invoice_number, '') || ')', '')
      || ' — gelöscht stimmten Rechnung und Lager nicht mehr überein.');
  end if;

  /*
    ABGERECHNET: der Rechnungsvorschlag der Baustelle endet beim letzten
    abgerechneten Tag (`ausgegebenes_material`). Eine Ausgabe bis dahin ist
    auf einer Rechnung; zurückgebucht läge die verrechnete Ware wieder im
    Regal.
  */
  if (a.transaction_type = 'order' and a.status = 'Erledigt') or a.transaction_type = 'return' then
    select max(coalesce(i.leistung_bis, i.invoice_date)) into grenze
      from public.invoices i
     where i.company_id = a.company_id
       and i.payment_status <> 'Storniert'
       and i.art <> 'anzahlung'
       and regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i')
           = regexp_replace(trim(coalesce(a.project_number, '')), '^PR-', '', 'i')
       and regexp_replace(trim(coalesce(a.project_number, '')), '^PR-', '', 'i') <> '';
    datum := case when a.transaction_type = 'order'
                  then (coalesce(a.erledigt_am, a.updated_at) at time zone 'Europe/Vienna')::date
                  else (a.created_at at time zone 'Europe/Vienna')::date end;
    if grenze is not null and datum <= grenze then
      return jsonb_build_object('moeglich', false, 'grund',
        'Schon abgerechnet — die Rechnung der Baustelle ' || a.project_number || ' reicht bis '
        || to_char(grenze, 'DD.MM.YYYY') || '. Eine Korrektur des Bestands geht über die Inventur.');
    end if;
  end if;

  if not a.processed then
    return jsonb_build_object('moeglich', true, 'gegenbuchung', '[]'::jsonb);
  end if;

  plan := coalesce((
    select jsonb_agg(jsonb_build_object(
             'material_id', b.material_id,
             'name', m.name,
             'einheit', coalesce(nullif(btrim(m.unit), ''), 'Stk'),
             'ort_id', b.lagerort_id,
             'ort', app.ort_name(a.company_id, b.lagerort_id),
             'menge', -b.summe)
           order by b.material_id, b.lagerort_id nulls first)
      from (select l.material_id, l.lagerort_id, sum(l.menge) as summe
              from public.lagerbewegungen l
             where l.material_order_id = a.id
               and l.art = case when a.transaction_type = 'return' then 'retoure' else 'entnahme' end
             group by l.material_id, l.lagerort_id
            having sum(l.menge) <> 0) b
      join public.materials m on m.id = b.material_id
  ), '[]'::jsonb);

  /*
    OHNE BELEG KEINE GEGENBUCHUNG. Eine verbuchte Anforderung mit
    Katalogartikel, eine „neu“ zurückgegebene Retoure: sie haben den Bestand
    bewegt. Steht dazu keine Bewegung im Protokoll (gebucht vor dem
    30.09.2026, oder vom Regal nichts mehr da), lässt sich nicht sagen, um
    wie viel — zurückgebucht wird dann nicht geraten.
  */
  wirkung := a.material_id is not null
             and (a.transaction_type = 'order' or a.condition = 'neu');
  if wirkung and jsonb_array_length(plan) = 0 then
    return jsonb_build_object('moeglich', false, 'grund',
      'Zu dieser Buchung steht keine Bewegung im Protokoll — was sie im Bestand bewirkt hat, ist nicht belegt. '
      || 'Eine Korrektur des Bestands geht über die Inventur.');
  end if;

  -- Eine Gutschrift zurücknehmen geht nur, solange die Ware noch am Ort liegt.
  for z in select * from jsonb_to_recordset(plan)
             as x(material_id uuid, name text, einheit text, ort_id uuid, ort text, menge numeric)
  loop
    if z.menge < 0 then
      da := case when z.ort_id is null
                 then (select m.stock from public.materials m where m.id = z.material_id)
                 else (select b.menge from public.lagerbestaende b
                        where b.lagerort_id = z.ort_id and b.material_id = z.material_id) end;
      if coalesce(da, 0) < -z.menge then
        return jsonb_build_object('moeglich', false, 'grund',
          z.ort || ': dort liegen nur noch ' || trim_scale(coalesce(da, 0)) || ' ' || z.einheit || ' ' || z.name
          || ' — die Gutschrift über ' || trim_scale(-z.menge) || ' lässt sich nicht zurückbuchen. '
          || 'Eine Korrektur des Bestands geht über die Inventur.');
      end if;
    end if;
  end loop;

  return jsonb_build_object('moeglich', true, 'gegenbuchung', plan);
end;
$$;

revoke all on function app.loeschen_gegenbuchung(public.material_orders) from public, anon, authenticated;

/*
  ANFORDERUNG ODER RETOURE LÖSCHEN — mit Gegenbuchung.

  `p_ausfuehren = false`: nur sagen, was geschähe (für die Rückfrage).
  `p_ausfuehren = true`: löschen — nur, wenn die Gegenbuchung noch die ist,
  die die Rückfrage zeigte (`p_erwartet`, die Liste aus der Prüfung). Ohne
  `p_erwartet` nur eine Zeile ohne Gegenbuchung.

  Antwort: {ergebnis: 'moeglich' | 'geloescht', gegenbuchung: […]},
  {ergebnis: 'abgewiesen', grund: '…'} oder {ergebnis: 'veraltet'} (weg,
  fremd, oder inzwischen eine andere Gegenbuchung).
*/
create or replace function public.anforderung_loeschen(
  p_id uuid, p_ausfuehren boolean default false, p_erwartet jsonb default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders;
  pruefung jsonb;
  plan jsonb;
  z record;
  grund text;
begin
  select * into a from public.material_orders o where o.id = p_id for update;
  -- `coalesce`: ohne Supportzugang ist `app.supportbetrieb()` leer, und ein leerer Vergleich ließe durch.
  if a.id is null
     or not coalesce(a.company_id = (select app.lesebetrieb()) or a.company_id = (select app.supportbetrieb()), false) then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Löschen darf das Lager (Verwaltung) oder die Leitung' using errcode = '42501';
  end if;

  pruefung := app.loeschen_gegenbuchung(a);
  if not (pruefung ->> 'moeglich')::boolean then
    return jsonb_build_object('ergebnis', 'abgewiesen', 'grund', pruefung ->> 'grund');
  end if;
  plan := pruefung -> 'gegenbuchung';
  if not coalesce(p_ausfuehren, false) then
    return jsonb_build_object('ergebnis', 'moeglich', 'gegenbuchung', plan);
  end if;
  if plan is distinct from coalesce(p_erwartet, '[]'::jsonb) then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;

  /*
    Die Gegenbuchung als Zugang bzw. Abgang, mit Grund. Der Bezug auf die
    Zeile geht beim Löschen verloren (`material_order_id` wird leer) —
    deshalb steht im Grund, was gelöscht wurde.
  */
  grund := case when a.transaction_type = 'return' then 'Retoure gelöscht: ' else 'Anforderung gelöscht: ' end
           || coalesce(a.material_name, '') || ' ×' || trim_scale(coalesce(a.quantity, 0))
           || coalesce(', Baustelle ' || nullif(a.project_number, ''), '')
           || coalesce(', ' || nullif(a.user_name, ''), '');
  for z in select * from jsonb_to_recordset(plan)
             as x(material_id uuid, name text, einheit text, ort_id uuid, ort text, menge numeric)
  loop
    perform app.lager_kontext(case when z.menge > 0 then 'zugang' else 'abgang' end,
      grund, null, null, 'Gegenbuchung', a.id);
    if z.ort_id is null then
      perform public.bestand_anpassen(z.material_id, z.menge);
    else
      perform app.ort_anpassen(z.ort_id, z.material_id, z.menge, false);
    end if;
  end loop;
  perform app.lager_kontext_leeren();

  perform set_config('app.anforderung_loeschen', a.id::text, true);
  delete from public.material_orders o where o.id = a.id;
  perform set_config('app.anforderung_loeschen', '', true);
  return jsonb_build_object('ergebnis', 'geloescht', 'gegenbuchung', plan);
end;
$$;

revoke all on function public.anforderung_loeschen(uuid, boolean, jsonb) from public, anon;
grant execute on function public.anforderung_loeschen(uuid, boolean, jsonb) to authenticated;

/*
  DER RIEGEL: eine verbuchte Zeile löscht nur `anforderung_loeschen` — sonst
  bliebe der Bestand, wie er war. Unverbuchte Zeilen löscht die Tabelle wie
  bisher (Zeilenschutz `material_orders_loeschen`). Der Dienstschlüssel
  bleibt außen vor (Rücklauf einer Sicherung, Löschen eines Betriebs).
*/
create or replace function app.verbuchte_anforderung_loeschen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() or not old.processed
     or app.lager_wert('app.anforderung_loeschen') is not distinct from old.id::text then
    return old;
  end if;
  raise exception 'Eine verbuchte Anforderung oder Retoure löscht man in der App über „löschen“ — dabei wird der Bestand zurückgebucht'
    using errcode = '42501';
end;
$$;

revoke all on function app.verbuchte_anforderung_loeschen() from public, anon, authenticated;

drop trigger if exists material_orders_verbucht_loeschen on public.material_orders;
create trigger material_orders_verbucht_loeschen
  before delete on public.material_orders
  for each row execute function app.verbuchte_anforderung_loeschen();
