# Design-Durchgang Senklot — Fortschritt

Grundlage: Masterprompt „Design-Überarbeitung Senklot“, Phasen 0 bis 3.
Zweig: `claude/senklot-design-durchgang`, abgezweigt von `main` @ `99ea2fa`.
Ausgangslage der Prüfsuite auf `main`: **181 Testdateien, 2295 Tests, alle grün**.

## Statusübersicht

| Punkt | Status | Commits |
|---|---|---|
| Phase 0 – Bestandsaufnahme | erledigt | (dieses Dokument) |

## Offene Punkte

(laufend ergänzt; Ort · Begründung · Vorschlag)

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
- `src/components/SignaturePad.tsx:383` — Unterschriftsfeld
- `src/components/States.tsx:120` — Leerzustand
- `src/features/time/TimeForm.tsx:646` — „Wie zuletzt“-Knopf
- `src/features/assignments/WochenplanView.tsx:502, 642` — „Einsatz hinzufügen“

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
