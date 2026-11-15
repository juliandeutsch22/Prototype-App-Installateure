/*
  M5 / F5 (Durchsicht 15.11.2026): TEILMENGEN BEI AUSGABE UND ABHOLUNG;
  DER BESTELLER ZIEHT ZURÜCK ODER ÄNDERT, SOLANGE „OFFEN“.

  WAS FALSCH WAR.
  - „Aus Lager“ war alles oder nichts: bei 6 frei und 10 angefordert wies
    die Datenbank ab („Nicht auf Lager setzt die Anforderung auf die
    Einkaufsliste“) — alle 10 gingen zum Großhändler, oder das Lager meldete
    „trotz Fehlbestand“ abholbereit.
  - „Abgeholt“ kannte nur die ganze Menge. Wer 6 von 10 mitnahm, buchte 10
    ab (oder gar nichts); die Differenz ging nur über eine eigene Retoure.
  - Der Besteller konnte weder zurückziehen noch die Menge ändern. Die
    Datenbank ließe die Mengenänderung zu, solange „Offen“
    (`app.anforderung_besitzer_offen`), die Ansicht bot sie nicht an;
    löschen durften nur Verwaltung und Führung. Ein Tippfehler (30 statt 3)
    war nicht zu korrigieren — „Abgeholt“ buchte 30.

  WIE ES JETZT IST.
  - Eine Teilmenge wird zu einer eigenen Zeile abgespalten
    (`app.anforderung_abspalten`): die neue Zeile trägt den Teil, die
    ursprüngliche den Rest — mit allem, was sie ausmacht (Besteller, Erfasser,
    Baustelle, Beschaffung, Rüstlistenbezug, Ort, Kommission). So bleibt jede
    Zeile eine Buchung mit einer Menge, und alles, was Zeilen zählt —
    Lagerzusagen, Rüstlisten-Fehlmenge (`app.ruest_angefordert` summiert),
    Rechnungsvorschlag, Löschen mit Gegenbuchung, Verknüpfung mit der Rechnung
    (M2) —, rechnet unverändert. Die Kennung des Geräts (Ausgangsfach) bleibt
    an der ursprünglichen Zeile; eine Wiederholung legt nichts doppelt an.
  - `anforderung_aus_lager`: ein Teil aus dem Lager (abholbereit, mit der
    Prüfung des Freien wie bisher), der Rest bleibt offen oder geht auf die
    Einkaufsliste.
  - `anforderung_abschliessen` mit `p_menge`: abgeholt wird der Teil, der
    Rest bleibt im selben Stand liegen.
  - `anforderung_zurueckziehen`: der Besteller (und das Lager) nimmt eine
    Anforderung zurück, solange das Lager nichts entschieden hat. Danach
    ändert sie nur das Lager.

  DIE MELDUNGEN. Die abgespaltene Zeile entsteht still (keine Meldung „neue
  Anforderung“ ans Lager); wird ihr Teil danach abholbereit, bekommt der
  Besteller seine Meldung wie bei jedem „Aus Lager“.

  RECHTE: wie bei den Wegen, die geteilt werden — „Aus Lager“ Verwaltung,
  Buchhaltung, Führung (wie die Tabellenregel); „Abgeholt“ zusätzlich der
  Besteller; Zurückziehen der Besteller, Verwaltung und Führung.
  ALTE APP: `anforderung_abschliessen` behält seine vier Parameter und
  ihre Namen; der fünfte hat eine Vorgabe.
  DATENSCHUTZ: keine neue Tabelle, keine neuen Personendaten.
*/

-- ---------------------------------------------------------------------------
-- 1. Die abgespaltene Zeile behält ihren Erfasser und entsteht still
-- ---------------------------------------------------------------------------

/* Rumpf wie bisher; neu ist der Durchlass für die abgespaltene Zeile. */
create or replace function app.anforderung_erfasst_von() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- NEU (M5): eine abgespaltene Teilmenge hat erfasst, wer die ursprüngliche erfasst hat.
    if app.lager_wert('app.anforderung_teil') is not distinct from new.id::text then
      return new;
    end if;
    new.erfasst_von := (select auth.uid());
    new.erfasst_von_name := (select u.name from public.users u where u.id = (select auth.uid()));
    return new;
  end if;
  if new.erfasst_von is distinct from old.erfasst_von
     or new.erfasst_von_name is distinct from old.erfasst_von_name then
    raise exception 'Wer eine Anforderung erfasst hat, steht fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.anforderung_erfasst_von() from public, anon, authenticated;

/* Rumpf wie in 20260914200000_push_ausloeser.sql; neu: keine Meldung „neu“ für eine Teilmenge. */
create or replace function app.push_bei_anforderung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if app.lager_wert('app.anforderung_teil') is not distinct from new.id::text then
      return null;
    end if;
    perform app.push_anstossen(jsonb_build_object(
      'art', 'neu',
      'nachher', to_jsonb(new)));
    return null;
  end if;
  if new.status is distinct from old.status then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'geaendert',
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  if new.is_urgent and not old.is_urgent then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'eil',
      'von', auth.uid(),
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  return null;
end;
$$;

revoke all on function app.push_bei_anforderung() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abspalten
-- ---------------------------------------------------------------------------

/*
  Spaltet `p_menge` von der Anforderung ab: die neue Zeile trägt sie, die
  ursprüngliche behält den Rest. Nur eine unverbuchte Anforderung, und nur
  ein echter Teil (über null, unter der ganzen Menge). Die Mengenprüfung je
  Einheit (`app.anforderung_menge_pruefen`) gilt für beide Zeilen.
  Rechte prüft der Aufrufer — nur Funktionen der Datenbank rufen dies auf.
*/
create or replace function app.anforderung_abspalten(p_id uuid, p_menge numeric)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  neu uuid := gen_random_uuid();
begin
  select * into a from public.material_orders where id = p_id for update;
  if a.id is null then
    raise exception 'Diese Anforderung gibt es nicht mehr' using errcode = 'P0002';
  end if;
  if a.transaction_type <> 'order' or a.processed then
    raise exception 'Eine verbuchte Anforderung oder eine Retoure lässt sich nicht teilen' using errcode = '23514';
  end if;
  if p_menge is null or p_menge <= 0 or p_menge >= a.quantity then
    raise exception 'Die Teilmenge liegt zwischen null und der angeforderten Menge (%).', trim_scale(a.quantity)
      using errcode = '22023';
  end if;

  perform set_config('app.anforderung_teil', neu::text, true);
  perform set_config('app.ort_setzen', 'ja', true);
  insert into public.material_orders (
    id, company_id, material_id, material_name, quantity, note, project_number, project_id,
    status, is_urgent, transaction_type, condition, user_id, user_name, processed, source,
    beschaffung, supplier_id, bestellt_am, geliefert_am, liefertermin,
    erfasst_von, erfasst_von_name, ruestliste_id, ruest_position, lagerort_id, kommission, created_at
  ) values (
    neu, a.company_id, a.material_id, a.material_name, p_menge, a.note, a.project_number, a.project_id,
    a.status, a.is_urgent, a.transaction_type, a.condition, a.user_id, a.user_name, false, a.source,
    a.beschaffung, a.supplier_id, a.bestellt_am, a.geliefert_am, a.liefertermin,
    a.erfasst_von, a.erfasst_von_name, a.ruestliste_id, a.ruest_position, a.lagerort_id, a.kommission, a.created_at
  );
  update public.material_orders set quantity = a.quantity - p_menge where id = p_id;
  perform set_config('app.ort_setzen', '', true);
  perform set_config('app.anforderung_teil', '', true);
  return neu;
end;
$$;

revoke all on function app.anforderung_abspalten(uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Teilweise aus dem Lager
-- ---------------------------------------------------------------------------

/*
  `p_menge` aus dem Lager (abholbereit), der Rest bleibt offen
  (`p_rest = 'offen'`) oder geht auf die Einkaufsliste (`'einkauf'`, bei
  `p_supplier` oder ohne Großhändler). Ohne `p_menge` oder mit der ganzen
  Menge wie „Aus Lager“. Nur auf dem erwarteten Stand `p_status` und solange
  noch nicht entschieden ist, woher das Material kommt.
  Antwort: {ergebnis: 'geaendert', teil: <Kennung der abholbereiten Zeile>}
  oder {ergebnis: 'veraltet'}. Reicht das Freie nicht, meldet die Prüfung am
  Lager (`app.aus_lager_pruefen`) wie bisher mit Zahlen.
*/
create or replace function public.anforderung_aus_lager(
  p_id uuid, p_status text, p_menge numeric default null,
  p_rest text default 'offen', p_supplier uuid default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  teil uuid;
begin
  select * into a from public.material_orders where id = p_id for update;
  if a.id is null
     or not coalesce(a.company_id = (select app.lesebetrieb()), false)
     or a.transaction_type <> 'order' or a.processed
     or a.beschaffung is not null
     or a.status is distinct from p_status then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;
  if not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()) then
    raise exception 'Aus dem Lager gibt das Lager aus' using errcode = '42501';
  end if;
  if coalesce(p_rest, 'offen') not in ('offen', 'einkauf') then
    raise exception 'Der Rest bleibt offen oder geht auf die Einkaufsliste' using errcode = '22023';
  end if;
  if p_supplier is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier and s.company_id = a.company_id
  ) then
    raise exception 'Diesen Großhändler gibt es in diesem Betrieb nicht' using errcode = '23503';
  end if;

  if p_menge is null or p_menge >= a.quantity then
    teil := a.id;
  else
    teil := app.anforderung_abspalten(a.id, p_menge);
    if p_rest = 'einkauf' then
      update public.material_orders
         set beschaffung = 'einkauf', supplier_id = p_supplier, status = 'In Bearbeitung'
       where id = a.id;
    end if;
  end if;
  -- Wie „Aus Lager“: die Prüfung des Freien und die Meldung an den Besteller hängen an diesem Schritt.
  update public.material_orders
     set beschaffung = 'lager', status = 'Abholbereit'
   where id = teil;
  return jsonb_build_object('ergebnis', 'geaendert', 'teil', teil);
end;
$$;

revoke all on function public.anforderung_aus_lager(uuid, text, numeric, text, uuid) from public, anon;
grant execute on function public.anforderung_aus_lager(uuid, text, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Teilweise abgeholt
-- ---------------------------------------------------------------------------

/*
  Der bisherige Rumpf (20261116060200_lagerfuehrung_am_artikel.sql) bleibt
  unter neuem Namen; die öffentliche Funktion bekommt `p_menge`: weniger als
  angefordert spaltet den abgeholten Teil ab und schließt nur ihn; der Rest
  bleibt im selben Stand liegen. Mehr als angefordert gibt es nicht — das ist
  eine neue Anforderung.
*/
alter function public.anforderung_abschliessen(uuid, text, uuid, text) rename to anforderung_abschliessen_ganz;
alter function public.anforderung_abschliessen_ganz(uuid, text, uuid, text) set schema app;
revoke all on function app.anforderung_abschliessen_ganz(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.anforderung_abschliessen(
  p_order uuid, p_status text default null, p_ort uuid default null, p_herkunft text default null,
  p_menge numeric default null)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  teil uuid;
begin
  if p_menge is null then
    return app.anforderung_abschliessen_ganz(p_order, p_status, p_ort, p_herkunft);
  end if;
  select * into a from public.material_orders where id = p_order for update;
  if a.id is null
     or not (app.betriebsmitglied(a.company_id) or app.support_schreibt(a.company_id))
     or not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung() or a.user_id = auth.uid())
     or (p_status is not null and a.status is distinct from p_status)
     or a.processed then
    return 0;
  end if;
  if p_menge <= 0 then
    raise exception 'Die abgeholte Menge muss größer als null sein.' using errcode = '22023';
  end if;
  if p_menge > a.quantity then
    raise exception 'Abgeholt werden höchstens die angeforderten % — mehr ist eine neue Anforderung.', trim_scale(a.quantity)
      using errcode = '22023';
  end if;
  if p_menge = a.quantity then
    return app.anforderung_abschliessen_ganz(p_order, p_status, p_ort, p_herkunft);
  end if;
  teil := app.anforderung_abspalten(p_order, p_menge);
  return app.anforderung_abschliessen_ganz(teil, a.status, p_ort, p_herkunft);
end;
$$;

revoke all on function public.anforderung_abschliessen(uuid, text, uuid, text, numeric) from public, anon;
grant execute on function public.anforderung_abschliessen(uuid, text, uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Zurückziehen, solange „Offen“
-- ---------------------------------------------------------------------------

/*
  Der Besteller nimmt seine Anforderung zurück — wie das Lager sie löschen
  kann, aber nur, solange niemand entschieden hat, woher das Material kommt
  (dieselbe Grenze wie fürs Ändern, `app.anforderung_besitzer_offen`).
  Antwort: {ergebnis: 'zurueckgezogen'} oder {ergebnis: 'veraltet'} (weg,
  fremd, oder das Lager hat sie inzwischen in Arbeit). Die Fehlmenge einer
  schon eingeladenen Rüstliste weist die Löschsperre ab, mit Grund.
*/
create or replace function public.anforderung_zurueckziehen(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
begin
  select * into a from public.material_orders where id = p_id for update;
  if a.id is null
     or not coalesce(a.company_id = (select app.lesebetrieb()), false)
     or a.transaction_type <> 'order' then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;
  if not (a.user_id = auth.uid() or app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Zurückziehen kann, wer angefordert hat' using errcode = '42501';
  end if;
  if a.status <> 'Offen' or a.processed or a.beschaffung is not null then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;
  delete from public.material_orders where id = p_id;
  return jsonb_build_object('ergebnis', 'zurueckgezogen');
end;
$$;

revoke all on function public.anforderung_zurueckziehen(uuid) from public, anon;
grant execute on function public.anforderung_zurueckziehen(uuid) to authenticated;
