-- DEN BESTAND BEWEGT DAS LAGER — UND WAS DER MONTEUR DARF, GEHT ÜBER SEINE WEGE.
--
-- Aus dem Prüflauf vom 25.09.2026 (P1-11, P3-17). Drei Dinge hingen zusammen:
--
--   1. `materials_aendern` lässt jedes Mitglied an den Materialstamm, und
--      `app.materialfelder_geschuetzt` schützte Bezeichnung und Preise, aber
--      nicht den BESTAND und nicht „ausgelaufen". Ein Monteur konnte über die
--      Schnittstelle „100 Stk" auf „0" oder „9999" setzen.
--   2. Das ging so, weil die Lagerbewegungen des Monteurs — Abholung
--      (`anforderung_abschliessen`) und Retoure (`retoure_anlegen`) — mit
--      SEINEN Rechten liefen. Die Tür für die beiden Wege war dieselbe Tür
--      für jede beliebige Zahl.
--   3. Seine eigene Anforderung durfte der Monteur auch dann noch ändern, als
--      das Lager sie schon geprüft hatte: aus „2 Stück, aus Lager —
--      abholbereit" wurden „999 Stück", ohne dass die Lagerprüfung noch
--      einmal hinsah (`aus_lager_pruefen` sprang nur bei `beschaffung` an).
--
-- DIE WEGE, DIE DER MONTEUR BRAUCHT, BLEIBEN — sie laufen jetzt mit den
-- Rechten ihres Eigentümers und prüfen selbst, wer ruft:
--
--   Abholung  `anforderung_abschliessen` — wer die Anforderung ändern darf
--             (Lager, Buchhaltung, Leitung, oder der Besitzer selbst; „ABGEHOLT
--             GEHT IMMER", siehe `OrderView.tsx`).
--   Retoure   `retoure_anlegen` — auf den eigenen Namen, wie bisher die
--             Richtlinie `material_orders_anlegen` verlangte.
--
-- `bestand_anpassen` bleibt mit den Rechten des Aufrufers: direkt gerufen
-- (Wareneingang im Lager) ist es eine Bewegung von Hand, und die macht nur,
-- wer das Lager führt. Aus den beiden Wegen oben heraus läuft es mit deren
-- Rechten. Die Rüstliste bewegt keinen Bestand.

-- ---------------------------------------------------------------------------
-- 1. Bestand und „ausgelaufen": nur das Lager, von Hand
-- ---------------------------------------------------------------------------

/*
  WORAN „VON HAND" ERKANNT WIRD: `current_user`. In einer Datenbankfunktion
  mit Eigentümerrechten steht dort ihr Eigentümer, direkt aus der App
  „authenticated" — dieselbe Unterscheidung wie in
  `app.urlaub_nur_ueber_antrag` und `app.krank_nur_ueber_meldung`.

  Rumpf sonst Wort für Wort die Fassung aus `20260912100000_dienstschluessel.sql`.
*/
create or replace function app.materialfelder_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  pflegt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  spitze boolean := app.hat_rolle(array['Geschäftsführung', 'Administrator']);
begin
  -- Ein Datanorm-Import bringt Einkaufspreise mit; er laeuft serverseitig.
  if app.ist_dienst() then return new; end if;

  if tg_op = 'INSERT' then
    if new.einkaufspreis is not null and not spitze then
      raise exception 'Den Einkaufspreis setzt nur die Geschäftsführung'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.einkaufspreis is distinct from old.einkaufspreis and not spitze then
    raise exception 'Den Einkaufspreis ändert nur die Geschäftsführung'
      using errcode = '42501';
  end if;

  if (new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.article_number is distinct from old.article_number
      or new.unit is distinct from old.unit
      or new.verkaufspreis is distinct from old.verkaufspreis)
     and not pflegt then
    raise exception 'Den Katalog pflegt die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;

  if (new.stock is distinct from old.stock
      or new.ausgelaufen is distinct from old.ausgelaufen)
     and not pflegt
     and current_user = 'authenticated' then
    raise exception 'Den Bestand bewegt das Lager — Abholung und Retoure buchen ihn selbst'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Abholung — mit den Rechten des Eigentümers, geprüft wie die Richtlinie
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20260924110000_einkaufsliste.sql`, davor die Frage, die
  bisher der Zeilenschutz beantwortete: wer darf diese Anforderung ändern?
  Dieselbe Aufzählung wie `material_orders_aendern`. Wer nicht darf, bekommt
  wie bisher keine Meldung — von aussen sieht eine fremde Anforderung aus
  wie eine, die es nicht gibt.

  Der Betrieb: ein Mitglied, oder ein Supportzugang mit „mitarbeiten“ für
  genau diesen Betrieb. Geschrieben wird ohnehin nur, was der Riegel
  `support_schreibt_nicht` an der Zeile durchlässt.
*/
create or replace function public.anforderung_abschliessen(p_order uuid)
  returns void
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
    return;
  end if;

  if not (app.betriebsmitglied(a.company_id) or app.support_schreibt(a.company_id))
     or not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
             or a.user_id = auth.uid()) then
    return;
  end if;

  if a.processed then
    update public.material_orders set status = 'Erledigt' where id = p_order;
    return;
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
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      end if;
      perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
    end if;
  end if;

  update public.material_orders
     set status = 'Erledigt',
         processed = true,
         material_id = coalesce(a.material_id, katalog),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end
   where id = p_order;
end;
$$;

revoke all on function public.anforderung_abschliessen(uuid) from public, anon;
grant execute on function public.anforderung_abschliessen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Retoure — ebenso
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20260912140000_lager.sql`. Neu ist die Prüfung davor: sie ist
  die Richtlinie `material_orders_anlegen`, die mit Eigentümerrechten sonst
  nicht mehr fragte — eine Retoure nur im eigenen Betrieb und nur auf den
  eigenen Namen.
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
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or (p_beleg ->> 'user_id') is null
     or (p_beleg ->> 'user_id')::uuid is distinct from auth.uid() then
    raise exception 'Eine Retoure legt man im eigenen Betrieb und auf den eigenen Namen an'
      using errcode = '42501';
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

  insert into public.material_orders (
    id, company_id, material_id, material_name, quantity, note,
    project_number, status, is_urgent, transaction_type, condition,
    user_id, user_name, processed, source
  ) values (
    neu, betrieb, katalog, p_beleg ->> 'material_name',
    (p_beleg ->> 'quantity')::numeric, p_beleg ->> 'note',
    p_beleg ->> 'project_number', 'Erledigt',
    coalesce((p_beleg ->> 'is_urgent')::boolean, false), 'return',
    p_beleg ->> 'condition', (p_beleg ->> 'user_id')::uuid,
    p_beleg ->> 'user_name', true, p_beleg ->> 'source'
  );

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' then
    perform public.bestand_anpassen(katalog, (p_beleg ->> 'quantity')::numeric);
  end if;

  return neu;
end;
$$;

revoke all on function public.retoure_anlegen(jsonb) from public, anon;
grant execute on function public.retoure_anlegen(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die eigene Anforderung — ändern nur, solange sie offen ist
-- ---------------------------------------------------------------------------

/*
  WER HIER ANKOMMT, ist nach `material_orders_aendern` entweder das Lager,
  die Buchhaltung, die Leitung — oder der Besitzer. Für die ersten drei
  ändert sich nichts. Der Besitzer darf seine Anforderung ändern, solange
  das Lager sie noch nicht angefasst hat (Status „Offen“, nicht geprüft,
  nicht abgeschlossen), und auch dann nur, WAS er angefordert hat — nicht den
  Stand: Status, Beschaffung, Abschluss, Lieferung. Den setzt das Lager, und
  die Abholung geht über `anforderung_abschliessen`.

  Datenbankfunktionen mit Eigentümerrechten kommen durch (`current_user`),
  ebenso der Dienstschlüssel.
*/
create or replace function app.anforderung_besitzer_offen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or current_user <> 'authenticated' then
    return new;
  end if;
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung() then
    return new;
  end if;

  if old.status <> 'Offen' or old.processed or old.beschaffung is not null then
    raise exception 'Das Lager hat die Anforderung schon in Arbeit — ändern kann sie jetzt nur das Lager'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     or new.processed is distinct from old.processed
     or new.beschaffung is distinct from old.beschaffung
     or new.supplier_id is distinct from old.supplier_id
     or new.bestellt_am is distinct from old.bestellt_am
     or new.geliefert_am is distinct from old.geliefert_am
     or new.transaction_type is distinct from old.transaction_type
     or new.condition is distinct from old.condition
     or new.user_id is distinct from old.user_id then
    raise exception 'Den Stand einer Anforderung setzt das Lager — abgeholt wird über „Abgeholt“'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Das „a_“ im Namen ist Absicht: Trigger laufen in der Reihenfolge ihrer
-- Namen, und dieser soll vor der Lagerprüfung sprechen — sonst bekäme der
-- Monteur statt „das Lager hat sie in Arbeit“ eine Rechnung über den Bestand.
drop trigger if exists material_orders_a_besitzer_offen on public.material_orders;
create trigger material_orders_a_besitzer_offen
  before update on public.material_orders
  for each row execute function app.anforderung_besitzer_offen();

-- ---------------------------------------------------------------------------
-- 5. Die Lagerprüfung sieht auch eine geänderte Menge
-- ---------------------------------------------------------------------------

/*
  Bisher sprang sie nur beim Abhaken an („aus Lager“). Wer danach die Menge
  hochsetzte oder den Artikel tauschte, kam an ihr vorbei. Jetzt prüft sie
  auch dann — aber nur, wenn es MEHR wird oder ein anderer Artikel: weniger
  vom selben geht immer.

  Beim Abschluss selbst (`processed` wird gesetzt, und die Kennung des
  Katalogartikels nachgetragen) prüft sie nicht: dort verlässt die Ware das
  Regal, und die Zusage war schon geprüft.

  Rumpf sonst wie in `20260925110000_aus_lager_nur_was_da_ist.sql`.
*/
create or replace function app.aus_lager_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  katalog uuid;
  bestand numeric;
  einheit text;
  zugesagt numeric;
  frei numeric;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.beschaffung is distinct from 'lager'
     or new.transaction_type <> 'order'
     or new.processed then
    return new;
  end if;
  if old.beschaffung is not distinct from 'lager'
     and new.material_id is not distinct from old.material_id
     and new.material_name is not distinct from old.material_name
     and coalesce(new.quantity, 0) <= coalesce(old.quantity, 0) then
    return new;
  end if;

  katalog := coalesce(new.material_id, app.katalogeintrag(new.company_id, new.material_name));
  if katalog is null then
    return new;
  end if;

  select m.stock, coalesce(nullif(m.unit, ''), 'Stk')
    into bestand, einheit
    from public.materials m
   where m.id = katalog and m.company_id = new.company_id
   for update;
  if not found then
    return new;
  end if;

  zugesagt := app.lager_zugesagt(katalog, new.id);
  frei := coalesce(bestand, 0) - zugesagt;
  if frei < coalesce(new.quantity, 0) then
    raise exception 'Im Lager sind nur % % frei (% im Regal, % schon zugesagt) — angefordert sind %. „Nicht auf Lager" setzt die Anforderung auf die Einkaufsliste.',
      trim_scale(greatest(frei, 0)), einheit,
      trim_scale(coalesce(bestand, 0)), trim_scale(zugesagt),
      trim_scale(coalesce(new.quantity, 0))
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists material_orders_aus_lager on public.material_orders;
create trigger material_orders_aus_lager
  before update of beschaffung, quantity, material_id, material_name on public.material_orders
  for each row execute function app.aus_lager_pruefen();
