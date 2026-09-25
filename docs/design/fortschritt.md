# Design-Durchgang Senklot — Fortschritt

Grundlage: Masterprompt „Design-Überarbeitung Senklot“.

**Verlauf.** Ein erster Durchgang (#153, #154) setzte die Phasen 0–4
samt neuer Designlinie um. Im Betrieb gefiel die neue Linie nicht; mit
#155 kam die App auf die bisherige Gestaltung zurück — nur die neuen
Menü-Symbole (1.1) und der Handwerksschein in Schritten (Phase 4) blieben.
#156 vereinheitlichte die Links. Vorgabe seither: **die Grundgestaltung
bleibt, alles andere wird umgesetzt, nichts verschlimmbessert.** Die
Einzel-Commits der Phase 1 aus dem ersten Durchgang wurden dafür
unverändert übernommen (Hashes unten sind die neuen).

## Statusübersicht

| Punkt | Status | Commits |
|---|---|---|
| Phase 0 – Bestandsaufnahme | erledigt | `f3ec8b5`, `5093a36` |
| 1.1 Navigation: eigene Icons | erledigt (#155) | — |
| 1.2 Zahlen und Zeiten einheitlich | erledigt | `37f46c3` |
| 1.3 Tabellenziffern, rechtsbündige Werte | erledigt | `9a89654`, `fdada0c`, `f3af455` |
| 1.4 Überschriften | erledigt | `cc8e19d` |
| 1.5 Gestaltungsverbote | erledigt | `fe695fc`, `7ef54f7`, `562e2be`, `068ee8a` |
| 1.6 Einstellungs-Reiter | erledigt | `c295b92`, `407450c` |
| 1.7 Wochenplan | erledigt | `bca0a52`, `3459cc4` |
| 1.8 Projektauswertung | erledigt | `3d6919e` |
| 1.9 Anrede „du“ | erledigt | `6b33a59` |
| Phase 2 – Gemeinsame Bausteine | bewusst nicht umgesetzt | — |
| Phase 3 – Ansichten ordnen | bewusst nicht umgesetzt | — |
| Phase 4 – Schein in Schritten | erledigt (#155) | — |
| Phase 4 – Unterschrift quer | erledigt | `ec7bfb1`, `23c522a` |

**Warum Phase 2 und 3 nicht.** Beide verändern die Grundgestaltung
(neue Karten, Listenzeilen, Tabellen statt Listen, Monteur-Start als drei
Karten, zweispaltige Akten). Genau das wurde im ersten Durchgang umgesetzt
und im Betrieb zurückgenommen. Sie bleiben offen, bis es einen
freigegebenen Entwurf gibt.

**Unterschrift quer.** Unter jedem Unterschriftsfeld steht unter 1024 px
„Groß unterschreiben“: dieselbe Zeichenfläche bildschirmfüllend, im
Hochformat mit dem Hinweis, das Gerät quer zu halten. Das Feld im Formular
bleibt, wie es war (kein zusätzlicher Tipp). Die Striche wandern mit und
werden ins Feld eingepasst; das Bild für den Schein entsteht wie bisher aus
dem Feld — Format, Prüfsumme und PDF unberührt.

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
7. ~~**Foto-Entfernen-Knopf** im Schein 28 × 28 px.~~ Erledigt (`06991d9`):
   Tastfläche 44 × 44 px, sichtbar derselbe kleine Kreis.
8. **Datenschutzerklärung siezt** (`src/features/recht/DatenschutzView.tsx`,
   12 Stellen) — Rechtstext, inhaltlich nicht verändert. Kundentexte (PDF,
   Mahnung, Bestellmail an den Großhandel) bleiben bewusst beim „Sie“.
9. ~~**Weitere Reiterleisten** ohne automatisches Einscrollen.~~ Erledigt
   (`407450c`): Material, Lager, Anforderungen und Urlaub holen den gewählten
   Reiter wie die Einstellungen ganz ins Bild (`useReiterImBild`).
10. ~~**Wochenplan-Karten, zugängliche Namen** ohne Nummer.~~ Erledigt
    (`3459cc4`): das `aria-label` nennt die Baustellennummer mit; die Tests
    sind bewusst angepasst.
11. **Legende „Heute“** in Einsatzplanung/Mein Einsatzplan trug die
    Mandantenfarbe (`brand/25`) und trägt jetzt deckend `info-bg` wie der
    Kalender — kleine inhaltliche Angleichung.

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
