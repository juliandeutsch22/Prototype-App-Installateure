# Arbeitsweise in diesem Repository

Diese Datei gilt für jede Überarbeitung, egal von wem. Sie fasst zusammen, was
der Auftraggeber als Grundsatz festgelegt hat. Der laufende Plan steht in
`docs/stand-2026-10-03.md`, Abschnitt 11.

**Senklot ist für jeden österreichischen Installationsbetrieb gebaut, nicht
für einen einzelnen.** Perl Installationen ist der Pilotbetrieb und damit der
erste Prüfstein, entscheidet aber nicht über den Umfang. Was nur manche
Betriebe brauchen, wird eine Einstellung je Betrieb oder eine klar benannte
Grenze, keine Annahme über „den“ Betrieb.

## Grundsätze (verbindlich)

1. **Der vollständige Arbeitsablauf zählt, nicht die einzelne Funktion.** Keine halben Sachen: Was gebaut wird, funktioniert am Ende von Anfang bis Ende. Keine halbfertigen Funktionen in der App lassen.
2. **Nichts verschlimmbessern.** Keine bestehende Funktion darf danach fehlen oder fehlerhaft sein. Keine Fehler suchen oder „beheben“, wo keine sind.
3. **Lücken werden benannt, nicht verschwiegen** – im PR, im Handbuch, in `docs/stand-2026-10-03.md`. Benennen ersetzt nicht das Bauen (Grundsatz 6).
4. **Nicht überkomplizieren.** Die einfachste Lösung, die den ganzen Ablauf richtig abdeckt.
5. **Erst auf Ansage beginnen.** Die Freigabe einer Empfehlung („finde ich gut“) ist noch kein Startsignal.
6. **Keine Abkürzungen, keine „erste Fassung“.** Jede Funktion wird vollständig, nachhaltig und skalierbar gebaut. Eine Grenze bleibt nur stehen, wenn sie einen Grund hat: fachlich, rechtlich, Datenschutz, Sicherheit, Altdaten (die Produktion wird nicht umgeschrieben) oder sie liegt bei jemand anderem (Kanzlei, Steuerberatung, Gerät, Betrieb). „Einfacher“ oder „reicht vorerst“ ist kein Grund. Jede benannte Grenze nennt ihren Grund; die Übersicht steht in `docs/grenzen-durchsicht-2026-10-24.md`.

## Oberfläche

- Designlinie **V10 „Warmes Papier, klare Arbeit“** (13.11.2026, Entscheidung
  E92): Regelwerk `docs/design/v10/style.md`, Auftrag
  `docs/design/v10/implementierungsauftrag.md`, Mappe
  `docs/design/v10/designmappe-v10.pptx` (Orientierung, keine 1:1-Vorlage;
  ihre kleinen Schriftgrößen sind keine CSS-Werte). Sie ersetzt die
  rein visuellen Regeln der Linie „Lot“ (eckig, ohne Schatten, Petrol);
  fachliche Entscheidungen aus `docs/ui-umbau/entscheidungen.md` gelten
  weiter. Bausteine: Tokens in `src/index.css`, Stile in `src/styles/`,
  `src/components/`; alles zum Ansehen auf `/_muster`.
- Warmes Papier als Grund, helle Arbeitsblätter mit feiner Kontur darauf;
  Terrakotta (`--brand`) für Primäraktion, aktive Auswahl und wenige
  Markierungen; keine Karte in einer Karte; jede Seite beginnt mit
  `PageHeader` (eine Hauptaktion, ⋯ nur im Seitenkopf); ganze Zeilen
  antippbar; Zustände als Text und sparsames Symbol.
- **Radien nach Rolle:** Arbeitszeile 8 px, Feld/Knopf 12 px, Blatt 16 px,
  Sheet und mobile Kopf-/Fußinsel 24 px. **Schatten nur für Schwebendes**
  (Fenster, Sheets, Menüs, Meldung, mobile Inseln), nie an Zeilen, Feldern
  oder Blättern.
- **Eine Hilfe pro Seite:** Erklärungen als `InfoHint` oder `hint` einer
  `Card` — sie erscheinen gesammelt unter „Hilfe zu dieser Seite“. Lange
  Texte nie offen auf die Seite.
- Keine Pillen, keine Emojis als Gestaltung (Reaktionen im Chat sind Inhalt, E77), keine Verläufe, keine Glasflächen. Warnung und
  Fehler färben keine Flächen und tragen keine farbige Kante — Text und
  Symbol tragen die Bedeutung. Auswahl = `--auswahl` plus feine Kontur und
  Häkchen. Keine halbtransparenten Farbflächen außer Schleier und Schatten.
- Schriften lokal: DM Sans (Bedienung), Source Serif 4 regulär (größere
  Titel), IBM Plex Mono (Gemessenes). Text/Titel in 400/500 (600 nur für
  den Firmennamen). Hell ist Standard; „Dunkel“ und „System“ auf Wahl
  (Mein Konto → Darstellung und Bewegung). Kontraste gemessen
  (`lotGrundwerte.test.ts`), beide Sätze.
- Breiten: Handy bis 759 px, Tablet 760–1.199 (`md:`), Schreibtisch ab 1.200 (`lg:`).
- Markt Österreich. Oberfläche und Code-Kommentare auf Deutsch.
- **Kommentare erklären das Warum, nicht das Was.**

## Ablauf je Thema

1. Ein Thema, ein Branch, ein PR nach `main`.
2. Bauen **mit Tests**. Jede neue Prüfung braucht eine **Gegenprobe**:
   - Sie ist ohne die Änderung rot und mit ihr grün.
   - Wo etwas gleich bleiben muss, prüft ein eigener Test genau das.
3. Vor dem PR alles prüfen, was der Bereich berührt:
   - `npx tsc --noEmit -p .` und `npm run -s lint`
   - `TZ=Europe/Vienna ./node_modules/.bin/vitest run`
   - Bei Migrationen: lokaler Supabase-Stack, `node scripts/edge-shared-uebernehmen.mjs`, `supabase functions serve`, dann `NO_PROXY=127.0.0.1,localhost npx vitest run --config vitest.supabase.config.ts`
   - Browser: `CHROMIUM_PFAD=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) NO_PROXY=127.0.0.1,localhost npx playwright test --project=chromium --project=tablet-834`
   - Links: `CHROMIUM_PFAD=… npm run -s pruefen:links`
4. Den eigenen Diff kritisch gegenlesen: Was könnte dadurch kaputtgehen?
5. Nachziehen:
   - Handbuch (`docs/handbuch/handbuch.html`, Stempel mit Zahl der Prüfungen);
   - erledigte Punkte in `docs/stand-2026-10-03.md`.
6. Erst mergen, wenn die CI grün ist. Danach prüfen, ob die Auslieferung live ist.

## Sicherheit und Daten

- In der Produktionsdatenbank wird nichts gelöscht oder umgeschrieben. Testdaten räumt der Betrieb selbst.
- Geheimnisse (Supabase-Dienstschlüssel u. ä.) nie ins Repository und nie in GitHub-Secrets. Externe Zugangsdaten nur als Secrets der Edge Functions.
- **Neue Datenbankfunktionen:** `security definer`, `set search_path = ''`, `revoke … from public, anon` und nur den nötigen `grant`.
- **Neue Zeilenschutz-Regeln** prüfen den Betrieb als `company_id = (select app.lesebetrieb())` (Support dazu: `or company_id = (select app.supportbetrieb())`), Rollen und `auth.uid()` als `(select …)`. Sonst rechnet Postgres sie je Zeile; `leseregelnGleichwertig.test.ts` lässt `app.darf(…)` in Regeln nicht mehr durch.
- Jede neue Tabelle mit Personenbezug gehört in die Datenauskunft (`person_auskunft`, `auszug_ausgenommen`) und in die Löschung einer Person.
- Nach Änderungen an `shared/` immer `node scripts/edge-shared-uebernehmen.mjs`. Sonst laufen die Edge Functions mit dem alten Stand.
