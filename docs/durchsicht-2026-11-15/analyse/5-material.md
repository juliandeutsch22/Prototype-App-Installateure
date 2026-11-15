# Tiefenanalyse 5 — Material (Anforderung, Lager, Einkauf, Katalog, Schein, Rechnung)

Stand des Codes: 15.11.2026, Branch wie ausgecheckt. Nur gelesen. **Nichts wurde gegen eine laufende
Datenbank ausgeführt** — „belegt“ heißt hier: im Code (Ansicht + Datenschicht + Migration) bis zum Ende
verfolgt, nicht: im Test nachgestellt. Pfade relativ zu `/workspace/Prototype-App-Installateure`.
Migrationen kurz als `mig/<Name>` für `supabase/migrations/<Name>`.

## 1. Wie der Ablauf funktioniert

1. **Anfordern** (`src/features/orders/OrderView.tsx`): Monteur wählt Baustelle (vorbelegt), legt
   Katalogartikel (seitenweise vom Server, `katalogSeite`) oder freie Zeilen in einen Warenkorb
   (localStorage je Betrieb+Person) und schickt ab. Je Zeile entsteht eine `material_orders`-Zeile
   („Offen“), mit Kennung vom Gerät und Ausgangsfach (ohne Netz vorgemerkt).
2. **Lager** (`AdminOrdersView.tsx`, Reiter Laufend): „Aus Lager“ = direkte Tabellenänderung
   `beschaffung='lager', status='Abholbereit'` (`pg/einkauf.ts:ausLager`); der Auslöser
   `app.aus_lager_pruefen` → `app.regal_fehlt` sperrt den Artikel und lässt nur zu, was frei ist
   (Bestand − Zusagen − Rüstlisten). „Nicht auf Lager“ → `beschaffung='einkauf'`, „In Bearbeitung“.
3. **Einkauf** (`Einkaufsliste.tsx`, `einkauf.ts`): je Großhändler zusammengefasst, PDF/Mailto,
   „Als bestellt markieren“ (ganze Gruppe), danach je Zeile „Geliefert“ (`einkauf_geliefert`): Bestand
   +Menge, Anforderung „Abholbereit“. Dazu eigene Posten des Büros (`einkauf_posten`) und
   Bestellvorschläge (`bestellvorschlaege`).
4. **Abholen**: Monteur oder Lager tippt „Abgeholt“ → `anforderung_abschliessen` (Zeile gesperrt,
   idempotent über `processed`): Entnahme über `bestand_anpassen` (**klemmt bei 0**), bei noch nicht
   gelieferter Einkaufsware Eingang+Abgang zugleich; Monteur kann bei „Offen/In Bearbeitung“ „Beim
   Händler mitgenommen“ wählen (kein Abzug).
5. **Bestand** ändert sich nur über Buchungen mit Bewegungsprotokoll (`lagerbewegungen`, Auslöser an
   `materials.stock`): Wareneingang, Einkauf geliefert, Abholung, Rüstliste „eingeladen“, Retoure „neu“,
   Inventur, Umlagerung, Gegenbuchung beim Löschen. Weitere Lagerorte/Fahrzeuge in `lagerbestaende`.
6. **Retoure** (`RetoureFenster.tsx` → `retoure_anlegen`): Beleg + Gutschrift in einem Zug, nur Zustand
   „neu“ wird gutgeschrieben; Kennung je Formular gegen Doppelbuchung.
7. **Löschen** (`anforderung_loeschen`): prüft „abgerechnet“, bucht die Entnahme/Gutschrift laut
   Protokoll zurück, Rückfrage nennt die Gegenbuchung.
8. **Schein** (`worksheets/MaterialErfassen.tsx`): Material wird von Hand eingetragen; „Für diese
   Baustelle abgeholt“ (eigene, 14 Tage) nur als Vorschlag. Der Schein bewegt **keinen** Bestand.
9. **Rechnung** (`ausgegebenes_material` + `invoices/ausgegebenesMaterial.ts`): nur Regie; erledigte
   Anforderungen + eingeladene Rüstlisten − Retouren − Material auf Scheinen = Vorschlag; „abgerechnet“
   ist alles bis zum Leistungsende der letzten gültigen Rechnung der Baustelle.
10. **Nachkalkulation** (`costing/materialkosten.ts`): je Artikel max(Scheine, Lagerausgabe) × heutiger
    Einkaufspreis.

Was dabei sauber gelöst ist (geprüft, kein Befund): zwei gleichzeitige „Abgeholt“ ziehen nicht doppelt ab
(`for update` + `processed`); zwei gleichzeitige „Aus Lager“ rechnen nacheinander (`regal_fehlt` sperrt
den Artikel); Statuswechsel nur auf dem erwarteten Stand; negativer Bestand ist ausgeschlossen
(Hauptlager klemmt, Orte per Check); Monteure können `bestand_anpassen` nicht direkt missbrauchen
(`materialfelder_geschuetzt`); Retoure/Wareneingang/Umlagerung sind wiederholungssicher.

## 2. Belegte Befunde

### Hoch / Mittel

**B1 — Artikel mit Bestand lässt sich ohne Warnung löschen; Bestand und Bewegungsprotokoll verschwinden
(mittel–hoch, belegt)**
- `src/features/orders/MaterialCatalog.tsx:719-735` (Rückfrage nennt nur „wird aus dem Katalog
  entfernt“), `src/lib/db/pg/materials.ts:140` (`loeschen('materials', id)`).
- `mig/20260930380000_lagerbewegungen.sql:30` und `mig/20261107200000_lagerorte_fahrzeuge_umlagerung.sql:286`:
  `material_id … on delete cascade`. Kein `before delete`-Riegel an `materials` außer
  `materials_altpreise` (`mig/20261107100000_lieferantenartikel.sql:421`).
- Szenario: Artikel „Kupferrohr 15 mm“, 50 m im Regal (Anfangsbestand/Wareneingang, nie über die App
  angefordert), 12 m im Fahrzeug. Verwaltung tippt „Material löschen …“ → bestätigt → Artikel, 50 m
  Hauptlager, 12 m Fahrzeugbestand und alle Protokollzeilen sind weg. Widerspricht M28 („der Bestand
  ändert sich nur über Bewegungen“). Der Datenbanktest `tests/supabase/modulLager.test.ts:33-41` löscht
  genau so einen Artikel mit Bestand 10 und erwartet Erfolg.

**B2 — Ein je angeforderter oder auf einer Rüstliste geplanter Artikel lässt sich gar nicht löschen und
auch nicht stilllegen (mittel, belegt)**
- `mig/20260911150000_betrieb.sql:12` (`material_orders.material_id references materials (id)`, ohne
  `on delete`) und `:111` (`einsatz_material_positionen`): Fremdschlüssel verweigert das Löschen.
- Die Rückfrage verspricht das Gegenteil: „Bereits erfasste Bestellungen bleiben erhalten“
  (`MaterialCatalog.tsx:724`). Die Meldung des Fehlers ist der feste Satz „Die Aktion konnte nicht
  ausgeführt werden.“ (`src/lib/fehlerGrund.ts` filtert „violates foreign key“ als technisch).
- Kein Ausweg: `ausgelaufen` setzt nur der DATANORM-Import (keine Stelle in `src/` schreibt es von Hand).
  Ein von Hand angelegter, einmal angeforderter Artikel bleibt für immer im Katalog und für Monteure
  anforderbar. Zusammen mit B1: gelöscht werden kann genau das, was Bestand, aber keine Historie hat.

**B3 — Material, das am Tag des Leistungsendes (oder davor datiert) nach der Rechnung ausgegeben wird,
kommt auf keine Rechnung mehr (mittel, belegt)**
- `mig/20261027400000_r6_ruestliste_fehlmenge.sql:450-455` (Grenze = `max(leistung_bis | invoice_date)`),
  `:492` (`a.datum > grenze`), `:479` (Rüstlistenposition zählt am **Einsatztag** `k.date`, nicht am Tag
  des Abhakens).
- Szenario a: Teilrechnung am 10.11. vormittags, „Leistung bis 10.11.“. Um 15 Uhr holt der Monteur für
  dieselbe Baustelle Material ab (`erledigt_am` 10.11.). Nächste Rechnung: 10.11. ≤ Grenze → nie
  vorgeschlagen. Szenario b: Rüstliste für den 08.11. wird erst am 12.11. abgehakt, Rechnung vom 10.11.
  → Datum 08.11. ≤ Grenze → nie vorgeschlagen. Szenario c: „Leistung bis“ liegt in der Zukunft
  (Monatsende; die Datenbank prüft nur `bis >= von`, `mig/20261027300000_…:50`) → alles bis dahin gilt
  als abgerechnet.
- Folge zusätzlich: `app.material_abgerechnet` (`mig/20261110150000_…:220-234`, `datum <= grenze`)
  meldet für diese Zeilen „Schon abgerechnet“ — Löschen und Zurücksetzen sind gesperrt, obwohl sie auf
  keiner Rechnung stehen. Die benannte Grenze („die Rechnung hält nicht je Zeile fest …“) deckt das
  Löschen, nicht den stillen Erlösverlust.

**B4 — Fahrzeuglager: Verbrauch aus dem Fahrzeug wird nirgends gebucht; die dafür gebaute
Datenbankfähigkeit ist in der Monteur-Ansicht nicht angeschlossen (mittel, belegt)**
- `src/features/worksheets/MaterialErfassen.tsx:44-46` („Der Bestand wird dabei nicht bewegt“),
  `src/features/orders/MeinFahrzeug.tsx` (nur Lesen + „Zurücklagern“).
- `mig/20261113300000_abgeholt_herkunft.sql:81-94` erlaubt dem Besteller ausdrücklich, aus dem eigenen
  Fahrzeug abzuholen (`p_ort`, „der Besteller nur aus seinem eigenen Fahrzeug“). `OrderView.tsx:990-993`
  übergibt aber nie einen Ort — nur `von` und `herkunft`.
- Szenario: Lager lagert 20 Pressfittings ins Fahrzeug W-123 um. Der Monteur verbaut über zwei Wochen
  14 Stück bei Reparaturen und trägt sie auf Scheinen ein. „Mein Fahrzeug“ zeigt weiter 20; herunter
  geht die Zahl nur durch Rüstliste-Abhaken „aus Fahrzeug“, Zurücklagern oder eine Inventur des Büros.
  Dasselbe gilt im Hauptlager für alles, was ohne Anforderung aus dem Regal genommen und nur am Schein
  („Artikel aus dem Lager“, `MaterialErfassen.tsx:240`) eingetragen wird. Die Entscheidung „der Schein
  bucht nicht“ ist begründet (kein Doppelabzug); der fehlende Gegenweg — Verbrauch, der nicht über eine
  Anforderung kam — ist es nicht.

**B5 — „Bestellt“ lässt sich nicht zurücknehmen; ein eigener Posten kommt nur über „Geliefert“ wieder
von der Liste (mittel, belegt)**
- `src/lib/db/pg/einkauf.ts:165-172` (`vonEinkaufslisteNehmen` nur unbestellt), `:327-333`
  (`lagerPostenLoeschen … .is('bestellt_am', null)`); `Einkaufsliste.tsx:445-493`: unter „Bestellt —
  noch nicht da“ gibt es nur „Termin“ und „Geliefert“. „Als bestellt markieren“ gilt für die ganze
  Großhändler-Gruppe (`:394-400`).
- Szenario: Gruppe versehentlich als bestellt markiert, oder der Großhändler storniert/kann nicht
  liefern. Eigener Posten: einziger Weg von der Liste ist „Geliefert“ → bucht Bestand ein, der nie kam →
  Inventur. Anforderung: nur löschen und neu anfordern lassen. Der Kommentar („was beim Großhändler
  liegt, kommt“) trägt für Storno, Irrtum und Nichtlieferung nicht.
- Dazu fehlt die **Teillieferung**: „Geliefert“ ist je Anforderung/Posten alles oder nichts
  (`einkauf_geliefert` bucht `quantity` bzw. `menge` ganz, `mig/20261107200100_…:796-847`). 6 von 10
  geliefert → entweder 10 eingebucht oder 0.

**B6 — Keine Teilausgabe, keine Mengenänderung, kein Zurückziehen (mittel, belegt)**
- Monteur: `OrderView.tsx:884-912` und `AnforderungFenster.tsx:52-57` bieten nur „Abgeholt“ und „Als
  eilig markieren“. Löschen dürfen nur Verwaltung/Führung (`mig/20261009200000_…:259`,
  `anforderung_loeschen`). Die Datenbank ließe den Besteller die Menge ändern, solange „Offen“
  (`app.anforderung_besitzer_offen`, `mig/20261001200000_…:86-112`) — die Ansicht bietet es nicht.
- Lager: `AdminOrdersView.tsx:1198-1289` — keine Menge änderbar. „Aus Lager“ bei 6 frei und 10
  angefordert wird abgewiesen („Nicht auf Lager setzt die Anforderung auf die Einkaufsliste“,
  `mig/20261031210000_…:175`) → alle 10 gehen zum Großhändler oder „trotz Fehlbestand“.
- Szenario: Monteur tippt 30 statt 3 und schickt ab → er kann nichts korrigieren; „Abgeholt“ bucht 30
  (Bestand klemmt bei 0, Rechnungsvorschlag 30). Oder: er holt nur 6 von 10 ab → „Abgeholt“ kennt nur
  die ganze Menge; die Differenz geht nur über eine eigene Retoure.

**B7 — Jede über die Einkaufsliste gelieferte Kommissionsware wird dauerhaft „Lagerartikel“ und steht
danach als „knapp“ da (mittel, belegt)**
- `mig/20261107200000_…:552-560` (`app.lager_folgt_bestand`: Bestand ≠ 0 ⇒ `lagerartikel := true`),
  ausgelöst durch `einkauf_geliefert` (`mig/20261107200100_…:796-805`) und durch „beim Abholen
  geliefert“ (`mig/20261113300000_…:108-111`). Zurück auf „nur Katalog“ setzt nichts.
- `mig/20261019200000_startseite_aus_der_datenbank.sql:23-45` (`lager_knapp`: ohne Mindestmenge knapp,
  wenn ≤ 5 frei) → Startseite (`dashboard/start/laden.ts:469`) und Lagerliste.
- Szenario: Katalog mit 30.000 DATANORM-Artikeln, 200 im Regal. Ein Monteur fordert einen
  Sonderfitting an → Einkaufsliste → geliefert → abgeholt. Der Artikel ist jetzt Lagerartikel mit
  Bestand 0: in „Lager“ unter „knapp“, auf der Startseite unter knapp, im Monteur-Katalog „nichts frei“
  statt „wird bestellt“ (`OrderView.tsx:662-668`). Nach einem Jahr stehen Hunderte solcher Zeilen im
  Lager; die Knapp-Warnung verliert ihren Wert, und die Lagerliste lädt sie alle samt `lager_frei`.

**B8 — Die Retoure des Monteurs schreibt sofort und unbegrenzt gut; niemand im Lager nimmt sie an
(mittel, belegt)**
- `RetoureFenster.tsx:65` (Vorgabe „neu“), `:141-168`; `mig/20261110150000_…:168-177` (Gutschrift ohne
  Bezug auf Ausgegebenes). Reiter „Retouren“ trägt keine Zahl („erfasst, nicht zu tun“,
  `AdminOrdersView.tsx:775-787`); keine Meldung ans Lager gefunden.
- Szenario: Monteur erfasst auf der Baustelle „10 Stk neu“ (ausgegeben waren 4, im Regal kommt nie etwas
  an). Bestand +10 sofort; „Aus Lager“ sagt die 10 dem Nächsten zu. Gleichzeitig mindert die Retoure den
  Rechnungsvorschlag der Baustelle (`ausgegeben − zurück`), auch für „gebraucht“ und „defekt“
  (`mig/20261027400000_…:469-476` zählt jede Retoure negativ).
- Verwandt: eine Retoure **nach** der Rechnung ergibt `offen < 0` und fällt aus der Vorschau
  (`invoices/ausgegebenesMaterial.ts:179-182`, nur `offen > 0`) — verrechnetes, zurückgebrachtes
  Material erzeugt keinen Hinweis auf eine Gutschrift.

**B9 — Baustelle „Abgeschlossen“ prüft kein offenes Material (mittel, belegt)**
- `src/features/projects/BaustellenakteView.tsx:893-900`, `AdminProjectsView.tsx:812`: reine
  Statusauswahl. Keine Prüfung auf offene/abholbereite Anforderungen, Zeilen auf der Einkaufsliste,
  ausgegebenes unverrechnetes Material oder künftige Rüstlisten.
- Szenario: Baustelle wird abgeschlossen, 3 Anforderungen sind „Abholbereit“ (zugesagt), 2 stehen als
  „bestellt“ beim Großhändler. Die Zusagen binden weiter Bestand (`app.lager_zugesagt`), die Bestellung
  läuft weiter, das Material liegt danach ohne Abnehmer „abholbereit“; ausgegebenes Material ohne Schein
  bleibt unverrechnet, ohne dass der Abschluss es sagt. Die Akte zeigt die Zahlen
  (`baustelle_materialstand`), aber nicht beim Abschließen.

### Niedrig

**B10 — Freie Zeile mit Kommamenge, die beim Abholen/Liefern einem Stück-Artikel zugeordnet wird, lässt
sich nicht mehr abschließen (niedrig–mittel, belegt im Code)**
- `OrderView.tsx:357-366` und `:711-717` (freie Menge beliebig dezimal, keine Einheit);
  `mig/20261113300000_…:131-139` und `mig/20261107200100_…:814` setzen beim Abholen/Liefern
  `material_id` über den Namen (`app.katalogeintrag`); der Auslöser
  `app.anforderung_menge_pruefen` (`mig/20260930370000_…:52-73`) prüft dann die Menge gegen die Einheit
  des Artikels und wirft „In „Stk“ zählen ganze Stück“.
- Szenario: Monteur tippt frei „Kupferrohr 15mm“, Menge 2,5 (der Artikel ist ausgelaufen ohne Bestand
  und deshalb im Katalog nicht sichtbar, oder er hat ihn nicht gefunden). Im Katalog gibt es genau einen
  Artikel dieses Namens in „Stk“. „Abgeholt“ (auch „beim Händler“) und „Geliefert“ scheitern jedes Mal;
  Ausweg nur Löschen und neu anfordern (siehe B6: ändern geht nicht).

**B11 — Eingeladene Rüstlistenposition ohne Buchung bleibt bis zum Einsatztag reserviert (niedrig,
belegt)**
- `mig/20261027400000_…:149-155` (`ruest_reserviert`: `not (geladen -> p.id) ? 'gebucht'`), ebenso
  `lager_frei` (`mig/20261107200100_…:206-207`) und die Bestellvorschläge
  (`mig/20261108100000_…:463-465`). `gebucht` steht aber nur am Haken, wenn > 0 gebucht wurde
  (`mig/20261107200100_…:486-489`).
- Szenario: Rüstliste für morgen, 5 Stk eines Katalogartikels ohne Lagerführung (oder Regal leer),
  heute abgehakt. Die Position gilt weiter als „geplant“ → frei −5, „5 fehlen“ im Lager,
  Bestellvorschlag „Fehlmenge“ für schon eingeladene Ware. Die erklärte Absicht („bis eingeladen
  reserviert“, `mig/20261001100000_…`) meint den Haken, nicht die gebuchte Menge.

**B12 — Das Lager kann beim Abschließen keine Herkunft wählen (niedrig, belegt)**
- `AdminOrdersView.tsx:643-647` (`setStatus` ohne `herkunft`), Dialog `:1345-1376`. Schließt das Lager
  eine „Offen“-Anforderung für den Monteur, der beim Händler gekauft hat, wird vom Lagerbestand
  abgezogen; „Beim Händler mitgenommen“ gibt es nur in `OrderView`.

**B13 — Anforderungen tragen keine Einheit; Rückfragen zeigen Mengen mit Punkt (niedrig, belegt)**
- `material_orders` hat keine Einheitsspalte (`mig/20260911150000_betrieb.sql:9-31`); Listen zeigen
  „×2,5“ ohne Einheit (`OrderView.tsx:889`, `AdminOrdersView.tsx:1020`). Bei freien Zeilen („Rohr ×30“)
  weiß das Lager nicht, ob Meter oder Stangen.
- `abschlussText.ts:17`, `AdminOrdersView.tsx:172` und `:1301` setzen `×${o.quantity}` roh ein → „×2.5“
  statt „×2,5“ in drei Rückfragen.

**B14 — Warenkorb: gescheiterte Positionen ohne Grund (niedrig, belegt)**
- `OrderView.tsx:437-439` verwirft den Fehler, `:451-453` meldet nur die Zahl. Ein alter Korb mit
  inzwischen gelöschtem Artikel (Fremdschlüssel) oder geänderter Einheit (Mengenprüfung) scheitert bei
  jedem Versuch, ohne dass der Monteur erfährt, warum.

**B15 — Kennzahl „Reserviert“ im Lager addiert über Einheiten (niedrig, belegt)**
- `StockView.tsx:572`: Summe aller reservierten Mengen, Meter + Stück + Kilo in einer Zahl.

**B16 — Nachkalkulation rechnet mit dem heutigen Einkaufspreis (niedrig, belegt)**
- `costing/materialkosten.ts:83-99`. Ein neuer DATANORM-Stand ändert rückwirkend die Kosten
  abgeschlossener Baustellen, obwohl ein Preisverlauf (`material_prices`, `preisverlauf`) existiert.

**B17 — Wareneingang im Lager erreicht nur schon geführte Lagerartikel und kennt die Einkaufsliste
nicht (niedrig, belegt)**
- `StockView.tsx:507-510`, `:978-983`: die Artikelwahl sucht nur in den geladenen Lagerartikeln („Kein
  Lagerartikel passt zur Suche“). Ein Katalogartikel muss erst im Katalog geöffnet, „Im Lager führen“
  angehakt und gespeichert werden.
- `LagerDialoge.tsx:127-146`: der Wareneingang (mit Lieferschein) und „Geliefert“ der Einkaufsliste
  (ohne Lieferschein) sind zwei getrennte Wege für dieselbe Lieferung; wer beide benutzt, bucht doppelt.

## 3. Verdacht (nicht bis zum Ende belegt)

- **V1 Suchindex passt nicht zur Abfrage.** `mig/20260911120000_stammdaten.sql:214` legt den
  Trigramm-Index auf `name || ' ' || article_number`; gesucht wird mit `ilike` auf den Einzelspalten
  `name`, `article_number`, `category` (`pg/materials.ts:92-94`, `sucheKatalog`, `artikelSuchen`),
  sortiert nach `name, id` ohne passenden Index, mit `count: 'exact'`. Der Index dürfte nie benutzt
  werden und kostet nur beim Import. Gemessen wurde mit 40.800/120.000 Artikeln akzeptabel
  (Stand E-M2, T-5e); bei 500.000 (im Kommentar genannt) nicht.
- **V2 DATANORM-Import und Live-Kanäle.** Während der ~17 Minuten eines 50.000-Zeilen-Imports meldet
  `materials` jede Zeile an alle offenen Seiten; `katalogBeobachten` holt je Seite bis zu einmal je
  Sekunde neu (`katalogSeite` + `katalogAnzahl`), `subscribeLagerartikel` prüft jede Meldung. Last nicht
  gemessen.
- **V3 Einheitswechsel durch Import.** `mig/20261107100000_lieferantenartikel.sql:1143-1146` überschreibt
  `unit` des Stammartikels aus der Datei, auch bei vorhandenem Bestand und offenen Anforderungen
  (50 „Stk“ werden 50 „Pkg“). Ob reale Dateien das auslösen, ist offen (Leser ungeprüft, bekannte Grenze).
- **V4 Eigener Einkaufsposten mit anderer Einheit als der Artikel.** `Einkaufsliste.tsx:706-724` lässt
  bei gewähltem Katalogartikel eine abweichende Einheit zu; die Liste zeigt die Katalogeinheit
  (`einkauf.ts:140`), „Geliefert“ bucht die Zahl unverändert (2 „Pkg“ → +2 „Stk“).
- **V5 Verbuchte Anforderung über „Status von Hand“ zurück auf „Offen“ und dann „Nicht auf Lager“:**
  `aufEinkaufsliste` prüft `nurUnverbucht` nur beim Weg aus „lager“ (`pg/einkauf.ts:151-161`);
  `einkauf_geliefert` überspringt verbuchte Zeilen (`mig/20261107200100_…:788-793`) → Zeile hängt als
  „bestellt“ auf der Liste, „Geliefert“ meldet „inzwischen von jemand anderem gebucht“.
- **V6 „Abgeholt“ über dem Bestand:** die Entnahme klemmt still bei 0 (bewusst, benannt). Kein Signal an
  das Lager, dass der Bestand offenbar nicht stimmte — die Abweichung fällt erst bei der Inventur auf.

## 4. Nicht nahtlos

- **Schein ↔ Lager:** Verbrauch am Schein senkt keinen Bestand (B4); umgekehrt ist „Für diese
  Baustelle abgeholt“ nur 14 Tage und nur das selbst Abgeholte (benannte Grenze) — bei Teams trägt der
  Kollege nichts vorgeschlagen bekommen.
- **Wareneingang ↔ Einkaufsliste ↔ Bestellung:** drei Stellen, kein gemeinsamer Beleg (B17). Die
  Bestellung hat keine Nummer und keinen gespeicherten Stand (PDF/Mailto, danach nur „bestellt am“);
  „Bestellbezug“ im Wareneingang ist Freitext.
- **Anforderung → Rückgabe:** aus einer erledigten Anforderung führt kein Weg zur Retoure (Artikel,
  Baustelle, Höchstmenge müssten neu gesucht/getippt werden). Frei getippte Ware lässt sich gar nicht
  zurückgeben — die Retoure verlangt einen Katalogartikel (`RetoureFenster.tsx:296`).
- **Monteur ↔ Lager bei Irrtum:** keine Korrektur/kein Storno durch den Besteller (B6); „Nicht auf
  Lager“ nach „Aus Lager“ nimmt die „abholbereit“-Meldung nicht zurück.
- **Baustelle ↔ Material:** Abschluss ohne Blick auf offenes Material (B9); Anforderungen „ohne
  Baustelle“ sind erlaubt und erscheinen weder in Rechnung noch Nachkalkulation.
- **Katalog ↔ Lager:** Wareneingang für einen Nicht-Lagerartikel braucht den Umweg über die
  Katalogbearbeitung; Kommissionsware wird ungefragt Lagerartikel (B7).
- **Inventur:** nur Artikel für Artikel (`InventurDialog`), keine Zählliste über das Lager oder einen
  Ort, kein Stichtag.

## 5. Funktionen mit Mehrwert (in den bestehenden Abläufen)

1. **Teilmengen überall:** Teilausgabe („6 aus Lager, 4 auf die Einkaufsliste“), Teilabholung und
   Teillieferung — schließt B5/B6 und ist der häufigste Alltag am Regal.
2. **Verbrauch am Schein buchen, wenn er nicht aus einer Anforderung stammt:** beim Unterschreiben die
   Differenz „auf dem Schein, aber nicht ausgegeben“ als Entnahme aus Hauptlager oder eigenem Fahrzeug
   anbieten — macht Fahrzeuglager und Bestand erst verlässlich (B4).
3. **Bestellung zurücknehmen/stornieren** (einzeln, mit Grund) und **„Geliefert“ mit Lieferschein-Nr.**
   in einem Dialog — ein Weg statt zwei für dieselbe Lieferung (B5, B17).
4. **Anforderung zurückziehen/Menge ändern durch den Besteller, solange „Offen“** — die Datenbankregel
   dafür gibt es schon (B6).
5. **Rückgabe aus der abgeholten Anforderung** (Artikel, Baustelle, Höchstmenge vorbelegt) samt
   Eingangsbestätigung des Lagers für „neu“ — hält den Bestand ehrlich (B8).
6. **Inventur als Zählliste** je Lager/Fahrzeug (alle Artikel eines Orts, gezählt eintragen, Differenzen
   in einem Zug buchen) — heute ist die Inventur die Antwort auf jede Abweichung, aber nur einzeln
   möglich.

## 6. Was ich NICHT angesehen habe

- `src/features/materials/KatalogImport.tsx`, `Lieferantenvergleich.tsx`, `OffeneLieferantenartikel.tsx`
  und `datanorm.ts` nur überflogen; `datanorm_uebernehmen` (Blöcke, Wiederaufnahme, Preisübernahme) und
  der Lieferantenvergleich nicht im Einzelnen (Migration `20261107100000`, 2.068 Zeilen, nur Stellen).
- `bestellungPdf.ts`, `Bestellvorschlaege.tsx`, `VorschlagGrund.tsx`, `LagerorteFenster.tsx`,
  `fahrzeug_speichern`/`lagerort_speichern`, `materialdeckung` (Materialbereitschaft in der Planung),
  die Rüstlisten-Oberfläche (`assignments/RuestlistePlanen.tsx`).
- Push-Auslöser der Anforderungen, Datenauskunft/Personenlöschung für Materialtabellen,
  Supportzugang auf Materialseiten.
- `InvoicesView.tsx` nur an den Stellen, an denen ausgegebenes Material geladen und abgeglichen wird;
  `scheinHinweise.ts` und `materialPositionen.ts` nicht.
- Keine Tests ausgeführt, kein lokaler Supabase-Stack gestartet, kein Browserlauf.
