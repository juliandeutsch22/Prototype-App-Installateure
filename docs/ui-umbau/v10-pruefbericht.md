# V10 „Warmes Papier, klare Arbeit“ — Prüfbericht (13.–14.11.2026)

Entscheidung E92. Auftrag: `docs/design/v10/implementierungsauftrag.md`,
Regelwerk `docs/design/v10/style.md`. Ausgangsstand `main` 99b8787.

## 1. Was geprüft wurde

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit -p .` | ohne Fehler |
| `npm run -s lint` (ESLint, `--max-warnings 0`) | ohne Befund |
| Modulprüfungen Vitest, Node 20 (wie CI), `TZ=Europe/Vienna` | 486 Dateien, **7.997 grün** |
| Produktionsbuild `npm run build` | erfolgreich |
| Browserwege Playwright, Chromium + `tablet-834` + `tablet-quer-1194`, lokaler Supabase-Stapel | **256 grün**, 7 übersprungen (projektgebunden), nach den Korrekturen in Abschnitt 2 |
| Linkprüfung `npm run pruefen:links` | 35 grün in Chromium; die 28 Wege des Projekts `webkit-premium` laufen in der CI (WebKit ist in der Cloud-Umgebung nicht installiert) |
| Funktionsinventar (`funktionsinventar.test.ts`) | grün: alle 1.941 Bedienstellen des Ausgangsstands vorhanden, keine Entfernung (`v10-entfernt.json` leer) |
| Rundgang mit Bildern (Vorschau, sechs Rollen, 390/834/1440) | 255 Aufnahmen, 0 Laufzeitfehler; Vorher-Bilder zum Vergleich aus derselben Vorschau |
| Hell und dunkel | je Modul in drei Breiten angesehen (Bilder der Modulberichte); Kontraste beider Sätze gemessen (`lotGrundwerte.test.ts`, `v10Stil.test.ts`) |

Datenbank, Zeilenschutz, RPCs und Edge Functions sind **nicht** geändert;
die Datenbankprüfungen (`vitest.supabase.config.ts`) waren deshalb nicht Teil
dieses Umbaus. Ihr Ausgangsstand (99b8787) hatte 5 rote Prüfungen in
`tests/supabase/ausleitung.test.ts` und `ausleitungTeile.test.ts`
(Ausleitung eines Betriebs, unabhängig von V10) — hier als Befund des
Ausgangsstands benannt, nicht behoben.

## 2. Was die Browserwege gefunden haben (und was behoben ist)

Der erste vollständige Lauf brachte 20 rote Wege. Davon waren drei **echte
Fehler** des Umbaus, behoben mit Prüfung und Gegenprobe:

1. **Jedes Blatt 22 px zu hoch.** Die V10-Kontur war zuerst ein echter
   1-px-Rand; das Blatt wurde 2 px höher als sein Inhalt, und der
   Rastertakt füllte unten bis zur nächsten Zelle auf. Jetzt ist die Kontur
   ein nach innen versetzter Umriss (`outline`), ohne Höhe, über dem Inhalt
   gezeichnet — die klebende Leiste deckt sie nicht zu (E76 bleibt erfüllt).
2. **Arbeitstag-Karte unten zu viel Luft** (E75): 16/12 px Innenabstand lag
   nicht im 24er-Takt, und eine Nachbarregel galt auch neben einem
   ausgeblendeten Verweis. Jetzt 24 px oben und unten, Regel entfernt.
3. **Blätter neben dem Raster nach dem Laden der Schriften** (Rechtsseiten
   am Handy): die Schrift kommt nach dem ersten Zeichnen, der Text bricht
   anders um, das Blatt rutscht ohne Größenänderung. Der Taktgeber rechnet
   jetzt nach `document.fonts` → `loadingdone` neu.

In der CI kam ein vierter hinzu, der aus E90 stammt und auf `main` nur
zufällig grün war: **ein Timer-Tipp, solange der Schritt davor noch zum
Server unterwegs ist, geht bewusst nicht hinaus** (Schutz vor Doppeltipp) —
aber ohne jedes Zeichen. Auf der langsameren CI tippte der Weg „Pause“ ins
Leere. Die Karte trägt jetzt `aria-busy`, solange ein Schritt unterwegs ist
(Vorlesehilfen hören, dass sie bestätigt wird; die Knöpfe bleiben
bedienbar), und die Wege warten darauf. Komponentenprüfung mit Gegenprobe.

Die übrigen 17 hielten **Geometrie der Linie „Lot“** fest, die V10 bewusst
ersetzt (eckig → 16 px Radius, gezeichnete Linien → Kontur, Petrol →
Terrakotta, Kopfzeile am Rand → Insel 8 px, Seitenfenster am Rand →
schwebend, Papierkorb unten → oben rechts). Sie sind auf die V10-Regel
umgeschrieben, jeweils mit Kommentar im Test.

## 3. Was nicht geprüft ist (offen, mit Grund)

- **WebKit/Safari und echte Geräte** (iOS, Android): in der Cloud-Umgebung
  nicht verfügbar. Der Umriss der Blätter folgt dem Radius ab Safari 16.4;
  ältere Safari zeichnen ihn eckig. Prüft der Betrieb am Gerät.
- **Ladefehler im Bild**: Die Vorschau liefert immer Daten; „nicht geladen“,
  „frei unklar“ und „Erneut versuchen“ sind über Komponententests belegt,
  nicht über Bilder.
- **Ablege-Flug der Planung**: statisch und im Bild geprüft; jsdom kennt
  kein Layout.
- **Gehostete Umgebung** (CSP, Auslieferung): wird nach dem Merge über die
  Auslieferung geprüft.

## 4. Grenzen mit Grund

Siehe `docs/grenzen-durchsicht-2026-10-24.md`, Abschnitt „Designlinie V10“.
