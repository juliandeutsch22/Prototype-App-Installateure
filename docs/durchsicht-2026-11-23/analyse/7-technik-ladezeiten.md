# Technik quer durch alles (Ladezeiten, Skalierung, Robustheit, Zustand des Codes und der Prüfungen) — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. Nur gelesen, dazu gebaut und gemessen:

- `npm run build` (Node 22.23.4, 81 s samt `tsc -b`, Vite 23,5 s) und ein zweiter Bau mit
  `LEISTUNG_ALLES=1`; beide schreiben nur nach `dist/` und `supabase/functions/_shared/` (beide in
  `.gitignore`). `git status` war danach leer, keine verfolgte Datei wurde verändert.
- Fünf einzelne Prüfdateien zu L15 (`zip`, `appZeichen`, `infoHintUmbruch`, `QuotesView`,
  `BaustellenakteView`) mit `--reporter=verbose`, je allein.
- Wegwerf-Skripte (Suchläufe über Quelltext und Migrationen) und die Bauausgaben liegen im
  Scratchpad unter `audit/L/` (`bau-ausgabe.txt`, `bau-alles.txt`, `rpc.py`, `tot.py`, `fk.py`,
  `l15-*.txt`). Kein Docker, kein Supabase-Stapel, kein voller Testlauf, kein Browserlauf.

Alle Datenbankaussagen stammen aus dem Lesen der jeweils **letzten** Definition in
`supabase/migrations/`; gemessen wurde an der Datenbank nichts.

---

## 1. Angesehen

- **Bau und Bündel:** `vite.config.ts` (Bausteinschnitt, Leistungswächter, Start-Stil),
  `leistungsbudget.json`, `tests/unit/leistungswaechter.test.ts`, `index.html`, das Ergebnis in
  `dist/` (254 JavaScript-Bausteine, 12 Schriftdateien), `public/sw.js` im Überblick,
  `src/lib/ansichten.ts` (Vorladen im Leerlauf, Datensparmodus), `firebase.json`.
- **Datenschicht:** `src/lib/db/pg/kern.ts` ganz (Blättern, `abonnieren`, `kanalHalten`,
  Abgleich, eigene Änderung), alle 210 Aufrufe von Datenbankfunktionen (`.rpc(`) gegen den
  Rückgabetyp ihrer letzten SQL-Definition, alle festen Grenzen (`grenze:`, `.limit(`,
  `max = …`), `src/lib/listengrenzen.ts`, die Kanäle und ihre Filter, `eigeneAenderung.ts`,
  `supabase/config.toml` (`max_rows = 1000`), die Edge Function `startseite-forderungen`.
- **Abläufe von Anfang bis Ende verfolgt:** Nachkalkulation (Ansicht → `rechneBaustellen` →
  fünf Abfragen → SQL), Kundenakte und Baustellenakte (Rechnungen), Rechnungsliste (Köpfe,
  „Überfällig“ setzen), Mitarbeiterübersicht (Abo der Monatsbuchungen), Baustellenauswahl beim
  Buchen, eigene Buchung → Live-Liste.
- **Robustheit:** 149 verschluckte Fehler (`.catch(() => undefined|null|[])`) — die in Geld-,
  Zeit- und Scheinansichten einzeln gelesen; Hörer, Taktgeber und Beobachter gegen ihre
  Abmeldung; 38 Stellen mit Datum als Text; Geldrundung; Typlöcher.
- **Prüfungen:** `vitest.config.ts`, die fünf L15-Dateien, alle `skip`/`todo`, die drei
  Playwright-Konfigurationen, `tests/durchklick/aufbau.ts`, die Wächter gegen Abfragen ohne
  Grenze (`abfragegrenzen.test.ts`, `zeilengrenze.test.ts`).
- **Auslieferung:** die drei Workflows, `docs/DEPLOYMENT.md` §6 und §8,
  `tests/unit/auslieferungsKette.test.ts`, die Reihenfolge aller 358 Migrationen in der
  Git-Geschichte.

### Was der Bau heute ergibt (gemessen, gzip)

| Größe | gemessen | Grenze (`leistungsbudget.json`) | Luft |
|---|---|---|---|
| vor dem ersten Bild (5 Dateien) | 274,0 KB | 290 KB | 5,5 % |
| Einstieg | 7,7 KB | 15 KB | 49 % |
| größter eigener Baustein (`gemeinsam`) | 94,3 KB | 100 KB | 5,7 % |
| Zahl der JavaScript-Bausteine | 254 | 260 | 2,3 % |
| schwerste Ansicht in KB (`InvoicesView`) | 131,0 KB | 135 KB | 3,0 % |
| meiste Dateien je Ansicht (`DashboardView`, `BaustellenakteView`) | 69 | 70 | 1 Datei |
| Bausteine, die den Einstieg einbinden | 0 | 0 | — |

Weitere Zahlen: 59 gemessene Ansichten, Median 25,7 KB; 159 der 254 Bausteine sind kleiner als
5 KB, 94 kleiner als 2 KB. jsPDF (123 KB), `html2canvas`, `canvg` und Firebase kommen weiter nur
auf Abruf. Schriften: sechs `woff2` (92 KB), davon zwei vorab geladen; die sechs `woff` (106 KB)
lädt kein heutiger Browser. Das Vorladen im Leerlauf achtet auf den Datensparmodus
(`src/lib/ansichten.ts:219`).

---

## 2. Befunde (belegt)

### L-1 Die Nachkalkulation verliert still Materialkosten, sobald 25 Baustellen zusammen mehr als 1.000 Ausgabezeilen haben
- Art: Fehler
- Schwere: hoch — Geschäftsführung und Buchhaltung sehen einen zu hohen Deckungsbeitrag, ohne
  Hinweis; tritt bei Betrieben mit größeren Baustellen regelmäßig ein, sonst mit den Jahren.
- Beleg: `src/lib/db/pg/materialOrders.ts:506` ruft `ausgegebenes_material_gesamt` für alle
  Baustellen eines Laufs in **einer** Anfrage ohne Blättern; die Funktion gibt je erledigter
  Anforderung, je Retoure und je geladener Rüstlistenzeile eine Zeile zurück
  (`supabase/migrations/20261116060700_material_kleine_luecken.sql:486–557`, sortiert nach
  Baustelle, Datum, Name). `supabase/config.toml:18` deckelt jede Antwort bei 1.000 Zeilen, auch
  die einer Funktion (so steht es selbst in `src/lib/db/pg/materials.ts:350–354`). Ein Lauf
  umfasst bis zu 25 Baustellen (`src/features/costing/NachkalkulationView.tsx:27`). Dasselbe
  Muster bei `schein_einkaufspreise` (`src/lib/db/pg/workSheets.ts:881`, aufgerufen in
  `src/features/costing/nachkalkulationLaden.ts:127`): eine Zeile je Materialzeile jedes Scheins
  aller 25 Baustellen, ohne Reihenfolge und ohne Blättern.
- Auswirkung: Eine Anforderung mit zehn Artikeln sind zehn Zeilen. 25 Baustellen mit je 45
  ausgegebenen Artikeln ergeben 1.125 Zeilen; die letzten 125 kommen nicht an. Weil nach
  Baustelle sortiert wird, fehlt den Baustellen mit den höchsten Nummern das ausgegebene
  Material ganz oder teilweise — ihr Deckungsbeitrag steht zu gut da. Bei den Einkaufspreisen
  fällt die Rechnung für die fehlenden Zeilen still auf den heutigen Stammpreis zurück.
- Vorschlag: In `kern.ts` einen Helfer `rpcAlle(name, argumente)` anlegen, der wie
  `unverrechnetHolen` (`src/lib/db/pg/invoices.ts:584`) in Seiten zu `SEITE` über `.range()`
  holt, bis eine Seite nicht voll ist; beide Aufrufe darauf umstellen. Dafür brauchen beide
  Funktionen eine eindeutige Reihenfolge: eine neue Migration ersetzt sie
  (`security definer`, `set search_path = ''`, `revoke … from public, anon`, `grant execute … to
  authenticated`, Rechteprüfung im Rumpf unverändert) und ergänzt
  `order by a.baustelle, a.datum, a.name, a.beleg_id` bzw. `order by wm.work_sheet_id, wm.id`.
  Prüfung: `tests/supabase/ausgegebenesMaterialGesamt.test.ts` um einen Fall mit 1.200 Zeilen
  über zwei Baustellen erweitern (alle kommen an, Summe je Baustelle stimmt); Gegenprobe: mit
  dem heutigen Aufruf kommen genau 1.000. Gleich bleiben muss: Zeilen, Vorzeichen der Retouren
  und Rechte (`ausgegebenesMaterialGesamt.test.ts`, `materialKleineLuecken.test.ts`), das
  Bündeln (`tests/unit/nachkalkulationBuendel.test.ts`) und die Ansicht
  (`NachkalkulationView.test.tsx`). Risiko des Umbaus: bei wechselnder Reihenfolge zwischen zwei
  Seiten kämen Zeilen doppelt oder gar nicht — deshalb der eindeutige Schlüssel am Ende der
  Sortierung.
- Aufwand: klein

### L-2 Kein Wächter verhindert, dass eine Datenbankfunktion mit Zeilenmenge ungeblättert gerufen wird
- Art: fehlende Prüfung
- Schwere: mittel — die Ursache von L-1 kann an jeder neuen Funktion wieder entstehen; bemerkt
  wird sie erst im gewachsenen Betrieb.
- Beleg: `tests/unit/abfragegrenzen.test.ts` („Die Wachstumsbremse“) prüft nur Tabellenabfragen
  der Datenschicht, `tests/supabase/zeilengrenze.test.ts` nur `abfragen`. Der Suchlauf über alle
  `.rpc(`-Aufrufe (Scratchpad `audit/L/rpc.py`) findet 46 Aufrufe von Funktionen, die laut
  letzter SQL-Definition `setof` oder `table` zurückgeben; neun blättern, die übrigen nicht.
  Davon wachsen mit dem Bestand: `ausgegebenes_material_gesamt`, `schein_einkaufspreise` (L-1),
  `ausgegebenes_material` (`materialOrders.ts:473`), `scheine_verrechnet`
  (`invoices.ts:516`, siehe Verdacht V-2). Unkritisch, weil je Person, je Tag oder im SQL
  begrenzt: `kollegen`, `zeitkonto_salden`, `einsatz_tage`, `rechnungen_des_kunden`,
  `katalog_nummern_suche`, `liegenschaften_suche`, `preisverlauf`, `fehlerprotokoll_plattform`.
- Auswirkung: Wie L-1, an der nächsten Auswertung, die jemand als Funktion baut.
- Vorschlag: Neue Prüfung `tests/unit/funktionsgrenzen.test.ts`: liest alle `.rpc('name'`
  unter `src/`, sucht die letzte Definition in `supabase/migrations/`, und verlangt für jede
  Funktion mit Zeilenmenge eines von dreien: `.range(` am Aufruf (oder `rpcAlle`), ein
  `limit` im SQL-Rumpf, oder einen Eintrag in einer Ausnahmeliste mit Grund (wie `AUSNAHMEN`
  in `abfragegrenzen.test.ts`). Gegenprobe: ohne die Umstellung aus L-1 ist sie für die beiden
  Funktionen rot. Gleich bleiben muss nichts am Programm; die Prüfung ändert nur, dass eine neue
  Funktion ohne Entscheidung rot wird. Risiko: der Suchlauf erkennt Funktionen nicht, die per
  Textersatz (`pg_get_functiondef` + `replace`) geändert wurden — dort zählt der ursprüngliche
  Rückgabetyp, der sich dabei nicht ändert.
- Aufwand: klein

### L-3 Kunden- und Baustellenakte holen jede Rechnung ganz — Positionen, Abdeckung und Leistungsnachweis —, um Köpfe zu zeigen
- Art: Grenze (unbenannt) und Lücke gegenüber L6
- Schwere: mittel — Büro und Leitung bei jedem Öffnen einer Akte; spürbar bei
  Hausverwaltungen und Stammkunden mit vielen Rechnungen, am Handy mit Mobilfunk.
- Beleg: `src/lib/db/pg/invoices.ts:661–680`: `rechnungen_des_kunden` gibt bis zu 500 ganze
  Rechnungszeilen (`RECHNUNGEN_JE_KUNDE = 500`, Zeile 647; ohne Spaltenwahl, also samt
  `leistungsnachweis`), danach holt `zusammensetzen` (Zeile 89–113) alle Positionen und alle
  Abdeckungszeilen dazu. Die Kundenakte zeigt davon fünf
  (`src/features/customers/KundenakteView.tsx:578`), auf Knopf alle. Ab genau 500 steht „Alle
  500 zeigen“ (`:604`) — dass es mehr gibt, sagt nichts. Die Baustellenakte ruft
  `listInvoicesForProject` (`invoices.ts:444–455`, ebenfalls ohne Spaltenwahl, mit
  `zusammensetzen`; `src/features/projects/BaustellenakteView.tsx:278`). L6 hat das für die
  Rechnungsliste, die Startseite und die Leseliste gelöst (`KOPF_SPALTEN`,
  `invoices.ts:160–170`), für die Akten nicht.
- Auswirkung: Die Kundenakte einer Hausverwaltung mit 400 Rechnungen zu je acht Positionen lädt
  rund 3.200 Positionszeilen und die Abdeckung, um fünf Zeilen anzuzeigen. Ab der 501. Rechnung
  fehlen die ältesten ohne Hinweis.
- Vorschlag: `listInvoicesForCustomer` und ein neues `listInvoiceKoepfeForProject` holen nur
  Köpfe (`.select(KOPF_SPALTEN)` auf der Funktion, wie `kern.ts:422` es für die Suche tut) und
  die Kundenakte zuerst nur die gezeigten fünf plus die Gesamtzahl; „Alle N zeigen“ holt die
  nächste Seite. Das Fenster (`AkteRechnungFenster`) holt die ganze Rechnung beim Öffnen über
  `listInvoicesByIds` und zeigt bis dahin „Leistungen werden geladen …“ — dasselbe Muster wie
  `mitBeleg` in der Rechnungsliste. `listInvoicesForProject` selbst bleibt unverändert, weil
  die Rechnungserstellung (`InvoicesView.tsx:435, 1702, 1763, 2041`) die ganzen Rechnungen
  braucht. Prüfung: `KundenakteView.test.tsx` und `BaustellenakteView.test.tsx` je „holt nur
  Köpfe; das Fenster holt die eine Rechnung“; Gegenprobe: mit dem heutigen Stand wird
  `listInvoicesByIds` nie gerufen. Gleich bleiben muss: Reihenfolge und Inhalt der Zeilen,
  Öffnen und Schließen des Fensters (bestehende Fälle aus E99), die Regel „Rechnungen der Akte
  werden nicht gemerkt“. Risiko: Stellen, die aus der Liste Positionen lesen
  (`KundenakteView.tsx:832, 861`) — vor dem Umbau alle Leser von `rechnungen.daten` durchgehen.
- Aufwand: mittel

### L-4 Der Leistungswächter hat an vier Stellen nur noch 1 Datei bis 6 % Luft; die Begründung im Budget stimmt nicht mehr
- Art: Grenze
- Schwere: mittel — die nächste Erweiterung an Rechnungen, Startseite oder Baustellenakte macht
  den Bau rot, und zwar unter Umständen erst auf `main` (siehe L-9); der bequeme Ausweg ist, die
  Grenze anzuheben.
- Beleg: Tabelle in Abschnitt 1. `leistungsbudget.json:2` nennt als Stand „vor dem ersten Bild
  264,7 KB … größter eigener Baustein 90,7 KB, 234 Bausteine, schwerste Ansicht 123,5 KB in 63
  Dateien … Etwa 10 % Luft“; gemessen sind heute 274,0 KB, 94,3 KB, 254 Bausteine, 131,0 KB und
  69 Dateien. Seit dem dort genannten Stand vom 17.11.2026 sind 20 Bausteine und 9 KB vor dem
  ersten Bild dazugekommen.
- Auswirkung: Ein neues Fenster auf der Startseite (eine Datei mehr im Graph) bricht den Bau
  ab. Wer dann die Grenze anhebt, hebt sie für alle Ansichten.
- Vorschlag: (1) `_warum` in `leistungsbudget.json` auf die gemessenen Werte bringen und das
  Datum der Messung nennen — reine Dokumentation. (2) Die Rechnungsansicht entlasten, statt die
  Grenze zu heben: siehe L-12. (3) Als **Idee mit Vorbehalt** messen, ob
  `build.rollupOptions.output.experimentalMinChunkSize` (etwa 4 KB) die 159 Kleinstbausteine
  zusammenlegt, ohne Kreise zu erzeugen; der Vorbehalt ist derselbe wie bei L7 (verlässliche
  Startreihenfolge), deshalb erst messen und mit `bausteinSchnitt.test.ts` und dem Rundgang
  unter der Inhaltsregel prüfen. Gleich bleiben muss: `importierenEinstieg = 0`, der Start ohne
  Netz (`startBausteineFehlen`), alle Prüfungen in `leistungswaechter.test.ts`.
- Aufwand: klein (1), mittel (3, nur Messung)

### L-5 Die Grenze „Belegschaft“ beruft sich wieder auf „Betriebe bis etwa 30 Mitarbeiter“
- Art: Unstimmigkeit
- Schwere: niedrig bis mittel — kein Fehler im Programm, aber derselbe Grund, den die
  Durchsicht vom 15.11. (B5/L5) als ungültig festgestellt hat, steht erneut als Begründung da.
- Beleg: `docs/grenzen-durchsicht-2026-10-24.md:982–985` („Senklot ist für Betriebe bis etwa 30
  Mitarbeiter gedacht (Auftraggeber, 20.10.2026)“), `docs/ui-umbau/messung-gewachsen.md:121–122`
  („Grenze: Betriebsgröße“), `docs/ui-umbau/messung-ladezeit-ende.md:41`,
  `src/lib/listengrenzen.ts:90` („greift bei einem Betrieb dieser Grösse nirgends“). `CLAUDE.md`
  sagt: für jeden österreichischen Installationsbetrieb.
- Auswirkung: Wer die Übersicht der Grenzen liest, hält eine Größenannahme für beschlossen.
- Vorschlag: Den Grund ersetzen durch den, der wirklich trägt und schon in
  `tests/unit/abfragegrenzen.test.ts:36–39` steht: die Belegschaft wächst mit dem Betrieb,
  nicht mit der Zeit, und jede Zeile wird für Namen und Auswahl gebraucht. Budget B3 in
  `tests/links/leistung.spec.ts` und in der Messung entsprechend fassen („kein Bestand, der mit
  der Zeit wächst“). Nur Texte; gleich bleibt alles am Programm.
- Aufwand: klein

### L-6 Welche Seiten das Budget B3 noch nicht halten, steht nirgends aktuell; mehrere sind unbenannt
- Art: Grenze (unbenannt)
- Schwere: mittel — betrifft Monteure am Handy bei jedem Öffnen von Start, Zeiterfassung und
  Materialanforderung.
- Beleg: Die Tabellen in `docs/ui-umbau/messung-gewachsen.md:124–176` sind vom 15.11.2026, also
  vor der Nacharbeit der Welle 4; der Text darüber beschreibt den Stand danach
  („Die übrigen Seiten der Liste unten waren nicht Teil dieses Auftrags“, Zeile 96–97). Über
  50 Zeilen je Anfrage blieben laut dieser Messung und unverändertem Code: Baustellenauswahl
  beim Buchen und Anfordern (240 laufende Baustellen, `src/lib/db/pg/projects.ts:21`,
  `src/components/BaustellenSelect.tsx`), Angebotsliste (100 Angebote samt allen Zeilen,
  `src/lib/db/pg/quotes.ts:89–96`), Kundenliste (200), Rechnungen (298 Köpfe, 249 Kunden über
  die Suche, 120 Baustellen), Monteur: genehmigte Urlaube des Betriebs (134,
  `src/lib/db/pg/vacations.ts:66–81`), eigene Buchungen (148), „zuletzt angefordert“ (200).
  Dazu die Akten aus L-3, die die Messung nicht besucht. In
  `docs/grenzen-durchsicht-2026-10-24.md`, Abschnitt Welle 4, steht davon nur die Belegschaft.
- Auswirkung: Ein Monteur lädt beim Öffnen von „Material anfordern“ alle laufenden Baustellen
  und 200 Anforderungen, um eine Baustelle zu wählen.
- Vorschlag: (1) Die Messung neu laufen lassen und die Tabellen ersetzen (Stapel nötig; hier
  nicht möglich). (2) Je Seite entscheiden: bauen oder mit gültigem Grund benennen. Bauwürdig
  und im erprobten Muster: Angebotsliste als Köpfe (wie L6), Baustellenauswahl mit „meine und
  zuletzt gebuchte“ plus Suche auf dem Server (wie `KundenAuswahl`; `BaustellenSuche` gibt es
  schon für den abgeschnittenen Fall). Begründbar: Urlaube des Betriebs im sichtbaren Zeitraum
  (wächst mit Personen, nicht mit der Zeit). Prüfung je Seite: `tests/links/leistung.spec.ts`
  mit dem Budget; Gegenprobe wie dort beschrieben. Gleich bleiben muss: jede wählbare
  Baustelle bleibt erreichbar (`BaustellenSelectGanz.test.tsx`), die Angebotsliste zeigt
  dieselben Zeilen und Summen (`QuotesView.test.tsx`).
- Aufwand: mittel je Seite

### L-7 Schreiben über eine Datenbankfunktion meldet den Live-Listen nichts; der genannte Grund trägt nicht
- Art: Lücke (benannte Grenze ohne gültigen Grund)
- Schwere: mittel — Einsatzplanung, Zeit einfügen und aufteilen, Urlaub und Krankmeldung
  eintragen, Lagereingang: bleibt die Meldung des Kanals aus (gesperrte Websockets, Abriss),
  zeigt die eigene Seite den alten Stand bis zum nächsten Abgleich. Genau dieser Fall wurde in
  der CI gefunden (Stand §118) und nur für die einfachen Schreibwege behoben.
- Beleg: `eigeneAenderung(` wird nur in `src/lib/db/pg/kern.ts:509, 531, 587, 600` (Anlegen,
  Anlegen mit Kennung, Ändern, Löschen), in `ohneEmpfang.ts` und im Ausgangsfach gerufen. Die Wege über Funktionen rufen es
  nicht, etwa `einsatz_speichern` (`src/lib/db/pg/assignments.ts:206`), `zeit_einfuegen`
  (`src/lib/db/pg/timeEntries.ts:245`), `urlaub_eintragen`
  (`src/lib/db/pg/abwesenheiten.ts:124`). Die Grenze ist benannt in
  `docs/ui-umbau/entscheidungen.md:4394–4398` mit „welche Zeilen eine Funktion ändert, weiß nur
  sie (Grund: fachlich)“. `eigeneAenderung` braucht aber keine Zeilen, nur den Namen der
  Tabelle — und den kennt jede Funktion der Datenschicht, die die Datenbankfunktion ruft.
- Auswirkung: Die Disponentin plant in einem Netz ohne Websockets einen Einsatz ein; der
  Wochenplan zeigt ihn erst nach dem Nachfassen oder dem nächsten Seitenwechsel.
- Vorschlag: In der Datenschicht eine Tabelle „Funktion → geschriebene Tabellen“
  (`src/lib/db/pg/schreibt.ts`) und ein gemeinsamer Aufruf `rpcSchreiben(name, argumente)`, der
  nach Erfolg `eigeneAenderung` für jede Tabelle ruft; die schreibenden Aufrufe darauf
  umstellen (zuerst die mit Live-Liste: `assignments`, `time_entries`, `material_orders`,
  `materials`, `projects`, `einsatz_material`, `lagerorte`). Prüfung: `eigeneAenderung.test.ts`
  je umgestelltem Weg „gleicht ohne Kanal ab“; ein Wächter liest die Migrationen und verlangt
  für jede aus `src/` gerufene Funktion, die nicht `stable`/`immutable` ist, einen Eintrag
  (auch „schreibt keine Tabelle mit Live-Liste“ mit Grund). Gegenprobe: ohne Eintrag für
  `einsatz_speichern` rot. Gleich bleiben muss: fremde Änderungen kommen weiter über den
  Kanal; ein zusätzlicher Abgleich ändert kein Bild, wenn nichts anders ist
  (`kern.ts:1053–1054`). Risiko: mehr Abgleiche je Schreibvorgang — sie sind gebündelt
  (`eigenPlanen`), siehe aber Verdacht V-1.
- Aufwand: mittel

### L-8 Nach der Auslieferung prüft nichts, ob die neue Fassung live ist; der Rücksprung dauert länger, als die Anleitung sagt
- Art: Lücke
- Schwere: mittel bis hoch — selten, aber dann betrifft es alle Betriebe zugleich.
- Beleg: `.github/workflows/deploy.yml:196–211` endet mit „Deploy“ und „Schlüssel entfernen“;
  kein Schritt liest danach `/fassung.txt`, obwohl der Bau sie genau dafür ablegt
  (`vite.config.ts`, `fassungsDatei`) und `firebase.json` sie mit `no-cache` ausliefert.
  `CLAUDE.md` verlangt den Blick von Hand („Danach prüfen, ob die Auslieferung live ist“).
  `docs/DEPLOYMENT.md:583–584` sagt: „Code kaputt → `git revert` auf `main`, der Deploy läuft
  von selbst wieder. Drei Minuten.“ Tatsächlich läuft auf `main` die ganze Kette
  (`supabase-migrationen.yml`: Migrationen von null an mit allen Datenbankprüfungen → Einspielen
  → Functions → `deploy.yml` mit Typen, Lint und allen Unit-Prüfungen → Bau → Deploy); dieselbe
  Anleitung nennt dafür in §8 selbst „gut zehn Minuten“. Dazu kommt nach der Regel in
  `CLAUDE.md` der Pull Request mit grüner CI. Den schnellen Weg — in Firebase Hosting die vorige
  Fassung wieder freigeben — nennt die Anleitung nicht. `docs/DEPLOYMENT.md:267` sagt zudem,
  `deploy.yml` „läuft auf `main`“; es wird dort nur aufgerufen.
- Auswirkung: Eine Auslieferung meldet Erfolg, die Seite liefert aber die alte Fassung (das gab
  es schon, siehe Kopf von `vite.config.ts`); oder eine kaputte Fassung ist draußen, und der
  Betrieb wartet eine Viertelstunde und länger auf die Rücknahme.
- Vorschlag: (1) In `deploy.yml` nach „Deploy“ ein Schritt „Ist die neue Fassung live?“: bis
  zu zehnmal im Abstand von sechs Sekunden `https://<Projektkennung>.web.app/fassung.txt`
  holen und auf die ersten sieben Zeichen von `github.sha` prüfen; sonst rot. (2) Ein von Hand
  startbarer Auftrag „Vorige Fassung wieder ausliefern“ (`workflow_dispatch`, nur `main`,
  `environment: production`), der die vorige Hosting-Fassung freigibt (Firebase kennt dafür
  den Rollback im Versionsverlauf und `hosting:clone`; die genaue Aufrufform beim Bauen an der
  Firebase-Dokumentation prüfen), und derselbe Prüfschritt danach. (3) `docs/DEPLOYMENT.md`
  „Wenn etwas schiefgeht“ auf die wirklichen Zeiten und den schnellen Weg bringen; §6
  berichtigen. Prüfung: `tests/unit/auslieferungsKette.test.ts` um „nach dem Deploy wird die
  Fassung geprüft“ erweitern (Gegenprobe: ohne den Schritt rot). Gleich bleiben muss: die
  Kette Schema → Functions → App, nur `main` liefert aus (bestehende Fälle derselben Datei).
  Risiko: der Rücksprung der App nimmt keine Migration zurück — er ist nur sicher, weil
  Migrationen abwärtsverträglich sein müssen; das gehört in den Text des Auftrags.
- Aufwand: klein (1, 3), mittel (2)

### L-9 Vor dem Merge wird nur gebaut, wenn der Durchklick läuft; sonst scheitert der Bau erst auf `main`, nachdem das Schema eingespielt ist
- Art: Lücke
- Schwere: mittel — selten, aber die Folge ist eine halbe Auslieferung: Migrationen und Edge
  Functions sind live, die App nicht.
- Beleg: Der Auftrag `test` in `.github/workflows/deploy.yml:55–75` prüft Typen, Lint und
  Unit-Prüfungen, baut aber nicht. Gebaut wird vor dem Merge nur im Auftrag „Inhaltsregel je
  Rolle“ (`playwright.csp.config.ts:68`, `npm run build`), und der Workflow `durchklick.yml`
  hängt an einem Pfadfilter (Zeile 23–44), in dem `index.html`, `public/**`,
  `leistungsbudget.json`, `tailwind.config.js`, `postcss.config.js` und `tsconfig*.json`
  fehlen. Der Bau kann aus Gründen scheitern, die keine Unit-Prüfung sieht: Leistungsbudget
  (L-4), fehlender Start-Baustein in `index.html`, CSS-Größe nach einer Änderung an
  `tailwind.config.js`.
- Auswirkung: Ein Pull Request ändert nur `tailwind.config.js`; die CI ist grün; auf `main`
  werden die Migrationen eingespielt, dann bricht „Bauen“ am Budget ab.
- Vorschlag: Im Auftrag `test` nach den Unit-Prüfungen `npx vite build --config vite.config.ts`
  (gemessen 24 s; die Typen sind dort schon geprüft) — ohne Geheimnisse: der Bau dieser
  Durchsicht lief ohne `.env` durch (`datenbankVorverbinden` kommt ohne Adresse aus).
  `deploy.yml` läuft bei **jedem** Pull Request ohne Pfadfilter; damit ist jeder Pull Request
  vor dem Merge gebaut, und der Leistungswächter, die Hash-Prüfung der eingebetteten Skripte
  und die Prüfung der Start-Bausteine laufen mit. Zusätzlich die fehlenden Pfade in
  `durchklick.yml` ergänzen (`index.html`, `public/**`, `leistungsbudget.json`,
  `tailwind.config.js`), damit eine Änderung an der Hülle auch den Rundgang unter der
  Inhaltsregel auslöst. Prüfung: `auslieferungsKette.test.ts` „der Prüfauftrag baut“
  (Gegenprobe ohne den Schritt rot). Gleich bleiben muss: der Deploy-Auftrag baut weiter selbst
  mit den Geheimnissen; die Reihenfolge Schema → Functions → App. Risiko: rund eine halbe
  Minute mehr je Pull Request.
- Aufwand: klein

### L-10 Die Auslieferung läuft auf Node 20, das seit 30.04.2026 nicht mehr gepflegt wird; die Werkzeugfassungen sind uneinheitlich festgelegt
- Art: Grenze
- Schwere: niedrig bis mittel — kein Fehler heute; Sicherheitskorrekturen für die Laufzeit, mit
  der die ausgelieferte App gebaut wird, kommen nicht mehr.
- Beleg: `.github/workflows/deploy.yml:52` (`NODE_VERSION: '20'`), dagegen `durchklick.yml:57`
  und `supabase-migrationen.yml:55` mit `'22'`; `package.json` hat kein `engines`, es gibt keine
  `.nvmrc`. Die Unit-Prüfungen laufen in der CI damit auf Node 20, lokal und für die
  Datenbankprüfungen auf 22. `deploy.yml:203` ruft `npx --yes firebase-tools@15` — die jeweils
  neueste 15.x, mit dem Dienstschlüssel in der Umgebung; für die Supabase-CLI begründet
  dieselbe CI eine feste Fassung (`supabase-migrationen.yml:75–80`).
- Auswirkung: Ein Unterschied zwischen Node 20 und 22 zeigt sich erst im Auslieferungsauftrag.
  Eine neue 15.x von `firebase-tools` läuft ungeprüft mit Schreibrecht auf das Hosting.
- Vorschlag: `NODE_VERSION: '22'` in `deploy.yml`; `"engines": { "node": ">=22" }` in
  `package.json` und eine `.nvmrc`; `firebase-tools` auf eine genaue Fassung festlegen (als
  `devDependency` mit Lockfile oder `@15.x.y`). Prüfung: `auslieferungsKette.test.ts` „alle
  Workflows nennen dieselbe Node-Fassung“ (Gegenprobe rot am heutigen Stand). Gleich bleiben
  muss: Bau und alle Prüfungen grün unter 22 — lokal ist das der heutige Zustand. Risiko: eine
  Prüfung, die nur unter 20 grün war; das zeigt der erste Lauf des Pull Requests.
- Aufwand: klein

### L-11 Die Wege des Büros laufen im Browser nie in WebKit, das Tablet nie in Safari
- Art: fehlende Prüfung
- Schwere: mittel — Büros mit iPad oder Mac in Safari; betroffen sind Geldwege (Rechnung
  stellen, E-Rechnung, PDF, Kontoauszug) und das Umplanen per Ziehen.
- Beleg: `playwright.config.ts:58` (`MONTEUR_WEGE`): nur 15 der 84 Dateien unter
  `tests/durchklick/` laufen im Projekt `webkit-telefon` (Zeile 108). Die übrigen 69 — darunter
  `rechnungStellen`, `eRechnung`, `pdfAblaeufe`, `kontoauszug`, `belegMail`,
  `einsatzplanUmplanen`, `zweiFaktor`, `angebotLink`, `kundenRechnung` — laufen nur in Chromium
  am Schreibtisch. Die beiden Tablet-Projekte (Zeile 128, 145) sind `Desktop Chrome` mit
  anderer Breite. `playwright.links.config.ts:41–43` prüft in WebKit nur drei Dateien am
  iPhone. Benannt ist in der Grenzen-Übersicht nur „WebKit nur in der CI“ und „Bewegungen Bild
  für Bild nur in Chromium“, nicht diese Lücke.
- Auswirkung: Ein PDF, das Safari anders öffnet oder speichert als Chromium, oder ein Ziehen,
  das am iPad nicht greift, fällt erst im Betrieb auf.
- Vorschlag: Ein Projekt `webkit-buero` (Desktop Safari, 1.440 px) und `webkit-tablet`
  (iPad, hochkant) für eine feste Auswahl der Geldwege: `rechnungStellen`, `pdfAblaeufe`,
  `eRechnung`, `kontoauszug`, `einsatzplanUmplanen`, `zweiFaktor`. Die vier Teile der CI
  verteilen die Mehrzeit. Was WebKit nicht kann (eingespeiste Touchereignisse), bleibt wie
  heute mit Grund übersprungen. Gleich bleiben muss: kein Weg wird aus Chromium entfernt, keine
  Wiederholung bei Rot. Risiko: neue rote Wege, die echte Safari-Eigenheiten zeigen — das ist
  der Zweck; zuerst einmal von Hand laufen lassen (`workflow_dispatch`), dann zur Pflicht
  machen.
- Aufwand: mittel

### L-12 `InvoicesView` ist eine einzige Komponente mit 6.574 Zeilen und wächst weiter
- Art: Grenze (Zustand des Codes)
- Schwere: mittel — die Ansicht mit dem meisten Geld ist die, in der eine Änderung am
  schwersten zu überblicken ist; sie liegt zugleich 3 % unter ihrem Bündelbudget.
- Beleg: `src/features/invoices/InvoicesView.tsx`: 6.574 Zeilen, eine Komponente, 119 Zeilen mit
  `useState`, 23 mit `useEffect`; am 15.11. waren es 5.640 Zeilen (Vorgängerpapier, V1) — plus
  934 Zeilen in acht Tagen und sechs Änderungen. Gebaut 156 KB roh, als Ansicht 131,0 KB
  gepackt bei einer Grenze von 135 KB. Im ganzen `src/` gibt es kein `memo`, kein
  `useDeferredValue`. Zehn Ansichten liegen über 1.500 Zeilen (`WorkSheetView` 2.161,
  `TimeForm` 1.944, `VacationsView` 1.914, `AdminOrdersView` 1.830, `WorkSheetsListView` 1.826,
  `QuotesView` 1.710, `SettingsView` 1.626, `EinsatzFormular` 1.611, `AccountingView` 1.533).
- Auswirkung: Jede Erweiterung an Rechnungen berührt Mahnlauf, Zahlung, Export und Formular in
  derselben Funktion; ein Zustand, der an einer Stelle zurückgesetzt wird, wirkt an anderer.
- Vorschlag: Kein Neuschreiben. Entlang der Nähte, die als Fenster schon abgegrenzt sind
  (Mahnlauf, Zahlung erfassen, Export/E-Rechnung, Stornieren), je ein Fenster in eine eigene
  Datei ziehen, das seinen Zustand selbst hält und über `ansicht()` erst beim Öffnen lädt. Die
  Regeln selbst liegen schon in eigenen Dateien (`mahnlauf.ts`, `zahlstand.ts`, `konditionen.ts`).
  Prüfung: `tests/components/InvoicesView.test.tsx` (6.692 Zeilen) bleibt unverändert und grün —
  das ist die Aussage „es bleibt gleich“; dazu sinkt die Messung des Wächters für die Ansicht
  (Gegenprobe: die Zahl vor und nach dem Schnitt im Commit nennen). Ein Fenster je Pull
  Request. Risiko: geteilter Zustand zwischen Liste und Fenster (etwa die frisch geladene
  Rechnung) — je Fenster zuerst auflisten, was es von außen liest und schreibt.
- Aufwand: groß (in Schritten zu je mittel)

### L-13 L15: Ursache je Prüfung gemessen — viermal vermeidbare Rechenzeit in der Prüfung selbst, einmal fehlende Frist
- Art: fehlende Prüfung (Zustand der Prüfungen)
- Schwere: niedrig bis mittel — niemand im Betrieb merkt es; gelegentlich rote Läufe kosten
  Vertrauen in die CI.
- Beleg (jede Datei allein, ohne Last; Frist je Prüfung 5 s, kein `testTimeout` in
  `vitest.config.ts`):

  | Prüfung | allein | Ursache |
  |---|---|---|
  | `BaustellenakteView.test.tsx:443` „G5 Kundenwechsel“ | 2,15 s | Drei Aufrufe von `kundeWaehlen` (`tests/components/kundenAuswahl.ts:35–49`): jeder wartet die echten 300 ms Suchverzug der `KundenAuswahl` (`src/components/KundenAuswahl.tsx:96–104`) ab und tippt den Kundennamen Zeichen für Zeichen, wobei jede Taste die ganze Akte neu zeichnet; dazu jedes Mal ein neues `userEvent.setup()`. |
  | `QuotesView.test.tsx:224` „zählt nur echte Arbeitszeit“ | 1,78 s | Einmal `kundeWaehlen` (300 ms) und rund 55 einzeln getippte Zeichen in einer Ansicht mit 1.710 Zeilen. |
  | `zip.test.ts:72` und `:89` | 1,39 s und 0,82 s | Je 65.535 bzw. mehr Dateieinträge — die Zahl ist die Aussage der Prüfung (Schwelle zu ZIP64). |
  | `appZeichen.test.ts:124` (`icon-512.png`) | 2,18 s | Rund 250.000 einzelne `expect(...)` in der Schleife über jedes Pixel (Zeile 135–138), dazu zwei weitere volle Durchläufe. |
  | `infoHintUmbruch.test.ts` | 1,26 s | Liest jede `.tsx` unter `src/` und baut je Datei einen Syntaxbaum; anders als die übrigen Wächter dieser Art (`bedienregeln`, `schalterRegel`, `warnzeichen`: `60_000`) trägt sie keine eigene Frist. |

  Unter Last (alle Kerne belegt, 586 Dateien) verdrei- bis vervierfachen sich diese Zeiten und
  erreichen die 5 s.
- Vorschlag: (a) `kundeWaehlen`: den Namen mit einem Ereignis setzen (`fireEvent.change`) statt
  zu tippen, und den Suchverzug in den Ansichtsprüfungen über eine exportierte Konstante auf 0
  stellen (in `tests/components/setup.ts`); eine eigene Prüfung in `KundenAuswahl.test.tsx` hält
  fest, dass draußen 300 ms gelten. (b) `appZeichen`: in der Schleife zählen, danach **ein**
  `expect` mit der Liste der ersten Abweichungen — dieselbe Aussage. (c) `zip` und
  `infoHintUmbruch`: je eine eigene Frist von 30 s mit dem gemessenen Grund im Kommentar, wie
  bei den anderen Wächtern. Nicht die allgemeine Frist anheben. Gegenprobe für (a) und (b): die
  Laufzeit vorher/nachher im Commit; die geprüften Aussagen bleiben wörtlich dieselben, und
  ein absichtlich eingebauter Fehler (falsche Rundung der Ecke, Vorschlag der Adresse bei
  gefülltem Feld) macht sie weiter rot. Risiko: `fireEvent.change` überspringt das Verhalten
  je Taste — dort, wo eine Prüfung genau das meint (`QuotesView` „nach dem ersten Tippen hängt
  es an“), bleibt das Tippen.
- Aufwand: klein

### L-14 Datenschicht und Datenbank tragen Teile, die die App nicht mehr ruft; Prüfungen halten sie am Leben
- Art: Unstimmigkeit (toter Code)
- Schwere: niedrig — kostet Pflege und täuscht Abdeckung vor.
- Beleg (Suchlauf `audit/L/tot.py`, Kommentare ausgenommen, danach einzeln mit `grep`
  nachgeprüft):
  - `zeitkontoMonate` (`src/lib/db/pg/zeitkonto.ts:52`, weitergereicht in
    `src/lib/db/zeitkonto.ts:5`) hat keinen Aufrufer in `src/`; die Datenbankfunktion
    `zeitkonto_monate` rufen nur `tests/supabase/zeitkontoZwischenstand.test.ts` und
    `zeitkontoSaldo.test.ts`. L19 hat sie von 1,5–2,7 s auf 40 ms gebracht — für eine Liste,
    die keine Oberfläche zeigt (siehe Abschnitt 5, Idee 1).
  - `src/lib/db/monatsbilanzen.ts` importiert keine Datei unter `src/`; `listBilanzen` und
    `listBilanzenAlle` (`src/lib/db/pg/monatsbilanzen.ts`) rufen nur
    `tests/supabase/skalierung.test.ts`, `bilanzenAlle.test.ts`, `modulEinstellungen.test.ts`.
    `tests/components/TimeView.test.tsx:115` und `DashboardView.test.tsx:261` ersetzen das
    Modul noch durch eine Attrappe, obwohl die Ansichten es nicht mehr laden.
  - Nur von Prüfungen benutzt: `materialOhneSchein`
    (`src/features/invoices/ausgegebenesMaterial.ts`), `spesenSumme`
    (`src/features/invoices/mahnung.ts`), `anstehende`
    (`src/features/maintenance/wartungsplan.ts`), `ohneEinsatzListe`
    (`src/features/projects/baustellenLage.ts`), `wochenFeld`
    (`src/features/assignments/planungKopf.ts`).
- Vorschlag: Je Fund entscheiden: wird die Regel gebraucht (dann anschließen), oder nicht
  (dann samt Prüfung entfernen, wie in Stand §76 und L20 geschehen). Die Datenbankfunktionen
  bleiben, bis über Idee 1 entschieden ist; `monatsbilanzen_alle` und die Sicht `monthly_stats`
  nur mit einer Migration entfernen, die prüft, dass nichts sie mehr ruft. Gleich bleiben muss:
  `datenschichtVertrag.test.ts` und `vorschauErsatz.test.ts` grün. Risiko: eine Funktion, die
  nur über einen zusammengesetzten Namen gerufen wird — vor dem Entfernen je Name ein `grep`
  über `src/`, `shared/`, `supabase/functions/` und `tools/`.
- Aufwand: klein

### L-15 Migrationen können im Projekt in anderer Reihenfolge landen als in der Prüfung; nichts wacht darüber
- Art: fehlende Prüfung
- Schwere: niedrig — bisher nicht eingetreten; wenn, dann gilt im Projekt eine andere „letzte“
  Fassung einer Funktion als in jeder Prüfung.
- Beleg: `.github/workflows/supabase-migrationen.yml:140` spielt mit
  `supabase db push --include-all` ein: eine Migration mit **kleinerem** Zeitstempel als die
  zuletzt eingespielte wird nachträglich angewandt. Die Prüfung davor baut dagegen von null an
  in Zeitstempel-Reihenfolge. Die Git-Geschichte aller 358 Migrationen zeigt keinen Fall (0
  Zusammenführungen, die eine Migration vor dem bis dahin höchsten Zeitstempel einfügten) — das
  hält bisher die Sorgfalt, keine Prüfung. Bei parallelen Paketen („Wellen“) liegt der Fall
  nahe.
- Auswirkung: Zwei Zweige ändern dieselbe Funktion; der mit dem älteren Zeitstempel wird später
  zusammengeführt. Von null an gewinnt der jüngere Zeitstempel, im Projekt der später
  eingespielte.
- Vorschlag: Ein Schritt im Auftrag „Migrationen von null an“ für Pull Requests: jede im
  Pull Request neu hinzugefügte Migration muss einen Zeitstempel über dem höchsten auf dem
  Zielzweig tragen (`git diff --diff-filter=A --name-only origin/main...`), sonst rot mit dem
  Hinweis, sie umzubenennen. Gleich bleiben muss: `--include-all` bleibt, damit ein
  übersprungener Lauf nichts liegen lässt. Risiko: keiner am Programm.
- Aufwand: klein

### L-16 Vier Texte beschreiben einen Stand, den es nicht mehr gibt
- Art: Unstimmigkeit
- Schwere: niedrig
- Beleg: (a) `docs/stand-2026-10-03.md:3356` führt den doppelten „Kupferrohr 15mm“ als „offen
  und benannt“, `:3428` (§117) als erledigt — am Code ist er erledigt: `tests/durchklick/aufbau.ts:158–168`
  räumt Lagerbewegungen und -bestände vor den Artikeln ab und bricht bei jedem Löschfehler mit
  dem Tabellennamen ab; die Ursache war der Fremdschlüssel ohne `cascade` aus
  `20261115300000_…sql:308–311`. Ein Suchlauf über die Fremdschlüssel (`audit/L/fk.py`) findet
  keine weitere Tabelle, die das Abräumen festhält. (b) `leistungsbudget.json:2` (siehe L-4).
  (c) `docs/ui-umbau/messung-gewachsen.md` (siehe L-6). (d) `index.html:19` erklärt die
  Statusbalkenfarbe mit `#0f4552`, gesetzt ist in Zeile 30 `#ffffff`.
- Vorschlag: Die vier Stellen berichtigen. Für (a) als Idee ein kleiner Wächter, der die
  Abräumliste gegen die Fremdschlüssel der Migrationen prüft (heute sagt es der Aufbau erst,
  wenn Zeilen da sind — laut, aber spät).
- Aufwand: klein

---

## 3. Verdacht (nicht zu Ende geprüft)

- **V-1 Zwei gleichzeitige Abgleiche einer Live-Liste können eine eben gemeldete neue Zeile
  wieder entfernen.** `abgleichen` (`src/lib/db/pg/kern.ts:1014–1061`) kann von vier Seiten
  zugleich laufen: Nachfassen (`:1166, 1183, 1190`), Wiederholung nach Fehler (`:973–981`),
  Wiederaufbau des Kanals (`:1188`) und — seit E99 — eigene Änderung (`:1208–1220`; die Sperre
  `eigenLaeuft` gilt nur dort). Ablauf: Abgleich B holt die Kennungen; Abgleich A endet und setzt
  `bereit = true`; eine Meldung des Kanals legt Zeile Y direkt in den Bestand; B kommt zurück,
  Y steht nicht in seiner Kennungsliste und wird gelöscht (`:1028–1030`). Die Zeile fehlt bis
  zum nächsten Abgleich. Mit L-7 (mehr Abgleiche) würde das häufiger. Es fehlt: eine Prüfung,
  die zwei überlappende Abgleiche mit einer Meldung dazwischen nachstellt (in
  `tests/unit/liveListeOhneNetz.test.ts` machbar). Abhilfe, falls bestätigt: alle Auslöser über
  **eine** Warteschlange (läuft einer, folgt genau einer danach), wie `eigenLaeuft` es für den
  eigenen Weg schon tut.
- **V-2 `scheine_verrechnet` ungeblättert.** `scheineAufRechnung` (`invoices.ts:510–520`) gibt
  je verrechnetem Schein eine Zeile; `BaustellenScheine.tsx:76` übergibt alle unterschriebenen
  Scheine einer Baustelle. Über 1.000 verrechnete Scheine an **einer** Baustelle (eine
  Dauerbaustelle über Jahre) stünden die übrigen als „nicht verrechnet“ da. Nicht geprüft, ob
  die Ansicht vorher schon begrenzt; fiele unter den Wächter aus L-2.
- **V-3 Zahl der Kanäle je Seite.** Jedes `abonnieren` öffnet einen eigenen Kanal (alle mit
  Filter auf den Betrieb, `kern.ts:1145–1147` — kein Kanal ohne Filter gefunden). Wie viele
  Kanäle eine Seite gleichzeitig hält und wo die Grenze des gehosteten Dienstes liegt, ist nur
  gegen das Projekt messbar.
- **V-4 Indizes.** Ohne Datenbank nicht gemessen. Auffällig beim Lesen:
  `ausgegebenes_material` und `ausgegebenes_material_gesamt` filtern auf den Ausdruck
  `lower(regexp_replace(trim(project_number), '^PR-', '', 'i'))` — kein Index kann das stützen,
  es wird jede Anforderung und jede Rüstliste des Betriebs gelesen. Fremdschlüssel ohne eigenen
  führenden Index (etwa `einkaufspreis_festgehalten.material_id`, `uid_pruefungen.customer_id`,
  `nachrichten_kanaele.project_id`) kosten nur beim Löschen der Zielzeile. Zu messen am
  gewachsenen Bestand mit `explain (analyze, buffers)`.
- **V-5 Tippen in der Rechnungsansicht** (alter V1): ob das Neuzeichnen von 6.574 Zeilen je
  Taste am Handy spürbar ist, ist weiter nicht gemessen (React-Profiler, CPU ×4, angemeldete App).
- **V-6 „Überfällig“ entsteht nur, wenn jemand mit Schreibrecht die Rechnungsliste öffnet**
  (`InvoicesView.tsx:893–904`, ein Schreibvorgang je Rechnung, Fehler bewusst still). Die
  Kundenakte zeigt den gespeicherten Zustand (`KundenakteView.tsx:596`) und damit „Offen“, bis
  das geschehen ist; Startseite und Mahnlauf rechnen selbst (`shared/forderungen.ts`). Gehört
  fachlich ins Geld-Papier; hier nur als Hinweis auf eine Regel, die an zwei Stellen verschieden
  wirkt.
- **V-7 Mitarbeiterübersicht:** die Monatsbuchungen kommen mit allen Spalten
  (`src/lib/db/pg/timeEntries.ts:55–68`, gemessen 906 Zeilen = 769 KB in Stand §106). Eine
  Spaltenliste würde die Datenmenge senken, ohne die Rechnung zu verlagern; welche Felder
  Streifen, Fenster, Tagesnachweis und Lohn-CSV lesen, ist nicht zusammengetragen.

---

## 4. Benannte Grenzen, neu bewertet

| Grenze (Fundstelle im Grenzen-Dokument) | Grund | Grund gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| Monatswerte der Mitarbeiterübersicht rechnet die App aus den Buchungen des Monats ± Woche (Welle 3, 9a) | fachlich: Lohnrelevanz, kein zweiter Rechenweg in SQL | ja — zwei Rechenwege für Lohnzahlen sind ein fachliches Risiko | bleibt; Datenmenge über Spaltenwahl senken (V-7) |
| Zeitkonto-Zwischenstände nur für aktive Konten (9a) | Datenschutz | ja | bleibt |
| Genaue Trefferzahl bei häufigem Suchbegriff kostet so viel wie Treffer (9a) | fachlich: „und N weitere“ nennt eine genaue Zahl | ja | bleibt |
| `suche_<tabelle>` mit den Rechten des Aufrufers (9a) | Sicherheit | ja | bleibt |
| Suchindizes ohne `concurrently`, kurze Schreibsperre (9a) | liegt beim Werkzeug (`supabase db push` in einer Transaktion) | ja | bleibt; große Indizes außerhalb der Arbeitszeit einspielen (steht in `DEPLOYMENT.md` „Wann eingespielt wird“) |
| Änderung an Hülle oder Datenkern benennt 176 Bausteine um (9b, L7) | Sicherheit (verlässliche Startreihenfolge) | ja | bleibt; nicht neu gemessen |
| Fassungswechsel am echten Telefon nicht geprüft (9b) | Gerät | ja, aber seit 17.11. offen | einen Termin mit dem Pilotbetrieb setzen und das Ergebnis eintragen |
| Messbestand bucht an Feiertagen (9b) | fachlich: misst Ladezeiten, nicht Salden | ja | bleibt |
| Belegschaft über 50 Zeilen, „Betriebe bis etwa 30 Mitarbeiter“ (Welle 4) | Annahme über den Betrieb | **nein** | Grund ersetzen (L-5) |
| WebKit nur in der CI (Welle 4) | Umgebung | ja | bleibt; die Lücke daneben ist L-11 |
| Bewegungen Bild für Bild nur in Chromium (Welle 4, E95) | Gerät | ja | bleibt |
| Messbestand übersteht die Datenbankprüfungen nur mit Eigentümerrechten (Welle 4) | Rechte | ja | bleibt |
| Schreibwege über Datenbankfunktionen melden ihre Tabelle nicht (`entscheidungen.md:4394`, E99) | „fachlich, je Funktion verschieden“ | **nein** — gebraucht wird nur der Tabellenname | bauen (L-7) |
| Die drei Abonnements ohne `abonnieren` (Einstellungen, Rechnungen, Rüstliste) melden nichts (E99) | keiner genannt | **nein** | mit L-7 an `beiEigenerAenderung` anschließen |
| `KATALOG_GRENZE` 1.000, `KUNDEN_GRENZE` 500, `BAUSTELLEN_AUSWAHL_GRENZE` 500 (`src/lib/listengrenzen.ts`) | „greift bei einem Betrieb dieser Grösse nirgends“ | **nein** als Begründung; die Grenzen selbst sind sichtbar und haben eine Suche dahinter | Begründung ersetzen; Baustellenauswahl siehe L-6 |
| Kundenimport höchstens 5.000 Zeilen (`src/features/customers/kundenCsv.ts:21`) | „kein Kundenstamm eines Installationsbetriebs“ | **nein** (Annahme); die Grenze ist laut | als Schutz vor einer falschen Datei begründen und den Weg nennen (in Teilen einspielen), oder anheben |
| L15 offen (Plan, Stand §112) | — | kein Grund | bauen (L-13) |
| Echtes iPhone: Lage der Inseln und Statusleiste (Stand §117, §118) | Gerät | ja | nach der Sicht am Gerät eintragen |

---

## 5. Zusammenspiel und Ideen

1. **Zeitkonto je Monat zeigen.** Die Datenbank liefert je Person und Monat Soll, Ist,
   Gutschrift, Saldo und Tage ohne Buchung (`zeitkonto_monate`, seit L19 in 40 ms über zehn
   Jahre), die Datenschicht reicht es durch — aber keine Ansicht ruft es (L-14). Nutzen: der
   Monteur sieht, in welchem Monat sein Saldo entstanden ist; die Lohnverrechnung sieht den
   Verlauf ohne Export. Aufwand: klein bis mittel (eine Karte in der Zeiterfassung und im
   Personenfenster). Vorbehalt: fachlich mit dem Zeit-Papier abstimmen; sonst die Funktion
   der Datenschicht entfernen.
2. **Die Messung als Auftrag in der CI** (`workflow_dispatch` und wöchentlich): gewachsener
   Bestand, `messung.mjs` für Geschäftsführung und Monteur, die Tabellen in
   `messung-gewachsen.md` als Artefakt. Nutzen: die Liste „über Budget B3“ ist nie älter als
   eine Woche (L-6). Aufwand: mittel (der Bestand braucht Minuten zum Anlegen). Vorbehalt:
   Laufzeiten auf geteilten Rechnern schwanken; verbindlich wären nur Zeilen und Anfragen.
3. **Die Akten in die Messung aufnehmen** (Kunden-, Baustellen-, Benutzerakte, ein Angebot,
   ein Schein): die Seiten, auf denen das Büro den Tag verbringt, fehlen im Seitensatz. Aufwand:
   klein.
4. **Rauchprobe nach der Auslieferung:** nach L-8 (1) zusätzlich die Anmeldeseite der
   Live-Adresse im Browser öffnen und auf Fehler der Inhaltsregel und der Konsole prüfen — der
   Rundgang prüft das heute nur vor dem Merge gegen den lokalen Bau. Aufwand: klein. Vorbehalt:
   ohne Testkonto im Projekt nur die Seiten vor der Anmeldung.
5. **Ein Datumshelfer statt zwölf.** „Tag plus n“ steht in mindestens zwölf Dateien unter
   sechs Namen (`plusTage`, `tagPlus`, `tagDanach`, `tageVerschoben`, `tagVerschoben`,
   `naechster`; etwa `src/features/assignments/folgetage.ts:9`,
   `src/features/dashboard/start/regeln.ts:345`, `src/lib/db/pg/invoices.ts:427`), alle richtig
   in UTC gerechnet. Nutzen: eine Stelle für die Regel „Kalendertage ohne Zeitzone“. Aufwand:
   klein. Vorbehalt: reiner Aufräumschritt ohne Wirkung für den Betrieb — nur zusammen mit
   einer ohnehin fälligen Änderung.

---

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe: hält / hält nicht)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| L1 Saldo nicht mehr aus allen Buchungen seit Eintritt | `src/features/dashboard/start/laden.ts:340–348` holt eigene Buchungen nur für das Lückenfenster; `hatTagessoll` nur noch in der Rechnung selbst | hält |
| L3 Katalogsuche über den Index | `src/lib/db/pg/materials.ts:113, 440` (`katalog_suchen`, `katalog_nach_namen`) | hält |
| L4 Chatbilder verkleinert, Vorschaubild | `src/features/nachrichten/bildVorbereiten.ts:11–23` | hält |
| L6 Listen nur als Köpfe | `src/lib/db/pg/invoices.ts:160–170` | hält für Liste, Startseite, Leseliste; die Akten waren nie umfasst (L-3) |
| L7 Kein Baustein bindet den Einstieg ein | Bau: 0; vor dem ersten Bild 5 Dateien | hält |
| L8 Gemerkter Stand, Suche in der Adresse | `useGemerkt` in `CustomersView.tsx:116`, `KundenakteView.tsx:141`, `QuotesView.tsx:281`, `WartungenView.tsx:213` | hält |
| L9 Tagesplanung abonniert die Woche | `src/features/assignments/AssignmentsView.tsx:241, 280` | hält |
| L10 Papier sofort, Schriften vorab | gebaute `dist/index.html`: `preload` für DM Sans 400/500, Stylesheet als `media="print"`, Skript mit Hash | hält |
| L11 Leistungswächter im Bau | Meldung im Bauprotokoll, alle 59 Ansichten gemessen, keine fehlend | hält — Luft fast aufgebraucht (L-4) |
| L12 Akte beim Berühren vorbereiten | `src/lib/akteVorbereiten.ts`, benutzt in vier Listen | hält |
| L20 Ungenutzte Abos entfernt | kein Treffer mehr außer in zwei Kommentaren | hält |
| L21 Fassung zur Laufzeit gesetzt | `src/main.tsx:29–30` | hält |

Kein Rückfall gefunden. Kein Befund außerdem bei: Zeitzonen (alle 38 Stellen mit Datum als
Text rechnen in UTC-Kalendertagen oder ausdrücklich in `Europe/Vienna`), Geldrundung (eine
Stelle, `shared/forderungen.ts:97`, Wächter `geldRundungEinmal.test.ts`), Hörern, Taktgebern
und Beobachtern (drei Dateien mit bewusst dauerhaften Hörern auf Modulebene), Typlöchern (ein
`any`, 26 `as unknown as` im ganzen `src/`), TODO/FIXME/„vorerst“ im Code (kein Treffer),
übersprungenen Prüfungen (18 `test.skip`, alle bedingt und begründet, keine unbedingte), der
Edge Function `startseite-forderungen` (blättert vollständig), Kanälen ohne Filter (keiner).

---

## 7. Nicht angesehen

- Die gehostete Datenbank, der Realtime-Dienst, echte Ladezeiten je Seite (kein Stapel, kein
  Docker): keine neue Messung der Seiten, keine Ausführungspläne, kein Index nachgemessen.
- Der volle Lauf der Unit-, Datenbank- und Browserprüfungen; Flattern unter Last ist nur aus den
  Einzelzeiten hergeleitet, nicht nachgestellt.
- `public/sw.js` im Einzelnen (nur Aufbau und Prüfdateien), Push, Ausgangsfach und
  Offline-Wege, Edge Functions außer `startseite-forderungen`.
- Jede der 149 Stellen mit verschlucktem Fehler: gelesen sind die in Rechnungen, Scheinen,
  Zeit, Urlaub, Lager, Angeboten und Auftragseingang; `push.ts` (18), `sitzung.ts`,
  `AuthContext.tsx` und die Plattformseiten nicht einzeln.
- Welche Ansichten keine eigene Prüfdatei haben: 120 von 764 Quelldateien werden in `tests/`
  nicht genannt; die meisten sind Teilkomponenten, die über ihre Ansicht geprüft werden. Einzeln
  nachgegangen bin ich nur der Nachkalkulation (geprüft, aber nicht über 1.000 Zeilen).
- Veraltete Abhängigkeiten über das hinaus, was `package.json` und Lockfile sicher belegen
  (kein `npm audit`, kein Netz): festgehalten ist nur Node 20 in der Auslieferung (L-10).
  Installiert sind unter anderem React 18.3.1, Vite 7.3.7, Vitest 4.1.12, ESLint 8.57.1,
  Firebase 10.14.1, Supabase-JS 2.116.0 — ohne Bewertung.
- Handbuch und `docs/FUNKTIONEN.md` gegen den Code; die Zeitangaben je Auftrag in
  `docs/DEPLOYMENT.md` §8 gegen echte Läufe der CI.
