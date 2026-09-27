# Umsetzung der Designlinie „Fassung 3“ – Arbeitsplan

Für wen: ein Modell oder eine Person, die die Linie aus
`docs/design/linie.md` in die App bringt, ohne den Chat zu kennen, in dem
sie entstanden ist. Lies zuerst `linie.md` ganz, dann diese Datei.

## 0. Grundregeln (gelten für jeden Schritt)

1. **Nur Darstellung.** Keine Änderung an Datenschicht (`src/lib/db`),
   Migrationen (`supabase/`), Edge-Funktionen, Routen, Texten,
   `data-testid`, `aria-label`, Formularlogik.
2. **Nichts verschlimmbessern.** Was heute funktioniert, funktioniert
   danach gleich. Wenn eine Stelle nicht sicher in die Linie passt: so
   lassen und unter „Offen“ in `docs/design/fortschritt.md` eintragen.
3. **Kleine Schritte.** Ein Pull-Request je Schritt unten (Schritt 1 darf
   nicht mit anderen gemischt werden). Commit-Meldungen deutsch, im
   Präsens, mit dem Schritt im Titel, z. B.
   `Designlinie 3, Schritt 2: Monteur-Start in zwei Karten`.
4. **Vor jedem Push** lokal grün:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
   Node 20 verwenden (die CI läuft mit Node 20; `navigator` gibt es dort
   nicht global).
5. **Bilder prüfen** (Abschnitt 2 unten) auf 375, 390, 834 und 1440 px.
   Nichts läuft waagrecht über; Text bricht sauber um.
6. **Tests anpassen, nicht abschwächen.** Wenn ein Test eine Klasse oder
   Struktur prüft, die sich durch die Linie ändert (z. B. `divide-y` in
   `List`), wird der Test auf die neue Struktur gestellt. Ein Test, der
   Verhalten prüft (Texte, Klicks, Aria), darf nicht geändert werden;
   wenn er rot wird, ist der Umbau falsch.
7. **Mergen nur mit grüner CI** (alle drei Workflows: „Typen, Lint und
   Tests“, „Durchklick“, „Supabase-Migrationen“). Nach dem Merge auf
   `main` deployt die CI selbst.
8. Der lokale Supabase-Stapel muss dafür nicht laufen; Datenbank- und
   Browsertests laufen in der CI des Pull-Requests.

## 1. Die Schritte

Jeder Schritt nennt Dateien, was zu tun ist und was zu prüfen ist. Die
Klassen und Werte stehen in `linie.md`, Abschnitt 6 und 7.

### Schritt 1 · Bausteine (eine PR, ohne Ansichten)

**Dateien:** `src/index.css`, `src/components/PageHeader.tsx`,
`src/components/Card.tsx`, `src/components/ListRow.tsx`,
`src/components/Metric.tsx`, `src/components/Badge.tsx` (`Zustand`),
`src/components/StatusBadge.tsx`, `src/components/Button.tsx`,
`src/components/Field.tsx`, neu `src/components/Abschnitt.tsx`,
neu `src/components/Aktionsleiste.tsx`, neu `src/components/Hinweiszeile.tsx`,
neu `src/components/Kennzahlen.tsx` (oder `Metric.tsx` erweitern),
`src/app/Layout.tsx` (nur `--reiter-hoehe`).

**Tun:**
1. Die drei Radius-Tokens ändern (`linie.md` § 4).
2. Den CSS-Block aus `linie.md` § 6 in `@layer components` einfügen.
3. `body { overflow-wrap: anywhere; hyphens: auto; }` ergänzen.
4. Komponenten wie in `linie.md` § 7 umstellen. Signaturen (Props) bleiben
   gleich oder werden nur erweitert (z. B. `pfeil?: boolean` an `ListRow`).
5. Neue Komponenten:
   - `Abschnitt({ titel, anzahl?, link?, children? })` → `<div class="abschnitt">`.
   - `Aktionsleiste({ summe?: { name, wert }, links, rechts })` →
     `<div class="aktionsleiste">…`; `links` ist der Neben-, `rechts` der
     Hauptknopf. Am Schreibtisch steht sie rechtsbündig ohne Rand.
   - `Hinweiszeile({ stufe?: 'warn' | 'fehl', children })` mit Symbol aus
     `Icon.tsx` (Dreieck bei warn/fehl, Kreis-i sonst).
   - `Kennzahlen({ children })` = Leiste; `Kennzahl({ name, wert, zusatz?, ton?, to? })`.
     Wenn `Metric`/`MetricRow` direkt umgestellt werden, sind die neuen
     Komponenten nicht nötig.

**Prüfen:** `npm test` grün; besonders `tests/components/Metric.test.tsx`,
`Tastflaechen.test.tsx`, `Abzeichen.test.tsx`, `Layout.test.tsx`,
`tests/unit/kontrast.test.ts`, `tests/unit/infoHintUmbruch.test.ts`.
Vorschau aller Routen (Abschnitt 2): weil die Bausteine überall wirken,
zeigt sich hier schon, ob etwas kippt. Alles muss weiter lesbar sein,
auch wenn die Ansichten noch nicht umgebaut sind.

### Schritt 2 · Monteur-Start

**Datei:** `src/features/dashboard/DashboardView.tsx` (Mitarbeiter-Zweig),
`dashboard/LaufWarnung.tsx`, `dashboard/WartungHinweis.tsx`.
**Vorlage:** `v3/1-iphone-monteur-start.png`, `quelle/seiten.py` Abschnitt `m1`.

**Tun:** Zwei Karten wie in `linie.md` § 9 Zeile `/` (Mitarbeiter).
Fehlende Buchungen als `Hinweiszeile` über der ersten Karte. Der Knopf
„Wie zuletzt buchen“ trägt die Zeiten als kleine Unterzeile (400, 13 px).
Alle vorhandenen Links (Einsatzplan, Route, Telefon, Schein) bleiben
erreichbar.

**Prüfen:** `tests/components/DashboardView.test.tsx`,
`tests/durchklick/zeitBuchen.spec.ts` (läuft in der CI).

### Schritt 3 · Zeiterfassung

**Dateien:** `src/features/time/TimeView.tsx`, `time/TimeForm.tsx`,
`time/AntragKnopf.tsx`.
**Vorlage:** `v3/2-iphone-zeit-erfassen.png`, `v3/6-tablet-akte-zeit.png`,
`seiten.py` Abschnitte `m2`, `d4`.

**Tun:** Formular als **eine** Karte (§ 8 D). „Wie zuletzt eintragen“ als
erste Zeile mit kleinem Knopf „Übernehmen“. Datum und Status
nebeneinander (`reihe2`/`FormGrid cols=2`). Von · Bis · Pause in drei
Feldern mit Unterzeile. Abschnitt „Baustelle“. Tätigkeit, Helfer-Schalter,
„Weitere Angaben“ (Wegzeit, Zuschläge, Notdienst) als aufklappbare Zeile
mit `stand-leise` „optional“. Aktionsleiste mit „Arbeitszeit hh:mm Std“
und „Abbrechen | Zeit buchen“. Die Liste der eigenen Buchungen darunter
als Karte mit Monats-Abschnitten und Zeilen (Datum · Baustelle, rechts
Stunden). Schreibtisch: Kennzahlleiste (Woche, Saldo, Monat) über Formular
und Liste als Tabelle.

**Prüfen:** alle `tests/components/TimeForm*.test.tsx` und
`TimeView.test.tsx` unverändert grün (sie prüfen Verhalten). Die Summe in
der Aktionsleiste muss dieselbe Zahl zeigen wie heute im Formular.

### Schritt 4 · Handwerksschein

**Dateien:** `src/features/worksheets/WorkSheetView.tsx`, `Schrittfolge.tsx`,
`LeistungszeitErfassen.tsx`, `MaterialErfassen.tsx`, `Fotostreifen.tsx`,
`src/components/SignaturePad.tsx` (nur Rundung/Knöpfe).
**Vorlage:** `v3/4-iphone-schein-rechnungen.png`, `seiten.py` Abschnitt `m3`.

**Tun:** Schrittleiste ohne Nummern (`.schritte`). Zurück-Pfeil links vom
Titel, Meta „Baustelle · Nummer · Datum“. Material: Suche oben, eine Karte
„Verbaut · n Positionen“ mit Stepper (44 px) je Zeile, Abschnitt „Zuletzt
auf dieser Baustelle“ mit kleinem Knopf „Hinzufügen“. Preise-Hinweis als
Meta-Text ohne Kasten. Aktionsleiste „Zurück | Weiter: <nächster Schritt> ›“.
Unterschrift und „Groß unterschreiben“ bleiben, wie sie sind.

**Prüfen:** `tests/components/WorkSheetView.test.tsx`,
`SignaturePad.test.tsx`, `tests/durchklick/scheinUnterschreiben.spec.ts`.

### Schritt 5 · Urlaub und Material anfordern

**Dateien:** `src/features/vacations/VacationsView.tsx`,
`src/features/orders/OrderView.tsx`.
**Vorlage:** `v3/3-iphone-urlaub-rechnungen.png`, `seiten.py` Abschnitt `m5`.

**Tun:** Kennzahlleiste (2 Felder), eine Karte „Antrag stellen“ mit
Segment (Urlaub / Zeitausgleich / Krank), Von/Bis nebeneinander,
Bemerkung; Abschnitt „Meine Anträge“ mit Zeilen und Stand. Material
analog: Formular-Karte, Abschnitt „Meine Anforderungen“.

**Prüfen:** `VacationsView.test.tsx`, `OrderView.test.tsx`,
`tests/durchklick/materialAnfordern.spec.ts`.

### Schritt 6 · Rechnungen und die anderen Listen

**Dateien:** `src/features/invoices/InvoicesView.tsx`,
`accounting/AccountingView.tsx`, `worksheets/WorkSheetsListView.tsx`,
`orders/AdminOrdersView.tsx`, `orders/StockView.tsx`,
`quotes/QuotesView.tsx`, `customers/CustomersView.tsx`,
`maintenance/WartungenView.tsx`, `projects/AdminProjectsView.tsx`,
`projects/MyProjectsView.tsx`, `users/UserMgmtView.tsx`,
`costing/NachkalkulationView.tsx`.
**Vorlage:** `v3/3…`, `v3/4…`, `v3/5-schreibtisch-start-rechnungen.png`,
`seiten.py` Abschnitte `m4`, `d2`.

**Tun:** Seitentyp B (§ 8). Telefon: Kennzahlleiste, Suche, Chips, eine
Karte mit Abschnitten, Textlinks. Ab 1024 px: `.tabelle` in einer Karte;
Zahlen rechtsbündig (`.r`), Stand als `.stand`. Zeilenmenü (`RowMenu`)
bleibt für seltene Aktionen. Für die Tabelle **dieselben Daten und
dieselben Handler** wie die Zeilen verwenden (ein `useMemo` mit den
Zeilen-Daten, zwei Darstellungen), damit kein Verhalten doppelt gepflegt
wird.

**Prüfen:** die jeweilige `…View.test.tsx`; `tests/unit/listengrenzen.test.ts`;
`tests/unit/eurozeichen.test.ts` (Beträge weiter über die bestehenden
Formatierer); `tests/durchklick/rechnungStellen.spec.ts`.

### Schritt 7 · Akten zweispaltig

**Dateien:** `projects/BaustellenakteView.tsx`, `customers/KundenakteView.tsx`,
`quotes/AngebotView.tsx`, `users/BenutzerakteView.tsx`.
**Vorlage:** `v3/6-tablet-akte-zeit.png`, `seiten.py` Abschnitt `d3`.

**Tun:** Seitentyp C. Am Telefon Karten untereinander in derselben
Reihenfolge wie heute; ab 1024 px `.zwei-spalten`. Links (7): Verlauf,
Positionen, Scheine, Rechnungen, Material – je als Abschnitt **einer**
Karte. Rechts (5): Stammdaten, Kontakt, Budget/Zeiten – eine Karte mit
Abschnitten. Hauptaktion rechts im Seitenkopf, Rest im `RowMenu`.

**Prüfen:** `BaustellenakteView.test.tsx`, `KundenakteView.test.tsx`,
`AngebotView.test.tsx`, `BenutzerakteView.test.tsx`, `BaustellenPlaene.test.tsx`,
`ProjectSummary.test.tsx`.

### Schritt 8 · Einsatzplanung und Wochenplan

**Dateien:** `assignments/AssignmentsView.tsx`, `WochenplanView.tsx`,
`MyScheduleView.tsx`, `RuestlistePlanen.tsx`, `RuestlisteAbhaken.tsx`.
**Vorlage:** `v3/6-tablet-akte-zeit.png` (Wochenplan 834 px), `seiten.py` `t1`.

**Tun:** Seitentyp E. Wochenwahl (Pfeile, aria-labels bleiben) rechts im
Seitenkopf. Tabelle eng (`.tabelle-eng`), Zellen 12–13 px am Tablet,
Person als erste Spalte 500. Abschnitt „Frei diese Woche“. Telefon:
Tagesansicht als Zeilen.

**Prüfen:** `WochenplanView.test.tsx`, `AssignmentsView.test.tsx`,
`MyScheduleView.test.tsx`; die Vorschau auf **834 px** (die knappste Breite).

### Schritt 9 · Einstellungen, Rest, Abgleich

**Dateien:** `settings/*`, `modules/ModulesView.tsx`, `plattform/PlattformView.tsx`,
`recht/*`, `auth/LoginPage.tsx`, `src/components/Supportsitzung.tsx`,
`Supportband.tsx`, `Verbindungsband.tsx`, `BottomSheet.tsx`, `ConfirmDialog.tsx`,
`Toast.tsx`.

**Tun:** Je Reiter eine Karte mit Abschnitten; Speichern in der
Aktionsleiste. Dialoge und Sheets: Rundung über Token, Knöpfe wie § 7.
Danach **alle 35 Routen** in der Vorschau durchgehen und gegen `linie.md`
§ 10 abhaken. Zum Schluss `docs/design/fortschritt.md` mit einer Tabelle
„Schritt · Status · Commit“ ergänzen und `docs/offene-punkte.md` B11
streichen bzw. auf das Übrige eindampfen.

## 2. Bilder prüfen (Vorschau-Werkzeug)

Die Vorschau zeigt die echten Ansichten mit Beispieldaten, ohne Datenbank
und ohne Anmeldung (`tools/vorschau/README.md`).

```bash
npm run vorschau                      # Server auf http://localhost:5199/tools/vorschau/
# in einem zweiten Terminal:
npm run vorschau:messen               # alle Routen auf 390 / 834 / 1440 px; meldet Überläufe
npm run vorschau:fotos -- fotos       # Bilder je Route × Rolle × Breite nach ./fotos/
npm run vorschau:fotos -- fotos /time # nur Routen, die „/time“ enthalten
```

Einzelne Route im Browser: `?pfad=/invoices&rolle=Buchhaltung`
(Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter,
Geschäftsführung, Administrator).

Für 375 px (iPhone XS) die Breite in `tools/vorschau/fotos.mjs`
(`BREITEN`) um `375` ergänzen oder im Browser die Gerätesimulation
verwenden. Chromium-Pfad, wenn nicht der Standard: `CHROMIUM_PFAD=…`.

Die Ersatzmodule unter `tools/vorschau/db/` werden bei jedem Start aus
`src/lib/db` erzeugt. Fehlt einer Ansicht ein Export („does not provide an
export named …“), gehört die Form nach `tools/vorschau/stubs-erzeugen.mjs`
(`FEST`) oder als Datei nach `tools/vorschau/fest/`.

Bilder vergleichen: Screenshot der Vorschau neben das jeweilige Bild aus
`docs/design/entwurf-2026-09-26/v3/` legen (`quelle/montage.py` baut
Kontaktbögen). Der Entwurf ist die Richtung, nicht die Pixelvorlage:
Texte, Reihenfolge und Funktionen kommen aus der App.

## 3. Pull-Request und Merge

1. Branch von `main`, Name `design/schritt-<n>-<kurz>`.
2. PR-Titel wie die Commit-Meldung; Beschreibung: was umgebaut wurde,
   welche Tests angepasst wurden und warum, zwei Bilder (375 und 1440 px)
   der wichtigsten Seite.
3. Warten, bis alle drei Workflows grün sind. Rote Prüfungen sind Befunde
   am eigenen Umbau, keine „Flakes“: beheben, erneut pushen.
4. Mergen (Squash). Der Deploy auf `main` läuft automatisch.
5. `docs/design/fortschritt.md` im selben PR fortschreiben.

## 4. Was diesen Plan begleitet

| Datei | Inhalt |
|---|---|
| `docs/design/linie.md` | Die Vorgabe: Charakter, Tokens, Schrift, Bausteine (CSS), Komponenten, Seitentypen, Routen, Regeln |
| `docs/design/entwurf-2026-09-26/v3/*.png` | Freigegebene Beispielbilder (Telefon 375, Tablet 834, Schreibtisch 1440) |
| `docs/design/entwurf-2026-09-26/quelle/` | HTML/CSS-Quellen des Entwurfs, neu renderbar |
| `docs/design/fortschritt.md` | Was bisher am Design gemacht wurde und was offen ist |
| `docs/offene-punkte.md` | Alle bewusst offenen Punkte der App (B11 = dieser Umbau) |
| `docs/pruefung-2026-09-25.md` | Prüflauf vor dem Umbau; die Ansichten müssen danach genauso funktionieren |
| `tools/vorschau/README.md` | Das Vorschau-Werkzeug |
