# Gegenprüfung: Büro — Geld und Material, Oberfläche (`analyse/11-oberflaeche-geld-material.md`) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740. Womit geprüft: Quelltext und Stile
gelesen (Datei:Zeile unten); Vorschau `localhost:5199` mit **eigenen** Playwright-Skripten bei
375, 390, 834, 1200 und 1440 px vermessen (`getBoundingClientRect`, `getComputedStyle`);
`leseZahl`/`zahlAlsText`/`preisAlsText` aus `src/lib/zahl.ts` in Node ausgeführt. Skripte, Ausgaben
und Bilder: `…/scratchpad/audit/pruef-d3/` (`r1.mjs` bis `r14.mjs`, `zahl.mjs`). Keine Zahl ist
aus dem Papier übernommen.

**Eingespeiste Daten.** „Rechnung stellen“, Kontoauszug und Einkaufsliste lassen sich auch von mir
nur mit im Browser ersetzten Attrappen öffnen (gegengeprüft, `r14.mjs`: ohne Ersatz „Die Positionen
konnten nicht geladen werden.“ bzw. „genannt is not iterable“). Ich habe **andere** Daten
eingespeist als der Autor (eigene CSV mit kurzen und langen Namen, eigene Einkaufszeilen, drei
Längen des Großhändlernamens: 15, 27, 46 Zeichen) und je Befund aus diesen drei Bildschirmen
festgehalten, ob er an der App oder an den Daten hängt.

## 1. Ergebnis in Zahlen

95 Punkte: D3-1 bis 17, D3-B1 bis B20, neun Aufgaben (A1–A9 in der Reihenfolge der Tabelle im
Papier), D3-C0 bis C13, D3-T1 bis T22, D3-P1 bis P13.

| Urteil | Anzahl |
|---|---|
| bestätigt (nachgestellt) | 59 |
| bestätigt (am Code) | 5 |
| teilweise | 29 |
| widerlegt | 1 |
| nicht prüfbar | 1 |

Zu den 29 „teilweise“: Bei 24 stimmt das gemessene Ist; es fehlt oder irrt die Ursache, die
Regelgrundlage, der Vorschlag oder „bleibt gleich“. Bei fünf ist ein Teil des Ists selbst eine
Folge der eingespeisten Daten oder falsch gelesen (A2/T11, T5, T21, D3-17, C11).

Kein „Fehler gegen die Linie“ (D3-1 bis 17) ist ein reines Kunstprodukt der eingespeisten Daten.
D3-9 und D3-10 treten aber **nur** bei langen Großhändlernamen auf (ab rund 32 bzw. 36 Zeichen).

## 2. Je Befund

### 2.1 Fehler gegen die Linie

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| D3-1 | **teilweise** | Nachgestellt: Tabelle 674,6 px in Hülle 326 px (390) und 624 px (834), `overflow-x: auto`; Summen-Zelle x 556–656,6 bei Sichtgrenze 358; Seite selbst schiebt nicht (`scrollWidth` 390). **Fehler der App, nicht der Daten:** Breite = Summe fester Feldbreiten (`lot-rechnungen.css:87` 10 rem, `:90` 6 rem, `:92` 6,5 rem, `:95` 7 rem) + Betrag `whitespace-nowrap` + 48-px-Knopf + 5 × 12 px Polster. **Ursache im Papier falsch:** ohne `min-w-[34rem]` bleibt die Tabelle 674,6 px (Gegenprobe im Browser). Das seitliche Rollen ist im Code als bekannt beschrieben (`InvoicesView.tsx:4562–4567`); das eigene Ziel „sechs Spalten auf ein Tablet“ (`lot-rechnungen.css:70`) ist bei 834 px nicht erreicht. | Handy-Form (gestapelte Zeile, Summen als Block) löst es. **Tablet-Vorschlag reicht nicht:** Einheit 6,5 → 4 rem spart 40 px, bleibt 634,6 > 624. Mit D3-2 (16 px) wird es nicht schmäler. `position-preis-fehlt` hält keine Prüfung fest (in `tests/` kein Treffer) — eigene „bleibt gleich“-Prüfung nötig. Fehlt: Titel-/Textzeilen (`colSpan 5`), Rabatthinweis „(aus dem Angebot)“ unter der Bezeichnung. |
| D3-2 | bestätigt (nachgestellt) | Felder 15 px, 44 px hoch, Rand `rgb(223,231,233)`, DM Sans; übrige Felder 16 px / 48 px / `rgb(194,210,213)`. Regel: E97 „jedes Eingabefeld 16 px“; `schriftskala.spec.ts:64–65` verlangt für `input,select,textarea` 16, öffnet das Formular aber nicht; der Unit-Wächter (`schriftskala.test.ts:87`) erfasst `.position-*` nicht. Die 15 px sind im Stil als Absicht beschrieben (`lot-rechnungen.css:68–72`), ohne Entscheidung in `entscheidungen.md`. iOS-Zoom selbst nur am Gerät prüfbar. | **Kein Fehler sind** 44 px (style.md: 44–48) und der Rand (`--border` nennt style.md selbst für „Felder“). Der Plan führt beides als Fehler („44 statt 48 px, schwacher Rand“). Wächter-Selektor um `.position-*` ergänzen, sonst kommt es wieder. |
| D3-3 | bestätigt (nachgestellt) | 1440: Zeilenbetrag und Summen DM Sans 15 px, rechte Textkante 1286,2; Zahlbetrag Plex Mono, Kante 1376 (90 px). Kopf 15 px / 400, nicht versal; im Rechnungsfenster `th` 12 px versal, Beträge Mono, Kante 1411. | „Bleibt gleich“ unvollständig: `tfoot` trägt außer „USt. 20 %“ auch Zwischensumme/Rabatt/Netto, „Übergang der Steuerschuld“ (Text in der Betragsspalte), „Gesamtleistung brutto“, „abzüglich … (netto + USt)“, „Restforderung brutto“, „Rechnungsbetrag“ (`:4693–4754`). Prüfungen suchen diese Wörter (`InvoicesView.test.tsx:1206, 3698–3769`). |
| D3-4 | bestätigt (nachgestellt) | `.fensteraktionen` 319 px in 438 px (x 973–1292, Inhalt bis 1411); 390: bis 335 von 374. Lager-Fenster: ⋯ 1013, Hauptaktion bis 1411. `lot-rechnungen.css:51`. | `flex: 1` genügt (wie `lot.css:328`). Der Plan macht daraus „Aktionen im Fuß“ (Paket 5, Schritt 4) — eine andere Lösung als das Papier; dann gehört „Lese-Fassung ohne Knöpfe“ (`aktionen.length > 0`) in dessen „bleibt gleich“. |
| D3-5 | bestätigt (nachgestellt) | `dl.fenster-zahlen` Unterlinie y 319, `.fuss-aktionen.fensteraktionen` Oberlinie y 339 (je 1 px). | Vorbild `lot.css:328`. Gehört zum Fuß-Baustein (Paket 5), steht aber nur über den Bereich „D3-1 bis D3-5“ in Paket 11. |
| D3-6 | **teilweise** | Nachgestellt: Feld `#z-betrag` zeigt „22104.6“ (1440 und 390); `InvoicesView.tsx:1306` `String(vorschlag)`. Gelesen wird über `leseZahl` (`:1379`) — der Wert stimmt, nur die Form nicht. Das „i“ steht bei x 525 / y 491 unter „Art“ (390: unter „Hinweis“). **Ungenau:** `zahlAlsText` liefert „22104,6“ — Komma, aber **nicht** zwei Stellen; so steht heute auch das Guthaben („200“, Prüfung `:5037`). Zwei Stellen liefert `preisAlsText` („22104,60“). | Siehe §3. Kurz: „22.104,60“ und „22 104,60“ liest das Feld richtig zurück (Node und Browser). Aber mit Tausenderpunkt wird jede Teilzahlung fehleranfällig: „22.104“ → „nicht eindeutig“. Empfehlung: `preisAlsText(cent(vorschlag))`, ohne Tausendertrenner. |
| D3-7 | **teilweise** | Nachgestellt mit eigenen Daten. 1440: Zustand beginnt 989 / 998 / 998 / 1126 / 1108; Betrag endet 1268 (mit Kästchen) bzw. 1360. 390: Betrag hinter dem Zustand, Kante 243 / 234 / 205 / 228 / 242, Zeilen 166–286 px; 375: ein Betrag bricht unter den Zustand, Zeile bis 334 px; 834 wie Handy. **App, nicht Daten.** **Regel:** U11 trägt nicht — style.md beschränkt sie ausdrücklich („Nur dort“, Baustellenliste); es trägt „Zahlen bleiben tabellarisch ausgerichtet“. **Ursache:** der Baustein `ListRow gestapelt` mit bloßem `wert` (`index.css:1206–1218`: Zustand fest 10,5 rem, Wert nach Inhalt, Aktionsspalte `auto`), nicht eine eigene Spaltenordnung. | Wird am Baustein berichtigt, trifft es Lager, Nachkalkulation, Baustellen- und Rechnungsliste (fünf Verwender) — gehört in „bleibt gleich“. Einfacher: `zeile-zahlen-betrag` (min. 7,5 rem) wie `InvoicesView.tsx:3396 ff.` und Platzhalter in Kästchenbreite. |
| D3-8 | bestätigt (nachgestellt) | `summary.weiteres-kopf` x 272 (1440) und 16 (390); Kartentitel x 296 / 32. | — |
| D3-9 | bestätigt (nachgestellt) | 390, Name 46 Zeichen: `select` 445 px bei x −87 (Blattinhalt ab 32, Blatt ab 16). **Hängt an der Namenslänge:** 27 Zeichen → 276 px, passt (x 82); 15 Zeichen → 204 px. Auslöser also ab rund 32 Zeichen. Ursache: Hülle `div` (`Field.tsx:205`) ohne `min-width: 0` in `.zeile-rechts`; `feld-breit` wirkt außerhalb eines `FormGrid` nicht. | Vorschlag geprüft: `min-width: 0` an der Hülle → `select` 32–358 px, im Blatt. Am Baustein `SelectField`: jede Auswahl in einer `ListRow` ist betroffen — mitmessen. |
| D3-10 | bestätigt (nachgestellt) | 390, 46 Zeichen: `span.section-label.whitespace-nowrap` 376 px breit, endet bei 408,5 (Inhalt bis 358, Blatt bis 374, `overflow: clip`) — 50 px abgeschnitten, ohne Auslassung. 27 Zeichen: 248 px, passt. Auslöser ab rund 36 Zeichen. | Der volle Name steht im Fenster nicht (bestätigt) — ohne die Ergänzung wäre `truncate` ein Verlust. |
| D3-11 | **teilweise** | Nachgestellt: Kästchen x 292 (Titel 296), „Aus Lager“ bis 1384 (Flucht 1376); `lot.css:187`. **Regel trägt nicht:** E98 legt die Flucht für Leer-, Lade- und Hinweissätze fest; `flucht.spec.ts` misst Zeilen nicht. Eine Unstimmigkeit (4 / 8 px), kein Fehler gegen die Linie. | `Arbeitszeile` wird nur in `AdminOrdersView` (und der Musterseite) verwendet — „jede Seite neu messen“ ist eine Seite. Am Handy gilt eine eigene Regel (`lot.css:207`), die bleiben muss; `bewegungen.spec.ts:1041 ff.` misst die Zeile. |
| D3-12 | bestätigt (nachgestellt) | 1440: „3 Artikel übernehmen“ 272–456, „Verwerfen“ 464–568, außerhalb jedes Blatts. Zusätzlich 390: beide über die volle Breite gestapelt, Hauptaktion oben — gegen `lot.css:320–324` („nicht mehr gestapelt in voller Breite“). `KatalogImport.tsx:596–611`. | Kein Schritt im Plan (nur Bereich in Paket 11). |
| D3-13 | bestätigt (nachgestellt) | Drei gefüllte Knöpfe `rgb(15,69,82)`: „Neue Rechnung“, „Positionen zusammenstellen“, „Rechnung erstellen & PDF“. 390/375: „Neue Rechnung“ schwebt (`.daumen`, fixed) über dem offenen Formular und deckt dessen Text. Lager: „Wareneingang“ + „3 Artikel übernehmen“. | „Positionen zusammenstellen“ suchen 18 Komponenten- und 10 Browserprüfungen, „Neue Rechnung“ 22 + 13 — Umbenennen („Neu zusammenstellen“) nur mit Liste in `v10-entfernt.json`. |
| D3-14 | bestätigt (nachgestellt) | `span.stand.stand-warn` „4 Stk“, 13 px DM Sans, kein Wort, kein `aria-label`; `MaterialCatalog.tsx:556`. | — |
| D3-15 | bestätigt (nachgestellt) | Rechnung 17 px Plex Mono; Nachkalkulation `.nachkalk-db` 24 px Plex Mono 500; Lager `.fenster-zahlen dd` 22 px DM Sans 500. | — |
| D3-16 | bestätigt (nachgestellt) | „Liefertermin 19.11.2026 überschritten“ in `.zeile-meta`, 13 px, `rgb(90,109,114)`, ohne Zeichen — Einkauf und Laufend. | — |
| D3-17 | **teilweise** | `OffeneLieferantenartikel.tsx:77` gibt `e.message` roh aus (nachgestellt: „Cannot read properties of undefined (reading 'zeilen')“); „genannt is not iterable“ geht durch `grundAus` durch (Kontoauszug nutzt es, `KontoauszugView.tsx:133`). **Falsch:** „… is not a function“ fängt `TECHNISCH` schon (`function` steht in der Liste, ausprobiert). **Umfang größer:** rund 20 weitere Stellen zeigen `e.message` roh (`KatalogImport.tsx:112, 170, 703, 717`, `Lieferantenvergleich.tsx:91`, `StockView.tsx:251`, `AdminOrdersView.tsx:489`, `InvoicesView.tsx:881` …). | Erweiterung um `is not\|iterable\|properties` ausprobiert: fängt den Fall; deutsche Gründe bleiben. In der echten App entsteht so ein Text nur aus einem Programmfehler — Schwere niedrig. |

### 2.2 Unstimmigkeiten zwischen Seiten

Alle 20 bestätigt. Nachgestellt (Text oder Messwert im Browser): B1, B2, B4–B8, B11–B20. Am Code:
B3 (`betrag.ts:21–35`; Anzeige mit geschütztem Leerzeichen U+00A0, Kommentar „€ 1.234,56“), B9, B10.

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D3-B1 | bestätigt (nachgestellt) | Mahnlauf-Zeile 13 px DM Sans; Export „0 Rechnungen · Netto € 0,00 · Brutto € 0,00“ | — |
| D3-B2 | bestätigt (nachgestellt) | „Deckungsbeitrag je Facharbeiterstunde: 32,00 €“, „Pauschale 40 €“, „78,00 €/h“ | — |
| D3-B3 | bestätigt (am Code) | wie oben | Betrifft D3-6: der Plan nennt „22.104,60“, die Formatierer liefern das nicht. |
| D3-B4 | bestätigt (nachgestellt) | „×12“, „8 × …“, „4 Stk“, Fenster „Menge 12“ | — |
| D3-B5 | bestätigt (nachgestellt) | Filter „Alle · knapp · fehlt“; „zugeordnet“, „prüfen“ | Kein Schritt im Plan; „knapp“ suchen Prüfungen. |
| D3-B6 | bestätigt (nachgestellt) | Blatt „Offene Bestellungen“ auf der Seite „Anforderungen“ | — |
| D3-B7 | bestätigt (nachgestellt) | Reiter „Inventur“; Seiten-⋯ „Inventur …“; Fensterknopf „Inventur“ → „Bestand buchen“ | „Inventur“ steht in 60 Komponenten- und 45 Browserprüfungen. |
| D3-B8 | bestätigt (nachgestellt) | ⋯ „Mahnung erzeugen“, Dialog schließt mit „Erzeugen“ | — |
| D3-B9 | bestätigt (am Code) | „(freiwillig)“ `Einkaufsliste.tsx:558, 610, 648, 946`; „(optional)“ an mehr Stellen als genannt (`Zaehllisten.tsx:199–217`, `LagerDialoge.tsx:663`, `RetoureFenster.tsx:395`, `LagerorteFenster.tsx:98`, `OrderView.tsx:847` …) | Umfang größer als im Papier. |
| D3-B10 | bestätigt (am Code) | `ebinterface.ts:423, 425, 428, 431`; Mahn-Dialog „Einstellungen → Rechnungsvorgaben“. Die Zählung „→ fünfmal, › zehnmal“ habe ich nicht nachgezählt. | — |
| D3-B11 | bestätigt (nachgestellt) | 12 versal / 15 gemischt; Sätze-Tabelle ohne `th` | — |
| D3-B12 | bestätigt (nachgestellt) | `h3.rechnung-lesetitel` 15/500; `h3.section-label` „Bewegungen“ 12/500 | — |
| D3-B13 | bestätigt (nachgestellt) | `section-label` 12 px, nicht versal | — |
| D3-B14 | bestätigt (nachgestellt) | Anforderungen 390: Filter y 174, Suche y 236, Reiter darunter. „Überall“ nicht geprüft (Rechnungen und Lager tragen Filter und Suche im Blatt). | — |
| D3-B15 | bestätigt (nachgestellt) | „+ Material“, „+ Anzahlungskonto“, „+ Steuersatz“, „Warengruppe hinzufügen“ | — |
| D3-B16 | bestätigt (nachgestellt) | Anforderungen, Kontoauszug: `zeile-pfeil` fehlt | — |
| D3-B17 | bestätigt (nachgestellt) | Datum als `zeile-nr`; im Fenster „Zuordnung“ `.stempel` „€ 7 488,00“ | — |
| D3-B18 | bestätigt (nachgestellt) | „Artikel erkannt“ 13/400, „3“ 15/500 DM Sans; Kopf 12 versal + Mono 17 | — |
| D3-B19 | bestätigt (nachgestellt) | „Rechnung erstellen & PDF“ endet bei 856; Felder der Sätze 296–856 | — |
| D3-B20 | bestätigt (nachgestellt) | drei Knöpfe 13 px / 44 px | — |

### 2.3 Durchgespielte Aufgaben

| Aufgabe | Urteil | Eigener Beleg |
|---|---|---|
| A1 Monatsende | bestätigt (nachgestellt) | Seitenhöhe 3.288 px (1440), 4.318 px (390), 4.390 px (375); Formular unter den Arbeitskarten (y 456); kein „Nächste“ im Code. |
| A2 Kontoauszug | **teilweise** | Einstieg nur im ⋯ (`RechnungenMenue.tsx:11`); Zeilenhöhe bestätigt. **„Kunde zweimal“ ist eine Folge der Daten:** siehe T11. |
| A3 Mahnen | bestätigt (am Code) | ⋯ mit sechs Einträgen (nachgestellt); die Tippzahl des Mail-Wegs nicht durchgespielt. |
| A4 Export | bestätigt (nachgestellt) | Letztes Blatt; vorbelegt ist der laufende Monat (01.11.–30.11.2026). |
| A5 Schlussrechnung | bestätigt (am Code) | Abzüge `InvoicesView.tsx:5003 ff.`, nach „Zahlung“ (`:4765`) und „Position hinzufügen“ (`:4814`). In der Vorschau nicht erreichbar (Rechnungsarten aus). |
| A6 Aus Lager / bestellen | bestätigt (nachgestellt) | Fenster ohne Bestand; „Nicht auf Lager – auf die Einkaufsliste“ nur im ⋯. |
| A7 Lieferung ist da | bestätigt (nachgestellt) | „Stornieren …“ neben „Geliefert …“. |
| A8 Inventur am Handy | **nicht prüfbar** | Vorschau stürzt ab; das Papier hat auch nur Code gelesen. Bräuchte Paket 9. |
| A9 Preiskatalog | bestätigt (nachgestellt) | vierter Reiter „Einspielen“; Rabattfelder 1.080 px breit. |

### 2.4 Ideen

| Kürzel | Urteil | Eigener Beleg | Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| D3-C0 | bestätigt (nachgestellt) | ohne Ersatz: Fehlerzustände (`r14.mjs`) | — |
| D3-C1 | **teilweise** | Ausgangslage bestätigt. | Siehe §3 — sieben Punkte, die „bleibt gleich“ nicht nennt; zwei davon widersprechen der Anordnung selbst. |
| D3-C2 | **teilweise** | „Baustelle wählen“ `:3866–3874` wählt nur. | Art und Konditionen stehen mit Absicht **vor** dem Zusammenstellen (`:4107–4111`). Sofort zusammenstellen heißt für Betriebe mit Rechnungsarten: erst falsche Art, dann neu. Der Weg `?neu=` (Startseite, Strg+K) stellt nicht zusammen — zwei Verhalten für dieselbe Absicht, wenn nur der Zeilenknopf geändert wird. 12 + 6 Prüfungen suchen „Baustelle wählen“. |
| D3-C3 | **teilweise** | — | „Zweitknopf im Seitenkopf“ einer Liste kennt `PageHeader` nicht (`action`, `mehr`, `nebenAktion`); U1 erlaubt `zweit` nur der Akte. Einzeilige Zeile: siehe T11. Widerspruch im Papier: C3 lässt den Zweck gekürzt in der Zeile, T11 schiebt ihn ins Fenster. |
| D3-C4 | **teilweise** | „Erzeugen“, zwei Wege bestätigt. | „Erzeugen und senden“ + „Nur PDF“ + „Abbrechen“ sind drei Knöpfe in einer Rückfrage (U4: höchstens zwei). „In einem Zug“ überspringt den Mail-Dialog (Empfänger, Text). „Alle … mahnen (n)“: Sammelmahnung vor dem Abgleich des Kontoauszugs mahnt, wer schon gezahlt hat; der Plan nennt nur die erste Hälfte, zählt C4 aber ganz — klarstellen. |
| D3-C5 | bestätigt (nachgestellt) | laufender Monat vorbelegt | Drei Dateien nur mit Daten sichtbar (`:5822–5881`). |
| D3-C6 | **teilweise** | drei Zeilenknöpfe bestätigt. | Eigenes Rückschritt-Maß verletzt: Zeile → Fenster → „Geliefert“ → Menge/Lieferschein → bestätigen sind drei Tipps statt zwei, außer das Fenster ist selbst der Lieferdialog. Fehlt in „bleibt gleich“: „Alles geliefert …“ (`Einkaufsliste.tsx:446`), „Termin ändern“, der Hinweis „Liste für eine E-Mail zu lang“, „Keine Bestelladresse — unten eintragen“. |
| D3-C7 | **teilweise** | Bestand fehlt in Zeile und Fenster. | Bestand gibt es seit T-16 je Lagerort — „4 Stk frei“ braucht den Ort. Die Liste kommt aus `anforderungen_laufend` (wird in Paket 1 angefasst); „frei“ ändert Paket 4 (M-11, M-13). Erst danach. |
| D3-C8 | bestätigt (nachgestellt) | — | Die Vorschau-Tabelle muss M-3 (Paket 4: „Einheit weicht ab“) aufnehmen; Handyform siehe P11. |
| D3-C9 | **teilweise** | Preise hinter „Weitere Angaben“. | Ein „Preisrecht“ gibt es nur für den Einkaufspreis: eigene Tabelle, nur die Geschäftsführung liest (`MaterialCatalog.tsx:98–105, 726`), geholt beim Öffnen eines Artikels. In der Zeile hieße das eine Abfrage je Seite — nicht „klein“. |
| D3-C10 | bestätigt (nachgestellt) | zwei Blätter vor der Liste | Widerspruch zu C13: beide wollen `PageHeader.action` von `/anforderungen` belegen. |
| D3-C11 | **teilweise** | — | **„Bleibt gleich“ ist sachlich falsch:** Enter im Bezeichnungsfeld ist heute **kein** Zeilenumbruch — `WachsendesTextfeld.tsx:59` verhindert ihn mit Absicht (Text steht so auf PDF und E-Rechnung), geprüft in `InvoicesView.test.tsx:6039–6046`. Strg+Enter stellt eine Rechnung unumkehrbar aus — nur bei Fokus im Formular und mit denselben Sperren. |
| D3-C12 | bestätigt (nachgestellt) | Felder DM Sans linksbündig, Tabelle Mono | Einheit als Beigabe, nicht als Wert: „78,00 €/h“ liest `leseZahl` nicht. |
| D3-C13 | bestätigt (nachgestellt) | Rechnungsfenster ohne `a[href]` | „Nachbestellen“ als dritter Knopf ginge gegen U4 — ins ⋯. |

### 2.5 Zu viel Text

Wörtlich geprüft sind alle 22 (Text der Vorschau bzw. Quelltext).

| Kürzel | Urteil | Wörtlich da? Eigener Beleg | Entbehrlich? Wo bliebe es? |
|---|---|---|---|
| D3-T1 | bestätigt (nachgestellt) | alle zehn Untertitel wörtlich (1440); am Handy fehlen sie | Den Mechanismus gibt es seit E86: ein Untertitel als bloßer Text steht am Handy in der Hilfe (`PageHeader.tsx:127–134`, `lot-planlinie.css:209`). **Falle:** der Dateiname des Kontoauszugs ist auch ein bloßer Text (`KontoauszugView.tsx:208`) und verschwände mit. Die Ausnahme braucht ein eigenes Merkmal. |
| D3-T2 | **teilweise** | wörtlich (`:5081–5084`) | Die Nummer ist noch nicht vergeben; als Stempel sähe sie vergeben aus. Bei der ersten Rechnung steht hier ein Eingabefeld (`:5069–5079`). |
| D3-T3 | **teilweise** | wörtlich (`:5124–5127`) | Der Satz ist der Schutz vor versehentlichem Einschalten einer Steuerfunktion (`:5113–5116`). Den Schalter bei „privat“ zu verbergen ist eine Funktionsänderung — nicht in Paket 8. |
| D3-T4 | **widerlegt** | wörtlich (`:4775–4800`) | Siehe §3: Befund G1 der Durchsicht vom 15.11.2026 hat genau diese festen Zeilen verlangt; eine Prüfung hält „keiner“ fest. |
| D3-T5 | **teilweise** | wörtlich für die Rolle Buchhaltung | Nur zwei sperren (IBAN ungültig, Anschrift des Kunden — `text-danger`). Die dritte (Firmenbuch) ist eine **Warnung** (`text-warning`, `:5386–5403`). Die Texte hängen an der Rolle (Verweis nur für die Leitung) — eine Zeile „Fehlt: … ›“ führte die Buchhaltung auf „Kein Zugriff“. |
| D3-T6 | bestätigt (nachgestellt) | Betrag viermal, Stand zweimal (unbezahlte Rechnung) | Der Kopf ist jung und gewollt (V10, Auftrag 11.5, `RechnungDetail.tsx:114–119`). Am „Offen“ des Kopfs hängt „fällig 13.09.2026“ — fällt „Offen“ weg, braucht die Fälligkeit einen Ort. |
| D3-T7 | **teilweise** | wörtlich | Beides zusammen streicht jede Aussage, dass nichts eingegangen ist. Eines von beiden. |
| D3-T8 | **teilweise** | wörtlich | Erste Hälfte entbehrlich. „versendet wird er von dir“ sagt, dass nichts hinausgeht; „Erzeugen“ sagt das nicht. Erst mit C4. |
| D3-T9 | bestätigt (nachgestellt) | wörtlich; drei Mängelzeilen bleiben | Hilfe im Dialog heißt `InfoHint` im Dialog. |
| D3-T10 | **teilweise** | wörtlich (`:263–283`) | Dasselbe Blatt trägt Konto, Zeitraum, „Nicht abgeglichen: …“ und die Warnung zu unlesbaren Zeilen — bleiben offen. „Erkannt: Buchungstag, Valuta, …“ ist die einzige Kontrolle der Spaltenzuordnung; eine falsch zugeordnete Spalte ist nicht „nicht gelesen“. |
| D3-T11 | **teilweise** | wörtlich | **„Kunde zweimal“ kommt aus den Daten:** der Titel ist der Name der Bank, die zweite Zeile der Kunde der Rechnung. Mit „WEG Hauptstr.“ als Auftraggeber stehen zwei verschiedene Namen da. Der Betrag rechts ist die Bewegung, der in der Zeile die Aufteilung (Skonto, Mahnkosten, mehrere Rechnungen). „Zugeordnet“ wird vorgewählt gesammelt verbucht; G-1 zeigt, dass der Abgleich die Rechnung eines fremden Kunden vorwählen kann — der Kundenname ist der sichtbare Schutz. |
| D3-T12 | bestätigt (nachgestellt) | Kennzahlen in allen Reitern | Kopf springt beim Reiterwechsel in der Höhe. |
| D3-T13 | bestätigt (nachgestellt) | wörtlich | — |
| D3-T14 | **teilweise** | drei Sätze wörtlich | „* Pflichtfeld“ ist der Baustein `Pflichthinweis` (`Field.tsx:80–87`, sieben Formulare) — bleibt. |
| D3-T15 | bestätigt (nachgestellt) | wörtlich | wie T9. |
| D3-T16 | bestätigt (nachgestellt) | wörtlich | — |
| D3-T17 | bestätigt (nachgestellt) | wörtlich | — |
| D3-T18 | **teilweise** | wörtlich | „Dafür zuerst die Baustelle wählen.“ begründet einen gesperrten Schalter — dieselbe Art Satz, die T14 ausdrücklich behält. |
| D3-T19 | bestätigt (nachgestellt) | wörtlich | „Zwischenstand“ bleibt an der Zahl im Fenster. |
| D3-T20 | bestätigt (nachgestellt) | „3 neu · 0 Änderungen · 0 Löschsätze · 1 andere Satzarten“ | — |
| D3-T21 | **teilweise** | drei Texte wörtlich | Die 33 Halbjahre stehen in einer zugeklappten Auswahl, nicht als Text. „Frühere anzeigen“ wäre ein zweites Bedienelement für ein Problem, das im Bild nicht besteht (Grundsatz 4). |
| D3-T22 | bestätigt (nachgestellt) | `KontoauszugView.tsx:254`; Mahn-Dialog; `ErrorBoundary.tsx:133` | Weitere Stelle: `InvoicesView.tsx:3640` („Ihrer Baustellen“). |

### 2.6 Statt der Punkte

Das heutige Muster ist bei allen 13 wörtlich bestätigt.

| Kürzel | Urteil | Trägt die vorgeschlagene Form bei 375 px und am Tablet? |
|---|---|---|
| D3-P1 | **teilweise** | Siehe §3: die Spaltenform passt nicht in die halbe Breite, die E98 dem Mahnlauf ab 1.200 px gibt. |
| D3-P2 | **teilweise** | Dieselbe halbe Breite (1200: 386 px). „Regie nur, wenn nicht Regie“ nimmt Regie als Normalfall jedes Betriebs an (gegen den Kopfsatz von `CLAUDE.md`). |
| D3-P3 | bestätigt (nachgestellt) | 1440: Textspalte 732 px, 1200: 492 px — eine Spalte „Fällig“ passt. 375 passt. Tablet: Zeile dort gestapelt, keine Form genannt. |
| D3-P4 | bestätigt (nachgestellt) | zwei Kennwerte nebeneinander passen bei 390 (wie `rechnung-stand`). |
| D3-P5 | bestätigt (nachgestellt) | — |
| D3-P6 | bestätigt (nachgestellt) | Probe mit 89 Zeichen Name + Stempel bei 375: Stempel bleibt sichtbar, Titel wird vierzeilig. |
| D3-P7 | bestätigt (nachgestellt) | Schreibtisch passt. Handy: drei Zeilen — mehr als Regel 5 des Plans (zwei). |
| D3-P8 | **teilweise** | 375: drei Zeilenknöpfe brechen heute schon in zwei Reihen (Zeile 195 px). Trägt erst mit C6 (Paket 11), steht aber in Paket 7. |
| D3-P9 | bestätigt (nachgestellt) | — |
| D3-P10 | bestätigt (nachgestellt) | „Lager: 4 Stk (knapp)“ bleibt als Angabe. |
| D3-P11 | **teilweise** | Tabelle mit fünf Spalten in 311–326 px: Art.-Nr., Einheit, Preis, Preisart und Abstände brauchen rund 310 px — für die Bezeichnung bleibt nichts. Derselbe Fehler wie D3-1. |
| D3-P12 | **teilweise** | Tablet passt. „Reihenfolge beim Tabben zeilenweise“ ist eine **Änderung** (heute erst alle Firmen-, dann alle Privatfelder, `SettingsView.tsx:1525–1556`). Mit „Pauschale 40 € nach § 458 UGB“ entfallen die drei Firmenfelder — das Raster verliert eine Spalte. |
| D3-P13 | bestätigt (nachgestellt) | — |

## 3. Nicht bestätigt — im Einzelnen

**D3-1 (teilweise).** Papier: Ursache `min-w-[34rem]`; Tablet: Einheit auf 4 rem, Tabelle ohne
Mindestbreite. Gefunden: ohne die Mindestbreite bleibt die Tabelle 674,6 px; der Tablet-Vorschlag
lässt 634,6 px in 624 px. Ändern: Ursache „feste Feldbreiten“; für das Tablet dieselbe gestapelte
Form bis 1.199 px oder schmälere Felder nachmessen.

**D3-6 (teilweise).** Papier: „Komma und zwei Stellen wie jedes Betragsfeld (`zahlAlsText`)“. Plan:
„über den Betragsformatierer (`22.104,60`)“. Gefunden:
- Das Feld liest heute über `leseZahl` (Text, `inputMode="decimal"`); „22104.6“ wird richtig gelesen.
- `zahlAlsText(22104.6)` = „22104,6“; `preisAlsText` = „22104,60“; `euroBetrag` = „22 104,60“ mit
  geschütztem Leerzeichen. „22.104,60“ erzeugt kein Formatierer des Repos.
- Zurückgelesen werden „22.104,60“, „22 104,60“ und „22104,60“ richtig (Node und im Feld, kein Fehler).
- Mit Tausenderpunkt wird die Teilzahlung zur Falle: aus „22.104,60“ wird beim Kürzen „22.104“ →
  „nicht eindeutig: 22104 oder 22,104?“ (im Feld nachgestellt). `zahl.ts:98` legt fest: ins Feld
  „Komma, ohne Tausenderpunkt“.
- Prüfungen halten heute „100“ (`InvoicesView.test.tsx:5538`, „Gleichbleiben“) und „200“ (`:5037`,
  `:6526`) fest. Zwei Stellen ändern sie bewusst — für Eingang und Rückzahlung gleich.

Ändern: im Plan `preisAlsText(cent(vorschlag))` → „22104,60“; „bleibt gleich“ um die drei Prüfungen
und „kein Tausendertrenner im Feld“ ergänzen.

**D3-7 (teilweise).** U11 streichen; Ursache „Baustein `ListRow gestapelt`“; fünf Verwender nennen.

**D3-11 (teilweise).** Als Unstimmigkeit führen, nicht als Fehler gegen die Linie.

**D3-17 (teilweise).** „is not a function“ streichen; die übrigen Stellen mit rohem `e.message` aufnehmen.

**A2 / D3-T11 (teilweise).** Im Papier und in Plan §5 („Kontoauszug-Zeile: Kunde zweimal, Nummer
dreimal“) berichtigen: Auftraggeber laut Bank und Kunde der Rechnung sind zwei Angaben. Bleiben
muss in der Zeile: Kunde der Rechnung, die Aufteilung bei mehr als einem Teil, Skonto, Mahnkosten.

**D3-C1 (teilweise).** Was an der heutigen Anordnung hängt und in „bleibt gleich“ fehlt:
1. **Leistungszeitraum vor den Positionen.** „Leistung bis“ ist bei Regie der Stichtag; wer ihn
   ändert, bekommt „Bis … neu zusammenstellen“ — „Eigene Änderungen an den Positionen gehen dabei
   verloren“ (`:4281–4290`, `:4348–4372`). C1 legt ihn in Schritt ③ hinter die Positionen; der
   Plan nennt ihn gar nicht.
2. **Konditionen vor dem Zusammenstellen.** Stundensätze, Zuschläge und USt-Satz bestimmen die
   Positionen (`:4168–4231`). Der Plan zieht Zahlungsziel und Skonto nach ③ — das Blatt würde geteilt.
3. **Zwölf Sperrgründe, nicht „IBAN, Anschrift“** (`:5480–5490`): ungeklärter Rechnungsversuch,
   Nummer vergeben oder leer, Reverse Charge ohne UID, Steuerbefreiung ohne Grund, UID-Form,
   Abzüge über der Leistung, keine Positionen oder null Euro, Zeitraum fehlt oder verdreht,
   Firmendaten, Empfänger. Dazu fünf Warnungen ohne Sperre und „Als Schlussrechnung stellen“.
4. **Wege, die niemand nennt:** Ersatz („Stornieren und neu ausstellen“, Hinweis „Ersetzt …“,
   `:4074–4083`), Anzahlung mit Anteil vom Angebot, die Vorschläge „Aus der Wartung“, „Ausgegeben,
   nicht auf einem Schein“, „Zurück, aber schon verrechnet“, der Abgleich Scheine gegen Buchungen,
   die erste Rechnungsnummer als Feld, `fieldset disabled` während des Ausstellens.
5. **„Entwurf“ statt „Vorschau“.** „Entwurf“ heißt im selben Blatt der Schein („ist noch Entwurf“,
   `:4886`) und klingt nach gespeichert — die Vorschau ist es nicht. „Vorschau“ steht in Meldungen
   (`:5423–5424`), in 188 Zeilen der Komponentenprüfung, im Handbuch und in der Meldung, die
   Paket 2 neu einführt („Vorschau neu laden“).
6. **Stehendes Blatt rechts.** Bei 1.200 px ist der Inhalt 888 px breit; neben einem Blatt von
   320 px bleiben 568 px für eine Tabelle, die 675 px braucht.
7. **Klebende Summenleiste am Handy** stapelt sich mit Timer-Leiste und Fußinsel und nimmt Platz
   bei offener Tastatur.

Tastatur heute: Enter tut in Positionsfeldern nichts; es gibt keine Kurzbefehle im Formular.
Prüfungen: 371 Fälle in `InvoicesView.test.tsx`, `rechnungStellen.spec.ts`, `eRechnung.spec.ts`,
`bewegungen.spec.ts`.

**D3-C11 (teilweise).** „Enter bleibt Zeilenumbruch“ ersetzen durch „Enter fügt weiter keinen
Zeilenwechsel ein“.

**D3-T4 (widerlegt).** Papier: „Skonto keines“, „Rücklass keiner“ und ein Zahlbetrag gleich Brutto
seien entbehrlich. Gegenbeleg: `docs/durchsicht-2026-11-15/plan.md:102`, Befund G1 (hoch, erledigt
§97): „Zahlungsziel, Skonto, Rücklass und Zahlbetrag als **feste** Zeile unter den Summen“; im Code
`InvoicesView.tsx:3072–3077` und `:4758–4763` („nach dem Ausstellen ist all das eingefroren“);
Prüfung `InvoicesView.test.tsx:6298–6306` verlangt „keiner“. Ändern: T4 streichen; in Plan §5
(Muster 4) und Paket 11 („③ … nur Abweichungen offen“) herausnehmen.

**D3-T5 (teilweise).** „Drei Sperrgründe“ → zwei Sperrgründe und eine Warnung; Rollenabhängigkeit nennen.

**D3-T2, T3, T7, T8, T10, T14, T18, T21 (teilweise).** Je der in §2.5 genannte Satz oder Teil bleibt.

**D3-P1 (teilweise).** Gemessen: Inhalt der Mahnlauf-Zeile 506 px (1440), 386 px (1200), 624 px
(834). Stufe 140 + „71 Tage“ 63 + Betrag 99 + Knopf 74 + Abstände 48 = 424 px; für Name und
Stempel bleiben 82 px (1440) bzw. nichts (1200) — gebraucht werden 179 bis 479 px. Die Form geht
nur, wenn der Mahnlauf wieder die ganze Breite hat; das hat E98 fünf Tage vorher anders festgelegt.
Am Handy ergibt die Skizze drei Zeilen plus Warnsatz plus Knopf.

**D3-P2, P8, P11, P12; D3-C2 bis C4, C6, C7, C9 (teilweise).** Wie in §2.4 und §2.6.

**A8 (nicht prüfbar).** Braucht die Zählliste in der Vorschau (Paket 9).

## 4. Zum Plan

**Falsche oder ungenaue Kurztexte**
- §1.2 und Paket 2, D3-6: „(`22.104,60`)“ — siehe §3. „Bleibt: das Feld liest beide Schreibweisen“
  stimmt, schützt aber nicht vor „22.104“.
- §4.2, D2-A3 / D3-4: „Linie 159 bzw. 319 px kurz“ — für D3-4 ist die Reihe 319 px **lang** in
  438 px, also 119 px zu kurz.
- §4.2, D3-2: „44 statt 48 px, schwacher Rand“ sind keine Fehler gegen die Linie.
- §5, Muster 2: „Kontoauszug-Zeile: Kunde zweimal“ — Folge der eingespeisten Daten.
- §5, Muster 4 und „Ausdrücklich bleiben“: T4 widerspricht G1 vom 15.11.; von den „Sperrgründen“
  ist einer eine Warnung.
- §6, Tabelle „Feste Spalten am Schreibtisch“: das Beispiel Mahnlauf passt nicht in E98.

**Pakete**
- **Sieben der 17 Fehler haben keinen Schritt:** D3-5, D3-8, D3-10, D3-11, D3-12, D3-14, D3-15
  stehen nur im Bereich „D3-1 bis D3-5, D3-7 bis D3-16“ von Paket 11. D3-5 und D3-11 sind
  Bausteine (Paket 5); D3-8 ist vermutlich eine der „vier gemessenen Stellen“ in Paket 5 — nennen.
- **Doppelt zugeordnet:** D3-4 (Pakete 5 und 11), D3-C2, C7, C10, C13 (11 und 14), D3-C12 (11 und 16).
- **Dieselbe Stelle dreimal angefasst:** die Kontoauszug-Zeile in Paket 7 (Punkte), Paket 8
  (Doppeltes) und Paket 11 (einzeilig); ebenso „Rechnung stellen“ (T2–T5 in Paket 8, dann Umbau in
  Paket 11) und die bestellte Einkaufszeile (P8 in Paket 7, C6 in Paket 11). Besser alles in Paket 11.
- **Fehlende Voraussetzungen:** Paket 9 vor Paket 11 ausdrücklich nennen (sonst sieht niemand die
  drei Bildschirme, und `schriftskala.spec`/`flucht.spec` prüfen sie nicht); D3-C7 nach Paket 4
  und Paket 1; D3-C8 nach M-3.
- **Paket 8, Schritt 2:** am Baustein `PageHeader` umgesetzt, verschwände der Dateiname des
  Kontoauszugs mit (siehe T1).
- **Paket 6:** D3-B5 hat keinen Schritt; D3-B9 und D3-17 sind größer als im Papier.

**Vorschläge, die etwas entfernen oder schwerer erreichbar machen würden**
- T4 / Paket 11 ③: nimmt die feste Auskunft über Skonto, Rücklass und Zahlbetrag vor dem Ausstellen.
- T11 / C3: nimmt der vorgewählten Sammelverbuchung den Kunden der Rechnung und die Aufteilung.
- C1 ③: Leistungszeitraum hinter den Positionen kostet eigene Änderungen beim Neu-Zusammenstellen.
- C6: „Geliefert“ rückt einen Tipp weiter weg; „Alles geliefert …“ ist nicht genannt.
- C4: Mahnung per Mail ohne Blick auf Empfänger und Text.
- T3: Schalter „Bauleistung“ bei Kundenart „privat“ verborgen — bei falscher Kundenart ein Umweg.

**Widersprüche zwischen Vorschlägen:** C10 gegen C13 (Hauptaktion von `/anforderungen`); C3 gegen
T11 (Zweck in der Zeile oder im Fenster); P1, P7 und P8 am Handy gegen Regel 5 aus §5 (zwei
Textzeilen); P1 und P2 gegen E98.

## 5. Geklärte Verdachtsfälle

Das Papier führt keinen eigenen Abschnitt. Nebenbei geklärt: Die Sorge, ein Stempel hinter einem
langen Namen werde abgeschnitten, trifft nicht zu (Probe bei 375 px, `r11.mjs`).

## 6. Nicht geprüft

- Dunkler Satz (im Papier: Rand der Positionsfelder).
- iOS-Zoom am Gerät; WebKit überhaupt (nur Chromium).
- Rechnungsarten (Anzahlung, Teil-, Schlussrechnung), Ersatz, Klärung im Browser — nur am Code.
- Zählliste, Retoure-Fenster, Sammelleiste, Lieferantenvergleich, Bankgarantie, Stornorechnung.
- Die Zählungen „→ fünfmal, › zehnmal“ (B10) und die Punktzählung zu Beginn von §8 des Papiers.
- Aufwandsschätzungen im Einzelnen; aufgefallen sind nur C9 („klein“) und C7.
- Die Tippzahlen der Aufgaben A3 und A5 habe ich nicht durchgespielt.
