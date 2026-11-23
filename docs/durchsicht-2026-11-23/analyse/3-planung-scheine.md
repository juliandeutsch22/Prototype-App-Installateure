# Planung, Startseite, Handwerksscheine, Wartung, Termine — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. Nur gelesen. Ausgeführt wurde eine einzige Prüfdatei zum
Nachweis (`tests/unit/ablage.test.ts`, 4 von 4 grün). Keine Datenbank, kein Browser, keine
Codeänderung. Alle Pfade relativ zu `/workspace/Prototype-App-Installateure`. Bei
Datenbankfunktionen ist jeweils die letzte Definition zitiert; `einsatz_umplanen` und
`einsatz_folgetage` werden in `20261117015100_einsatz_feiertage_als_menge.sql` zusätzlich im
Text umgeschrieben (nur die Feiertagsabfrage), der Rumpf steht in den genannten Migrationen.

Kürzel der Befunde: `P`.

---

## 1. Angesehen

Abläufe, von Anfang bis Ende verfolgt:

1. **Einplanen.** `Einsatzplanung.tsx` (Woche, Monat), `AssignmentsView.tsx` (Tag),
   `EinsatzFormular.tsx` (Speichern, Fassungsvergleich, Rüstliste, Folgetage),
   `useWochenDaten.ts`, `PlanungsAblage.tsx`/`ablage.ts` (Schublade „Noch einzuplanen“, E96),
   Datenschicht `src/lib/db/pg/assignments.ts`; Datenbank `einsatz_speichern`,
   `einsatz_umplanen`, `einsatz_entfernen`, `einsatz_loeschen`, `app.ruestliste_nachziehen`,
   `app.ruestliste_umziehen` (`20261116010000`), `app.einsatz_grundlage_pruefen` und die
   Paarsperre (`20261115500000`), `laden_umschalten` (`20261107200100`).
2. **Der Monteur erfährt es.** Startseite (`dashboard/start/laden.ts: persoenlich`,
   `HeuteEigene`), `MyScheduleView.tsx`, `MyProjectsView.tsx`, Push
   (`20261112130000_einsatz_meldung.sql`, `20261116010800_meldung_termine_notfall.sql`,
   `shared/notifyLogic.ts: textEinsatzplan`), Kalender-Abo (`functions/kalender/index.ts`,
   `shared/kalenderIcs.ts`, `kalender_abruf` in `20261116010500`).
3. **Schein schreiben, auch ohne Netz.** `WorkSheetView.tsx` (Vorausfüllung, Entwurf, Fotos,
   Unterschrift), `LeistungszeitErfassen.tsx`, `vorgemerkt.ts`, `src/lib/db/pg/workSheets.ts`,
   `scheinFotos.ts`, das Ausgangsfach (`src/lib/sync/ausgangsfach.ts`, `supabaseSender.ts`,
   `netzfehler.ts`, `src/lib/db/pg/ohneEmpfang.ts`), `Nachsender.tsx`, `VerloreneBuchung.tsx`;
   Datenbank `schein_speichern`, `app.schein_ersetzt_pruefen`, `app.scheine_verrechnet_kern`
   (`20261116010200`), `schein_unterschreiben` (`20260912170000`),
   `app.schein_zustandswechsel` (`20260926114500`), Zeilenschutz
   (`20260926112500`, `20261009200000`), `schein_vorbereiten` (`20261116010300`).
4. **Schein kommt im Büro an und wird verrechnet.** `WorkSheetsListView.tsx`
   („Neu eingegangen“, „Nicht verrechnet“, „Stunden ohne Buchung“), `fehlendeZeitbuchung.ts`,
   `zeitNachtrag.ts`, `scheine_neu`/`scheine_gesehen` (`20261116010900`), der Abschluss der
   Baustelle (`20261116044000`).
5. **Abwesenheit gegen Planung.** `app.abwesenheiten`, `wochenplan_abwesend` (`20261116010500`),
   `besetzung.ts`, `wochenTermine.ts`, `EingeteiltHinweis.tsx`, Startseite der Leitung
   (`laden.ts: leitung`, `aufbau.ts`).
6. **Wartung: fällig → einplanen → erledigen → nächster Termin.** `WartungenView.tsx`,
   `wartungsplan.ts`, `src/lib/db/pg/wartungen.ts`, `wartung_einplanen` (`20261110170000`),
   `wartung_erledigt_eintragen`, `wartung_tag_berichtigen` (`20261116045000`).
7. **Termine.** `TerminFormular.tsx`, `src/lib/db/pg/termine.ts`, `20261004300000_termine.sql`
   (Tabelle, Zeilenschutz, `app.termin_pruefen`).
8. **Startseite: Zahl gegen Zielseite.** `laden.ts`, `aufbau.ts`, `ziele.ts`,
   `baustellen_ohne_einsatz` (`20261116010400`), `baustellen_liste` (`20261118033000`),
   `src/lib/db/pg/projects.ts`, `src/lib/listengrenzen.ts`.

---

## 2. Befunde (belegt)

### P-1 Ein vorgemerkter Schein, den der Server endgültig ablehnt, verschwindet samt Kundenunterschrift
- Art: Fehler (Datenverlust ohne Netz)
- Schwere: hoch — selten, aber nicht wiederholbar: die Unterschrift des Kunden gibt es nur
  einmal. Betroffen ist der Monteur, der im Keller unterschreiben lässt.
- Beleg:
  - `src/lib/sync/ausgangsfach.ts:376–391` (`aufgeben` räumt alle Vorgänge derselben Zeile ab
    dem abgelehnten weg); alle Vorgänge eines Scheins tragen dieselbe Zeile:
    `src/lib/db/pg/workSheets.ts:495–512` (`schein_speichern`) und `:611–616`
    (`schein_unterschreiben`, mit beiden Unterschriftsbildern).
  - Gesichert wird beim Aufgeben nur die Zeitbuchung: `src/lib/db/pg/ohneEmpfang.ts:74–78`
    (`if (vorgaenge[0]?.tabelle !== 'time_entries') return false`).
  - Die Meldung: `src/components/VerloreneBuchung.tsx:62–64` („Ein vorgemerkter Handwerksschein
    konnte nicht gesendet werden: … Bitte unter Handwerksscheine nachsehen.“) — dort steht
    danach nichts, wenn der Schein nur auf dem Gerät entstanden war. Die Meldung gilt nur
    für die laufende Sitzung (Kopf derselben Datei).
  - Was als endgültig gilt: `src/lib/sync/supabaseSender.ts:28–50` (42501, 22…, 23…) und
    `:86–89` (P0001, P0002, 55000, Klasse 42); nach fünf unklaren Antworten ebenso
    (`ausgangsfach.ts:349–356`).
  - Wege, die das auslösen (alle gelesen):
    a) Der Entwurf wurde inzwischen im Büro verworfen → `app.schein_zustandswechsel`
       weist jedes Ändern ab (`20260926114500_umnummern_vollstaendig.sql:80–81`, 42501).
       Ein verworfener Entwurf lässt sich zurückholen — die Unterschrift vom Gerät nicht.
    b) Der Kunde wurde inzwischen zusammengeführt (F9): die Dublette wird gelöscht
       (`20261117031000_kunden_zusammenfuehren.sql:495`), der vorgemerkte Kopf trägt noch
       ihre Kennung → Fremdschlüssel (`20260911130000_vorgaenge.sql:246`), Code 23503.
    c) Zweiter Ersatzschein zum selben stornierten Schein
       (`20261116010200_schein_ersatz_verrechnet.sql:71`, 23505).
    d) Rolle gewechselt (Monteur → Verwaltung): `app.schein_schreibt`
       (`20260926112500_schein_schreiben_wer_darf.sql:41–47`), 42501.
- Auswirkung: Der Monteur öffnet am Vormittag einen Entwurf, fährt in den Keller, trägt
  Material nach, der Kunde unterschreibt, „ohne Verbindung gespeichert, wird automatisch
  gesendet“. Im Büro hat inzwischen jemand den Entwurf als Dublette verworfen. Beim nächsten
  Empfang lehnt der Server ab; Zeiten, Material, Notiz und beide Unterschriften sind
  gelöscht, der Hinweis verschwindet mit dem Schließen der App. Benannt ist bisher nur
  „anderswo unterschrieben oder verworfen“ (Grenzen-Dokument, Tabelle B, Zeile E49) mit
  dem Grund „eingefrorener Beleg“ — der trägt für den verworfenen Entwurf und für b) bis d)
  nicht.
- Vorschlag (wie Z4 für die Zeitbuchung, derselbe Mechanismus):
  1. Neue Datei `src/lib/scheinEntwuerfe.ts` nach dem Vorbild von `src/lib/zeitEntwuerfe.ts`:
     ein aufgegebener Schein wird aus seinen Vorgängen zusammengesetzt
     (`vorgemerkteScheine` kann das schon) und mit Grund und Zeitpunkt auf dem Gerät
     abgelegt — in IndexedDB (eigener Speicher neben dem Fach, je Konto), weil die
     Unterschriftsbilder zu groß für `localStorage` sind. Die Fotodateien bleiben in
     ihrem eigenen Vorgang (`FOTO_TABELLE`), wie heute.
  2. `ohneEmpfang.ts:74`: die Sicherung nimmt auch `SCHEIN_TABELLE` an.
  3. `WorkSheetsListView`: Abschnitt „Nicht angekommen“ über „Noch nicht gesendet“ mit Grund;
     zwei Handgriffe: „Als neuen Schein öffnen“ (neue Kennung, Inhalt und Unterschriften
     vorbelegt; der Monteur prüft und sendet neu — ist der alte Entwurf nur verworfen,
     zuerst der Vorschlag „Entwurf wieder aufnehmen“) und „Verwerfen“ (mit Rückfrage).
     `VerloreneBuchung` nennt den Ort („liegt unter Handwerksscheine, Nicht angekommen“).
  4. Fall b) an der Quelle: `kunden_zusammenfuehren` kann den Kopf nicht kennen; deshalb
     in `schein_speichern` beim Anlegen einen unbekannten `customer_id` auf den Kunden der
     Baustelle setzen (Kopie des Namens bleibt), statt am Fremdschlüssel zu scheitern.
     Neue Fassung der Funktion nach den Regeln (`set search_path = ''`, Rechte unverändert).
  - Prüfungen: `tests/unit/ausgangsfachScheinAufgegeben.test.ts` (Fach mit `schein_speichern`
    + `schein_unterschreiben`, Sender lehnt ab → Entwurf liegt mit beiden Unterschriften;
    Gegenprobe: ohne die Sicherung ist nichts da — rot), Komponentenprüfung der Liste,
    Datenbankprüfung zu b) (zusammenführen, dann speichern mit alter Kennung → gespeichert;
    Gegenprobe ohne Migration 23503).
  - Gleich bleibt: ein anderswo UNTERSCHRIEBENER Schein wird nicht überschrieben (Grenze E49
    bleibt, nur geht die Eingabe nicht mehr verloren); die Reihenfolge im Fach; die
    Zeitbuchung (bestehende Prüfungen zu Z4). Festgehalten durch die vorhandenen
    Ausgangsfach-Prüfungen und `scheinErsatz.test.ts`.
  - Risiko des Umbaus: Unterschriftsbilder liegen länger auf einem geteilten Gerät — nur je
    Konto lesbar ablegen, beim Abmelden mit Warnung (wie `offeneVormerkungen`), Frist zum
    Aufräumen nach dem Verwerfen.
- Aufwand: mittel

### P-2 „Mein Einsatzplan“ zeigt Einsätze an eigenen Urlaubs- und Krankentagen, sobald ein Einsatz mehr als 62 Tage voraus liegt — oder der Betrieb „Wochenplan für alle“ ausgeschaltet hat
- Art: Fehler (und gebrochene Zusage des Handbuchs: „Urlaub, Krankenstand und Betriebsurlaub
  zählen überall gleich“)
- Schwere: mittel — der Monteur sieht „Nächster Einsatz: morgen“ an einem Tag, an dem er
  genehmigt frei hat; sein Kalender-Abo sagt das Gegenteil.
- Beleg:
  - `src/features/assignments/MyScheduleView.tsx:197` holt alle kommenden Einsätze (bis 200,
    ohne Enddatum), `:218–221` fragt die Abwesenheiten von heute bis zum SPÄTESTEN davon.
  - `wochenplan_abwesend` antwortet bei mehr als 62 Tagen mit einer leeren Menge, nicht mit
    einem Fehler: `supabase/migrations/20261116010500_abwesenheit_an_einer_stelle.sql:120`
    (`and p_bis >= p_von and p_bis - p_von <= 62`).
  - Dieselbe Funktion gibt einem Monteur gar nichts, wenn der Schalter aus ist: ebenda `:108`
    (`c.wochenplan_fuer_alle or app.ist_fuehrung() or app.ist_buch_oder_spitze()`) — auch
    nicht die eigene Abwesenheit. Der Schalter ist ab Werk an
    (`20260928113000_wochenplan_ab_werk_an.sql:15`), aber ausschaltbar (`SettingsView.tsx`).
  - Dieselbe Abfrage auf der Startseite des Monteurs: `src/features/dashboard/start/laden.ts:388–393`.
  - Die Schwesterseite kennt die Grenze und klemmt: `src/features/projects/MyProjectsView.tsx:79–81`
    („Wie im Einsatzplan: höchstens 62 Tage voraus“ — der Einsatzplan tut es aber nicht).
  - Das Kalender-Abo fragt `app.abwesenheiten` direkt und ohne beide Einschränkungen
    (`20261116010500…sql`, Abschnitt `weg`, vor dem `grant` in Zeile 255).
  - Keine Prüfung gegen die Datenbank: `tests/components/MyScheduleView.test.tsx:67` ersetzt
    die Abfrage durch eine Attrappe.
- Auswirkung: Das Büro plant im November den Heizungstausch für Ende Jänner ein (ein
  einziger Einsatz in zehn Wochen). Ab diesem Moment zeigt „Mein Einsatzplan“ dem Monteur
  jeden Einsatz auch an seinen genehmigten Urlaubstagen; der Satz „das Büro plant ihn neu“
  erscheint nicht mehr.
- Vorschlag:
  1. Neue Datenbankfunktion `public.meine_abwesenheit(p_von date, p_bis date)`:
     `security definer`, `set search_path = ''`, `revoke … from public, anon`,
     `grant execute … to authenticated`; liefert aus `app.abwesenheiten(app.betrieb(), …)`
     nur die Zeilen mit `user_id = (select auth.uid())`, ohne 62-Tage-Grenze und ohne den
     Schalter (die eigene Abwesenheit darf jeder sehen, samt Grund). Bis 400 Tage, darüber
     Fehler statt leerer Antwort.
  2. `MyScheduleView.tsx:221`, `laden.ts:390`, `MyProjectsView.tsx:81` fragen diese Funktion.
  3. `wochenplan_abwesend` über 62 Tage: Fehler (`22023`) statt leerer Menge — eine leere
     Antwort sieht aus wie „niemand fehlt“. Vorher alle Aufrufer prüfen (sieben, alle
     gelesen: Woche, Monat, Tag und Startseite bleiben unter 62 Tagen).
  - Prüfungen: `tests/supabase/meineAbwesenheit.test.ts` (Monteur, Schalter aus, Urlaub in
    90 Tagen → eine Zeile; fremde Person → keine; Gegenprobe: `wochenplan_abwesend` liefert
    in beiden Fällen nichts). Komponentenprüfung „Einsatz in 70 Tagen, Urlaub morgen →
    morgen ausgeblendet“ mit einer Attrappe, die sich wie die Datenbank verhält.
  - Gleich bleibt: was Kollegen voneinander sehen (`wochenplanFuerAlle.test.ts`,
    `abwesenheiten.test.ts`), der Grund einer fremden Krankmeldung bleibt dem Büro.
  - Risiko: gering; die neue Funktion gibt nur eigene Daten heraus.
- Aufwand: klein

### P-3 Wochenplan, Tagesplanung und Startseite der Leitung lesen höchstens 500 laufende Baustellen, ohne Reihenfolge und ohne Hinweis
- Art: Grenze (unbenannt) mit Unstimmigkeit zur Zielseite
- Schwere: mittel — trifft Betriebe, die jede Reparatur und jede Wartung als Baustelle
  führen und nicht laufend abschließen; dann aber falsch ohne jedes Zeichen.
- Beleg:
  - `src/lib/db/pg/projects.ts:21–26` (`listActiveProjects`, Aktiv und Pausiert, `grenze: max`,
    kein `sortiere`), `src/lib/listengrenzen.ts:92` (`BAUSTELLEN_AUSWAHL_GRENZE = 500`). Die
    Auswahlfelder sagen es (`BaustellenSuche.tsx`, `BaustellenSelect.tsx`), die folgenden
    Stellen nicht:
  - „Noch einzuplanen“: `src/features/assignments/useWochenDaten.ts:127` →
    `Einsatzplanung.tsx:197–204` (Liste und Zahl der Schublade).
  - Tagesplanung: `AssignmentsView.tsx:174`; eine Baustelle außerhalb der 500 (oder eine
    abgeschlossene) steht in der Tagesübersicht nur mit ihrer Nummer (`:439`, `:464`) — die
    Woche holt solche nach (`useWochenDaten.ts:329–349`), der Tag nicht.
  - Startseite: `laden.ts:692` → Kennzahl „Aktive Baustellen“ (`aufbau.ts:468–470`), „N am
    Budgetlimit“ (`laden.ts:704–708`), „über dem Endtermin“ (`aufbau.ts:636–646`), „ohne
    Projektleitung“ (`aufbau.ts:451–452`, `:801`). Die Zielseiten zählen dagegen über alle
    (`baustellen_liste`, `baustellen_budget_lage`, `20261118033000`).
  - Im Grenzen-Dokument steht die Grenze nicht.
- Auswirkung: Betrieb mit 640 laufenden Baustellen. Die Startseite sagt „500 aktive
  Baustellen, 3 am Budgetlimit“, die Baustellenliste dahinter „612 aktiv, 7 über 90 %“.
  In der Schublade fehlen 140 Baustellen — welche, entscheidet die Datenbank zufällig.
- Vorschlag:
  1. Startseite: die vier Zahlen aus der Datenbank, die die Zielseite schon rechnet —
     `baustellen_liste` liefert das Schriftfeld (aktiv, Ende überschritten),
     `baustellen_budget_lage` die Budgetzahlen; für „ohne Projektleitung“ die Zählung der
     Filterseite. `laden.ts: leitung` holt keine Baustellenliste mehr für Zahlen; die Namen
     der wenigen gezeigten Zeilen kommen über `listProjectsByNumbers`.
  2. „Noch einzuplanen“: neue Funktion `public.baustellen_ohne_einsatz_woche(p_von date,
     p_bis date, p_suche text, p_ab integer, p_anzahl integer)` — Zahl und gezeigte Seite,
     Suche im Teilwort wie `baustellen_liste`; `security definer`, `set search_path = ''`,
     `revoke … from public, anon`, Betrieb als `(select app.lesebetrieb())` bzw.
     `(select app.supportbetrieb())`. Die Schublade blättert („weitere anzeigen“ gibt es
     schon), die Suche geht an den Server.
  3. Tagesplanung: fehlende Baustellen der Einsätze nachholen wie `useWochenDaten.ts:329–349`
     (dieselbe Hilfsfunktion herausziehen).
  - Prüfungen: Datenbankprüfung mit 520 aktiven Baustellen (Zahl 520, erste Seite 20, Suche
    findet die 519.; Gegenprobe mit dem alten Weg: 500). Startseite gegen Zielseite:
    dieselben Zahlen aus derselben Funktion. `planungAblage.spec.ts` (3.195 Baustellen) muss
    grün bleiben.
  - Gleich bleibt: was „Noch einzuplanen“ bedeutet (laufend, nicht pausiert, kein Einsatz in
    der gezeigten Woche), Ziehen aus der Schublade, Einklappen, die Regeln der Startseite
    (`startseite*.test.ts`, `leitungEinsatzlage`).
  - Risiko: die Schublade wird vom reinen Rechnen im Browser zu einer Abfrage — beim Live-
    Wechsel eines Einsatzes muss sie neu fragen (wie die Baustellenliste es tut).
- Aufwand: mittel

### P-4 Der offene Wochenplan zeigt Abwesenheiten, Termine, Betriebsurlaub, Baustellen und Belegschaft so, wie sie beim Öffnen waren — und das Speichern prüft keine Abwesenheit
- Art: Lücke (Wettlauf zwischen Krankmeldung und Planung)
- Schwere: mittel — der Plan steht im Büro den ganzen Tag offen; die Krankmeldung von
  7:10 Uhr sieht der Planer, der seit 7:00 Uhr die Woche offen hat, nicht.
- Beleg:
  - Live ist nur die Liste der Einsätze (`useWochenDaten.ts:136–154`). Abwesenheiten laden
    einmal je Zeitraum (`:167–192`), Betriebsurlaub ebenso (`:226–251`), Termine einmal und
    nach eigenem Speichern (`:200–223`), Belegschaft und Baustellen einmal je Besuch der
    Seite (`:118–134`). Weder „Jetzt aktualisieren“ (`src/lib/aktualisieren.ts`) noch die Rückkehr
    in den Vordergrund holen sie nach; in `useWochenDaten.ts` kommt keine der beiden
    Anmeldungen vor. Dasselbe in der Tagesplanung (`AssignmentsView.tsx:172–184`, `:200–224`).
  - Der Wächter merkt es nicht: `tests/unit/aktualisierenRegel.test.ts` prüft Seiten und
    Teillisten, nicht die Hooks, und lässt eine Seite durch, sobald irgendeine Live-Quelle
    vorkommt (`bleibtAktuell`).
  - `einsatz_speichern` prüft weder Abwesenheit noch Feiertag noch Betriebsurlaub
    (`20261116010000_einsatz_ruestliste_mit.sql:470–517`); `einsatz_umplanen` und
    `einsatz_folgetage` tun es. Das Formular warnt aus der Liste der Seite
    (`EinsatzFormular.tsx:555`).
- Auswirkung: Anton meldet sich um 7:10 Uhr krank. Die Projektleiterin teilt ihn um 7:30 Uhr
  im seit 7:00 Uhr offenen Plan für morgen ein — ohne Warnung, ohne „fehlt“. Sie erfährt es
  erst über die Startseite („Eingeteilte fehlen“) oder nach dem Neuladen. Ein Termin, den
  die Verwaltung gerade angelegt hat (Lieferung morgen 8 Uhr), erscheint in ihrer Woche
  ebenfalls nicht.
- Vorschlag:
  1. `useWochenDaten.ts` und `AssignmentsView.tsx`: Abwesenheiten, Betriebsurlaub, Termine,
     Belegschaft und Baustellen laden zusätzlich bei „Jetzt aktualisieren“
     (`useAktualisierungsRunde`) und bei Rückkehr in den Vordergrund.
  2. Live-Anstoß ohne neue Daten im Kanal: ein Kanal je Tabelle (`termine`, `vacations`,
     `krankmeldungen`, `betriebsurlaube`, `freistellungen`) mit `kanalHalten` (wie
     `beobachteEinsatzTage`, `assignments.ts:114–152`), der nur „neu fragen“ auslöst, auf
     höchstens einmal je Sekunde gebündelt. Der Zeilenschutz bleibt: gelesen wird weiter
     über `wochenplan_abwesend`; kommt für eine Rolle keine Meldung an, bleibt es beim
     Stand von Punkt 1.
  3. Datenbank: `einsatz_speichern` gibt zusätzlich zurück, wer von den Eingeteilten am Tag
     ganztags abwesend ist (aus `app.abwesenheiten`); das Formular zeigt nach dem Speichern
     „gespeichert — Anton ist an diesem Tag abwesend“ mit „Umplanen“. Nicht abweisen: das
     Formular erlaubt bewusst die Planung über Feiertag und Abwesenheit. Rückgabe
     verträglich erweitern (alte App liest sie nicht).
  4. Wächter: `aktualisierenRegel.test.ts` folgt den Hooks einer Seite (`use*.ts` im selben
     Ordner) und verlangt für jede Lesefunktion eine der drei Arten.
  - Prüfungen: Komponentenprüfung „Aktualisieren holt Abwesenheiten und Termine neu“
    (Gegenprobe: heute nur die Einsätze); Datenbankprüfung zu Punkt 3; der erweiterte
    Wächter ist am heutigen Stand rot.
  - Gleich bleibt: ungespeicherte Eingaben im offenen Formular (P1 der letzten Durchsicht,
    `EinsatzFormularLive.test.tsx`) — das Formular übernimmt neue Abwesenheiten nur als
    Hinweis, nie als Zurücksetzen; „frei unklar“ bei Ladefehler.
  - Risiko: zusätzliche Kanäle kosten Verbindungen; deshalb nur, solange die Planung offen
    ist, und gebündelt.
- Aufwand: mittel

### P-5 Scheitert die Abfrage der Abwesenheiten, sagen Tagesplanung, Startseite der Leitung und „Mein Einsatzplan“ still „niemand fehlt“
- Art: Fehler (stiller Fehlschlag), Unstimmigkeit zur Woche
- Schwere: niedrig bis mittel — nur bei schlechtem Netz, dann aber die falsche Auskunft an
  der Stelle, an der eingeteilt wird.
- Beleg: `AssignmentsView.tsx:207–220` (`.catch(() => setUrlaube([]))`, ebenso der
  Betriebsurlaub, ohne Hinweis); `laden.ts:716–718` (`still(…, [])` für „Unbesetzt“,
  „Eingeteilte fehlen“, „Abwesend heute“ und die Auslastung — für den Betriebsurlaub steht
  zwei Zeilen darunter ausdrücklich „Ohne Betriebsurlaube keine Zahl“, `:795–796`);
  `MyScheduleView.tsx:228–230`. Die Woche macht es richtig: „frei unklar“ mit „Erneut
  versuchen“ (`useWochenDaten.ts:178–185`, `Einsatzplanung.tsx:483`). Daneben verschluckt
  das Löschen in der Tagesplanung den Grund (`AssignmentsView.tsx:627`, fester Satz statt
  `grundAus`).
- Auswirkung: Tagesplanung am Tablet auf der Baustelle, eine Abfrage läuft in die Frist.
  „Noch nicht eingeteilt (6)“ nennt auch die zwei Urlauber, kein Wort dazu.
- Vorschlag: denselben Zustand wie in der Woche (`abwesenheitUnklar`) in die Tagesplanung
  (Teilfehler mit „Erneut versuchen“, die Zeile „Noch nicht eingeteilt“ sagt „Abwesenheiten
  nicht geladen“); auf der Startseite fehlen bei gescheiterter Abfrage die drei Abschnitte
  und die Auslastung (wie beim Betriebsurlaub), der Block meldet „Abwesenheiten nicht
  geladen“; `AssignmentsView.tsx:627` nennt den Grund. Prüfungen je Stelle mit abgelehnter
  Abfrage (Gegenprobe: heute steht „Alle verfügbaren Mitarbeiter sind eingeteilt“ bzw. eine
  Auslastung). Gleich bleibt alles bei gelungener Abfrage (`AssignmentsView.test.tsx`,
  `startseite*.test.ts`). Risiko: keines erkennbar.
- Aufwand: klein

### P-6 Termine kennen keine Abwesenheit ihrer Teilnehmer
- Art: Lücke (Abwesenheit gegen Planung)
- Schwere: mittel — die Besichtigung beim Kunden ist der Termin, bei dem jemand von außen
  wartet.
- Beleg: `TerminFormular.tsx` prüft nur die Uhrzeitfolge (`:95`); Abwesenheit, Feiertag und
  Betriebsurlaub kommen in der Datei nicht vor. `EingeteiltHinweis.tsx:30–36` zählt beim
  Genehmigen eines Urlaubs und beim Erfassen einer Krankmeldung nur Einsätze
  (`listAssignmentsForUserInRange`). „Eingeteilte fehlen“ der Startseite rechnet nur aus
  Einsätzen (`laden.ts:774–787`). Nur „Lieferung ohne Annahme“ kennt Abwesenheit
  (`wochenTermine.ts:29–41`). Auch `app.termin_pruefen` (`20261004300000_termine.sql:152–185`)
  prüft sie nicht.
- Auswirkung: Morgen 8 Uhr Besichtigung bei Familie Huber, Teilnehmer der Obermonteur. Er
  meldet sich heute Abend krank. Beim Erfassen der Krankmeldung steht „an 2 Tagen
  eingeteilt“ — der Termin nicht. Die Startseite der Projektleitung nennt die zwei
  Einsätze, die Besichtigung nicht. Der Kunde wartet.
- Vorschlag:
  1. `EingeteiltHinweis`: zusätzlich die Termine der Person im Zeitraum (neue kleine Funktion
     `public.termine_der_person(p_user uuid, p_von date, p_bis date)` für alle, die
     Abwesenheiten entscheiden — nur Tag, Art und Uhrzeit; `security definer`,
     `set search_path = ''`, `revoke … from public, anon`, nur im eigenen Betrieb). Satz:
     „an 2 Tagen eingeteilt, 1 Termin (Do 08:00 Besichtigung)“.
  2. Startseite: Abschnitt „Eingeteilte fehlen“ nimmt Termine von heute und morgen mit
     ganztags abwesendem Teilnehmer auf (Daten liegen im Block schon vor: Termine und
     Abwesenheiten), Ziel ist der Tag im Plan.
  3. `TerminFormular`: Hinweis am Teilnehmer („an diesem Tag abwesend“), aus den
     Abwesenheiten der Seite; kein Sperren.
  - Prüfungen: `EingeteiltHinweis.test.tsx` (+ Termin), `startseite`-Regel (+ Termin mit
    fehlendem Teilnehmer; Gegenprobe: heute keine Zeile), Formularprüfung.
  - Gleich bleibt: der Grund der Abwesenheit steht nirgends, wo er heute nicht steht; die
    Buchhaltung bekommt den Satz ohne Sprung.
  - Risiko: gering.
- Aufwand: klein bis mittel

### P-7 Wer am Freitag für Montag umgeplant wird, bekommt nie eine Meldung
- Art: Grenze (benannt: „Push bei geändertem Einsatzplan nur für heute und morgen“, E85) —
  der Grund deckt den häufigsten Fall nicht
- Schwere: mittel — die Planung der nächsten Woche geschieht am Freitag; jede Woche.
- Beleg: `20261112130000_einsatz_meldung.sql:80` (`continue when tag not between heute and
  heute + 1`), `20261116010800_meldung_termine_notfall.sql:87` (Termine ebenso). Am Sonntag,
  wenn der Montag „morgen“ wird, ändert sich nichts mehr — kein Auslöser, keine Meldung.
  Eine tägliche Vorschau gibt es nicht (einziger Zeitplan: `einsatz-meldungen`, jede
  Minute, nur für wartende Änderungen).
- Auswirkung: Freitag 15:30 Uhr zieht das Büro Bernds Montagseinsatz von Baustelle X auf
  den Notfall bei Y, Beginn 6:30 statt 7:00 Uhr. Bernd öffnet die App am Wochenende nicht
  und steht am Montag um 7:00 Uhr bei X.
- Vorschlag: „morgen“ wird „der nächste Arbeitstag der Person“.
  1. Neue Hilfsfunktion `app.naechster_arbeitstag(p_user uuid, p_heute date)`: der nächste
     Tag nach heute, der kein Samstag/Sonntag außerhalb der Arbeitstage der Person, kein
     Feiertag (`app.feiertage`) und kein Betriebsurlaub ist — höchstens zehn Tage voraus.
     Hat die Person an einem früheren Tag einen Einsatz (Notdienst am Samstag), zählt der.
  2. `app.einsatz_aenderung_merken`, `app.termin_aenderung_merken`, `app.einsatz_planstand`
     und `push_einsatz` rechnen mit „heute bis nächster Arbeitstag“ statt `heute + 1`;
     `textEinsatzplan` (`shared/notifyLogic.ts:669–683`) nennt den Tag („Montag: …“) statt
     „Morgen“, wenn es nicht morgen ist. Danach `node scripts/edge-shared-uebernehmen.mjs`.
  - Prüfungen: `tests/supabase/einsatzMeldungArbeitstag.test.ts` (Freitag, Änderung für
    Montag → wartende Meldung; Gegenprobe ohne Migration: keine), Feiertag dazwischen,
    Person mit Samstag als Arbeitstag; `notifyLogic`-Einheitsprüfung für den Text.
  - Gleich bleibt: gesammelt nach zwei Minuten Ruhe, nichts bei unverändertem Plan, nichts
    für den, der sich selbst einträgt, abschaltbar (`einsatzMehrtage`,
    `meldungTermineNotfall.test.ts`); spätere Tage melden sich weiter nicht.
  - Risiko: der einmal abweichende Prüfwert nach der Umstellung löst je Person höchstens
    eine Meldung mehr aus (so schon bei V8 benannt).
- Aufwand: klein bis mittel

### P-8 Ohne Netz zeigt die neu geöffnete App dem Monteur seinen Einsatz von heute nicht — und damit lässt sich auch kein Schein beginnen
- Art: Grenze (für den Schein benannt, für den Einsatz nicht; Grund trägt nur zum Teil)
- Schwere: mittel — Tiefgarage, Keller, Rohbau sind der Arbeitsplatz; betroffen ist jeder
  Monteur, sobald das Telefon die App neu lädt.
- Beleg: Der letzte Stand liegt nur im Arbeitsspeicher, zehn Minuten
  (`src/lib/zwischenspeicher.ts:33–52`, `:109–124`); die Startseite lädt Einsatz, Adresse,
  Ansprechpartner und Rüstliste bei jedem Aufbau vom Server (`laden.ts:345–349`, `:393–423`),
  „Mein Einsatzplan“ ebenso (`MyScheduleView.tsx:154–205`). Die App selbst startet ohne
  Empfang (Handbuch: „Der Service Worker hält die App am Telefon vor“), die Anmeldung
  bleibt. Benannt ist nur: „Handwerksschein ohne jedes Netz neu beginnen … Datenschutz: …
  ein Vorrat aller Baustellen und Kunden im Browser läge auf geteilten Tablets
  unverschlüsselt“ (Grenzen-Dokument, Tabelle B). Für den EIGENEN Einsatz von heute gilt
  dieser Grund nicht: es sind die Angaben, die das Kalender-Abo ohnehin aufs Telefon legt,
  und das Ausgangsfach hält bereits ganze Scheine mit Kundennamen je Konto vor.
- Auswirkung: Der Monteur öffnet die App in der Tiefgarage des Kunden: kein Einsatz, keine
  Telefonnummer des Ansprechpartners, keine Rüstliste, „Neuer Schein“ ohne Baustelle.
- Vorschlag:
  1. `persoenlich` (`laden.ts`) legt die eigenen Einsätze von heute und vom nächsten
     Arbeitstag samt Baustellenkopf (Nummer, Kunde, Kundenkennung, Adresse, Ansprechpartner,
     Abrechnungsart) und Rüstliste je Konto auf dem Gerät ab (IndexedDB neben dem Fach,
     Schlüssel Konto und Betrieb, Tag im Eintrag; älter als zwei Tage wird beim Start
     gelöscht, beim Abmelden und Kontowechsel alles).
  2. Scheitert das Laden am Netz (`istNetzfehler`), zeigen Startseite und „Mein Einsatzplan“
     diesen Stand mit dem Satz „Stand von 06:42 — ohne Verbindung“. Abhaken der Rüstliste
     bleibt ohne Netz gesperrt (bucht Bestand, braucht den Server) und sagt das.
  3. `WorkSheetView`: ohne Netz steht die Baustelle des gemerkten Einsatzes zur Wahl; der
     Kopf kommt aus dem Gemerkten, wie heute beim Wiederöffnen eines Entwurfs ohne Server
     (`WorkSheetView.tsx:522–537`). Zeiten werden dann vor Ort getippt (Vorausfüllung
     braucht den Server).
  - Prüfungen: Einheitsprüfung des Speichers (Konto A legt ab, Konto B liest nichts; zwei
    Tage alt → weg); Komponentenprüfung Startseite ohne Netz; Browserweg im Projekt
    `telefon-chromium` („offline neu laden → Einsatz steht, Schein lässt sich beginnen und
    vormerken“; Gegenprobe: heute Ladefehler).
  - Gleich bleibt: kein Vorrat fremder Baustellen (Grenze E49 bleibt für alles außer den
    eigenen Einsätzen), mit Netz zählt nur der frische Stand; privates Fenster wie bisher
    ohne Vormerken.
  - Risiko: ein veralteter Stand wird für aktuell gehalten — deshalb der Zeitstempel, und
    mit Netz wird er nie gezeigt. Auf geteilten Geräten liegen zwei Tage lang Adressen der
    eigenen Einsätze; das entspricht dem Kalender-Abo. Datenschutz-Text prüfen (Kanzlei).
- Aufwand: mittel

### P-9 „Stunden ohne Buchung“ prüft nur die 50 zuletzt angelegten Scheine (auf Knopfdruck höchstens 150) — der genannte Grund gilt nicht mehr
- Art: Grenze (in der App benannt, im Grenzen-Dokument nicht; Grund entfallen), fehlt auf der Startseite
- Schwere: mittel — Geld: die Rechnung nimmt Stunden nur aus Buchungen; eine Stunde des
  Kollegen, die nur auf dem Schein steht, wird nie verrechnet.
- Beleg: `WorkSheetsListView.tsx:87` (`SCHEINE_JE_SEITE = 50`), `:470` (`pruefBasis =
  tiefeScheine ?? scheine`), `:108`/`:522` (`PRUEF_GRENZE = 150`, neueste zuerst), Hilfetext
  `:1117–1123` („zwei Unterschriftsbilder … rund 70 KB je Stück … höchstens 150 Scheine“).
  Seit der Umstellung der Listen kommen die Bilder aber gar nicht mehr mit
  (`workSheets.ts:59–71`, `LISTENKOPF`; auch `listSignedWorkSheetsInRange` nutzt ihn,
  `:256–257`). `fehlendeZeitbuchung.ts:46–50` verlangt selbst: „Nach oben KEINE Grenze …
  genau der [alte Schein] ist der teure.“ Die Startseite kennt den Befund nicht
  (`aufbau.ts:359` meint mit „ohne Buchung“ Personen mit fehlenden Tagen,
  `regeln.ts:470–486`).
- Auswirkung: Acht Monteure, je ein Schein am Tag: die Karte sieht sechs Arbeitstage. Die
  Zeile „Kollege Huber, 07:00–15:30“ von vor drei Wochen, die Huber auf eine andere
  Baustelle gebucht hat, steht nirgends — auch nicht, wenn das Büro „Weiter zurück
  prüfen“ wählt (480 Scheine in 90 Tagen, geprüft werden die jüngsten 150).
- Vorschlag: wie P3 und P6 der letzten Durchsicht — eine Datenbankfunktion über alle.
  1. `public.scheine_ohne_buchung(p_heute date, p_ab integer, p_anzahl integer)`: je
     unterschriebenem Schein (älter als zwei Tage) und Person auf dem Schein, ob es am Tag
     eine Anwesenheit mit demselben Namen gibt (Name wie `normName`: klein, Leerraum
     zusammengezogen) und ob auf dieser Baustelle (`app.baustelle_wie_js`); Rückgabe Zahl,
     Summe der Minuten ohne Buchung und die gezeigte Seite, älteste zuerst.
     `security definer`, `set search_path = ''`, `revoke … from public, anon`; nur für
     `app.ist_buch_oder_spitze()` (wie `canEditTime`), eigener Betrieb.
  2. Die Karte fragt die Funktion und blättert; „Weiter zurück prüfen“ und die 150 entfallen
     (kein Verlust: es gilt dann immer „über alle“).
  3. Startseite der Buchhaltung und der Spitze: Zeile „N Scheine mit Stunden ohne Buchung“
     → `/worksheets?filter=ohne-buchung` (neuer Wert in `SCHEIN_FILTER`, `ziele.ts`).
  - Prüfungen: Datenbankprüfung „bleibt gleich“ gegen `scheineOhneBuchung` (dieselben Fälle
    wie die vorhandene Einheitsprüfung), „der 151. von hinten wird gefunden“ (Gegenprobe:
    der alte Weg findet ihn nicht), Rechte (Monteur und Projektleitung: nichts).
  - Gleich bleibt: die Regeln (ab zwei Tagen, nur Name und Tag, nicht die Minuten, „keine
    Buchung gefunden“ statt „nicht gebucht“), die Erinnerung des Monteurs.
  - Risiko: Namensvergleich in SQL muss genau `normName` treffen — deshalb die
    Gleichheitsprüfung gegen die bestehende Funktion.
- Aufwand: mittel

### P-10 Beim Abschließen einer Baustelle zählt „unterschriebene Scheine nicht verrechnet“ nach einer anderen Regel als Startseite, Rechnungen und Scheinliste
- Art: Unstimmigkeit (dieselbe Regel in der Datenbank zweimal verschieden)
- Schwere: niedrig bis mittel — die falsche Warnung erscheint genau dann, wenn die App das
  Abschließen selbst anbietet (nach bezahlter Schlussrechnung); betroffen sind die drei
  unten genannten Fälle, nicht jede Baustelle.
- Beleg: `supabase/migrations/20261116044000_baustelle_abschliessen.sql:59–64`
  (`unverrechnete_scheine`: unterschrieben und keine Zeile `invoice_coverage` der Art
  `work_sheet` auf gültiger Rechnung). Der gemeinsame Kern
  `app.scheine_verrechnet_kern` (`20261116010200_schein_ersatz_verrechnet.sql:283–345`) zählt
  dazu als verrechnet: Ersatzscheine verrechneter Scheine, alle Scheine einer Pauschal-
  oder Einheitspreis-Baustelle mit gültiger Rechnung und Scheine ohne Material im
  abgerechneten Zeitraum. Anzeige: `src/features/projects/abschlussPunkte.ts:33–36`.
  Neue Rechnungen verknüpfen seit dem 12.11.2026 jeden Schein, den sie abrechnen
  (`src/features/invoices/assemble.ts:336–343`); die Abweichung bleibt deshalb in drei
  Fällen: (1) Rechnungen von vor dem 12.11.2026 — Scheine nur mit Stunden wurden damals
  nicht verknüpft, der Kern erkennt sie am Zeitraum, der Abschluss nicht; (2) ein
  Ersatzschein nach Storno (P4) erbt im Kern die Verrechnung, im Abschluss nicht; (3) auf
  einer Pauschal- oder Einheitspreis-Baustelle ein Schein, den die Rechnung nicht selbst
  verknüpft hat (etwa nach der Schlussrechnung unterschrieben).
- Auswirkung: Baustelle aus dem Oktober, drei Scheine nur mit Stunden, Schlussrechnung vom
  30.10., bezahlt. Startseite und Rechnungen: nichts offen. Der Abschluss-Dialog: „3
  unterschriebene Scheine sind nicht verrechnet — trotzdem abschließen?“ Dasselbe nach
  jedem Storno mit Ersatzschein. Wer das einige Male gesehen hat, liest die Warnung nicht
  mehr, auch wenn sie einmal stimmt.
- Vorschlag: `app.baustelle_abschluss_zaehlen` zählt
  `unterschriebene Scheine der Baustelle, die nicht in app.scheine_verrechnet_kern(betrieb,
  ids) stehen` — neue Fassung der Funktion (unverändert `security definer`,
  `set search_path = ''`, `revoke … from public, anon, authenticated`). Prüfung:
  `tests/supabase/baustelleAbschliessen…` um drei Fälle erweitert (Pauschale mit Rechnung,
  Stundenschein im Zeitraum, Ersatzschein → je 0; Gegenprobe: heute je 1). Gleich bleibt:
  ein wirklich offener Schein mit Material zählt weiter, die Sicht ohne Leserecht bleibt
  `null`. Risiko: keines erkennbar.
- Aufwand: klein

### P-11 Seit „je Person eigene Uhrzeit“ (P7) zeigen Tagesübersicht, Baustellen-Sicht und Fenster „Tag“ nur die Uhrzeit der ersten Person
- Art: Unstimmigkeit (Nachzug zu P7 der letzten Durchsicht fehlt)
- Schwere: niedrig — die Sicht „Personen“ stimmt; falsch ist die Zusammenfassung je Baustelle.
- Beleg: `AssignmentsView.tsx:469` (`einsatzZeit(rows[0])` als Marke der Baustelle; an der
  Person steht nur eine abweichende Aufgabe, `:544–546`, keine abweichende Uhrzeit);
  `useWochenDaten.ts:403` (`zeit: b.zeit` der ersten Zelle für den ganzen Eintrag der
  Baustelle — daraus rechnen Baustellen-Sicht, Handy-Tagesliste und `TagFenster`).
- Auswirkung: Anton 07:00–12:00, Bernd 13:00–16:00 auf derselben Baustelle. Die
  Tagesübersicht sagt „07:00–12:00 · 2 Facharbeiter“.
- Vorschlag: eine kleine Rechnung `zeitDerBaustelle(zeilen)` in `einsatzZeit.ts`: gleiche
  Uhrzeit bei allen → wie heute; sonst frühester Beginn bis spätestes Ende mit dem Zusatz
  „je Person verschieden“, und an der Person ihre eigene Uhrzeit. Verwendet in
  `AssignmentsView`, `useWochenDaten` (Feld `zeit` plus `zeitVerschieden`), `TagFenster`,
  `HandyWoche`. Prüfung: Einheitsprüfung der Rechnung, Komponentenprüfung Tagesübersicht
  (Gegenprobe: heute „07:00–12:00“). Gleich bleibt: einheitliche Zeiten sehen aus wie
  bisher. Risiko: Breite der Marke am Handy — im Bild prüfen.
- Aufwand: klein

### P-12 Das geführte Abschließen sieht kommende Termine der Baustelle nicht
- Art: Lücke
- Schwere: niedrig
- Beleg: `20261116044000_baustelle_abschliessen.sql:52–70` zählt Einsätze, Entwürfe,
  Anforderungen, Scheine, Minuten, Material, Rechnungen — keine Termine. Termine hängen an
  der Baustelle (`20261004300000_termine.sql`, `project_id`) und bleiben nach dem
  Abschließen im Plan, im Kalender-Abo und in der Meldung an die Teilnehmer.
- Auswirkung: Baustelle abgeschlossen, die Abnahme mit dem Kunden nächste Woche steht
  weiter im Plan — oder umgekehrt: niemand merkt, dass noch eine Abnahme aussteht.
- Vorschlag: `kommende_termine` (Zahl und nächster Tag) in `app.baustelle_abschluss_zaehlen`,
  Zeile im Dialog („1 Termin am 02.12. — bleibt stehen“), kein Sperren. Prüfung mit
  Gegenprobe (heute fehlt die Zeile); die bestehende Abschlussprüfung bleibt grün.
- Aufwand: klein

---

## 3. Verdacht (nicht zu Ende geprüft)

- **V-1 Eine Sperrseite eines fremden WLAN kann einen vorgemerkten Vorgang nach fünf
  Minuten verwerfen.** Antwortet ein Vorbau (Gäste-WLAN des Kunden, Firmen-Firewall) mit
  403 oder 404 und HTML, hat der Fehler keinen Code und einen Stand unter 500:
  `istNetzfehler` (`netzfehler.ts:29–37`) verneint, `istStoerung`
  (`supabaseSender.ts:65–66`) auch → „unklar“ → nach fünf Läufen aufgegeben
  (`ausgangsfach.ts:349–356`). Es fehlt: der Nachweis, wie supabase-js eine solche Antwort
  tatsächlich durchreicht (Stand, Meldung). Mit P-1 wäre der Schaden begrenzt; für
  Zeitbuchungen greift schon Z4.
- **V-2 „Wartung bearbeiten“ kann das „Erledigt“ eines Kollegen überschreiben.** Das
  Formular schreibt alle Felder samt „zuletzt gewartet“, „fällig“ und Intervall
  (`WartungenView.tsx:581–596`, `updateWartung`), ohne Vergleich mit dem Stand beim Öffnen;
  `wartung_erledigt_eintragen` prüft — anders als `wartung_einplanen`
  (`20261110170000…sql:106–108`) — nicht, ob der Dialog veraltet ist. Es fehlt: nachstellen
  mit zwei Sitzungen, und was die Auslöser (`wartungen_bezug_mit_tag`,
  Ausführung festhalten) daraus machen.
- **V-3 Termin ändern ist „der Letzte gewinnt“.** `terminAendern` schreibt die ganze Zeile
  (`src/lib/db/pg/termine.ts:80–82`), die Terminlisten sind nicht live (P-4). Zwei Planende
  am selben Termin: die Uhrzeitänderung des einen geht beim Speichern des anderen
  verloren. Es fehlt: wie oft zwei Personen denselben Termin bearbeiten — vermutlich
  selten.
- **V-4 Kopieren und Folgetage prüfen den Zustand der Baustelle nicht.** `einsatz_umplanen`
  (`20261116010000…sql:278–377`) und `einsatz_folgetage` (`20261116010700…sql`) lesen
  `projects.status` nicht; `baustelle_abschliessen` hält nur die im Moment des
  Abschließens kommenden Einsätze auf. „Auf den nächsten Werktag kopieren“ an einem Einsatz
  einer inzwischen abgeschlossenen Baustelle legte also wieder einen an. Es fehlt: der
  Nachweis über die Oberfläche (der Knopf steht in Tag und Woche an jedem Einsatz).
- **V-5 Rückfälle durch E96/E98 habe ich im Code nicht gefunden, im Browser aber nicht
  geprüft.** Schublade, Mitrollen und Einsatz-Vorschau sind nur gelesen
  (`PlanungsAblage.tsx`, `Einsatzplanung.tsx:587–665`); `tests/unit/ablage.test.ts` läuft
  grün.

---

## 4. Benannte Grenzen, neu bewertet

Fundstellen in `docs/grenzen-durchsicht-2026-10-24.md`.

| Grenze (Fundstelle) | Grund | Grund gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| Push bei geändertem Einsatzplan nur für heute und morgen (E85, „Zweite Durchsicht“) | fachlich: spätere Tage stehen im Plan, eine Wochenplanung meldete sich je Tag | Zum Teil. Gegen Meldungsflut ja; für Freitag → Montag nein. | Bauen: „heute und nächster Arbeitstag“ (P-7). |
| Handwerksschein ohne jedes Netz neu beginnen (E49, Tabelle B) | Datenschutz: Vorrat aller Baustellen und Kunden | Für den ganzen Bestand ja. Für die eigenen Einsätze von heute nein. | Bauen für die eigenen Einsätze (P-8); Grenze sonst lassen. |
| Ein vorgemerkter Schein, der anderswo unterschrieben oder verworfen wurde, kommt nicht mehr an (E49, Tabelle B) | fachlich/rechtlich: eingefrorener Beleg | Für „unterschrieben“ ja. Für „verworfen“ und alle anderen Ablehnungen nein — und nirgends steht, dass die Eingabe dabei gelöscht wird. | Eingabe sichern (P-1); Grenze auf „überschreibt nicht“ einengen. |
| Im privaten Fenster kein Vormerken (E49) | Gerät: kein dauerhafter Speicher | Ja. | Lassen. |
| Eine beim Umplanen zusammengeführte Rüstliste lässt sich nicht wieder trennen (P2, Welle 2) | fachlich: Herkunft nicht mehr eindeutig | Ja — die Positionen tragen aber seit dem Zusammenführen keine Herkunft; mit einem Feld „kam von Tag“ wäre es lösbar. | Lassen; als Idee vermerken, falls der Pilot es meldet. |
| Beim Kopieren eines Einsatzes geht keine Rüstliste mit (E85/P2) | fachlich: Material wird einmal geladen | Ja. | Lassen. |
| Die Rüstliste entsteht an den Folgetagen nicht von selbst (E85) | fachlich, wie oben | Ja. | Lassen. |
| Einsatz über mehrere Tage: höchstens 62 Tage je Speichern (E85) | fachlich: so weit reicht die Prüfung der Abwesenheiten | Nein — die 62 Tage sind eine Festlegung von `wochenplan_abwesend`, kein fachlicher Grund; `app.abwesenheiten` kennt sie nicht. | Niedrige Dringlichkeit: Folgetage direkt gegen `app.abwesenheiten` prüfen, dann entfällt die Zahl. Mit P-2 zusammen ansehen. |
| „Zeit nachtragen“ reicht 14 Tage zurück (P6) | fachlich: weiter zurück über den Korrekturantrag | Ja, solange das Büro den Rest sicher findet — das ist erst mit P-9 der Fall. | Lassen, P-9 bauen. |
| Das Gesamtplan-Abo der Leitung zeigt abwesende Personen weiter (P9) | fachlich: der Konflikt soll auffallen | Ja. Der Eintrag sagt aber nicht, wer fehlt. | Lassen; Idee: „fehlt“ in der Notiz des Eintrags (ohne Grund). |
| Die Projektleitung ohne Leserecht erfährt beim Storno nicht, auf welcher Rechnung (P4) | Datenschutz/Rechte | Ja. | Lassen. |
| Umplanen per Ziehen nur in „Personen“, nicht im Monat und nicht am Handy (E88) | fachlich | Ja (am Handy gibt es die Leiste am Einsatz). | Lassen. |
| Umplanen auf einen Feiertag wird abgewiesen, auch für Notdienst (E88) | Sicherheit: eine Geste soll dort nicht still landen | Ja. | Lassen. |
| Entfernen aus dem Wochenplan mit Rückfrage, ohne „Rückgängig“ (E88) | Daten | Ja. | Lassen. |
| Mehrere Tage, Kopieren, Umplanen, Folgetage nicht im Einblick des Supports (E85, E88, V13) | Datenschutz: Abwesenheiten liest nur der Betrieb | Ja. | Lassen. |
| „Neu eingegangen“ wird im Einblick des Supports nicht als gesehen gemerkt (V9) | Sicherheit | Ja. | Lassen. |
| Die Push-Meldung zu einem Notfall nennt nur Nummer und Ort (V8) | Datenschutz: Sperrbildschirm | Ja. Auffällig daneben: die Einsatzplan-Meldung nennt Kundennamen auf dem Sperrbildschirm (`notifyLogic.ts:672`). | Lassen; die Einsatzmeldung der Kanzlei vorlegen (liegt bei jemand anderem). |
| Am Schein nur das selbst Abgeholte der letzten vierzehn Tage (E89) | Datenschutz, fachlich | Ja; seit V5 kommt „Für diesen Einsatz eingeladen“ dazu. | Lassen. |
| Scheine ohne eigene Nummer, auch in der Suche (E91) | fachlich; Nummernkreis liegt beim Auftraggeber | Ja (Entscheidung offen beim Auftraggeber). | Dem Auftraggeber noch einmal vorlegen: am Telefon mit dem Kunden fehlt eine Nummer zum Nennen. |
| „Wartung erledigt?“ ist ein Vorschlag und bucht nichts von selbst (A9) | fachlich | Ja. | Lassen. |
| Monat bleibt Personen × Tage, „Mein Einsatzplan“ behält seinen Aufbau (E92) | fachlich: Mappe ist Orientierung | Ja. | Lassen. |
| Der Zwischenspeicher der Woche merkt sich auch einen Stand ohne Abwesenheiten (E92) | Ladeverhalten, nicht Gestalt | Nein — „nicht Teil dieses Auftrags“ ist kein Grund nach Grundsatz 6. | Mit P-4 erledigen: ohne Abwesenheiten nichts merken. |
| NEU, bisher unbenannt: höchstens 500 laufende Baustellen in Planung und Startseite | — | Kein Grund vorhanden. | P-3. |
| NEU, bisher nur in der App benannt: „Stunden ohne Buchung“ höchstens 50 bzw. 150 Scheine | Gewicht der Unterschriftsbilder | Nein, entfallen. | P-9. |

---

## 5. Zusammenspiel und Ideen

Fehlende Verknüpfungen und Funktionen, je mit Nutzen und Aufwand. Keine davon entfernt etwas.

1. **Leistungszeit am Schein aus dem, was die App schon weiß.** Heute beginnt
   `LeistungszeitErfassen.tsx` mit „Von 08:00“ und einem frei getippten Namen. Die App
   kennt (a) den laufenden Arbeitstag mit seinem Abschnitt auf dieser Baustelle
   (`src/lib/zeitsitzung.ts`, `Zeitsegment.baustelle`), (b) die Uhrzeit des Einsatzes
   (`zeitVon`/`zeitBis`) und (c) die Mannschaft des Einsatzes (Einsätze liest jeder im
   Betrieb). Vorschlag: „Von“ aus dem Beginn des Abschnitts (sonst aus dem Einsatz), „Bis“
   jetzt; Namen als Auswahl der Eingeteilten, freie Eingabe bleibt. Nutzen: zwei Tipps
   statt sechs, und der Name stimmt mit dem Konto überein — dann findet „Stunden ohne
   Buchung“ (P-9) die Kollegenzeile verlässlich statt an „F. Huber“ zu scheitern. Bleibt
   gleich: was auf dem Schein steht, tippt weiter der Monteur; nichts wird still gebucht.
   Aufwand: klein bis mittel.
2. **Der Wartungseinsatz zeigt dem Monteur die Anlage.** `wartung_einplanen` schreibt
   „Wartung: Anlage · Hinweis“ in die Beschreibung der Baustelle; sichtbar ist sie nur unter
   „Meine Baustellen“ (`MyProjectsView.tsx:212–214`), nicht im Einsatz von heute
   (`HeuteEigene`) und nicht in „Mein Einsatzplan“. Hersteller, Typ, Seriennummer, Baujahr,
   letzte Wartung stehen an der Wartung und sind für den Betrieb lesbar (`wartungen_lesen`).
   Vorschlag: am Einsatz einer Baustelle mit eingeplanter Wartung eine Zeile „Wartung:
   Therme Vaillant, Bj. 2015, zuletzt 03/2025 · Hinweis“; im Schein die Notiz mit der
   Anlage vorbelegt. Nutzen: der Monteur fährt mit dem richtigen Wartungsset. Aufwand: klein.
3. **Fällige Wartungen in „Noch einzuplanen“.** Der Wochenplan sagt selbst: „Fällige
   Wartungen kennt der Wochenplan nicht“ (`Einsatzplanung.tsx:191–196`). Vorschlag: eigene
   Gruppe „Wartungen fällig“ oben in der Schublade (aus `wartungen_faellig_stand`), Ziehen
   auf Person und Tag legt die Baustelle an (`wartung_einplanen`) und öffnet das Formular.
   Nutzen: aus drei Wegen (Wartungen → Baustelle anlegen → Einsatz planen) wird einer.
   Aufwand: mittel. Risiko: die Schublade wird länger — deshalb als einklappbare Gruppe.
4. **Den Kunden zur Wartung einladen und den Termin bestätigen.** Rechnung, Angebot und
   Mahnung gehen per Mail aus der App (F16, `functions/beleg-mail`); die fällige Wartung
   und der eingeplante Einsatz nicht. Vorschlag: an der fälligen Wartung „Kunden
   anschreiben“ (Vorlage je Betrieb, Verlauf an der Wartung), nach dem Einplanen
   „Termin bestätigen“ (Tag, Zeitfenster, Monteur nur auf Wunsch). Nutzen: der planbare
   Umsatz der Wartung hängt am Termin mit dem Kunden; heute verlässt dieser Schritt die
   App. Aufwand: mittel. Vorbehalt: Texte und Einwilligung sind Sache des Betriebs bzw.
   der Kanzlei.
5. **„Noch einzuplanen“ nach Dringlichkeit statt nur nach Name.** Die Liste zeigt alle
   laufenden Baustellen ohne Einsatz in der Woche, alphabetisch. Vorschlag: oben, was einen
   Anlass hat — Wunschtermin aus dem Eingang (A8), Beginn in dieser Woche, eingeplante
   Wartung fällig, „ohne Einsatz in 14 Tagen“ (dieselbe Regel wie die Startseite) —, darunter
   der Rest. Nutzen: bei 60 laufenden Baustellen findet der Planer die fünf, um die es
   geht. Aufwand: klein bis mittel (mit P-3 zusammen). Vorbehalt: Reihenfolge ist auch
   Gewohnheit — als Umschalter „nach Dringlichkeit / nach Name“.
6. **Lieferung und Termin der eigenen Baustelle im Einsatz von heute.** Die Startseite des
   Monteurs zeigt Termine nur als Teilnehmer (`laden.ts:277–280`); die Lieferung „8–10 Uhr“
   auf seiner Baustelle steht in „Mein Einsatzplan“ und im Kalender-Abo, aber nicht im
   Blatt „Dein Einsatz heute“. Vorschlag: eine Zeile am Einsatz. Aufwand: klein.
7. **Die Rüstliste gehört zum Plan der Person.** Ändert das Büro abends die Rüstliste für
   morgen, kommt keine Meldung: der Prüfwert des Plans (`app.einsatz_planstand`) kennt nur
   Einsatz und Termin. Vorschlag: Zahl und Stand der Positionen in den Prüfwert, Text
   „Rüstliste geändert“. Aufwand: klein. Vorbehalt: nicht bei jedem Haken eines Kollegen —
   nur bei Änderungen der Positionen.
8. **Fahrzeug je Einsatz.** Es gibt das eigene Standardfahrzeug und Poolfahrzeuge als
   Lagerorte (`RuestlisteAbhaken.tsx:78–85`), aber keine Planung, welcher Bus wohin fährt;
   zwei Mannschaften, die denselben Poolbus brauchen, fallen nirgends auf. Vorschlag:
   optionales Feld „Fahrzeug“ am Einsatz (nur mit Modul Lagerorte), Warnung bei doppelter
   Belegung, Vorschlag beim Abhaken. Aufwand: mittel bis groß. Vorbehalt: nur für Betriebe
   mit Poolfahrzeugen von Nutzen — Einstellung je Betrieb, vorher den Pilotbetrieb fragen.
9. **Schein „im Büro geprüft“.** „Neu eingegangen“ ist ein persönlicher Merker (wer hat es
   gesehen), kein Arbeitsstand: sieht die Projektleitung die Liste an, ist sie für sie
   leer, ohne dass jemand Stunden und Material geprüft hat. Vorschlag: Haken „geprüft“
   (wer, wann) am unterschriebenen Schein, Filter „ungeprüft“; die Rechnung schlägt wie
   bisher vor. Aufwand: mittel. Vorbehalt: ein weiterer Zustand — nur als Einstellung je
   Betrieb, sonst mehr Arbeit ohne Nutzen.

---

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| P1 Formular wird nicht mehr zurückgesetzt | `EinsatzFormular.tsx:705–907` (Grundlage, `PaarGeaendert`, `eigenesSpeichern`), `20261115500000_einsatz_fassung.sql` (Paarsperre, `SL409`) | hält |
| P2 Rüstliste geht mit, Helfer-Kennzeichen von der neuen Person | `20261116010000_einsatz_ruestliste_mit.sql` ganz gelesen; Aufrufer `Einsatzplanung.tsx:238–271`, `:773–800`, `AssignmentsView.tsx:600–629` | hält |
| P3 „Nicht verrechnet“ über alle Scheine | `laden.ts:577–584`, Kern `20261116010200…sql:283–345` | hält; aber eine zweite Regel im Abschluss der Baustelle (P-10) |
| P5 Zweiter Schein am selben Tag | `20261116010300_schein_vorbereiten_ohne_doppelte.sql:60–110`, `WorkSheetView.tsx:631–687`, `:934–967` | hält |
| P6 „Zeit nachtragen“ ohne feste Zahl | `workSheets.ts:224–240`, `laden.ts:426–431` | hält; das Gegenstück im Büro nicht (P-9) |
| P7 Je Person eigene Aufgabe und Uhrzeit | `EinsatzFormular.tsx:698–703`, `:732–756` | hält im Formular; die Zusammenfassungen zeigen nur die erste Uhrzeit (P-11) |
| P8 „Ohne Einsatz“ aus einer Funktion | `20261116010400…sql:30–55`, `laden.ts:733–735`, `20261118033000…sql:75` | hält |
| P9 Abwesenheit an einer Stelle | `app.abwesenheiten`, `kalender_abruf`, `wochenTermine.ts:29–41`, `laden.ts:818–850` | hält für Kalender-Abo, Lieferung, Auslastung; hält nicht für „Mein Einsatzplan“ und die Startseite des Monteurs in zwei Fällen (P-2) |
| V1 Betroffene Einsätze bei Abwesenheit | `EingeteiltHinweis.tsx`, `laden.ts:774–787` | hält für Einsätze; Termine fehlen (P-6) |
| V8 Meldung bei Terminen | `20261116010800…sql:72–108` (Auslöser), `push_einsatz` | hält; Reichweite wie beim Einsatz (P-7) |
| V9 „Neu eingegangen“ | `20261116010900…sql:40–90`, `WorkSheetsListView.tsx:750–757` | hält |
| V12 Leitung einplanbar | `src/lib/permissions.ts:235–242`, `useWochenDaten.ts:280–287` | hält (nur App-Seite gelesen) |

---

## 7. Nicht angesehen

- Darstellung im Browser: keine Seite geöffnet, kein Durchklick; `WochenRaster`,
  `HandyWoche`, `MonatsAnsicht`, `MonatsVorschau`, `MonatsKalender`, `TagFenster`, `TeamWoche`,
  `useZiehen`, `mitrollen.ts` nur über ihre Aufrufe.
- Rüstliste im Einzelnen: `RuestlistePlanen`, `RuestlisteAbhaken`, `materialDeckung.ts`,
  `ruestliste_speichern`; `laden_umschalten` nur den Buchungsteil.
- `worksheetPdf.ts`, `shared/scheinHash.ts` gegen `app.schein_hash` (Gleichheit der beiden
  Rechnungen nicht nachgeprüft), `Fotostreifen`, `fotos.ts`, Speicherregeln des Eimers
  `scheinfotos`, `VerbrauchAmSchein`, `MaterialErfassen`, `abgeholtVorschlaege`, `scheinSuche`.
- `push-melden/index.ts` bis auf den Zweig des Einsatzplans; `src/lib/push.ts`;
  `KalenderAboKarte`, `kalender_abo_anlegen/beenden`, `app.termin_fuers_abo`.
- `einsatz_folgetage` und `einsatz_folgetage_entfernen` nur auf Zeitraum und
  Abwesenheitsprüfung; `FolgetageWahl`, `VerschiebenFenster`.
- Startseite: `regeln.ts` nur stellenweise; `DashboardView.tsx`, `HeuteLeitung.tsx` (E98),
  `StartseiteAnpassen`, `einrichtung.ts`, Blöcke Lager, Buchhaltung, Team, Einstellungen
  nur soweit sie Scheine und Einsätze betreffen.
- `TermineKarte`, `TerminFenster`, `TerminListe`; Termine in Baustellen- und Kundenakte.
- `WartungenView.tsx` nur Laden, Speichern, Einplanen, Erledigt; `WartungVerlauf`,
  `wartung_erledigt_vorschlaege`, `wartungen_faellig_stand` nur über ihre Verwendung.
- Keine Messung von Laufzeiten; Zahlenbeispiele sind gerechnet.
