# 7 · Ladezeiten und Skalierung (Querschnitt)

Stand `main` 062407b (15.11.2026). Nur gelesen und gemessen; im Repository ist nichts geändert
(`git status` leer). Gebaut und gemessen wurde in einer Kopie im Scratchpad, die Datenbankmessungen
in einer Wegwerf-Datenbank des lokalen Postgres 16 (danach gelöscht, Cluster wieder gestoppt).

**Abweichung vom Auftrag:** Node 20 lag nicht unter `scratchpad/node20`, und im Repository gibt es kein
`node_modules`. Gebaut wurde mit Node 22.23.4 nach `npm ci` in der Kopie. Der Bau lief fehlerfrei durch.

Belege zum Nachrechnen im selben Ordner: `bau-ausgabe.txt` (Vite-Ausgabe), `chunks.json` (Module je
Chunk), `indizes.txt` (alle Index-Definitionen der Migrationen), `messung-katalog.sql`,
`messung-buchungen.sql` (die beiden Datenbankmessungen).

---

## 1. Wie das Laden heute funktioniert

- **Auslieferung:** Firebase Hosting; `index.html` und `sw.js` mit `no-cache`, `/assets/**` ein Jahr
  `immutable` (`firebase.json`). Der Service Worker (`public/sw.js`) hält die Hülle und liefert
  Bausteine zuerst aus dem eigenen Speicher; eine neue Fassung wird erst angeboten, wenn ihre
  Start-Bausteine vollständig liegen.
- **Aufteilung:** Einstieg `index-*.js` + feste Bausteine `react`, `supabase` (`vite.config.ts:225`),
  jede Ansicht als eigener Baustein über `ansicht()` (`src/lib/ansichten.ts`). Nach der Anmeldung holt
  die Hülle im Leerlauf alle Ansichten der eigenen Navigation, eine nach der anderen
  (`Layout.tsx:297–303`); beim Start schon den Baustein der geöffneten Seite (`main.tsx:42`).
- **Daten:** alles über `abfragen` (`src/lib/db/pg/kern.ts:322`): Seiten zu 500, die erste zählt
  (`count=exact`), die übrigen kommen gleichzeitig. Ohne `spalten` wird `select *` geholt (so in fast
  allen Aufrufen). Live-Listen über `abonnieren` (`kern.ts:799`): erstes Bild sofort, Kanal je
  Abonnement mit Filter nur auf den Betrieb, danach Abgleich über `id,updated_at`.
- **Zwischenspeicher:** TanStack Query und `liveSpeicher`, nur im Arbeitsspeicher, zehn Minuten
  (`lib/zwischenspeicher.ts`, `lib/liveSpeicher.ts`). Rechnungen bewusst ohne (Stand 16.3).
- **Datenbank:** Zeilenschutz einmal je Abfrage (Stand 14), Indizes für die Wachstumswege (14.2),
  Startseite und Monatsbilanzen als Datenbankfunktionen (T-5d, T-5e).
- **Schon erledigt und hier nicht erneut gemeldet:** Stand 14–14.6, 16.1–16.3, T-3, T-4, T-5a–e.
  Die Endmessung vom 20.10.2026 (`docs/ui-umbau/messung-ladezeit-ende*.md`) nennt im Alltag
  0,9–2,1 s „bereit“ auf langsamem 4G, außer der Mitarbeiterübersicht.

### Was der Bau heute ergibt (gemessen)

| Größe | roh | gzip |
|---|---|---|
| Einstieg `index-*.js` (189 Module) | 343,9 KB | 112,9 KB |
| `react` | 181,1 KB | 59,8 KB |
| `supabase` | 227,0 KB | 58,9 KB |
| `index-*.css` (eine Datei für alle Seiten) | 257,5 KB | 42,3 KB |
| **vor dem ersten Bild nötig** | **1.009 KB** | **273,8 KB** |
| alle 218 JS-Bausteine zusammen | 3.373 KB | 1.155 KB |
| Schriften: 6 × woff2 (dazu 6 × woff als Rückfall) | 92 KB | – |

- jsPDF (386,8 KB / 126,6 KB gzip) hängt **nicht** im Einstieg und in keiner Ansicht fest: nur
  dynamisch über `pdf`, `hoursPdf`, `angebotPdf`, `worksheetPdf`, `mahnungPdf`, `stornoPdf`.
  `html2canvas` (201 KB), `canvg` (`index.es`, 159 KB) und `purify` holt nur jsPDF selbst bei Bedarf.
  Firebase (44 KB) nur mit Push. **Kein Befund.**
- Im Einstieg liegen neben Hülle und Anmeldung: `lib/db` 110 KB (vor dem Verkleinern; darunter
  `pg/invoices.ts` 17 KB, `nachrichten.ts`, `quotes.ts`, `customers.ts`, `materials.ts` — über das
  Suchfenster und die Hülle), TanStack Query 102 KB, `time.ts` 22 KB, `navigation.ts` 21 KB,
  `module.ts` 19 KB.
- Zusätzlich je Ansicht (über den Einstieg hinaus, gzip): Rechnungen 105 KB in 51 Dateien,
  Mitarbeiterübersicht 89 KB / 43, Startseite 81 KB / 53, Wochenplan 72 KB / 39, Zeiterfassung
  69 KB / 32, Baustellenakte 65 KB / 52, Kundenakte 55 KB / 41.
- 139 der 218 Bausteine sind kleiner als 5 KB, 84 kleiner als 2 KB.

---

## 2. Belegte Befunde (nach Schwere)

Zu jedem Befund: Gewinn · Aufwand · Risiko · trägt die Lösung mit wachsender Datenmenge.

### B1 — Saldo mit „kurzem Freitag“ lädt jede Buchung seit dem Eintritt (hoch)

- **Wo:** `src/lib/time.ts:668` (`hatTagessoll`), `src/features/dashboard/start/eigeneKonten.ts:43,52`,
  `src/features/time/TimeView.tsx:351,373,387`, `src/features/vacations/zeitguthaben.ts:19–36`.
- **Was:** Die Monatsbilanzen (`monthly_stats`) gelten nur, wenn die Person **kein** eigenes Tagessoll
  je Wochentag trägt. Mit Tagessoll fällt jeder Saldo auf `listOwnEntriesSince(…, eintritt)` zurück:
  alle Buchungen seit dem Eintritt, alle Spalten. Der Kommentar nennt den Grund („die Bilanzen sagen
  nicht, auf welchen Wochentag Krank- und Urlaubstage fielen“).
- **Szenario:** Betrieb mit 38,5 Stunden, Mo–Do 8,5, Fr 4,5 — im Gewerbe der Regelfall. Jeder Monteur
  hat ein Tagessoll. Nach fünf Jahren (rund 1.200 Buchungen je Person und Jahr, wie im Testbestand)
  holt **die Startseite und die Zeiterfassung jedes Monteurs** bei jedem Besuch 6.000 Zeilen in
  13 Anfragen; nach zehn Jahren 12.000 in 25. Nachgestellt (10 Jahre, 2 Buchungen je Arbeitstag):
  5.218 Zeilen = 3,2 MB JSON für eine Person.
- **Nicht gemessen worden:** Der Testbestand setzt für alle `app_start_date = '2021-10-01'` und kein
  Tagessoll (`scripts/ui-umbau/testbestand.mjs:192`). Die Messungen vom 20.10. haben diesen Weg nie
  durchlaufen, und sie messen nur die Geschäftsführung, nie den Monteur.
- **Grenze benannt?** In Stand T-2 steht „eigenes Tagessoll … über alle Buchungen seit dem Eintritt“
  als Nebensatz; in `grenzen-durchsicht` kein Eintrag mit Grund. Der Grund (Wochentag fehlt in der
  Bilanz) ist technisch, kein fachlicher — er trägt nach Grundsatz 6 nicht.
- **Lösung:** Die Bilanz je Monat um die Tage je Zustand erweitern (Krank-, Urlaubs-,
  Freistellungstage als Datumsliste oder Zähler je Wochentag); `saldoAusBilanzen` rechnet dann auch
  mit Tagessoll. Prüfung: gleiche Zahl wie `calcOverallSaldo` für dieselben Buchungen.
- **Gewinn groß** (Start und Zeiterfassung des Monteurs: von tausenden Zeilen auf rund 60 je fünf
  Jahre) · **Aufwand mittel** · **Risiko:** Saldo ist Lohn-relevant, braucht den Gleichheitsnachweis ·
  **trägt:** ja, wächst dann mit Monaten statt mit Buchungen.

### B2 — Gesamtsaldo der Mitarbeiterübersicht: ganzer Betrieb je Eintrittsmonat, alle Bilanzen aller Jahre (hoch)

- **Wo:** `src/features/vacations/zeitguthaben.ts:54–99`, ausgelöst in
  `src/features/accounting/AccountingView.tsx:536–558`.
- **Was, drei Teile:**
  1. Zeile 80: für **jeden verschiedenen Eintrittsmonat** `listEntriesInRange(companyId, ab, monatsLetzter)`
     — die Buchungen **aller** Personen dieses Monats, danach im Browser auf die eine Person gefiltert
     (Zeile 93).
  2. Zeile 78: `listBilanzenAlle` ab dem frühesten Eintritt — jede Monatsbilanz jeder Person samt
     der Liste aller Buchungstage (`tage`).
  3. Zeile 65: für jede Person mit Tagessoll einzeln `zeitguthabenLaden` → B1.
  Der Effekt läuft nach jeder Änderung einer Buchung im Blick erneut (`grenzStand`, 1,5 s gebündelt).
- **Szenario:** 50 Personen, Start der App vor fünf Jahren, seither 25 Neueintritte in verschiedenen
  Monaten → 26 Abfragen über je einen ganzen Betriebsmonat (rund 2.000–4.500 Zeilen, je 5–9 Seiten).
  Haben alle einen kurzen Freitag (B1), lädt die Seite 50 × alle Buchungen seit Eintritt: rund
  300.000 Zeilen in über 600 Anfragen — bei jedem Besuch und nach jeder Buchung eines Kollegen.
- **Gemessen (nachgestellt, 50 Personen, 10 Jahre, 261.000 Buchungen):** die Bilanzen aller Personen
  588 ms in der Datenbank (Sortierung auf Platte), 6.050 Zeilen, 2,3 MB JSON.
- **Lösung:** eine Datenbankfunktion „Gesamtsalden“ (je Person eine Zahl) oder gespeicherte
  Monatsbilanzen (Tabelle, vom Auslöser an `time_entries` nachgeführt) als gemeinsame Quelle für
  Zeiterfassung, Startseite, Urlaub, Mitarbeiterübersicht und Lohn. Sofort wirksam und klein: Zeile 80
  je Person statt je Betrieb fragen (`listOwnEntriesInRange`).
- **Gewinn groß** · **Aufwand mittel bis groß** (Rechnung in SQL oder Bilanztabelle, mit B1 zusammen) ·
  **Risiko:** wie B1 · **trägt:** ja.

### B3 — Katalogsuche läuft ohne Index; der vorhandene Trigram-Index passt nicht zur Abfrage (hoch für große Kataloge)

- **Wo:** Abfrage `src/lib/db/pg/materials.ts:93` (`katalogSeite`), `:305` (`sucheKatalog`), `:342`
  (`katalogNachNamen`); Index `supabase/migrations/20260911120000_stammdaten.sql:214`.
- **Was:** Gesucht wird `name ILIKE … OR article_number ILIKE … OR category ILIKE …`. Der Index
  `materials_suche` liegt auf dem **Ausdruck** `name || ' ' || article_number` — den kann diese
  Abfrage nicht benutzen. Für Kunden, Baustellen und Wartungen hat `20260914220000_suche.sql` genau
  deshalb Indizes je Spalte nachgezogen; für `materials` (die größte Tabelle) nicht.
- **Gemessen (lokal, 120.000 Artikel eines Betriebs, warmer Speicher):**

  | Abfrage | heute | mit Index je Spalte |
  |---|---|---|
  | Suche, seltener Begriff, 20 Treffer | 162 ms (120.000 Zeilen gefiltert) | 2,6 ms |
  | dieselbe Suche gezählt (`count=exact` in `katalogSeite`) | 159 ms zusätzlich | wie oben |
  | Suche, häufiger Begriff | 140 ms | 55 ms (über `(company_id, name, id)`) |
  | Katalogseite ohne Suche, 50 nach Name | 12 ms | 0,07 ms |
  | Lagerartikel des Betriebs (2.000 von 120.000) | 12 ms | 0,4 ms |

  Auf der gehosteten Datenbank (kleinere Maschine) entsprechend mehr; die Zeit wächst mit dem Katalog.
  Ein voller Großhandelskatalog hat mehrere hunderttausend Zeilen.
- **Folgeszenario:** `katalogNachNamen` (Rechnungsvorschau, Nachkalkulation) schickt 20 Namen je
  Anfrage als 20 `ILIKE`. Aus der Messung (rund 50 ms je Muster über 120.000 Zeilen) rund 1 s je
  Anfrage; bei 500.000 Artikeln rund 4 s — das Zeitlimit angemeldeter Konten liegt bei 8 s (Stand 14.5).
- **Nebenbefund:** Die Ausdrucks-Indizes `materials_suche` (lokal 52 MB bei 200.000 Zeilen),
  `customers_suche`, `projects_suche`, `wartungen_suche`, `work_sheets_suche`,
  `material_orders_suche` benutzt keine Abfrage der App; sie kosten nur beim Schreiben (DATANORM).
  Ohne Index je Spalte suchen außerdem: Rechnungen (`invoices.ts:573`), Angebote (`quotes.ts:113`),
  Scheine (`workSheets.ts:403`), Anforderungen (`materialOrders.ts:90`), Auftragseingänge,
  `projects.bezeichnung` und `customers.contact_phone`/`email` (ein `OR` nutzt Indizes nur, wenn
  **jede** Spalte einen hat). Dort sind es zehntausende Zeilen, also Millisekunden — niedrig.
- **Lösung:** Trigram-Index je gesuchter Spalte auf `materials` (name, article_number, category), dazu
  `(company_id, name, id)` und ein Teilindex für `lagerartikel`; unbenutzte Ausdrucks-Indizes
  entfernen. Reine Migration, Prüfung nach dem Muster von `indizesWachstum.test.ts`.
- **Gewinn groß bei großen Katalogen, sonst mittel** · **Aufwand klein** · **Risiko:** Indexaufbau auf
  bestehender Tabelle (einmalig, `concurrently`), etwas mehr Platz · **trägt:** ja.

### B4 — Bilder im Chat: unverkleinert, und bei jeder neuen Nachricht neu geladen (hoch für Chat und Mobildaten)

- **Wo:** `src/features/nachrichten/Gespraech.tsx:247–254` und `:613`, `src/lib/db/pg/nachrichten.ts:453–467`,
  `Gespraech.tsx:572–584`.
- **Was:** (1) Gewählte Dateien gehen so hoch, wie sie sind (bis 25 MB; die Scheinfotos werden dagegen
  auf 1.600 px verkleinert, `features/worksheets/fotos.ts:36`). (2) Die Adressen aller Anhänge des
  geladenen Verlaufs werden bei **jeder** Änderung von `nachrichten` neu signiert (600 s) und gesetzt.
  Eine neue Signatur ist eine neue Adresse — der Browser hält das Bild dafür nicht vor.
- **Szenario:** Baustellen-Gespräch mit zehn Handyfotos (je 3–8 MB). Jemand schreibt „ok“ → alle
  sichtbaren Bilder bekommen eine neue Adresse und werden noch einmal aus dem Netz geholt. Beim
  nächsten Öffnen ebenso. Auf der Baustelle sind das zweistellige Megabyte je Blick.
- **Lösung:** Adressen je Pfad merken und bis kurz vor Ablauf wiederverwenden (wie `dokumentAdressen`
  der Pläne, T-42); Bilder beim Senden am Gerät verkleinern und ein kleines Vorschaubild mitspeichern
  (Original nur auf Tipp).
- **Gewinn groß** · **Aufwand klein (Adressen) bis mittel (Vorschaubild)** · **Risiko:** eine gemerkte
  Adresse gilt bis zu ihrem Ablauf weiter, auch nach dem Löschen der Nachricht (heute schon 10 min) ·
  **trägt:** ja.

### B5 — Mitarbeiterübersicht: bekannte Grenze, deren Grund nicht mehr gilt (mittel bis hoch)

- **Wo:** `AccountingView.tsx:329` (`subscribeEntriesInRange`, Monat ± 1 Woche, alle Personen, alle
  Spalten), Messung `docs/ui-umbau/messung-ladezeit-ende.md:41`.
- **Was:** Gemessen 1,9 s mit 25 Personen, 3,5 s mit 75 (9.240 Zeilen, 527 KB, 38 Anfragen); für 50
  Personen dazwischen rund 2,7 s — über dem eigenen Budget von 2,5 s (Stand 23). Die Messung
  begründet das mit „Senklot ist für Betriebe bis etwa 30 Mitarbeiter gedacht“. `CLAUDE.md` sagt
  inzwischen „für jeden österreichischen Installationsbetrieb“. Der nächste Schritt steht dort schon:
  Monatswerte je Person vom Server oder die Liste in Seiten.
- **Dazu belegt:** Nach jeder Rückkehr in den Tab baut jedes Abonnement seinen Kanal neu auf und
  gleicht zweimal ab (`kern.ts:721–729`, `:1085–1088`): für diese Seite 2 × 19 Anfragen über
  `id,updated_at`, auch wenn sich nichts geändert hat.
- **Lösung:** Tages- und Monatswerte je Person als Datenbankfunktion (eine Zeile je Person und Tag
  reicht für Streifen und Vergleich); die vollen Buchungen erst beim Öffnen einer Person. Für den
  Abgleich: zuerst die Anzahl und das jüngste `updated_at` fragen, nur bei Abweichung die Kennungen.
- **Gewinn groß für diese Seite** · **Aufwand groß** (eigener Umbau, wie schon benannt) · **Risiko:**
  zwei Rechenwege (SQL und `calcWorkMin`) müssen gleich bleiben — wie bei `arbeitszeit_vorlauf` schon
  gelöst · **trägt:** ja, wächst dann mit Personen × Tagen statt mit Buchungen.

### B6 — Rechnungen: alle offenen Rechnungen samt Positionen und Abdeckung, bei jedem Besuch und jeder Änderung (mittel)

- **Wo:** `src/lib/db/pg/invoices.ts:153–166` (`listUnpaidInvoices`, ohne Grenze, mit `zusammensetzen`),
  Aufrufe `InvoicesView.tsx:315` und `:804`.
- **Was:** Die Startseite holt seit T-5e nur noch die Köpfe (`listUnpaidInvoiceKoepfe`); die
  Rechnungsseite holt weiter jede Position und jede Abdeckungszeile jeder offenen Rechnung. Gemessen
  (×3): 794 Positionen in 5 Anfragen, 185 KB, 36 Datenbankanfragen, 2,1 s. Jede Live-Meldung zu einer
  Rechnung löst beides neu aus (`offeneNeuLaden`). Uneinbringliche Rechnungen bleiben „Überfällig“ und
  sammeln sich über die Jahre.
- **Lösung:** offene Rechnungen als Köpfe; Positionen erst beim Öffnen einer Rechnung holen
  (`listInvoicesByIds`, so wie das Mahnen die Rechnung vor dem Beleg schon frisch liest,
  `InvoicesView.tsx:2231`). Heute reicht die Liste die ganze Rechnung ins Fenster
  (`setDetailFuer(inv)`, `:3044`).
- **Gewinn mittel** · **Aufwand mittel** (5.640-Zeilen-Ansicht; Mahnlauf und Summen lesen laut T-5e
  keine Positionen, das Fenster schon) · **Risiko:** Stellen, die Positionen aus der Liste lesen,
  müssen gefunden werden — Geld-Ansicht, sorgfältig prüfen · **trägt:** ja.

### B7 — „Nicht verrechnet“: bis zu sieben Wege nacheinander, mit `select *` für ein Feld (mittel)

- **Wo:** `src/lib/db/pg/invoices.ts:459–552` (`scheineAufRechnung`), benutzt von Rechnungen
  (`InvoicesView.tsx:827`), Startseite (`laden.ts:523–526`) und Scheinliste.
- **Was:** Abdeckung → Rechnungsköpfe → Scheine → Rechnungen der Baustellen → Baustellen bzw.
  Material und Abdeckung: fünf Abfragen **nacheinander**, davor zwei für die Scheine. Jede holt alle
  Spalten, gelesen wird je ein bis sechs Felder (Zeile 472: ganze Rechnungsköpfe für
  `paymentStatus`). Zeile 536 holt **jede** Abdeckungszeile aller Rechnungen dieser Baustellen, nur um
  zu wissen, ob es eine gibt — bei einer großen Regiebaustelle tausende Zeilen.
- **Szenario:** Buchhaltung öffnet Rechnungen am Handy mit 150 ms Laufzeit: allein die Kette kostet
  gut eine Sekunde, bevor „Nicht verrechnete Leistung“ erscheint.
- **Lösung:** eine Datenbankfunktion `scheine_verrechnet(ids)`; als kleiner Schritt `spalten` setzen.
- **Gewinn mittel** · **Aufwand mittel** (die Regeln „in Pauschale enthalten“ und „im abgerechneten
  Zeitraum“ liegen in TypeScript) · **Risiko:** Regel doppelt geführt, wenn nur halb verlagert ·
  **trägt:** ja.

### B8 — Jede Änderung im Einstieg benennt 172 von 218 Bausteinen um (mittel)

- **Wo:** `vite.config.ts:225–231`; gemessen aus `chunks.json`.
- **Was:** 170 Bausteine importieren den Einstieg unter seinem Namen mit Fingerabdruck
  (`from"./index-Cg2d9Ayp.js"`). Ändert sich eines der 189 Module im Einstieg (App, Hülle, Navigation,
  `kern.ts`, `time.ts`, `pg/invoices.ts` …), bekommen 172 Dateien einen neuen Namen: 2,6 MB roh,
  927 KB gzip (830 KB Brotli). Das Vorladen im Leerlauf holt sie auf jedem Gerät neu.
- **Szenario:** Im November 4–7 Zusammenführungen je Tag. Nach jeder lädt jedes Telefon den Einstieg
  (113 KB) und die Stile (42 KB) vor dem ersten Bild neu und im Hintergrund bis zu rund 0,9 MB. Die
  eigene Messung nennt für den ersten Besuch nach einer Fassung 2,3–3,8 s statt 0,9–2,1 s.
- **Lösung:** `main.tsx` als dünner Einstieg, der die App dynamisch lädt; gemeinsamen Code in wenige
  benannte Bausteine nach Änderungshäufigkeit (Datenkern, Hülle und Bausteine, Rechenregeln);
  Datenmodule einzelner Bereiche aus dem Einstieg nehmen (Suchfenster lädt sie bei Bedarf); kleine
  Bausteine zusammenlegen (`experimentalMinChunkSize`). Dazu `modulepreload` für den Baustein der
  Startseite, damit er nicht erst nach dem Einstieg entdeckt wird.
- **Gewinn mittel** (bei seltenen Auslieferungen klein) · **Aufwand mittel** · **Risiko:** Reihenfolge
  der Initialisierung (`main.tsx` richtet vor React einiges ein), Service-Worker-Prüfung der
  Start-Bausteine (`huellenBausteine` liest nur `index.html`) · **trägt:** unabhängig von Daten.

### B9 — Akten und mehrere Listen beginnen bei jedem Besuch leer; Suchtext geht bei „Zurück“ verloren (mittel, gefühlte Geschwindigkeit)

- **Wo:** Ohne gemerkten Stand (kein `useZwischengespeichert`/`useGemerkt`): `CustomersView`,
  `KundenakteView`, `QuotesView`, `AngebotView`, `WartungenView`, `UserMgmtView`, `BenutzerakteView`,
  `LiegenschaftenView`, `EingaengeView`. Suchtext als Zustand der Ansicht:
  `CustomersView.tsx:101`, `QuotesView.tsx:307`, `WartungenView.tsx:200`.
- **Szenario:** Kunden → „Huber“ suchen → Akte öffnen → Zurück: die Liste lädt mit Platzhaltern neu,
  das Suchfeld ist leer. Bei Baustellen bleibt beides stehen (Filter in der Adresse, gemerkter Stand).
- **Lösung:** dieselben Bausteine wie bei den Baustellen: Suche in die Adresse, `useGemerkt` für Liste
  und Akte. Rechnungen bleiben bewusst ohne.
- **Gewinn mittel** · **Aufwand klein je Seite** · **Risiko:** gering, das Muster ist erprobt; nur
  Ansichten, die aus der Liste selbst schreiben, bleiben ausgenommen (Regel aus 16.3) · **trägt:** ja.

### B10 — Tagesplanung lädt den ganzen Monat aller Personen (niedrig bis mittel)

- **Wo:** `src/features/assignments/AssignmentsView.tsx:227` (`subscribeAssignmentsForMonth`, alle
  Spalten, ohne Grenze). Gemessen: 600 Zeilen (×1), 2.100 (×3) für die Ansicht eines Tages; bei 50
  Personen rund 1.400.
- **Lösung:** für den Tag den Tag (und die Woche drumherum) laden; die Markierungen im Monatskalender
  als Zählung je Tag. **Gewinn klein bis mittel · Aufwand mittel · Risiko:** der Monatskalender der
  Seite liest heute dieselbe Liste · **trägt:** ja.

### B11 — Weiß bis zum ersten Bild; Schriften ohne Vorabruf; ein Stylesheet für alles (niedrig)

- **Wo:** `index.html` (`<div id="root"></div>`, kein Stil im Kopf), `src/main.tsx` (Schriften über
  `@fontsource`, `font-display: swap`), Bau: `index-*.css` 257 KB.
- **Was:** Vor dem ersten Bild müssen 274 KB (gzip) da sein; gemessen 1,3–1,5 s bis zur ersten
  Anzeige beim ersten Besuch auf langsamem 4G. Bis dahin ist die Seite weiß, dann Papierfarbe. Die
  Schriften werden erst nach dem Stylesheet entdeckt und tauschen nach dem ersten Zeichnen (der
  Taktgeber rechnet deshalb nach, `takt.ts:207–214`).
- **Lösung:** Papierfarbe und ein ruhiges Zeichen als Inline-Stil in `index.html` (hell/dunkel nach
  `darstellungAnwenden`), `preload` für DM Sans 400/500. Stile je Ansicht aufzuteilen bringt wenig
  (42 KB gzip) und birgt Reihenfolge-Risiken — nicht empfohlen.
- **Gewinn klein, aber bei jedem Kaltstart sichtbar · Aufwand klein · Risiko:** CSP erlaubt Inline-Stil
  nur als Attribut (`style-src-elem 'self'`) — ein `<style>` im Kopf bräuchte einen Hash in
  `firebase.json` · **trägt:** unabhängig von Daten.

### Gemessen und kein Befund

- **`src/lib/takt.ts`:** rechnet nicht je Bild, sondern höchstens einmal je Bild **nach einer
  DOM-Änderung**. Im Browser gemessen (Chromium, CPU ×4, echtes Stylesheet): erster Lauf 19–98 ms
  (einmal je Seite und Fenstergröße), danach 2–17 ms je Lauf, auch bei 30 Blättern oder 9.000 Knoten.
  Nicht der Engpass.
- **Listen ohne Fenster:** fast alle Listen zeigen 20 Zeilen je Gruppe und „weitere anzeigen“
  (Regel 4). Virtualisierung brächte dort nichts. Offen bleibt das Raster Personen × Tage (V2).
- **Zeilenschutz:** die Regeln rechnen einmal je Abfrage; `leseregelnGleichwertig.test.ts` wacht.
- **Datenbankseite der Buchungsabfragen:** nachgestellt (261.000 Buchungen) Monat aller Personen
  1,5 ms je Seite, Zählen 0,7 ms, eine Person über zehn Jahre 2,9 ms. Teuer ist nicht die Datenbank,
  sondern die Menge, die in den Browser wandert (B1, B2, B5).
- **Nachrichten-Postfach und Verlauf:** über Funktionen mit Schlüssel-Blättern und Grenze, ein Kanal
  auf den eigenen Teilnahmen. Gut gebaut (außer B4).

---

## 3. Verdacht (nicht bis zum Ende verfolgt oder nicht messbar)

- **V1 — `InvoicesView` als eine Komponente (5.640 Zeilen, 101 `useState`, 16 `useMemo`):** jeder
  Tastendruck in einem Feld (Suche, Position, Zahlung) rechnet die ganze Ansicht neu. Im Repository
  gibt es kein `memo` (0 Treffer) und kein `useDeferredValue`. Ob das am Handy spürbar ist, ist ohne
  angemeldete App nicht gemessen. Prüfweg: React-Profiler beim Tippen im Rechnungsformular, CPU ×4.
- **V2 — Raster Personen × Tage** (Tagesstreifen der Mitarbeiterübersicht, Monatsansicht der Planung):
  bei 50 Personen rund 1.550 Zellen ohne Fenster und ohne `content-visibility`. Nicht gemessen.
- **V3 — Katalogimport bei offenen Lager- oder Materialseiten:** jede der zehntausenden Zeilen ist
  eine Live-Meldung, und Supabase prüft den Zeilenschutz je Meldung und Abonnent. Der Client bündelt
  (50 ms, 1 s); die Last am Realtime-Dienst ist damit nicht kleiner. Nur gegen das gehostete Projekt
  messbar.
- **V4 — Startseite der Leitung:** 29 Datenbankanfragen je Aufbau (gemessen 20.10.). Gleichzeitig und
  im Budget; eine gebündelte Funktion sparte Verbindungen, ist aber ein großer Umbau ohne klaren
  Zeitgewinn.
- **V5 — Nachkalkulation:** je Lauf 25 Baustellen mit allen Buchungen, ganzen Scheinen, Rechnungen
  samt Positionen (`nachkalkulationLaden.ts:62`). Begrenzt durch die 25, wächst aber mit der Größe
  der Baustellen. Nicht gemessen.
- **V6 — Scheinliste:** „Stunden ohne Buchung“ holt alle Buchungen des Betriebs im geprüften Zeitraum
  mit allen Spalten (`WorkSheetsListView.tsx:364`); gebraucht werden Person, Tag, Baustelle, Minuten.

---

## 4. Die 15 teuersten Ansichten

„gemessen“ = Endmessung 20.10.2026, Alltag, langsames 4G, ×1 / ×3. Sonst aus dem Code begründet.

| # | Ansicht | Kosten | Grund |
|---|---|---|---|
| 1 | Mitarbeiterübersicht | gemessen 1,9 / 3,5 s, 129 / 527 KB | alle Buchungen des Monats aller Personen; Gesamtsaldo B2; Abgleich bei Rückkehr B5 |
| 2 | Startseite Monteur | nicht gemessen | mit Tagessoll alle Buchungen seit Eintritt (B1) |
| 3 | Zeiterfassung Monteur | nicht gemessen (16.3: 1,1 s ohne Tagessoll) | B1; dazu 69 KB Code |
| 4 | Rechnungen | gemessen 1,7 / 2,1 s, 28 / 36 Anfragen | kein gemerkter Stand (bewusst); B6, B7; 105 KB Code |
| 5 | Startseite Leitung | gemessen 1,3 / 1,8 s, 29 Anfragen | viele Blöcke; nach zehn Minuten wieder kalt |
| 6 | Lager | gemessen 1,8 / 2,1 s | alle Lagerartikel live (1.600–2.000 Zeilen in 6 Anfragen) plus `lager_frei` |
| 7 | Planung Tag | gemessen 1,4 / 1,5 s | Monat aller Einsätze für einen Tag (B10) |
| 8 | Planung Monat | nicht gemessen | Raster Personen × Tage (V2) |
| 9 | Handwerksscheine | nicht gemessen | Scheine + alle Buchungen des Zeitraums (V6) + Kette B7 |
| 10 | Nachkalkulation | nicht gemessen | 25 Baustellen mit allem (V5) |
| 11 | Gespräch (Nachrichten) | nicht gemessen | Bilder in voller Größe, neu geladen (B4) |
| 12 | Urlaub | nicht gemessen | rund zwölf Abfragen; Zeitguthaben je Antragsteller über B1 |
| 13 | Katalog / Material anfordern | gemessen 1,0 / 0,8 s ohne Suche | Suche ohne Index (B3) |
| 14 | Baustellenakte | nicht gemessen | 65 KB Code in 52 Dateien; Belegschaft, Rechnungen, Angebote, Scheine je Reiter |
| 15 | Anforderungen | gemessen 0,9 / 1,1 s | 400 Zeilen in zwei Live-Listen |

---

## 5. Nicht nahtlos

- **Zurück aus einer Akte** (Kunden, Angebote, Wartungen, Benutzer): Liste lädt neu, Suchtext weg (B9).
- **Nach einer neuen Fassung** lädt das Gerät fast den ganzen Programmcode neu, obwohl sich meist nur
  eine Ansicht geändert hat (B8).
- **Die Ladezeit-Messung deckt den Monteur nicht ab:** `messung.mjs` misst zwölf Seiten als
  Geschäftsführung; Zeiterfassung, eigene Startseite, Scheine, Urlaub und Nachrichten fehlen, und der
  Testbestand kennt weder verschiedene Eintrittsmonate noch ein Tagessoll (B1, B2).
- **Grenze ohne gültigen Grund:** „bis etwa 30 Mitarbeiter“ in der Messung widerspricht dem Grundsatz
  in `CLAUDE.md` (B5); in `grenzen-durchsicht` steht dazu nichts.

## 6. Funktionen mit Mehrwert (im bestehenden Ablauf)

1. **Gespeicherte Monatsbilanzen** als eine Quelle für Saldo, Startseite, Urlaub, Mitarbeiterübersicht
   und Lohn — löst B1, B2 und den größten Teil von B5 an einer Stelle.
2. **Leistungswächter in der CI:** Budget für Einstieg, Stile und Bausteine je Ansicht (aus dem Bau),
   dazu Zeilen- und Anfragenbudget je Seite aus `messung.mjs` — damit ein Rückschritt auffällt.
3. **Testbestand wie ein gewachsener Betrieb:** 50 Personen, zehn Jahre, Eintritte über die Jahre
   verteilt, kurzer Freitag, Monteur-Seiten in der Messung.
4. **Vorschaubilder im Chat** und Verkleinern beim Senden (B4) — schneller und schont das Datenvolumen.
5. **Akte beim Berühren der Zeile vorbereiten** (`pointerdown`): Baustein und Kopf der Akte holen,
   bevor der Finger loslässt; heute hängen Akten nur am Vorladen ihrer Liste.
6. **Kaltstart aus dem gemerkten Profil:** Hülle und Navigation sofort aus dem zuletzt bekannten
   Profil und Betrieb zeichnen und im Hintergrund prüfen (`AuthContext.tsx:251`); die Seite kann ihre
   Daten dann eine Runde früher fragen. Zu klären: personenbezogene Daten am Gerät (Anwalt, R-A1).

## 7. Was ich nicht angesehen habe

- Die gehostete Datenbank und der Realtime-Dienst (keine Zugangsdaten): alle Datenbankzahlen sind
  lokal an nachgebauten Tabellen gemessen, ohne Zeilenschutz und ohne die 265 Migrationen.
- Die angemeldete App im Browser: keine eigene Ladezeitmessung je Seite (dazu wäre der lokale
  Supabase-Stapel nötig; Docker läuft hier nicht). Die Seitenzeiten stammen aus der Messung vom 20.10.
- Edge Functions (Push, Kalender-Abo, Sicherung), PDF-Erzeugung, DATANORM-Übernahme, Papierkorb,
  Plattform- und Einstellungsseiten.
- Jede einzelne Schutzregel nach dem 09.10.2026 (der Wächtertest deckt das ab; nicht selbst ausgeführt).
- Speicherverbrauch und lange Sitzungen (ein Tag offene App), Verhalten ohne Netz.
- Die Datenbankfunktionen der Startseite und der Nachrichten im Einzelnen (nur `nachrichten_postfach`
  gelesen).

---

## Empfohlene Reihenfolge

1. **B1 + B2** zusammen (Bilanzen mit Tagen je Zustand, Gesamtsaldo aus der Datenbank) — größte
   Wirkung für Monteure und Büro, schließt einen blinden Fleck der Messung.
2. **B3** (Indizes, reine Migration) und **B4** (Adressen merken, Bilder verkleinern) — klein, sofort
   spürbar.
3. **B6 + B7** (Rechnungen schlanker) und **B9** (gemerkter Stand, Suche in der Adresse).
4. **B5** (Mitarbeiterübersicht vom Server) — eigener Umbau, nach 1., weil er auf den Bilanzen aufbaut.
5. **B8, B11** (Auslieferung) und Wächter aus Abschnitt 6, Punkt 2 und 3.
