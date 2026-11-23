# Zeit und Personal — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. Nur gelesen. Pfade relativ zu `/workspace/Prototype-App-Installateure`.

Zusätzlich zum Lesen, alles außerhalb des Repositorys (Ordner `scratchpad/audit/Z/`, nichts im Repo geändert):

- zwei Wegwerf-Prüfungen gegen die echten Rechenfunktionen (`vitest` mit eigener Konfiguration):
  `grenzfaelle` (Wochenruhe) und `calcMonthStats`/`urlaubsStand` (Wiedereintritt). Die Zahlen stehen bei Z-5 und im Abschnitt 3.
- ein Skript, das alle 358 Migrationen der Reihe nach liest und meldet, wo eine Funktion **nach** einem
  Textersatz (`pg_get_functiondef` + `replace`) noch einmal vollständig neu definiert wird. Ein Treffer im ganzen
  Repository, siehe Z-2.

Nichts lief gegen eine Datenbank. Wo ein Befund an einer Datenbankfunktion hängt, ist er an der **letzten** Fassung
gelesen; bei Funktionen, die per Textersatz geändert werden, sind alle späteren Migrationen mitgelesen. Die letzte
Fassung jeder zitierten Funktion ist ohne Rücksicht auf Groß- und Kleinschreibung gesucht (`grep -lin`); für die 26
zitierten Funktionen ergibt das dieselbe Datei wie die Suche mit Kleinschreibung.

## 1. Angesehen

Abläufe von Anfang bis Ende:

- **Zeit buchen → prüfen → Monat abschließen → Lohn:** `TimeView`/`TimeForm` (nur die Stellen zu Abschluss, Entwurf,
  Korrekturantrag), Ausgangsfach (`src/lib/sync/supabaseSender.ts`), Timer (`src/lib/zeitsitzung.ts`,
  `zeit_timer_befehl`), Korrekturantrag (`20261108600000`, `20261110140000`), Monatsabschluss (`20261116022000`,
  `AccountingView.tsx`, `MonatsabschlussEinstellung.tsx`), Monats-CSV (`export.ts`), und was die Rechnung mit
  Zeitbuchungen macht (`rechnung_anlegen`, `rechnung_stornieren`, `rechnung_storno_aufheben`, `baustelle_umnummern`).
- **Zeitkonto:** `src/lib/time.ts` ganz (Saldo, Monatsauswertung, Pflichttage, Urlaubsstand), `zeitkonto_salden`,
  `app.zeitkonto_rechnung`, Zwischenstände (`20261117012000`), Arbeitszeit ab einem Tag (`20261116020000`).
- **Urlaub:** Antrag (`VacationsView.tsx`), `urlaub_entscheiden` (letzte Fassung `20261116030000`), `urlaub_kuerzen`
  (`20261116031000`), Übertrag/Verjährung/Stichtag, Urlaubsjahr, Anspruch je Jahr, Aliquotierung
  (`shared/urlaubAliquot.ts`).
- **Krank, Sonderurlaub, Pflegefreistellung:** `krankmeldung_speichern` (`20261110140100`), die Auslöser an
  `krankmeldungen` (`20260928110000`, `20260930180000`), `shared/freistellung.ts`, `freistellung_beantragen`
  (`20261102100000`).
- **Arbeitsrecht in der Rechnung:** `arbeitszeitGrenzen.ts` (AZG, ARG, KJBG) ganz, `ueberstunden.ts`, `lohnregeln.ts`,
  `shared/feiertage.ts`, `shared/arbeitszeit.ts`.
- **Personal:** Austritt, Deaktivieren, Wiedereintritt (`BenutzerakteView.tsx`, `20261113100000`, `20261116021000`),
  `ArbeitszeitVerlaufKarte.tsx`, wer ein Zeitkonto führt (`permissions.ts`).

Ohne Befund geblieben (gelesen und für richtig befunden): die 13 gesetzlichen Feiertage samt Osterrechnung; die
Grenzwerte in `arbeitszeitGrenzen.ts:103–117` gegen AZG § 9, § 11, § 12, ARG §§ 3, 4 und KJBG §§ 11, 15, 16, 17, 19;
die Regeln der Überstunden nach KV Metallgewerbe so, wie sie im Kopf von `ueberstunden.ts` stehen; die Verjährung
nach zwei Jahren (`time.ts:144`); die Einordnung der Serverantworten im Ausgangsfach.

## 2. Befunde (belegt)

### Z-1 Mit eingeschaltetem Monatsabschluss lässt sich für Stunden eines abgeschlossenen Monats keine Rechnung mehr ausstellen oder stornieren

- Art: Fehler
- Schwere: hoch — trifft jeden Betrieb, der den Monatsabschluss einschaltet, bei der ersten Regierechnung über
  Stunden des Vormonats; die Buchhaltung steht vor einer Meldung, die nicht zu ihrem Handgriff passt.
- Beleg:
  - `supabase/migrations/20261116022000_monatsabschluss.sql:80–109` — der Auslöser `time_entries_abgeschlossen`
    feuert bei **jedem** `UPDATE` einer Zeile in einem abgeschlossenen Monat, ohne zu fragen, was sich ändert.
    Ausgenommen sind nur der Dienstschlüssel und der Merker `app.monatsabschluss_korrektur` (Zeile 88), den allein
    `zeit_korrektur_entscheiden` setzt.
  - `supabase/migrations/20261116050400_leistungsnachweis_im_beleg.sql:206–210` — `rechnung_anlegen` setzt beim
    Ausstellen `is_billed = true, invoice_number = …` an jeder verrechneten Zeitbuchung.
  - `supabase/migrations/20260926101000_rechnung_nur_ueber_funktionen.sql:246–249` (Storno) und
    `20261106300000_wartung_abdeckung.sql:778–781` (Storno aufheben) schreiben dieselben zwei Spalten;
    `20261012200000_verlaeufe.sql:594` (`baustelle_umnummern`) schreibt `project_number` an allen Buchungen der
    Baustelle. „Storno und neu ausstellen“ ruft das Storno auf (`20261116050700_rechnung_ersetzen.sql:81`) und
    scheitert damit ebenso.
  - Der Wächter zum Austritt macht es vor: er lässt eine Änderung durch, solange Tag und Person bleiben
    (`20261113100000_austritt.sql:45–48`).
  - `tests/supabase/monatsabschluss.test.ts:37–103` — neun Prüfungen, keine mit einer Rechnung.
- Auswirkung: Oktober wird am 5.11. nach dem Lohnexport abgeschlossen. Am 10.11. stellt die Buchhaltung die
  Regierechnung über die Oktoberstunden aus und bekommt „Der Monat 10/2026 ist abgeschlossen — Änderungen nur über
  einen Korrekturantrag“. Ausweg ist nur, den Monat mit Grund zu öffnen und wieder zu schließen. Ebenso scheitern das
  Stornieren einer Rechnung mit Oktoberstunden und das Umnummern einer Baustelle, auf die im Oktober gebucht wurde.
- Vorschlag: Der Abschluss schützt die Arbeitszeitaufzeichnung, nicht den Verrechnungsstand.
  - Neue Migration: `app.monat_abgeschlossen_sperre()` lässt ein `UPDATE` durch, wenn sich außer `is_billed`,
    `invoice_number` und `updated_at` nichts ändert (Vergleich `to_jsonb(new) - Spalten = to_jsonb(old) - Spalten`,
    damit eine später hinzukommende Spalte von selbst gesperrt bleibt). Für `baustelle_umnummern` ein eigener Merker
    (`set_config('app.monatsabschluss_umnummern','an',true)`, nur in dieser Funktion), der zusätzlich
    `project_number` freigibt. Funktion bleibt `security definer`, `set search_path = ''`, ohne `grant`.
  - Prüfung in `monatsabschluss.test.ts`: Rechnung über Stunden eines abgeschlossenen Monats ausstellen, stornieren,
    Storno aufheben, Baustelle umnummern. Gegenprobe: ohne die Migration rot mit 23514.
  - Was gleich bleiben muss, je mit eigener Prüfung: im abgeschlossenen Monat ändert weiterhin niemand Tag, Uhrzeit,
    Pause, Stand, Baustelle, Kommentar, Nacht/Notdienst; Anlegen und Löschen bleiben gesperrt; ausgeschaltet ändert
    sich nichts.
  - Risiko des Umbaus: eine zu weite Ausnahme wäre ein Loch im Abschluss. Deshalb die Ausnahme als feste, kurze
    Spaltenliste und nicht als „alles außer Zeit“.
- Aufwand: klein

### Z-2 Urlaub genehmigen und kürzen rechnen wieder mit den heutigen Arbeitstagen — Rückfall hinter Z3

- Art: Fehler (Rückfall eines ✔-Punktes)
- Schwere: hoch für jede Person, deren Arbeitstage sich ändern (Teilzeit, Elternteilzeit, Vier-Tage-Woche): falsche
  Zahl der Urlaubstage, Lücken im Zeitkonto. Ohne Änderung der Arbeitstage unauffällig — deshalb nicht bemerkt.
- Beleg:
  - `supabase/migrations/20261116020000_arbeitszeit_verlauf.sql:728–730` stellt `urlaub_entscheiden` per Textersatz
    auf `app.urlaubstage_person(…)` um (die Arbeitstage jedes einzelnen Tages).
  - `supabase/migrations/20261116030000_za_nichts_zu_genehmigen.sql:16–155` definiert die Funktion danach vollständig
    neu, mit dem Rumpf von vor dem Textersatz: Zeile 74–75 liest `users.work_days` und ruft `app.urlaubstage(…)`.
    Keine spätere Migration fasst die Funktion noch an.
  - `supabase/migrations/20261116031000_urlaub_kuerzen.sql:159, 168, 191, 233, 261` — `urlaub_kuerzen` rechnet von
    Anfang an mit `users.work_days`.
  - Die App rechnet die Vorschau mit dem Verlauf (`src/lib/time.ts:61–77`, `VacationsView.tsx:485–488`).
  - Die einzige Datenbankprüfung dazu geht über `urlaub_eintragen` (`tests/supabase/zeitkontoSaldo.test.ts:170–183`),
    nicht über den Antrag.
- Auswirkung: Die Monteurin arbeitet fünf Tage, ab 1.1. sind vier Tage (Montag bis Donnerstag) vorgemerkt. Sie
  beantragt 4.–8.1.; die Maske sagt drei Urlaubstage (6.1. ist Feiertag). Beim Genehmigen bucht die Datenbank auch den
  Freitag: vier Tage vom Anspruch, einer davon an einem Tag ohne Soll. Umgekehrt (heute drei Tage, ab März fünf)
  bleiben Donnerstag und Freitag ohne Urlaub: zwei Lücken, zweimal Tagessoll im Minus.
- Vorschlag:
  - Neue Migration: `urlaub_entscheiden` und `urlaub_kuerzen` über die Person statt über `work_days`
    (`app.urlaubstage_person((select u from public.users u where u.id = a.user_id), …)`), sonst Wort für Wort gleich.
  - Prüfung `urlaubMitVerlauf.test.ts`: Antrag über den Tag einer vorgemerkten Änderung genehmigen, kürzen,
    zurücknehmen; gebuchte Tage und `vacations.tage` stimmen mit der Vorschau der App überein. Gegenprobe: ohne die
    Migration rot.
  - Wächter (siehe Z-15), damit derselbe Rückfall nicht wieder entsteht.
  - Was gleich bleiben muss: Personen ohne Verlauf bekommen dieselben Tage wie heute
    (`app.urlaubstage_person` liefert ohne Verlauf dasselbe, Kommentar `20261116020000:674–677`); schon genehmigte
    Anträge werden nicht neu gerechnet (Altdaten).
  - Risiko: gering; betroffen ist nur die Tagesliste.
- Aufwand: klein

### Z-3 Das Zeitkonto kennt keinen Abgang außer Zeitausgleich — ausbezahlte Überstunden bleiben für immer im Gesamtsaldo

- Art: Lücke
- Schwere: hoch — betrifft jeden Betrieb, der Überstunden auszahlt (monatlich, zum Jahresende oder beim Austritt). Im
  Modell „Tagesgrenze“ ist es die Regel, nicht die Ausnahme.
- Beleg:
  - `supabase/migrations/20261116020000_arbeitszeit_verlauf.sql:983–1014` — `zeitkonto_salden` rechnet Anfangssaldo
    + Ist + Gutschrift − Soll; mehr geht nicht ein. Ebenso `src/lib/time.ts:867–930`.
  - `src/features/accounting/export.ts:301, 350` — im Modell „Tagesgrenze“ weist die Monats-CSV die Stunden über der
    Tagesgrenze als „Überstunden 50 %/100 %“ für die Auszahlung aus; `src/features/settings/LohnregelnKarte.tsx:191–193`
    sagt es so. Der Gesamtsaldo hängt nicht am Modell (kein Aufrufer von `ueberstundenModell` außerhalb von Export
    und Einstellung).
  - Im ganzen Repository gibt es keine Tabelle und keine Funktion für eine Auszahlung oder Berichtigung des
    Zeitkontos (Suche nach „auszahl“, „ausbezahlt“, „Saldo berichtig“ ohne Treffer in `src` und Migrationen). Für den
    Urlaub gibt es das Gegenstück (`urlaubsanspruch_anpassungen`).
- Auswirkung: Der Betrieb zahlt im Dezember 40 Überstunden aus. In der App steht weiter „+40:00“ — in der
  Mitarbeiterübersicht, auf der Startseite des Monteurs und als „Zeitguthaben“ beim Antrag auf Zeitausgleich. Der
  Monteur beantragt eine Woche Zeitausgleich aus Stunden, die schon bezahlt sind. Der einzige Weg heute ist, den
  Start-Saldo umzuschreiben: ohne Datum, ohne Vermerk, und er heißt danach nicht mehr, was er war.
- Vorschlag: Buchungen am Zeitkonto mit Datum, nach dem Muster der Urlaubsanpassungen.
  - Migration: Tabelle `zeitkonto_buchungen` (`company_id`, `user_id`, `tag`, `minuten` mit Vorzeichen, `art`
    in „ausbezahlt“, „berichtigt“, `vermerk`, `von_uid`, `von_name`, `am`), Lesen für die Person selbst und das Büro
    (`company_id = (select app.lesebetrieb())`, Rollen als `(select …)`), Schreiben nur über
    `zeitkonto_buchung_eintragen` / `_entfernen` (`security definer`, `set search_path = ''`, `revoke … from public,
    anon`, `grant execute … to authenticated`; Buchhaltung, Geschäftsführung, Administration). `zeitkonto_salden`
    und `zeitkonto_monate` nehmen die Summe als eigene Spalte auf; der Zwischenstand
    (`app.zeitkonto_monatsstand`) bleibt unberührt, weil die Buchungen neben der Monatsrechnung stehen. Datenauskunft
    (`person_auskunft`) und Löschung einer Person ergänzen. Mit Monatsabschluss: eine Buchung in einem
    abgeschlossenen Monat wird abgewiesen.
  - App: `calcOverallSaldo` bekommt die Buchungen als weiteren Eingang; `PersonFenster` zeigt unter dem Gesamtsaldo
    „darin ausbezahlt −40:00“ mit der Liste und dem Handgriff „Auszahlung eintragen“; die Zeiterfassung des Monteurs
    nennt die letzte Auszahlung. Monats-CSV: Spalten „Ausbezahlt(Std)“ und „Zeitkonto am Monatsende(Std)“ hinten
    angehängt.
  - Im Modell „Tagesgrenze“: beim Abschließen des Monats (Z-7) der Vorschlag „Überstunden des Monats als ausbezahlt
    buchen“ je Person, vorbelegt mit 50 % + 100 % (+ Mehrarbeit), zum Bestätigen — nicht von selbst.
  - Prüfung: `zeitkontoBuchungen.test.ts` (Saldo App = Saldo Datenbank mit und ohne Buchungen über den Bestand
    `zeitkontoBestand.ts`; Monteur schreibt nicht; abgeschlossener Monat). Gegenprobe: ohne Migration rot.
  - Was gleich bleiben muss: ohne Buchung ist jeder Saldo auf die Minute der von heute (`gesamtsalden.test.ts`,
    `zeitkontoZwischenstand.test.ts` bleiben unverändert grün); die CSV-Spalten davor bleiben an ihrer Stelle
    (Byte-Referenzen).
  - Risiko: zweiter Eingang in eine Zahl, die auf den Lohnzettel geht — deshalb in App und Datenbank an je einer
    Stelle und gegen denselben Bestand geprüft.
- Aufwand: groß

### Z-4 Die 14-Tage-Grenze für rückwirkende Krankmeldungen lässt sich über „Ende ändern“ umgehen — und das Büro erfährt nichts

- Art: Fehler (Rechte)
- Schwere: mittel — wer es weiß, schreibt sich beliebig alte, nicht gebuchte Tage als „Krank“ gut; im Alltag
  entsteht derselbe Zustand auch aus Versehen.
- Beleg:
  - `supabase/migrations/20260928110000_krankmeldung_rueckwirkend.sql:32–34` — die Grenze prüft nur einen **Beginn**,
    der nach vorne rückt; ein `UPDATE` mit gleichem Beginn geht immer durch.
  - `supabase/migrations/20260930180000_kunden_und_krankmeldungen.sql:91–118` — bei einer begonnenen Meldung ist nur
    der Beginn fest, das Ende frei.
  - `src/features/vacations/Krankmeldungen.tsx:199–206, 214–225` — „Ende ändern“ an jeder eigenen Meldung, Feld nur
    mit `min`, ohne obere oder zeitliche Grenze; die Liste zeigt die letzten 30 eigenen Meldungen
    (`src/lib/db/pg/abwesenheiten.ts:37`).
  - `supabase/migrations/20260924130000_abwesenheit_push.sql:57–60` — eine Meldung an das Büro gibt es nur beim
    Anlegen, nicht beim Ändern.
- Auswirkung: Krankmeldung 1.–2.9.; vom 15. bis 19.9. fehlen Buchungen. Am 23.11. setzt der Monteur das Ende der
  alten Meldung auf den 19.9.: alle nicht gebuchten Arbeitstage dazwischen werden „Krank“ mit Gutschrift des
  Tagessolls. Genau das wollte die 14-Tage-Regel verhindern (Kopf der Migration: „ohne dass es jemand sah“). In die
  andere Richtung nimmt ein gekürztes Ende Krank-Tage längst exportierter Monate weg.
- Vorschlag:
  - Migration: `app.krank_rueckwirkend_pruefen()` prüft für die Person selbst auch das Ende: geändert werden dürfen
    nur Tage ab „heute − 14“ (der kleinere von altem und neuem Ende + 1 darf nicht vor der Grenze liegen). Büro und
    Dienstschlüssel bleiben außen vor wie bisher. Die Meldung sagt, wer den Rest einträgt.
  - `Krankmeldungen.tsx`: `min` des Feldes entsprechend, der Hinweis darunter nennt die Grenze.
  - Push „Krankmeldung geändert“ an das Büro bei geändertem Zeitraum (`push_bei_abwesenheit` auch `after update of
    von, bis`), Text ohne Anlass wie bisher.
  - Prüfung in `krankmeldungRueckwirkend`-Test: altes Ende verlängern und kürzen wird abgewiesen. Gegenprobe rot ohne
    Migration. Gleich bleiben muss (eigene Prüfung): wer seit drei Wochen krank ist, verlängert weiter selbst; wer
    früher gesund ist, kürzt die laufende Meldung; das Büro ändert alles.
  - Risiko: eine laufende, lange Meldung darf nicht ausgesperrt werden — deshalb zählt nur der Abschnitt, der sich
    ändert, nicht der Beginn.
- Aufwand: klein

### Z-5 Der Wiedereintritt überschreibt Eintritt und Saldo-Start — die Monate des ersten Dienstverhältnisses verlieren ihr Soll

- Art: Fehler
- Schwere: mittel — selten (Wiedereinstellung, Saisonkraft), aber dann stimmen nachträglich erzeugte Lohnunterlagen
  des ersten Dienstverhältnisses nicht mehr.
- Beleg:
  - `src/features/users/BenutzerakteView.tsx:566–572` — „Aktivieren“ nach einem vergangenen Austritt schreibt
    `eintritt` und `appStartDate` auf den Tag der Rückkehr.
  - `src/lib/time.ts:1460–1467` — Pflichttage gibt es erst ab `appStartDate`; `src/lib/time.ts:434–436` — der Schnitt
    am Startdatum beim Urlaub gilt nur mit Anfangsbestand.
  - Nachgerechnet (Wegwerf-Prüfung): Dienstverhältnis 1.1.–30.6.2026, Juni voll gebucht. Vor dem Wiedereintritt
    Juni: Ist 168, Soll 168, Saldo 0 Std. Nach dem Wiedereintritt am 1.10.: Ist 168, **Soll 0, Saldo +168 Std.**
    Urlaub: zehn Tage im März des ersten Dienstverhältnisses, „Urlaub im ersten Jahr“ leer („leer = voller
    Anspruch“): Rest **15 statt 25** — der Urlaub von vorher zählt gegen den neuen Anspruch.
- Auswirkung: Die Kanzlei verlangt im November noch einmal die Juni-Datei oder den Stundennachweis der ersten
  Jahreshälfte: die Person steht mit Soll null und 168 Plusstunden darin. Der neue Urlaubsanspruch ist um die schon
  abgerechneten Tage zu klein, ohne dass die Maske es sagt.
- Vorschlag: Dienstverhältnisse als Verlauf, nach dem Muster von `arbeitszeit_verlauf`.
  - Migration: `users.beschaeftigung_verlauf` (je Abschnitt Eintritt, Austritt, Saldo-Start, Start-Saldo,
    Start-Urlaub), geschrieben nur über `wiedereintritt_eintragen` (Geschäftsführung, Administration; Regeln wie in
    CLAUDE.md). Leer heißt wie heute: die Spalten der Zeile gelten. `app.zeitkonto_rechnung` und `pflichtTage` rechnen
    je Abschnitt; Saldo und Urlaubsstand gelten für den laufenden Abschnitt, ältere Monate rechnen mit ihrem.
  - Bis dahin (klein, sofort): der Dialog sagt, was geschieht („Monate vor dem … zeigen danach kein Soll mehr“), und
    das Feld „Urlaub im ersten Jahr“ ist beim Wiedereintritt im selben Urlaubsjahr Pflicht statt „leer = voller
    Anspruch“.
  - Prüfung: `wiedereintritt.test.ts` (Monatsauswertung und CSV eines Monats vor dem Austritt sind nach dem
    Wiedereintritt zeichengleich; Rest im Jahr der Rückkehr ohne die Tage von vorher). Gegenprobe rot ohne Umbau.
  - Was gleich bleiben muss: Personen ohne Wiedereintritt rechnen unverändert (`arbeitszeitVerlauf.test.ts`,
    `austrittSaldo.test.ts`); die Lücke zwischen Austritt und Rückkehr bleibt ohne Soll (Z2).
  - Risiko: der Verlauf berührt Saldo, Urlaub und Pflichttage zugleich; ohne den gewachsenen Testbestand nicht
    anfassen.
- Aufwand: mittel (der Hinweis: klein)

### Z-6 Im abgeschlossenen Monat geht über den Korrekturantrag nur das Ändern einer bestehenden Buchung — die Texte sagen mehr zu

- Art: Lücke (und gebrochene Zusage zweier Texte)
- Schwere: mittel — der häufigste späte Fall ist der vergessene Tag, und genau der hat keinen Weg.
- Beleg:
  - `supabase/migrations/20261108600000_zeitkorrekturen.sql:2–6, 25–30` — ein Antrag hängt an einer bestehenden
    eigenen Buchung (`eintrag_id uuid not null`).
  - `supabase/migrations/20261110140000_abwesenheiten_ohne_umweg.sql:51–72` — „umgesetzt“ ändert nur unverrechnete
    Buchungen mit Stand „Anwesend“ oder „Zeitausgleich“; für eine gelöschte Buchung verlangt es einen Löscheintrag
    im Protokoll, den es im abgeschlossenen Monat nicht geben kann.
  - Zugesagt wird: „Wer noch etwas ändern muss, stellt einen Korrekturantrag“
    (`src/features/settings/MonatsabschlussEinstellung.tsx:49`, `AccountingView.tsx:1480`) und „Änderungen nur über
    einen Korrekturantrag“ (`20261116022000_monatsabschluss.sql:95`).
- Auswirkung: Der Monteur merkt am 8.11., dass der 14.10. fehlt. Buchen: abgewiesen, mit dem Hinweis auf den
  Korrekturantrag. Den gibt es nur an einer Zeile — der Tag hat keine. Ebenso: eine doppelte Buchung löschen, eine
  Krankmeldung nachtragen, und das Büro selbst (es kann für fremde Buchungen keinen Antrag stellen). Bleibt
  anrufen und den Monat öffnen lassen.
- Vorschlag:
  - Der Antrag bekommt die Arten „Nachtrag“ (ohne `eintrag_id`, mit den gewünschten Angaben als Entwurf) und
    „Löschen“. `zeit_korrektur_entscheiden` legt beim Umsetzen an bzw. löscht, unter demselben Merker wie heute.
    Der eindeutige Index „ein offener Antrag je Buchung“ bleibt für Änderungen; für Nachträge ein offener je Person
    und Tag.
  - `TimeView`: an einem Tag im abgeschlossenen Monat steht statt „Zeit erfassen“ „Nachtrag beantragen“ (dasselbe
    Formular, anderer Knopf); in der Zeile neben „Korrektur beantragen“ auch „Löschen beantragen“.
  - Die drei Texte sagen bis dahin, was gilt.
  - Prüfung: `monatsabschluss.test.ts` (Nachtrag und Löschen im abgeschlossenen Monat über den Antrag; ohne Antrag
    weiter abgewiesen). Gegenprobe rot. Gleich bleiben muss: der bestehende Änderungsantrag samt seiner Sperren
    (verrechnet, Antrag, Meldung), Modul aus = kein Antrag.
  - Risiko: der Antrag wird zum zweiten Buchungsweg — jede Prüfung des normalen Wegs (Überschneidung, Jugendschutz,
    Eintritt/Austritt) muss beim Umsetzen greifen; sie sitzen als Auslöser an der Tabelle und tun das.
- Aufwand: mittel

### Z-7 „Monat abschließen“ prüft und zeigt nichts — offene Anträge mit Tagen im Monat hängen danach fest

- Art: Lücke
- Schwere: mittel — fällt erst nach dem Abschluss auf und kostet dann ein Öffnen mit Grund.
- Beleg: `src/features/accounting/AccountingView.tsx:1475–1491` — der Dialog trägt einen festen Text;
  `zeit_monat_abschliessen` (`20261116022000_monatsabschluss.sql:112–140`) prüft Rolle, Einstellung und „vergangener
  Monat“, sonst nichts. Ein Urlaubs-, Zeitausgleichs- oder Sonderurlaubsantrag mit Tagen im Monat lässt sich danach
  nicht mehr genehmigen, weil das Genehmigen Zeilen in `time_entries` anlegt (Auslöser Zeile 80–101). Ein beendeter,
  nicht gebuchter Arbeitstag (Timer) lässt sich nicht mehr buchen. Einen Vermerk, wer den Monat wann exportiert hat,
  gibt es nicht.
- Auswirkung: Die Buchhaltung schließt den Oktober. Zwei Monteure haben für den 30./31.10. Zeitausgleich beantragt,
  einer hat den Arbeitstag vom 29.10. gestoppt, aber nicht gebucht. Alles drei scheitert ab jetzt mit „Monat
  abgeschlossen“.
- Vorschlag: „Monat fertig machen“ als ein geführter Schritt in der Mitarbeiterübersicht.
  - Neue Funktion `zeit_monat_stand(p_monat)` (lesend, Rollen wie der Abschluss): Personen mit Tagen ohne Buchung,
    offene Korrekturanträge, offene Urlaubs-/Zeitausgleichs-/Sonderurlaubsanträge mit Tagen im Monat, beendete
    Arbeitstage ohne Buchung, Fälle der Arbeitszeitgrenzen ohne Begründung — je als Zahl mit Sprung an die Stelle.
  - Der Dialog zeigt diese Liste; Abschließen bleibt möglich (das Büro entscheidet), aber nicht blind.
  - Nach dem Abschluss bietet die Meldung „Monats-CSV herunterladen“ an; der Export eines abgeschlossenen Monats
    trägt in der ersten Zeile „abgeschlossen am … von …“.
  - Prüfung: Komponentenprüfung des Dialogs und eine Datenbankprüfung je Zähler. Gegenprobe: ohne Funktion keine
    Liste. Gleich bleiben muss: Abschließen und Öffnen wie heute, die CSV ohne Abschluss zeichengleich.
  - Risiko: gering, rein lesend; die Zähler dürfen keine fremden Gesundheitsdaten nennen (nur Zahl und Person, kein
    Anlass).
- Aufwand: mittel

### Z-8 „Krank ab Mittag“ lässt sich nicht abbilden — der Tag bleibt um die fehlenden Stunden im Minus

- Art: Lücke
- Schwere: mittel — kommt in jedem Betrieb mehrmals im Jahr vor; der Saldo jeder betroffenen Person ist um Stunden
  zu niedrig, oder das Büro trägt erfundene Arbeitszeit ein.
- Beleg: „Krank“ ist nur ganztägig (`shared/arbeitszeit.ts:79–84`) und entsteht nur über die Krankmeldung; die legt
  an Tagen mit einer Buchung nichts an (`20261110140100_krank_im_urlaub.sql:263–269`), und ein ganztägiger Stand
  duldet keine Arbeit daneben (`20261027100000_arbeit_am_schultag.sql:51–65`, letzte Fassung von `app.ganzer_tag_allein`).
- Auswirkung: Der Monteur arbeitet von 7 bis 11 Uhr und geht krank heim. Der Tag steht mit 4 Stunden Arbeit und
  4 Stunden Minus da; für die restlichen Stunden besteht Entgeltfortzahlung. Die Meldung „bis morgen“ überspringt den
  heutigen Tag still („1 Tag übersprungen“).
- Vorschlag: der Krank-Tag neben Arbeit, mit derselben Regel wie der Berufsschultag mit Arbeit danach
  (`schultagGutschriftMin`, `shared/arbeitszeit.ts:150–157`).
  - Am **ersten** Tag einer Krankmeldung darf „Krank“ neben „Anwesend“ stehen; gutgeschrieben wird, was die Arbeit
    vom Tagessoll offen lässt (`max(0, Soll − Arbeit)`). In `shared/arbeitszeit.ts`, `calcOverallSaldo`,
    `calcMonthStats` und `app.zeitkonto_rechnung` an je der Stelle, an der heute der Schultag steht;
    `app.ganzer_tag_allein` lässt „Krank + Anwesend“ nur zu, wenn die Zeile aus einer Krankmeldung stammt und ihr
    erster Tag ist. `krankmeldung_speichern` legt den ersten Tag dann an statt ihn zu überspringen. Die Monats-CSV
    zählt den Tag als Krank-Tag und weist die Stunden wie beim Schultag aus.
  - Prüfung: `krankAbMittag.test.ts` (App = Datenbank; Saldo des Tages 0 bei 4 Std. Arbeit; kein Plus, wenn die
    Arbeit das Soll schon erfüllt). Gegenprobe rot. Gleich bleiben muss: ein ganzer Krank-Tag rechnet wie heute
    (`gutschriftSolltag.test.ts`), an späteren Tagen der Meldung bleibt „Krank“ allein, Arbeitszeitgrenzen zählen
    nur die Arbeit.
  - Risiko: die Regel steht an vier Stellen (App zweimal, Datenbank, CSV); der Rechenstand der Zwischenstände
    (`app.zeitkonto_rechenstand`) ändert sich und alle Monate rechnen einmal neu — gewollt.
- Aufwand: mittel

### Z-9 Sonderurlaub, Pflegefreistellung und unbezahlten Urlaub kann nur die Person selbst eintragen, und nur für neun feste Anlässe

- Art: Lücke
- Schwere: mittel — der Todesfall in der Familie ist genau der Moment, in dem niemand einen Antrag in der App stellt;
  ein deaktiviertes Konto (Freistellung in der Kündigungsfrist) kann es gar nicht.
- Beleg: `supabase/migrations/20261102100000_arztbesuch.sql:355–357` — `freistellung_beantragen` legt immer für den
  Aufrufer an, einen Parameter für die Person gibt es nicht; Zeile 256–258 lässt nur die aufgezählten Anlässe zu.
  `shared/freistellung.ts:76–86` ist dieselbe feste Liste; `anlaesseDesBetriebs` (Zeile 93–98) ändert nur die Zahl
  der Tage. Für Urlaub und Krank gibt es den Weg des Büros (`urlaub_eintragen`, `krankmeldung_speichern` mit
  `p_user`).
- Auswirkung: Der Vater eines Monteurs stirbt; er ruft an. Das Büro kann die zwei Tage nicht eintragen — sie bleiben
  als Lücke mit Minus stehen, bis er selbst den Antrag stellt. Ein Betrieb, der für die Hochzeit eines Kindes oder
  eine bezahlte Freistellung in der Kündigungsfrist frei gibt, hat dafür keinen Stand.
- Vorschlag:
  - `freistellung_eintragen(p_user, …)` für Buchhaltung, Geschäftsführung, Administration (unbezahlt: nur
    Geschäftsführung und Administration, wie beim Entscheiden): legt den Antrag für die Person an und bestätigt ihn
    in einem Zug, mit „erfasst von“; Regeln wie in CLAUDE.md. Oberfläche: im Reiter „Sonderurlaub bestätigen“ der
    Handgriff „Für jemanden eintragen“ mit demselben Formular.
  - Eigene Anlässe je Betrieb: `companies.freistellung_anlaesse` nimmt neben den Tagen der bekannten Schlüssel auch
    neue Einträge auf (Name, Tage oder „notwendige Zeit“); `app.anlass_kontingent` und die Prüfung in
    `freistellung_beantragen` lesen sie. Dazu der Anlass „Bezahlte Freistellung“ ohne Kontingent, den nur das Büro
    einträgt.
  - Prüfung: `freistellungFuerJemanden.test.ts` (Büro trägt ein; Monteur nicht für andere; eigener Anlass zählt mit
    seinem Kontingent). Gegenprobe rot. Gleich bleiben muss: der eigene Antrag mit Nachweis und Bestätigung, die
    Warnungen, die Datenschutzregel „Projektleitung sieht den Anlass nie“.
  - Risiko: ein Eintrag ohne Bestätigungsschritt umgeht das Vier-Augen-Prinzip — deshalb nie für sich selbst.
- Aufwand: mittel

### Z-10 Ändern sich die Arbeitstage je Woche, bleibt der Resturlaub in Tagen stehen — die Umrechnung fehlt und wird nicht angeboten

- Art: Lücke
- Schwere: mittel — bei jedem Wechsel zwischen Vollzeit und Teilzeit mit anderer Zahl an Arbeitstagen; die Zahl
  „Resturlaub“ ist danach um Wochen falsch.
- Beleg: Urlaub zählt in Arbeitstagen der Person (`src/lib/time.ts:61–77`), der Anspruch gilt „für ganze
  Urlaubsjahre“, und die Karte verweist für alles andere auf eine Handanpassung
  (`src/features/users/ArbeitszeitVerlaufKarte.tsx:216`). Einen Vorschlag wie beim unbezahlten Urlaub
  (`kuerzungsVorschlag`, `shared/urlaubAliquot.ts:58–77`) gibt es hier nicht.
- Auswirkung: Fünf-Tage-Woche, zehn Tage Rest (zwei Wochen). Ab 1.7. drei Tage je Woche: es bleiben zehn Tage —
  dreieinhalb Wochen. Der Jahresanspruch muss von Hand auf 15 gestellt und das laufende Jahr von Hand gemischt
  werden. Nach der Rechtsprechung wird der offene Urlaub beim Wechsel der Arbeitstage umgerechnet, sodass seine
  Dauer in Wochen gleich bleibt (bitte von der Kanzlei bestätigen lassen; die App soll vorschlagen, nicht
  entscheiden).
- Vorschlag: Beim Speichern einer Arbeitszeit mit anderer Zahl an Arbeitstagen zeigt `ArbeitszeitVerlaufKarte` einen
  Vorschlag: Rest am Stichtag × neue ÷ alte Tage, Anspruch des laufenden Urlaubsjahres anteilig, Anspruch ab dem
  nächsten Jahr. Übernommen wird er als Anpassung des Anspruchs und als Eintrag im Anspruchsverlauf — beides gibt es
  schon. Rechnung als reine Funktion in `shared/urlaubAliquot.ts` mit eigener Prüfung; Gegenprobe: ohne Funktion
  kein Vorschlag. Gleich bleiben muss: wer den Vorschlag nicht übernimmt, hat genau den Stand von heute.
  Risiko: gering, nichts geschieht von selbst.
- Aufwand: mittel

### Z-11 Das Urlaubsjahr ist für alle derselbe Tag — das Arbeitsjahr je Person fehlt, und der genannte Grund trägt nicht

- Art: Grenze (benannt in der Maske, nicht in der Grenzen-Übersicht)
- Schwere: mittel bis hoch — das Arbeitsjahr ist der gesetzliche Normalfall (§ 2 Abs 4 UrlG); ein Betrieb ohne
  Umstellung auf das Kalenderjahr kann den Urlaubsteil nicht verwenden. Die Maske sagt das selbst.
- Beleg: `supabase/migrations/20260920100000_urlaubsjahr_beginn.sql:17–23`, `src/features/settings/SettingsView.tsx:1043–1045`,
  `src/types/index.ts:327–329`. Der Grund dort: „die Jahresauswertung der Buchhaltung verlöre ihren Sinn“. In
  `docs/grenzen-durchsicht-2026-10-24.md` steht die Grenze nicht.
- Auswirkung: Eintritt 1.9.; im Betrieb gilt das Arbeitsjahr. Die App lässt den neuen Anspruch am 1.1. entstehen und
  rechnet Übertrag und Verjährung zum 31.12. — beides vier Monate daneben.
- Vorschlag: Bauen. Die Bausteine sind da: jede Urlaubsrechnung nimmt den Jahresbeginn schon als Parameter
  (`urlaubsJahrVon(iso, beginn)`, `uebertragsRegel`), und das Arbeitsjahr einer Person rechnet die
  Pflegefreistellung bereits (`shared/freistellung.ts:254–264`).
  - Einstellung des Betriebs „Urlaubsjahr: fester Tag | Arbeitsjahr je Person“; im zweiten Fall liefert eine Stelle
    (`urlaubsjahrBeginnFuer(person, betrieb)`) den Jahrestag des Eintritts. Datenbank: `app.urlaubsjahr_von` bekommt
    die Person. Die Jahresansichten des Büros zeigen dann je Person ihr laufendes Urlaubsjahr mit „bis …“.
  - Prüfung: die bestehenden Urlaubsprüfungen einmal mit festem Tag (unverändert) und einmal je Person. Gegenprobe:
    ohne Umbau fällt der Anspruch am 1.1. an. Gleich bleiben muss: jeder Betrieb mit festem Tag behält jede Zahl
    (`urlaubsStand`-Prüfungen, Byte-Referenzen der CSV).
  - Risiko: `urlaubsanspruch_verlauf` und die Anpassungen hängen an einer Jahreszahl — sie bleibt „das Jahr, in dem
    das Urlaubsjahr beginnt“; das muss an jeder Beschriftung stehen.
- Aufwand: groß

### Z-12 Urlaub verjährt in der App ohne Vorwarnung — gesagt wird es erst, wenn die Tage weg sind

- Art: Lücke
- Schwere: mittel — betrifft jede Person mit altem Resturlaub; rechtlich heikel für den Betrieb.
- Beleg: `src/lib/time.ts:404–408` zieht verjährte Jahrgänge ab; `src/features/vacations/VacationsView.tsx:1656–1663`
  nennt sie danach („… sind heuer verfallen“). Eine Meldung vorher gibt es weder auf der Startseite noch als Push
  (keine Fundstelle in `src/features/dashboard`, `shared/notifyLogic.ts`).
- Auswirkung: Am 2.1. fehlen dem Monteur vier Tage aus dem vorvorletzten Jahr; niemand hat ihn im Herbst darauf
  hingewiesen. Nach der neueren Rechtsprechung beginnt die Verjährung nur zu laufen, wenn der Arbeitgeber zum
  Verbrauch aufgefordert und auf den Verfall hingewiesen hat (EuGH C-120/21, vom OGH 2023 für § 4 Abs 5 UrlG
  übernommen — bitte von der Kanzlei bestätigen lassen). Die App rechnet die Tage trotzdem weg.
- Vorschlag: Drei Monate vor Ablauf eine Zeile auf der Startseite der Person („4 Tage aus 2024 verjähren am
  31.12.“) und eine Push-Meldung, für die Entscheidenden eine Sammelzeile mit Sprung zur Liste. Der Hinweis wird mit
  Datum festgehalten (Nachweis für den Betrieb) und steht in der Datenauskunft. Rechnung: `urlaubsStand` für das
  Folgejahr ohne neue Buchungen — keine zweite Regel. Prüfung mit festem Stichtag; Gegenprobe: ohne Regel keine
  Zeile. Gleich bleiben muss: kein Resturlaub ändert sich. Ob ohne festgehaltenen Hinweis überhaupt abgezogen
  werden soll, ist eine Entscheidung des Auftraggebers mit der Kanzlei, kein Teil dieses Vorschlags.
  Risiko: eine Meldung mehr — nur einmal je Jahrgang.
- Aufwand: mittel

### Z-13 Die Lohn-Datei kennt Personen nur über den Namen, und der Stand des Zeitkontos steht nicht darin

- Art: Lücke
- Schwere: niedrig bis mittel — jede Lohnverrechnung ordnet über die Personalnummer zu; Vater und Sohn mit gleichem
  Namen sind in der Datei nicht zu trennen.
- Beleg: `src/features/accounting/export.ts:252, 338` (nur der Name), kein Feld „Personalnummer“ in `src/types` oder
  einer Migration. `docs/stand-2026-10-03.md:1487` führt „Personalnummer und Lohnarten (Liste des Lohnbüros)“ als
  einen Punkt; die Nummer braucht diese Liste nicht. Die Zusammenfassung trägt nur den Monatssaldo
  (`export.ts:289`), nicht den Stand des Zeitkontos — der schon im vorigen Papier als offen genannt war.
- Vorschlag: Feld „Personalnummer“ in der Benutzerakte (Text, je Betrieb eindeutig, leer erlaubt), Spalten
  „Personalnummer“ und „Zeitkonto am Monatsende(Std)“ hinten an der Zusammenfassung und im Kopf des
  Stundennachweises. Prüfung: Exportprüfung mit zwei gleichnamigen Personen; Gegenprobe: ohne Spalte nicht
  unterscheidbar. Gleich bleiben muss: alle Spalten davor an ihrer Stelle (Byte-Referenzen neu nur für die
  betroffenen Dateien). Risiko: keines für bestehende Leser, die nach Stelle lesen.
- Aufwand: klein

### Z-14 „Wegzeit“ zählt nirgends als Arbeitszeit — eine Annahme über den Betrieb, die nirgends steht

- Art: Grenze (unbenannt)
- Schwere: niedrig bis mittel — für Betriebe, bei denen die Fahrt vom Betrieb zur Baustelle Arbeitszeit ist und
  getrennt eingetragen wird, sind Saldo und Arbeitszeitgrenzen zu niedrig.
- Beleg: `src/lib/time.ts:539` („wird NICHT zu den Arbeitsminuten addiert“), `src/features/accounting/ueberstunden.ts:70`,
  `src/lib/standardZeitfelder.ts:4` („getrennt von der Arbeitszeit“); nur die Monats-CSV zählt sie in der Spalte
  „Gesamtzeit“ dazu (`export.ts:244, 264`). In der Grenzen-Übersicht steht dazu nichts.
- Vorschlag: Zuerst benennen — in der Hilfe des Feldes und im Handbuch steht in einem Satz, was „Wegzeit“ ist (Zeit
  außerhalb von Von/Bis, die nicht ins Zeitkonto zählt; Fahrt in der Arbeitszeit gehört in Von/Bis). Ob eine
  Einstellung „Wegzeit zählt als Arbeitszeit“ gebraucht wird, ist eine fachliche Frage an Pilotbetrieb und Kanzlei;
  als Idee mit diesem Vorbehalt. Gleich bleiben muss ohne Entscheidung alles.
- Aufwand: klein (Text); die Einstellung wäre mittel

### Z-15 Nichts verhindert, dass eine neu definierte Funktion einen früheren Textersatz verwirft

- Art: fehlende Prüfung
- Schwere: mittel — 42 Migrationen ändern Funktionen per Textersatz; ein Rückfall ist belegt (Z-2), weitere hat das
  Skript heute nicht gefunden.
- Beleg: `grep -l pg_get_functiondef supabase/migrations/*.sql` (42 Dateien), darunter für mein Gebiet
  `zeit_korrektur_entscheiden` (Merker des Monatsabschlusses), `zeitkonto_salden` (Zwischenstände),
  `person_auskunft`/`person_loeschen` (Monatsabschlüsse, Zwischenstände), zehn Abwesenheitsfunktionen.
- Vorschlag: eine Prüfung ohne Datenbank, `tests/unit/migrationenTextersatz.test.ts`: sie liest die Migrationen in
  Reihenfolge und schlägt an, wenn eine Funktion nach einem Textersatz noch einmal mit `create or replace` definiert
  wird, ohne dass die Stelle in einer kurzen Ausnahmeliste begründet ist. Dazu in `schema.test.ts` eine Tabelle
  „Funktion → muss enthalten“ für die lohnrelevanten Stellen (`urlaub_entscheiden` → `urlaubstage_person`,
  `zeit_korrektur_entscheiden` → `app.monatsabschluss_korrektur`, `zeitkonto_salden` →
  `zeitkonto_monate_gemerkt`). Gegenprobe: am heutigen Stand rot wegen `urlaub_entscheiden`, nach Z-2 grün.
  Gleich bleiben muss: keine Migration wird angefasst. Risiko: keines.
- Aufwand: klein

### Z-16 Der Resturlaub des Monteurs hängt an einer Liste mit fester Obergrenze, in der auch jeder Zeitausgleich steht

- Art: Grenze
- Schwere: niedrig — erst nach Jahren und nur bei häufigem stundenweisem Zeitausgleich, dann aber still falsch.
- Beleg: `src/lib/db/pg/vacations.ts:22–28` (alle eigenen Anträge jeder Art und jedes Stands, jüngste zuerst,
  höchstens `max`), aufgerufen mit 500 in `VacationsView.tsx:354` und `:597`; aus genau dieser Liste rechnet
  `urlaubsStand` den Rest (`VacationsView.tsx:522–546`). Wer wöchentlich Zeitausgleich nimmt, erreicht 500 nach
  rund zehn Jahren; abgeschnitten wird das Älteste, also Verbrauch alter Jahrgänge. Daneben weiter offen aus dem
  vorigen Papier: für jeden Antragsteller drei Abfragen (`VacationsView.tsx:587–622`).
- Vorschlag: die genehmigten Urlaube für die Rechnung eigens und ohne Grenze holen (Filter „Urlaub, genehmigt“,
  nur Beginn, Ende, Tage — eine Funktion für eine oder mehrere Personen, damit auch die drei Abfragen je
  Antragsteller entfallen). Prüfung: 600 Anträge, Rest stimmt; Gegenprobe: mit der Grenze falsch. Gleich bleiben
  muss: die Liste „Meine Anträge“ zeigt weiter die jüngsten.
- Aufwand: klein

## 3. Verdacht (nicht zu Ende geprüft)

- **Zwei gleichzeitige Krankmeldungen derselben Person** (aus dem vorigen Papier, weiter offen):
  `krankmeldung_speichern` prüft die Überschneidung ohne Sperre der Person und ohne Ausschlussbedingung an der
  Tabelle (`20261110140100_krank_im_urlaub.sql:225–236`). Es fehlt: zwei Aufrufe gleichzeitig gegen die Datenbank.
- **Fenster der Wochenruhe eine bis zwei Stunden verschoben:** die Buchungen werden in UTC umgerechnet, die
  Wochengrenzen nicht (`arbeitszeitGrenzen.ts:183–186` gegen `:324–325`). Nachgerechnet: Samstag bis 13:00 und
  Montag ab 7:00 wird im Winter nicht gemeldet (36 Std. bis Montag 1:00), obwohl in der Kalenderwoche nur 35 Std.
  liegen. Das Ergebnis passt zufällig zum Gesetz (§ 3 Abs 2 ARG: Beginn spätestens Samstag 13 Uhr), ist aber nicht
  so gemeint. Es fehlt: eine fachliche Festlegung, ob die Ruhe über die Wochengrenze reichen darf.
- **Der Zeitpunkt eines Timer-Befehls kommt vom Gerät** und wird nur gegen den vorigen Abschnitt geprüft
  (`20261108500000_zeitsitzungen.sql:35, 67`), nicht gegen die Serverzeit. Die Karte „Heute im Dienst“ zeigt ihn.
  Wegen des Betriebs ohne Netz ist das nötig; es fehlt eine Prüfung, wie weit Geräteuhr und Server online
  auseinanderliegen dürfen.
- **Der Monatsabschluss sperrt Eintritt und Austritt nicht.** Wird der Austritt nachträglich in einen
  abgeschlossenen Monat gelegt, ändert sich dessen Soll; gesperrt ist nur die Arbeitszeit ab einem Tag
  (`20261116022000_monatsabschluss.sql:200–249`). Die benannte Grenze nennt Saldo-Start, Startwerte, Urlaubsanspruch
  und 24./31.12., diese beiden nicht. Nicht gegen die Datenbank ausprobiert.
- **Deaktivieren mit Austritt in der Zukunft** (weiter offen): die Anmeldung ist sofort gesperrt, das Soll läuft bis
  zum Austritt; die Tage dazwischen kann nur das Büro füllen, und für eine bezahlte Freistellung fehlt der Stand
  (Z-9).
- **Die Einstellung „verfällt an einem festen Tag“** lässt Urlaub früher verfallen als § 4 Abs 5 UrlG; die Karte
  sagt, dass die App das nicht entscheidet (`SettingsView.tsx:1048–1051`). Ob die Einstellung so angeboten werden
  soll, ist eine Frage an die Kanzlei.
- **Summenzeile des Stundennachweis-PDF** mit vielen Abwesenheitsarten (aus dem vorigen Papier): nicht angesehen.
- **`listOpenVacations` holt höchstens 100 offene Anträge** (`vacations.ts:43–48`); ob die Karte sagt, wenn die
  Grenze greift, habe ich nicht verfolgt.

## 4. Benannte Grenzen, neu bewertet

| Grenze (Fundstelle im Grenzen-Dokument) | Grund | Grund gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| Arbeitszeitgrenzen: Lücke gilt als Pause; Tag ohne Uhrzeit ohne Pausenprüfung; vor dem ersten Buchungstag Woche null (B, Stand 15.3) | Angabe fehlt in den Daten | Ja (fachlich) | bleibt |
| Jugendschutz: Datenbank sperrt nur über 8 Std. und Nachtruhe; ohne Geburtsdatum niemand jugendlich (B, Stand 12.3) | fachlich; Angabe fehlt | Ja | bleibt |
| Teilzeit: Ausgleich im Quartal entscheidet die Lohnverrechnung; andere Kollektivverträge kennt Senklot nicht (B, T-1) | „Umfang: … ein anderer KV ist ein eigener Auftrag“ | Der erste Teil ja (liegt bei der Lohnverrechnung). „Umfang“ ist kein Grund. Tragfähig ist: Installationsbetriebe fallen für Arbeiter unter den KV Metallgewerbe | Grund neu fassen (fachlich: Branchen-KV); für Angestellte mit der WKO klären, ob die Zuschlagsregeln des Angestellten-KV abweichen |
| Sonderurlaub: Pflegestunden über dem Kontingent warnen; stundenweise nur Vorladung, Musterung, Pflege (B, Stand 10.3) | rechtlich, fachlich | Ja | bleibt; ergänzen um Z-9 |
| Zeit teilen: verrechnet nicht teilbar; Pause am längeren Teil. Teilen und Einfügen nur mit Verbindung (B, Stand 15.6/15.10) | Beleg; Sicherheit der Daten | Ja | bleibt |
| Änderungsprotokoll der Zeitbuchungen erst ab 05.11.2026 (B, E50) | Altdaten | Ja | bleibt |
| Krankenstände und Sonderurlaub nicht im Urlaubsverlauf (B, Stand 17) | Datenschutz | Ja | bleibt |
| Zeitfelder nur bei Anwesend und Zeitausgleich; verrechnet keine Nachpflege; Teilen kopiert nichts (B, E61) | fachlich, Datenschutz | Ja | bleibt |
| M06: weitere Zeitmodelle, Durchrechnung, lohnwirksame Zulagen (E63) | liegt bei WKO/Betreiber (Fundstellen fehlen) | Ja, aber seit 08.11. unbeantwortet | nachfassen; Z-3 (Auszahlung buchen) ist davon unabhängig, es ist keine Formel |
| Der Monatsabschluss sperrt Saldo-Start, Startwerte, Urlaubsanspruch, 24./31.12. nicht (Paket 4a) | fachlich: bewusste Berichtigungen des Büros | Teilweise: Eintritt und Austritt fehlen in der Aufzählung, und eine Berichtigung, die einen abgeschlossenen Monat ändert, hinterlässt keine Spur am Abschluss | Nicht sperren, aber im Verlauf des Abschlusses festhalten („Saldo-Start von … geändert am …“) und Aufzählung vervollständigen |
| Ohne Modul Korrekturanträge bleibt dem Monteur nur das Wiederöffnen (Paket 4a) | Einstellung des Betriebs | Ja; aber auch **mit** Modul fehlen Nachtrag und Löschen | Z-6 |
| Die Austrittsübersicht verweist, sie erledigt nichts (Paket 4a) | fachlich: Prüfungen an der Stelle | Ja | bleibt |
| Am Verlauf von Arbeitszeit und Anspruch steht kein Grund (Paket 4a) | Datenschutz | Ja | bleibt |
| Urlaubsanträge über den Jahreswechsel werden nicht neu gerechnet (Paket 4a) | Altdaten | Ja | bleibt |
| Entwurf einer Buchung für eine andere Person öffnet nicht in der eigenen Zeiterfassung; Entwürfe im Gerät (Paket 4b) | fachlich; Gerät | Ja | bleibt |
| Nicht gekürzt: Betriebsurlaub, Urlaub zu Sonderurlaub, stundenweiser Zeitausgleich (Paket 4b) | fachlich: eigener Weg | Ja | bleibt |
| Die Vorschau beim Kürzen rechnet in Kalendertagen (Paket 4b) | „die Vorschau rechnet das nicht ein zweites Mal“ | Nein — das ist „einfacher“. Die App hat die Rechnung schon (`urlaubsTage` mit Verlauf und Feiertagen, für die Antragsvorschau) | bauen, nach Z-2 (dann stimmen beide Seiten); klein |
| Monatswerte der Mitarbeiterübersicht rechnet weiter die App (Paket 9a, L5) | fachlich: kein zweiter Rechenweg für Lohnzahlen | Ja | bleibt |
| Monatsstände nur für aktive Konten (Paket 9a, L13) | Datenschutz | Ja | bleibt |
| Resturlaub beim Austritt steht nicht da (zweite Durchsicht) | liegt bei der Kanzlei (Ersatzleistung) | Ja für den Betrag und den aliquoten Teil. Nicht für die Tatsachen, die nur die App kennt: genommene Tage im laufenden Urlaubsjahr, offene Tage aus Vorjahren | Austrittsblatt (Abschnitt 5) nennt diese Tage, ohne Ersatzleistung zu rechnen |
| Deaktivierte ohne Austrittsdatum: kein Soll, kein Saldo (zweite Durchsicht) | Altdaten | Ja | bleibt |
| Aliquoter Urlaub, Arztbesuch im KV (X, WKO); Gleitzeit/Kernzeit beim Arztbesuch (X, Betrieb) | liegt bei jemand anderem | Ja | nachfassen |
| **Unbenannt:** Urlaubsjahr nur als fester Tag, kein Arbeitsjahr je Person | „Jahresauswertung verlöre ihren Sinn“ | Nein | Z-11, bauen |
| **Unbenannt:** Wegzeit zählt nie als Arbeitszeit | — | offen | Z-14, benennen und fachlich klären |
| **Unbenannt:** Arbeitstage sind feste Wochentage — wechselnde Wochen (jeder zweite Freitag frei) gehen nur über ein gemitteltes Tagessoll | — | offen | benennen; bauen erst, wenn ein Betrieb es braucht (Vorbehalt: Nutzen unsicher) |
| **Unbenannt:** die Rolle Administrator führt nie ein Zeitkonto (`permissions.ts:182–194`) | „eine Funktion im System, kein Arbeitsverhältnis“ | Für den Inhaber ja; eine angestellte Büroleitung mit dieser Rolle hat kein Zeitkonto | Schalter je Person wie bei der Geschäftsführung; klein |

## 5. Zusammenspiel und Ideen

Fehlende Verknüpfungen (jede schließt einen Befund oder einen Schritt, der heute außerhalb der App geschieht):

1. **„Monat fertig machen“** — Prüfliste, Auszahlung der Überstunden buchen, Monats-CSV, Abschließen in einem
   geführten Schritt in der Mitarbeiterübersicht. Heute sind es vier Stellen ohne Reihenfolge. Nutzen: der Lohnlauf
   hat einen Anfang und ein Ende; nach dem Abschluss hängt nichts fest. Baut auf Z-1, Z-3, Z-7. Aufwand mittel
   (über die Befunde hinaus klein).
2. **Austrittsblatt für die Lohnverrechnung** — aus der Karte „Nach dem Austritt“: Zeitkonto zum Austrittstag,
   genommener Urlaub im laufenden Urlaubsjahr, offene Tage aus Vorjahren, was noch gebucht oder beantragt ist, als
   PDF. Ohne Ersatzleistung in Euro (bleibt bei der Kanzlei). Nutzen: die Endabrechnung braucht heute drei
   Ansichten und einen Taschenrechner. Aufwand klein bis mittel.
3. **Zeitkonto in der Monats-CSV** (Z-13) — die „Zahl für die Endabrechnung“ steht heute nur am Bildschirm.
4. **Krankmeldung mit Stand der Bestätigung** (weiter offen aus dem vorigen Papier): „Bestätigung liegt vor / fehlt
   seit …“, wie der Nachweis beim Sonderurlaub; gebraucht beim Umwandeln von Urlaub (§ 5 UrlG). Nur der Vermerk,
   keine Diagnose, Datei nach „geprüft“ gelöscht wie beim Arztbesuch. Aufwand mittel.
5. **Hinweis vor der Verjährung** (Z-12) — der Monteur plant den alten Urlaub, bevor er weg ist.

Was die Bedienung einfacher machte:

6. **Berufsschule wiederkehrend** — „jeden Dienstag bis zum …“ statt jede Woche einzeln; heute gibt es nur
   Von–Bis (`TimeForm.tsx:891`). Bei ganzjähriger Berufsschule sind das rund 40 Eingaben im Jahr je Lehrling.
   Aufwand klein bis mittel.
7. **„Für jemanden eintragen“ an einer Stelle** — Krank, Urlaub, Sonderurlaub (Z-9) und Berufsschule für eine
   andere Person liegen heute an vier Orten (Urlaubsseite, Zeitformular der Mitarbeiterübersicht, gar nicht,
   Zeitformular). Ein Handgriff „Abwesenheit eintragen“ im Fenster der Person mit Art-Auswahl. Aufwand mittel.
8. **Vom abgewiesenen Buchen direkt zum Antrag** — die Meldung „Monat abgeschlossen“ trägt den Knopf „Nachtrag
   beantragen“ mit den schon eingegebenen Angaben (Z-6). Heute ist die Eingabe verloren.
9. **Vorschlag beim Wechsel der Arbeitszeit** (Z-10) — Urlaub umrechnen, betroffene genehmigte Urlaube und
   Einsätze nach dem Stichtag nennen (die Zählung gibt es in `austritt_folgen` schon der Form nach).

Funktionen, die ein Betrieb dieser Art erwartet und die fehlen:

10. **Überstunden auszahlen / Zeitkonto berichtigen** (Z-3).
11. **Halber Urlaubstag** — es gibt stundenweisen Zeitausgleich, aber Urlaub nur ganztägig. Viele Betriebe geben
    halbe Tage. Vorbehalt: rechtlich ist Urlaub tageweise gedacht; als Einstellung je Betrieb, fachlich mit der
    Kanzlei zu klären. Nutzen unsicher, deshalb Idee.
12. **Sechste Urlaubswoche** — die App kennt den Eintritt, aber weder angerechnete Vordienstzeiten noch einen
    Hinweis „25 Dienstjahre am …“. Idee: Feld „anrechenbare Vordienstzeiten bis“ und eine Zeile auf der Startseite
    der Leitung; der Anspruch wird weiter von Hand gesetzt. Aufwand klein.
13. **Lohnarten und Übergabe an die Lohnsoftware** — steht auf der Roadmap (Stand §17, 11.2) und wartet auf die
    Liste des Lohnbüros; ohne sie nicht baubar. Die Personalnummer (Z-13) kann vorgezogen werden.
14. **Ersatzruhe und Arbeit am Feiertag** — die Arbeitszeitgrenzen melden zu kurze Wochenruhe, aber weder den
    Anspruch auf Ersatzruhe (§ 6 ARG) noch Arbeit an einem Feiertag. Vorbehalt: für Störungsbehebung gelten
    Ausnahmen; als Hinweis in der Karte der Arbeitszeitgrenzen, nicht als Verstoß. Nutzen unsicher.

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| Z1 Genehmigten Urlaub zurücknehmen und kürzen | `VacationsView.tsx:300–310, 430–437`, `AntragKnopf.tsx:63`, `shared/notifyLogic.ts:411, 435` | hält |
| Z2 Saldo endet am Austritt; Austritt in einem Zug | `time.ts:895, 1168–1173`, `20261116021000` (`austritt_folgen`), `BenutzerakteView.tsx:480–483, 594–596` | hält; neuer Befund zum Wiedereintritt (Z-5) |
| Z3 Arbeitszeit und Anspruch „gültig ab“ | `time.ts:724–763, 1488–1496`, `20261116020000:520–668` | hält in App und Saldo; **hält nicht** für `urlaub_entscheiden` und `urlaub_kuerzen` (Z-2) |
| Z4 Vorgemerkte Buchung geht nicht verloren | `supabaseSender.ts:64–88, 95–115`, `src/lib/zeitEntwuerfe.ts`, `NochNichtGesendet.tsx` | hält |
| Z5 Rest am Monatsende / davon verplant | `time.ts:1346–1351`, `export.ts:289, 319, 344, 362` | hält |
| Z6 Monatsabschluss | `20261116022000`, `TimeView.tsx:339–347, 608–614, 758–759`, `AccountingView.tsx:229–251` | hält als Sperre; neue Befunde Z-1, Z-6, Z-7 |
| Z7 Urlaub nicht geladen → unbekannt, Export gesperrt | `AccountingView.tsx:445, 475, 925, 1135` | hält |
| Z8 Rundung, Personen-Exporte, Zeitausgleich mit null Tagen | `export.ts:239–246`, `AccountingView.tsx:960, 986`, `20261116030000:116–121` | hält |
| Z11 0 Wochenstunden | `time.ts:698–701`, `ueberstunden.ts:108–109` | hält |
| Z12 Gutschrift nur an Tagen mit Soll | `time.ts:914–922`, `1224–1234` | hält |

## 7. Nicht angesehen

- `TimeForm.tsx` im Ganzen (1.944 Zeilen): Aufteilen, Einfügen, Vorprüfungen, freie Zeitfelder, Schultag-Felder —
  nur die Stellen zu Abschluss und Abwesenheiten. `zeit_aufteilen`, `zeit_einfuegen` und
  `zeit_timer_zeitraum_buchen` nicht im Einzelnen.
- `app.zeitkonto_rechnung` Zeile für Zeile gegen `calcOverallSaldo`: nur die Formel und die Eingänge; auf die
  bestehenden Vergleichsprüfungen über den gewachsenen Bestand habe ich mich verlassen, sie aber nicht gestartet.
- Betriebsurlaub (`betriebsurlaub_anlegen`, `_nachbuchen`, `BetriebsurlaubReiter.tsx`), Arztbesuch im Einzelnen,
  Nachweis-Upload und -Löschung, `freistellung_entscheiden`.
- Benutzeranlage und Kontoumstellung über die Edge Functions, Geburtsdatum/Jugendschutz in der Datenbank
  (`20261006300000`), Einstufung und Lehrjahr außer dem Export.
- Stundennachweis-PDF (`hoursPdf.ts`, `baustellenNachweisPdf.ts`), `Streifen`, `UebersichtListe`, `PersonKalender`,
  `ProjectSummary`, `ImDienst`, die Startseiten-Regeln zu Zeit und Urlaub, Push-Texte.
- Zuschläge (`zuschlaege.ts`) und Überstunden nur gelesen, nicht mit Zahlen nachgerechnet; die Regeln des
  Kollektivvertrags habe ich nicht am Vertragstext geprüft.
- Nichts im Browser, nichts gegen eine laufende Datenbank; keine bestehende Prüfung gestartet. Die
  Rechtsfundstellen in Z-10 und Z-12 sind aus dem Gedächtnis genannt und vor einer Umsetzung von der Kanzlei zu
  bestätigen.
