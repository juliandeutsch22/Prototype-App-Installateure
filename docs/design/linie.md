# Designlinie „Fassung 3“ (Entwurf vom 26.09.2026)

Diese Datei ist die **verbindliche Vorgabe** für die Umsetzung. Sie ist so
geschrieben, dass sie ohne weiteres Wissen aus dem Chat befolgt werden kann.
Der Ablauf der Umsetzung (Reihenfolge, Prüfungen, Regeln) steht in
`docs/design/umsetzung.md`. Die Bilder des Entwurfs liegen in
`docs/design/entwurf-2026-09-26/v3/`, die Quellen dazu in
`docs/design/entwurf-2026-09-26/quelle/` (siehe Abschnitt 12).

Ziel: **modern, ruhig, intuitiv; auf jeder Seite passend; der Charakter der
App bleibt.** Am Telefon (auch 375 px, iPhone XS) muss alles sauber
umbrechen, nichts läuft aus dem Bild.

---

## 1. Was bleibt (der Charakter)

Diese Dinge werden **nicht** verändert:

| Bleibt | Wo |
|---|---|
| Dunkles Petrol (`--brand`) für Kopfleiste, Reiterleiste unten und Seitenleiste, jeweils mit **weißer Fuge** (3 px) zum Inhalt | `src/app/Layout.tsx`, `.panel-dark` |
| Heller Grund `--bg`, weiße Karten mit Haarlinie `--border` und weichem Schatten `--shadow` | `.panel` |
| Schrift Poppins, Ziffern mit fester Breite (`tabular-nums` am `body`) | `src/index.css` |
| Kurzer türkiser Strich unter jeder H1 (`--brand-fixed`) | `src/components/PageHeader.tsx` |
| Türkiser Avatar mit Initialen (`--accent-bright`) | `src/components/Avatar.tsx` |
| Menü-Symbole, Reiter unten am Telefon (5 Reiter), Seitenleiste ab 1024 px | `src/app/navigation.ts`, `Layout.tsx` |
| Alle Texte, Beschriftungen, `data-testid`, `aria-label`, Routen, Datenlogik | überall |

Keine neuen Farben. Alle Werte kommen aus den Tokens in `src/index.css`.

## 2. Was sich ändert (die Linie in einem Absatz)

Weniger Kästen, mehr Zeilen. Jede Seite hat **einen** Seitenkopf mit Titel,
Strich, einer Meta-Zeile und höchstens **einer** Hauptaktion rechts. Inhalt
steht in **wenigen, einstufigen Karten**: statt Karte-in-Karte gliedern
getönte **Abschnittszeilen** innerhalb einer Karte. Listen sind **Zeilen**
(Titel, Meta darunter, Wert oder Status rechts, Pfeil). Kennzahlen sind
**eine Leiste** mit Trennlinien, keine Einzelkacheln. Status ist **grauer
Text mit farbigem Punkt**, keine gefüllte Pille. Rot nur für „Überfällig“.
Hinweise stehen als **Zeile ohne Kasten**. Schrift ist höchstens **600**
(halbfett), nie fett. Rundungen kleiner: Karte 12 px, Knopf und Feld 10 px,
Kleines 8 px. Am Telefon haben Formulare eine **feste Aktionsleiste** unten
mit Summe und zwei Knöpfen. Am Schreibtisch stehen Akten **zweispaltig**
(7:5), Listen als **Tabellen** mit rechtsbündigen Zahlen.

## 3. Abgelehnte Richtungen (nicht wieder vorschlagen)

Diese Varianten wurden gezeigt und **abgelehnt**:

- Fassung 1: pastellfarbene Kacheln, farbige Statuspillen mit Füllung,
  fette Zahlen (700), großer türkiser Kopfblock. Urteil: „zu bunt, zu
  verspielt“.
- Fassung 2: ruhiger, aber „zu dicke Zahlen/Schrift“, farbige Pillen und
  **zu viele weiße Karten** (Karte in Karte, jede Gruppe ein eigener Kasten).
- Aus dem ersten Durchgang (#153/#154, zurückgenommen mit #155): iOS-artige
  gruppierte Listen mit grauem Grund, komplett neue Farbwelt, Emojis,
  gestrichelte Rahmen, halbtransparente Flächen.
- **Pillen in jeder Form** (Entscheid vom 28.09.2026): Die Bilder dieser
  Fassung zeigen die Filter („Alle · Offen · Überfällig · Bezahlt") als
  umrandete Kästchen. Das wird **nicht** so umgesetzt – die App soll nicht
  wieder bunt oder verspielt werden. Filter sind Textreiter mit Unterstrich
  unter dem gewählten (`.chips`/`.chip`, Abschnitt 6). Status bleibt Punkt
  plus grauer Text. Wo die Bilder davon abweichen, gilt dieser Text.

## 4. Tokens

Bestehende Tokens in `src/index.css`. Nur die **Rundungen** werden geändert;
alles andere bleibt.

```css
/* :root in src/index.css — NUR diese drei Werte ändern */
--radius-sm: 0.5rem;   /* 8 px  · Chips, kleine Knöpfe, Reitersymbol      (war 0.625rem) */
--radius:    0.625rem; /* 10 px · Knöpfe, Eingabefelder, Suche, Segment   (war 0.875rem) */
--radius-lg: 0.75rem;  /* 12 px · Karten, Kennzahlleiste                  (war 1.125rem) */
```

Zuordnung der Namen aus dem Entwurf (`quelle/stil.css`) zu den Tokens der App:

| Entwurf | App |
|---|---|
| `--muted` | `--text-muted` (Tailwind `text-ink-muted`) |
| `--placeholder` | `--text-placeholder` (`text-ink-placeholder`) |
| `--text` | `--text` (`text-ink`) |
| `--ink-deep` | `--ink-deep` (`text-ink-deep`) |
| `--r` / `--r-lg` | `--radius` / `--radius-lg` |
| `#9fb3bb` (leiser Punkt, fertige Schritte) | `--text-placeholder` verwenden |
| `#7f95a0` (Pfeil) | `--text-placeholder` verwenden |

## 5. Schriftskala

Alle Größen in px (Tailwind-Klasse in Klammern, wo es eine gibt). Gewicht
**maximal 600**. `font-bold`/700 nur für den Avatar und die Zähler auf der
dunklen Leiste (bleibt wie es ist).

| Element | Telefon | Schreibtisch (≥1024) | Gewicht | Farbe |
|---|---|---|---|---|
| H1 Seitentitel | 24 / 30 | 30 / 36 | 600 | `--ink-deep` |
| Meta-Zeile unter H1 | 13.5 / 20 (`text-sm`) | gleich | 400 | `--text-muted` |
| Kartentitel (h2 im Kartenkopf) | 16 / 22 (`text-base`) | gleich | 600 | `--ink-deep` |
| Abschnittstitel (in der Karte) | 15 / 20 | gleich | 600 | `--ink-deep` |
| Zeilentitel | 15 / 21 | gleich | 500 | `--ink-deep` |
| Zeilen-Meta | 13 / 18 | gleich | 400 | `--text-muted` |
| Wert rechts in der Zeile | 15 | gleich | 500 | `--ink-deep` |
| Fließtext, Felder | 15 / 22 (Felder 16, damit iOS nicht zoomt) | gleich | 400 | `--text` |
| Kennzahl Wert | 21 / 28 | 24 / 32 | 600 | `--ink-deep` |
| Kennzahl Name / Zusatz | 13 / 12.5 | gleich | 400 | `--text-muted` |
| Status (Text mit Punkt) | 12.5 | gleich | 500 | `--text-muted` |
| Hinweiszeile | 13.5 / 19 | gleich | 400, Kern 600 | `--text-muted`, Kern `--ink-deep` |
| Tabellenkopf | 12.5 | gleich | 600 | `--text-muted` |
| Tabellenzelle | 14 | gleich | 400, Hauptspalte 500 | `--text` |
| Knopf | 15 | gleich | primär 600, sekundär 500 | |
| Filter (Textreiter) / Segment | 13.5 / 14 | gleich | 500, aktiv 600 | gedämpft, aktiv Tinte mit Unterstrich |
| Reiter unten | 11.5 | – | 500 | Weiß 72 %, aktiv 100 % |

Zeilenumbruch: am `body` zusätzlich `overflow-wrap: anywhere; hyphens: auto;`
(`lang="de"` steht im HTML). Lange Wörter wie
„Wohnungseigentümergemeinschaft“ dürfen nie überlaufen.

## 6. Bausteine (CSS)

Die folgenden Klassen kommen nach `src/index.css` in den bestehenden Block
`@layer components { … }`. Namen sind neu und kollidieren mit nichts
Vorhandenem (geprüft: `.karte`, `.zeile`, `.stand`, `.chip`, `.segment`,
`.abschnitt`, `.kennzahlen`, `.aktionsleiste`, `.seitenkopf`, `.hinweiszeile`,
`.schritte` kommen im Quelltext nicht vor). **`.link` nicht anfassen** – die
Klasse existiert (türkis, 600) und wird von vielen Stellen benutzt; für die
ruhigen Links der Linie gibt es `.link-still`.

Wo eine Komponente schon existiert, wird sie **in place** umgestellt
(Abschnitt 7), damit alle Verwender die Linie bekommen, ohne dass jede
Ansicht angefasst werden muss.

```css
/* ── Seitenkopf ─────────────────────────────────────────────────────── */
.seitenkopf { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.seitenkopf h1 { font-size: 1.5rem; line-height: 1.875rem; font-weight: 600; color: var(--ink-deep); letter-spacing: -0.01em; }
@media (min-width: 1024px) { .seitenkopf h1 { font-size: 1.875rem; line-height: 2.25rem; } }
.seitenkopf-strich { width: 2rem; height: 3px; border-radius: 2px; background: var(--brand-fixed); margin: 0.5rem 0 0.375rem; }
.seitenkopf-meta { font-size: 0.84375rem; line-height: 1.25rem; color: var(--text-muted); }
.seitenkopf-rechts { display: flex; gap: 0.5rem; align-items: center; flex: none; }

/* ── Karte: EINE Ebene, innen Zeilen und Abschnitte ─────────────────── */
/* .panel bleibt die Karte (Hintergrund, Rand, Schatten, --radius-lg). Dazu: */
.karte-kopf { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.875rem 1rem 0.625rem; }
.karte-kopf h2 { font-size: 1rem; line-height: 1.375rem; font-weight: 600; color: var(--ink-deep); }
.anzahl { color: var(--text-muted); font-weight: 500; margin-left: 0.375rem; }
.karte-koerper { padding: 0 1rem 1rem; }
.karte-fuss { border-top: 1px solid var(--border); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.875rem; }
.abschnitt { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem 0.5rem; border-top: 1px solid var(--border); background: var(--surface-2); }
.abschnitt h2, .abschnitt h3 { font-size: 0.9375rem; line-height: 1.25rem; font-weight: 600; color: var(--ink-deep); }

/* ── Zeile ──────────────────────────────────────────────────────────── */
.zeile { display: flex; align-items: center; gap: 0.75rem; min-height: 3.5rem; padding: 0.625rem 1rem; border-top: 1px solid var(--border); }
.zeile:first-child { border-top: 0; }
.zeile-text { flex: 1; min-width: 0; }
.zeile-titel { font-size: 0.9375rem; line-height: 1.3125rem; font-weight: 500; color: var(--ink-deep); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.zeile-meta { font-size: 0.8125rem; line-height: 1.125rem; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.zeile-wert { font-size: 0.9375rem; font-weight: 500; white-space: nowrap; text-align: right; color: var(--ink-deep); }
.zeile-wert small { display: block; font-size: 0.78125rem; font-weight: 400; color: var(--text-muted); }
.zeile-pfeil { color: var(--text-placeholder); flex: none; width: 1rem; height: 1rem; }

/* ── Stand: grauer Text mit farbigem Punkt (die einzige Farbe im Inhalt) ── */
.stand { display: inline-flex; align-items: center; gap: 0.375rem; height: 1.375rem; font-size: 0.78125rem; font-weight: 500; white-space: nowrap; color: var(--text-muted); }
.stand::before { content: ''; width: 7px; height: 7px; border-radius: 999px; background: var(--surface-3); flex: none; }
.stand-ok::before { background: var(--success); }
.stand-warn::before { background: var(--warning); }
.stand-fehl { color: var(--danger); } .stand-fehl::before { background: var(--danger); }
.stand-info::before { background: var(--accent-deep); }
.stand-leise::before { background: var(--text-placeholder); }

/* ── Hinweiszeile statt Warnkarte ───────────────────────────────────── */
.hinweiszeile { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.125rem 0.25rem; font-size: 0.84375rem; line-height: 1.1875rem; color: var(--text-muted); }
.hinweiszeile svg { width: 1rem; height: 1rem; flex: none; margin-top: 1px; }
.hinweiszeile b { font-weight: 600; color: var(--ink-deep); }
.hinweiszeile-warn svg { color: var(--warning); }
.hinweiszeile-fehl svg { color: var(--danger); }
.hinweiszeile a { text-decoration: underline; text-underline-offset: 3px; font-weight: 500; color: var(--ink-deep); }

/* ── Kennzahlen: EINE Leiste mit Trennlinien ────────────────────────── */
.kennzahlen { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
.kennzahl { padding: 0.75rem 1rem; border-right: 1px solid var(--border); min-width: 0; }
.kennzahl:nth-child(2n) { border-right: 0; }
.kennzahl:nth-child(n+3) { border-top: 1px solid var(--border); }
/* Eine einzelne Kennzahl nimmt die ganze Leiste, statt eine leere Hälfte neben sich zu lassen. */
.kennzahl:only-child { grid-column: 1 / -1; border-right: 0; }
/* Am Schreibtisch EINE Reihe mit so vielen Spalten, wie es Kennzahlen gibt
   (in der App höchstens vier) — vier feste Spalten liessen eine Leiste mit
   zwei Werten zur Hälfte leer stehen. */
@media (min-width: 1024px) {
  .kennzahlen { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
  .kennzahl:nth-child(2n) { border-right: 1px solid var(--border); }
  .kennzahl:last-child { border-right: 0; }
  .kennzahl:nth-child(n+3) { border-top: 0; }
}
.kennzahl-name { font-size: 0.8125rem; line-height: 1.125rem; color: var(--text-muted); }
.kennzahl-wert { font-size: 1.3125rem; line-height: 1.75rem; font-weight: 600; color: var(--ink-deep); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (min-width: 1024px) { .kennzahl-wert { font-size: 1.5rem; line-height: 2rem; } }
.kennzahl-zusatz { font-size: 0.78125rem; color: var(--text-muted); margin-top: 2px; }

/* ── Feste Aktionsleiste am Telefon ─────────────────────────────────── */
/* Sitzt über der Reiterleiste; `--reiter-hoehe` setzt Layout.tsx (Höhe der Reiterleiste). */
.aktionsleiste { position: sticky; bottom: 0; z-index: 10; background: var(--surface); border-top: 1px solid var(--border); padding: 0.625rem 0.875rem 0.75rem; margin: 0 -0.875rem; }
.aktionsleiste-summe { display: flex; justify-content: space-between; font-size: 0.84375rem; color: var(--text-muted); margin-bottom: 0.5rem; }
.aktionsleiste-summe b { color: var(--ink-deep); font-size: 0.9375rem; font-weight: 600; }
.aktionsleiste-knoepfe { display: grid; grid-template-columns: 1fr 2fr; gap: 0.5rem; }
@media (min-width: 1024px) { .aktionsleiste { position: static; margin: 0; border-top: 0; padding: 0; background: transparent; } .aktionsleiste-knoepfe { grid-template-columns: auto auto; justify-content: end; } }

/* ── Schritte (Handwerksschein) ─────────────────────────────────────── */
.schritte { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.375rem; }
.schritt { font-size: 0.75rem; font-weight: 500; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
.schritt i { display: block; height: 4px; border-radius: 2px; background: var(--surface-3); margin-bottom: 0.375rem; }
.schritt-fertig i { background: var(--text-placeholder); }
.schritt-jetzt i { background: var(--brand-fixed); } .schritt-jetzt { color: var(--ink-deep); }

/* ── Suche, Chips, Segment ──────────────────────────────────────────── */
.suche { display: flex; align-items: center; gap: 0.625rem; height: 2.75rem; padding: 0 0.875rem; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); font-size: 0.9375rem; flex: 1; }
/*
 * FILTER SIND TEXTREITER, KEINE PILLEN (Entscheid vom 28.09.2026). Der
 * Entwurf zeigte die Filter als umrandete Kästchen; das ist die Pillenform,
 * die schon zweimal als „zu bunt, zu verspielt" abgelehnt wurde. Hier also
 * Text mit einem Unterstrich unter dem gewählten — dieselbe Sprache wie die
 * übrigen Reiter der App. 44 px Tastfläche bleiben.
 */
.chips { display: flex; flex-wrap: wrap; column-gap: 1rem; }
.chip { display: inline-flex; align-items: center; gap: 0.375rem; min-height: 2.75rem; padding: 0 0.125rem; border-bottom: 2px solid transparent; background: none; font-size: 0.84375rem; font-weight: 500; color: var(--text-muted); white-space: nowrap; }
.chip-an { color: var(--ink-deep); font-weight: 600; border-bottom-color: var(--brand-fixed); }
.segment { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); overflow: hidden; }
.segment > * { display: flex; align-items: center; justify-content: center; min-height: 2.625rem; font-size: 0.875rem; font-weight: 500; color: var(--text-muted); border-right: 1px solid var(--border); }
.segment > *:last-child { border-right: 0; }
.segment > .segment-an { background: var(--surface-2); color: var(--ink-deep); font-weight: 600; }

/* ── Tabelle (Schreibtisch) ─────────────────────────────────────────── */
.tabelle { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.tabelle th { font-size: 0.78125rem; font-weight: 600; color: var(--text-muted); text-align: left; padding: 0.625rem 1rem; border-bottom: 1px solid var(--border); background: var(--surface-2); white-space: nowrap; }
.tabelle td { padding: 0.6875rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
.tabelle tr:last-child td { border-bottom: 0; }
.tabelle .r { text-align: right; }
.tabelle-eng th, .tabelle-eng td { padding: 0.5rem 0.3125rem; }

/* ── Zwei Spalten (Akten am Schreibtisch) ───────────────────────────── */
.zwei-spalten { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; align-items: start; }
@media (min-width: 1024px) { .zwei-spalten { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 1.25rem; } }
.spalte { display: flex; flex-direction: column; gap: 0.75rem; }
@media (min-width: 1024px) { .spalte { gap: 1.25rem; } }

/* ── Ruhige Textlinks ───────────────────────────────────────────────── */
.link-still { color: var(--ink-deep); font-weight: 500; font-size: 0.875rem; text-decoration: none; }
.karte-kopf .link-still, .karte-fuss .link-still, .abschnitt .link-still, .textlinks .link-still { color: var(--text-muted); }
.link-still-weiter::after { content: '\00a0›'; }
.link-still:hover { text-decoration: underline; text-underline-offset: 3px; }
.textlinks { display: flex; gap: 1.125rem; padding: 0.125rem 0.25rem; font-size: 0.875rem; flex-wrap: wrap; }
```

Seitenabstände: Inhalt am Telefon `padding: 14px 14px` und `gap: 12px`
zwischen den Blöcken; am Schreibtisch `padding: 28px 36px`, Inhalt
`max-width: 1180px`, `gap: 20px`. Unten muss am Telefon Platz für
Reiterleiste **und** Aktionsleiste bleiben (heute schon `pb` im Layout,
prüfen, dass nichts verdeckt wird).

## 7. Bestehende Komponenten und wie sie umgestellt werden

| Komponente | Heute | Neu |
|---|---|---|
| `PageHeader` | `text-xl sm:text-2xl`, Strich `w-12`, Untertitel `mt-2` | Klassen aus Abschnitt 6: `.seitenkopf`, `.seitenkopf-strich` (32 px), `.seitenkopf-meta`; `action` in `.seitenkopf-rechts`. Signatur unverändert. |
| `Card` (`.panel`) | Kopf mit `bg-surface-2` und Rand unten; Titel `.titel-karte` | Kopf ohne Tönung: `.karte-kopf` (weiß, kein Rand unten); erste `.zeile` darunter bekommt die Trennlinie. `.titel-karte` bleibt (16/600). Neue Props: `abschnitte` **nicht** nötig – Abschnitte sind ein eigenes Element (unten). `footer` → `.karte-fuss`. |
| neu `Abschnitt` (`src/components/Abschnitt.tsx`) | – | `<div class="abschnitt"><h3>{titel}<span class="anzahl">· {anzahl}</span></h3>{link}</div>`. Ersetzt Karte-in-Karte. |
| `ListRow`/`List` | `li` mit `py-3`, `flex-wrap`, Aktionen rechts | `li.zeile` mit `.zeile-text` (`.zeile-titel`, `.zeile-meta`), `zustand` als `.stand`, `wert` als `.zeile-wert`, optional Pfeil (`pfeil`-Prop, Standard bei Zeilen, die eine Akte öffnen). `List` → `ul` ohne `divide-y` (die Zeilen tragen den Rand oben). Props und `children` bleiben. |
| `Metric`/`MetricRow` | 2 Spalten am Telefon, `sm:flex divide-x`, Wert `font-bold` | `MetricRow` → `.kennzahlen` (Leiste mit Rand und Schatten), `Metric` → `.kennzahl` mit `.kennzahl-name/-wert/-zusatz`. Wert **600**, nie `font-bold`. `tone="danger"` färbt nur den Wert (Überfällig). `to` bleibt (Pfeil „›“ im Namen). |
| `StatusBadge`, `Zustand` | Punkt 6 px + Text `text-ink font-semibold` | `.stand` + `.stand-ok/-warn/-fehl/-info/-leise`: Text **`--text-muted`, 500**, Punkt 7 px. Zuordnung `Stand` → Klasse: gut→ok, achtung→warn, schlecht→fehl, laeuft→info, ruht→leise. `StatusBadge` bleibt die Tabelle Status→Stand (unverändert). |
| `Warnung` | Pille mit farbigem Rand | **keine Pille mehr** (Entscheid 28.09.2026): `.stand-warn` bzw. bei `stufe="dringend"` `.stand-fehl` — Punkt plus Wort wie der Status. **Warnkarten** in Ansichten werden zu `.hinweiszeile` (Symbol + Text + Link), keine Fläche. |
| `Button` | `rounded` (14 px), `font-semibold` für alle Varianten, `py-2` | `rounded` (jetzt 10 px durch Token), `min-h-touch` bleibt; `primary` 600, `secondary`/`ghost` **500**; `groesse="klein"` → `min-h-[2.25rem] rounded-sm text-sm`. |
| `Field` (`InputField`, `SelectField`) | | Höhe 48 px, `rounded` (10 px), Schrift 16 px, Label 13 px 600 `--ink-deep`. |
| `Schrittfolge` (Handwerksschein) | Nummernkreise + Text, `border-b-2` | `.schritte`/`.schritt`, **ohne Nummern** (Kreis entfällt), Balken 4 px oben, Text 12 px, `nowrap` mit Auslassung. Aria und `aria-current` bleiben. |
| `Unterreiter` (Einstellungen u. a.) | Reiterleiste mit Unterstrich | bleibt (Reiter als Navigation); Unterstrich `--brand-fixed`, Schrift 500/600. |
| Layout | | unverändert bis auf: `--reiter-hoehe` als CSS-Variable am `body` setzen (für die Aktionsleiste). |

## 8. Seitentypen

Jede Route ist einer dieser fünf Formen zugeordnet (Tabelle in Abschnitt 9).

**A · Start** – Seitenkopf mit Begrüßung und Datum; danach 0–1 Hinweiszeile;
dann 2–3 Karten mit Zeilen und Abschnitten. Keine Kennzahlkacheln mit
großen Zahlen außer der Kennzahlleiste im Büro-Start.

**B · Liste** – Seitenkopf (Meta: Zeitraum/Anzahl; rechts „Neu“);
optional Kennzahlleiste; Suche (`.suche`) und Filter als Textreiter
(`.chips` mit `.chip`, **keine Pillen**, siehe § 3) als
Filterzeile; **eine** Karte mit Zeilen, gruppiert durch `.abschnitt` (z. B.
Monat). Am Schreibtisch ab 1024 px dieselben Daten als `.tabelle` in einer
Karte, Zahlen rechtsbündig, Status als `.stand`. Unter der Liste
`.textlinks` für Nebenaktionen (Export, Mahnlauf).

**C · Akte** – Seitenkopf (Titel = Name; Meta: Nummer · Ort · Status;
rechts eine Hauptaktion, Weiteres im `RowMenu`); am Telefon Karten
untereinander, ab 1024 px `.zwei-spalten` (links 7: Verlauf/Positionen,
rechts 5: Stammdaten, Kontakte, Budget). Jede Karte gliedert mit
`.abschnitt`; keine Karte in Karte.

**D · Formular** – Seitenkopf; **eine** Karte mit den Feldern (`FormGrid`),
Gruppen durch `.abschnitt`; Optionales als Zeile „Weitere Angaben“ mit
`.stand-leise` „optional“ und Aufklappen; unten `.aktionsleiste` mit Summe
(z. B. „Arbeitszeit 08:30 Std“) und Knöpfen „Abbrechen | Speichern“ (1:2).
Formularseiten mit Schritten (Handwerksschein) zeigen `.schritte` direkt
unter dem Seitenkopf und in der Aktionsleiste „Zurück | Weiter: <Schritt> ›“.

**E · Plan** – Seitenkopf mit Wochenwahl rechts; eine Karte mit
`.tabelle.tabelle-eng` (Tage als Spalten, Personen als Zeilen); darunter
`.abschnitt` „Frei diese Woche“ mit Zeilen. Am Telefon Tagesansicht als
Zeilen.

## 9. Routen → Seitentyp

| Route | Ansicht (`src/features/…`) | Typ | Hinweise |
|---|---|---|---|
| `/` (Mitarbeiter) | `dashboard/DashboardView.tsx` | A | Karte „Heute · n Baustellen“ (erste Baustelle groß mit Route/Telefon, Knopf „Wie zuletzt buchen“ mit Zeiten als Unterzeile, darunter „Andere Zeit | Schein schreiben“, weitere Baustellen als Zeilen); Karte „Diese Woche“ (Stundenbalken Mo–Fr, Saldo) mit Abschnitt „Offen für dich“. Fehlende Buchungen als Hinweiszeile über den Karten. Bild `v3/1-iphone-monteur-start.png`. |
| `/` (Büro) | `dashboard/DashboardView.tsx` | A | Kennzahlleiste (Offen, Überfällig, Anträge, Anforderungen) + 2 Karten mit Abschnitten. Bild `v3/5-schreibtisch-start-rechnungen.png`. |
| `/time` | `time/TimeView.tsx`, `time/TimeForm.tsx` | D | Zeile „Wie zuletzt eintragen“ mit Knopf „Übernehmen“ zuoberst; Datum/Status nebeneinander; Von/Bis/Pause in drei Feldern mit Unterzeile; Abschnitt „Baustelle“; „Weitere Angaben“ aufklappbar; Aktionsleiste mit „Arbeitszeit hh:mm Std“. Meine Buchungen darunter als eigene Karte mit Monats-Abschnitten. Bild `v3/2-iphone-zeit-erfassen.png`, Schreibtisch `v3/6-tablet-akte-zeit.png`. |
| `/vacations` | `vacations/VacationsView.tsx` | D+B | Kennzahlleiste (Resturlaub, Beantragt); Karte „Antrag stellen“ (Segment Urlaub/Zeitausgleich/Krank, Von/Bis, Bemerkung) mit Abschnitt „Meine Anträge“ als Zeilen (Stand). Bild `v3/3-iphone-urlaub-rechnungen.png`. |
| `/worksheet`, `/worksheet?…` | `worksheets/WorkSheetView.tsx`, `Schrittfolge.tsx`, `LeistungszeitErfassen.tsx`, `MaterialErfassen.tsx`, `Fotostreifen.tsx` | D (Schritte) | Zurück-Pfeil links vom Titel; Schritte ohne Nummern; Material: Suche, eine Karte „Verbaut · n Positionen“ mit Stepper je Zeile und Abschnitt „Zuletzt auf dieser Baustelle“ (Knopf „Hinzufügen“ klein); Aktionsleiste „Material · n Positionen“, „Zurück | Weiter: Fotos ›“. Bild `v3/4-iphone-schein-rechnungen.png`. |
| `/worksheets` | `worksheets/WorkSheetsListView.tsx` | B | Zeilen: Baustelle / Nummer · Datum, rechts Stunden + Stand. |
| `/material` | `orders/OrderView.tsx` | D+B | Formular-Karte, darunter Abschnitt „Meine Anforderungen“. |
| `/anforderungen` | `orders/AdminOrdersView.tsx` | B | Filter nach Status (Textreiter); Zeilen mit Stand; Schreibtisch Tabelle. |
| `/lager` | `orders/StockView.tsx` | B | Suche + Filter (Textreiter); Zeilen: Artikel / Einheit · Ort, rechts Bestand (`.zeile-wert`), unter Mindestbestand `.stand-warn`. |
| `/my-schedule/*` | `assignments/MyScheduleView.tsx` | E | Tag als Zeilen; Woche als Tabelle eng. |
| `/my-projects` | `projects/MyProjectsView.tsx` | B | Zeilen mit Pfeil. |
| `/quotes`, `/quotes/:id` | `quotes/QuotesView.tsx`, `quotes/AngebotView.tsx` | B / C | Akte: links Positionen (Tabelle), rechts Kunde, Summen, Stand. |
| `/customers`, `/customers/:id` | `customers/CustomersView.tsx`, `customers/KundenakteView.tsx` | B / C | |
| `/wartungen` | `maintenance/WartungenView.tsx` | B | Fällige zuerst (`.stand-warn`), Rest nach Monat. |
| `/admin-projects`, `/admin-projects/:id` | `projects/AdminProjectsView.tsx`, `projects/BaustellenakteView.tsx` | B / C | Akte: links Karte mit Abschnitten Handwerksscheine / Rechnungen / Material; rechts Karte Stammdaten mit Abschnitten Budget / Zeiten. Bild `v3/6-tablet-akte-zeit.png`. |
| `/assignments/tag`, `/assignments/woche` | `assignments/AssignmentsView.tsx`, `assignments/WochenplanView.tsx` | E | Wochenplan: Tabelle eng, Personen als Zeilen, Abschnitt „Frei diese Woche“. Am Tablet (834) Seitenleiste bleibt; Zellen 12–13 px. Bild `v3/6-tablet-akte-zeit.png`. |
| `/user-mgmt`, `/user-mgmt/:uid` | `users/UserMgmtView.tsx`, `users/BenutzerakteView.tsx` | B / C | Rolle als `Marke`-Text, nicht farbig. |
| `/settings/*` | `settings/SettingsView.tsx` + Unteransichten | D | Unterreiter bleiben; je Reiter eine Karte mit Abschnitten; Speichern in Aktionsleiste (Telefon) bzw. rechts unten (Schreibtisch). |
| `/costing` | `costing/NachkalkulationView.tsx` | B | Kennzahlleiste + Tabelle. |
| `/invoices` | `invoices/InvoicesView.tsx` | B | Kennzahlleiste (Offen, Überfällig rot); Suche; Filter als Textreiter Alle/Offen/Überfällig/Bezahlt (keine Pillen); eine Karte mit Monats-Abschnitten, rechts Betrag + Stand als `small`; Textlinks „Mahnlauf · n fällig“, „Buchhaltungs-Export“. Schreibtisch: Tabelle Nummer · Kunde · Baustelle · Datum · Fällig · Betrag (r) · Stand. Bilder `v3/3…`, `v3/4…`, `v3/5…`. |
| `/accounting` | `accounting/AccountingView.tsx` | B | Kennzahlleiste + Tabelle; Export-Knopf als Hauptaktion. |
| `/impressum`, `/datenschutz`, `/login` | `recht/*`, `auth/LoginPage.tsx` | – | Nur Rundungen/Knöpfe über Tokens; Texte unberührt. |

## 10. Regeln (Kurzfassung zum Abhaken)

1. Eine H1 je Seite, mit Strich und **einer** Meta-Zeile. Eine Hauptaktion
   rechts; alles andere in Menüs oder Textlinks.
2. Keine Karte in einer Karte. Gliederung nur mit `.abschnitt`.
3. Listen sind `.zeile`n. Titel 500, Meta darunter, Wert/Stand rechts.
4. Status und Warnungen nur als `.stand` (Punkt + grauer Text). Keine
   Pillen, weder gefüllt noch umrandet; Filter sind Textreiter.
   Rot (`.stand-fehl`, `tone="danger"`) **nur** für Überfällig/Fehler.
5. Kennzahlen nur als `.kennzahlen`-Leiste. Zahlen 600, nie 700.
6. Hinweise als `.hinweiszeile`, keine farbigen Flächen, keine Emojis.
7. Rundungen ausschließlich über die drei Tokens.
8. Tastflächen mindestens 44 px (`min-h-touch`), Knopf 44, klein 36.
9. Auf **375, 390, 834 und 1440 px** darf nichts waagrecht überlaufen
   (`npm run vorschau:messen`; Entwurfsquellen melden „ÜBERLAUF“).
10. Keine gestrichelten Rahmen, keine Verläufe, keine halbtransparenten
    Flächen im Inhalt (Ausnahme: Abdunkler hinter Dialogen, siehe
    `docs/offene-punkte.md` A7).
11. Datenlogik, Datenschicht, Migrationen, Texte, `data-testid`,
    `aria-label` und Routen bleiben unverändert.
12. Nichts verschlimmbessern: Wer eine Stelle nicht sicher in die Linie
    bringen kann, lässt sie und trägt sie in `docs/design/fortschritt.md`
    unter „Offen“ ein.

## 11. Kontrast

Gemessen (WCAG-Kontrast, gerundet):

| Farbe | auf Weiß | auf `--surface-2` | Verwendung |
|---|---|---|---|
| `--text-muted` #38505f | 8,5:1 | 7,9:1 | Meta, Stand-Text, Hinweise |
| `--ink-deep` #0a2030 | 16,6:1 | 15,5:1 | Titel, Werte |
| `--danger` #ad1a1a | 7,1:1 | 6,6:1 | Überfällig (Text) |
| `--warning` #a55409 | 5,4:1 | 5,0:1 | nur Punkt und Symbol, nie Fließtext |
| `--accent-deep` #00778a | 5,2:1 | 4,9:1 | Punkt „info“, bestehende `.link` |
| `--text-placeholder` #5f7482 | 4,9:1 | 4,5:1 | nur Pfeile, Platzhalter, leiser Punkt, fertige Schritte; kein Text mit Bedeutung |

`tests/unit/kontrast.test.ts` bleibt unverändert und muss grün bleiben.

## 12. Entwurfsquellen

`docs/design/entwurf-2026-09-26/quelle/`:

| Datei | Zweck |
|---|---|
| `stil.css` | Die Bausteine des Entwurfs als reines CSS (Basis für Abschnitt 6). |
| `seiten.py` | Die elf Beispielseiten als HTML-Rümpfe (`SEITEN` = Name → (HTML, Breite, Höhe)). |
| `build.py` | Chrome (Kopfleiste, Reiter, Seitenleiste), Symbole, Zusammenbau; rendert alle Seiten. |
| `render.mjs` | Rendert eine HTML-Datei mit Playwright (2×) und meldet „ÜBERLAUF“. |
| `montage.py` | Kontaktbogen aus mehreren PNGs (`montage.py ziel.png spalten breite datei…`). |

Neu rendern (im Ordner `quelle/`):

```bash
python3 build.py            # → seiten/<name>.html und seiten/<name>.png
```

Braucht `node_modules` des Projekts (Playwright, Poppins) und Chromium
(`CHROMIUM_PFAD`, sonst der Pfad der Build-Umgebung). Die Ausgaben unter
`seiten/` sind nicht eingecheckt; die freigegebenen Bilder liegen in `v3/`.
