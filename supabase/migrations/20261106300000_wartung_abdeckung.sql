-- ===========================================================================
-- M01e + W04 — DIE WARTUNG ALS QUELLE EINER RECHNUNG (Quellenvertrag)
-- ===========================================================================
--
-- BEFUND. Ob eine Wartung schon verrechnet ist, erkannte die Vorschau am
-- TEXT der Rechnungszeile („Wartung <Anlage> laut Vereinbarung“,
-- `src/features/invoices/wartungPosition.ts`). Wurde die Anlage umbenannt
-- oder die Zeile vor dem Ausstellen umformuliert, schlug die Vorschau
-- dieselbe Wartung ein zweites Mal vor — und die Datenbank hielt nichts auf.
-- Zeiten, Material und Scheine hängen dagegen über `invoice_coverage` an der
-- Rechnung, und die Datenbank verhindert ihre doppelte Verrechnung.
--
-- Jetzt hängt auch die Wartung über ihre Kennung an der Rechnung (Art
-- `wartung`), und die Datenbank zählt mit.
--
-- ---------------------------------------------------------------------------
-- DAS MUSTER FÜR JEDE NEUE QUELLE EINER RECHNUNG — Vorlage für M04
-- (Aufmaß), M05 (Lieferschein), M08 (Restmaterial) und M13 (Sammelrechnung).
-- Eine neue Art braucht ALLE Schritte; fehlt einer, wird nichts gesperrt
-- oder nichts freigegeben (Bestandsmatrix, Auffälligkeit 3):
--
--   1. CHECK DER ART: `invoice_coverage_art_check` um die neue Art erweitern.
--   2. ZWEIG IN `public.rechnung_anlegen`: zählt, wie viele der übergebenen
--      Kennungen zu DIESEM Betrieb gehören — und setzt, wo die Quelle einen
--      Verrechnungsstand trägt (`is_billed`), ihn im selben Zug. Weicht die
--      Zahl ab, bricht die ganze Rechnung ab. Ohne eigenen Zweig landet die
--      Art im `else` und wird ungeprüft übernommen.
--   3. WÄCHTER `app.beleg_nur_einmal`: wie oft darf die Quelle auf gültigen
--      Rechnungen stehen? Für die meisten Arten „einmal je Kennung“; die
--      Wartung zählt Durchgänge (unten). Die Sperre (`pg_advisory_xact_lock`
--      auf Art und Kennung) gilt für jede Art.
--   4. STORNO GIBT FREI: `public.rechnung_stornieren` setzt einen
--      Verrechnungsstand zurück, wo es einen gibt; ohne ihn genügt, dass der
--      Wächter stornierte Rechnungen nicht zählt. `public.rechnung_storno_aufheben`
--      prüft nach derselben Einheit wie der Wächter, ob die Quelle inzwischen
--      woanders steht.
--   5. ABZUG: verbraucht die Art Leistung, die eine Schlussrechnung sonst
--      noch einmal enthielte? Davon hängt ab, ob eine Anzahlungs- oder
--      Teilrechnung mit ihr abgezogen wird (`app.vorrechnungen_pruefen`,
--      `public.schlussrechnungen_ohne_abzug`, in der App `vorrechnungen.ts`).
--   6. APP: Feld am Typ `Invoice` (`linked…`), ein Eintrag in
--      `ABDECKUNGSARTEN` (`src/lib/db/pg/invoices.ts`), damit es nach
--      `p_belege` geht und zurückgelesen wird, und `typenSpalten.test.ts`.
--   7. UNVERÄNDERT: Rücklauf und Datenauszug führen `invoice_coverage` schon;
--      das Änderungsjournal (M01b) protokolliert die Abdeckung nicht — sie
--      entsteht nur mit ihrer Rechnung und ändert sich nie.
--
-- BEWUSST NICHT GEBAUT: Menge oder Betrag je Zuordnung und eine Reservierung
-- im Entwurf. Beides braucht erst die erste Teilabrechnung einer Quelle
-- (Aufmaß, Lieferschein, Sammelrechnung); heute verrechnet jede Zuordnung
-- ihre Quelle ganz. Gebaut wird es mit dem ersten Nutzer, nicht auf Vorrat.
-- ---------------------------------------------------------------------------
--
-- DIE EINHEIT DER WARTUNG IST IHR DURCHGANG AUF DER BAUSTELLE.
--
-- Eine Wartung wiederholt sich. Im gewöhnlichen Ablauf legt „Baustelle
-- anlegen“ (`public.wartung_einplanen`) je Durchgang eine EIGENE Baustelle
-- an — die Nummer muss frei sein —, und „Erledigt“ hält die Ausführung mit
-- dieser Baustelle fest (`wartung_ausfuehrungen`). Dieselbe Baustelle
-- trägt aber auch mehrere Durchgänge: „Erledigt“ nimmt jede Nummer an, und
-- bleibt das Feld leer, bleibt `letzte_baustelle` stehen und die neue
-- Ausführung landet auf der Baustelle des Vorjahrs. „Einmal je Baustelle“
-- sperrte dann den zweiten Jahresdurchgang.
--
-- Deshalb zählt der Wächter: Eine Baustelle trägt so viele Durchgänge der
-- Wartung, wie dort Ausführungen festgehalten sind, und einen mehr, solange
-- die Wartung auf ihr eingeplant ist (`offene_baustelle`). So viele
-- gültige Rechnungen dieser Baustelle dürfen die Wartung tragen — keine
-- mehr. Ein nur eingeplanter Durchgang ist damit verrechenbar wie bisher;
-- wird er danach ausgeführt, wandert er von „eingeplant“ zur Ausführung, und
-- die Zahl bleibt gleich. Eine Wartung, die auf der Baustelle der Rechnung
-- weder eingeplant noch ausgeführt ist, kommt nicht auf ihre Rechnung.
--
-- Verworfen: „Wartung + Ausführung“ — ein nur eingeplanter Durchgang hat
-- noch keine Ausführung, und `wartung_tag_berichtigen` ersetzt eine
-- Ausführung durch eine neue. „Wartung + Leistungszeitraum“ — derselbe
-- Durchgang liesse sich mit einem anderen Zeitraum ein zweites Mal
-- verrechnen. „Wartung + Baustelle“ — siehe oben.

-- ---------------------------------------------------------------------------
-- 1. Die Art
-- ---------------------------------------------------------------------------

alter table public.invoice_coverage drop constraint invoice_coverage_art_check;
alter table public.invoice_coverage add constraint invoice_coverage_art_check
  check (art in ('time_entry', 'material_order', 'work_sheet', 'wartung'));

-- ---------------------------------------------------------------------------
-- 2. Die Durchgänge einer Wartung auf einer Baustelle
-- ---------------------------------------------------------------------------

/*
  EINE STELLE FÜR DIE ZAHL, die der Wächter beim Anlegen und das Aufheben
  eines Stornos gleich lesen müssen. Die Baustellennummer gilt mit und ohne
  „PR-“ und ohne Rücksicht auf Gross- und Kleinschreibung, wie in der App
  (`app.baustelle_wie_js`). Nur Wartungen des eigenen Betriebs: eine fremde
  hat hier null Durchgänge.
*/
create or replace function app.wartung_durchgaenge(p_wartung uuid, p_baustelle text)
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select (select count(*)::integer
            from public.wartung_ausfuehrungen a
           where a.company_id = w.company_id
             and a.wartung_id = w.id
             and nullif(app.baustelle_wie_js(a.baustelle), '') = app.baustelle_wie_js(p_baustelle))
       + case when nullif(app.baustelle_wie_js(w.offene_baustelle), '') = app.baustelle_wie_js(p_baustelle)
              then 1 else 0 end
    from public.wartungen w
   where w.id = p_wartung
     and w.company_id = (select app.lesebetrieb())
$$;

revoke all on function app.wartung_durchgaenge(uuid, text) from public, anon;
grant execute on function app.wartung_durchgaenge(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Der Wächter
-- ---------------------------------------------------------------------------

/*
  Die Fassung aus `20260926100000_rechnung_in_einem_zug.sql`. Für die
  bisherigen Arten unverändert: eine Kennung, höchstens eine gültige
  Rechnung. Die Wartung zählt ihre Durchgänge auf der Baustelle der
  Rechnung (oben). Die Sperre davor gilt für jede Art: rechnen zwei Leute
  im selben Augenblick dieselbe Wartung ab, wartet der zweite und zählt
  danach die Rechnung des ersten mit.
*/
create or replace function app.beleg_nur_einmal() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  schon text;
  baustelle text;
  durchgaenge integer;
  verrechnet integer;
begin
  if app.ist_dienst() then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('rechnungsbeleg:' || new.art || ':' || new.ziel_id::text, 0));

  if new.art = 'wartung' then
    select i.project_number into baustelle
      from public.invoices i
     where i.id = new.invoice_id;
    durchgaenge := coalesce(app.wartung_durchgaenge(new.ziel_id, baustelle), 0);
    if durchgaenge = 0 then
      raise exception 'Diese Wartung ist auf der Baustelle % weder eingeplant noch ausgeführt — auf deren Rechnung kommt sie nicht.', baustelle
        using errcode = '22023';
    end if;

    select count(*), (array_agg(i.invoice_number order by i.invoice_date desc, i.invoice_number desc))[1]
      into verrechnet, schon
      from public.invoice_coverage c
      join public.invoices i on i.id = c.invoice_id
     where c.company_id = new.company_id
       and c.art = 'wartung'
       and c.ziel_id = new.ziel_id
       and c.invoice_id <> new.invoice_id
       and i.payment_status <> 'Storniert'
       and app.baustelle_wie_js(i.project_number) = app.baustelle_wie_js(baustelle);

    if verrechnet >= durchgaenge then
      raise exception 'Diese Wartung steht für diesen Durchgang schon auf der Rechnung % — ein zweites Mal wird sie nicht verrechnet.', schon
        using errcode = '23505';
    end if;
    return new;
  end if;

  select i.invoice_number into schon
    from public.invoice_coverage c
    join public.invoices i on i.id = c.invoice_id
   where c.company_id = new.company_id
     and c.art = new.art
     and c.ziel_id = new.ziel_id
     and c.invoice_id <> new.invoice_id
     and i.payment_status <> 'Storniert'
   limit 1;

  if schon is not null then
    raise exception 'Dieser Beleg steht schon auf der Rechnung % — ein zweites Mal wird er nicht verrechnet.', schon
      using errcode = '23505';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Anlegen: ein Zweig für die Wartung, und der Schein gehört zum Betrieb
-- ---------------------------------------------------------------------------

/*
  Die Fassung aus `20261010400000_ruecklass_skonto_garantie.sql`; geändert
  ist nur der Zweig der Belegarten.

  DER SCHEIN EINES ANDEREN BETRIEBS (Befund M01e). Der `else`-Zweig nahm
  jede Kennung als Schein an, ohne zu fragen, wem er gehört — die Meldung
  darunter versprach es, geprüft wurde es nur für Zeiten und Material. So
  liess sich die Kennung eines fremden Scheins (oder eine erfundene) auf
  eine eigene Rechnung setzen. Jetzt zählt der Zweig die Scheine des
  eigenen Betriebs, die Wartung bekommt denselben Zweig, und das `else`
  bleibt nur für eine Art, die der Check ohnehin abweist.
*/
create or replace function public.rechnung_anlegen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  neu public.invoices;
  kennung uuid;
  zeile jsonb;
  belegart text;
  lauf integer := 0;
  kennungen uuid[];
  gesperrt integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  neu := jsonb_populate_record(null::public.invoices, p_kopf);

  if p_positionen is null or jsonb_typeof(p_positionen) <> 'array'
     or jsonb_array_length(p_positionen) = 0 then
    raise exception 'Eine Rechnung ohne Positionen ist eine Rechnung über nichts — sie wird nicht angelegt.'
      using errcode = '22023';
  end if;
  if coalesce(neu.gesamt_netto, neu.total_netto, 0) <= 0 then
    raise exception 'Eine Rechnung über null Euro wird nicht angelegt — bitte die Beträge der Positionen prüfen.'
      using errcode = '22023';
  end if;

  /*
    OHNE UMSATZSTEUER UND OHNE ÜBERGANG DER STEUERSCHULD braucht die Rechnung
    den Grund der Befreiung (§ 11 Abs 1 Z 3 lit e UStG) — sonst sieht sie
    aus wie eine, auf der die Steuer vergessen wurde.
  */
  if neu.vat_rate = 0 and not coalesce(neu.reverse_charge, false)
     and btrim(coalesce(neu.steuerbefreiung, '')) = '' then
    raise exception 'Eine Rechnung ohne Umsatzsteuer braucht den Grund der Befreiung — etwa „Kleinunternehmer, § 6 Abs 1 Z 27 UStG".'
      using errcode = '22023';
  end if;

  /*
    SKONTO NUR AUF EINER RECHNUNG, DIE ABGERECHNET WIRD — Einzel- oder
    Schlussrechnung. Auf einer Anzahlung zöge die Schlussrechnung später die
    volle Anzahlung ab, obwohl der Kunde weniger gezahlt hat. Die Frist liegt
    zwischen Rechnungsdatum und Zahlungsziel.
  */
  if neu.skonto_prozent is not null then
    if coalesce(neu.art, 'einzel') not in ('einzel', 'schluss') then
      raise exception 'Skonto gibt es nur auf einer Rechnung oder Schlussrechnung, nicht auf einer Anzahlungs- oder Teilrechnung.'
        using errcode = '22023';
    end if;
    if neu.skonto_bis is null or neu.skonto_bis < neu.invoice_date
       or (neu.due_date is not null and neu.skonto_bis > neu.due_date) then
      raise exception 'Die Skontofrist muss zwischen Rechnungsdatum und Zahlungsziel liegen.'
        using errcode = '22023';
    end if;
  end if;

  /*
    DER RÜCKLASS (Stand-Datei 11.1, Punkt 5). Ein Haftrücklass behält der
    Kunde von der Rechnung über die ganze Leistung ein, bis die Gewährleistung
    abläuft; ein Deckungsrücklass von einer Teilrechnung, bis abgerechnet
    ist. Beides mindert den Zahlbetrag, nicht das Entgelt — die Steuer steht
    voll auf der Rechnung.
  */
  if neu.ruecklass_prozent is not null or neu.ruecklass_art is not null or neu.ruecklass_bis is not null then
    if neu.ruecklass_prozent is null or neu.ruecklass_art is null or neu.ruecklass_bis is null then
      raise exception 'Ein Rücklass braucht Art, Prozentsatz und Fälligkeit.' using errcode = '22023';
    end if;
    if neu.ruecklass_art = 'haft' and coalesce(neu.art, 'einzel') not in ('einzel', 'schluss') then
      raise exception 'Einen Haftrücklass gibt es auf einer Rechnung oder Schlussrechnung.' using errcode = '22023';
    end if;
    if neu.ruecklass_art = 'deckung' and coalesce(neu.art, 'einzel') <> 'teil' then
      raise exception 'Einen Deckungsrücklass gibt es auf einer Teilrechnung.' using errcode = '22023';
    end if;
    if neu.ruecklass_prozent <= 0 or neu.ruecklass_prozent > 20 then
      raise exception 'Der Rücklass liegt zwischen 0 und 20 %%.' using errcode = '22023';
    end if;
    if neu.ruecklass_bis <= neu.invoice_date then
      raise exception 'Der Rücklass wird nach dem Rechnungsdatum fällig.' using errcode = '22023';
    end if;
    -- Skonto und Rücklass zusammen seit 10.10.2026: der Skonto gilt auf den Zahlbetrag (`app.skonto_passt`).
    /*
      DER BETRAG KOMMT VOM BELEG, die Datenbank rechnet nach. Gedruckt ist,
      was die App gerechnet hat; stimmt es mit dieser Rechnung nicht auf den
      Cent, wird nichts angelegt. So können Beleg und Datensatz nicht
      auseinanderlaufen — auch nicht an einer Rundungsgrenze.
    */
    if neu.ruecklass_betrag is null
       or abs(neu.ruecklass_betrag - least(
            round(coalesce(neu.gesamt_brutto, neu.total_brutto) * neu.ruecklass_prozent / 100, 2),
            neu.total_brutto)) > 0.01 then
      raise exception 'Der Rücklass ist falsch gerechnet — bitte die Rechnung neu zusammenstellen.'
        using errcode = '22023';
    end if;
  else
    neu.ruecklass_betrag := null;
  end if;

  perform set_config('app.rechnung_legt', 'ja', true);

  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, steuerbefreiung, customer_vat_id, address, leistungsort,
    leistung_von, leistung_bis, payment_status,
    art, vorrechnungen, gesamt_netto, gesamt_vat, gesamt_brutto,
    skonto_prozent, skonto_bis, bestellnummer,
    ruecklass_art, ruecklass_prozent, ruecklass_betrag, ruecklass_bis
  ) values (
    betrieb, neu.invoice_number, neu.project_number, neu.customer_id,
    neu.customer_name, neu.invoice_date, neu.due_date, neu.subtotal_netto,
    neu.discount_mode, neu.discount_value, neu.discount_label,
    neu.discount_amount, neu.total_netto, neu.total_vat, neu.total_brutto,
    neu.vat_rate, coalesce(neu.reverse_charge, false),
    nullif(btrim(coalesce(neu.steuerbefreiung, '')), ''), neu.customer_vat_id,
    neu.address, neu.leistungsort, neu.leistung_von, neu.leistung_bis,
    coalesce(neu.payment_status, 'Offen'),
    coalesce(neu.art, 'einzel'), neu.vorrechnungen,
    neu.gesamt_netto, neu.gesamt_vat, neu.gesamt_brutto,
    neu.skonto_prozent, neu.skonto_bis,
    nullif(btrim(coalesce(neu.bestellnummer, '')), ''),
    neu.ruecklass_art, neu.ruecklass_prozent, neu.ruecklass_betrag, neu.ruecklass_bis
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(p_positionen) loop
    insert into public.invoice_lines (
      company_id, invoice_id, position, label, qty, unit, unit_price, netto,
      art, rabatt_prozent, material_id
    ) values (
      betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
      coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
      (zeile ->> 'netto')::numeric,
      coalesce(zeile ->> 'art', 'position'), (zeile ->> 'rabatt_prozent')::numeric,
      -- Runde 3, M12: der Katalogbezug aus dem Angebot — nur ein Artikel des eigenen Betriebs.
      (select m.id from public.materials m
        where m.company_id = betrieb
          and m.id::text = nullif(zeile ->> 'material_id', ''))
    );
    lauf := lauf + 1;
  end loop;

  for belegart in select * from jsonb_object_keys(coalesce(p_belege, '{}'::jsonb)) loop
    select coalesce(array_agg(distinct z::uuid), '{}'::uuid[]) into kennungen
      from jsonb_array_elements_text(p_belege -> belegart) z;
    if cardinality(kennungen) = 0 then
      continue;
    end if;

    if belegart = 'time_entry' then
      update public.time_entries t
         set is_billed = true, invoice_number = neu.invoice_number
       where t.company_id = betrieb
         and t.id = any(kennungen)
         and t.is_billed = false;
      get diagnostics gesperrt = row_count;
    elsif belegart = 'material_order' then
      update public.material_orders m
         set is_billed = true, invoice_number = neu.invoice_number
       where m.company_id = betrieb
         and m.id = any(kennungen)
         and m.is_billed = false;
      get diagnostics gesperrt = row_count;
    elsif belegart = 'work_sheet' then
      -- Scheine tragen keinen Verrechnungsstand; über sie wacht
      -- `app.beleg_nur_einmal` an der Abdeckung. Gezählt wird hier nur, ob
      -- jeder Schein zu diesem Betrieb gehört (M01e, siehe oben).
      select count(*) into gesperrt
        from public.work_sheets s
       where s.company_id = betrieb
         and s.id = any(kennungen);
    elsif belegart = 'wartung' then
      -- Wie beim Schein: kein Verrechnungsstand an der Wartung, der Wächter
      -- zählt die Durchgänge. Hier nur: die Wartung gehört zu diesem Betrieb.
      select count(*) into gesperrt
        from public.wartungen w
       where w.company_id = betrieb
         and w.id = any(kennungen);
    else
      -- Eine unbekannte Art weist der Check der Abdeckung ab.
      gesperrt := cardinality(kennungen);
    end if;

    if gesperrt <> cardinality(kennungen) then
      raise exception 'Ein Teil der Belege ist inzwischen verrechnet oder gehört nicht zu diesem Betrieb — die Rechnung ist nicht angelegt und nichts ist gesperrt. Bitte die Positionen neu zusammenstellen.'
        using errcode = '23505';
    end if;

    insert into public.invoice_coverage (company_id, invoice_id, art, ziel_id)
    select betrieb, kennung, belegart, k from unnest(kennungen) k;
  end loop;

  perform set_config('app.rechnung_legt', '', true);
  return kennung;
end;
$$;

revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Abzug: eine Wartung macht eine Teilrechnung nicht „verbraucht“
-- ---------------------------------------------------------------------------

/*
  Die Fassung aus `20260930150000_geld_und_belege.sql`; geändert sind die
  beiden Stellen, die fragen, ob eine Rechnung Belege verbraucht hat.

  WARUM DIE WARTUNG DORT NICHT ZÄHLT. Abgezogen wird, was keine Leistung
  verbraucht hat, die die Schlussrechnung sonst noch einmal enthielte —
  Zeiten, Material, Scheine. Die Wartungspauschale steht neben der
  Baustellenleistung; eine Teilrechnung auf eine Pauschale, auf die jemand
  die Wartung übernommen hat, bleibt ein Teilbetrag und wird abgezogen. So
  war es, solange die Wartung nur als Text darauf stand. Zählte sie hier,
  nähme die Maske den Abzug weiter vor (`vorrechnungen.ts`), die Datenbank
  wiese ihn ab, und die Schlussrechnung liesse sich nicht mehr stellen.
*/
create or replace function app.vorrechnungen_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  eintrag jsonb;
  kennung uuid;
  bezogen public.invoices;
  belegt integer;
  doppelt integer;
  summe_netto numeric(12,2) := 0;
  summe_vat numeric(12,2) := 0;
  summe_brutto numeric(12,2) := 0;
  fehlend text;
begin
  /*
    NEU (Testbericht 30.09.2026, K2): EINE SCHLUSSRECHNUNG ZIEHT AB, WAS
    ABZUZIEHEN IST — und zwar ohne dass jemand daran denken muss.

    Bis hierher war der Abzug ein Häkchen, das niemand vorauswählte. Im
    Pilotbetrieb ging RE-2026-1502 ohne die Anzahlung RE-2026-1501 hinaus:
    der Kunde sollte 12.765,48 € für einen Auftrag über 9.819,60 € zahlen,
    und die Umsatzsteuer der Anzahlung stand zweimal auf Belegen desselben
    Betriebs (§ 11 Abs 12 UStG). Alles dahinter — PDF, offene Posten,
    Skonto, Mahnlauf, Nachkalkulation, BMD — rechnete richtig, aber mit dem,
    was es bekam.

    ABZUZIEHEN IST jede Anzahlungs- und Teilrechnung derselben Baustelle, die
    gültig ist, keine Belege verbraucht hat, noch auf keiner anderen
    Schlussrechnung steht und dieselbe Steuerbehandlung trägt — genau die,
    die die Maske zum Abzug anbietet. Eine mit anderer Steuerbehandlung
    lässt sich gar nicht abziehen (unten); sie gehört berichtigt, und die
    Maske sagt das.

    Nur beim Anlegen und nicht für den Dienstschlüssel: ein zurückgespielter
    Bestand ist, wie er war.
  */
  if tg_op = 'INSERT' and not app.ist_dienst() and new.art = 'schluss' then
    select string_agg(i.invoice_number, ', ' order by i.invoice_number) into fehlend
      from public.invoices i
     where i.company_id = new.company_id
       and i.project_number = new.project_number
       and i.id is distinct from new.id
       and i.art in ('anzahlung', 'teil')
       and i.payment_status is distinct from 'Storniert'
       and coalesce(i.reverse_charge, false) = coalesce(new.reverse_charge, false)
       -- Eine Wartung verbraucht keinen Beleg im Sinn des Abzugs (M01e, siehe oben).
       and not exists (select 1 from public.invoice_coverage c
                        where c.invoice_id = i.id and c.art <> 'wartung')
       and not exists (
         select 1 from public.invoices a
          where a.company_id = i.company_id
            and a.payment_status is distinct from 'Storniert'
            and a.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', i.id::text)))
       and not coalesce(new.vorrechnungen, '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object('invoiceId', i.id::text));
    if fehlend is not null then
      raise exception 'Die Schlussrechnung muss abziehen, was auf dieser Baustelle schon verrechnet ist: % (§ 11 Abs 12 UStG)', fehlend
        using errcode = '42501';
    end if;
  end if;

  if new.vorrechnungen is null or jsonb_array_length(new.vorrechnungen) = 0 then
    /*
      OHNE ABZUG KEINE GESAMTLEISTUNG. Stünde sie allein da, gäbe es zwei
      Zahlen für dieselbe Sache — und beim nächsten Rechenweg wäre offen,
      welche gilt.
    */
    if new.gesamt_netto is not null or new.gesamt_vat is not null
       or new.gesamt_brutto is not null then
      raise exception 'Eine Gesamtleistung ohne abgezogene Vorrechnung wäre dasselbe wie der Rechnungsbetrag'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.gesamt_netto is null or new.gesamt_vat is null or new.gesamt_brutto is null then
    raise exception 'Wer abzieht, muss sagen, wovon — die Gesamtleistung fehlt'
      using errcode = '42501';
  end if;

  for eintrag in select * from jsonb_array_elements(new.vorrechnungen) loop
    kennung := (eintrag ->> 'invoiceId')::uuid;

    select * into bezogen
      from public.invoices i
     where i.id = kennung
       and i.company_id = new.company_id
       and i.project_number = new.project_number;
    if not found then
      raise exception 'Abgezogen werden kann nur eine Rechnung desselben Betriebs auf derselben Baustelle'
        using errcode = '42501';
    end if;

    /*
      NEU (Prüflauf 25.09.2026, P2-08 und P2-15) — nur beim Anlegen, und
      nicht für den Dienstschlüssel: ein zurückgespielter Bestand ist, wie er
      war, und eine später stornierte Anzahlung auf einer längst stornierten
      Schlussrechnung ist dort kein Fehler, sondern Geschichte.

      EINE STORNIERTE RECHNUNG WIRD NICHT ABGEZOGEN. Sie fordert nichts
      mehr; ihr Betrag vom Rest abgezogen hiesse, dem Kunden eine Zahlung
      gutzuschreiben, die es nicht gibt.

      ANZAHLUNG UND SCHLUSSRECHNUNG TRAGEN DIESELBE STEUERBEHANDLUNG. Eine
      Anzahlung mit 20 % USt auf einer Schlussrechnung mit Übergang der
      Steuerschuld abzuziehen, zöge ihre Steuer von einem Betrag ohne Steuer
      ab — die Restforderung wäre um genau diese Steuer zu niedrig, und die
      ausgewiesene Steuer der Anzahlung bliebe unberichtigt stehen (§ 11
      Abs 12 UStG). Umgekehrt ebenso. Ein solcher Fall gehört berichtigt,
      nicht verrechnet.
    */
    if tg_op = 'INSERT' and not app.ist_dienst() then
      if bezogen.payment_status = 'Storniert' then
        raise exception 'Die Rechnung % ist storniert — abgezogen werden kann nur eine gültige Rechnung', bezogen.invoice_number
          using errcode = '42501';
      end if;
      if bezogen.reverse_charge is distinct from coalesce(new.reverse_charge, false) then
        raise exception 'Die Rechnung % ist % ausgestellt, diese %. Anzahlung und Schlussrechnung brauchen dieselbe Steuerbehandlung — sonst stimmt die abgezogene Umsatzsteuer nicht.',
          bezogen.invoice_number,
          case when bezogen.reverse_charge then 'mit Übergang der Steuerschuld' else 'mit Umsatzsteuer' end,
          case when coalesce(new.reverse_charge, false) then 'mit Übergang der Steuerschuld' else 'mit Umsatzsteuer' end
          using errcode = '42501';
      end if;
    end if;

    /*
      NUR WAS KEINE BELEGE VERBRAUCHT HAT, WIRD ABGEZOGEN — und das ist die
      Falle, an der eine Schlussrechnung sonst doppelt kürzt.

      Eine Teilrechnung über einen abgeschlossenen Bauabschnitt hat die
      Zeiteinträge und Scheine dieses Abschnitts verbraucht: sie sind als
      verrechnet markiert und tauchen in der Schlussrechnung gar nicht mehr
      auf. Ihre Summe ist also schon heraussen. Zöge man sie zusätzlich ab,
      fehlte sie zweimal — und der Betrieb stellte seine eigene Leistung dem
      Kunden gut.

      Eine Anzahlung verbraucht nichts: sie ist Geld auf Rechnung einer
      Leistung, die noch kommt. Sie MUSS abgezogen werden, sonst steht ihre
      Steuer zweimal auf Belegen desselben Betriebs.
    */
    select count(*) into belegt
      from public.invoice_coverage c
     where c.invoice_id = kennung
       and c.art <> 'wartung';
    if belegt > 0 then
      raise exception 'Diese Rechnung hat Belege verbraucht — ihre Leistung steht in der Schlussrechnung gar nicht mehr, ein Abzug zöge sie doppelt ab'
        using errcode = '42501';
    end if;

    /*
      DIE KOPIE MUSS DIE ORIGINALBETRÄGE TRAGEN. Sie steht auf dem Beleg und
      wird nie wieder nachgerechnet — ein Zahlendreher hier wäre ein
      Zahlendreher für immer.
    */
    if (eintrag ->> 'netto')::numeric is distinct from bezogen.total_netto
       or (eintrag ->> 'vat')::numeric is distinct from bezogen.total_vat
       or (eintrag ->> 'brutto')::numeric is distinct from bezogen.total_brutto then
      raise exception 'Der abgezogene Betrag stimmt nicht mit der abgezogenen Rechnung überein'
        using errcode = '42501';
    end if;

    select count(*) into doppelt
      from public.invoices i
     where i.company_id = new.company_id
       and i.id is distinct from new.id
       and i.payment_status is distinct from 'Storniert'
       and i.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', kennung::text));
    if doppelt > 0 then
      raise exception 'Diese Rechnung ist bereits auf einer anderen Schlussrechnung abgezogen'
        using errcode = '42501';
    end if;

    summe_netto := summe_netto + bezogen.total_netto;
    summe_vat := summe_vat + bezogen.total_vat;
    summe_brutto := summe_brutto + bezogen.total_brutto;
  end loop;

  if new.total_netto is distinct from new.gesamt_netto - summe_netto
     or new.total_vat is distinct from new.gesamt_vat - summe_vat
     or new.total_brutto is distinct from new.gesamt_brutto - summe_brutto then
    raise exception 'Der Rechnungsbetrag ist nicht die Gesamtleistung abzüglich der Vorrechnungen'
      using errcode = '42501';
  end if;

  /*
    EINE NEGATIVE SCHLUSSRECHNUNG IST EINE GUTSCHRIFT, und die kann diese App
    noch nicht: der Zahlungsstand, die offenen Posten und der Mahnlauf rechnen
    alle mit einer Forderung, die man begleichen kann.

    Abgewiesen statt auf null gekappt. Gekappt verschwände der Betrag, den der
    Betrieb dem Kunden zurückschuldet — lautlos und zu seinen Gunsten.
  */
  if new.total_brutto < 0 then
    raise exception 'Die Vorrechnungen übersteigen die Gesamtleistung — das wäre eine Gutschrift, und die gibt es hier noch nicht'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.schlussrechnungen_ohne_abzug()
  returns table (invoice_number text, fehlend text)
  language sql
  stable
  set search_path = ''
as $$
  select s.invoice_number,
         string_agg(i.invoice_number, ', ' order by i.invoice_number)
    from public.invoices s
    join public.invoices i
      on i.company_id = s.company_id
     and i.project_number = s.project_number
     and i.id <> s.id
     and i.art in ('anzahlung', 'teil')
     and i.payment_status is distinct from 'Storniert'
     and coalesce(i.reverse_charge, false) = coalesce(s.reverse_charge, false)
   where s.company_id = app.betrieb()
     and s.art = 'schluss'
     and s.payment_status is distinct from 'Storniert'
     and not exists (select 1 from public.invoice_coverage c
                      where c.invoice_id = i.id and c.art <> 'wartung')
     and not exists (
       select 1 from public.invoices a
        where a.company_id = i.company_id
          and a.payment_status is distinct from 'Storniert'
          and a.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', i.id::text)))
   group by s.invoice_number
   order by s.invoice_number
$$;

revoke all on function public.schlussrechnungen_ohne_abzug() from public, anon;
grant execute on function public.schlussrechnungen_ohne_abzug() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storno aufheben: die Wartung nach ihrer Einheit
-- ---------------------------------------------------------------------------

/*
  Die Fassung aus `20260926101000_rechnung_nur_ueber_funktionen.sql`.
  Die Prüfung „steht derselbe Beleg auf einer anderen gültigen Rechnung“
  gilt unverändert für die bisherigen Arten; die Wartung prüft nach ihren
  Durchgängen, sonst sperrte die Rechnung des Vorjahrs das Aufheben.
  `rechnung_stornieren` bleibt, wie es ist: die Wartung trägt keinen
  Verrechnungsstand, und der Wächter zählt stornierte Rechnungen nicht.
*/
create or replace function public.rechnung_storno_aufheben(p_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  nummer text;
  storniert_am timestamptz;
  woanders text;
  baustelle text;
  wartung uuid;
  verrechnet integer;
  zuletzt text;
begin
  select i.invoice_number, i.cancelled_at, i.project_number into nummer, storniert_am, baustelle
    from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb() and i.payment_status = 'Storniert';
  if nummer is null then
    raise exception 'Diese Rechnung gibt es nicht, oder sie ist nicht storniert' using errcode = 'P0002';
  end if;

  if storniert_am is null
     or (storniert_am at time zone 'Europe/Vienna')::date <> (now() at time zone 'Europe/Vienna')::date then
    raise exception 'Ein Storno lässt sich nur am selben Tag aufheben — danach steht er in der Buchhaltung. Für die Leistung bitte eine neue Rechnung stellen.'
      using errcode = '42501';
  end if;

  select coalesce(t.invoice_number, m.invoice_number) into woanders
    from public.invoice_coverage c
    left join public.time_entries t on c.art = 'time_entry' and t.id = c.ziel_id
    left join public.material_orders m on c.art = 'material_order' and m.id = c.ziel_id
   where c.invoice_id = p_id
     and coalesce(t.is_billed, m.is_billed, false)
     and coalesce(t.invoice_number, m.invoice_number) is distinct from nummer
   limit 1;

  if woanders is null then
    select i.invoice_number into woanders
      from public.invoice_coverage c
      join public.invoice_coverage anders
        on anders.company_id = c.company_id
       and anders.art = c.art
       and anders.ziel_id = c.ziel_id
       and anders.invoice_id <> c.invoice_id
      join public.invoices i on i.id = anders.invoice_id
     where c.invoice_id = p_id
       and c.art <> 'wartung'
       and i.payment_status <> 'Storniert'
     limit 1;
  end if;

  /*
    DIE WARTUNG ZÄHLT IHRE DURCHGÄNGE (M01e). Dieselbe Wartung steht zu Recht
    auf mehreren gültigen Rechnungen — eine je Durchgang. Der Storno bleibt
    nur, wenn die Durchgänge dieser Baustelle inzwischen alle auf anderen
    gültigen Rechnungen stehen. Gesperrt wie beim Anlegen, damit nicht im
    selben Augenblick eine neue Rechnung denselben Durchgang nimmt.
  */
  if woanders is null then
    for wartung in
      select c.ziel_id from public.invoice_coverage c
       where c.invoice_id = p_id and c.art = 'wartung'
       order by c.ziel_id
    loop
      perform pg_advisory_xact_lock(
        hashtextextended('rechnungsbeleg:wartung:' || wartung::text, 0));
      select count(*), (array_agg(i.invoice_number order by i.invoice_date desc, i.invoice_number desc))[1]
        into verrechnet, zuletzt
        from public.invoice_coverage c
        join public.invoices i on i.id = c.invoice_id
       where c.company_id = app.betrieb()
         and c.art = 'wartung'
         and c.ziel_id = wartung
         and c.invoice_id <> p_id
         and i.payment_status <> 'Storniert'
         and app.baustelle_wie_js(i.project_number) = app.baustelle_wie_js(baustelle);
      if verrechnet >= greatest(coalesce(app.wartung_durchgaenge(wartung, baustelle), 0), 1) then
        woanders := zuletzt;
        exit;
      end if;
    end loop;
  end if;

  if woanders is not null then
    raise exception 'Die Leistung dieser Rechnung steht inzwischen auf %. Der Storno bleibt — sonst hinge sie an zwei Rechnungen.', woanders
      using errcode = '42501';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Offen',
         cancellation_note = null,
         cancelled_at = null
   where id = p_id and company_id = app.betrieb();
  perform set_config('app.zahlstand', '', true);

  update public.time_entries t
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'time_entry' and t.id = c.ziel_id;

  update public.material_orders m
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'material_order' and m.id = c.ziel_id;

  -- Und jetzt das, was die Zahlungen sagen.
  perform app.zahlstand_setzen(p_id);
end;
$$;

revoke all on function public.rechnung_storno_aufheben(uuid) from public, anon;
grant execute on function public.rechnung_storno_aufheben(uuid) to authenticated;

