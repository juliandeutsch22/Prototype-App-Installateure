# Tiefenanalyse 3 — Planung und Arbeit vor Ort

Bereich: Einsatzplanung, Termine, Handwerksschein, Startseite; dazu Datenschicht,
Migrationen, Edge Functions `kalender` und `push-melden`, Ausgangsfach (ohne Empfang).
Nur gelesen, nichts geändert, keine Tests gestartet. Stand des Codes: 15.11.2026.

Alle Pfade relativ zu `/workspace/Prototype-App-Installateure`.

---

## 1. Wie der Ablauf funktioniert

1. **Planen.** Führung (Projektleiter, Geschäftsführung, Administrator — `app.ist_fuehrung()`)
   plant in `Einsatzplanung.tsx` (Woche/Monat) oder `AssignmentsView.tsx` (Tag). Beide benutzen
   dasselbe `EinsatzFormular.tsx`. Speichern = `einsatz_speichern(Tag, Baustelle, Zeilen)`:
   alle Zeilen des Paares Tag+Baustelle weg, alle neu, `uids` der Rüstliste nachgezogen
   (`20260930280000_einsatz_uhrzeit.sql`). Danach `ruestliste_speichern` (Rüstliste samt
   Fehlmengen-Anforderung). Mehrere Tage: Folgetage über `einsatz_folgetage` (ergänzt, prüft
   Feiertag, Betriebsurlaub, Abwesenheit je Tag, höchstens 62 Tage).
2. **Umplanen.** Ziehen/Verschieben/Kopieren/Entfernen einer Zeile über `einsatz_umplanen` und
   `einsatz_entfernen` (`20261113200000_einsatz_umplanen.sql`), mit „Rückgängig“.
3. **Live.** Wochen- und Monatsdaten kommen als Abonnement (`pg/kern.ts: abonnieren`, Filter nur
   Betrieb); Abwesenheiten, Termine, Betriebsurlaub einmal je Zeitraum (`useWochenDaten.ts`).
4. **Monteur erfährt es.** Startseite (`dashboard/start/laden.ts: persoenlich` → `HeuteEigene`),
   „Mein Einsatzplan“ (`MyScheduleView.tsx`, nicht live), Push nur für heute/morgen, gesammelt
   nach 2 Minuten Ruhe (`20261112130000_einsatz_meldung.sql` → `push-melden` → `textEinsatzplan`),
   Kalender-Abo (`functions/kalender` → `kalender_abruf` → `shared/kalenderIcs.ts`, −62/+366 Tage).
5. **Termine** (`termine`): Baustelle ODER Kunde, Teilnehmerliste; schreiben Führung und
   Verwaltung; Monteur sieht Termine als Teilnehmer oder wenn er am Tag auf der Baustelle steht.
6. **Schein schreiben** (`WorkSheetView.tsx`): Baustelle vorbelegt, Zeiten aus `schein_vorbereiten`
   (alle „Anwesend“-Buchungen der Baustelle am Tag), vor Ort getippte Zeilen zusätzlich; Material
   über Katalogsuche und „Für diese Baustelle abgeholt“ (eigene erledigte Anforderungen, 14 Tage);
   Fotos (verkleinert, Hash = Dateiname); zwei Unterschriften.
7. **Speichern/Unterschreiben** über das Ausgangsfach (`lib/sync/ausgangsfach.ts`,
   `supabaseSender.ts`): `schein_speichern` (Kennung vom Gerät, Listen ganz ersetzt), dann
   `schein_unterschreiben`. Ohne Netz vorgemerkt, in Reihenfolge nachgesendet; ein doppelt
   zugestelltes Unterschreiben wird erkannt (`schonUnterschrieben`).
8. **Danach.** Trigger `schein_zustandswechsel` friert ein; Storno nur Führung mit Grund;
   Entwurf verwerfen/zurückholen/löschen. Liste: `WorkSheetsListView.tsx` (jüngste 50/60, Suche
   serverseitig, „Stunden ohne Buchung“ fürs Büro, „Nicht verrechnet“).
9. **Verrechnen.** Die Rechnung nimmt Stunden aus den Zeitbuchungen und Material von den
   unterschriebenen, noch nicht verknüpften Scheinen (`invoices/assemble.ts:152`). Die Startseite
   zeigt „N Scheine nicht verrechnet“ (`laden.ts:522–529`, `regeln.ts: scheineZeile`).

---

## 2. Belegte Befunde

### Hoch

**H1 — Ungespeicherte Rüstliste im Einsatzformular wird durch fremde Live-Meldungen gelöscht**
- `src/features/assignments/EinsatzFormular.tsx:239–248` (Effekt an `tagesListen`: `setRuestliste(...)`,
  `setVorgemerkt(new Map())`), `src/features/assignments/einsatzDaten.ts:83–108`,
  `src/lib/db/pg/einsatzMaterial.ts:146–176` (Kanal nur nach `company_id` gefiltert;
  **jede** Meldung am Kopf irgendeiner Rüstliste des Betriebs holt den Tag neu und ruft `cb` mit
  einer neuen Liste).
- Der Effekt hängt an der Identität von `tagesListen`. `einsatzDaten.ts:65` hält nur die LEERE
  Liste gleich (`KEINE_LISTEN`), jede Antwort des Abonnements ist ein neues Array.
- Szenario: Büro öffnet um 6:45 „Einsatz planen“ für Donnerstag, Baustelle X, tippt vier
  Positionen in die Rüstliste und merkt eine Fehlmenge vor. Ein Monteur hakt gleichzeitig auf
  seiner Startseite eine Position der HEUTIGEN Rüstliste ab (`laden_umschalten` schreibt am Kopf).
  → Meldung → `tagesListen` neu → Rüstliste im Formular springt auf den gespeicherten Stand
  (bei neuem Einsatz: leer), Vormerkungen weg. Kein Hinweis. Speichert der Planer danach, fehlt
  das Material — genau der Fall, vor dem die Kommentare im Formular warnen („der Monteur führe am
  nächsten Morgen ohne Material los“).
- Schwere: hoch (stiller Verlust von Eingaben, morgens beim Beladen der Regelfall). Belegt.

**H2 — Einsatz verschieben oder entfernen lässt die Rüstliste am alten Tag zurück**
- `supabase/migrations/20261113200000_einsatz_umplanen.sql:143–148` (Verschieben ändert nur
  `date`/`user_id`; `ruestliste_mannschaft` setzt nur `uids` einer am ZIELTAG schon vorhandenen
  Liste), `:162–176` (`einsatz_entfernen`), `src/features/assignments/EinsatzFenster.tsx:106` und
  `AssignmentsView.tsx:580` (`deleteAssignment` ganz ohne Rüstliste).
- Reserviert wird weiter: `20261107200100_lagerorte_bestehende_wege.sql:198–208` zählt jede
  Rüstlistenposition mit `e.date >= heute`, unabhängig davon, ob es noch einen Einsatz gibt.
- Szenario A (verschieben): Dienstag Anton auf Baustelle X mit Rüstliste (Therme, Fittings,
  Fehlmenge als Anforderung auf Anton). Büro zieht den Einsatz auf Donnerstag. Ergebnis:
  Donnerstag steht Anton ohne Rüstliste (Startseite lädt `listEinsatzMaterialForDate(heute)`),
  die Liste hängt am Dienstag ohne Mannschaft (`uids = {}` → niemand kann abhaken), die
  Reservierung endet am Mittwoch. Meldung an den Planer: nur „X verschoben“.
- Szenario B (absagen): letzter Eingeteilter entfernt → Rüstliste, Reservierung und offene
  Fehlmengen-Anforderung bleiben stehen; im Formular taucht die Liste erst wieder auf, wenn
  jemand genau diesen Tag und diese Baustelle noch einmal wählt.
- Benannt ist nur „Die Rüstliste entsteht an den Folgetagen nicht von selbst“ (E85, Kopieren).
  Für Verschieben und Absagen trägt der Grund nicht: das Material ist dann am falschen Tag bzw.
  für nichts reserviert.
- Schwere: hoch. Belegt.

### Mittel

**M1 — Auswahl, Kommentar und Uhrzeit im Einsatzformular springen bei jeder fremden Änderung zurück**
- `EinsatzFormular.tsx:214–231` (Effekt an `tagesEinsaetze`), `EinsatzFenster.tsx:73`,
  `AssignmentsView.tsx:248–251` (`filter` erzeugt bei jeder neuen Wochen-/Monatsliste ein neues
  Array), `src/lib/db/pg/kern.ts:1045–1053` (`baldMelden()` nach JEDER Meldung des Betriebs, auch
  wenn die Zeile gar nicht im Zeitraum liegt).
- Szenario: Projektleiterin hakt im Fenster drei Leute an und tippt die Aufgabe. Der Chef zieht
  in seinem Browser irgendeinen Einsatz (anderer Tag, andere Baustelle). → ihre Auswahl,
  Kommentar, Uhrzeit und „herausgenommen“ stehen wieder wie gespeichert. Kein Hinweis.
- Gleicher Mechanismus wie H1; hier braucht es einen zweiten Planenden, deshalb mittel. Belegt.
- Hinweis zur Behebung (nicht umgesetzt): nur zurücksetzen, wenn sich die Zeilen DIESES Paares
  aus Tag und Baustelle inhaltlich geändert haben — und dann sagen, dass sich die Planung
  inzwischen geändert hat.

**M2 — „Nicht verrechnet“ sieht nur die 60 zuletzt ANGELEGTEN Scheine**
- `src/features/worksheets/unverrechnet.ts:47` (`UNVERRECHNET_BASIS = 60`),
  `src/features/dashboard/start/laden.ts:524`, `src/features/invoices/InvoicesView.tsx:815`,
  `src/features/worksheets/WorkSheetsListView.tsx:203`, `src/lib/db/pg/workSheets.ts:187–209`
  (sortiert nach `createdAt`, Entwürfe/verworfene/stornierte zählen mit).
- Die Datei nennt als Zweck „eine Leistung von vor drei Monaten ist ein Befund“ und setzt die
  Schwelle auf 28 Tage (`AUFFAELLIG_AB_TAGEN`). 60 Scheine sind bei 5 Monteuren mit einem Schein
  am Tag 12 Arbeitstage, bei 10 Monteuren 6. Ein Schein ist also aus der Basis gefallen, bevor
  er „über 4 Wochen“ alt werden kann.
- Szenario: Betrieb mit 8 Monteuren. Ein unterschriebener Schein mit Material vom 20.10. auf
  einer Pauschalbaustelle wird nie verrechnet. Ab Anfang November steht er weder auf der
  Startseite noch unter Rechnungen noch im Filter der Scheinliste; die Zeile lautet „3 Scheine
  nicht verrechnet · alle jünger als 4 Wochen“.
- Nur die Scheinliste sagt „unter den jüngsten Scheinen“ (`WorkSheetsListView.tsx:1179,1199`),
  Startseite und Rechnungen nennen die Grenze nicht. In `docs/grenzen-durchsicht-2026-10-24.md`
  steht sie nicht. (Die Stunden der Regiebaustellen fängt `unverrechnete_stunden` über alles —
  für Scheine fehlt das Gegenstück.)
- Schwere: mittel bis hoch (Geld, das nie eingefordert wird; Zähler systematisch zu niedrig). Belegt.

**M3 — Ein schon verrechneter Schein lässt sich ohne Prüfung und ohne Hinweis stornieren**
- `src/features/worksheets/WorkSheetsListView.tsx:1249–1293` (Storno-Dialog kennt die Rechnung
  nicht), `supabase/migrations/20260926114500_umnummern_vollstaendig.sql:64–77` (Trigger prüft
  Führung, Grund, Felder — keine Rechnung), `src/features/invoices/assemble.ts:152`.
- Szenario: Schein S1 (1 Therme) steht auf der gültigen Rechnung RE-0042. Die Projektleitung
  (darf stornieren, sieht keine Rechnungen) storniert S1 wegen einer falschen Menge und lässt
  S2 unterschreiben. S2 gilt als „nicht verrechnet“, die nächste Rechnung der Baustelle schlägt
  sein Material vor → Therme zweimal verrechnet, sofern niemand von Hand RE-0042 storniert.
  Umgekehrt steht auf RE-0042 Material eines stornierten Belegs.
- Schwere: mittel. Belegt.

**M4 — Umplanen auf eine andere Person übernimmt das Helfer-Kennzeichen des Vorgängers**
- `supabase/migrations/20261113200000_einsatz_umplanen.sql:138` (Kopie: `a.as_helper`) und `:143`
  (Verschieben: `as_helper` bleibt). Das Formular rechnet es dagegen je Person aus der Einstufung
  (`EinsatzFormular.tsx:370–373`).
- Folge: `as_helper` geht über `Einsatzaktionen.tsx:84,99,104` als Vorbelegung in die
  Zeitbuchung (`src/features/time/TimeForm.tsx:208,260`) — „ein vergessener Haken führt zum
  falschen Verrechnungssatz“.
- Szenario: Helfer Bernd ist krank, das Büro zieht seinen Einsatz auf Facharbeiter Anton. Anton
  steht „als Helfer“ im Plan, „Zeit erfassen“ ist mit Helfer vorbelegt → Helfersatz auf der
  Rechnung, Stunden nicht im Budget. Umgekehrt (Facharbeiter-Einsatz auf eingestuften Helfer)
  fehlt das Kennzeichen.
- Schwere: mittel. Belegt.

**M5 — Zweiter Schein am selben Tag trägt die schon bestätigten Stunden zwangsläufig noch einmal**
- `supabase/migrations/20260928130000_arbeitszeit_umstellung.sql:71–119` (`schein_vorbereiten`
  liefert alle Buchungen des Tages, ohne Abgleich mit vorhandenen Scheinen),
  `src/features/worksheets/WorkSheetView.tsx:1430–1433` (entfernen lassen sich nur selbst
  erfasste Zeilen), `:1364–1375` (Hinweis: „doppelt bestätigen sollte man dieselben Stunden aber
  nicht“ — nur gibt es dafür keinen Handgriff).
- Szenario: Vormittag Schein 1 (07:00–12:00) unterschrieben. Nachmittag Zusatzauftrag, Schein 2:
  vorausgefüllt 07:00–12:00 und 13:00–16:00; die Vormittagszeile lässt sich nicht wegnehmen. Der
  Kunde unterschreibt die fünf Stunden zweimal.
- Die Rechnung nimmt Stunden aus den Buchungen, es wird also nicht doppelt verrechnet; es gibt
  aber zwei unterschriebene Belege über dieselben Stunden (Streitfall, Belegarchiv). Schwere:
  mittel. Belegt.

**M6 — Erinnerung „Zeit nachtragen“ bricht nach 20 eigenen Scheinen ab**
- `src/lib/db/pg/workSheets.ts:219–235` (`max = 20`, absteigend nach Datum, alle Zustände),
  Aufrufe ohne eigene Grenze: `src/features/dashboard/start/laden.ts:393`,
  `src/features/time/TimeView.tsx:345`. Fenster: 14 Tage (`zeitNachtrag.ts`).
- Szenario: Kundendiensttechniker mit 4 Scheinen am Tag. Nach fünf Arbeitstagen sind es 20; ein
  Schein von vor sechs Tagen ohne Buchung erscheint in keiner Erinnerung mehr. Da die Rechnung
  die Stunden aus den Buchungen nimmt, bleibt die Stunde unverrechnet, bis das Büro sie unter
  „Stunden ohne Buchung“ findet (das selbst nur über die geladenen 50/60 Scheine läuft).
- Schwere: mittel (Wartungs- und Reparaturbetriebe), sonst niedrig. Belegt.

**M7 — Eine Aufgabe und eine Uhrzeit für alle: abweichende Zeilen werden beim Speichern still angeglichen**
- `EinsatzFormular.tsx:228–230` (Kommentar und Uhrzeit aus `existing[0]`, Reihenfolge der
  Live-Liste), `:363–391` (alle Zeilen bekommen denselben Kommentar und dieselbe Uhrzeit).
- Seit E85/E88 können Zeilen desselben Paares verschieden sein: `einsatz_folgetage` ergänzt
  („ergaenzt“) mit neuer Uhrzeit, `einsatz_umplanen` bringt Zeilen mit eigener Uhrzeit/Aufgabe.
- Szenario: Montag X: Anton 07:00–12:00 „Rohinstallation“. Das Büro zieht Bernds
  Dienstagseinsatz (13:00–16:00 „Silikon“) auf Montag. Später öffnet jemand „Einsatz bearbeiten“,
  um einen Lehrling dazuzunehmen, und speichert: beide tragen danach dieselbe Aufgabe und Zeit —
  welche, hängt von der Reihenfolge ab. Der Hinweis „Speichern überschreibt sie“ sagt nicht, dass
  sich die Zeilen unterscheiden.
- Schwere: mittel bis niedrig. Belegt.

**M8 — Ziel „Baustellen ohne Einsatz“ rechnet anders als der Zähler der Startseite**
- Zähler: `laden.ts:654–656` (`baustellen_einsatzlage`, eine Zeile je Baustelle, seitenweise).
  Ziel: `src/features/projects/AdminProjectsView.tsx:586–588` (`listAssignmentsInRange` über
  −90/+14 Tage, Grenze 3.000, aufsteigend nach Datum — `src/lib/db/pg/assignments.ts:70–79`).
- Ab rund 3.000 Einsatzzeilen in 104 Tagen (etwa 40 Eingeteilte, oder 25 mit häufig zwei
  Baustellen am Tag) schneidet die Abfrage hinten ab — also genau die KOMMENDEN Einsätze. Die
  Liste hinter „5 Baustellen ohne Einsatz“ zeigt dann fast alle aktiven Baustellen. `laden.ts`
  nennt das Problem selbst („ab 3.000 still abgeschnitten“) — behoben wurde nur die Startseite.
- Schwere: mittel (nur größere Betriebe, dann aber grob falsch). Belegt.

### Niedrig

**N1 — „Lieferung ohne Annahme“ kennt keine Abwesenheit.**
`src/features/assignments/wochenTermine.ts:26–29`: es zählt jeder Einsatz am Tag. Ist der einzige
Eingeteilte krank („fehlt“), gilt die Lieferung als angenommen. Belegt.

**N2 — Auslastung der Woche zählt Betriebsurlaub als verfügbare Tage.**
`laden.ts:716–739` zieht Feiertage und ganztägige Abwesenheit ab, den Betriebsurlaub nicht; in
einer Woche Betriebsurlaub steht „0 %“ statt keiner Zahl. Belegt.

**N3 — Kalender-Abo zeigt Einsätze an Tagen, an denen die Person ganztags abwesend ist.**
`20261110170000_wartung_abo_eingang_lager.sql:238–256` liefert alle Einsätze;
`MyScheduleView.tsx:232–235` blendet sie aus („das Büro plant ihn neu“). Zwei Auskünfte für
denselben Tag. Belegt.

**N4 — Krankmeldung führt nur bei „alle weg“ und nur für heute auf die Startseite.**
`aufbau.ts:645–653` (`unbesetzt`), `besetzung.ts:44`. Fällt der Facharbeiter aus und der Lehrling
bleibt allein, oder betrifft es morgen, gibt es kein Thema; die Push der Krankmeldung geht
bewusst nicht an die Projektleitung (`notifyLogic.ts:321–331`, Datenschutz — begründet). Die
planende Rolle erfährt es also nur beim Öffnen des Wochenplans. Belegt (als Lücke im Ablauf,
siehe auch Abschnitt 4).

---

## 3. Verdacht (nicht bis zum Ende verfolgt)

- **V1 — Das Nachfassen der Rüstlisten meldet immer, auch ohne Änderung.**
  `pg/einsatzMaterial.ts:172–175`: 1,2 s nach Kanalaufbau wird noch einmal geholt und `cb` in
  jedem Fall gerufen (anders als `kern.abgleichen`, das nur bei Änderung meldet). Wer in diesem
  Fenster schon eine Position getippt hat, verliert sie (Mechanismus H1). Ob das Fenster
  praktisch getroffen wird, hängt vom Netz ab — nicht gemessen.
- **V2 — Ein endgültig abgelehntes `schein_speichern` nimmt die Unterschrift des Kunden mit.**
  `ausgangsfach.ts: aufgeben` räumt alle Vorgänge derselben Zeile; die Meldung ist ein Hinweis in
  der laufenden Sitzung (`VerloreneBuchung.tsx`), der Inhalt (Unterschriftsbilder, Zeilen) ist
  danach nirgends mehr. Benannt ist nur der Fall „anderswo unterschrieben/verworfen“ (E49). Andere
  Ablehnungen (42501 nach Rollenwechsel, 23xxx nach gelöschter Baustelle/Kunde) habe ich nicht
  nachgestellt.
- **V3 — `einsatz_folgetage` ruft `wochenplan_abwesend` je Person und Tag.** Bei 62 Tagen und
  acht Leuten rund 500 Aufrufe einer Funktion, die Urlaub, Krank, Schule, Freistellung liest
  (`20261112120000_einsatz_folgetage.sql:117`). Laufzeit nicht gemessen.
- **V4 — Einsatz auf abgeschlossener/pausierter Baustelle.** Weder `einsatz_speichern` noch
  `einsatz_umplanen`/`einsatz_folgetage` prüfen den Zustand der Baustelle; `baustelle_aufloesen`
  habe ich nicht gelesen. Die Auswahl trennt pausierte ab (`pausiertGetrennt`), Kopieren und
  Folgetage gehen daran vorbei.
- **V5 — Abwesenheiten in der offenen Woche sind nicht live.** `useWochenDaten.ts:164–189` lädt
  sie einmal je Zeitraum; eine Krankmeldung von 7:10 sieht der Planer, der seit 7:00 die Woche
  offen hat, erst nach Neuladen, und `einsatz_speichern` prüft serverseitig keine Abwesenheit.
  Ob der Zwischenspeicher das verlängert, nicht geprüft.

---

## 4. Nicht nahtlos

- **Rüstliste → Schein.** Was für den Einsatz geplant und beim Einladen abgehakt wurde, wird am
  Schein nicht vorgeschlagen; „Für diese Baustelle abgeholt“ liest nur eigene erledigte
  Anforderungen (`pg/materialOrders.ts:341–354`, `MaterialErfassen.tsx:99–129`). Der Monteur sucht
  jede Position noch einmal.
- **Mehrtägiger Einsatz.** Anlegen in einem Zug, Ändern (Uhrzeit, Aufgabe, Person heraus) und
  Absagen nur Tag für Tag; Folgetage werden nur ergänzt, nie geändert.
- **Termine ohne Meldung.** Für Einsätze gibt es die Push bei Planänderung, für Termine keine
  (kein Zweig in `push-melden/index.ts:395–404`, kein Auslöser an `termine`). Ein Monteur, der für
  morgen 8 Uhr zur Besichtigung eingetragen wird, erfährt es nur über App oder Kalender-Abo.
- **Abwesenheit ↔ Einsätze.** Beim Genehmigen eines Urlaubs oder Erfassen einer Krankmeldung
  steht nirgends, dass die Person in dem Zeitraum eingeteilt ist; es gibt keinen Sprung „umplanen“.
- **Baustelle abschließen/pausieren.** Kein Hinweis auf kommende Einsätze, Rüstlisten oder
  Termine (`AdminProjectsView.tsx` liest Einsätze nur für den Filter). Sie bleiben stehen.
- **Schein kommt im Büro an.** Es gibt kein „neu eingegangen“; wer keine Rechnungen sieht
  (Projektleitung, Verwaltung), hat auf der Startseite keine Zeile zu neuen Scheinen.
- **Geschäftsführung und Administrator sind nicht einplanbar** (`src/lib/permissions.ts:232–237`,
  Begründung dort: „Buchhaltung und Verwaltung fahren nicht raus“). Im kleinen Betrieb fährt der
  Chef mit; er kann Scheine schreiben, steht aber nie im Plan, bekommt kein „Heute“ und keinen
  Kalendereintrag. Für „jeden Installationsbetrieb“ wäre das eine Einstellung wie
  `projektleitungImEinsatzplan`.
- **Zeit vor Ort am Schein → Zeiterfassung.** Wird doppelt eingegeben (Schein, dann Buchung mit
  Erinnerung). Begründet (`zeitNachtrag.ts`), kein Befund — aber die Stelle, an der Geld liegen
  bleibt, siehe M6.

---

## 5. Funktionen mit Mehrwert (in den bestehenden Abläufen)

1. **„Einsatz verschieben/absagen“ mit Rüstliste.** Beim Verschieben geht die Rüstliste samt
   Fehlmengen-Anforderung mit, beim Entfernen des Letzten fragt die App „Rüstliste auflösen?“ —
   schließt H2 und macht Umplanen wirklich zu einem Handgriff.
2. **Betroffene Einsätze bei Abwesenheit.** Beim Genehmigen/Erfassen und als Thema „Eingeteilte
   fehlen“ (auch morgen, auch bei Teilausfall), mit Sprung in den Wochenplan — ohne den Grund zu
   nennen.
3. **„Für diesen Einsatz eingeladen“ am Schein.** Die abgehakten Positionen der Rüstliste als
   Vorschlag neben dem Abgeholten — spart dem Monteur das Suchen und hält Schein und Ausgabe
   beisammen.
4. **„Nicht verrechnet“ über alle Scheine in der Datenbank.** Wie `unverrechnete_stunden`: eine
   Funktion, die alle unterschriebenen, unverknüpften Scheine zählt und die ältesten liefert —
   dann stimmen Zähler, Liste und die Vier-Wochen-Schwelle in jedem Betrieb.
5. **Mehrtägigen Einsatz als Ganzes ändern.** „Auch an den folgenden Tagen ändern/entfernen“ im
   Formular (dieselben Prüfungen wie `einsatz_folgetage`) — eine Woche Bad umzuplanen ist heute
   fünfmal dieselbe Arbeit.
6. **Meldung bei Terminen** an die Teilnehmer (heute/morgen, gesammelt wie beim Einsatz) — der
   Termin ist sonst der einzige Planeintrag, von dem der Monteur nichts erfährt.

---

## 6. Was ich nicht angesehen habe

- Darstellung und Bedienung: `WochenRaster`, `HandyWoche`, `MonatsAnsicht`, `MonatsVorschau`,
  `MonatsKalender`, `TagFenster`, `useZiehen` (nur die Aufrufe), `TeamWoche`.
- Rüstliste im Einzelnen: `RuestlistePlanen`, `RuestlisteAbhaken`, `materialDeckung.ts`,
  `ruestliste_speichern`, `laden_umschalten` (nur soweit für H1/H2 nötig).
- `worksheetPdf.ts`, `shared/scheinHash.ts` und die Prüfsummen-Trigger, `Fotostreifen`,
  Speicherregeln des Eimers `scheinfotos`, Papierkorb und `schein_loeschbar`.
- `src/lib/push.ts` (Geräteanmeldung), die übrigen Zweige von `push-melden`, `push-probe`.
- `KalenderAboKarte.tsx`, `kalender_abo_anlegen/beenden`, `app.termin_fuers_abo`.
- `TermineKarte`, `TerminFenster`, `TerminFormular` nur überflogen; `app.termin_pruefen` nur bis
  zur Mitte gelesen.
- Startseite: `regeln.ts` und `aufbau.ts` nur für Einsätze, Scheine, „ohne Einsatz“, „unbesetzt“;
  `DashboardView.tsx`, `StartseiteAnpassen`, `einrichtung.ts`, Kennzahlen im Einzelnen nicht.
- `wochenplan_abwesend`, `app.baustelle_aufloesen`, `personen_im_betrieb`, Austritts-Trigger nur
  über ihre Kommentare.
- Keine Browserläufe, keine Datenbank, keine Tests ausgeführt; Zeiten und Mengen sind gerechnet,
  nicht gemessen.

Geprüft und in Ordnung gefunden (kein Befund): doppelt zugestelltes Unterschreiben
(`supabaseSender.ts:148–200`), Reihenfolge und Besitzer im Ausgangsfach, Zustandsübergänge des
Scheins im Trigger, Rechte an Einsätzen/Terminen/Scheinen im Zeilenschutz, ICS-Aufbau
(Zeitzone, Faltung, Kennungen), Seitenweises Lesen in `abfragen`.
