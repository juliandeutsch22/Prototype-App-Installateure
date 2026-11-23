# Gegenprüfung: Technik quer durch alles (`analyse/7-technik-ladezeiten.md`) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (das Repo steht auf 663b684;
der Unterschied sind nur die Dateien unter `docs/durchsicht-2026-11-23/`).

Womit geprüft:

- Jede zitierte Datei und Zeile geöffnet; SQL an der Wegwerf-Datenbank `pruef_l`
  (`\sf`, `\d`, Katalogabfragen über `pg_proc`), dazu ein Probelauf mit 1.125 Zeilen.
- Eigener Bau: `npm run build` (Node 22.23.4, 63 s gesamt, Vite 12,5 s). `git status --short`
  danach leer.
- Die fünf Prüfdateien aus L-13 je allein mit `--reporter=verbose`.
- Eigene Suchläufe (`rpc.py` gegen den Katalog der Datenbank statt gegen den Text der
  Migrationen; `grep -w` je gemeldetem toten Namen über `src`, `shared`, `tools`,
  `supabase/functions`, `scripts`, `tests`). Ablage: Scratchpad `audit/pruef-l/`.
- Nicht verfügbar: PostgREST, Supabase-Stapel, WebKit, das gehostete Projekt.

## 1. Ergebnis in Zahlen

| Urteil | Anzahl | Befunde |
|---|---|---|
| bestätigt (nachgestellt) | 3 | L-2, L-4, L-13 |
| bestätigt (am Code) | 11 | L-1, L-3, L-5, L-6, L-7, L-8, L-9, L-10, L-11, L-12, L-16 |
| teilweise | 2 | L-14, L-15 |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

Kein Befund ist widerlegt. Die Abweichungen liegen in Belegen und vor allem in den
**Vorschlägen**: sieben davon brauchen eine Ergänzung, bevor sie gebaut werden (Abschnitt 4).

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| L-1 | bestätigt (am Code), Zeilenmenge nachgestellt | `materialOrders.ts:506` und `workSheets.ts:881`: beide `.rpc(…)` ohne `.range()`. `\sf`: `ausgegebenes_material_gesamt` endet mit `order by a.baustelle, a.datum, a.name` (nicht eindeutig), `schein_einkaufspreise` hat kein `order by`. Probe in `pruef_l` (25 Baustellen × 45 erledigte Anforderungen, Aufruf als Administrator): **1.125 Zeilen**; in der Reihenfolge der Funktion kämen von `b-2026-023` 10 von 45 an, von `024` und `025` **0 von 45**. Rückfall auf den Stammpreis: `materialkosten.ts:148–149` (`fest ?? e.preis`). Der Schnitt selbst (PostgREST) war hier nicht nachstellbar. | Reihenfolge wird mit `beleg_id` bzw. `wm.id` eindeutig (geprüft: `einsatz_material_positionen.beleg_id` ist `not null` und eindeutig, `einkaufspreis_festgehalten` eindeutig je Beleg und Artikel — der Verbund verdoppelt keine Zeile). Drei Berichtigungen am Beleg und eine Lücke: siehe 3. |
| L-2 | bestätigt (nachgestellt) | Eigener Suchlauf gegen `pg_proc.proretset`: 210 `.rpc(`-Stellen in `src/`, davon 203 mit festem Namen; **47** rufen eine Funktion mit Zeilenmenge (46 Funktionen), **10** mit `.range(`, **37** ohne. „37 von 47“ stimmt. `abfragegrenzen.test.ts` und `zeilengrenze.test.ts` enthalten kein `rpc`. | Der vorgeschlagene Wächter liest nur `.rpc('name'`. **Sieben Stellen rufen mit veränderlichem Namen** und fielen durch: `kern.ts:422` (`suche_${tabelle}`, 8 Funktionen, blättern), `plattform.ts:112`, `nachrichten.ts:165`, `inventur.ts:98`, `invoices.ts:807`, `zeitsitzungen.ts:93`, `supabaseSender.ts:227`. Darüber laufen fünf weitere Funktionen mit Zeilenmenge (`nachricht_meldungen` ohne `limit`; `nachrichten_postfach`, `nachrichten_verlauf`, `plattform_betrieb_protokoll`, `plattform_geloeschte_betriebe` mit `limit`). Der Wächter muss die Hüllen kennen. Zur Gegenprobe im Plan siehe 4. |
| L-3 | bestätigt (am Code) | `invoices.ts:444–455` und `:661–680` ohne Spaltenwahl, beide über `zusammensetzen` (Positionen und Abdeckung); `rechnungen_des_kunden` gibt `i.*` mit `limit … least(p_grenze, 2000)`; `RECHNUNGEN_JE_KUNDE = 500`; `KundenakteView.tsx:95` (`RECHNUNGEN_KURZ = 5`), `:604` „Alle N zeigen“ ohne Hinweis auf mehr. | (1) `listInvoicesForCustomer` filtert danach auf `z.company_id === companyId` — `KOPF_SPALTEN` enthält `company_id` (geprüft), das muss so bleiben. (2) „die Gesamtzahl“ gibt die Funktion nicht her: ihr `limit` deckelt auch `count`; es braucht eine eigene Zählung. (3) Die Baustellenakte braucht weiter **alle** Köpfe: `abschlussReif` (`BaustellenakteView.tsx:814`) liest Art und Zahlstand jeder Rechnung. In „bleibt gleich“ ergänzen. |
| L-4 | bestätigt (nachgestellt) | Zeile 18 meines Baus: „vor dem ersten Bild 274 KB (5 Dateien), Einstieg 7.7 KB, 254 Bausteine, 0 binden den Einstieg ein; InvoicesView 131 KB/63, DashboardView 110.3 KB/69, BaustellenakteView 98.5 KB/69“. `gemeinsam` 94,5 KB (Papier 94,3). 159 Bausteine unter 5 KB, 94 unter 2 KB (roh). `leistungsbudget.json:2` nennt 264,7 / 90,7 / 234 / 123,5. | Die Auswirkung ist um eins daneben: der Wächter prüft `ist > grenze` (`vite.config.ts:485`) — **eine** Datei mehr (70) hält noch, die zweite bricht. Vorschlag (1) und (3) ohne Einwand. Widerspruch zu L-12: siehe 4. |
| L-5 | bestätigt (am Code) | `grenzen-durchsicht-2026-10-24.md:982–985`, `messung-gewachsen.md:121–122`, `messung-ladezeit-ende.md:41`, `listengrenzen.ts:90` gelesen; `abfragegrenzen.test.ts:36–39` trägt den gültigen Grund. | Nur Texte. Kein Risiko. |
| L-6 | bestätigt (am Code) | `messung-gewachsen.md:125` und `:147` „Gemessen am 15.11.2026“; `projects.ts:21`, `quotes.ts:89–96` (`zusammensetzen`), `vacations.ts:66–81` wie zitiert. Die Zeilenzahlen (240, 298, 134 …) stammen aus der alten Messung und sind hier nicht neu gemessen. | Die Baustellenauswahl zeigt heute **alle** laufenden Baustellen in einem Feld, eigene oben, fremde darunter „wählbar — Aushilfe und Notdienst gehen auch auf fremde“ (`BaustellenSelect.tsx:53–57`). „Meine und zuletzt gebuchte plus Suche“ macht fremde Baustellen schwerer erreichbar. In „bleibt gleich“ fehlen: fremde Baustelle ohne Umweg wählbar, vorgegebene Baustelle aus dem Link, Ausweichweg bei keiner laufenden, „pausiert getrennt“. |
| L-7 | bestätigt (am Code) | `eigeneAenderung(` nur in `kern.ts:509, 531, 587, 600`, `ohneEmpfang.ts:173, 200`, `supabaseSender.ts:379`; `assignments.ts:206`, `timeEntries.ts:245`, `abwesenheiten.ts:124` rufen es nicht. `entscheidungen.md:4394–4398` wie zitiert. `eigeneAenderung` nimmt nur den Tabellennamen. | **Keine Meldung aus der Datenbank**, sondern ein Aufruf im Browser nach geglücktem Schreiben — damit kein Rechteproblem und kein Sturm über Geräte hinweg. Drei Lücken und eine Voraussetzung: siehe 4. |
| L-8 | bestätigt (am Code) | `deploy.yml:196–211`: nach „Deploy“ nur „Schlüssel entfernen“. `fassung.txt` beginnt in der CI mit `GITHUB_SHA.slice(0, 7)` (`vite.config.ts:25`); mein Bau: `663b684 · 23.11.2026, 22:21`. `DEPLOYMENT.md:267`, `:513` („gut zehn Minuten“), `:583–584` („Drei Minuten“) wie zitiert. | (1) trägt. (2) „derselbe Prüfschritt danach“ geht nicht wörtlich: nach dem Rücksprung steht die **alte** Kennung in `fassung.txt`, nicht `github.sha` des Laufs — der Schritt braucht die erwartete Kennung als Eingabe. Dazu in den Text: der nächste Merge liefert den kaputten Stand wieder aus, solange er nicht zurückgenommen ist. |
| L-9 | bestätigt (am Code), Bau ohne `.env` nachgestellt | Auftrag `test` (`deploy.yml:55–75`): Typen, Lint, Tests, kein Bau. `playwright.csp.config.ts:68` baut; `durchklick.yml:23–44` ohne `index.html`, `public/**`, `leistungsbudget.json`, `tailwind.config.js`, `postcss.config.js`, `tsconfig*.json`. Kette `einspielen` → `app` in `supabase-migrationen.yml:106–178`. Im Repo liegt nur `.env.example`; mein Bau lief durch. | Trägt. Der Auftrag `test` läuft auch auf `main` (über `workflow_call`) — dort käme der Bau doppelt; mit `if: github.event_name == 'pull_request'` vermeidbar. Reihenfolge im Plan: siehe 4. |
| L-10 | bestätigt (am Code) | `deploy.yml:52` `'20'`, `durchklick.yml:57` und `supabase-migrationen.yml:55` `'22'`; kein `engines`, keine `.nvmrc`; `deploy.yml:203` `firebase-tools@15`. Die Begründung der festen Supabase-CLI steht in Zeile 79–81 und nennt das Ratenlimit der GitHub-API, nicht die Sicherheit. | `firebase-tools` als `devDependency` zieht mehrere hundert Pakete in **jedes** `npm ci` aller Aufträge; die genaue Fassung am `npx`-Aufruf ist der kleinere Eingriff. Das ist eine Abwägung (Lockfile für Unterabhängigkeiten gegen Laufzeit), keine der beiden Formen ist falsch. |
| L-11 | bestätigt (am Code) | 84 `*.spec.ts` unter `tests/durchklick/`, `MONTEUR_WEGE` (`playwright.config.ts:58`) trifft 15; die neun genannten Dateien gibt es. Tablet-Projekte sind `Desktop Chrome`. `playwright.links.config.ts:41–43`: drei Dateien in WebKit. | Trägt. In dieser Umgebung liegt nur Chromium (`/opt/pw-browsers`); die neuen Projekte sieht lokal niemand, bis WebKit geladen ist. |
| L-12 | bestätigt (am Code) | 6.574 Zeilen, ein `export default function` (Zeile 204), 119 Zeilen mit `useState`, 23 mit `useEffect`; `InvoicesView.test.tsx` 6.692 Zeilen; gebaut 156,03 kB roh; kein `memo`, kein `useDeferredValue` in `src/`; die neun weiteren Ansichten über 1.500 Zeilen mit denselben Zahlen (`AdminOrdersView` liegt unter `features/orders/`). Der Stand vom 15.11. (5.640) ist nicht nachgeprüft. | Zwei Vorbehalte und ein Widerspruch zum Plan: siehe 4. |
| L-13 | bestätigt (nachgestellt) | Je Datei allein: `BaustellenakteView` G5 **1,62 s**, `QuotesView` „zählt nur echte Arbeitszeit“ **0,95 s**, `zip` **0,89 s** und **1,27 s**, `appZeichen` `icon-512` **1,59 s**, `infoHintUmbruch` **1,07 s**. Dieselben Prüfungen sind die langsamsten ihrer Datei, meine Werte liegen 15–47 % unter denen des Papiers (bei `zip` vertauscht — Streuung). Ursachen am Code nachvollzogen (`kundenAuswahl.ts:35–49`, `KundenAuswahl.tsx:96–104`, `appZeichen.test.ts:135–138`); kein `testTimeout`, keine eigene Frist in `zip`, `appZeichen`, `infoHintUmbruch`. | (a) Den Suchverzug **für alle** Ansichtsprüfungen in `setup.ts` auf 0 zu stellen, greift in fremde Aussagen ein: siehe 4. (b), (c) ohne Einwand. |
| L-14 | teilweise | Siehe 3. | Siehe 3 und 4. |
| L-15 | teilweise | Siehe 3. | Siehe 3. |
| L-16 | bestätigt (am Code) | (a) `stand-2026-10-03.md:3356` „Offen und benannt“ gegen `:3428` „Erledigt“; `aufbau.ts:158–168`; (d) `index.html:19` nennt `#0f4552`, Zeile 30 setzt `#ffffff`. (b), (c) siehe L-4, L-6. Der Suchlauf über die Fremdschlüssel ist nicht wiederholt. | Nur Texte. Kein Risiko. |

## 3. Nicht bestätigt — im Einzelnen

### L-14 (teilweise)

**Papier:** Fünf Regeln seien „nur von Prüfungen benutzt“; `monatsbilanzen_alle` und die Sicht
`monthly_stats` könne eine Migration entfernen, „die prüft, dass nichts sie mehr ruft“.

**Gefunden:**

- Bestätigt: `zeitkontoMonate`, `listBilanzen`, `listBilanzenAlle`, `materialOhneSchein`,
  `spesenSumme`, `wochenFeld` haben keinen Aufrufer in `src/`. Unter `tools/vorschau/db/` stehen
  nur die erzeugten Ersatzfassungen; `supabase/functions/` nennt keinen der Namen; keine
  Datenbankfunktion ruft `zeitkonto_monate` oder `monatsbilanzen_alle`. Kein zusammengesetzter
  Name trifft sie: die sieben Stellen mit veränderlichem Namen (L-2) reichen andere Funktionen
  durch.
- `zeitkonto_monate` und `monatsbilanzen_alle` stehen zusätzlich in `LESENDE_FUNKTIONEN`
  (`src/lib/netzFrist.ts:129, 181`) — beim Entfernen der Datenschicht mitzunehmen.
- `anstehende` (`wartungsplan.ts:113`) ruft **niemand**, auch keine Prüfung. Die beiden anderen
  Treffer des Worts sind Kommentare.
- `ohneEinsatzListe` wird in `src/features/dashboard/start/regeln.ts:21` weitergereicht und
  dient in `tests/supabase/schmaleAbfragen.test.ts:161–162` als **Vergleichsregel** für die
  Datenbankfunktion (alt gegen neu). Mit ihr fiele diese Gleichheitsprüfung weg.
- **`monthly_stats` ist nicht tot.** `public.person_auskunft` liest die Sicht an zwei Stellen,
  `public.person_loeschen` prüft sie; `src/lib/time.ts:938` hält fest, dass „die alte App“ sie
  weiter liest. Wer sie entfernt, bricht die Datenauskunft.

**Zu ändern:** Im Papier `anstehende` als „ohne jeden Aufrufer“ führen, bei `ohneEinsatzListe`
die Rolle als Vergleichsregel nennen, `monthly_stats` aus den Löschkandidaten streichen. Im
Plan (Paket 24) „toter Code entfernt“ durch „je Fund entschieden“ ersetzen — über
`zeitkontoMonate` entscheidet erst Idee 1 des Papiers.

### L-15 (teilweise)

**Papier:** „Die Git-Geschichte aller 358 Migrationen zeigt keinen Fall.“

**Gefunden:** Der Mechanismus stimmt (`supabase-migrationen.yml:140`, `--include-all`; die
Prüfung davor baut von null an). Die Arbeitskopie ist aber ein **flacher Klon** (370 Commits,
ab 06.11.2026): 228 der 358 Migrationen kommen im ersten sichtbaren Commit gemeinsam an. Für
die übrigen 130 (27 Commits auf der Hauptlinie) habe ich selbst gezählt: 0 Fälle unter dem
bisherigen Höchststand. Für die 228 davor lässt sich nichts sagen.

**Zu ändern:** Im Papier „in der sichtbaren Geschichte seit 06.11.2026“. Am Vorschlag: der
Vergleich mit `origin/main` braucht im Auftrag die Geschichte des Zielzweigs (`actions/checkout`
holt sonst nur einen Commit). Und er prüft zum Zeitpunkt des Pull Requests — zwei gleichzeitig
grüne Pull Requests können weiter in der falschen Reihenfolge zusammengeführt werden. Dicht
wird es erst mit „Zweig muss aktuell sein“ am Zielzweig oder mit derselben Prüfung auf `main`
vor `db push`.

### Berichtigungen an bestätigten Befunden

- **L-1, Beleg:** (a) `supabase/config.toml:18` gilt nur für den lokalen Stapel. Was das
  **gehostete Projekt** setzt, steht im Repo nur als Behauptung („im Projekt 1000“:
  `kern.ts:311`, `MIGRATION-SUPABASE.md:2311`, `zeilengrenze.test.ts:5`); gemessen ist überall
  der lokale Stapel, und kein Workflow überträgt die Datei (`config push` kommt nicht vor).
  1.000 ist die Vorgabe des Dienstes, der Fehler ist also sehr wahrscheinlich — belegt ist
  der Wert nicht. Einmal im Projekt ablesen und in `DEPLOYMENT.md` festhalten. (b) Der
  zitierte Helfer `unverrechnetHolen` steht in `WorkSheetsListView.tsx:218`; in
  `invoices.ts:584` steht `scheineUnverrechnetSeite`. (c) `nachkalkulationBuendel.test.ts`
  liegt unter `tests/supabase/`, nicht `tests/unit/`.
- **L-1, Lücke im Vorschlag:** `ausgegebenes_material` (eine Baustelle,
  `materialOrders.ts:473`) ist dasselbe Muster und wird beim **Rechnungstellen** gerufen
  (`InvoicesView.tsx:1771`). Über 1.000 Zeilen an einer Baustelle fehlte ausgegebenes Material
  im Vorschlag der Rechnung. Die Funktion sortiert schon eindeutig
  (`order by a.datum, a.name, a.beleg_id`) — die Umstellung auf `rpcAlle` kostet dort keine
  Migration. Das Papier nennt sie in L-2 als wachsend, behebt sie aber nicht.
- **L-4, Auswirkung:** siehe Tabelle (eine Datei mehr hält noch).

## 4. Zum Plan

**Kurztexte in 3.7:** stimmen mit dem Papier und meinem Ergebnis überein. Zwei Zusätze:
L-14 („Toter Code … in Datenbank“) verleitet zum Entfernen von `monthly_stats`; L-7 siehe unten.

**Paket 1, Schritt 6 und 7 (L-2, L-1):**

- „Ohne Schritt 7 rot für zwei Funktionen“ gilt nur, wenn die übrigen 35 Aufrufe schon in der
  Ausnahmeliste stehen. Für `ausgegebenes_material` gibt es dort keinen gültigen Grund
  (Grundsatz 6) — in Schritt 7 aufnehmen. `scheine_verrechnet` ist durch die Aufrufer begrenzt
  (siehe 5, V-2) und kann mit diesem Grund in die Liste.
- Der Wächter muss die sieben Hüllen mit veränderlichem Namen erfassen (Tabelle, L-2).
- `rpcAlle` ruft die Funktion je Seite neu; zwischen zwei Seiten kann eine Zeile ihr Datum
  wechseln (`coalesce(erledigt_am, updated_at)`). Die Funktion gibt `beleg_id` zurück — beim
  Zusammenführen darüber entdoppeln.

**Paket 19 (L-7):**

- Der Kurztext „Datenbankfunktionen melden den betroffenen Live-Listen“ ist missverständlich.
  Gemeint ist: die **Datenschicht im Browser** ruft nach geglücktem Funktionsaufruf
  `eigeneAenderung(tabelle)`. Eine Meldung aus der Datenbank (Kanal, Broadcast) wäre falsch:
  sie käme genau dort nicht an, wo der Kanal fehlt, und würfe die Frage auf, wer sie bekommt.
  So wie im Papier beschrieben erreicht die Meldung nur die eigene Seite; Rechte sind nicht
  berührt.
- **Sturm von Neuladen:** nicht zu erwarten. Je Schreibvorgang gleicht jede offene Live-Liste
  der Tabelle einmal ab (Kennung und Änderungszeit, gebündelt über 50 ms, höchstens einer
  läuft und einer folgt: `kern.ts:1208–1225`). Das ist derselbe Aufwand, den die einfachen
  Schreibwege seit E99 schon auslösen.
- **Voraussetzung V-1:** mehr Abgleiche heißt mehr Überlappung. Die Sperre `eigenLaeuft` gilt
  nur für den eigenen Weg; Nachfassen (`:1183, 1190`), Wiederholung (`:979`) und Wiederaufbau
  (`:1188`) rufen `abgleichen` daneben. Die eine Warteschlange für alle Auslöser gehört **vor**
  die Umstellung, mit der Prüfung zweier überlappender Abgleiche.
- **Umfang größer als benannt:** Abschnitt 4 des Papiers spricht von „drei Abonnements ohne
  `abonnieren`“. Am Code halten **elf** Stellen in zehn Dateien einen Kanal direkt
  (`lagerorte.ts:123`, `prefs.ts:69`, `projects.ts:428`, `nachrichten.ts:531`,
  `assignments.ts:143`, `materialOrders.ts:577`, `invoices.ts:253`, `materials.ts:154, 594`,
  `timeEntries.ts:147`, `einsatzMaterial.ts:169`) — darunter die Beobachter der seit Welle 4
  serverseitig gerechneten Listen (Baustellen, Lager, Anforderungen). Keine hört auf
  `beiEigenerAenderung`. Ohne sie bliebe der Ablauf halb.
- **Ausgangsfach:** nachgesendete Funktionsaufrufe (`supabaseSender.ts:222–227`, etwa
  `zeit_timer_zeitraum_buchen`) laufen an `rpcSchreiben` vorbei. Sie brauchen dieselbe Meldung.
- Die Tabelle „Funktion → Tabellen“ wird von Hand geführt; der Wächter verlangt nur einen
  Eintrag. Ein falscher Eintrag ist still. Rund 119 der 196 fest gerufenen Funktionen sind
  nicht `stable` — der Wächter sollte den Eintrag gegen die im Rumpf beschriebenen Tabellen
  halten.

**Paket 23 (L-8, L-9, L-10, L-15):**

- L-9 (Bau im Prüfauftrag) vor Paket 11 und allen Paketen der Stufen B und C ziehen: bei einer
  Datei und sechs Bausteinen Luft (L-4) wird sonst der erste Überschuss erst auf `main` rot,
  nach dem Einspielen des Schemas.
- L-8 (2) und L-15: Ergänzungen in Tabelle und Abschnitt 3.

**Paket 24 (L-13, L-14):**

- L-13 (a): `kundeWaehlen` wird in 8 Dateien 46-mal gerufen. Ein Suchverzug 0 für **alle**
  Ansichtsprüfungen trifft auch Prüfungen, die auf den Verzug bauen
  (`searchCustomers` „nicht gerufen“ in `KundenAuswahl.test.tsx:74, 105`,
  `EingangView.test.tsx:373`, `AdminProjectsView.test.tsx:930`, `CustomersView.test.tsx:726`;
  „zweimal gerufen“ in `gemerkteListen.test.tsx:137`). Den Verzug nur im Helfer überbrücken
  (Uhr vorstellen oder Ereignis setzen), nicht in `setup.ts`. Eine zur Laufzeit verstellbare
  Größe im Programm nur für Prüfungen wäre zudem neuer Code ohne Nutzen für den Betrieb.
- L-14: siehe 3.

**Paket 11 und 25 (L-12, L-4):**

- Der Plan weicht vom Papier ab. Papier: kein Neuschreiben, nur die vier schon abgegrenzten
  Fenster, **ein Fenster je Pull Request**. Plan, Paket 11: „in Teile zerlegen (Liste,
  Erstellen, Fenster, Zahlung, Mahnung, Export)“ in **einem** eigenen PR. Das ist der größere
  und riskantere Eingriff an der Ansicht mit dem meisten Geld. Empfehlung: die Fassung des
  Papiers.
- „Erst beim Öffnen laden“ und „`InvoicesView.test.tsx` bleibt unverändert“ vertragen sich
  nur, wenn die Prüfungen das Fenster nicht im selben Zug erwarten. Zuerst nur in eigene
  Dateien ziehen (fest eingebunden), das Nachladen als eigener Schritt.
- Jedes nachgeladene Fenster ist ein Baustein mehr: vier Fenster brächten 258 von 260. L-12
  frisst die Luft, die L-4 beklagt. `ansicht()` erwartet außerdem einen Pfad
  (`ansichten.ts:65`) und ist für Routen gebaut.
- Paket 25: „Leistungsbudget … neu gesetzt“ ist zweideutig. Das Papier sagt: Grenzen nicht
  anheben, nur `_warum` berichtigen. So in den Plan schreiben.

**Regel 7 des Plans** („Seit 16.11. läuft WebKit auch lokal“) steht gegen `CLAUDE.md`
(„WebKit selbst prüft die CI“) und gegen den Stand dieser Umgebung (nur Chromium vorhanden).
Betrifft L-11.

## 5. Geklärte Verdachtsfälle

- **V-1** (zwei Abgleiche entfernen eine neue Zeile): am Code nachvollzogen, nicht nachgestellt.
  `abgleichen` setzt am Anfang `bereit = false` und am Ende `bereit = true`, ohne zu wissen,
  ob ein zweiter Lauf noch unterwegs ist; dessen Kennungsliste löscht danach, was inzwischen
  direkt eingetragen wurde (`kern.ts:1028–1030`, Löschen in Zeile 1029). Der Ablauf des Papiers ist möglich. Bleibt
  Verdacht bis zur Prüfung, ist aber Voraussetzung für L-7.
- **V-2** (`scheine_verrechnet`): geklärt, heute kein Fehler. Die Funktion gibt höchstens so
  viele Zeilen zurück, wie Kennungen übergeben werden. `BaustellenScheine` lädt 20 Scheine und
  je Knopfdruck 20 mehr (`:32, 52, 117`), die Scheinliste höchstens 150 (`PRUEF_GRENZE`). Über
  1.000 käme man nur nach 50-mal „Weitere laden“ in einer Akte.
- **V-4** (Indizes): `\d public.material_orders` zeigt keinen Index auf dem Ausdruck
  `lower(regexp_replace(…))`. Die Aussage zum Lesen stimmt; gemessen ist nichts.
- **V-6** („Überfällig“): am Code bestätigt. Gesetzt wird nur in `InvoicesView.tsx:893–904`;
  keine Migration und kein Zeitauftrag setzt den Stand.
- **V-7** (Monatsbuchungen mit allen Spalten): am Code bestätigt (`timeEntries.ts:55–68` ohne
  `spalten`).
- **V-3, V-5:** offen; brauchen das gehostete Projekt bzw. die angemeldete App mit Profiler.

## 6. Nicht geprüft

- Der Schnitt bei 1.000 Zeilen an einer Funktion selbst (kein PostgREST) und der Wert im
  gehosteten Projekt.
- Alle Zeilenzahlen und Ladezeiten aus `messung-gewachsen.md` (L-6), die 40 ms aus L19 (L-14).
- Der Stand von `InvoicesView` am 15.11. (5.640 Zeilen) und die Zahl der Änderungen seither.
- Flattern der fünf Prüfungen unter Last (wie im Papier nur aus Einzelzeiten hergeleitet).
- Die Aufrufform des Firebase-Rücksprungs (L-8), der Suchlauf über die Fremdschlüssel (L-16),
  der zweite Bau mit `LEISTUNG_ALLES=1`.
- Abschnitt 4 (benannte Grenzen) über L-5 und L-7 hinaus, Abschnitt 5 (Ideen) und Abschnitt 6
  (nachgeprüfte ✔-Punkte) des Papiers.
