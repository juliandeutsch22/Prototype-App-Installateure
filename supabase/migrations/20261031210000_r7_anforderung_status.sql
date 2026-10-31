/*
  ANFORDERUNGEN: „ABHOLBEREIT“ VON HAND NUR MIT FREIEM BESTAND, UND KEIN
  STATUSWECHSEL AUF EINEM VERALTETEN STAND (Testbericht Runde 7, R7-M2 und
  R7-M3; Altbefunde F14/F23, Testanleitung T079–T081, P0-28/P0-29)

  WAS DER BERICHT FAND.
  - R7-M2: 10 im Regal, 10 zugesagt, eine Anforderung über 2. „Aus Lager“
    wies richtig ab. „Status von Hand setzen › Auf „Abholbereit“ setzen“ ging
    ohne Rückfrage durch — danach 12 reserviert bei 10 im Regal, und der
    Monteur sah „abholbereit“ für Ware, die nicht da war.
  - R7-M3: Zwei Tabs, derselbe Posten. Der zweite meldete „Als bestellt
    markiert“, obwohl er nichts mehr geändert hatte.

  WARUM. Die Lagerprüfung (`app.aus_lager_pruefen`) sprang nur an, wenn die
  Beschaffung auf „lager“ wechselte. Eine Anforderung ohne Beschaffung, die
  von Hand „Abholbereit“ wird, zählt aber genauso als zugesagt
  (`app.lager_zugesagt`) — sie wurde nur nie geprüft. Und die Statuswechsel
  schrieben ohne Blick auf den Stand, den die Ansicht gesehen hatte; ob sich
  etwas änderte, erfuhr niemand.

  WAS JETZT GILT.
  1. Die Prüfung steht an EINER Stelle (`app.regal_fehlt`) und gilt für
     beide Wege, auf denen Ware aus dem Regal zugesagt wird: „Aus Lager“ wie
     bisher, und „Abholbereit“ von Hand ohne Beschaffung. Frei ≥ Menge, im
     selben Zug, mit derselben Sperre auf dem Artikel.
  2. Bewusst übersteuern geht nur über `anforderung_status_setzen` mit
     `p_trotz_fehlbestand` — die Oberfläche fragt vorher mit den Zahlen nach.
     Die Übersteuerung steht danach im Protokoll der Anforderung
     (`lager_uebersteuert`): wann, wer, im Regal, zugesagt, frei, angefordert.
     Wer an der Schnittstelle vorbei schreibt, wird wie bisher abgewiesen.
  3. `anforderung_status_setzen` setzt den Status nur, wenn die Anforderung
     noch auf dem erwarteten Stand steht, und sagt, ob sich etwas geändert
     hat. `anforderung_abschliessen` sagt es auch (Anzahl statt nichts).

  WAS GLEICH BLEIBT.
  - Anforderungen ohne Katalogeintrag (freie Positionen) haben keinen
    Bestand, gegen den sich prüfen ließe: sie gehen weiter ohne Prüfung.
  - Was über die Einkaufsliste läuft, prüft nichts am Regal: von Hand
    abholbereit heißt dort „direkt vom Großhändler“, und beim Abholen bucht
    `anforderung_abschliessen` Eingang und Abgang zugleich.
  - Ein Statuswechsel, der die Zusage nicht ändert (zurück auf „Offen“, eine
    schon zugesagte Lageranforderung), prüft nichts.
  - Die Meldung der Abweisung lautet wortgleich wie bei „Aus Lager“.
  - Der Dienstschlüssel (Rücklauf einer Sicherung) bleibt außen vor.

  DATENSCHUTZ. Das Protokoll nennt, wer übersteuert hat (Kennung und Name),
  so wie `erfasst_von` an der Anforderung: es gehört zur Anforderung und
  bleibt mit ihr, solange sie aufbewahrt wird. In der Datenauskunft der
  Person steht die Anzahl unter „als Bearbeiter“.
*/

-- ---------------------------------------------------------------------------
-- 1. Das Protokoll der Übersteuerung
-- ---------------------------------------------------------------------------

alter table public.material_orders
  add column if not exists lager_uebersteuert jsonb not null default '[]'::jsonb;

comment on column public.material_orders.lager_uebersteuert is
  'Abholbereit trotz Fehlbestand (Runde 7, R7-M2): je Übersteuerung am, von, name, bestand, zugesagt, frei, angefordert, einheit. Schreibt nur die Datenbank.';

-- ---------------------------------------------------------------------------
-- 2. Die Prüfung — eine Stelle für beide Wege
-- ---------------------------------------------------------------------------

/*
  Fehlt im Regal, was diese Änderung zusagen würde? `null`: nichts zu prüfen
  oder genug frei. Sonst die Zahlen und der Weg („lager“ oder „hand“).

  Der Weg „lager“ rechnet Wort für Wort wie bisher (Rumpf aus
  20260926111000_bestand_nur_ueber_das_lager.sql). Neu ist der Weg „hand“:
  ohne Beschaffung auf „Abholbereit“ — geprüft, sobald die Zeile dadurch zur
  Zusage wird oder als Zusage mehr oder einen anderen Artikel verlangt.

  Der Artikel wird gesperrt, bevor gerechnet wird: zwei gleichzeitige
  Zusagen rechnen nacheinander, nicht beide gegen denselben Stand.
*/
create or replace function app.regal_fehlt(p_alt public.material_orders, p_neu public.material_orders)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  lager boolean;
  vorher boolean;
  katalog uuid;
  bestand numeric;
  einheit text;
  zugesagt numeric;
  frei numeric;
begin
  if p_neu.transaction_type <> 'order' or p_neu.processed then
    return null;
  end if;
  lager := p_neu.beschaffung is not distinct from 'lager';
  if not lager and not (p_neu.beschaffung is null and p_neu.status = 'Abholbereit') then
    return null;
  end if;

  -- War die Zeile vorher schon eine Zusage aus dem Regal? Dann prüft nur, was mehr wird.
  vorher := p_alt.beschaffung is not distinct from 'lager'
            or (not lager and p_alt.beschaffung is null and p_alt.status = 'Abholbereit' and not p_alt.processed);
  if vorher
     and p_neu.material_id is not distinct from p_alt.material_id
     and p_neu.material_name is not distinct from p_alt.material_name
     and coalesce(p_neu.quantity, 0) <= coalesce(p_alt.quantity, 0) then
    return null;
  end if;

  katalog := coalesce(p_neu.material_id, app.katalogeintrag(p_neu.company_id, p_neu.material_name));
  if katalog is null then
    return null;
  end if;

  select m.stock, coalesce(nullif(m.unit, ''), 'Stk')
    into bestand, einheit
    from public.materials m
   where m.id = katalog and m.company_id = p_neu.company_id
   for update;
  if not found then
    return null;
  end if;

  zugesagt := app.lager_zugesagt(katalog, p_neu.id);
  frei := coalesce(bestand, 0) - zugesagt;
  if frei >= coalesce(p_neu.quantity, 0) then
    return null;
  end if;
  return jsonb_build_object(
    'weg', case when lager then 'lager' else 'hand' end,
    'bestand', coalesce(bestand, 0),
    'zugesagt', zugesagt,
    'frei', frei,
    'angefordert', coalesce(p_neu.quantity, 0),
    'einheit', einheit);
end;
$$;

revoke all on function app.regal_fehlt(public.material_orders, public.material_orders) from public, anon, authenticated;

/*
  DER RIEGEL AN DER TABELLE — jetzt auch für den Status. Übersteuern lässt
  er nur die Zeile, die `anforderung_status_setzen` im selben Zug dafür
  freigegeben hat (`app.abholbereit_trotzdem`); dann schreibt er den
  Protokolleintrag selbst, mit den Zahlen dieses Augenblicks.
*/
create or replace function app.aus_lager_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  fehlt jsonb;
begin
  if app.ist_dienst() then
    return new;
  end if;
  fehlt := app.regal_fehlt(old, new);
  if fehlt is null then
    return new;
  end if;

  if fehlt ->> 'weg' = 'hand'
     and app.lager_wert('app.abholbereit_trotzdem') is not distinct from new.id::text then
    new.lager_uebersteuert := coalesce(new.lager_uebersteuert, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'am', now(),
        'von', (select auth.uid()),
        'name', (select u.name from public.users u where u.id = (select auth.uid())))
      || (fehlt - 'weg'));
    return new;
  end if;

  raise exception 'Im Lager sind nur % % frei (% im Regal, % schon zugesagt) — angefordert sind %. „Nicht auf Lager" setzt die Anforderung auf die Einkaufsliste.',
    trim_scale(greatest((fehlt ->> 'frei')::numeric, 0)), fehlt ->> 'einheit',
    trim_scale((fehlt ->> 'bestand')::numeric), trim_scale((fehlt ->> 'zugesagt')::numeric),
    trim_scale((fehlt ->> 'angefordert')::numeric)
    using errcode = '23514';
end;
$$;

drop trigger if exists material_orders_aus_lager on public.material_orders;
create trigger material_orders_aus_lager
  before update of beschaffung, quantity, material_id, material_name, status on public.material_orders
  for each row execute function app.aus_lager_pruefen();

/*
  DAS PROTOKOLL SCHREIBT NUR DIE DATENBANK. Ein Eintrag, den jeder setzen
  oder leeren kann, belegt nichts. Der Name sorgt für die Reihenfolge: dieser
  Auslöser läuft nach `material_orders_aus_lager`, der den Eintrag anhängt.
*/
create or replace function app.uebersteuerung_fest() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.lager_uebersteuert := '[]'::jsonb;
    return new;
  end if;
  if new.lager_uebersteuert is distinct from old.lager_uebersteuert
     and app.lager_wert('app.abholbereit_trotzdem') is distinct from new.id::text then
    raise exception 'Das Protokoll einer Anforderung schreibt nur die Datenbank'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.uebersteuerung_fest() from public, anon, authenticated;

drop trigger if exists material_orders_uebersteuert_fest on public.material_orders;
create trigger material_orders_uebersteuert_fest
  before insert or update on public.material_orders
  for each row execute function app.uebersteuerung_fest();

-- ---------------------------------------------------------------------------
-- 3. Status von Hand: nur auf dem erwarteten Stand, mit Antwort
-- ---------------------------------------------------------------------------

/*
  Für „Status von Hand setzen“ (Offen, In Bearbeitung, Abholbereit).
  „Erledigt“ geht über `anforderung_abschliessen` — dort verlässt die Ware
  das Regal.

  ANTWORT: {ergebnis: 'geaendert'} — oder 'veraltet' (jemand anderes war
  schneller, oder die Anforderung ist weg; `status` nennt den jetzigen
  Stand), oder 'fehlbestand' mit bestand, zugesagt, frei, angefordert und
  einheit, damit die Oberfläche mit genau diesen Zahlen nachfragen kann.

  WER: wie bisher an der Tabelle — das Lager (Verwaltung), die Buchhaltung
  und die Führung des Betriebs. Der Besteller setzt den Stand nicht
  (`app.anforderung_besitzer_offen`). Eine fremde oder verschwundene
  Anforderung sieht aus wie eine veraltete: nichts geändert.

  `p_von` leer heißt „ohne erwarteten Stand“ — die Oberfläche gibt ihn
  immer mit.
*/
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
  fehlt := app.regal_fehlt(a, neu);
  if fehlt is not null then
    if not coalesce(p_trotz_fehlbestand, false) then
      return jsonb_build_object('ergebnis', 'fehlbestand') || (fehlt - 'weg');
    end if;
    -- Nur für diese Zeile und nur in diesem Zug: der Riegel lässt sie durch und schreibt das Protokoll.
    perform set_config('app.abholbereit_trotzdem', a.id::text, true);
  end if;

  update public.material_orders set status = p_nach where id = a.id;
  perform set_config('app.abholbereit_trotzdem', '', true);
  return jsonb_build_object('ergebnis', 'geaendert');
end;
$$;

revoke all on function public.anforderung_status_setzen(uuid, text, text, boolean) from public, anon;
grant execute on function public.anforderung_status_setzen(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Abholen: mit erwartetem Stand, und sagen, ob sich etwas geändert hat
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20260930380000_lagerbewegungen.sql. Neu: `p_status` (der
  Stand, den die Ansicht gesehen hat; leer wie bisher ohne Erwartung) und
  die Antwort — 1, wenn die Anforderung jetzt erledigt ist und es vorher
  nicht war, sonst 0. Wer nicht darf, bekommt wie bisher keinen Fehler,
  sondern nichts: eine fremde Anforderung sieht aus wie keine.

  Die Antwort ändert ihre Art (void → integer); das geht nur über ein neues
  Anlegen der Funktion.
*/
drop function if exists public.anforderung_abschliessen(uuid);

create or replace function public.anforderung_abschliessen(p_order uuid, p_status text default null)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  katalog uuid;
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
      if a.beschaffung = 'einkauf' and a.geliefert_am is null then
        perform app.lager_kontext('eingang', null, null, null, 'Anforderung, beim Abholen geliefert', a.id);
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      end if;
      perform app.lager_kontext('entnahme', null, null, null,
        coalesce('Baustelle ' || nullif(a.project_number, ''), 'Anforderung') || ' · ' || coalesce(a.user_name, ''), a.id);
      perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
      perform app.lager_kontext_leeren();
    end if;
  end if;

  update public.material_orders
     set status = 'Erledigt',
         processed = true,
         material_id = coalesce(a.material_id, katalog),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end
   where id = p_order;
  return 1;
end;
$$;

revoke all on function public.anforderung_abschliessen(uuid, text) from public, anon;
grant execute on function public.anforderung_abschliessen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Datenauskunft: wer übersteuert hat, sieht die Anzahl
-- ---------------------------------------------------------------------------

/*
  Unter „als Bearbeiter“, neben „für andere erfasst“ — der Inhalt gehört
  der Person, auf die die Anforderung lautet. Gezielt eingefügt wie in
  20261024500000_retoure_wer.sql; wiederholbar, und ohne Einfügestelle
  bricht die Migration ab.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('abholbereit_trotz_fehlbestand' in quelle) = 0 then
    marke := $m$o.erfasst_von = p_id and o.user_id is distinct from p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle fehlt'; end if;
    execute replace(quelle, marke, marke || $eintrag$
      'abholbereit_trotz_fehlbestand', (select count(*) from public.material_orders o
        where o.company_id = betrieb
          and exists (select 1 from jsonb_array_elements(o.lager_uebersteuert) e where e ->> 'von' = p_id::text)),$eintrag$);
  end if;
end;
$migration$;
