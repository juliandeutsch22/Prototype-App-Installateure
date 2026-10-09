# Abnahmeblatt R4-B – Einsatzplanung (Seite, Woche, Seitenfenster „Tag“, Termine)

```text
Paket:              R4-B „woche“ (Auftrag Abschnitt 4.1–4.9, Bausteine aus Abschnitt 6)
Stand / Tag:        Arbeitsbaum Paket B auf ui-lot-r4 e91a3ce, noch nicht zusammengeführt
Bestandsvergleich:  34 Einträge in docs/ui-umbau/r4/zuordnung-woche.json, 0 ohne neuen Ort,
                    kein altes Element mehr als 1 Klick weiter (+1: Tageskopf → „Tag planen“,
                    „Noch einzuplanen“, „Ganzen Tag in ‚Tag planen‘ öffnen“, Baustellenkarten
                    der Handy-Tagesliste → Seitenfenster „Tag“). Zuordnung von Hand aus dem Code.
Rechte:             unverändert: Routen, RequireNav, `einplanbar`, Termine schreiben nur mit
                    `darfTermineSchreiben` (sonst Leseansicht), Abwesenheitsart wie geliefert,
                    Kalender-Abo nur mit Erlaubnis und nicht im Supportzugang. Verwaltung sieht
                    die Einsatzplanung weiter nicht. Datenbank-Gegenproben: nicht gelaufen (Vorgabe).
Prüfungen:          tsc grün, lint grün; 20 Testdateien / 367 Prüfungen grün (WochenplanView 64,
                    AssignmentsView 50, TeamWoche, TerminFenster, UnterreiterOhneLeiste,
                    wochenTermine, planungKopf, Lot-Wächter, r4Referenz u. a.). Neun Gegenproben
                    durch gezieltes Verfälschen des Codes: alle rot.
                    Browser-Wege (Chromium/WebKit): nicht gelaufen (Vorgabe, Hauptsitzung).
Breiten:            390 / 834 / 1440 / 1920 in der Vorschau, hell und dunkel: scrollWidth − innerWidth
                    = 0 überall. Bei 834 rollt das Raster in sich (752 / 692 px, Mindestbreite laut
                    Auftrag 132 + 6 × 96 + 44), die Seite nicht.
Belege/Exporte:     nicht berührt; Kalender-Abo (ICS) prüfsummengleich (tests/unit/r4Referenz.test.ts grün).
Mengengerüst:       nicht gemessen (kein Testbestand 25 Personen) – offen. Keine neue Abfrage;
                    Termine werden nach Anlegen/Ändern/Löschen mit derselben Abfrage neu geladen.
Bedienbarkeit:      jede Zelle, jeder Block, jeder Termin-Eintrag und jeder Tageskopf ist ein Knopf
                    mit Vorlesenamen (Person, Tag, Zustand); Esc schließt das oberste Fenster
                    (BottomSheet/istOben); axe: offen.
Rückgängig:         keine neuen Umkehrungen; „Einsatz löschen“ und „Termin löschen“ mit Rückfrage.
Bildschirmfotos:    docs/ui-umbau/r4/nachher/ (siehe unten).
Dokumentation:      Handbuch nicht nachgezogen (gemeinsame Datei) – Textvorschlag im Bericht.
Freigabe Betreiber: erteilt (09.10.2026)
```

## Abnahme R4-B (Auftrag 4.9)

- [x] **Jeder Termin ist erreichbar und öffnet „Termin ändern“ bzw. die Leseansicht.**
  Test „JEDER TERMIN DER WOCHE IST ERREICHBAR“ (WochenplanView.test): Termin mit Teilnehmer im
  Raster, nur an der Baustelle, ohne Baustelle, mit Teilnehmer außerhalb des Rasters — je über
  „N Termine“ im Kopf → Seitenfenster „Tag“ → „Termin ändern“. Termine von Teilnehmern im Raster
  zusätzlich als Eintrag in deren Zelle (eigener Test). Leseansicht: TerminFenster.test.
  Am Testbestand der Datenbank (Skript über alle Termin-IDs): offen.
- [x] **Bei 1.440 und 1.920 px ist kein Kundenname abgeschnitten** — gemessen in der Vorschau:
  16 `.e-titel`, `scrollWidth ≤ clientWidth` bei 834, 1440 und 1920 (auch „Wohnungseigentümer-
  gemeinschaft Hauptstraße 112–118“). Hinweis: Chromium unter Linux trennt ohne Wörterbuch
  nicht mit Strich, sondern bricht im Wort (`overflow-wrap`); auf Windows/macOS/Android greift
  `hyphens: auto` mit `lang="de-AT"`.
- [x] **„Noch einzuplanen“ liefert dieselbe Menge wie vorher** — gleiche Rechnung (laufende
  Baustellen ohne Einsatz in der Woche); Test mit 24 Baustellen, einer mit Einsatz in der Woche,
  einer nur in der Vorwoche, 20 + „und 3 weitere anzeigen“.
- [x] **„Tag“ zeigt die bisherige Seite vollständig, `/assignments/tag` funktioniert direkt** —
  AssignmentsView.test (50 Prüfungen, darunter Kopf, Umschalter, Reihenfolge der Hinweise),
  UnterreiterOhneLeiste.test (Adresse direkt, `/assignments` → Woche).
- [x] **Wochenende und Feiertag schmal, wenn leer, breit mit Einsatz oder Termin** — Notdienst am
  Samstag der Vorschau: Samstag breit, Sonntag schmal (Foto 1440/1920); Tests mit Notdienst am
  Samstag und Termin am Sonntag; Feiertag (Nationalfeiertag) in wochenTermine.test.
- [x] **Kalender-Abo (ICS) unverändert** — r4Referenz.test grün; KalenderAboKarte unverändert.
- [x] **Rechte** — Projektleiter, Geschäftsführung, Administrator wie heute (Fotos Projektleiter,
  Geschäftsführung, Administrator dunkel); Verwaltung: Navigation unverändert (LEAD).
  Datenbank-Gegenprobe: offen.

## Abschnitt 8 (Browser-Wege, die dieses Paket betreffen)

| Weg | Stand |
|---|---|
| 3. Woche → Termin-Eintrag → „Termin ändern“ → Zeit ändern → speichern | im Komponententest bis zum Formular und Löschen; Speichern im Browser: offen |
| 4. Woche → Tageskopf „Lieferung ohne Annahme“ → „Tag“ → „Einsatz planen“ → speichern | Teile im Komponententest (Hinweis, Gegenprobe mit Einsatz, „Einsatz planen“ aus „Tag“); ganzer Weg im Browser: offen |
| 6. Monat → „Zur Woche“ → richtige Woche, Tag markiert, „Zurück“ in den Monat | Komponententest über `onTag` (heutiger Monat); „Zur Woche“ aus der Vorschau baut Paket C |

## Fotos nachher (`docs/ui-umbau/r4/nachher/`)

- `woche-projektleiter-{390,834,1440,1920}.jpg` (vorher: `vorher/woche-projektleiter-*`)
- `tag-projektleiter-{390,834,1440,1920}.jpg` (vorher: `vorher/tag-projektleiter-*`)
- `teamwoche-mitarbeiter-{390,834,1440,1920}.jpg` — wie vorher: die Vorschau hat den Schalter
  „Wochenplan für alle“ aus und zeigt „Mein Einsatzplan“; die Team-Woche selbst prüft der
  DOM-Vergleich.
- `woche-fenster-tag-projektleiter-{390,834,1440}.jpg`, `woche-fenster-einsatz-projektleiter-1440.jpg`,
  `woche-fenster-termin-projektleiter-1440.jpg`, `woche-fenster-noch-projektleiter-1440.jpg`
- `woche-baustellen-projektleiter-{834,1440}.jpg`, `woche-geschaeftsfuehrung-1440.jpg`,
  `woche-dunkel-administrator-{390,1440}.jpg`, `muster-planung-administrator-1440.jpg`

In der Vorschau dieses Arbeitsbaums lädt die Schrift Poppins nicht (403, `node_modules` ist
verlinkt); die Fotos zeigen die Ersatzschrift.

## Offen

- Mengengerüst (25 Personen, 120 Einsätze, 60 Termine), Messwerte Abschnitt 7.
- Browser-Wege 3, 4, 6 in Chromium und WebKit; axe.
- Handbuch „Planung: der Wochenplan ist die Planungsseite“, „Termine und Aviso“, „Was noch offen ist“.
- Freigabe des Betreibers.
