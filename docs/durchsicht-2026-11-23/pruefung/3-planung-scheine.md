# Gegenprüfung: Planung, Startseite, Handwerksscheine (`analyse/3-planung-scheine.md`) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (der Arbeitszweig liegt nur
mit Dokumenten darüber; `src`, `supabase`, `shared`, `tests`, `public` sind gleich).

Womit geprüft:

- **Code gelesen** an jeder genannten Stelle; SQL an der letzten Definition in der
  Wegwerf-Datenbank `pruef_p` (`\sf`), nicht nur in der Migration.
- **Eigene vitest-Dateien außerhalb des Repos** (`…/scratchpad/audit/pruef-p/p1.test.ts`,
  `v1.test.ts`, eigene Konfiguration mit den Aliasen des Repos): echte Module
  `ausgangsfach.ts`, `supabaseSender.ts`, `ohneEmpfang.ts`, `vorgemerkt.ts`,
  `zeitEntwuerfe.ts`, echtes supabase-js 2.116.0 mit nachgebautem `fetch`. 15 Fälle grün.
- **Datenbank `pruef_p`** (alle 358 Migrationen): Betrieb „probe“ mit Administrator,
  Projektleiterin, Verwaltung, zwei Monteuren; Skripte `p1.sql`, `p1d.sql`, `p1e.sql`,
  `p1b.sql`, `p2.sql`, `p10.sql`, `v2.sql`, `v4.sql` im selben Ordner. Jede Probe in
  einer Transaktion mit `rollback`.
- Nichts im Repo geändert außer dieser Datei. Kein Browser, kein Supabase-Stack.

## 1. Ergebnis in Zahlen

| Urteil | Anzahl | Befunde |
|---|---|---|
| bestätigt (nachgestellt) | 3 | P-1, P-2, P-10 |
| bestätigt (am Code) | 9 | P-3, P-4, P-5, P-6, P-7, P-8, P-9, P-11, P-12 |
| teilweise | 0 | — |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

Kein Befund ist falsch. **Die Abweichungen liegen in den Vorschlägen** (Spalte rechts und
Abschnitt 3): vier davon würden in der beschriebenen Form etwas verschlechtern oder eine
bestehende Prüfung rot machen (P-1 Schritt 4, P-1 Schritt 1/2, P-2 Schritt 3, Plan
Paket 1 Schritt 8 „bleibt gleich“).

Verdachtsfälle: V-1, V-2, V-4 nachgestellt (alle drei treffen zu), V-3 am Code
bestätigt, V-5 nicht geprüft. Dazu zwei Nebenbefunde (Abschnitt 5).

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| **P-1** | bestätigt (nachgestellt) | `p1.test.ts`: Fach mit `schein_speichern` + `schein_unterschreiben`, Sender lehnt ab → Bericht `{gesendet 0, abgelehnt 2, offen 0}`; das Unterschreiben wird gar nicht mehr gesendet; danach `imFach 0`, `wartendeScheine 0`, `localStorage []`, Meldung `gesichert: false`. Über den echten Sender mit 42501, 23503, 23505 dasselbe; ebenso nach fünf unklaren Antworten. Gegenstück: dieselbe Ablehnung einer Zeitbuchung hinterlässt einen Entwurf (`gesichert: true`). Zeilen stimmen: `ausgangsfach.ts:376–391`, `ohneEmpfang.ts:74–78`, `VerloreneBuchung.tsx:62–64`, `workSheets.ts:495`/`:611`. **Auslöser in der Datenbank:** a) verworfener Entwurf → `42501 Ein Schein im Zustand Verworfen lässt sich nicht mehr ändern` (Speichern und Unterschreiben); b) zusammengeführter Kunde → `23503 work_sheets_customer_id_fkey`, **beim Anlegen und beim Ändern** eines schon bestehenden Entwurfs; c) zweiter Ersatzschein → `23505`; d) Rolle Monteur → Verwaltung → `42501 new row violates row-level security policy` (neuer Schein: `work_sheets`; bestehender: `work_sheet_hours`), Unterschreiben `P0002`. | Vier Punkte, im Einzelnen in Abschnitt 3: (1) Schritt 4 macht in der beschriebenen Form jeden Schein eines Monteurs falsch; (2) die Sicherung ist heute synchron und läuft NACH dem Wegräumen — mit IndexedDB muss die Reihenfolge umgedreht werden, das berührt Z4; (3) „Unterschriften vorbelegt“ in einem änderbaren Formular; (4) c) und d) lassen sich mit „als neuen Schein öffnen“ nicht lösen. Fehlendes „bleibt gleich“: `tests/supabase/scheinOhneEmpfang.test.ts:172–199`, `tests/unit/zeitEntwuerfe.test.ts`, `scheinVorgemerkt.test.ts`. |
| **P-2** | bestätigt (nachgestellt) | `p2.sql`: Monteur mit genehmigtem Urlaub morgen. `wochenplan_abwesend(heute, heute+62)` → 1 Zeile; `heute+63` → 0; `heute+70` → 0 (auch für die Leitung). Schalter `wochenplan_fuer_alle = false`: Monteur 0 Zeilen, auch für den einen Tag; Leitung 1 Zeile. Die eigene Urlaubszeile liest der Monteur in der Tabelle weiter. Code: `MyScheduleView.tsx:218–238` (Zeitraum bis zum spätesten Einsatz, leere Antwort → nichts ausgeblendet), `laden.ts:388–391`, letzte Definition `20261116010500…:104–121`. | Schritt 3 (Fehler statt leerer Menge) macht eine bestehende Prüfung rot, die das Papier unter „gleich bleibt“ führt: `tests/supabase/wochenplanFuerAlle.test.ts:122–126` erwartet für ein ganzes Jahr `data = []`. Das Papier nennt sieben Aufrufer (stimmt für die App); **zwei weitere in der Datenbank**: `einsatz_umplanen` und `einsatz_folgetage` rufen `wochenplan_abwesend(tag, tag)` — bleiben unter 62, müssen aber in der Aufzählung stehen. `wochenplan_abwesend` ist `language sql`; ein Fehler braucht plpgsql. Neue Funktion: `app.betriebsmitglied(app.betrieb())` beibehalten (deaktiviertes Konto), Eintrag in `netzFrist.ts` (dort steht `wochenplan_abwesend`, Zeile 180) und in `mandantenTrennung.test.ts`. |
| **P-3** | bestätigt (am Code) | `projects.ts:20–25` (kein `sortiere`, `grenze: 500`), `kern.ts:165–172` (ohne `sortiere` keine Reihenfolge), `listengrenzen.ts:92`; Aufrufer ohne Hinweis: `useWochenDaten.ts:127`, `AssignmentsView.tsx:174`, `laden.ts:692`. Nachholen fehlender Baustellen nur in der Woche (`useWochenDaten.ts:329–349`). Im Grenzen-Dokument nicht genannt. Nicht mit 520 Baustellen nachgestellt. | (1) „N am Budgetlimit“ rechnet heute über Aktiv **und Pausiert** (`laden.ts:706`, `baustellenLage.ts:29–45` ohne Zustandsfilter), `baustellen_budget_lage` nur über `status = 'Aktiv'` — die Zahl ändert sich also auch unter 500; das ist gewollt zu entscheiden, nicht „bleibt gleich“. (2) Voraussetzung: `baustellen_liste` muss im Support-Einblick laufen (Paket 1 Schritt 5), sonst verliert die Startseite im Einblick Zahlen, die sie heute hat. Reihenfolge im Plan passt, die Voraussetzung steht aber nicht bei Paket 25. |
| **P-4** | bestätigt (am Code) | `useWochenDaten.ts`: kein `useAktualisierungsRunde`/`useBeiAktualisieren`, kein `visibilitychange`; Abwesenheiten hängen nur an `[user, von, bis, abwesendStand]` (`:192`). `AssignmentsView.tsx:200–224` ebenso. `einsatz_speichern` (Datenbank) enthält weder „abwesen“ noch „feiertag“ noch „betriebsurlaub“; `einsatz_umplanen` prüft alle drei. | (1) `einsatz_speichern` gibt `integer` zurück. Eine andere Rückgabeart geht nur mit `drop function` + neu anlegen — dabei gehen `grant`/`revoke` verloren, wenn sie nicht wiederholt werden. Einfacher und ohne dieses Risiko: Rückgabe lassen, das Formular fragt nach dem Speichern die Abwesenheit des Tages neu. (2) Papier („ein Kanal je Tabelle“) und Plan Paket 19 („Datenbankfunktionen melden den Live-Listen, Tabellenname genügt“, L-7) beschreiben zwei verschiedene Wege — vor dem Bau einen festlegen. (3) Kanäle auf `krankmeldungen` liefern der Projektleitung nichts (Zeilenschutz); das Papier sagt es, dann muss Punkt 1 des Vorschlags für sich allein tragen. |
| **P-5** | bestätigt (am Code) | `AssignmentsView.tsx:207–220` (`.catch(() => setUrlaube([]))`, kein Hinweis), `laden.ts:716–718` (`still(…, [])`), `MyScheduleView.tsx:228–230`; die Woche meldet es (`useWochenDaten.ts:178–185`). `AssignmentsView.tsx:627` fester Satz. Keine Prüfung im Repo hält das stille Verhalten fest. | Kein Risiko gefunden. Bei „Mein Einsatzplan“ steht im Code ausdrücklich „scheitert sie, bleibt die Liste wie bisher“ (`:207–212`) — dort also nur ein Hinweis ergänzen, die Einsätze weiter zeigen. |
| **P-6** | bestätigt (am Code) | `TerminFormular.tsx`: kein Treffer für Abwesenheit, Urlaub, Krank, Feiertag. `EingeteiltHinweis.tsx:32` nur `listAssignmentsForUserInRange`. `laden.ts:774–787` nur Einsätze. `app.termin_pruefen` (Datenbank): kein Treffer. | `termine_der_person` gibt der Buchhaltung Tag, Art und Uhrzeit von Terminen, die sie nach `termine_lesen` bewusst nicht liest (`termine.ts:66–67`: „die Buchhaltung liest keine Termine“). Das ist eine Erweiterung eines Leserechts — als Entscheidung benennen, nicht nebenbei. |
| **P-7** | bestätigt (am Code) | `20261112130000…:80`, `20261116010800…:87`; in der Datenbank tragen genau vier Funktionen `heute + 1`: `app.einsatz_aenderung_merken`, `app.termin_aenderung_merken`, `app.einsatz_planstand`, `public.push_einsatz` — dieselben vier wie im Vorschlag. Einziger Zeitplan `einsatz-meldungen`. Grenze benannt (Grenzen-Dokument Z. 350–352). | (1) „Arbeitstage der Person“ müssen zum Datum gelten (`arbeitszeit_verlauf`), nicht `users.work_days` von heute — sonst derselbe Fehler wie Z-2. (2) Datenbank und Edge Function werden getrennt ausgeliefert: die Felder `heute`/`morgen`/`termine_morgen` des Ereignisses müssen bleiben, bis die neue Function läuft (nur ergänzen). |
| **P-8** | bestätigt (am Code) | `zwischenspeicher.ts:33–52` (nur Arbeitsspeicher, kein Persister in `src`), `public/sw.js` hält nur Hülle und Bausteine, `MyScheduleView.tsx:154–205` lädt immer vom Server. Benannte Grenze: Grenzen-Dokument Z. 47. | Der Vorschlag hebt eine mit „Datenschutz“ begründete Grenze teilweise auf. Das Papier verlangt „Datenschutz-Text prüfen (Kanzlei)“ — im Plan fehlt die Frage in Abschnitt 9 und die Entscheidung in Abschnitt 8. „Nächster Arbeitstag“: dieselbe Rechnung wie P-7 verwenden, nicht eine zweite. |
| **P-9** | bestätigt (am Code) | `WorkSheetsListView.tsx:87`, `:108`, `:470`, `:522`, Hilfetext `:1117–1123`; `LISTENKOPF` ohne Bilder (`workSheets.ts:59–71`), auch in `listSignedWorkSheetsInRange` (`:256`). `fehlendeZeitbuchung.ts:46–50` „Nach oben KEINE Grenze“. `canEditTime` = Buchhaltung oder Spitze, deckt sich mit `app.ist_buch_oder_spitze()`. | Kein Verlust einer Bedienstelle, wenn „Weiter zurück prüfen“ erst mit der neuen Funktion entfällt. Der Hilfetext `:1117–1123` muss mit weg (er begründet dann eine Grenze, die es nicht mehr gibt). |
| **P-10** | bestätigt (nachgestellt) | `p10.sql`, vier Baustellen, je ein unterschriebener Schein: (1) Regie, nur Stunden, Rechnung über den Zeitraum → Kern „verrechnet“, Abschluss **1**; (2) Regie, Ersatzschein eines verrechneten, stornierten Scheins → Kern „verrechnet“, Abschluss **1**; (3) Pauschal mit gültiger Rechnung → Kern „verrechnet“, Abschluss **1**; Gegenprobe Regie mit Material ohne Rechnung → beide **1**. (Rechnungen als Dienst mit abgeschalteten Auslösern eingefügt; die geprüften Funktionen lesen nur.) | Vorschlag löst alle drei Fälle. Bewusst sehen: auf einer Pauschalbaustelle warnt der Abschluss danach auch nicht mehr vor einem Schein, der NACH der Schlussrechnung unterschrieben wurde (Zusatzarbeit) — so rechnet der Kern, aber der Abschluss ist die letzte Stelle, an der es auffiele. Zum Plan siehe Abschnitt 4 (Paket 1 Schritt 8). |
| **P-11** | bestätigt (am Code) | `AssignmentsView.tsx:469` (`einsatzZeit(rows[0])`), `:544–546` (nur Aufgabe an der Person), `useWochenDaten.ts:403` (`zeit: b.zeit` der ersten Zelle). | Kein Risiko gefunden; Breite am Handy im Bild prüfen, wie das Papier sagt. Im Plan doppelt geführt (Abschnitt 4). |
| **P-12** | bestätigt (am Code) | `app.baustelle_abschluss_zaehlen` in der Datenbank: Schlüssel `kommende_einsaetze` … `offene_rechnungen`, kein Termin. Bestehende Prüfung nutzt `toMatchObject` (`baustelleAbschliessen.test.ts:61`) — ein zusätzlicher Schlüssel bricht sie nicht. | Dieselbe Funktion wird in Paket 1 (A-1, P-10) und in Paket 18 (A-6, P-12) neu gefasst: die spätere Fassung muss auf der früheren aufbauen, sonst überschreibt sie die Korrektur (genau der Fall Z-2/Z-15). |

## 3. Nicht bestätigt — im Einzelnen

Kein Befund ist „teilweise“ oder „widerlegt“. Die folgenden Punkte betreffen
**Vorschläge**, die so, wie sie im Papier und im Plan stehen, nicht gebaut werden sollten.

### 3.1 P-1, Schritt 4 („unbekannten Kunden auf den der Baustelle setzen“) — würde verschlechtern

- Papier: `schein_speichern` setzt „beim Anlegen einen unbekannten `customer_id` auf den
  Kunden der Baustelle“, Rechte unverändert.
- Gefunden: `schein_speichern` läuft mit den Rechten des Aufrufers (`prosecdef = f`).
  Ein Monteur liest die Kundentabelle nicht: `customers_lesen` schließt die Rolle
  „Mitarbeiter“ aus. Nachgestellt (`p1b.sql`): `exists (select 1 from public.customers
  where id = <bestehender Kunde>)` ergibt für den Monteur **falsch**, für die
  Projektleitung wahr. Eine Prüfung „Kunde unbekannt“ in dieser Funktion hielte also
  **jeden** Kunden für unbekannt und setzte bei jedem Schein eines Monteurs den Kunden
  der Baustelle ein — bei Altbaustellen ohne `customer_id` löschte sie den Bezug.
- Außerdem: Fall b) scheitert nicht nur beim Anlegen, sondern auch beim Ändern eines
  bestehenden Entwurfs (nachgestellt, `p1.sql` b2: `23503` im `update`).
- Ändern in Papier und Plan (Paket 3): die Prüfung braucht eine eigene Hilfsfunktion mit
  Eigentümerrechten (`security definer`, `set search_path = ''`, nur „gibt es diese
  Kundenkennung im Betrieb“), und sie gilt für Anlegen **und** Ändern. Dazu eine
  Prüfung „bleibt gleich“: Schein eines Monteurs mit bestehendem Kunden behält genau
  diese Kennung.

### 3.2 P-1, Schritte 1 und 2 („derselbe Mechanismus wie Z4“) — nicht derselbe

- Papier: die Sicherung nimmt auch `SCHEIN_TABELLE`, Ablage in IndexedDB.
- Gefunden: die Sicherung ist heute **synchron** (`Sicherung = (…) => boolean`,
  `ausgangsfach.ts:174`) und wird **nach** dem Wegräumen gerufen (`aufgeben`:
  `lager.entfernen` in `:385–388`, `melden` erst in `:389`). Für `localStorage` reicht
  das. Mit IndexedDB (asynchron, kann am Speicherplatz scheitern) muss erst gesichert
  und dann geräumt werden — am sichersten in derselben IndexedDB-Datenbank in einem
  Zug; scheitert das Sichern, bleibt der Vorgang im Fach. Sonst bleibt der Verlust in
  genau dem Fall, in dem das Gerät voll ist.
- Das ändert `aufgeben`/`melden`, also auch den Weg der Zeitbuchung. „Bleibt gleich“
  muss deshalb ausdrücklich nennen: `tests/unit/zeitEntwuerfe.test.ts` (3 Fälle),
  `ausgangsfach*.test.ts`, `robustesAusgangsfach.test.ts` und
  `tests/supabase/scheinOhneEmpfang.test.ts:172–199` (erwartet nach der Ablehnung
  `{gesendet 0, abgelehnt 1, offen 0}` und einen unveränderten Schein auf dem Server).
- Zweiter Weg zur Ablehnung: `begrenzt` (`ausgangsfach.ts:281–289`) meldet eine späte
  Ablehnung mit **einem** Vorgang (ohne die übrigen derselben Zeile). Die Sicherung
  muss auch mit einem einzelnen `schein_unterschreiben` ohne Kopf umgehen.
- `vorgemerkteScheine` „kann das schon“ gilt für Kopf, Zeiten, Material, Fotos. Die
  Unterschriften trägt es nicht — nur `unterschrieben = true` (`vorgemerkt.ts:79–82`).

### 3.3 P-1, Schritt 3 („Als neuen Schein öffnen … Unterschriften vorbelegt“)

- Die Unterschrift des Kunden gilt dem Inhalt, den er gesehen hat, zur Gerätezeit der
  Unterschrift. In einem Formular, in dem der Monteur „prüft“ und ändern kann, hinge
  sie danach an einem anderen Inhalt. Vorschlag des Prüfers: unverändert erneut senden
  ist erlaubt (nur lesen, Gerätezeit bleibt); wird etwas geändert, verfallen die
  Unterschriften und es wird neu unterschrieben. Ob eine erneut gesendete Unterschrift
  als Beleg trägt, ist eine Frage an die Kanzlei — sie fehlt in Abschnitt 9 des Plans.
- Fotos liegen im Speicher unter der Kennung des Scheins (`WorkSheetView.tsx:165`,
  `:812`). „Neue Kennung“ heißt: die schon hochgeladenen Bilder gehören zur alten. Das
  Papier sagt dazu nichts. Im Fall a) ist „Entwurf wieder aufnehmen“ unter der alten
  Kennung der sauberere Weg (Fotos, Unterschrift und Kennung bleiben).
- Fall c) scheitert als neuer Schein wieder an `23505`, solange `ersetzt` mitgeht.
  Fall d) und ein deaktiviertes Konto können gar nicht mehr senden — für sie fehlt ein
  Weg, den gesicherten Schein jemandem zu übergeben (wenigstens ansehen und als PDF).

### 3.4 P-1: zwei weitere Auslöser, die das Papier nicht nennt

In der Datenbank nachgestellt (`p1e.sql`), der Weg durch die App nur gelesen:

- **e) Konto inzwischen deaktiviert** → `42501 Nicht angemeldet`.
- **f) Sitzung nur mit Passwort (aal1), zweiter Faktor eingerichtet** → `app.angemeldet()`
  ist falsch → `42501 Nicht angemeldet`; mit aal2 geht derselbe Aufruf durch. Der
  Nachsender läuft ab dem Start und jede Minute (`Nachsender.tsx:48–62`) und prüft nur,
  ob die Sitzung dem Besitzer gehört (`supabaseSender.ts:347–350`); in `src/lib/sync`,
  `ohneEmpfang.ts` und `Nachsender.tsx` kommt „aal“ nicht vor. Wer sich neu anmeldet
  und noch vor der Code-Eingabe steht, hat also eine Sitzung, mit der das Fach sendet.
  Betrifft vor allem Geschäftsführung/Administration mit Pflicht zum zweiten Faktor
  (im kleinen Betrieb schreibt der Chef die Scheine selbst). Nicht bis zur Antwort von
  PostgREST nachgestellt (kein Stack); nach dem Kommentar in `supabaseSender.ts:100–107`
  ist nur der Aufruf ohne Sitzung ein 401.
- Für f) wäre „liegen lassen“ richtig, nicht „aufgeben und sichern“: der Vorgang ist
  einwandfrei und geht eine Minute später durch. Als eigener Punkt in Paket 3 aufnehmen
  (gilt ebenso für Zeitbuchung, Anforderung und Nachricht) und vor dem Bau im Stack
  nachstellen.

### 3.5 P-2, Schritt 3 („Fehler statt leerer Menge“)

- Papier: „Gleich bleibt … `wochenplanFuerAlle.test.ts`“ und zugleich `22023` über
  62 Tage.
- Gefunden: `tests/supabase/wochenplanFuerAlle.test.ts:122–126` („nimmt keinen beliebig
  langen Zeitraum an“) erwartet `data` gleich `[]`. Mit dem Fehler ist `data` `null`,
  die Prüfung rot. Das ist kein Hindernis, aber eine bewusste Änderung einer
  bestehenden Prüfung — sie gehört in den Vorschlag, nicht unter „gleich bleibt“.

## 4. Zum Plan

- **Abschnitt 3.3, Kurztexte:** stimmen mit dem Papier und mit meinem Ergebnis überein.
  P-9 „nur die 50 jüngsten“ ist verkürzt (auf Knopfdruck 150), aber nicht falsch.
- **Paket 1, Schritt 8 (A-1, P-10) — „Bleibt gleich: Regiebaustelle zählt wie bisher“
  ist falsch.** Zwei der drei Fälle von P-10 sind Regiebaustellen (Stundenschein im
  abgerechneten Zeitraum; Ersatzschein nach Storno); nachgestellt zählt der Abschluss
  dort heute 1 und nach dem Vorschlag 0. Richtig wäre: „eine Regiebaustelle mit
  wirklich offenem Schein (Material, keine Rechnung) zählt wie bisher“. Die Prüfung im
  Plan nennt nur die Pauschalbaustelle; das Papier verlangt drei Fälle plus Gegenprobe
  — alle vier aufnehmen (meine Probe `p10.sql` zeigt sie).
- **Abschnitt 1.2:** „A-1 / P-10 Der Abschluss einer Pauschalbaustelle …“ nennt nur
  einen der drei Fälle von P-10.
- **Paket 3, P-1:** übernimmt Schritt 4 wörtlich („setzt einen unbekannten Kunden auf
  den der Baustelle“) — siehe 3.1, so nicht bauen. „Bleibt gleich“ nennt Zeitentwürfe
  und Reihenfolge, nicht `scheinOhneEmpfang.test.ts`. Die Auslöser e) und f) fehlen.
- **Paket 3, P-2:** der Plan nennt nur die neue Abfrage, nicht Schritt 3 des Papiers.
  Wenn Schritt 3 entfällt, bleibt `wochenplan_abwesend` über 62 Tage still leer — dann
  im Plan ausdrücklich sagen, sonst entscheidet es der, der baut.
- **P-11 steht zweimal:** in Paket 10 („P-11 (Uhrzeit je Person)“, Zeile der Punkte)
  und in Paket 19. Die Tabelle 3.3 sagt 19. Eines streichen; fachlich gehört es zur
  Planung (Paket 19, allenfalls Paket 12 „Planungstafel“), nicht zum Handy-Paket
  allein, weil auch Tagesübersicht und Fenster „Tag“ am Schreibtisch betroffen sind.
- **Paket 19 gegen Papier bei P-4:** „Datenbankfunktionen melden den Live-Listen“ (L-7)
  ist ein anderer Weg als „ein Kanal je Tabelle“ im Papier. Festlegen.
- **Paket 19, P-8 und Paket 3, P-1:** beide legen Kundendaten länger auf geteilten
  Geräten ab; P-8 hebt eine Datenschutz-Grenze teilweise auf. In Abschnitt 8 steht
  dazu keine Entscheidung, in Abschnitt 9 keine Frage an die Kanzlei.
- **Paket 25, P-3:** Voraussetzung „Paket 1 Schritt 5 (`baustellen_liste` im
  Support-Einblick)“ fehlt; und der Satz „Regeln der Startseite bleiben gleich“ des
  Papiers gilt nicht für „am Budgetlimit“ bei pausierten Baustellen.
- **Dieselbe Funktion in zwei Paketen:** `app.baustelle_abschluss_zaehlen` in Paket 1
  und Paket 18. Reihenfolge passt; der Wächter Z-15 sollte diese Funktion in seiner
  Liste „muss enthalten“ führen (`scheine_verrechnet_kern`).
- Kein Vorschlag aus diesem Papier entfernt eine Bedienstelle. „Weiter zurück prüfen“
  (P-9) entfällt, wird aber durch „immer über alle“ ersetzt — in
  `docs/ui-umbau/v10-entfernt.json` begründen (Regel 3 des Plans).

## 5. Geklärte Verdachtsfälle

- **V-1 trifft zu (nachgestellt, `v1.test.ts`),** mit einer Einschränkung. Echtes
  supabase-js 2.116.0, `fetch` nachgebaut: 403 mit HTML, 404 mit HTML, 407 und sogar
  200 mit HTML kommen als Fehler ohne Code an → `unklar`; fünf Läufe mit der
  403-Sperrseite ergeben viermal „offen 1“, dann `abgelehnt 1, offen 0`. 502 → `stoerung`
  (richtig). Einschränkung: ein gewöhnliches Gäste-WLAN kann auf HTTPS nicht mit einer
  eigenen Seite antworten (das scheitert schon an der Verschlüsselung und ist dann
  „kein Netz“); betroffen sind Geräte hinter einem Vorbau, der HTTPS aufbricht
  (Firmen-Firewall mit eigenem Zertifikat). Zufall am Rand: steht in der Sperrseite
  „network“, „fetch“ oder „failed to“, hält `istNetzfehler` sie für fehlendes Netz.
- **Nebenbefund N-1 (nachgestellt, neu): eine 404-Antwort ohne Inhalt gilt als
  angekommen.** postgrest-js macht daraus Stand 204 ohne Fehler
  (`node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:460–463`); der Sender
  meldet `ok`, das Fach räumt den Vorgang weg — **ohne jede Meldung**, für Aufruf und
  Anlegen. Wie oft ein Vorbau so antwortet, weiß ich nicht; der Fall ist still und
  gehört zu V-1 in Paket 3 (ein Aufruf aus `AUFRUFE_OHNE_EMPFANG` muss eine Antwort
  mit Inhalt oder Stand 2xx vom Server selbst haben).
- **V-2 trifft am Datenbankweg zu (nachgestellt, `v2.sql`).** Wartung fällig
  20.11.2026; Kollege trägt „Erledigt“ ein → zuletzt 23.11.2026, fällig 23.11.2027.
  Danach das Speichern eines davor geöffneten Formulars (alle Felder, „zuletzt“ war
  leer und geht nicht mit) → fällig wieder **20.11.2026**, zuletzt 23.11.2026: die
  Wartung steht erneut als überfällig da, obwohl sie erledigt ist. Kein Auslöser
  verhindert es. Offen bleibt nur, ob die Oberfläche ein offenes Formular bei einer
  Live-Meldung zurücksetzt (nicht im Browser geprüft).
- **V-3 am Code bestätigt:** `terminAendern` schreibt über `aendern` die ganze
  bereinigte Zeile (`termine.ts:80–82`), ohne Vergleich mit dem gelesenen Stand. Nicht
  nachgestellt.
- **V-4 trifft zu (nachgestellt, `v4.sql`) — und geht weiter als vermutet.** Nach dem
  Abschließen einer Baustelle legt `einsatz_umplanen(…, p_kopieren => true)` einen
  neuen Einsatz darauf an; **`einsatz_speichern` ebenso**. Keine der drei Funktionen
  liest `projects.status`, kein Auslöser auf `assignments` prüft ihn. Ob Einsätze auf
  abgeschlossenen Baustellen gewollt sind (Nacharbeit), ist eine Entscheidung; heute
  ist es weder verhindert noch benannt.
- **V-5:** nicht geprüft (Browser).
- **Nebenbeobachtung N-2 (aus den Proben zu P-1 d):** `schein_speichern` merkt nicht,
  wenn sein `update` am Zeilenschutz null Zeilen trifft. Mit leeren Listen antwortet es
  dann mit der Kennung, ohne etwas gespeichert zu haben (`p1d.sql`, d3: Notiz
  unverändert, Antwort „ok“). Trifft nur Rollen ohne Schreibrecht am Schein; als
  Verdacht für Paket 3 vermerken.

## 6. Nicht geprüft

- **Nichts im Browser und nichts gegen den Supabase-Stack.** Die Zuordnung der
  Datenbankcodes zu HTTP-Ständen durch PostgREST (403 bei `42501` mit Sitzung) ist
  nicht nachgestellt; die Einordnung im Sender habe ich mit nachgebauten Antworten
  geprüft.
- P-3 nicht mit mehr als 500 Baustellen nachgestellt; die Zahlen im Beispiel des
  Papiers (640/612) sind gerechnet, nicht gemessen.
- P-4 bis P-9, P-11, P-12: nur am Code; die Auswirkungen in der Oberfläche (was genau
  auf dem Schirm steht) nicht angesehen.
- Die Vorschläge selbst sind nicht gebaut; ob sie ihr Problem ganz lösen, ist aus dem
  Code beurteilt. Aufwandsangaben nicht nachgerechnet; P-1 ist mit den Punkten aus
  Abschnitt 3 eher „mittel bis groß“ als „mittel“.
- Abschnitte 4 (Grenzen-Tabelle), 5 (Ideen) und 6 (✔-Stichprobe) des Papiers nur
  soweit, wie sie P-1 bis P-12 betreffen.
