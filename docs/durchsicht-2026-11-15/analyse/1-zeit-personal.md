# Tiefenanalyse 1 — Zeit, Abwesenheit, Personal

Stand: 15.11.2026, nur gelesen. Pfade relativ zu `/workspace/Prototype-App-Installateure`.
„Belegt“ heißt: im Code bis zum Ende verfolgt, Datenbankseite (Trigger, RPC, Zeilenschutz) mitgeprüft.
Fünf Rechenbehauptungen (Befunde 2, 3, 5, 8) habe ich zusätzlich mit einem Wegwerf-Skript außerhalb des
Repositorys gegen die echten Funktionen laufen lassen (`vite-node`, nichts im Repo geändert); die Zahlen stehen dabei.

## 1. Wie der Ablauf funktioniert

- **Timer (Modul `zeiterfassung.timer`)**: `ArbeitstagKarte` → `useZeitsitzungStand.befehl()` rechnet den Schritt sofort
  lokal (`timerFortschreiben`) und schickt ihn über das Ausgangsfach an `zeit_timer_befehl` (Revision + Befehlskennung,
  wiederholbar, eine laufende Sitzung je Person). Start/Pause/Weiter/Wechsel/Stopp schreiben nur Abschnitte in
  `zeitsitzungen.segmente`, **keine Buchung**.
- **Prüfen/Buchen**: nach „Stopp“ bildet `timerVorschlaege` je Baustelle einen Zeitraum (Pausen als Minuten);
  `ZeitsitzungPanel` öffnet dafür das normale `TimeForm`; gebucht wird über `zeit_timer_zeitraum_buchen`
  (legt die Zeile in `time_entries` an → alle Trigger). Offline liegt die Eingabe zusätzlich als „gesicherter Entwurf“
  im `localStorage`; eine spätere Ablehnung kommt mit Grund zurück an den Entwurf.
- **Von Hand**: `TimeForm` → `createTimeEntryOhneEmpfang`/`updateTimeEntryOhneEmpfang` (Vorprüfung `buchungKonflikt`,
  3 s Frist) → Ausgangsfach (IndexedDB, Reihenfolge je Konto, `upsert` auf Gerätekennung). Überschneidung mit anderer
  Baustelle: „Einfügen“ (`zeit_einfuegen`) bzw. „Aufteilen“ (`zeit_aufteilen`), beide nur online.
- **Datenbank schützt**: ~19 Trigger auf `time_entries` (Überschneidung, ganzer Tag allein, Krank/Urlaub/Freistellung
  nur über Meldung/Antrag, verrechnet bleibt, Eintritt/Austritt, Jugendschutz, Nacht, Satz, Zeitfelder, Protokoll).
  Zeilenschutz: eigene Zeilen oder Buchhaltung/GF/Admin.
- **Urlaub/ZA**: Antrag = Zeile in `vacations` (Status „Beantragt“); `urlaub_entscheiden` (gesperrt, Vier-Augen)
  schreibt bei Genehmigung je Arbeitstag einen Tag ins Zeitkonto, überspringt gebuchte Tage, „Storniert“ löscht sie
  wieder. Büro trägt Urlaub über `urlaub_eintragen` direkt als genehmigten Antrag ein.
- **Krank**: `krankmeldung_speichern` legt Meldung + Krank-Tage an; ab > 3 Kalendertagen kann das Büro Urlaubstage
  umwandeln (§ 5 UrlG). Sonderurlaub/Arztbesuch: `freistellungen` mit Nachweis, Bestätigung durchs Büro.
- **Saldo**: `calcOverallSaldo` (alle Buchungen) oder `saldoAusBilanzen` (Sicht `monthly_stats` + laufender Monat);
  Soll aus `pflichtTage` (Eintritt … gestern/Austritt, ohne Feiertage). Resturlaub: `urlaubsStand` (Jahrgänge,
  Verjährung/Stichtag, Anpassungen).
- **Büro**: `AccountingView` (Monat live, Gesamtsaldo je Person, Lücken, AZG-Grenzen), `PersonFenster`, Monats-CSV,
  Personen-CSV, Stundennachweis-PDF, Projekt-CSV. **Personal**: `UserMgmtView` (Anlage über Edge Function),
  `BenutzerakteView` (Stammdaten, Austritt, Deaktivieren, Urlaubsanspruch anpassen, Konto umstellen).

## 2. Belegte Befunde (nach Schwere)

### B1 — hoch — Ein genehmigter Urlaub/Zeitausgleich einer anderen Person lässt sich bei eingeschaltetem Modul „Urlaub“ nirgends zurücknehmen
- `src/features/vacations/VacationsView.tsx:1067–1069` (`zuruecknehmbar`) und `:1601` — „Zurücknehmen“ gibt es nur in
  „Meine Anträge“ (eigene Anträge, `listOwnVacations`), und dort nur, wenn sonst niemand entscheidet.
- `VacationsView.tsx:960–1058` „Offene Anträge“ zeigt nur „Beantragt“; `src/features/vacations/UrlaubMonat.tsx:112–118`
  listet die Genehmigten ohne jeden Handgriff.
- `src/features/time/AntragKnopf.tsx:47–58`: mit Modul Urlaub führt der Knopf am Urlaubstag (Zeiterfassung,
  `PersonFenster.tsx:207–209`) nur nach `/vacations` — dort gibt es den Antrag der anderen Person nicht. Der eigentliche
  „Zurücknehmen“-Dialog (`:60–155`) erscheint **nur bei ausgeschaltetem Modul**.
- Datenbank: Tag ist nur über den Antrag änderbar (`app.urlaub_nur_ueber_antrag`), Löschen des Antrags nur im Stand
  „Beantragt“ (`20261009200000_zeilenschutz_einmal_je_abfrage.sql:420`), den eigenen genehmigten nimmt „jemand anderer“
  zurück (`20261110140000_abwesenheiten_ohne_umweg.sql:136–143`).
- **Szenario:** Monteur hat 3.–7.8. genehmigt, sagt ab. Buchhaltung öffnet Mitarbeiterübersicht → Tag → „Urlaubsantrag“ →
  Urlaubsseite: kein Antrag, kein Knopf. In jedem Betrieb mit zwei Entscheidern (GF + Buchhaltung, der Normalfall) kann
  damit **kein** genehmigter Urlaub mehr zurückgenommen werden — auch der eigene nicht (Vier-Augen). Dasselbe für einen
  vom Büro falsch eingetragenen Urlaub (`urlaub_eintragen`). Einziger Umweg: Modul Urlaub aus- und wieder einschalten.
- Gegenstück, das es schon gibt: Sonderurlaub hat die Liste „Bestätigt, noch nicht vorbei“ mit „Zurücknehmen“
  (`FreistellungenBestaetigen.tsx:609–645`). Handbuch (Z. 1336, 4446) beschreibt das Zurücknehmen als vorhanden.

### B2 — hoch — Austritt/Deaktivieren räumt nichts auf und sagt nichts; Urlaub-/Kranktage nach dem Austritt blähen den Gesamtsaldo auf
- `src/features/users/BenutzerakteView.tsx:494` schreibt nur `active`/`austritt`. `supabase/migrations/20261113100000_austritt.sql:29–33`
  lässt bestehende Zeilen bewusst stehen („die Übersicht zählt sie als Ist und nennt sie“) — genannt werden sie nirgends
  (keine Fundstelle in `src/features/accounting`).
- `src/lib/time.ts:789–795` (`calcOverallSaldo`) und `:884–895` (`saldoAusBilanzen`) schreiben jeden vergangenen
  Urlaubs-/Kranktag mit dem Tagessoll gut — ohne Blick auf den Austritt; das Soll endet aber am Austritt (`:1313–1317`).
- **Szenario (nachgerechnet):** Austritt 13.06., genehmigter Urlaub 16.–20.06. (4 Arbeitstage) bleibt stehen →
  Gesamtsaldo **+32,00 Std** statt 0 (beide Rechenwege). Genau diese Zahl nennt `AccountingView.tsx:501–503`
  „die Zahl für die Endabrechnung“. Gleiches bei einer Krankmeldung, die über den Austritt hinausläuft.
- Daneben bleibt liegen, ohne Hinweis beim Deaktivieren: offene Urlaubs-/ZA-Anträge (stehen weiter unter „Offene
  Anträge“ und im Menü-Abzeichen; mit gesetztem Austritt scheitert das Genehmigen am Trigger `nicht_nach_austritt`,
  `urlaub_entscheiden` selbst prüft das Konto des Antragstellers nicht), offene
  Korrekturanträge, eine laufende Zeitsitzung (bleibt für immer `laeuft`; das Büro kann fremde Sitzungen lesen
  — `20261108500000_zeitsitzungen.sql:23` — aber keine Ansicht nutzt das, schließen kann sie niemand).
- **Wiedereintritt:** „Konto aktivieren“ entfernt den Austritt (`BenutzerakteView.tsx:481, 494`: „ab dann rechnet das
  Zeitkonto wieder weiter“). Tatsächlich zählt `pflichtTage` dann die **ganze Lücke** als Soll: Austritt 30.6.,
  Rückkehr 1.10. → rund 65 Arbeitstage Minus und „65 Tage ohne Buchung“, dazu der volle Urlaubsanspruch der Lücke.

### B3 — hoch/mittel — Wochenstunden, Arbeitstage, Tagessoll und „Urlaubstage pro Jahr“ gelten ohne Datum: jede Änderung rechnet rückwirkend ab Saldo-Start um
- `src/lib/time.ts:698–709, 805–806` (Soll aller Pflichttage mit den **heutigen** Werten), `:327, 391–393`
  (jeder Urlaubsjahrgang mit dem heutigen Jahresanspruch); Felder ohne Hinweis in `BenutzerakteView.tsx:773–784`.
  Für die Einstufung gibt es „ab Tag“ (`20261006220000_einstufung_ab_tag.sql`), für das Soll nicht.
- **Szenario 1 (nachgerechnet):** Elternteilzeit ab 1.12., Büro stellt 40 → 30 Wochenstunden. Der Gesamtsaldo springt
  für den ganzen Zeitraum seit Saldo-Start (im Beispiel seit 1.1.2025: **+936 Std**); auch jeder alte Monat zeigt beim
  nächsten Öffnen/Export ein anderes Soll.
- **Szenario 2 (nachgerechnet):** 25 → 30 Urlaubstage (6. Urlaubswoche, § 2 Abs 1 UrlG). 2025 waren 20 von 25 genommen;
  Anspruch 2026 wird 40 statt 35, weil auch der Jahrgang 2025 nachträglich 30 bekommt.
- Der einzige richtige Weg heute (neues Saldo-Startdatum + Start-Saldo + Resturlaub von Hand) steht weder in der Maske
  noch im Handbuch. `docs/grenzen-durchsicht-2026-10-24.md` (M06) nennt „automatische Neuberechnung alter Salden“ selbst
  „fachlich falsch“ — genau die geschieht hier bei jeder Stammdatenänderung. Keine benannte Grenze.

### B4 — mittel — Eine vorgemerkte normale Zeitbuchung, die später nicht ankommt, ist ohne Tag und Grund verloren — auch bei einer Serverstörung
- `src/lib/sync/ausgangsfach.ts:305–312, 332–346`: nach einer Ablehnung oder nach 5 „unklaren“ Antworten wird der
  Vorgang gelöscht. `src/components/VerloreneBuchung.tsx:42–51`: für Buchungen nur „Eine vorgemerkte Buchung konnte
  nicht gesendet werden“ — ohne Tag, ohne den Grund des Servers (Schein/Foto/Nachricht bekommen ihn), Eingabe weg.
- `src/lib/sync/supabaseSender.ts:55–71`: jede Antwort mit Fehlercode, die nicht 42501/22xxx/23xxx/PGRST1–2xx ist,
  gilt als „unklar“ — also auch 5xx/PGRST0xx bei einer Störung des Dienstes. Der Nachsender läuft jede Minute
  (`Nachsender.tsx:5`): **nach etwa fünf Minuten Störung wird jede in dieser Zeit vorgemerkte, einwandfreie Buchung
  verworfen.**
- Ohne Netz gibt es keine Prüfung gegen das, was schon im Fach liegt: `src/lib/db/timeEntries.ts:198` liefert offline
  eine leere Liste, `TimeForm.tsx:563–572` ebenso; die vorgemerkte Buchung steht auch nicht in „Meine Einträge“
  (`TimeView` zeigt nur den Serverstand; ein Zähler „wartet“ erscheint nur beim Abmelden, `Layout.tsx:219–223`).
- **Szenario:** Keller, kein Netz. 07:00–12:00 auf A gebucht („vorgemerkt“), der Tag sieht weiter leer aus, also
  11:00–16:00 auf B. Beim Senden weist die Datenbank B ab (`23P01`) → Meldung ohne Tag; 5 Stunden fehlen im Monat.
- Der Timer macht es richtig (Entwurf bleibt, Grund steht dabei, `zeitsitzungSpeicher.ts:57–73`) — der normale Weg nicht.
- Nebenfall: `app.zeitfelder_pruefen` wirft `55000` („freie Zeitfelder ausgeschaltet“,
  `20261108200000_freie_zeitfelder.sql:1009–1011`) → gilt als „unklar“: die Maske meldet online „ohne Verbindung
  gespeichert“, der Vorgang blockiert fünf Läufe lang alles dahinter und fällt dann weg.

### B5 — mittel — „Resturlaub“ in Mitarbeiterübersicht, Personen-CSV und Monats-CSV ist kein Stand zum Monatsende
- `src/lib/time.ts:1172–1189`: Kommentar „Urlaubsstand am Monatsende“, gerechnet wird aber mit **allen** Urlaubstagen
  des Urlaubsjahres, auch denen nach dem Monat und in der Zukunft (`AccountingView.tsx:397–417` holt bis 31.12.).
- **Szenario (nachgerechnet):** März-Export, im August sind 10 Tage genehmigt → Resturlaub im März **15 statt 25**.
  Derselbe Monat, im April und im Dezember exportiert, trägt zwei verschiedene Zahlen. Die Lohnverrechnung, die den
  Stand je Abrechnungsmonat führt, bekommt eine Zahl, die zu keinem Stichtag passt.

### B6 — mittel — Kein Monatsabschluss: der Monteur ändert und löscht eigene Buchungen beliebig alter Monate, auch nach dem Lohnexport und nach einer Korrektur des Büros
- Zeilenschutz `20261009200000_zeilenschutz_einmal_je_abfrage.sql:368–379` (eigene Zeile genügt, keine Zeitgrenze);
  `20261108600000_zeitkorrekturen.sql:1` („Ein Antrag ergänzt die Direktbearbeitung; er sperrt sie nicht ein“);
  `TimeView.tsx:754–759` bietet Bearbeiten/Löschen für jede geladene Zeile.
- **Szenario:** Oktober ist exportiert und ausbezahlt. Im Dezember stellt der Monteur einen Oktobertag von 8 auf 10 Std.
  (oder zurück auf den Wert vor der Bürokorrektur). Gesamtsaldo und ein erneuter Export ändern sich; es steht im
  Änderungsprotokoll, aber niemand wird darauf gestoßen. Gesperrt sind nur verrechnete, Antrags- und Meldungstage.
  Nicht als Entscheidung oder Grenze dokumentiert.

### B7 — mittel — Scheitert das Laden der Urlaubstage, rechnen Übersicht und Lohn-CSV still mit null genommenen Tagen
- `src/features/accounting/AccountingView.tsx:411–416`: im Fehlerfall `setUrlaubAlle([])`, Seite gilt als vollständig,
  **kein** `TeilFehler` (anders als bei den Anpassungen gleich darunter, `:440–445`: „kein stilles Weiterrechnen“).
- **Szenario:** Abfrage `subscribeUrlaubstage` läuft in die Frist → jeder Resturlaub steht auf vollem Anspruch, der
  Übertrag fehlt, „Monats-CSV“ exportiert das so.

### B8 — niedrig/mittel — Monats-CSV: die Spalte „Arbeitszeit(Std)“ ist je Zeile gerundet, die Zusammenfassung nicht
- `src/features/accounting/export.ts:40–46, 212, 283`. **Nachgerechnet:** 20 Tage zu 7:40 → Summe der Detailspalte
  153,40, „Ist(Std)“ 153,33. Wer in der Lohnverrechnung die Zeilen summiert, hat 4 Minuten mehr als die Zusammenfassung.

### B9 — niedrig/mittel — Stundennachweis-PDF „geht auch an Kunden“, lässt sich aber nicht auf eine Baustelle einschränken
- `src/features/accounting/hoursPdf.ts:49–51` (Zweck), `:107–127` (jede Buchung der Person im Zeitraum, mit Status
  Krank/Urlaub, „AB“ für Arztbesuch, Pflegefreistellung, Kunden und Kommentaren aller Baustellen);
  `ExportDialog.tsx` kennt nur Von/Bis.
- **Szenario:** Regiekunde verlangt den Stundennachweis → das Blatt zeigt auch Krankenstandstage, Arztbesuche und die
  anderen Kunden des Monteurs. Entweder Gesundheitsdaten an Dritte oder Nacharbeit von Hand.

### B10 — niedrig — Zeitraum-Exporte je Person laden die Buchungen aller Personen
- `AccountingView.tsx:888` und `:913–916`: `listEntriesInRange(Betrieb, von, bis)` und danach im Browser auf die Person
  gefiltert; `listOwnEntriesInRange(Betrieb, uid, von, bis)` gäbe es. Ein Jahresnachweis für eine Person in einem
  30-Personen-Betrieb holt ~10.000 Zeilen in 500er-Seiten.
- Ebenso N+1 bei „Offene Anträge“: je Antragsteller drei Abfragen (`VacationsView.tsx:505–512`).

### B11 — niedrig — Ganztägiger Zeitausgleich wird auch genehmigt, wenn kein einziger Tag gebucht werden kann
- `20261110110000_urlaub_entscheiden_sperre.sql:116–119`: die Sperre „nichts zu genehmigen“ gilt nur für `art = 'Urlaub'`.
- **Szenario:** ZA für Mo–Mi beantragt, an allen drei Tagen ist schon Arbeit gebucht → „Genehmigt — 0 Tage“, kein
  ZA-Tag im Zeitkonto, aber der Wochenplan zeigt die Person drei Tage als „ZA“ abwesend (`wochenplan_abwesend`).

## 3. Verdacht (nicht bis zum Ende verfolgt)

- **Eigene Krankmeldung rückwirkend kürzen:** `app.krankmeldung_grenzen` (`20260930180000…:91–118`) hält bei begonnener
  Meldung nur den Beginn fest; das Ende lässt sich offenbar beliebig weit zurücksetzen (Krank-Tage alter Monate fallen
  weg) oder vorziehen. Maske dazu nicht geprüft.
- **Zwei gleichzeitige Krankmeldungen** derselben Person: `krankmeldung_speichern` prüft die Überschneidung ohne Sperre
  und ohne Ausschluss-Bedingung; die Maske hat nur `sendet`.
- **Gesamtsaldo bei Größe:** jede Live-Änderung im Monat holt nach 1,5 s die Bilanzen aller Personen seit dem frühesten
  Eintritt und alle Buchungen ab Monatserstem (`zeitguthaben.ts:70–75`). Gemessen wurde am 19.10.; bei 30+ Personen und
  mehreren Jahren nicht nachgeprüft.
- **PDF-Summenzeile:** `hoursPdf.ts` setzt alle Abwesenheitsarten in eine Zeile ohne Umbruch (`abwesend.join('    ')`);
  mit fünf, sechs Arten dürfte sie über den rechten Rand laufen.
- **Lokaler Timer-Stand nach Offline-Buchung:** `timerAuftragErgebnis` (`zeitsitzungSpeicher.ts:57–73`) markiert nur den
  ersten Abschnitt eines Zeitraums als gebucht; bis zum nächsten Laden könnte der Tag weiter als „offen“ gelten.
- **Urlaubsjahr = Arbeitsjahr je Person** ist „nicht abgebildet“ (`src/types/index.ts:311–313`, „benannte Grenze, siehe
  Migration“), steht aber nicht in `grenzen-durchsicht` mit Grund. Gesetzlicher Normalfall ist das Arbeitsjahr
  (§ 2 Abs 4 UrlG); für „jeden österreichischen Installationsbetrieb“ wäre der Grund zu nennen.
- **Deaktivieren mit Austritt in der Zukunft** (Freistellung in der Kündigungsfrist): Anmeldung sofort gesperrt, Soll
  läuft bis zum Austritt weiter → Lücken und Minus, die nur das Büro nachbuchen kann.

## 4. Nicht nahtlos

- **Urlaub genehmigen / Krank melden → Einsatzplanung:** weder `urlaub_entscheiden` noch die Masken sagen „an 3 Tagen
  eingeteilt“; der Konflikt fällt erst im Wochenplan oder am Tag selbst auf (Startseite nur für heute).
- **„Urlaubsantrag“-Knopf am Tag** springt auf die Urlaubsseite ohne Bezug zum Antrag (siehe B1) — ein Sprung ins Leere.
- **Austritt:** kein Überblick „was hängt noch an dieser Person“ (Anträge, genehmigter Urlaub danach, Einsätze danach,
  laufender Timer, offene Korrekturen) — siehe B2.
- **Gesamtsaldo fehlt in der Monats-CSV**, obwohl er „die Zahl für die Endabrechnung“ ist; die Datei trägt nur den
  Monatssaldo, das Büro tippt den Stand des Zeitkontos ab.
- **Krankmeldung ohne Stand der Bestätigung:** ob die Arbeitsunfähigkeitsbestätigung da ist, führt das Büro außerhalb;
  gebraucht wird sie beim Umwandeln von Urlaub (§ 5 UrlG) und bei längeren Krankenständen.
- **Vorgemerkte Buchungen** stehen nicht in „Meine Einträge“; der Monteur sieht ohne Netz einen leeren Tag (B4).
- **Laufende Timer** sieht das Büro nicht („wer ist heute im Dienst“), obwohl Daten und Leserecht da sind.
- **Stammdatenwechsel** (Teilzeit, 6. Urlaubswoche, Wiedereintritt) verlangt drei von Hand gerechnete Startwerte (B3).

## 5. Funktionen mit Mehrwert (in den bestehenden Abläufen)

1. **„Genehmigt, noch nicht vorbei“ für Urlaub und ZA** — Liste der Entscheider mit Zurücknehmen und Kürzen (früher
   zurück, einen Tag streichen); schließt B1 und erspart „alles zurück und neu beantragen“.
2. **Arbeitszeit und Urlaubsanspruch „gültig ab“** (wie die Einstufung) — Teilzeitwechsel, 6. Urlaubswoche und
   Wiedereintritt ohne rückwirkende Salden; schließt B3 und den Wiedereintritt aus B2.
3. **Monatsabschluss je Monat** (abschließen, mit Grund wieder öffnen; danach nur noch Korrekturantrag) — gibt der
   Lohn-CSV einen festen Stand und dem vorhandenen Korrekturantrag seinen Platz; schließt B6, macht B5 eindeutig.
4. **Austritt in einem Zug** — beim Setzen des Austritts zeigt die Akte, was danach noch gebucht, genehmigt, beantragt,
   eingeplant oder am Laufen ist, mit je einem Handgriff; schließt B2.
5. **Ausgangsfach sichtbar und rettbar** — wartende Buchungen in „Meine Einträge“ („wartet auf Verbindung“), eine
   abgelehnte bleibt als Entwurf mit Tag und Grund zum Wiederöffnen (so wie beim Timer schon gebaut); schließt B4.
6. **Stundennachweis je Baustelle/Kunde** (nur Arbeit, ohne Abwesenheiten) — der Nachweis, den Regiekunden verlangen,
   direkt aus Akte oder Rechnung; schließt B9.

## 6. Was ich NICHT angesehen habe

- `TimeForm.tsx` ab Zeile 1280 (reine Darstellung), `Streifen`, `UebersichtListe`, `PersonKalender`, `ProjectSummary`,
  `Aenderungsprotokoll`, `ZeitfeldEingaben` und die freien Zeitfelder insgesamt (nur die Fehlercodes des Triggers).
- Arbeitszeitgrenzen AZG/KJBG (`arbeitszeitGrenzen.ts`, `useArbeitszeitGrenzen.ts`, zugehörige Migrationen) und
  `ueberstunden.ts`/`zuschlaege.ts` nur überflogen, nicht nachgerechnet.
- Sonderurlaub/Arztbesuch/Pflegefreistellung (`freistellung_*`-Funktionen, Nachweis-Upload und -Löschung), Betriebsurlaub
  (`betriebsurlaub_anlegen/_nachbuchen`), Berufsschule, `urlaub_eintragen`, `zeit_einfuegen` im Detail.
- Benutzeranlage und „Konto umstellen“ über die Edge Functions (`mitarbeiter-anlegen`, `konto-umstellen`,
  `passwort-vergeben`), Datenauskunft/Löschung (`person_auskunft`, `person_loeschen`) nur auf Vollständigkeit der
  neuen Tabellen geprüft.
- Die Sicht `monthly_stats`, Push-Meldungen, Startseiten-Regeln zu Zeit/Urlaub, Kalender-Abo.
- Nichts im Browser oder gegen eine laufende Datenbank ausgeführt; keine bestehende Prüfung gestartet.
