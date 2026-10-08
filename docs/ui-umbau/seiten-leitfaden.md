# Leitfaden für die Seiten (Phase E)

Gilt für jede Seite, die auf die Linie „Lot“ gebracht wird. Grundlage:
`docs/ui-umbau/protokoll.md` (Abschnitte 0, 6, 7, 8), der Entwurf
`docs/design/senklot-designlinie-v2.html` und die Entscheidungen in
`docs/ui-umbau/entscheidungen.md`. **Der Entwurf ist Orientierung, keine
1:1-Vorlage** (Vorgabe des Auftraggebers vom 07.10.2026): massgeblich ist,
was in dieser App den ganzen Arbeitsablauf am besten trägt — ohne dass eine
Funktion verloren geht.

## Was schon steht (nicht anfassen, nur benutzen)

Grundwerte, Hülle und Bausteine sind fertig (Schritte C und D). Die
gemeinsamen Dateien gehören der Hauptsitzung:
`src/components/*`, `src/app/*`, `src/styles/lot.css`, `src/index.css`,
`tailwind.config.js`, `src/lib/*`. Fehlt dort etwas, **im Bericht
beschreiben**, nicht selbst ändern.

| Baustein | Wo | Wofür |
|---|---|---|
| `PageHeader` | `@/components/PageHeader` | `title`, `subtitle` (eine Zeile), `ort` (Ortszeile darüber), `action` (genau EINE Hauptaktion — am Handy im Daumenbereich), `mehr` (ein `RowMenu` für seltene Seitenaktionen — das einzige ⋯ im Kopf), `hilfe` (Einleitung für „Hilfe zu dieser Seite“) |
| Hilfe zu dieser Seite | automatisch | Jede `InfoHint` und jeder `hint` einer `Card` auf der Seite wandert dorthin. In Dialogen und Seitenfenstern bleibt das „i“ am Platz. Lange Texte nie offen auf die Seite. |
| `Card` | `@/components/Card` | = „Gruppe“. Mit `buendig` für Listen. Eine Fläche, Linien statt Karten-in-Karten. |
| `ListRow`, `List` | `@/components/ListRow` | = „Zeile“. Mit `to` (Adresse) oder `onOeffnen` (z. B. Seitenfenster) ist die **ganze Zeile antippbar**; Knöpfe rechts bleiben eigene Ziele. |
| `Zustand`, `StatusBadge`, `Warnung`, `Marke` | `@/components/Badge`, `StatusBadge` | Fünf Zustände: `offen`, `laeuft`/`gut`, `ruht` (= erledigt), `achtung`, `schlecht` (= Fehler). Keine farbigen Pillen. |
| `Metric`, `MetricRow` | `@/components/Metric` | Kennzahlen, höchstens vier, mit `to` antippbar. |
| `BottomSheet` mit `auchBreit titel="…"` | `@/components/BottomSheet` | = Seitenfenster rechts (Tablet/Schreibtisch) bzw. Blatt von unten (Handy). Für Bearbeiten, Planen, Einzelheiten einer Zeile. |
| `ConfirmDialog` | `@/components/ConfirmDialog` | nur für Unumkehrbares. Bestehende Bestätigungen bleiben (nie lockerer). |
| Meldung mit Rückgängig | `toast.success(text, { label: 'Rückgängig', onClick })` | nur wo die Umkehr den Zustand **exakt** wiederherstellt, über dieselbe Funktion der Datenschicht. Nichts erfinden. |
| `Arbeitszeile`, `Sammelleiste` | `@/components/LotBausteine` | Arbeitslisten: Kästchen, antippbarer Inhalt, genau ein Knopf für den nächsten Schritt; Sammelaktion über dieselbe Funktion je Eintrag, Teilfehler je Zeile melden. |
| `MehrAnzeigen` | `@/components/LotBausteine` | „und N weitere anzeigen“ — Gruppen höchstens 20 Zeilen. |
| `Segmente` | `@/components/LotBausteine` | Auswahl als Segmente (Filter, Ansicht). |
| `Kurzzeile`, `LotVerlauf`, `Sprungleiste` | `@/components/LotBausteine` | Akten: Zusammenfassung zuerst, Verläufe als Lot, Sprungleiste. `Aktenspalten` gibt es schon. |
| `WeitereAngaben` | `@/components/LotBausteine` | Seltene Formularfelder, zugeklappt (offen, wenn schon etwas darin steht). |
| Klassen `formular`, `fuss-aktionen`, `leer` | `src/styles/lot.css` | Formular einspaltig max. 560 px; Fusszeile der Aktionen; leerer Zustand. |
| `EmptyState`, `LoadingState`, `ErrorState`, `TeilFehler` | `@/components/States` | wie bisher |

Die Musterseite `/_muster` (`src/features/muster/MusterView.tsx`) zeigt alles.

## Regeln, übersetzt auf diese App

1. **Eine Fläche, Linien statt Karten.** Keine Karte in einer Karte. Mehrere
   kleine Karten untereinander lieber zu einer Gruppe mit `Abschnitt`-Köpfen
   zusammenziehen, wenn sie zusammengehören.
2. **Seitenkopf überall gleich.** Jede Seite beginnt mit `PageHeader`. Die
   wichtigste Aktion (z. B. „Neue Baustelle“) als `action`; seltene
   Seitenaktionen (Export, Import, Einspielen) als `mehr`-Menü — nicht als
   Knopfreihe. Keine zweite Hauptaktion daneben.
3. **Ganze Zeilen antippbar.** Zeilen, die eine Akte oder Einzelheiten
   öffnen, bekommen `to`/`onOeffnen`. Ein ⋯ je Zeile nur, wo es heute schon
   steht und die Aktionen nicht sinnvoll ins Seitenfenster passen; dann
   bleibt es (nichts verlieren geht vor). Arbeitslisten: `Arbeitszeile`.
4. **Viele Daten.** Standardansicht = Arbeitsstand (offen, laufend, diese
   Woche), „Alle“/„Erledigt“ bleibt erreichbar. Gruppen ≤ 20 Zeilen, dann
   `MehrAnzeigen`. Nach Dringlichkeit sortieren (überfällig, eilig, heute,
   diese Woche), dann Datum. Jede Liste hat eine Suche. Filter wenn möglich
   in der Adresse (`useSearchParams`). Seitenweise vom Server nur, wo die
   Datenschicht es heute schon kann — **die Datenschicht wird nicht
   geändert**; wo sie es nicht kann, im Bericht als Lücke nennen.
5. **Fünf Zustände**, sonst keine Farbe. Achtung = Bernstein, Fehler = Rot.
6. **Akten**: zuerst die Zusammenfassung (Kurzzeilen, Kennzahlen), dann die
   Einzelheiten; bei langen Akten eine Sprungleiste.
7. **Verläufe** (Bewegungen, Statuswechsel, Protokolle) als `LotVerlauf`.
8. **Planen und Bearbeiten im Seitenfenster**, wo heute ein Formular
   zwischen den Zeilen aufklappt oder ein Dialog in der Mitte steht.
9. **Formulare** einspaltig, höchstens 560 px (`formular`), Beschriftung
   oben, Seltenes unter `WeitereAngaben`, Hinweise höchstens eine Zeile.
10. **Rückgängig statt Nachfrage** nur, wo die Umkehr exakt ist. Dialoge für
    Unumkehrbares bleiben.
11. **Eine Hilfe pro Seite** — kommt von selbst, wenn Erklärungen als
    `InfoHint` oder `Card hint` stehen. Lange Fliesstexte auf der Seite dahin
    verschieben.

## Gestaltung

- Nur Tokens: `text-ink`, `text-ink-muted`, `text-ink-deep`, `bg-surface`,
  `bg-surface-2`, `bg-bg`, `border-line`, `border-line-strong`,
  `text-brand-fixed`/`bg-brand-fixed` (Petrol der Linie), `bg-brand` (nur
  Hauptknöpfe), `text-warning`, `text-danger`, `bg-warning-bg`,
  `bg-danger-bg`, `bg-petrol-hell`. Keine Hexwerte, keine Tailwind-Farben wie
  `gray-500`.
- **Verboten:** halbtransparente Farbflächen (`bg-…/30`, `border-…/60`,
  `ring-…/30`), gestrichelte Linien, Emojis, Pillen, `font-medium`,
  `font-bold` (nur `font-normal` und `font-semibold`), Schatten auf Karten.
- Symbole sparsam (Navigation hat sie; im Inhalt nur, wo das Zeichen mehr
  sagt als das Wort).
- Breiten: `md:` = ab 760 px (Tablet), `lg:` = ab 1.200 px (Schreibtisch).
  Ohne Präfix = Handy. Prüfen bei 390, 834 und 1.440 px: kein seitliches
  Überlaufen, keine abgeschnittenen Beschriftungen, Tippflächen ≥ 44 px.
- Eigene Seitenbausteine (wenn Tailwind-Klassen zu lang werden) nur in der
  eigenen Datei `src/styles/lot-<paket>.css`, nach denselben Regeln wie
  `lot.css` (eine Klasse je Element, keine `calc()`/`clamp()`, keine
  Positionsselektoren, Media-Queries nur auf die Breite).
- Kommentare auf Deutsch, sie erklären das **Warum**.

## Was sich nicht ändern darf (Haltepunkte)

Datenbank, Migrationen, Datenschicht (`src/lib/db/**`), Berechnungen, Belege
und Exporte (PDF, CSV, BMD, Belegarchiv — die Dateien `*Pdf.ts`, `pdf.ts`,
`export*.ts`, `*Export.ts` usw. bleiben unberührt), Rechte (keine Rolle sieht
oder darf mehr oder weniger), Wortlaut von Fehlermeldungen der Datenbank,
Adressen (Routen). **Nichts geht verloren**: jeder Knopf, Link, Filter,
Reiter, Hinweis, jedes Feld und jeder ⋯-Eintrag ist danach erreichbar,
höchstens einen Klick weiter. Keine neuen Funktionen.

## Prüfungen

- `npx tsc --noEmit -p .` und `npm run -s lint` müssen grün sein.
- Unit-Tests der eigenen Ansichten:
  `TZ=Europe/Vienna ./node_modules/.bin/vitest run --maxWorkers=2 tests/components/<Ansicht>.test.tsx …`
  — **nicht** die ganze Suite (vier Kerne, acht Pakete parallel), **keine**
  Datenbank-Tests (`vitest.supabase.config.ts`), **kein** Playwright, **kein**
  `pruefen:links` (die laufen nach dem Zusammenführen in der Hauptsitzung).
- Bestehende Tests, die nur das alte Aussehen oder den alten Klickweg
  festhalten, werden angepasst — **was sie schützen, bleibt geschützt**. Jede
  neue Prüfung braucht eine Gegenprobe (rot ohne die Änderung).
- Browser-Wege (`tests/durchklick/*.spec.ts`), die eure Seiten benutzen: wenn
  ein Klickweg sich ändert, die Stelle im Spec mit anpassen und im Bericht
  nennen.
- Sichtprüfung über die Vorschau (ohne Datenbank), je Paket eigener Port:
  `node tools/vorschau/stubs-erzeugen.mjs && npx vite --config vite.vorschau.config.ts --port <PORT>`
  und dann `http://localhost:<PORT>/tools/vorschau/?pfad=/invoices&rolle=Buchhaltung`
  in Chromium (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`) in 390,
  834 und 1440 px fotografieren und ansehen. Danach den Server beenden
  (nur den eigenen Prozess, nie `pkill -f`).

## Abgabe je Paket

1. Commit(s) im eigenen Arbeitsbaum (Nachricht auf Deutsch, Warum).
2. `docs/ui-umbau/zuordnung-<paket>.json`: jedes sichtbare Element der Seiten
   vorher → nachher (`alt`, `neu`, `weg_alt`, `weg_neu`, `bemerkung`,
   `geprueft`), Format wie `docs/ui-umbau/zuordnung-huelle.json`.
   `weg_neu − weg_alt ≤ 1`, kein Eintrag ohne `neu`.
3. `docs/ui-umbau/abnahme/<paket>.md` nach Protokoll-Anhang 12.3; was nicht
   geprüft werden konnte (Belege, Mengengerüst, WebKit, Freigabe), steht
   dort ehrlich als offen.
4. Bericht: was geändert, welche Tests angepasst (und warum), welche
   Browser-Wege betroffen, welche Lücken, welche Wünsche an die gemeinsamen
   Bausteine.
