# Design-Durchgang Senklot — Fortschritt

Grundlage: Masterprompt „Design-Überarbeitung Senklot“, Phasen 0 bis 3.
Zweig: `claude/senklot-design-durchgang`, neu aufgesetzt auf `main` @ `473c1da` (#152, Launch-Check).
Ausgangslage der Prüfsuite auf `main`: **184 Testdateien, 2358 Tests, alle grün**
(Komponenten und Einheiten, `npm test`). Datenbank- und Browserwege siehe Offene Punkte.

## Statusübersicht

| Punkt | Status | Commits |
|---|---|---|
| Phase 0 – Bestandsaufnahme | erledigt | `9ca9788` |
| 1.1 Navigation: eigene Icons | erledigt | `91e0ab9` |
| 1.2 Zahlen und Zeiten einheitlich | erledigt | `f5fdb4a` |
| 1.3 Tabellenziffern, rechtsbündige Werte | erledigt | `07262e1` |
| 1.4 Überschriften | erledigt | `9636cd3` |
| 1.5 Gestaltungsverbote | erledigt | `2d00de3`, `fcf38d4`, `53884d9`, `b73a3e3` |
| 1.6 Einstellungs-Reiter | erledigt | `4e818a7` |
| 1.7 Wochenplan | erledigt | `24a9593` |
| 1.8 Projektauswertung | erledigt | `18abd9d` |
| 1.9 Anrede „du“ | erledigt | `8e0d098` |
| 2 Gemeinsame Bausteine | erledigt | `eb7e004`, `ea47726`, `67cad78`, `f87e050`, `da377a4`, `5f240bf`, `194db9d`, `24abb1c`, `0219c66` + Umstellung je Bereich (siehe unten) |
| 4 Handwerksschein als Schrittfolge | erledigt (ohne Querformat, siehe Offene Punkte) | `ac7690b`, `14c3c3b`, `b3713a1`, `4b3ce53` |
| 3a Monteur-Start | erledigt | `40d6851`, `12c12bf` |
| 3b Büro-Startseite | erledigt | `57d5155` |
| 3c Desktop-Listen als Tabelle | erledigt (ab 1280 px) | `cab3cca`, `fb4d312`, `205b5b8`, `71f5260`, `52858f7`, `91d51d5`, `11ed4b2` |
| 3d Akten zweispaltig | erledigt (ab 1280 px) | `7c8e421`, `624db5f`, `352b908`, `339597a` |
| 3e Zeiterfassung, Material, Urlaub | erledigt | `9713fdf`, `3239e56`, `da85121`, `498ac91`, `78defdd` |
| 3f Mein Einsatzplan, Meine Baustellen, Einstellungen | erledigt | `6a4d906`, `ce63368`, `d1333e2` |
| 3g Einsatzplanung (Tag planen, Wochenplan, Team-Woche) | erledigt | `280bf85`, `2a05d75`, `5a2799a`, `226e707` |
| 3h Angebote, Wartungen, Lager, Scheine-Liste, Reiter | erledigt | `1ea360a`, `f0abb3c`, `8b35d82`, `a908931`, `07a52c4`, `ca6a68a` |
| 3i Benutzer, Nachkalkulation, Projektauswertung, Plattform, Datenschutz | erledigt | `f090930`, `1d798ae`, `fd02982`, `72d9205`, `8adf09f`, `6052c1a` |
| Abschluss: Kontrast Monatskalender, gesperrte Felder | erledigt | `9ecb974`, `05a6387` |
| **Linie nach den Vorlagen** (2. Durchgang, `docs/design/linie.md`) | erledigt | siehe Abschnitt „Linie nach den Vorlagen“ |

## Offene Punkte

(laufend ergänzt; Ort · Begründung · Vorschlag)

1. **Datenbank-Prüfungen und Browserwege lokal nicht gelaufen.** Der lokale
   Supabase-Stapel (`scripts/stack.sh`) ließ sich in dieser Sitzung nicht
   starten (Freigabe verweigert). `npm run supabase:test` und
   `npm run durchklick` laufen deshalb erst in der CI des Pull-Requests.
   Geändert wird ausschließlich die Darstellung; Datenschicht, Migrationen
   und Abfragen bleiben unberührt.
2. **„Pro Element genau eine Klasse“** gilt für die Bausteine aus Phase 2.
   Das übrige Markup ist Tailwind mit mehreren Hilfsklassen je Element; es
   vollständig auf Einzelklassen umzuschreiben, wäre eine Formatierungswelle
   über rund 56 000 Zeilen und widerspräche „keine Formatierungswellen“.
   Vorschlag: eigener Auftrag, Ansicht für Ansicht.
3. **Icons ergänzt statt Paket gewechselt.** Das „Icon-Paket“ ist der
   hauseigene Satz in `src/components/Icon.tsx`. Für Punkt 1.1 fehlten
   sieben Zeichen; sie sind in derselben Strichführung dort ergänzt — keine
   neue Abhängigkeit.
4. **Betragsformatierer nicht zusammengelegt.** Die acht `fmtEUR`-Kopien
   bleiben: `tests/unit/eurozeichen.test.ts` setzt ihre Existenz voraus
   („Wächter über den Wächter“), und die Prüfung darf nicht abgeschwächt
   werden. Vorschlag: zusammenlegen und die Prüfung im selben Auftrag auf
   den einen Formatierer umstellen.
5. **Abdunkler hinter Dialogen** (`bg-ink/40` in `ConfirmDialog.tsx`,
   `BottomSheet.tsx`, `ExportDialog.tsx`) sind die einzigen halbtransparenten
   Flächen. Deckend würden sie den Kontext hinter dem Dialog verbergen — das
   ist eine Funktionsfrage. Vorschlag: so lassen oder bewusst entscheiden.
6. **Drehkreis** im ladenden Knopf und in `LoadingState` ist eine
   Endlos-Animation. Er ist eine Zustandsanzeige (ohne ihn fehlt die
   Rückmeldung) und bleibt deshalb; der Lade-Platzhalter `.skeleton` steht
   dagegen jetzt ruhig.
7. **Foto-Entfernen-Knopf** im Schein (`WorkSheetView.tsx`, ~1119) ist
   28 × 28 px — schon vorher unter 44 px. Gehört zum Schein (Phase 4).
8. **Datenschutzerklärung siezt** (`src/features/recht/DatenschutzView.tsx`,
   12 Stellen) — Rechtstext, inhaltlich nicht verändert. Kundentexte (PDF,
   Mahnung, Bestellmail an den Großhandel) bleiben bewusst beim „Sie“.
9. **Weitere Reiterleisten** (Material, Lager, Anforderungen, Urlaub) haben
   die ausgeblendete Scrollleiste mitbekommen, aber kein automatisches
   Einscrollen des aktiven Reiters; sie haben 2–4 kurze Reiter und laufen nur
   am Telefon über. Vorschlag: bei Bedarf nachziehen.
10. **Wochenplan-Karten, zugängliche Namen**: `aria-label` nennt nur Kunde und
    Datum; zwei Baustellen desselben Kunden am selben Tag heißen für die
    Vorlesehilfe gleich. `aria-label` ist nach den harten Regeln geschützt
    (Tests greifen darauf zu). Vorschlag: Nummer ins Label, Tests anpassen.
11. **Legende „Heute“** in Einsatzplanung/Mein Einsatzplan trug die
    Mandantenfarbe (`brand/25`) und trägt jetzt deckend `info-bg` wie der
    Kalender — kleine inhaltliche Angleichung.
12. **Phase 4 auf Wunsch in diesem Durchgang.** Der Masterprompt schloss den
    Handwerksschein als Schrittfolge aus; der Nutzer hat ihn ausdrücklich
    hereingeholt. Umgesetzt als reine Anordnung (alle Teile bleiben
    eingehängt, Speichern/Absenden/Prüfsumme/PDF unverändert).
13. **Unterschrift im Querformat nicht umgesetzt** (`SignaturePad.tsx`,
    `worksheetPdf.ts`). Das gespeicherte Bild ist `toDataURL` der
    angezeigten Zeichenfläche — Größe und Seitenverhältnis hängen an der
    Anzeige, die Striche skalieren nicht mit, das PDF setzt das Bild in ein
    festes Feld von 70 × 25 mm, die Prüfsumme läuft über den Bildtext. Eine
    Querformat-Fläche würde das Bild aller künftigen Scheine verändern.
    Vorschlag: `bildLesen` zeichnet auf eine feste Exportfläche im
    Verhältnis des PDF-Felds — braucht ausdrückliche Freigabe. Aus demselben
    Grund bleibt der Desktop-Schein einspaltig (Mockup Seite 8 hätte die
    Zeichenfläche verschmälert).
14. **Mockup-Funktionen, die es nicht gibt, nicht gebaut:** ±15-Minuten-
    Knöpfe, Pausen-Schnellwahl (0/30/45/60), „Zuletzt verbaut“,
    Zuschlag-Chips, „Monteur hat unterschrieben“ als Kachel, „Nächste
    Einsätze“ am Monteur-Start, Wochenbalken Mo–Fr, Begrüßung „Guten Morgen“
    (die Überschrift bleibt das Datum, das der Betrieb ausdrücklich wollte).
15. **Schrittleiste des Scheins klebt nicht** oben (im Mockup fest) — dafür
    müsste die Kopfleiste fest stehen. Vorschlag: eigener kleiner Punkt.
16. ~~**Wochenplan-Raster bei 834 px**~~ — erledigt in 3g: Tagesspalten
    mit Mindestbreite, das Raster rollt in seiner Hülle, die Namensspalte
    steht.
17. **„Wie zuletzt“ auf dem Monteur-Start nur bei derselben Baustelle.** Der
    bestehende Griff übernimmt auch die Baustelle des letzten Eintrags; an
    einem Einsatz auf einer anderen Baustelle hätte er die gestrige
    Baustelle gebucht. Dort ist „Zeit erfassen“ die Hauptaktion.
18. **Startseiten-Test „kein Saldo“ umgestellt:** Der Auftrag verlangt in
    „Diese Woche“ den Saldo; es ist der des Monats. Der Test prüft jetzt,
    dass genau dieser erscheint und kein Saldo seit Eintritt.
19. **Tabellen und Akten erst ab 1280 px** statt ab `lg` (1024). Neben der
    Seitenleiste blieben auf 1024 px rund 660 px: Namen brachen mitten im
    Wort, die Lagerknöpfe der Anforderungen standen übereinander, zwei Felder
    der Stammdaten brachen um. Der Handwerksschein bleibt bei 1024 px.
20. **Silbentrennung in der Vorschau nicht sichtbar.** `hyphens: auto` mit
    `lang="de"` steht global; das Headless-Chromium der Aufnahmen hat keine
    deutschen Trennmuster und bricht lange Namen
    („Wohnungseigentümergemeinschaft“) ohne Strich. Vorschlag: auf echtem
    Telefon und Tablet ansehen; falls nötig Mindestbreite von `.zeile-text`.
21. ~~**Reiterleisten**~~ — erledigt in 3h: Baustein `Reiter`/`Reiterleiste`
    für Material, Urlaub, Lager, Anforderungen und die Unterreiter.
22. **Dateiwahl-Feld** (Firmendaten, Katalog- und Kundenimport) ohne
    gemeinsamen Baustein. Vorschlag: `.feld-datei`, alle drei zugleich.
23. **„Ältere Einträge laden“ / `Nachladen`**: Vorschlag, beide als
    Kartenfuß (`Card footer`) — dann einheitlich.
24. **Letzte Tabellenzeile** behält ihre untere Linie über der Kartenkante;
    sie wegzunehmen bräuchte einen positionsabhängigen Selektor.
25. **Kontaktknöpfe vor der Hauptaktion** (Mockup Mein Einsatzplan) nicht
    umgesetzt: die bestehende Reihenfolge bleibt, die Hauptaktion wird
    nicht ohne Grund verschoben.
26. **Wochensumme und Zeilenwerte in der Zeiterfassung** tragen jetzt
    „Std“ (Dauer); die Kennzahlen oben bleiben `HH:MM`, weil ein Test genau
    darauf prüft. Vorschlag: im selben Zug angleichen, wenn der Test
    angepasst werden darf.
27. **Angebote, Handwerksscheine, Wartungen bleiben am Schreibtisch Listen.**
    Drei bis fünf Textknöpfe je Zeile ergaben keine ruhige Tabelle.
    Vorschlag: Seltenes (Abgelehnt, Löschen, Verwerfen, Stornieren) ins
    `RowMenu` — kostet einen Klick mehr, braucht deshalb Freigabe.
28. **Storno-Zeile der Scheinliste grau statt rot** — passend zur
    Status-Marke, die „Storniert“ bewusst nicht rot färbt.
29. **„Stunden ohne Buchung“** (Mitarbeiterübersicht) nutzt noch
    `span.text-xs`-Zeilen, weil Tests genau darauf greifen. Vorschlag: auf
    den Zeilentext umstellen und die Zeilen neu setzen.
30. **Knopfreihe im Katalog-Probelauf** noch Hilfsklassen — mit Punkt 22
    (Dateiwahl) zusammen umstellen und im Browser ansehen.
31. **Projektauswertung steht in der Mitarbeiterübersicht**, nicht in der
    Baustellenakte — dort geordnet (Tabelle ab 1280 px, Datum mit Jahr,
    Helfer ohne Warnfarbe).
32. **Budgetbalken „über Budget“** in `accent` bleibt, weil
    `BaustellenUebersicht` dasselbe Schema nutzt — nur beide zugleich ändern.
33. **Einzeltabelle der Projektauswertung am Telefon**: die Stundenspalte
    erst nach Wischen (war schon so, in der Hülle erlaubt). Vorschlag:
    Listenform am Telefon.
34. **Wochenplan: Helfer-Einsatz nicht mehr gelb**, Feiertag mit Namen statt
    gelber Fläche; freie Zellen an Wochenende/Feiertag ruhig ohne Tönung
    (ob sie „frei“ zählen, ist Fachlogik und unverändert).

### Stand nach dem Linie-Durchgang (25.09.2026)

Erledigt: 4 (ein Betragsformatierer, `src/lib/geld.ts`), 10 (Nummer im
zugänglichen Namen), 13 (Unterschrift im Querformat: großes Blatt, Export
auf feste Fläche 70 × 25 mm — alte Scheine und Prüfsummen unverändert),
22 (`.feld-datei`), 23 (Nachladen im Kartenfuß), 26 (Kennzahlen in „Std“),
27 (Seltenes ins Zeilenmenü, Angebote/Scheine/Wartungen als Tabelle),
29, 30, 32, 33. Neu offen:

35. **„Heute ab 07:00“** auf dem Monteur-Start fehlt: ein Einsatz hat keine
    Startzeit. Vorschlag: optionales `startTime` an Assignment; die Zeile
    erscheint dann ohne weiteren Umbau.
36. **Aufschrift des Dateiknopfs** kommt vom Browser (deutsches Chrome:
    „Datei auswählen“). Ein fester Text bräuchte einen eigenen Knopf mit
    verstecktem Feld und Zustand für den Dateinamen.
37. **Einstellungs-Reiter** brechen bei der Administration (neun Bereiche)
    am Schreibtisch zweizeilig um. Vorschlag: seltene Bereiche (Sicherung,
    Support, Module) zusammenfassen.
38. **Katalog: Formular „Neues Material“ steht dauerhaft offen** —
    Vorschlag: über „Neues Material“ im Kopf aufklappen wie bei Kunden.
39. **Kunden: „Bestehende Baustellen übernehmen“ und „Kunden aus einer
    Datei“** stehen über der Liste. Vorschlag: Liste zuerst oder zuklappen.
40. **Startseite am Schreibtisch:** „Wartungen“ und „Offen für dich“ sind
    einzeilige Karten über die volle Breite. Vorschlag: eine gemeinsame
    Karte „Offen für dich“ (die Abfrage aus `WartungHinweis` in einen Hook).
41. **Wartungen am Telefon:** lange Zustandsmarke („Seit 5 Tagen
    überfällig.“) drückt den Titel schmal. Vorschlag: Zustand in die
    Unterzeile.
42. **Auf echten Geräten ansehen:** Silbentrennung langer Namen (Punkt 20)
    und das Unterschriftsblatt auf iPhone/iPad in beiden Lagen.
43. **Warenkorb:** die Aktionsleiste klebt nur, solange die Karte
    „Anforderung“ im Bild ist, nicht schon beim Blättern im Katalog.
44. **Plus-Zeichen vor „Zeit buchen“** (Mockup S. 7) bewusst weggelassen:
    „Neu …“ sagt die Beschriftung selbst (Phase 1, keine Deko-Symbole).

---

## Phase 0 – Bestandsaufnahme

### 0.1 Tokens

Alle Tokens stehen in `src/index.css` (`:root`) und werden in
`tailwind.config.js` als Farbrollen gelesen.

**Farben**

| Token | Wert | Rolle |
|---|---|---|
| `--brand` | `#0f4552` | Mandant: Knöpfe, Links, Abzeichen |
| `--brand-fg` | `#ffffff` | Schrift auf `--brand` |
| `--accent` | `#00778a` | Mandant: Hervorhebung |
| `--accent-fg` | `#ffffff` | Schrift auf `--accent` |
| `--brand-fixed` | `#0f4552` | Produktfarbe: Trägerfläche, Strich unter H1 |
| `--ink-deep` | `#0a2030` | Überschriften |
| `--accent-deep` | `#00778a` | Kästchen, Kalender, Reitermarkierung |
| `--accent-bright` | `#12b0c6` | nur Fläche (Avatar) |
| `--bg` | `#eef6f8` | Seitengrund |
| `--surface` | `#ffffff` | Karten |
| `--surface-2` | `#f1f8fa` | Kartenkopf, Hinterlegung |
| `--surface-3` | `#dceaef` | Lade-Platzhalter |
| `--text` | `#0a2030` | Fließtext |
| `--text-muted` | `#38505f` | Nebentext |
| `--text-placeholder` | `#5f7482` | Platzhalter |
| `--border` | `#cfe3e9` | Linien |
| `--border-strong` | `rgba(18,176,198,.34)` | **Alpha-Token** |
| `--focus-ring` | `rgba(18,176,198,.22)` | Fokusring (Schatten, keine Fläche) |
| `--success` / `--success-bg` | `#15803d` / `#dcf7e6` | |
| `--warning` / `--warning-bg` | `#a55409` / `#f7f0d9` | |
| `--danger` / `--danger-bg` | `#ad1a1a` / `#f8dbd8` | |
| `--info` / `--info-bg` | `#0e6d80` / `#d9f2f7` | |

**Überschrieben werden** nur `--brand`, `--brand-fg`, `--accent`,
`--accent-fg` — zur Laufzeit durch `applyBranding()` (`src/lib/tenant.ts`)
aus den Firmendaten. Direkte `var(--…)`-Bezüge in Komponenten: 6×
`accent-[color:var(--accent-deep)]` an nativen Kästchen, 3×
`shadow-[inset_…var(--warning)]` (Kalender, Legenden).

**Radius:** `--radius-sm` 10 px, `--radius` 14 px, `--radius-lg` 18 px
(auch für `rounded-xl`), `--radius-pill`. Verwendet: `rounded` 90×,
`rounded-sm` 88×, `rounded-full` 15×, `rounded-pill` 7×, `rounded-lg` 5×,
Einzelecken 6×.

**Schatten:** `--shadow-sm`, `--shadow`, `--shadow-lg`; `.panel` trägt
`--shadow`. Im Markup `shadow-sm` 10×, `shadow` 3×, `shadow-lg` 7×.

**Abstände:** Kommentar in `index.css` legt die Skala 1/2/3/4/6
(4–24 px) fest; kein eigener Token, Tailwind-Stufen.

**Schrift:** Poppins 400/500/600/700; Skala in `tailwind.config.js`:
xs 12, sm 14, base 16, lg 18, xl 22, 2xl 28 px. Gewichte im Markup:
`font-semibold` 104×, `font-medium` 96×, `font-bold` 27×,
`font-extrabold` 1×. `.section-label`: 12 px, 600, versal, gesperrt,
`--text-muted` — 40 Fundstellen in 24 Dateien plus jeder Kartentitel.

### 0.2 Gestaltungsverbote — Fundstellen

**Gestrichelt (5):**  
`.reiterleiste` (neu in #152) setzt die Scrollleiste der Reiter schmal statt sie auszublenden — siehe Punkt 1.6.

- `src/components/SignaturePad.tsx:417` — Unterschriftsfeld
- `src/components/States.tsx:120` — Leerzustand
- `src/features/time/TimeForm.tsx:646` — „Wie zuletzt“-Knopf
- `src/features/assignments/WochenplanView.tsx:504, 650` — „Einsatz hinzufügen“

**Alpha-Flächen (Hintergrund) — 22 Stellen:**
- Kartenkopf/-fuß `bg-surface-2/70` (`Card.tsx:57, 95`)
- Abdunkler `bg-ink/40` (`ConfirmDialog`, `BottomSheet`, `ExportDialog`) —
  **Abdunkler hinter Dialogen**, siehe Offene Punkte
- dunkle Trägerfläche `bg-white/10`, `bg-white/15` (`Layout.tsx` 4×,
  `Button.tsx` ghost-dark)
- `bg-ink-muted/50` (`Badge.tsx:69`)
- Kalender `bg-surface-2/40`, `/60`, `bg-accent-deep/20` (`MonthCalendar.tsx`)
- `bg-info-bg/70`, `/40` (`PersonPicker.tsx`)
- `bg-surface/90` (`WorkSheetView.tsx:1118`)
- `bg-line/60` (`BaustellenUebersicht.tsx`, `ProjectSummary.tsx`)
- `bg-warning-bg/40` (`ProjectSummary.tsx:267`)
- `bg-brand/25` (`AssignmentsView.tsx:515`, `MyScheduleView.tsx:254`)
- Token `--border-strong` ist selbst halbtransparent (Linie, keine Fläche).

**Alpha an Linien/Schrift** (keine Fläche, nicht verboten, aber notiert):
`border-line/60` 8×, `ring-brand/30` 5×, `border-brand/40` 4×,
`text-white/60…80` 8×, `border-brand-fixed/40` 3× u. a.

**Verläufe:** keine mehr (seit Marke Senklot entfernt). Einziger
`linear-gradient`: der Lichtstreifen im Lade-Platzhalter `.skeleton`.

**Emojis:** keine. Dingbats: `✕` 18× (Schließen/Löschen in `IconButton`),
`✓` 1× (`AssignmentsView.tsx:802`).

**Icons außerhalb der Navigation** (`<Icon>`): `pin`, `phone`, `mail`
(Kontakt — Bedeutung), `chevron` (Aufklappen — Bedeutung), `download`
(Exportknöpfe, 3×), `plus` (Neu-Knöpfe, 7×), `clock` (TimeForm, „Wie
zuletzt“-Knopf), `bell`/`mail` in der Kopfleiste (Bedeutung).

### 0.3 Formatierung

**Datum:** `datumAT()` und `datumAusMs()` in `src/lib/datum.ts`
(„24.09.2026“). Daneben 17 eigene `toLocaleDateString('de-AT', …)` in
Ansichten (Wochentag + Tag.Monat, lange Monatsnamen u. ä.).

**Uhrzeit/Arbeitszeit:** `fmtMin()` in `src/lib/time.ts` („08:30“),
genutzt in Accounting, ProjectSummary, Invoices, TimeForm, TimeView,
Vacations, Worksheets.

**Dezimalstunden:** `fmtStd()` („16,5“) in `src/lib/time.ts` —
Dashboard, BaustellenUebersicht. Einzelstelle
`AccountingView.tsx:697` (`toFixed(2)` mit Komma).

**Beträge — acht Formatierer in der Oberfläche** (`fmtEUR` bzw. `eur`):
`NachkalkulationView`, `InvoicesView`, `QuotesView`, `AngebotView`,
`KundenakteView`, `SettingsView`, `DashboardView` (ohne Nachkommastellen),
`KatalogImport` (bis 4 Nachkommastellen). Dazu in Belegen/Exporten:
`invoices/pdf.ts`, `summenZeilen.ts`, `mahnungPdf.ts`, `lib/belegLayout.ts`,
`bmdExport.ts` — diese bleiben unberührt (PDF/Export).
Die Prüfung `tests/unit/eurozeichen.test.ts` setzt voraus, dass es diese
Kopien gibt („der Wächter über den Wächter“).

### 0.4 Bausteine und Varianten

| Muster | Baustein | Fundstellen | Abweichungen |
|---|---|---|---|
| Karte | `Card` (`.panel`) | 150 | 10 Dateien setzen `.panel` direkt (Dialog, Kalender, Login, Accounting, ProjectSummary, Recht, Layout, ErrorBoundary, MarkenBand) |
| Kartenkopf | in `Card` (`h2.section-label`) | — | eigene Köpfe in Akten/Listen |
| Listenzeile | `ListRow`/`List` | 30 | 39 eigene `<li>` in Ansichten |
| Zeilenmenü | `RowMenu` | — | |
| Knopf | `Button` (primary, secondary, danger, ghost, ghost-dark; normal/klein) | 194 | 44 rohe `<button>` |
| Symbolknopf | `IconButton` | 18 | |
| Eingabe | `InputField`, `SelectField`, `CheckboxField` (`Field.tsx`) | — | 6 native Kästchen mit `accent-[…]` statt `.checkbox` |
| Kennzahl | `Metric`/`MetricRow` | — | |
| Leerzustand | `EmptyState` (`States.tsx`) — gestrichelter Kasten | — | |
| Tabelle | — (kein Baustein) | 5 Dateien mit `<table>` | Invoices, Settings, ProjectSummary, Accounting, Wochenplan |
| Überschrift | `PageHeader` (H1 + Strich) | — | 5 × `h2`, 5 × `h3` frei |
| Obergrenze „und X weitere“ | — (kein Baustein) | siehe Phase 2 | |

### 0.5 Navigations-Icons (`src/app/navigation.ts`)

21 Einträge, 12 Icons. Doppelt:

| Icon | Einträge |
|---|---|
| `clipboard` | Handwerksscheine, Wartungen, Anforderungen |
| `calendar` | Mein Einsatzplan, Urlaub, Einsatzplanung |
| `package` | Material, Lager |
| `users` | Kunden, Benutzerverwaltung |
| `chart` | Nachkalkulation, Mitarbeiterübersicht |
| `receipt` | Angebote, Rechnungen |
| `building` | Meine Baustellen, Baustellen (rollengetrennt) |

### 0.6 Plan: Zusammenfassen

- **Karte**: eine Klasse `.karte` (Fläche) mit `.karte-kopf`,
  `.karte-titel`, `.karte-inhalt`, `.karte-fuss`; `.panel` geht darin auf.
- **Listenzeile**: `.zeile` mit `.zeile-titel`, `.zeile-unter`,
  `.zeile-aktionen`.
- **Knopf**: `.knopf-primaer`, `.knopf-sekundaer`, `.knopf-link`
  (+ `.knopf-gefahr` für destruktiv).
- **Feld**: `.feld` für Eingabe und Auswahl, `.kaestchen` (bisher
  `.checkbox`) auch für die sechs nativen Kästchen.
- **Kennzahl**: `.kennzahl`, `.kennzahl-wert`, `.kennzahl-name`.
- **Leerzustand**: `.leer` — eine Zeile, kein Rahmen.
- **Tabelle**: `.tabelle` mit rechtsbündigen Zahlenspalten `.zahl`.
- **Überschriften**: `.titel-seite` (H1), `.titel-karte` (Karten- und
  Abschnittsköpfe, normale Schreibweise).

Die Regel „pro Element genau eine Klasse“ gilt für die neuen Bausteine.
Das übrige Markup ist Tailwind mit mehreren Hilfsklassen je Element; es in
diesem Durchgang vollständig umzuschreiben, wäre eine Formatierungswelle über
~56 000 Zeilen — siehe Offene Punkte.

---

## Phase 1 – Schnelle Gewinne

### 1.1 Navigation — erledigt (`91e0ab9`)
Sieben neue Linien-Icons im hauseigenen Satz (`Icon.tsx`): Urlaub `sun`,
Handwerksscheine `pencil`, Angebote `file`, Kunden `contact`, Wartungen
`wrench`, Lager `archive`, Nachkalkulation `calculator`. Neue Prüfung
`tests/unit/navigationsIcons.test.ts`: je Rolle keine zwei gleichen Zeichen
(schlug auf dem alten Stand für alle sechs Rollen fehl).
„Meine Baustellen“/„Baustellen“ und „Mein Einsatzplan“/„Einsatzplanung“
teilen sich ihr Zeichen bewusst: dieselbe Sache aus zwei Rollen, keine Rolle
sieht beide.
Dateien: `src/components/Icon.tsx`, `src/app/navigation.ts`.

### 1.2 Zahlen und Zeiten — erledigt (`f5fdb4a`)
Regeln: Datum `TT.MM.JJJJ` (Wochentag davor erlaubt); Arbeitszeit, Saldo,
Soll, Zeitausgleich als `HH:MM`, in Sätzen und Listenzeilen mit „Std“
(`fmtDauer`), in Tabellen und Kennzahlen ohne Zusatz (Kopf nennt die
Einheit); Dezimalstunden mit Komma nur bei Budget, Kalkulation, Belegmengen.
Geändert: Startseitenkopf „Freitag, 25.09.2026“; „Std.“ → „Std“ überall;
ZA-Stunden, Tagessoll, Wochenstunden als `HH:MM Std`; Dauern in
Scheinliste, Leistungszeit, Rechnung-gegen-Schein, Zeiterfassung mit „Std“.
Die Beispiele aus dem Auftrag („3.5 h“, „21.55 h“, „Zeiten am 2026-09-24“,
„+9,00 h“ neben „+01:00“) waren durch #147/#152 bereits behoben — per
Textscan aller Routen bestätigt.
Tests angepasst (Anzeigetexte): TimeView, VacationsView, WorkSheetsListView.

### 1.3 Tabellenziffern — erledigt (`07262e1`)
`tabular-nums` global am `body` und an Eingabefeldern; die Einzelklasse
`.tnum` (136 Stellen) und ihre Regel sind entfernt. `ListRow` hat neue
Plätze `zustand` und `wert`: rechte Seite immer Status · Wert · Aktionen,
auch im Umbruch am rechten Rand. Rechnungen, Angebote, Handwerksscheine
zeigen Betrag bzw. Stunden dort. Tabellen hatten rechtsbündige
Zahlenspalten bereits.

### 1.4 Überschriften — erledigt (`9636cd3`)
`.titel-karte` (16 px, 600, Tinte, normale Schreibweise) für Kartentitel
sowie Dialog-/Abschnittsköpfe; freie `h2` von 18 auf 16 px (eine Stufe
kleiner). `.section-label` (Dachzeilen, Kennzahl-Bezeichnungen, Marken) ohne
Versalien und Sperrung. Navigationsgruppen und Anmeldekopf ohne Versalien.

### 1.5 Gestaltungsverbote — erledigt
- Gestrichelt → durchgehende Linie: Unterschriftsfeld, Leerzustand,
  „Wie zuletzt“, Wochenplan „frei“/„Einteilen“ (`2d00de3`).
- Lade-Platzhalter ohne Verlauf und Animation, deckend `--surface-3`
  (`fcf38d4`).
- Alpha-Flächen → deckende Tokens: Kartenkopf/-fuß `surface-2`, dunkle
  Leisten aktiv/hover `ink-deep`, Kalender „Heute“ `info-bg`/`info`
  (Kontrast 3,95 → 5,12:1), Budgetschiene `surface-3`, Helferzeilen
  `warning-bg`, Punkt „ruht“ `ink-placeholder` u. a. (`53884d9`);
  `surface-3` als Tailwind-Farbrolle ergänzt (Token gab es schon).
- Dekorative Icons entfernt: `plus` an 7 Neu-Knöpfen, `download` an 3
  Export-Knöpfen, `clock` in „Wie zuletzt“, `✓` vor „eingeladen“; ungenutzte
  Zeichen `plus`, `download`, `mic` aus `Icon.tsx` gestrichen (`b73a3e3`).
  Behalten: Telefon, Route, Mail, Aufklappen, Schließen, Zurück, Kopfleiste.

### 1.6 Einstellungs-Reiter — erledigt (`4e818a7`)
`.reiterleiste` ohne Scrollleiste; der aktive Reiter wird beim Öffnen und
Wechsel ohne weiches Scrollen ganz ins Bild geholt (`Unterreiter.tsx`).
Ab 640 px bricht die Leiste um und läuft nicht seitlich über. 2 neue Tests.

### 1.7 Wochenplan — erledigt (`24a9593`)
Nummer neben dem Kunden stand seit #152 bereits auf jeder Karte (Tabelle:
eigene Zeile unter dem Kunden, weil die Tageszellen bei 834 px nur 55–80 px
breit sind). Die Blätterpfeile hatten 48 px Tastfläche, das Zeichen darin
war ab 640 px aber nur 16 px groß — jetzt durchgehend `text-xl`. 3 neue
Tests.

### 1.8 Projektauswertung — erledigt
Die Nummer steht überall als gespeicherter Wert (der Vorsatz ist Teil davon).
In der Projektauswertung (`ProjectSummary.tsx`) stand solange die Baustelle
lud „187“ statt „PR-187“ — jetzt `angezeigteNummer()`: Baustellennummer,
sonst die volle Nummer aus einem Eintrag, erst zuletzt der Schlüssel.
1 neuer Test.

### 1.9 Anrede — erledigt (`8e0d098`)
10 Texte in 4 Dateien vom „Sie“ aufs „du“: Supportsitzung-Band,
Katalogimport (5), Kontenrahmen (3), Buchhaltungsexport und Mahn-Bestätigung.

### Prüfung Phase 1
Stand nach Punkt 1.9: typecheck grün, lint grün, `npm test` **185 Dateien,
2370 Tests grün** (2358 auf `main` + 12 neue).

---

## Phase 2 – Gemeinsame Bausteine

**Bausteine** (`src/index.css`, Abschnitt „Gemeinsame Bausteine“, je Element
eine Klasse, keine positionsabhängigen Selektoren; Komponenten in
`src/components/`): Karte (`.karte`, `-offen`, `-dialog`, `-fehler`,
`-anmeldung`, `.blatt`, Kopf/Inhalt/Fuß), Knopf je Rolle und Größe,
Symbolknopf, Feld und Zellfeld (16 px), Kästchen, Feldraster, Listenzeile
mit Plätzen `zustand` und `wert`, Zeilenmenü, Kennzahl (Trenner als eigenes
Element), Tabelle, Kasten, Meldung, Textlink, ruhiger Leerzustand,
Lade-Platzhalter, Grenzliste („und X weitere“), Aktionsleiste (klebt am
Telefon über der Tableiste), Seitenkopf. `.panel` und `.checkbox` entfernt.

**Umstellung aller Stellen** (Commits `da7d39a` … `f812b7f`, je Bereich):
Rechnungen, Angebote, Kunden/Akte/Import, Nachkalkulation,
Mitarbeiterübersicht, Katalogimport, Wartungen; Startseite, Zeiterfassung,
Urlaub, Einsatzplanung, Baustellen; Material, Benutzer, Einstellungen,
Module, Plattform, Anmeldung, Rechtsseiten, App-Rahmen, Komponenten.
Rund 60 Hinweiskästen → `Meldung`, eigene Listen → `ListRow`,
Begrenzungen → `Grenzliste` (Startseite 3×, Einsatzplan, Kundenakte,
Katalog- und Kundenimport), Aktionsleiste in Zeitmaske, Angebot,
Rechnung, Baustelle anlegen/Akte, Benutzerakte, Sätze, Firmendaten,
Module. Nebenbei behoben: mehrere Auswahlfelder mit 14 px Schrift (iOS-
Zoom) auf 16 px, „Foto entfernen“ von 28 auf 44 px, Alpha-Kanten an
Speicherleisten.

**Gemeinsame Regel, die dabei entstand:** Klassennamen immer wörtlich —
Tailwind verwirft aus `@layer components` zusammengesetzte Namen.

## Phase 4 – Handwerksschein als Schrittfolge (auf Wunsch in diesem Durchgang)

Am Telefon und Tablet: 1 Zeiten · 2 Material · 3 Fotos · 4 Unterschrift, mit
Schrittleiste (jeder Schritt direkt anspringbar), „Zurück“/„Weiter“ in der
Aktionsleiste, Zusammenfassung mit „Ändern“ vor den Unterschriften,
„Als Entwurf speichern“ in jedem Schritt. „Weiter“ sperrt nie. Alle Teile
bleiben eingehängt (nur ausgeblendet) — sonst gingen Striche und
Nicht-übernommen-Sperren verloren. Ab 1024 px eine Seite mit nummerierten
Abschnitten. Neuer Test belegt: Schritte und Einzelseite ergeben
zeichengleich denselben kanonischen Inhalt für die Prüfsumme. Durchklick-Weg
auf die Schritte umgestellt (läuft in der CI).

## Phase 3 – Ansichten ordnen

### 3a Monteur-Start — erledigt (`40d6851`, `12c12bf`)
Drei Karten: Heute (Baustelle, Nummer, Aufgabe, Route, Anruf, Rüstliste;
Hauptknopf „Wie zuletzt buchen“ mit Zeile „07:00–16:00 · 30 min Pause ·
08:30 Std“, nur bei derselben Baustelle), Diese Woche (Stunden gegen Soll,
Saldo des Monats), Offen für dich (fehlende Tage mit Datum, angefordertes
Material, sonst „Alles erledigt.“). Am Schreibtisch zweispaltig. Nur
bereits geladene Daten.

### 3b Büro-Startseite — erledigt (`57d5155`)
Die vorhandenen Kennzahlen stehen oben als Links; die Karten mit
Obergrenze laufen über `Grenzliste`.

### 3c Desktop-Listen — erledigt (ab 1280 px)
Rechnungen, Anforderungen, Kunden, Baustellen, Mitarbeiterübersicht stehen
am Schreibtisch als Tabelle mit denselben Aktionen (`RowMenu`, „Akte“,
„Aus Lager“, Aufklappen). Eine Breitenweiche `useAbBreite` legt genau EINE
Form ins DOM; ohne `matchMedia` (jsdom) bleibt die Listenform. Beträge,
Mengen, Stunden rechtsbündig; Datum, Telefon, Status brechen nicht um.
Neue Tests je Ansicht („am Schreibtisch“) und für die Weiche.

### 3d Akten — erledigt (ab 1280 px)
Kunde, Baustelle, Angebot: Stammdaten links (3 fr), Zugehöriges rechts
(2 fr), darunter einspaltig in bisheriger Reihenfolge. Die Aktionsleiste im
Stammdaten-Formular klebt weiter.

### 3e Zeiterfassung, Material, Urlaub — erledigt
Dauern mit „Std“, Marker am Titel statt rechts (am Telefon rutschte sonst
„Löschen“ in eine eigene Reihe). „Nicht im Katalog?“ schob auf 390 px das
Mengenfeld aus der Karte — behoben. Retoure, Urlaubsantrag und
Betriebsurlaub mit Aktionsleiste. Einkaufsliste ohne `divide-y`, Fehler als
Meldung. Überschneidung im Urlaub als Warnmeldung; „Mitarbeiter ausnehmen“
als Aufklappkopf wie „Weitere Angaben“.

### 3f Mein Einsatzplan, Meine Baustellen, Einstellungen — erledigt
Einsatz wie am Monteur-Start (Kunde, „Nummer · Aufgabe“, Knöpfe,
Kontaktzeile); „Nächste Einsätze“ mit Baustellennummer. Meine Baustellen ab
1280 px zweispaltig, Leer- und Ladezustand als ruhige Zeile. Kontenrahmen
und Nummernkreise mit Aktionsleiste. Material am Schein ohne `divide-y`.

### 3g Einsatzplanung — erledigt
Wochenplan/Team-Woche: Farbe nur für Zustände (frei, heute, kein Dienst),
deckend; Einsätze weiß mit Haarlinie; Feiertag mit Namen; Tagesspalten
mit Mindestbreite. Tag planen im Raster wie Mein Einsatzplan, Speichern in
der Aktionsleiste. Kalender-Legende als ein Baustein für beide Ansichten.

### 3h Angebote, Wartungen, Lager, Handwerksscheine-Liste — erledigt
Reiter als ein Baustein. Lager: Bestand und Katalog ab 1280 px als
Tabelle. Angebote: Unterzeile in einer Zeile. Wartungen: Was/Wo, darunter
Wann; Formular mit Aktionsleiste. Scheine: Nummer vorn in der Unterzeile,
Einzelheiten als Gruppe, Storno mit Aktionsleiste.

### 3i Benutzer, Nachkalkulation, Projektauswertung, Rahmen — erledigt
Benutzerverwaltung ab 1280 px als Tabelle, Anlegen mit Aktionsleiste;
Benutzerakte zweispaltig, Zahlen mit Komma; Nachkalkulation als Tabelle mit
Betragsspalten; Projektauswertung als aufklappbare Tabelle; Plattform-Frist
mit Jahr; Datenschutz-Unterauftragsverarbeiter als Liste. Anmeldung,
Module, Impressum waren schon ruhig.

## Abschlussprüfung (25.09.2026)

- `npm run typecheck`, `npm run lint`: grün. `npm test`: 190 Dateien,
  2442 Tests grün. `vite build`: grün.
- Aufnahmen aller Routen × Rollen × 390/834/1440: 339 Bilder,
  0 mit seitlichem Scrollen, 0 mit JS-Fehlern (vorher ebenso 339/0/0).
- Rückstandssuche: keine gestrichelten/gepunkteten Linien, keine Verläufe,
  keine Emojis. Halbtransparent nur noch die Abdunkler hinter Dialogen
  (Punkt 5), Linien mit Deckkraft (`border-white/15`, `border-line/60`,
  `border-brand/30`) und weiße Schrift mit Deckkraft auf der dunklen
  Seitenleiste (gemessen ≥ 4,9 : 1). Alle 232 Klassen aus `index.css`
  werden im Quelltext wörtlich verwendet. Kein `divide-*` mehr.
- Datenbank-Prüfungen und Browserwege: in der CI des Pull-Requests.

## Linie nach den Vorlagen (zweiter Durchgang, 25.09.2026)

Auf Wunsch: näher an den Mockups (S. 1–8), eine durchgängige Linie über
alle Screens. Maßstab: `docs/design/linie.md`.

- **Grundlage:** Karte ohne Kopfstreifen, Titel innen, Zahl/Stand rechts in
  der Titelzeile (`Card anzahl`); Seitenkopf mit kleiner Zeile darüber
  (Datum · KW oder Rückweg), großer Titel, Metazeile, Hauptaktion rechts;
  `ListRow ziel` (ganze Zeile, Pfeil); Kontakt als Chips; Aktionsleiste mit
  Summenzeile, Knöpfe nebeneinander; Seitenleiste mit Senklot oben und dem
  Betrieb darunter, „Start“, Einstellungen am Ende; Inhalt bis 80 rem;
  Unterreiter unter dem Seitenkopf; Listentitel halbfett, Werte fett.
- **Start:** Gruß mit Datum · KW, am Telefon dunkles Kopfband, Heute ohne
  Kasten, Wochenbalken aus den Buchungen, Offen als Pfeilzeilen, Nächste
  Einsätze; Büro-Start mit Pfeilzeilen und Chips, zwei Spalten.
- **Handwerksschein:** Kopf und Schrittbalken, Summen in der Aktionsleiste,
  Zusammenfassung mit „Ändern“, Unterschrift im großen Blatt (Querformat)
  mit Export auf feste Fläche; Desktop zweispaltig mit nummerierten Karten.
- **Listen:** Seltenes ins Zeilenmenü; Angebote, Scheine, Wartungen, Lager,
  Benutzer, Nachkalkulation als Tabellen; Suche überall oben in der Karte.
- **Akten:** Rückweg über dem Titel, rechte Spalte als Pfeilzeilen.
- **Rahmen:** Anmeldung, Plattform, Recht mit derselben Marke; Tableiste
  mit heller Pille; Kennzahlen als eigene Karte, am Tablet zweispaltig.
- **Beträge** aus einem Ort (`betrag`, `euro`, `euroGanz`).

Prüfung: typecheck, lint grün; `npm test` 192 Dateien / 2765 Tests grün;
Aufnahmen aller Routen × Rollen × 390/834/1440: 339 Bilder, 0 mit
seitlichem Scrollen, 0 JS-Fehler; Rückstandssuche ohne Befund (Ausnahmen
wie Punkt 5); alle CSS-Klassen werden verwendet. Datenbankprüfungen und
Browserwege in der CI.
