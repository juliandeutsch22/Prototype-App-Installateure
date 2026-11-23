# Büro — Geld und Material — Oberfläche, Arbeitspapier zur Durchsicht vom 23.11.2026

Stand: `main` fa6e740, Vorschau mit Beispieldaten (`localhost:5199/tools/vorschau/`). Breiten: 1440×900,
390×844 (Touch), 834×1112. Gemessen mit `getComputedStyle` / `getBoundingClientRect`; Bilder und Skripte
unter `…/scratchpad/audit/D3/` (Läufer `lauf.mjs`, Messung `audit.js`, Szenarien `s*.json`).

**Wie die dichten Bildschirme erreicht wurden.** Die Vorschau liefert für „Rechnung stellen“, „Kontoauszug“
und „Einkaufsliste“ keine brauchbaren Daten: acht Attrappen geben `undefined` zurück, wo die Ansicht eine
Liste oder Map erwartet (`ausgegebenesMaterial`, `wartungenDerBaustelle`, `rechnungsKoepfeNachNummer`,
`rechnungsKoepfeMitGuthaben`, `kontoauszugSchonVerbucht`, `katalogFuer`, `lieferantVorschlag`,
`lieferantenNummern`), `listGrosshaendler` ist leer, der Betrieb hat `rechnungsarten` aus. Ich habe die
Antworten des Vorschau-Servers **nur im Browser** ersetzt (`page.route`, nichts im Repo geändert) und
eine CSV bzw. DATANORM-Datei aus dem Scratchpad eingespielt. Ohne das zeigen diese Wege „Die Positionen
konnten nicht geladen werden.“, „genannt is not iterable“ bzw. die Absturzseite — das ist ein Befund über
die Vorschau, nicht über die App (Vorschlag dazu: D3-C0).

## 1. Angesehen

| Route | Rollen | Breiten | Unterseiten / Fenster / Menüs, die geöffnet wurden |
|---|---|---|---|
| `/invoices` | Buchhaltung; Projektleiter (nur „Kein Zugriff“) | 1440, 390, 834; dunkel 1440 + 390 | Kennzahlen; „Nicht verrechnete Leistung“ und „Mahnlauf“ auf/zu; Reiter Offen · Erledigt · Alle; Seiten-⋯ („Kontoauszug abgleichen“); „Neue Rechnung“: Baustelle, „Konditionen …“ aufgeklappt, Art der Rechnung (Rechnung, Anzahlung, Schlussrechnung mit „Bereits verrechnet — abziehen“), Vorschau mit Positionen, Fehlerzustand; Rechnungsfenster, Fenster-⋯ (6 Einträge); „Zahlungen —“; „Mahnung —“; „Rechnung stornieren?“; „E-Rechnung —“; Buchhaltungs-Export nach „Zeitraum zusammenstellen“ |
| `/invoices/kontoauszug` | Buchhaltung | 1440, 390 | leer; nach CSV: Kennzahlen, „Datei“, alle fünf Gruppen (Zugeordnet, Bitte prüfen, Ohne Zuordnung, Nicht Rechnungen betreffend aufgeklappt; „Schon erfasst“ nicht erzeugt), Fenster „Zuordnung“, Rückfrage „2 Bewegungen verbuchen?“, Fehlerzustand |
| `/costing` | Geschäftsführung | 1440, 390 | Liste (Laufend, Abgeschlossen leer), Fenster der Baustelle |
| `/settings/saetze`, `/rechnung`, `/nummern`, `/konten`, `/fahrzeuge` | Geschäftsführung | 1440, 390 | Grundzustand; „Fahrzeug anlegen“ (Blatt) |
| `/lager` | Verwaltung, Geschäftsführung | 1440, 390, 834 | Bestand; Seiten-⋯; Artikelfenster, Fenster-⋯, „Wareneingang:“, „Inventur:“; „Wareneingang: Artikel wählen“; „Lagerorte“; Reiter Katalog, „Neues Material“, „Material bearbeiten“; Reiter Inventur, „Neue Zählliste“; `?reiter=import` Schritt Datei und Probelauf; `?reiter=zuordnen` (nur Fehlerzustand) |
| `/anforderungen` | Verwaltung | 1440, 390, 834 | Laufend (mit Einkaufs- und Bestellt-Zeilen), Anforderungsfenster + ⋯; Einkauf leer und gefüllt (zwei Großhändler, „Ohne Großhändler“), „Als bestellt markieren?“, „Lieferung buchen“, „Bestellung stornieren?“, „Erwarteter Liefertermin“, „Material dazusetzen“; Retouren; Erledigt |
| `/material` | Verwaltung 1440, Projektleiter 390 | 1440, 390 | Grundzustand |

## 2. Fehler gegen die Linie

### D3-1 Rechnung stellen: Positionstabelle läuft am Handy und Tablet aus dem Blatt, Summen unsichtbar
- Ort: `/invoices` → „Neue Rechnung“ → „Positionen zusammenstellen“, Buchhaltung, 390 und 834, Blatt „Vorschau“.
- Ist: Tabelle 675 px in einer Hülle von 326 px (390) bzw. 624 px (834), `overflow-x: auto`. Sichtbar sind
  Position, Menge und ein angeschnittenes „Einhei“. EP, Netto, „Entfernen“ (x = 658) **und die drei
  Summenzeilen Netto / USt. / Brutto** liegen rechts außerhalb; im Blatt bleibt dort ein leeres Feld von 96 px
  Höhe. Bild `inv_neu_pos_390_tabelle.png`, `inv_neu_834.png`.
- Soll: kein seitlicher Überlauf; „Mobil: eine Aufgabe pro Blickfeld“ (style.md, Responsive Ordnung);
  „Rechnungen: Beträge … stehen direkt am Beleg“.
- Ursache: `src/features/invoices/InvoicesView.tsx:4578–4579` (`min-w-[34rem]`), einmal.
- Vorschlag: unter 760 px jede Position als gestapelte Zeile (Bezeichnung über die Breite; darunter Menge ·
  Einheit · EP, Betrag rechts in Mono, Mülleimer am Zeilenende); Summen als eigener Block unter der Liste,
  nicht im `tfoot`. Am Tablet die Einheit auf 4 rem und die Tabelle ohne Mindestbreite. — Aufwand: mittel.
  **Gleich bleibt:** alle sechs Spalten am Schreibtisch, Reihenfolge der Felder beim Tabben, die Preisfehler-
  Markierung (`position-preis-fehlt`). **Rückschritt merkt man an:** `document.scrollWidth` oder die Hülle
  breiter als ihr Inhalt; Summen auf 390 px nicht im Bild.

### D3-2 Positionsfelder: 15 px (iOS zoomt), andere Feldform als überall sonst
- Ort: dieselbe Tabelle, alle Breiten, `.position-bezeichnung`, `.position-menge`, `.position-einheit`, `.position-preis`.
- Ist: `font-size` 15 px, Höhe 44 px, Rand `--border` (#DFE7E9; dunkel #22393F auf #12262B), DM Sans.
  Übrige Felder der Seite: 16 px, 48 px, `--border-strong`. Bild `d_inv_neu_390.png`.
- Soll: „16 px — Feld: jedes Eingabefeld (sonst vergrößert iOS …)“ (E97); Mengen und Beträge in Plex Mono
  (style.md, Typografie). Richtig gebaut ist das Zählfeld der Inventur (`lot-material.css:267`: Mono, 16 px, rechtsbündig).
- Ursache: `src/styles/lot-rechnungen.css:74–77`. Die Browserprüfung der Schriftskala öffnet das Formular nicht.
- Vorschlag: `--groesse-feld`, `--border-strong`, Menge und EP in `--schrift-mono`; Spaltenbreiten nachmessen
  (16 px brauchen bei „284,5“ rund 6 px mehr). — Aufwand: klein. **Gleich bleibt:** Zeilenhöhe der Tabelle
  am Schreibtisch (44 px je Feld darf bleiben), rechtsbündige Zahlen. **Rückschritt:** Zahl im Feld angeschnitten.

### D3-3 Rechnung stellen: Beträge nicht in Mono, Summen und Zahlbetrag auf zwei Fluchten, Tabellenkopf in Grundschrift
- Ort: Blatt „Vorschau“, 1440.
- Ist: Zeilenbetrag, Netto, USt., Brutto in DM Sans 15 px, rechte Kante x = 1286; „Zahlbetrag“ zwei Zeilen
  darunter in Plex Mono, rechte Kante x = 1376 (90 px Versatz, dazwischen die Mülleimer-Spalte). Kopf
  „Position · Menge · Einheit · EP · Netto“ 15 px / 400, gemischt. Im Rechnungsfenster dieselbe Tabelle:
  Kopf 12 px versal, Beträge Mono, Summen auf der Blattkante (`inv_fenster_1440.png`).
- Soll: Plex Mono für Beträge; „versale Köpfe … der Tabellen“ 12 px (E97); Summenzeile auf der Flucht.
- Ursache: `InvoicesView.tsx:4579–4600` und `tfoot`; `.position-betrag` in `lot-rechnungen.css:94`.
- Vorschlag: Kopf und Zahlen wie `RechnungDetail`; Summen aus dem `tfoot` in denselben Block wie „Zahlung“
  (eine rechte Kante). — Aufwand: klein bis mittel. **Gleich bleibt:** die Werte selbst, „USt. 20 %“, das Rot
  der Abzüge. **Rückschritt:** rechte Kanten der vier Beträge ungleich.

### D3-4 Rechnungsfenster: Aktionsreihe hängt links, ihre Linie endet nach 319 px
- Ort: `/invoices` → Zeile, 1440 und 390, `.rechnung-detail-aktionen > .fensteraktionen`.
- Ist: Reihe 319 px breit in 438 px Inhalt; Linie darüber endet bei x = 1292 (Inhalt bis 1411); Hauptaktion
  „Zahlung erfassen“ endet bei 1292, am Handy bei 335 (Blattinhalt bis 374). Im Lager- und im Anforderungs-
  fenster steht dieselbe Reihe über die volle Breite (⋯ bei 1013, Hauptaktion bis 1411).
- Soll: U4 — „gefüllte Hauptaktion rechts … alles Weitere im ⋯ ganz links“.
- Ursache: `src/styles/lot-rechnungen.css:51` (`display: flex` ohne Dehnung um `Fensteraktionen`).
- Vorschlag: `.rechnung-detail-aktionen > .fensteraktionen { flex: 1 }`. — Aufwand: klein. **Gleich bleibt:**
  Reihenfolge ⋯ · PDF laden · Zahlung erfassen, die Lese-Fassung ohne Knöpfe (Kundenakte, Baustellenakte).

### D3-5 Lager-Artikelfenster: zwei Linien 20 px untereinander
- Ort: `/lager` → Zeile, 1440, `dl.fenster-zahlen` (Unterlinie y = 319) und `.fuss-aktionen` (Oberlinie y = 339).
- Soll: „Linien trennen nur dort, wo sie Lesen oder Bedienung unterstützen“. Bild `lager_artikel_1440.png`.
- Ursache: `StockView.tsx` (Fenster), Regel fehlt wie bei `.pf-fuss` in `lot.css:328`. — Aufwand: klein.
  **Gleich bleibt:** Abstand zwischen Zahlen und Knöpfen (rund 36 px).

### D3-6 Zahlungsdialog: Betrag vorbelegt als „22104.6“
- Ort: Rechnungsfenster → „Zahlung erfassen“, Feld „Betrag (€)“. Bild `inv_zahlung_1440.png`.
- Ist: Dezimalpunkt, eine Nachkommastelle. Soll: Komma und zwei Stellen wie jedes Betragsfeld (`zahlAlsText`,
  `src/lib/zahl.ts:98`; `InvoicesView.tsx:1295` und `:6196` machen es beim Guthaben richtig).
- Ursache: `InvoicesView.tsx:1306` `String(vorschlag)`. — Aufwand: klein. **Gleich bleibt:** der Wert
  (offener Rest ohne Rücklass). Dazu: das „i“ zum Betrag steht allein unter dem Feld „Art“ (44-px-Kreis bei
  x = 537, ohne Bezug) — an die Beschriftung „Betrag (€)“ setzen.

### D3-7 Kontoauszug: Zustand und Betrag fluchten nicht; am Handy steht der Betrag links
- Ort: `/invoices/kontoauszug` nach Datei, 1440 und 390.
- Ist 1440: Zustand beginnt bei x = 989 / 998 / 998 / 998 / 1117 / 1099; Betrag endet bei 1268 (Zeilen mit
  Kästchen) bzw. 1360 (ohne). Ist 390: Betrag direkt hinter dem Zustand, rechte Kante 243 / 234 / 205 / 205 /
  237 / 251; Zeilen 166–287 px hoch. Bilder `kto_voll_1440.png`, `kto_voll_390.png`.
- Soll: feste Ordnung der Liste (U11), „Zahlen bleiben tabellarisch ausgerichtet“; Rechnungsliste derselben
  Seite: Zustand links, Betrag rechts (r = 1344 in jeder Zeile).
- Ursache: `KontoauszugView.tsx:402–430` (eigene Spaltenordnung statt der Zahlenspalte der Rechnungsliste).
- Vorschlag: Spalten wie `RechnungsListe`; leerer Platzhalter in der Breite des Kästchens bei Zeilen ohne
  Wahl; am Handy Zustand links / Betrag rechts in einer Zeile, Kästchen darunter mit Wort. — Aufwand: mittel.
  **Gleich bleibt:** Kästchen nur, wo verbucht werden kann; Tipp auf die Zeile öffnet „Zuordnung“.

### D3-8 Kontoauszug: „1 Abbuchung anzeigen“ sitzt auf der Blattkante
- Ist: `summary.weiteres-kopf` x = 272 (1440) bzw. 16 (390), Pfeil bis 1400; Blattflucht ist 296 bzw. 32.
- Soll: 24-px-Flucht im Blatt (E98). Ursache: `WeitereAngaben` in bündiger `Card`, `KontoauszugView.tsx:304 ff.`
- Aufwand: klein. **Gleich bleibt:** zugeklappt als Vorgabe.

### D3-9 Einkaufsliste am Handy: Auswahl „Großhändler wählen“ ragt 119 px links aus dem Blatt
- Ort: `/anforderungen?reiter=einkauf`, Verwaltung, 390, Blatt „Ohne Großhändler“.
- Ist: `select` 445 px breit bei x = −87 (so breit wie der längste Händlername); sichtbar bleibt „r wählen“.
  Bild `einkauf_voll_390.png`.
- Ursache: `Field.tsx:205` (`feld-breit`, `min-width: auto`) in `.zeile-rechts` der `Einkaufsliste.tsx`.
- Vorschlag: `min-width: 0` und volle Zeilenbreite unter 760 px. — Aufwand: klein. **Gleich bleibt:** am
  Schreibtisch Auswahl rechts neben der Zeile (dort 445 px, x = 259–704 bei 834).

### D3-10 Anforderungen am Handy: Zustand läuft ohne Auslassung über die Blattkante
- Ort: `/anforderungen`, 390, Zeilen mit „Einkaufsliste · Großhandel Muster GmbH & Co KG Wiener Neu“
  (`span.section-label.whitespace-nowrap`). Im Bild `anf_voll_390.png`; die Überbreite ist nicht gemessen.
- Soll: lange Namen bleiben lesbar oder kürzen sichtbar. — Aufwand: klein (umbrechen oder `truncate` mit
  vollem Namen im Fenster — dort steht er heute nicht; ergänzen).

### D3-11 Arbeitszeile neben der Blattflucht
- Ort: `/anforderungen` Laufend, 1440: Kästchen x = 292 (Flucht 296), Schrittknopf „Aus Lager“ endet bei 1384 (Flucht 1376).
- Ursache: Baustein `.arbeitszeile`, `src/styles/lot.css:187` (`padding: 0.5rem 1rem 0.5rem 0.5rem`).
- Vorschlag: Innenabstand an `--blatt-rand` binden. — Aufwand: klein, aber am Baustein: vorher jede Seite
  mit Arbeitszeilen neu messen. **Gleich bleibt:** 44-px-Tastfläche des Kästchens, Mehrfachauswahl.

### D3-12 Katalog einspielen (Probelauf): Abschluss frei auf dem Raster, Hauptaktion links
- Ort: `/lager?reiter=import` nach Datei, 1440. „4 Artikel übernehmen“ x = 272–456, „Verwerfen“ 464–569,
  unter dem letzten Blatt, nicht in einem Blatt oder einer Leiste. Bild `import_probelauf_1440.png`.
- Soll: „sekundäre Schritte stehen links“, Hauptaktion rechts (style.md, Radien und Bedienflächen; Speicherleiste).
- Ursache: `materials/KatalogImport.tsx:596–611`. — Aufwand: klein. **Gleich bleibt:** Fortschrittsanzeige
  darunter, „Weiter übernehmen“ nach Abbruch.

### D3-13 Mehr als eine gefüllte Hauptaktion; schwebende Aktion verdeckt das offene Formular
- Ist: `/invoices` mit offenem Formular: „Neue Rechnung“ (Kopf), „Positionen zusammenstellen“ und „Rechnung
  erstellen & PDF“ — drei gefüllte Knöpfe (alle `rgb(15, 69, 82)`). Am Handy schwebt „Neue Rechnung“ weiter
  über dem Formular, das sie geöffnet hat, und liegt auf „Rücklass“ (`inv_neu_pos_390_tabelle.png`). Ebenso
  `/lager` beim Einspielen: „Wareneingang“ + „4 Artikel übernehmen“.
- Soll: eine Hauptaktion je Kontext; „Keine Aktion doppelt“ (U3).
- Vorschlag: solange das Formular offen ist, entfällt die Kopf-Aktion; „Positionen zusammenstellen“ wird
  gerahmt („Neu zusammenstellen“), sobald eine Vorschau steht. — Aufwand: klein. **Gleich bleibt:** der
  Weg `?neu=`, „Neue Rechnung“ bei geschlossenem Formular an derselben Stelle.

### D3-14 Katalogzeile: Warnzeichen ohne Wort, Menge nicht in Mono
- Ort: `/lager?reiter=katalog`, 1440: `span.stand.stand-warn` „4 Stk“ 13 px DM Sans mit Dreieck, kein Wort.
  Im Reiter Bestand steht für denselben Artikel „knapp“ und „4 Stk frei“ in Mono.
- Soll: „Zustände als Text und sparsames Symbol“; Mengen in Mono. Ursache: `orders/MaterialCatalog.tsx`. — klein.

### D3-15 Kennwerte in Fenstern: drei Formen
- Ist: Rechnung 17 px Mono 500; Nachkalkulation 24 px Mono 500; Lager-Artikel 22 px **DM Sans** 500 („4 Stk“, „0“, „—“).
- Soll: Gemessenes in Plex Mono; eine Größe für den Kennwert im Fenster. Ursache: `.fenster-zahlen` (StockView)
  gegen `.rechnung-stand-betrag` und `.nachkalk-db`. — Aufwand: klein. **Gleich bleibt:** der eine große
  Deckungsbeitrag der Nachkalkulation darf größer bleiben (er ist die Auskunft des Fensters).

### D3-16 Überfälliger Liefertermin ohne Zeichen
- Ort: Einkauf und Laufend: „Liefertermin 20.11.2026 überschritten“ in der grauen Meta-Zeile (13 px, `--text-muted`).
- Soll: Zustand als Text **und** Symbol (U5). Der Filter `?filter=bestellt-ueberfaellig` kennt den Zustand,
  die Zeile zeigt ihn nicht. Ursache: `Einkaufsliste.tsx:463–464`, `lieferterminText`. — Aufwand: klein.

### D3-17 Maschinentext im Fehlerzustand
- Ist: „Cannot read properties of undefined (reading 'zeilen')“ und „genannt is not iterable“ als Meldung an
  die Person (in der Vorschau durch die Attrappen ausgelöst, der Weg ist echt).
- Ursache: `materials/OffeneLieferantenartikel.tsx:77` (`setFehler(e.message)` ohne `grundAus`);
  `src/lib/fehlerGrund.ts:36` lässt „… is not iterable“ / „… is not a function“ durch.
- Vorschlag: `grundAus` verwenden; `TECHNISCH` um `is not|iterable|properties` ergänzen. — Aufwand: klein.
  **Gleich bleibt:** deutsche Meldungen der Datenbank (`raise exception '…'`) kommen weiter wörtlich an.

## 3. Unstimmigkeiten zwischen Seiten

| Nr. | Sache | Fassung A | Fassung B (Fundort) | Vorschlag |
|---|---|---|---|---|
| D3-B1 | Betrag im Lauftext | Mono, rechts: Liste, Fenster, Nachkalkulation | DM Sans im Satz: Mahnlauf („2026-0231 · € 22 104,60 · 71 Tage“, 13 px), Kontoauszug 2. Zeile, Export („0 Rechnungen · Netto € 0,00“), Probelauf-Vorschau, Zusatz „(€ 13 501,00)“ | Regel festlegen: Betrag als eigener Wert → Mono rechts; im Satz darf DM Sans bleiben. Mahnlauf und Kontoauszug tragen den Betrag als Wert → Zahlenspalte |
| D3-B2 | Eurozeichen | davor: `euro()` („€ 32,00“) | dahinter: „Deckungsbeitrag je Facharbeiterstunde: 32,00 €“, „Pauschale 40 €“ (`SettingsView`), „78,00 €/h“ (gewollt, `euroBetrag`) | die zwei Sätze der Einstellungen auf `euro()` |
| D3-B3 | Tausendertrennung | Anzeige „€ 22 104,60“ (Leerzeichen; `Intl` de-AT ohne Währungsstil) | Kommentar in `betrag.ts:33` „€ 1.234,56“, Fehlermeldungen in `zahl.ts` sprechen vom „Tausenderpunkt“, Eingabe liest beides | einmal entscheiden und den Kommentar angleichen; kein Umbau ohne Entscheidung (Tests halten das Leerzeichen fest) |
| D3-B4 | Menge | „Name ×12“ (Laufend, `/material`) | „40 × Name“ (Einkauf), „4 Stk“ (Lager), „Menge 12“ ohne Einheit im Anforderungsfenster; nirgends Mono außer Lager-Bestand | eine Schreibweise: Zahl + Einheit in Mono rechts in der Zeile |
| D3-B5 | Zustandswort | groß: Offen, Überfällig, In Bearbeitung, Bezahlt | klein: knapp, fehlt (auch als Filter neben „Alle“), zugeordnet, prüfen, ohne Zuordnung, bestellt | groß wie `StatusBadge` |
| D3-B6 | Name der Sache | Seite „Anforderungen“, „Meine Anforderungen“ | Blatt „Offene Bestellungen“ (`AdminOrdersView.tsx:1140`), Leersatz „Keine offenen Bestellungen.“ | „Offene Anforderungen“; „Bestellung“ nur für das, was beim Großhändler bestellt ist |
| D3-B7 | „Inventur“ | Reiter „Inventur“ = Zähllisten | Seiten-⋯ „Inventur …“ und Fensterknopf „Inventur“ = Bestand **eines** Artikels berichtigen, Abschluss „Bestand buchen“ | Fenster/⋯: „Bestand berichtigen …“ |
| D3-B8 | Mahnen | Zeilenknopf „Mahnen“ | Fenster-⋯ „Mahnung erzeugen“, Dialogtitel „Mahnung — Kunde“, Abschluss „Erzeugen“ | Abschluss „Mahnung erzeugen“ |
| D3-B9 | freiwilliges Feld | „(freiwillig)“ (Einkauf, E-Rechnung) | „(optional)“ (Zählliste, Fahrzeug), Platzhalter „optional“ (Bestellnummer) | „(freiwillig)“ |
| D3-B10 | Verweis in die Einstellungen | „Einstellungen › Firmendaten“ | „Einstellungen › Betrieb“ viermal (`invoices/ebinterface.ts:423–431`; die Seite heißt Firmendaten); „→“ fünfmal, „›“ zehnmal; „Kundennummer“ / „Kd.-Nr.“ im selben Reiter | richtiger Seitenname, ein Pfeil |
| D3-B11 | Tabellenkopf | 12 px versal (Rechnungsfenster) | 15 px gemischt (Rechnung stellen); ohne Kopf (Sätze „So wird ein Monteur verrechnet“) | siehe D3-3 |
| D3-B12 | Abschnitt im Fenster | `h3` 15 px / 500 (Rechnung, Nachkalkulation) | `section-label` 12 px / 500 (Lager „Bewegungen“, Anforderung „Notiz“) | eine Form je Rolle: Abschnitt = 15/500, Dachzeile über einem Wert = 12 |
| D3-B13 | Gruppe im Blatt | Achse mit Zähler, versal (Rechnungen, Laufend) | `section-label` gemischt („Zu bestellen“, „Bestellt — noch nicht da“) | Achse auch im Einkauf |
| D3-B14 | Filter und Suche | im Blatt (`Listenleiste`: Rechnungen, Lager) | über dem Blatt auf der Reiterzeile (Anforderungen); am Handy stehen Filter und Suche überall **über** den Reitern, die sie betreffen | Reiter zuerst, Filter darunter — am Baustein, nach Messung aller Listen |
| D3-B15 | „Neu in dieser Liste“ | `NeuKnopf` (E76): Neues Material, Großhändler, Retoure | „+ Material“ gerahmt im selben Reiter; „+ Anzahlungskonto“, „+ Steuersatz“ (Kontenrahmen); „Warengruppe hinzufügen“; „Neue Zählliste“ | im Blattkopf immer `NeuKnopf`; Wortknöpfe ohne „+“ |
| D3-B16 | Pfeil an der Zeile, die ein Fenster öffnet | Rechnungen, Lager, Katalog | Anforderungen, Kontoauszug: kein Pfeil | Pfeil wie E99 |
| D3-B17 | Stempel im Titel | Nummer (Rechnung, Baustelle) | Datum (Kontoauszug-Zeile), Betrag (Fenster „Zuordnung“ `€ 99,99`) | Stempel nur für Nummern; Datum in die Meta-Zeile |
| D3-B18 | Kennzahl im Blatt | Leiste: 12 px versal + Mono 17 | Probelauf: „Artikel erkannt 4“ DM Sans 15/500 in einer Zeile | `Metric` im Blatt in Mono |
| D3-B19 | Formularbreite | Tabelle über 1080 px | Felder und Abschlussknöpfe nur in der linken Hälfte (560 px; „Rechnung erstellen & PDF“ endet bei x = 856 von 1376), ebenso alle Blätter der Einstellungen | siehe D3-C1 |
| D3-B20 | Zeilenaktion | ein gerahmter Knopf 48 px (Baustelle wählen, Mahnen, Aus Lager) | drei kleine Knöpfe 13 px / 44 px (Termin · Stornieren … · Geliefert …), Mülleimer, Kästchen mit Wort | siehe D3-C6 |

Bei allen: **gleich bleiben** Funktion, Rechte und Wege; es ändert sich Wort oder Form. Rückschritt wäre ein
Wort, das eine Prüfung (`tests/links/*.spec.ts`, `v10-abdeckung.md`) noch in alter Fassung sucht — vorher greppen.

## 4. Bedienung: durchgespielte Aufgaben

| Aufgabe | Tipps heute | Wo es stockt | Vorschlag |
|---|---|---|---|
| Monatsende: alle unterschriebenen Scheine verrechnen | 1 (Karte auf) + je Baustelle 3: „Baustelle wählen“, „Positionen zusammenstellen“, „Rechnung erstellen & PDF“ | „Baustelle wählen“ wählt nur und öffnet das Formular **unter** Mahnlauf; zusammengestellt wird erst auf den zweiten Knopf. Die Seite wird 3.288 px (1440) bzw. 4.318 px (390) hoch; nach dem Erstellen kein „nächste Baustelle“ | D3-C2 |
| Zahlungen vom Kontoauszug zuordnen | 5 (⋯, „Kontoauszug abgleichen“, Datei, „n Bewegungen verbuchen“, „Verbuchen“) + je Prüfzeile 1, je Handzuordnung 4 | Einstieg nur im ⋯; am Handy füllt eine Bewegung ein Drittel des Bildschirms; der Kunde steht zweimal in der Zeile, der Betrag zweimal | D3-C3 |
| Wer zahlt nicht? Mahnen. | 1 + je Kunde 2 (PDF); per Mail zusätzlich 4 (Zeile, ⋯, „… per Mail senden …“, Senden) | Erzeugen und Versenden sind zwei Wege an zwei Orten; kein Sammelschritt. Nach einem Fehlgriff im ⋯ ist das Fenster zu und nur eine Meldung da („Zu 2026-0231 ist keine Mahnung gespeichert.“) | D3-C4 |
| Export für die Steuerberatung | rollen bis ans Seitenende, 2 Daten (Vormonat), „Zeitraum zusammenstellen“, je Datei 1 | steht als letztes Blatt unter der Liste; der Vormonat ist nicht vorbelegt; drei getrennte Dateien | D3-C5 |
| Schlussrechnung mit zwei Anzahlungen | 7–9 (Neu, Baustelle, Art, Zusammenstellen, 0–2 Häkchen, Erstellen) | „Bereits verrechnet — abziehen“ steht **unter** Summen, Zahlung und „Position hinzufügen“: die Häkchen ändern Zahlen, die schon aus dem Bild gerollt sind | D3-C1 |
| Material aus dem Lager geben oder bestellen | Zeile „Aus Lager“ 1; Teilmenge: Zeile, „Teilweise aus Lager …“, Menge, Bestätigen; bestellen 3: Zeile, ⋯, „Nicht auf Lager – auf die Einkaufsliste“ | der Lagerbestand des Artikels steht weder in der Zeile noch im Fenster; „Nicht auf Lager“ nur im ⋯ | D3-C7 |
| Lieferung ist da | Reiter Einkauf, „Geliefert …“, Menge/Lieferschein, „Geliefert“ = 3–4 | „Stornieren …“ steht direkt neben „Geliefert …“; überfällige Lieferung nicht hervorgehoben | D3-C6 |
| Inventur im Fahrzeug am Handy | Lager, Inventur, „Neue Zählliste“, Ort, Anlegen, dann je Artikel 1 Feld | in der Vorschau nicht erreichbar (nur Code) | – |
| Neuer Preiskatalog vom Großhändler | Lager, ⋯, „Katalog einspielen“, Lieferant, Datei, Rabatte, „n Artikel übernehmen“ | keine Schrittanzeige; ein vierter Reiter „Einspielen“ erscheint und verschwindet; Vorschau ohne Preisvergleich; Rabattfelder 1.080 px breit für zwei Ziffern | D3-C8 |

## 5. Ideen: intuitiver, hochwertiger, näher an Apple

| Nr. | Idee — Nutzen | Ort | Aufwand | Gleich bleibt / Rückschritt merkt man an |
|---|---|---|---|---|
| D3-C0 | Vorschau liefert die drei dichten Bildschirme (Formen in `FEST` für die acht Attrappen, ein Großhändler, zwei Einkaufszeilen, eine Kontoauszug-Datei) — sonst sieht sie niemand vor dem Betrieb, und `schriftskala.spec` / `flucht.spec` prüfen sie nie | `tools/vorschau/stubs-erzeugen.mjs`, `daten.ts` | klein | nichts an der App |
| D3-C1 | Rechnung stellen als Arbeitsbereich in erkennbarer Folge: ① Baustelle und Art ② Positionen (Liste, „Position hinzufügen“ direkt darunter, Abzüge der Anzahlungen direkt darunter) ③ Angaben (Leistungszeitraum, Rabatt, Rücklass, Reverse Charge) ④ Summe und Abschluss. Am Schreibtisch rechts ein stehendes Blatt mit Netto · USt. · Brutto · Zahlbetrag und dem Abschlussknopf; am Handy dieselbe Summe als klebende Leiste über der Fußinsel. Titel „Entwurf“ statt „Vorschau“ | `InvoicesView.tsx:4064–5500` | groß | jedes Feld, jede Sperre (IBAN, Anschrift), die Reihenfolge der Prüfungen, `?neu=`; U2 erlaubt den Ablauf als eigene Seite. Rückschritt: ein Hinweis, der heute offen steht, ist nicht mehr im Bild, wenn der Knopf gesperrt ist |
| D3-C2 | „Verrechnen“ statt „Baustelle wählen“: stellt gleich zusammen (ein Tipp weniger je Baustelle) und rollt zum Entwurf; nach dem Erstellen bietet die Meldung „Nächste: {Baustelle}“ | `InvoicesView.tsx:3866–3874` | klein | Formular bleibt änderbar vor dem Erstellen; nichts wird ohne Blick ausgestellt |
| D3-C3 | Kontoauszug: Einstieg zusätzlich als Zweitknopf im Seitenkopf ab Tablet; Datei auch per Ablegen; Zeile einzeilig (Name · Zweck gekürzt · Rechnungsnummer als Stempel · Betrag rechts · Kästchen), Begründung im Fenster; Tastatur ↑ ↓ und Leertaste für das Häkchen | `KontoauszugView.tsx`, `RechnungenMenue.tsx` | mittel | Vorwahl nur bei „Zugeordnet“, Rückfrage vor dem Verbuchen, ⋯-Eintrag bleibt. Rückschritt: Grund der Zuordnung nicht mehr auffindbar |
| D3-C4 | Mahnen in einem Zug: der Dialog schließt mit „Erzeugen und senden“ (wenn „Belege per Mail“ eingerichtet ist) neben „Nur PDF“; im Mahnlauf „Alle ohne offene Entscheidung mahnen (n)“. Vorbehalt: Zinsen und Kundenart je Kunde — nur für Zeilen ohne Hinweis | `InvoicesView.tsx:3885 ff., 6481 ff.` | mittel | Einzelmahnung, Frist je Mahnung, PDF ohne Mail; nichts geht ohne Bestätigung hinaus |
| D3-C5 | Export: Segmente „Vormonat · Dieser Monat · Quartal“ vor Von/Bis (Vormonat vorgewählt bis zum 15.), Ergebnis als Liste der Dateien mit je einem Laden-Verweis; Einstieg auch im ⋯ des Seitenkopfs | `InvoicesView.tsx:5668 ff.` | klein | freie Daten, die drei Dateien und ihre Namen |
| D3-C6 | Einkaufsliste: je Großhändler **eine** Hauptaktion „Bestellen …“ (Blatt: PDF laden oder Mail senden, Liefertermin, „Bestellt“); bestellte Zeile ganz antippbar → Fenster mit „Geliefert“ rechts, „Termin“ links, „Stornieren“ im ⋯ (U4); überfällige zuerst mit Zeichen | `Einkaufsliste.tsx:440–500` | mittel | PDF ohne Bestellen bleibt möglich; Teillieferung; Storno mit Grund. Rückschritt: „Geliefert“ braucht mehr als zwei Tipps |
| D3-C7 | Anforderung: „4 Stk frei“ in Zeile und Fenster vor „Aus Lager“; „Auf die Einkaufsliste“ als gerahmter Zweitknopf im Fenster statt im ⋯, wenn der Bestand nicht reicht | `AdminOrdersView.tsx`, `AnforderungFenster.tsx` | klein bis mittel | Sammelleiste, Teilmenge, Rückfrage bei Fehlbestand |
| D3-C8 | Katalog einspielen: feste Schrittzeile „Datei · Probelauf · Übernommen“ statt wanderndem Reiter; Vorschau als Tabelle (Art.-Nr. · Bezeichnung · Einheit · Preis neu · bisher), Preise Mono rechts; Rabatt je Gruppe als 6-rem-Feld in der Zeile der Gruppe | `KatalogImport.tsx:463–611` | mittel | Lauf verwerfen, Fortsetzen, „Offene zuordnen“ |
| D3-C9 | Katalog: Verkaufs- und Einkaufspreis in der Zeile (Mono rechts) und im Formular offen für Rollen mit Preisrecht — heute hinter „Weitere Angaben“ | `MaterialCatalog.tsx` | klein | wer Preise nicht sehen darf, sieht sie weiter nicht |
| D3-C10 | Leerzustand mit erstem Schritt: „Noch kein Großhändler angelegt.“ und „Nichts auf der Einkaufsliste.“ tragen den Knopf dazu; „Material dazusetzen“ wird die Hauptaktion des Reiters Einkauf im Seitenkopf statt eines eigenen Blatts mit einem Knopf | `Einkaufsliste.tsx` | klein | Formular „Material dazusetzen“ unverändert |
| D3-C11 | Tastatur am Schreibtisch: Enter in der letzten Positionszeile legt die nächste an; Strg+Enter löst die Hauptaktion aus; Zahlungsdialog bestätigt mit Enter | Rechnung, Dialoge | klein | Enter im mehrzeiligen Bezeichnungsfeld bleibt Zeilenumbruch |
| D3-C12 | Betragsfelder der Einstellungen mit Einheit im Feld und rechtsbündig in Mono („78,00 €/h“) — wie die Tabelle direkt darunter | `SettingsView.tsx` (Sätze) | klein | gespeicherte Werte; Eingabe „78“ gilt weiter |
| D3-C13 | Querverweise: Lager-Artikel → „Nachbestellen“ (setzt auf die Einkaufsliste); Anforderungen → „Material anfordern“ im Seitenkopf fürs Büro; im Rechnungsfenster Baustelle und Kunde als Verweis (heute Text: im Fenster steht kein einziger Verweis) | `StockView.tsx`, `AdminOrdersView.tsx`, `RechnungDetail.tsx` | klein | Rechte je Rolle |

## 6. Nicht angesehen / nur im Code gelesen

- **Zählliste am Handy** (`/lager/inventur/:id`): Vorschau stürzt ab (`reading 'zustand'`). Gelesen:
  `ZaehllisteView.tsx`, `lot-material.css:259–271` — Zählfeld Mono 16 px, 48 px hoch, Segmente Offen · Gezählt · Alle.
- **Projektleiter mit `rechnungenLesen`** (`RechnungenLesen.tsx`): Vorschau zeigt „Kein Zugriff“.
- **„Klärung“ offener Rechnungsversuche**, Bankgarantie, Stornorechnung, „Storno aufheben“, Rückzahlung /
  Guthaben, Mahnung per Mail, „Per Mail senden“ (Dialog nicht geöffnet), Belegarchiv (in der Ansicht nur
  CSV und zwei BMD-Dateien gefunden), „Belege per Mail“ (`BelegMailEinstellungen`, nur Lage gelesen).
- **Lager:** „Offene Lieferantenartikel“ (nur Fehlerzustand), Lieferantenvergleich (in der Vorschau blieb „Wird geladen …“ stehen), Umlagern,
  Kommissionsware, Schritt „Übernommen“, Bestellvorschläge mit Daten, Fahrzeuge mit Daten, „Mein Fahrzeug“.
- **Anforderungen:** Retoure-Fenster, Teilmenge, Sammelleiste, Wischen am Handy, Rückfragen der Sammelaktionen.
- 375 px gar nicht; 834 px nur Rechnungen, Lager, Anforderungen; dunkel nur Rechnungsliste, -fenster, -formular.
- Lade- und Offline-Zustände; Kontrast im dunklen Satz nur an den Positionsfeldern gemessen.
