# Funktionsübersicht

Stand: 19.09.2026.

> **DER VORBEHALT VON HIER IST EINGELÖST.** Diese Datei war in der
> Firestore-Zeit geschrieben und sprach von Sammlungen, vom Emulator, von
> `firestore.rules` und von Cloud Functions. Mit dem Abbau von Firestore
> (19.09.2026) stehen hier die richtigen Namen: **Tabellen**, **Zeilenschutz
> (RLS)**, **Datenbankfunktionen**, **Trigger**, **Edge Functions**, und der
> Emulatorlauf heisst `npm run supabase:test` und läuft gegen eine echte
> Postgres-Datenbank.
>
> **Die Zahlen in der Spalte „Geprüft wodurch" sind nachgezählt**, nicht
> übernommen: sie stammen aus dem Prüflauf vom 19.09.2026. Wo ein Bereich
> mehrere Prüfdateien hat, stehen sie einzeln.

**Wofür dieses Dokument da ist.** Die Roadmap ist inzwischen ein
Änderungsprotokoll: sie erzählt, was wann warum gebaut wurde, und sie ist
dafür auch richtig. Was sie nicht mehr beantwortet, ist die Frage, mit der man
vor der App sitzt — *was gibt es, wer darf was, und worauf kann ich mich
verlassen?* Diese Datei beantwortet genau das, und zwar auch da, wo die
Antwort unangenehm ist.

Eine Zeile je Bereich. Die Spalte **Geprüft wodurch** ist die wichtigste; sie
unterscheidet vier Stufen:

| Stufe | Was sie wert ist |
|---|---|
| **Datenbank** | Läuft gegen eine echte Postgres-Instanz (`npm run supabase:test`). Prüft Zeilenschutz, Datenbankfunktionen, Trigger, tatsächliches Verhalten. Belastbar. |
| **Browser** | Der Weg im echten Chromium gegen den laufenden Stapel (`npm run durchklick`). Vier Wege, nicht mehr — siehe unten. |
| **Rechnung** | Reine Funktionstests der Formeln. Sagen, dass die Mathematik stimmt — nicht, dass die App läuft. |
| **Ansicht** | Rendern und Klicken, **aber jeder Datenbankzugriff ist ersetzt**. Findet Bedienfehler, keine Datenfehler. |
| **—** | Nicht automatisch geprüft. |

---

## Außendienst

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Zeiterfassung** | Tag buchen: Status, Von–Bis, Pause, Baustelle, Zuschläge; **eigene Zuschlagsstunden als Kachel**. Schlank für das Büro, voll für den Monteur. | alle (eigene); Buchhaltung/GF auch fremde | `timeEntries` | Rechnung (44), Datenbank (13), Ansicht (8), Browser (Zeit buchen) | Der Ansichtstest prüft die Verdrahtung — welcher Weg zum Saldo, verrechnete Einträge gesperrt —, nicht das Formular |
| **Mein Einsatzplan** | Monatskalender der eigenen Einsätze, Kontaktdaten, Sprung zu Zeit und Schein | Mitarbeiter | `assignments`, `projects`, `vacations` | Ansicht (5) | — |
| **Meine Baustellen** | Die Baustellen, denen der Monteur zugeordnet ist, mit Route und Telefonnummer | Mitarbeiter | `projects` | Ansicht (7) | Abgeschlossene fallen heraus, pausierte bleiben; ein fehlender Ansprechpartner wird angemahnt statt verschwiegen |
| **Material anfordern** | Warenkorb, Eilzustellung, eigene Anforderungen | Mitarbeiter, Verwaltung, Leitung | `materials`, `materialOrders` | Rechnung (25, Meldungen), Ansicht (21), **Datenbank (17, echte Transaktion)**, Browser (Material anfordern) | Der Lagerabzug läuft gegen eine echte Datenbank — auch **zwei gleichzeitige** Abschlüsse derselben Anforderung, der Fall, den kein Nachbau prüfen kann |
| **Urlaub** | Beantragen, entscheiden, Stand sehen. Genehmigung schreibt die Tage ins Zeitkonto. | alle (Antrag); Entscheider laut Einstellung | `vacations`, `timeEntries`, `companies` | Datenbank (19 Regeln + 15 Entscheidung + 6 Anfangsbestand + 16 Urlaubsjahr und Übertrag), Rechnung (22), Ansicht (15) | Die Tage der ECHTEN Datenbankfunktion laufen durch die ECHTE Saldorechnung — die Naht ist geprüft, nicht nur die beiden Hälften. **Seit dem 16.09.2026 liest die Anträge auch, wer sie entscheiden darf** — eine eingetragene Genehmigende aus der Verwaltung durfte entscheiden und sah eine leere Liste. **Seit 20.09.2026 ist auch der BEGINN des Urlaubsjahres einstellbar** (Vorgabe 1. Jänner). Bis dahin entstand der neue Anspruch fest am 1. Jänner — ein Betrieb mit einem anderen Urlaubsjahr bekam ihn ein halbes Jahr zu früh, und der Übertrag wurde im falschen Moment gemessen; auf dem Bildschirm stand eine Zahl, die richtig aussah. Der Urlaubstab benennt das laufende Jahr dann ausgeschrieben („Im Urlaubsjahr 2026/27“). **Benannte Grenze:** das Arbeitsjahr je Mitarbeiter (Jahrestag des Eintritts, § 2 Abs 2 UrlG) bildet die App NICHT ab — dort bedeutete „das Jahr“ für jede Person etwas anderes, und die Jahresauswertung verlöre ihren Sinn. Wer so rechnet, kann den Urlaubsteil dieser App nicht verwenden |
| **Handwerksscheine** | Zeiten vorausfüllen **oder vor Ort selbst eintragen**, Material von Hand erfassen, **Fotos (freiwillig)**, als Entwurf sichern und wieder öffnen, Entwurf verwerfen und zurückholen, unterschreiben, einfrieren, Storno mit Grund, PDF | Mitarbeiter, Büro, Leitung | `workSheets`, `timeEntries` (serverseitig), **Storage** | Datenbank (27 Schein + 13 Fotos + 10 Vorbereiten + 12 Prüfsumme), Rechnung (20), Ansicht (31), Liste (18), PDF-Zustand (3), Browser (Schein unterschreiben) | ein verworfener Entwurf bleibt in der Datenbank — gelöscht wird kein Schein (es gibt keine Löschrichtlinie), das schützt den unterschriebenen Beleg. **Leistungszeit vor Ort:** Der Monteur trägt Von/Bis/Pause selbst ein, wenn er noch nichts gebucht hat — das ist die Zeit BEIM KUNDEN, ohne Anfahrt, also genau die Zahl, die später auf der Rechnung steht. Danach erscheint der Einsatz in der Zeiterfassung als **offener Nachtrag**, weil die Rechnung ihre Stunden aus den Zeiteinträgen rechnet und eine nie gebuchte Stunde nie verrechnet wird. Gebucht wird **nicht automatisch**: der Schein kennt weder Anfahrt noch Fahrzeug (Kennzeichen) noch Zuschläge, und ein zu niedriger Eintrag, der vollständig aussieht, wäre schlimmer als ein Hinweis. **Fotos sind nie Voraussetzung:** das Ausgangsfach hält einen Schreibvorgang ohne Empfang vor, der Dateispeicher nicht — wäre eines Bedingung, hinge der Beleg an einem Balken Empfang. Sie gehen über ihren **Inhalts-Hash** in die Prüfsumme ein; ein später ausgetauschtes Bild fällt damit auf. **Stunden ohne Buchung:** In der Scheinliste steht für Buchhaltung/Leitung, welche unterschriebenen Scheine Zeit tragen, zu der es keine Anwesenheit in der Zeiterfassung gibt — je Person und Tag, älteste zuerst, ab zwei Tagen und ohne Grenze nach oben. Das schliesst die Lücke des Nachtrags: der erinnert nur an die EIGENEN Zeilen, weil ein Monteur fremde Zeiteinträge weder lesen noch schreiben darf (Kranken- und Urlaubstage, Art. 9 DSGVO) — die von Hand eingetragene Kollegenzeile hätte sonst niemanden, der an sie erinnert wird. Unterschieden wird „keine Buchung gefunden“ (Stunden fehlen ganz) von „auf eine andere Baustelle gebucht“ (Arbeitszeit erfasst, Zuordnung falsch); nur das erste zählt in die Summe. Verglichen werden Tag und Name, nicht die Minuten. Geprüft wird zunächst über die geladenen Scheine; **„Weiter zurück prüfen“** (30 Tage / 90 Tage / 1 Jahr) holt gezielt die unterschriebenen Scheine des Zeitraums — auf Anforderung, weil jeder davon rund 70 KB Unterschriftsbilder trägt, mit Obergrenze 150 und sichtbarer Ansage, sobald sie greift. Über der Liste steht jedes Mal, worauf sich das Ergebnis stützt. **Fotos werden sofort an den Schein geschrieben**, nicht erst beim Speichern: sonst blieb eine Datei im Storage zurück, auf die kein Dokument zeigt — Kosten, und ein Bild aus einer fremden Wohnung ohne Beleg für seine Aufbewahrung. **Suche:** Baustellennummer und Zeitraum gehen serverseitig und finden damit auch Scheine ausserhalb der geladenen Liste; nach Kundenname oder Notiz wird nur im geladenen Bestand gesucht. Der Grund dafür war Firestore (keine Volltextsuche); **seit dem Umzug gilt er nicht mehr** — `customer_name` und `notizen` stehen als Spalten am Schein, nachgezogen ist es noch nicht. Die Ansicht sagt beides an und nennt den Ausweg |

## Verwaltung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Kunden** | Stammdaten, Dublettenschutz, Übernahme der Altbestände; **Kundenakte** je Kunde mit allen Angaben, Baustellen, Wartungen und Angeboten, **dort auch bearbeitbar** | Buchhaltung, Verwaltung, Leitung | `customers`, `projects`, `quotes`, `wartungen` | Datenbank (10 Kunden + 13 Suche), Liste (6), Akte (23) | — |
| **Angebote** | Positionen kalkulieren, Arbeitszeit getrennt ausweisen, beim Annehmen Baustelle mit Stundenbudget anlegen | Buchhaltung, Leitung | `quotes`, `projects`, `counters` | Ansicht (3), Datenbank (31: Geld, darin der Zähler — steigend, Neubeginn nur zum Jahreswechsel) | — |
| **Baustellen** | Anlegen und suchen; **Baustellenakte** je Baustelle mit allen Angaben, Team, Projektleitung, Abrechnungsart und der **Stundenübersicht** (ganze Laufzeit gegen das Budget, Stunden je Mitarbeiter), **dort auch bearbeitbar** | Leitung | `projects`, `timeEntries` | Liste (23), Akte (21), Entwurf (10), Übersicht (8), Datenbank (15) | Der Kundenname kommt aus dem Stammsatz; leeres Stundenbudget bleibt leer statt 0. Die Übersicht zeigt **kein Geld** — Erlös und Marge bleiben in der Nachkalkulation. **Löschen und „Schein nachtragen" liegen seit 18.09.2026 im Zeilenmenü** — als eigene Schaltflächen passten sie auf 375 px nicht mehr in die Zeile |
| **Anforderungen** | Eingehende Materialanforderungen bearbeiten, Status setzen | Verwaltung, Leitung | `materialOrders` | Rechnung (Meldungen), Ansicht (14) | — |
| **Lager** | Bestand, Mindestmenge, Katalogpflege mit Verkaufs- und **Einkaufspreis** | Verwaltung, Leitung; **Einkaufspreis nur GF/Admin** | `materials` | Datenbank (17: wer pflegen darf, wer den Einkaufspreis setzt, Bestand unter Nebenläufigkeit), Ansicht (12 + 5 Katalog) | Der Bestandsabzug ist jetzt gegen eine **echte Transaktion** geprüft, gleichzeitige Zugriffe eingeschlossen. Die Grenze beim Einkaufspreis läuft zwischen den FELDERN, nicht zwischen den Ansichten — sie schützt das Ändern, **nicht das Lesen**: der Zeilenschutz gibt eine Zeile ganz oder gar nicht heraus |
| **Einsatzplanung** | Kalender, Mitarbeiter je Tag und Baustelle, Urlaubswarnung | Leitung | `assignments`, `vacations` | Datenbank (24: Einteilung, Rüstliste, Abhaken), Ansicht (8) | Geprüft ist auch der gefährliche Teil: eine vorhandene Planung kommt ins Formular, statt beim Speichern gelöscht zu werden |
| **Benutzerverwaltung** | Anlegen und suchen; **Benutzerakte** je Person mit Rolle, Wochenstunden, Arbeitstagen, Eintritt, Start-Saldo und Resturlaub, **dort auch bearbeitbar**, dazu Passwort-Mail und Sperren | Leitung (Admins nur durch Admins) | `users` | Datenbank (19 Belegschaft + 13 Rechte + 7 Konto anlegen), Liste (14), Akte (18), Entwurf (15) | — |
| **Einstellungen** | Verrechnungs- und Kostensätze, Urlaubs-Genehmigende, Monatsbilanzen aufbauen | Leitung; Genehmigende nur GF/Admin | `companies` | Datenbank (23), Ansicht (6) | — |
| **Module** | Bereiche für den Betrieb ein- und ausschalten; zeigt vorher, was mit abgeschaltet wird | **nur Administration** | `companies.modules` | Rechnung (15), Datenbank (23), Ansicht (11) | Enger als der Rest der Einstellungen. Enger als der Rest der Einstellungen: ein abgeschaltetes Modul nimmt allen den Weg zu ihrer Arbeit, und zwar unsichtbar — das ist Einrichtung, keine Führung |
| **Datensicherung** | Nächtliche Ausleitung des ganzen Bestands an einen zweiten Ort — **samt der Fotos am Handwerksschein**; Sicherung von Hand anstoßen; Bestand herunterladen (DSGVO); **Zustand des letzten Laufs**; Rücklauf als Werkzeug für die Hand (`scripts/ruecklauf.mjs`) | **nur GF/Admin** | alle Tabellen mit `company_id`, `system_laeufe`, `ausleitung_dateien`, Eimer `scheinfotos` | Rechnung (23 Aufräum-, Pfad- und Fristregeln), Zielspeicher und Signatur (24 inkl. AWS-Testvektoren), Ansicht (14), Datenbank (12 Ausleitung + 14 Dateien + 8 Wächter + 2 Rücklauf) | Ohne eingerichteten Zielspeicher liegt die Sicherung im selben Projekt — gegen einen Fehlgriff hilft das, gegen „der Zugang ist weg" nicht. **Die Fotos gehen nur ausser Haus**, weil sie im eigenen Projekt schon liegen; das Dienstkonto dort darf nur anlegen, deshalb führt `ausleitung_dateien` Buch und der Rücklauf holt die Dateien nicht selbst zurück |

## Büro und Auswertung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Rechnungen** | Aus Baustelle zusammenstellen — Stunden UND Material aus den unterschriebenen Handwerksscheinen —, Leistungszeitraum, Bauleistung mit Übergang der Steuerschuld (§ 19 Abs 1a UStG), Nummernkreis, Status, **Mahnwesen in drei Stufen mit Mahnlauf**, PDF, Buchhaltungs-Export mit Lückenprüfung. **Zahlungseingänge** mit Datum, Betrag und Art; der Zahlungsstand wird daraus abgeleitet. **Anzahlung, Teilrechnung und Schlussrechnung** — die Schlussrechnung zieht die Anzahlungen samt Umsatzsteuer ab. **Gelöscht wird keine Rechnung** — die Korrektur ist der Storno | Buchhaltung, Leitung | `invoices`, `counters`, `timeEntries`, `workSheets`, `materials` | Rechnung (143), Datenbank (31 Geld + 15 Belege + 13 offene Posten + 11 Zahlungen + 18 Rechnungsarten), Ansicht (56), Browser (Rechnung stellen bis zur Teilzahlung; Anzahlung bis Schlussrechnung mit Abzug) | Geprüft ist die Reihenfolge — Nummer ziehen, Belege sperren, dann anlegen; sie ist beim Anlegen die Sicherung selbst, denn ein Abbruch lässt Belege gesperrt zurück statt doppelt frei. **Storno und Storno-Aufhebung laufen dagegen als EIN Aufruf** (`rechnung_stornieren`): sie schrieben vorher erst die Rechnung und dann die Belege, und ein Abbruch dazwischen sperrte Stunden für immer oder gab sie doppelt frei. **Vor dem Anlegen steht der Abgleich gegen die unterschriebenen Scheine** — „Ein Schein bestätigt 04:00, verrechnet werden 08:00"; als Warnung erst ab einer Stunde UND einem Viertel darüber. Gekappt wird nichts: Vorfertigung in der Werkstatt zählt auf die Baustelle und steht auf keinem Schein. **Der Buchhaltungs-Export holt seinen Zeitraum selbst vom Server** — er filterte vorher die geladene Arbeitsliste und lieferte für ältere Monate eine leere Datei, die wie ein Erfolg aussah; die Lückenprüfung meldete dann Lücken, die keine sind. Ebenso rechnen **Mahnlauf und unverrechnete Leistung über die offenen Forderungen**, nicht über die Liste: die ältesten Forderungen fallen als erste aus einer Liste, die nach Anlagedatum abschneidet — und genau die gehören gemahnt. **Nicht verrechnete Leistung** steht als eigene Karte da: unterschriebene Scheine, die auf keiner gültigen Rechnung stehen und älter als vier Wochen sind. Wird eine Rechnung storniert, tauchen ihre Scheine dort wieder auf — der Storno nimmt die Forderung zurück, also steht die Leistung wieder offen. Der **Mahnlauf** stellt zusammen, was heute zu mahnen ist, dringlichstes zuerst; verschickt wird weiterhin einzeln und bewusst. Nach der dritten Mahnung hört die App auf — diese Forderungen stehen **getrennt als „braucht eine Entscheidung“** da, statt aus dem Lauf zu fallen. Material ohne Preis im Katalog steht mit 0,00 € da und wird ausgewiesen: eine erfundene Zahl wäre schlimmer als eine sichtbare Lücke. **Der Zahlungsstand ist seit 19.09.2026 abgeleitet, nicht gesetzt:** „Bezahlt", „Teilbezahlt" und „Überzahlt" ergeben sich aus den Zahlungseingängen, und die Datenbank weist einen Haken von Hand ab. Mahnlauf, offene Posten und Startseite rechnen mit dem REST — vorher wurde eine Rechnung über 1.000 €, auf die 400 gekommen waren, über den vollen Betrag gemahnt. Eine stornierte Rechnung mit Zahlung führt ein **Guthaben** des Kunden, statt die Zahlung verschwinden zu lassen. **Seit 20.09.2026 kennt die Rechnung ihre Art — aber nur, wenn der Betrieb es einschaltet:** der Haken „Wir stellen Anzahlungs-, Teil- und Schlussrechnungen" steht in den Einstellungen und ist ab Werk AUS. Ohne ihn sieht die Rechnungsmaske genau so aus wie vorher; bereits ausgestellte Belege behalten ihre Art und drucken unverändert, auch wenn er später wieder weggeht. Eingeschaltet gilt: Anzahlung, Teilrechnung, Schlussrechnung. Die Schlussrechnung weist jede abgezogene Vorrechnung einzeln aus — mit Entgelt UND Steuer, denn wer eine Steuer ausweist, schuldet sie (§ 11 Abs 12 UStG); ohne den Abzug stünde dieselbe Steuer zweimal auf Belegen desselben Betriebs. `total_*` bleibt dabei die RESTFORDERUNG, die volle Leistung steht getrennt in `gesamt_*`: offene Posten, Mahnlauf, Zahlungsstand und Nachkalkulation rechnen damit unverändert richtig weiter. **Abgezogen wird nur, was keine Belege verbraucht hat** — eine Teilrechnung über einen abgeschlossenen Bauabschnitt hat ihre Stunden mitgenommen und steht in der Schlussrechnung gar nicht mehr; sie zusätzlich abzuziehen hiesse, dem Kunden die eigene Leistung zu schenken. Die Datenbank rechnet nach (Gesamtleistung − Abzüge = Rechnungsbetrag), verlangt, dass die Kopie die Originalbeträge trägt, und weist eine Rechnung ins Minus ab, statt sie auf null zu kappen. Eine abgezogene Anzahlung lässt sich nicht stornieren, solange der Abzug gilt. **Dabei kam ein alter Fehler heraus:** eine Rechnung OHNE Leistungszeitraum liess sich gar nicht anlegen — der Leerstring ist kein Datum. Sie scheiterte an der schlechtesten Stelle, nämlich nachdem die Nummer gezogen und die Belege gesperrt waren; zurück blieben eine verbrauchte Nummer und Zeiteinträge, die auf eine Rechnung verwiesen, die es nicht gibt. Zu treffen war das schon vorher, denn das Feld ist änderbar und der fehlende Zeitraum wird nur gemeldet, nicht erzwungen. **Bekannte Lücken:** Skonto und Verzugszinsen rechnen weiterhin nicht; eine Gutschrift (Schlussrechnung ins Minus) gibt es nicht; mitten im Projekt zählt die Nachkalkulation eine Anzahlung als Erlös, deren Kosten erst entstehen — am Ende stimmt sie, bis dahin ist sie eine Momentaufnahme |
| **Wartungen** | Wiederkehrende Wartungsvereinbarungen je Anlage; **aus einer fälligen Wartung mit einem Griff eine Baustelle**; erledigt eintragen rückt den nächsten Termin nach; Hinweis auf der Startseite, wenn etwas ansteht | Lesen alle, ändern nur die Leitung | `wartungen`, `customers`, `projects` | Rechnung (40), Ansicht (13), Datenbank (19: Betrieb, darin die Wartungen), statischer Abgleich (Export) | Die Baustelle entsteht mit Kunde, **Anlagen**adresse und Anlage in der Beschreibung; eingeteilt wird sie danach im Einsatzplan, den Termin vereinbart weiterhin ein Mensch am Telefon. Die Projektnummer ist ein **Vorschlag, kein Zähler** — Baustellennummern vergibt der Betrieb frei; gegen Doppelvergabe wird beim Speichern geprüft |
| **Mitarbeiterübersicht** | Zeitkonten, Salden, Monats- und Mitarbeiterexport, Stundennachweis — **mit Nacht- und Notdienststunden** | Buchhaltung, GF, Admin (**nicht** Projektleitung) | `time_entries`, Sicht `monthly_stats` | Rechnung (20), Ansicht (4), Zuschläge (14), Nachweis (5) | Das Zusammenspiel Bilanz ↔ Rohdaten stand hier zuletzt als ungetestet — das stimmt nicht: `tests/unit/monatsbilanz.test.ts` prüft, dass beide Wege denselben Saldo ergeben, `TimeView.test.tsx` die Umschaltung samt Vollständigkeits-Marker. Eine Doku, die zu pessimistisch lügt, ist dasselbe Problem wie eine, die zu optimistisch lügt. **Zuschläge:** Die Rechnung bildet aus `isNightWork`/`isEmergency` seit jeher Positionen mit Aufschlag — der Kunde zahlt ihn. Die Lohnausleitung kannte die Felder bis 08.09.2026 gar nicht: verrechnet, aber nicht ausgewiesen, obwohl der Zuschlag ein Anspruch nach Kollektivvertrag ist. Jetzt je Zeile als Kennzeichen und je Mitarbeiter als Summe, dazu **„davon beides“** — Nacht und Notdienst schliessen einander nicht aus, und wer die zwei Zahlen addiert, zählt den Rohrbruch um zwei Uhr früh doppelt. **Gerechnet wird kein Geld:** die Höhe steht im Kollektivvertrag und hängt an Einstufung, Uhrzeit und Anlass — sie hier zu schätzen hiesse, eine Zahl zu erfinden, die in einem Lohnzettel landet |
| **Nachkalkulation** | Erlös gegen Personal- **und Materialkosten** je Baustelle, Deckungsbeitrag | GF, Admin | `projects`, `timeEntries`, `invoices`, `quotes`, `workSheets`, `materials` | Rechnung (23), Ansicht (13) | Geprüft ist auch die Verdrahtung: es rechnet mit den KOSTEN-, nicht den Verrechnungssätzen — der Fehler, den keine Formelprüfung findet. Material zählt seit 07.09.2026 mit, soweit ein **Einkaufspreis** hinterlegt ist; Artikel ohne Preis werden **beim Namen genannt statt geschätzt**, und die Ampel bleibt so lange gelb |

## Grundlagen

| Bereich | Was es tut | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|
| **Mandantentrennung** | `company_id` auf jeder Zeile, vom Zeilenschutz erzwungen und serverseitig gesetzt | Datenbank (159 Richtlinienprüfungen je Tabelle + 13 Rechte + Durchstich 0: zwei Betriebe, gleicher Tag, gleiche Baustellennummer) | **Die Grenze liegt nicht mehr in der Abfrage, sondern unter ihr.** Unter Firestore musste jede Abfrage ihren Filter selbst mitführen — vergass ihn eine, war die Trennung weg. Der Zeilenschutz kennt keinen solchen Fall: eine Zeile, die man nicht sehen darf, ist nicht vorhanden, auch ohne Filter. `tests/supabase/schema.test.ts` fragt die Datenbank nach ihren Tabellen, statt eine Liste zu pflegen. **Nicht belegt:** die Auslieferung an einen echten zweiten Betrieb |
| **Deaktivierte Konten** | Gesperrtes Anmeldekonto und der Aktiv-Zustand in `app.angemeldet()` — also unter jeder Richtlinie | Datenbank (13 Rechte + 12 Ansprüche) | Ein bereits ausgestelltes Token bleibt bis zu einer Stunde gültig; deshalb hängt die Sperre nicht am Token allein, sondern zusätzlich an `app.konto_sperren()` |
| **Wachstumsbremse** | Test verbietet jede Abfrage ohne Grenze in `lib/db` | Rechnung (40) | Prüft die Form der Abfrage, nicht ihre Laufzeit |
| **Nummernkreise** | Vorsätze für Rechnungen, Angebote, Baustellen und den Fuhrpark — einstellbar je Betrieb, mit Vorschau der nächsten Nummer. Die Baustellennummer wird seit 18.09.2026 vorgeschlagen (Zähler wie bei Rechnung und Angebot) und bleibt überschreibbar | Rechenregeln (21), Datenbank (13) | Gelten **ab jetzt, nicht rückwirkend** — eine ausgestellte Rechnung lässt sich nach § 132 BAO nicht mehr ändern. Geprüft wird die Form auch serverseitig (`companies_praefix_*`): der Vorsatz landet im Dateinamen des PDFs und in der Buchhaltungs-CSV. `WZ-` beim Kennzeichen stand dreifach fest im Code — der Kenner eines bestimmten Bezirks auf jedem Zeiteintrag |
| **Module** | Umfangsentscheidung des Betriebs: was ausgeschaltet ist, verschwindet aus Navigation, Startseite, Querverweisen **und** aus der Adresszeile | Rechnung (14), Datenbank (23) | **Keine Sicherheitsgrenze.** Wer die Rolle hat, dürfte die Daten ohnehin — ein Modul nimmt nur den Weg weg, nicht das Recht. Der Zeilenschutz bleibt die einzige Grenze. |
| **Anlegen in Listenansichten** | Kunden, Baustellen, Angebote, Benutzer und Wartungen: die Liste steht zuerst, das Anlege-Formular klappt über den Knopf in der Kopfzeile auf | je Ansicht 2 Prüfungen | Gemessen am Telefon: die Liste begann bei bis zu **1590 px**, jetzt bei **256–431 px**. **Zeiterfassung und Urlaub bleiben ausgenommen** — dort ist das Formular der Zweck, und die Zeitbuchung ist der häufigste Vorgang der App |
| **Darstellung am Telefon** | Nachgemessen bei **375 px** (iPhone XS): kein Element ragt über den Rand, Listenzeilen tragen höchstens vier Elemente rechts, Unterzeilen brechen nur **zwischen** den Feldern | Eurozeichen (9), Zeilenbreite (1) | Gemessen, nicht behauptet — eine wegwerfbare Playwright-Sonde über sechs Ansichten. Zwei Befunde waren gar keine Umbrüche: ein **doppeltes Eurozeichen** (`fmtEUR` gibt es in acht Dateien, vier stellen das Zeichen voran, vier nicht — wer abschreibt, erwischt die falsche Hälfte) und das **✕ allein in der zweiten Zeile**, die einzige unumkehrbare Aktion am auffälligsten Platz. **Nicht behoben:** die dritte Kennzahl-Karte steht allein — drei Spalten schnitten „€ 22 104,60" ab, und `col-span-2` änderte nachgemessen nichts |
| **Navigation** | Wer wohin darf, steht **nur** in `navigation.ts`; `RequireNav` liest Rolle und Modul aus demselben Eintrag, aus dem der Reiter gebaut wird. **Abzeichen für offene Posten** an drei Einträgen (Urlaub, Anforderungen, Rechnungen), aus EINER Abfrage `offene_posten()` | Statisch (29), Ansicht (14), Datenbank (13), Zähler (5), Posten (7) | Gezählt wird serverseitig und rollengerecht: wer einen Posten nicht entscheiden darf, bekommt ihn gar nicht erst gezählt |
| **Monatsbilanzen** | Verdichtete Zeitkonten als **Sicht** `monthly_stats` — sie rechnet bei der Abfrage | Rechnung (8), Datenbank (23: Einstellungen, darin die Monatszahlen) | **Es gibt nichts mehr nachzuziehen.** Bis zum Umzug war es eine abgelegte Zahl mit Trigger und Nachtlauf; beide sind weg, und mit ihnen die Sorte Fehler, bei der die abgelegte Zahl und die Rohdaten auseinanderlaufen |
| **Offline-Betrieb und Live-Verbindung** | Ausgangsfach (`lib/sync/`) für Zeit und Materialanforderung, Hinweis beim Speichern ohne Verbindung; **ein schmales Band über dem Inhalt**, wenn kein Netz da ist ODER die Live-Verbindung abgerissen ist und nicht wiederkommt | Rechnung (7), Verbindungszustand (7), Band (8), Wiederaufbau (9) | Das Band ist ein **Vorbehalt und kein Fehler**: `role="status"`, gelb, mit „Neu laden" daneben, und die Daten bleiben stehen. Es nimmt sich selbst zurück — der alte Hinweis konnte das nicht und blieb nach einem Tab-Wechsel bis zum Neuladen stehen. Der Zustand liegt an EINER Stelle, weil alle Abonnements an derselben WebSocket-Verbindung hängen; eine Ansicht kann ihn damit nicht vergessen. Alle vier Abonnement-Wege bauen die Verbindung wieder auf (fünf Stufen bis 15 s) und zählen im Hintergrund gar nicht erst mit. Im echten Browser mit gekapptem Socket nachgemessen: Band nach 38 s, vorher nach 0,2 s |
| **Startgeschwindigkeit** | Ansichten einzeln nachladbar, Service Worker hält die App-Hülle vor, Frist auf jedem Start-Zugriff | Rechnung (27: Frist, Service Worker und Fehlergrenze gegen den echten Quelltext) | **Auf keinem echten iPhone gemessen** — die Ursachen sind aus dem Code belegt, die Wirkung ist es nicht |
| **Fassungswechsel** | Der Worker behält die alten Bausteine, bis die neue Fassung übernommen wird; ein fehlgeschlagenes Nachladen lädt einmal von selbst neu | Rechnung (11 Sandbox + 9 Fehlergrenze) | Nicht auf einem echten Gerät über einen echten Deploy gefahren |
| **Meldungen (Push)** | Wer wird wann benachrichtigt; ausgelöst vom Trigger `material_orders_push`, zugestellt von der Edge Function `push-melden` | Rechnung (25), Datenbank (14 Auslöser und Empfängerkreis + 6 Wächter) | Die Zustellung selbst ist ungetestet — die Edge Function hat nie ein Test ausgeführt, siehe unten |

## Abgeschaltet oder ohne Weg dorthin

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`) | **Am 19.09.2026 ersatzlos entfernt.** Sie war vollständig gebaut und dauerhaft aus: ohne Schlüssel führte der Knopf nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gehen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge, die niemand geschlossen hat. Ein abgeschalteter Bereich, den niemand einschalten wird, ist Ballast, den jede spätere Änderung mitschleppt. |
| **Wiedervorlagen** (`follow_ups`) | Tabelle, Richtlinien und Datenschicht existieren; geschrieben wurde nur aus der KI-Erfassung. Mit deren Entfernung ist der Bereich **unerreichbar** — keine Ansicht liest oder schreibt ihn. Entweder bekommt er einen echten Eingang (Wiedervorlage aus Angebot oder Mahnung) oder er fällt weg; das ist eine Produktentscheidung. |

---

## Die ehrliche Bilanz zur Prüftiefe

2465 automatische Prüfungen klingen nach viel. Aufgeschlüsselt (Lauf vom
19.09.2026):

| Art | Anzahl | Aussagekraft |
|---|---|---|
| **Gegen eine echte Postgres-Datenbank** (`npm run supabase:test`) | **740** | **Am höchsten — Zeilenschutz, Datenbankfunktionen, Trigger und Nebenläufigkeit, wie sie produktiv laufen** |
| **Im echten Browser** (`npm run durchklick`) | **4** | **Hoch für die Naht: vier ganze Wege, gegen den laufenden Stapel. Findet, was kein Ansichtstest sieht** |
| **Statischer Abgleich** (Navigation ↔ Routen 35, Abfragegrenzen 52, Exportumfang 12, Ausgangsfach-Naht 4, Pflichtfelder 3, Bau-Umgebung 3, Datenschicht-Vertrag 2) | **111** | **Hoch — fängt Widersprüche zwischen Listen, die dasselbe behaupten** |
| **Service Worker in einer Sandbox** | **20** | **Hoch — der echte Quelltext, nicht ein Nachbau** |
| Reine Rechnung (der Rest von `tests/unit`) | 871 | Hoch für die Formeln, **null** für die App |
| Ansichten, Datenbank ersetzt | 719 | Findet Bedienfehler, **keine** Datenfehler |
| *Zusammen `npm test`* | *1721* | |

> Die Tabelle ADDIERT SICH, und das ist Absicht: eine Aufschlüsselung, in der
> Zeilen fehlen, liest sich wie eine vollständige und ist keine. Datenbank-
> und Browserlauf stehen getrennt, weil sie einen laufenden Stapel brauchen
> und deshalb nicht im selben Befehl stecken.

**Was in dieser Tabelle NICHT mehr steht**, und warum das eine gute Nachricht
ist: bis zum 19.09.2026 stand hier eine Zeile „Cloud Functions mit ersetztem
Firestore (109)" — der echte Handler lief, aber die Aussenwelt war nachgebaut,
und Indizes, Nebenläufigkeit und Regeln konnte dieser Ersatz nicht prüfen. Die
Arbeit dieser Functions macht jetzt die Datenbank, und sie wird gegen eine
echte Datenbank geprüft. **Die vier verbliebenen Edge Functions haben diese
Lücke aber geerbt** — siehe unten.

**Die Nachtläufe melden sich seit dem 07.09.2026.** Die Ausleitung (02:30)
hält fest, ob sie durchgegangen ist; bleibt der letzte Erfolg zwei Nächte aus,
steht das auf der Startseite der Leitung. Es war der einzige Mangel dieser
App, bei dem der Schaden mit der Zeit WÄCHST statt aufzufallen: die Sicherung
konnte wochenlang ausfallen, und bemerkt hätte man es an dem Tag, an dem man
sie braucht.

> **DEN BILANZLAUF GIBT ES UNTER POSTGRES NICHT MEHR** (03:15, bis 16.09.2026
> hier mitgeführt). In Firestore musste die Monatsbilanz vorgerechnet und
> abgelegt werden — mit einem Trigger zum Nachziehen und einem nächtlichen
> Lauf zum Ausgleichen. Unter Postgres ist `monthly_stats` eine SICHT: sie
> rechnet bei jeder Abfrage neu, es gibt nichts nachzuziehen, keinen Lauf und
> keinen Eintrag in `cron`.
>
> Die Startseite fragte trotzdem weiter nach ihm, bekam „noch nie
> durchgelaufen" — was stimmt, weil es ihn nicht gibt — und meldete
> Geschäftsführung und Administration **dauerhaft** „Ein nächtlicher Lauf
> steht aus". Eine Warnung, die niemand abstellen kann, ist schlimmer als
> keine: sie bringt einem bei, die Stelle zu übersehen, an der eines Tages
> die ausgefallene Sicherung steht.

> **„Unbekannt" ist nicht „gut".** Ein Betrieb ohne Aufzeichnung sieht in den
> Daten genauso aus wie einer, bei dem nie etwas lief — und beides heisst: es
> gibt keine Sicherung, von der jemand weiss. Beide Fälle melden sich.
>
> Geschrieben wird der Zustand **ausschliesslich vom Server**
> (es gibt keine Schreibrichtlinie). Eine Überwachung, die der Überwachte selbst
> beschreiben kann, überwacht nichts.

**Pflichtfelder tragen seit dem 07.09.2026 einen Stern.** Vorher erfuhr man
erst nach dem Absenden, dass etwas fehlt — bei einem Formular mit acht Feldern
heisst das: ausfüllen, abschicken, Meldung lesen, suchen.

> Der Stern steht **neben** dem Label, nicht darin: im Label wäre er Teil von
> dessen Text, und das Feld hiesse „Von \*" statt „Von". Die zweite Hälfte der
> Kennzeichnung ist `aria-required` am Feld selbst — ein Stern allein ist
> Farbe und Form und für einen Vorleser nichts.
>
> `tests/unit/pflichtfelder.test.ts` gleicht ab: **jedes Feld mit `required`
> trägt auch den Stern.** Beide Angaben stehen nebeneinander am selben
> Element, und man kann die eine ohne die andere setzen — beim nächsten neuen
> Formular ist genau das die naheliegende Nachlässigkeit.

**Die internen Kostensätze standen als Hausnummer im Formular.** Gemeldet
wurde: „Die Nachkalkulation sagt, man muss in den Einstellungen den Betrag
festlegen, ich finde aber kein Feld." Das Feld war da — es zeigte 42 und 28,
sichtbar, aber nirgends gespeichert.

> Daraus wurden zwei Fehler auf einmal. Die Nachkalkulation meldete
> „Kostensätze fehlen", während daneben zwei ausgefüllte Felder standen. Und
> wer aus einem beliebigen anderen Grund auf Speichern drückte — etwa um das
> Zahlungsziel zu ändern —, schrieb die erfundene Zahl fest: ab da beruhte
> jede Marge des Betriebs auf 42 €, die niemand entschieden hatte.
>
> Jetzt bleiben die Felder leer, bis der Betrieb sie füllt, und mitgeschrieben
> werden sie nur, wenn **beide** dastehen. Der Unterreiter heisst „Sätze und
> **Kosten**", damit man sie dort auch vermutet.

**Gelöscht wird nur mit Rückfrage — seit dem 07.09.2026 ausnahmslos.** Eine
Prüfung über alle Löschwege der App fand zwei ohne: „Rechnung löschen" im
Zeilenmenü einer stornierten Rechnung, und „Antrag zurückziehen" beim Urlaub.

> **Das Löschen einer Rechnung gibt es nicht mehr**, auch nicht für die
> stornierte — weder in der Oberfläche noch serverseitig
> (es gibt keine Löschrichtlinie). Nicht bloss mit einer Rückfrage versehen,
> sondern gestrichen: § 132 BAO verlangt sieben Jahre Aufbewahrung, und die
> gezogene Nummer hinterliesse eine Lücke im Kreis, die der
> Buchhaltungs-Export danach zu Recht meldet — ohne dass noch jemand wüsste,
> warum. Der **Storno** ist die vorgesehene Korrektur: er bleibt stehen,
> trägt seinen Grund und lässt sich wieder aufheben.
>
> **„Antrag zurückziehen"** fragt jetzt nach und nennt den Zeitraum. Betroffen
> ist nur der eigene, noch nicht entschiedene Antrag; der Schaden eines
> Fehlgriffs ist gering. Die Ausnahme im Verhalten war das Problem — auf einen
> Löschknopf ohne Rückfrage neben elf mit stellt sich niemand ein.
>
> Zwei Dinge bleiben ganz unlöschbar und waren es schon: der unterschriebene
> **Handwerksschein** und das **Benutzerkonto** (nur deaktivierbar, sonst
> verlören seine Buchungen ihren Besitzer).

**Die Auswertung steht jetzt an zwei Stellen, und das mit Absicht.** Bis zum
07.09.2026 gab es sie nur unter der Mitarbeiterübersicht — dort beantwortet
sie eine Monatsfrage über alle Baustellen („wohin gingen die Stunden im
September?"), und daran hängt auch der CSV-Export. Die Frage, die man beim
Blick auf eine Baustelle tatsächlich hat, ist eine andere: „wie steht DIESE
Baustelle?", über ihre ganze Laufzeit. Sie steht jetzt im Baustellen-Tab,
aufklappbar je Zeile.

> Beide rechnen aus derselben Quelle (`listEntriesForProjects`) und können
> nicht auseinanderlaufen. Genau daran ist die Auswertung schon einmal
> gescheitert: sie verglich Monatsstunden mit einem Budget, das für den
> ganzen Auftrag kalkuliert war, und meldete eine ausgereizte Baustelle als
> halb offen.
>
> **Ohne Geld.** Erlös, Kosten und Deckungsbeitrag bleiben in der
> Nachkalkulation und damit bei der Geschäftsführung; die Baustellenübersicht
> sieht auch die Projektleitung.
>
> Zugleich ist der blaue Kopfbereich der Projektauswertung weg — dieselbe
> Entscheidung, die in der Mitarbeiterübersicht längst getroffen war und hier
> stehengeblieben ist. Helferstunden sind keine Warnung mehr, sondern eine
> Angabe; eine Pille bekommt nur noch, was eine Ausnahme ist („über Budget").

**Die Naht zwischen der Urlaubs-Function und dem Zeitkonto, seit dem
07.09.2026.** Hier stand, es gebe „keinen Durchstich" — das war zu pauschal.
Beide Hälften waren geprüft: die Function mit 24 eigenen Tests, und
`durchstich.test.ts` prüfte, dass fünf Urlaubstage den Saldo nicht ins Minus
ziehen.

> **Nur bemerkte keine die andere.** Der Durchstich STELLTE NACH, was die
> Function schreibt, statt sie aufzurufen. Dazwischen lag eine Annahme, die
> niemand nachrechnete: dass die Datensätze der Function genau die Form haben,
> die die Saldorechnung erwartet. Hiesse das Feld einmal `'Urlaub'` und einmal
> `'Urlaubstag'`, blieben beide Testreihen grün — und der Monteur stünde nach
> seinem Urlaub mit vierzig Minusstunden da.
>
> Jetzt läuft die ECHTE Ausgabe der Function durch die ECHTE Rechnung: Saldo,
> offene Werktage, Monatsbilanz. Und nach der Rücknahme steht der Saldo wieder
> dort, wo er ohne Urlaub stünde.

**Die UID des Kunden landete nur bei Reverse Charge auf der Rechnung.**
Gefunden bei einer Durchsicht am 07.09.2026: die App lud sie aus dem
Kundenstamm, zeigte sie im Formular — und warf sie beim Speichern weg, sobald
der Haken aus war (`customerVatId: reverseCharge ? … : ''`).

> **Über 10.000 € brutto an ein Unternehmen ist sie Pflichtangabe**
> (§ 11 Abs 1 Z 2 UStG). Ihr Fehlen trifft nicht den Aussteller, sondern den
> KUNDEN: ihm steht der Vorsteuerabzug erst zu, wenn sämtliche
> Rechnungsmerkmale vorliegen. Wird die UID binnen eines Monats nachgereicht,
> wirkt die Berichtigung zurück, später erst ab dem Tag der Ergänzung.
>
> Das Feld steht jetzt AUSSERHALB des Reverse-Charge-Blocks — es gehört zum
> Empfänger, nicht zur Steuerschuld — und die UID wandert immer in die
> Rechnung. Über der Grenze wird **gewarnt, nicht gesperrt**: ob der Empfänger
> Unternehmer ist, steht in keinem Datenfeld, und eine Rechnung über 12.000 €
> an eine Privatperson ist vollkommen in Ordnung. Bei Reverse Charge bleibt
> es bei der Sperre — dort belegt die UID den Übergang der Steuerschuld.

**Die Kundenakte, seit dem 07.09.2026.** Gemeldet wurde: „Man kann Kunden
zwar eine Mail, Notiz, UID und weiteres hinzufügen, diese Daten scheinen
jedoch nirgendwo auf." Das stimmte — das Formular nahm sieben Felder
entgegen, die Liste zeigte drei. E-Mail, UID-Nummer und Notiz wurden erfasst
und danach nie wieder gezeigt.

> **Am teuersten war die UID.** Sie gehört auf jede Rechnung an ein
> Unternehmen, und wer sie nachsehen wollte, musste in die
> Bearbeitungsmaske — also genau dorthin, wo man sie versehentlich ändert,
> während man sie nachliest.
>
> Die Akte ist eine eigene Seite (`/customers/:id`), kein Aufklappen mehr.
> Die Historie hing bisher IN der Nebenzeile einer Listenzeile, mit `span`
> gebaut, weil ein Absatz keine Blöcke verträgt. Um Stammdaten und Wartungen
> erweitert wäre daraus vollends eine Ansicht in der Verkleidung einer Zeile.
> Und eine Seite hat eine Adresse: von der Baustelle oder der Rechnung lässt
> sich später darauf verlinken, auf ein Aufklappen nicht.
>
> Mitgenommen: `listWartungenForCustomer` war geschrieben und nie verdrahtet —
> jetzt stehen die Wartungen des Kunden in seiner Akte. Und die
> Kontakt-Regeln (`mapsUrl`, `telUrl`, der neue `mailUrl`) haben endlich
> eigene Tests; im Modul stand seit jeher, sie seien genau dafür ausgelagert.

**Bearbeitet wird seit dem 15.09.2026 in der Akte selbst.** Die
Stammdatenkarte IST das Formular — kein Umschalten in einen Bearbeiten-Modus,
und kein Rücksprung in die Kundenliste, aus der man gerade gekommen ist. Wer
ändern darf, tippt direkt; wer nur lesen darf, sieht dieselben Felder als
Liste. Die Grenze ist dieselbe wie in der Kundenliste (`isGF`:
Geschäftsführung, Projektleitung, Administration) — eine zweite Regel an
derselben Sache wäre der Anfang zweier verschiedener Antworten. Die
Speicherleiste erscheint erst, wenn sich wirklich etwas geändert hat.

> Dabei gefunden: der Angebotsblock der Akte suchte die Angebote über den
> KUNDENNAMEN, die Abfrage filtert aber auf die Kennung. Unter Postgres
> scheiterte er an jedem Kunden, unter Firestore blieb er still leer. Er hat
> nie funktioniert; jetzt tut er es, und eine Prüfung hält das Argument fest.

**Die Baustelle hat seit dem 15.09.2026 dieselbe Akte** (`/admin-projects/:id`).
Sie hatte vorher gar keine eigene Seite: bearbeitet wurde sie über der Liste,
die Stundenauswertung klappte in der Listenzeile auf. Aus „Übersicht" und
„Bearbeiten" ist ein Verweis geworden — „Akte"; das Formular über der Liste
legt nur noch an.

> Zwei Fehler kamen dabei heraus. **Die Abrechnungsart (Regie/Pauschal) war
> nirgends änderbar** — der Handwerksschein liest sie, geschrieben wurde sie
> nur beim Umwandeln eines Angebots; jede von Hand angelegte Baustelle galt
> stillschweigend als Regie. Und **eine Baustelle ohne Datumsangaben liess
> sich seit dem Postgres-Umstieg gar nicht anlegen**: ein leeres Datumsfeld
> liefert `''`, und das nimmt eine `date`-Spalte nicht an. Gefunden hat das
> der Durchklick im echten Browser — im Ansichtstest ist die Datenschicht
> ersetzt, und eine Nachbildung nimmt jede Zeichenkette an.

**Der Benutzer hat seit dem 15.09.2026 dieselbe Akte** (`/user-mgmt/:uid`).
Vorher führte „Bearbeiten" in das ANLEGE-Formular ganz oben, wo die
Zeitkonto-Felder erst noch aufzuklappen waren; Passwort-Mail und Sperren
lagen in einem Zeilenmenü. Aus drei Wegen ist einer geworden. Die
Zeitkonto-Felder stehen in der Akte offen — im Anlege-Formular bleiben sie
eingeklappt, weil die Vorgaben dort meistens stimmen.

> Auch ein Administrator, den die aufrufende Rolle nicht ändern darf, hat
> jetzt eine Akte: vorher stand in seiner Zeile „nur durch Administrator"
> ohne einen Weg zur Person. Ansehen darf man sie, ändern nicht.

**Jede Ansicht der App hat seit dem 07.09.2026 einen Ansichtstest.** Zuletzt
offen waren Nachkalkulation, Module, Meine Baustellen, Firmendaten,
Einstellungen und die KI-Erfassung. Fünf weitere standen hier noch als
ungetestet und waren es längst nicht mehr — die Tabelle oben hinkte der
Wirklichkeit nach und ist nachgezogen.

> **Was ein Ansichtstest wert ist, bleibt begrenzt.** Er rendert und klickt,
> aber jeder Datenbankzugriff ist ersetzt: er findet Bedienfehler und
> Verdrahtungsfehler, keine Datenfehler. Der wertvollste Fund dieser Runde ist
> genau ein Verdrahtungsfehler-Test: die Nachkalkulation muss mit den
> KOSTEN-, nicht den Verrechnungssätzen rechnen. Die Formel dafür war immer
> richtig; geprüft war nie, welche Zahl hineingeht.
>
> Nebenbei aufgefallen und behoben: in den Firmendaten trugen zwei Felder die
> gleiche Beschriftung „Schrift darauf". Auf dem Bildschirm ordnet die Nähe
> das zu, eine Sprachausgabe liest die Beschriftung ohne ihre Umgebung.

**Wiederkehrende Wartungen seit dem 07.09.2026.** Die jährliche
Thermenwartung ist der einzige Umsatz eines Installateurs, der sich ein Jahr
im Voraus planen lässt. Geführt wurde sie bisher im Kalender oder im Kopf —
und dort geht sie nicht auffällig verloren, sondern still: sie fällt in einem
vollen Frühjahr niemandem ein, und der Kunde beschwert sich nicht, dass
niemand gekommen ist. Er wechselt beim nächsten Gebrechen den Betrieb.

> **Der Bereich lebt an einem einzigen Schritt: „erledigt eintragen".** Damit
> rückt der nächste Termin nach — gerechnet ab dem Tag der AUSFÜHRUNG, nicht
> ab dem geplanten Termin, weil das Wartungsintervall ab der letzten
> tatsächlichen Wartung läuft. Ohne diesen Schritt wäre die Liste nach einem
> Jahr eine Sammlung roter Zeilen, die niemand mehr ernst nimmt.
>
> Die Terminrechnung schlägt am Monatsende an: der 31. August plus sechs
> Monate ist der 28. Februar, nicht der 3. März. Ohne diesen Anschlag wandert
> der Termin bei jedem Durchlauf ein Stück, und nach ein paar Jahren steht
> die Sommerwartung im Herbst.
>
> Seit dieser Änderung laufen die Tests in `Europe/Vienna` statt in UTC. Ein
> Test, der eine Zeitumstellung prüft, prüfte auf einem Bauserver in UTC
> nichts — dort gibt es keine. `wartungsplan.test.ts` stellt eigens fest, dass
> die Einstellung wirkt.

**Mahnwesen seit dem 07.09.2026.** Vorher gab es den Status „Überfällig" — er
wurde beim Öffnen der Liste gesetzt und angezeigt, mehr nicht. Kein
Mahndatum, keine Stufe, kein Schreiben; der Betrieb führte das Mahnen im Kopf.
Jetzt drei Stufen mit eigenem Text und eigenem Beleg, änderbarer Frist und
Mahnspesen aus den Einstellungen.

**Die eigene Frist zählt seit dem 16.09.2026 mit.** Bis dahin prüfte der
Mahnlauf nur das ursprüngliche Zahlungsziel. Wer gestern eine
Zahlungserinnerung mit einer Woche Frist verschickt hatte, bekam die Rechnung
heute wieder angeboten — für Stufe 2, sechs Tage vor Ablauf der Frist, die er
selbst gesetzt hat. Am Bildschirm sah das aus wie Arbeit; in Wirklichkeit war
es eine Aufforderung, dem Kunden die zugesagte Frist wieder zu nehmen.

> **Aufgefallen ist es erst durch das Abzeichen im Menü.** Solange es eine
> Liste war, sah niemand den Unterschied zwischen „steht da, weil es dran ist"
> und „steht da, weil es überfällig ist". Als ZAHL wäre es eine Zahl, die
> jeden Tag leuchtet, solange auch nur eine Rechnung offen ist — und eine
> Meldung, die immer an ist, ist keine. Die Regel steht jetzt an zwei Orten
> (`mahnung.ts:laufendeFrist` und `app.mahnung_faellig`), weil das Abzeichen
> zählen muss, was die Liste zeigt; `tests/unit/mahnfrist.test.ts` hält beide
> aneinander, bis auf die Zahl der Tage.

> **Verzugszinsen werden bewusst NICHT gerechnet.** Zwischen Unternehmern sind
> es 9,2 Prozentpunkte über dem Basiszinssatz (§ 456 UGB) — und der ändert
> sich halbjährlich. Eine hier hinterlegte Zahl veraltet still und steht danach
> auf jeder Mahnung falsch; eine falsch berechnete Zinsforderung ist schlechter
> als keine.

**Reverse Charge seit dem 07.09.2026.** Erbringt der Betrieb eine Bauleistung
an einen anderen Bauunternehmer — als Subunternehmer —, geht die
Umsatzsteuerschuld auf den Empfänger über (§ 19 Abs 1a UStG). Ein Haken je
RECHNUNG, nicht am Kunden: derselbe Baumeister kann ein Werkzeug kaufen (20 %)
und eine Installation beauftragen (Übergang). Ohne die UID des Empfängers
lässt sich die Rechnung nicht anlegen — ohne sie ist der Übergang nicht
belegt.

> **Vorgefunden wurde eine Falle, und zwar ZWEIMAL:** im USt-Feld stand
> „0 % (Reverse Charge)" — einmal in den Einstellungen, einmal in einer
> zweiten Fassung desselben Formulars in der Rechnungsansicht. Das setzte nur
> den Satz auf null; weder der Pflichthinweis noch die UID kamen auf den
> Beleg, und als Vorgabe hätte es für JEDE Rechnung gegolten, auch die an
> Privatkunden.
>
> Beim Beheben ist mir die zweite Stelle durchgegangen — aufgefallen ist es
> erst beim Durchsuchen des ausgelieferten Bundles. Dagegen hilft kein
> Ansichtstest, sondern ein statischer Abgleich über ALLE Dateien
> (`tests/unit/reverseChargeKeinSatz.test.ts`), dasselbe Muster wie bei
> Navigation ↔ Routen.

**Die Rechnung schliesst den Kreis erst seit dem 07.09.2026.** Bis dahin
verrechnete diese App ausschliesslich STUNDEN — bei einem Installateur schnell
die halbe Rechnungssumme, die das Büro von Hand nachtippte. Und der
Leistungszeitraum, Pflichtangabe nach § 11 Abs 1 Z 4 UStG, fehlte auf jedem
Beleg. Beides ist jetzt vorbereitet und beides bleibt änderbar: Material aus
den unterschriebenen Scheinen lässt sich in der Vorschau bearbeiten und
entfernen, der Zeitraum ist vorbelegt und überschreibbar.

> **Was ein Automatismus hier NICHT heissen darf.** Eine Rechnung ist selten
> genau das, was die Belege hergeben — eine Anfahrt kommt dazu, eine Stunde
> wird erlassen, ein Pauschalposten ersetzt drei Zeilen. Wer das nicht in der
> App tun kann, tut es danach in Word, und dann stimmt die Rechnung im System
> nicht mehr mit der überein, die der Kunde bekommen hat.

**Die Ansichtstests sind seit dem 19.09.2026 vollständig: alle 28 Ansichten
haben einen eigenen.** Angefangen hat es mit den vier wichtigsten
(Zeiterfassung, Rechnungen, Einsatzplanung, Baustellen), danach kam der ganze
MATERIALABLAUF über drei Ansichten hinweg — anfordern, bearbeiten, Bestand
führen —, zuletzt die kleineren.

**Warum der Materialablauf als GANZES geprüft wurde und nicht Ansicht für
Ansicht:** der Fehler, den er zutage gefördert hat, lag in keiner der drei
Ansichten. Er lag in der Regel darunter — der Monteur durfte den Lagerbestand
nicht mehr bewegen, seit der Materialstamm eingegrenzt wurde, und damit tat
sein „Abgeholt"-Knopf nichts. Wer eine Ansicht allein prüft, sieht so etwas
nie.

**Und die Einschränkung gilt unverändert:** in jedem dieser Tests ist jeder
Datenbankzugriff ersetzt. Sie prüfen die Verdrahtung — welche Zahl in welche
Kachel geht, in welcher Reihenfolge geschrieben wird, was passiert, wenn ein
Ladevorgang scheitert. Eine an den Richtlinien scheiternde Abfrage finden sie
weiterhin nicht; dafür sind die Datenbanktests da, und für die Naht dazwischen
der Durchklick im echten Browser.

**Warum das nicht theoretisch ist.** Jeder Fehler, der bisher aus dem Betrieb
gemeldet wurde, lag in den Nähten, die ersetzte Datenbankzugriffe per
Konstruktion nicht sehen:

| Gemeldet | Ursache | Wird jetzt abgefangen? |
|---|---|---|
| Kundenakte ohne Baustellen | fehlender Firestore-Index | **Gegenstandslos** — Postgres kennt keine Pflichtindizes; eine Abfrage ohne Index ist langsam, nicht leer. Dafür prüft `schema.test.ts`, dass jede Mandantentabelle einen Index mit `company_id` oder einem Fremdschlüssel als führender Spalte hat. |
| Projektleitung: fünf Reiter mit „Kein Zugriff" | drei Listen behaupteten dasselbe und waren auseinandergelaufen (`navigation.ts`, `RequireRole`, `permissions.ts`) | **Ja** — der Abgleich Navigation ↔ Routen. Und die Doppelung selbst ist weg: `RequireNav` liest aus derselben Liste. |
| Leeres Auswahlfeld beim Schein | verschluckter Fehler | **Teilweise** — die Datenbanktests finden eine Abfrage, die am Zeilenschutz scheitert; eine schlicht leere Menge finden sie nicht. |
| „Lädt ewig" (Schein) | Serveraufruf ohne Frist | **Ja** — die Frist liegt in `lib/frist.ts` und ist geprüft |
| „iPhone lädt gar nicht" | Start hing an zwei Abfragen ohne Zeitgrenze; kein Vorhalten der App-Hülle | **Teilweise** — Frist und Service Worker sind geprüft, die Wirkung auf einem echten Gerät ist es nicht |
| Unterschrift ohne Wirkung | `canvas.width` löscht die Fläche | **Ja, seit dem Durchklick** — „Schein unterschreiben" läuft in einem echten Chromium. Auf einem echten iPhone bleibt es die Bestätigung des Betriebs vom 07.09.2026. |

**Der Nebenläufigkeitstest verdient seinen Platz, und das ist nachgemessen.**
Der Lagerabzug läuft als Durchstich gegen eine echte Datenbank, mit zwei
GLEICHZEITIGEN Abschlüssen derselben Anforderung. Der Fall ist keine Theorie:
Verwaltung und Projektleitung arbeiten dieselbe Liste ab, oft am selben
Vormittag; ohne Transaktion ginge der Bestand zweimal herunter, und beide
Klicks meldeten Erfolg.

> Ersetzt man die Transaktion durch ein schlichtes Lesen-dann-Schreiben,
> bleibt die Gegenprobe „zweimal nacheinander" GRÜN — das `processed`-Flag
> steht beim zweiten Klick ja schon. Nur der gleichzeitige Fall fällt durch.
> Genau dafür ist er da.

## Was am Prüfnetz noch fehlt

1. **Die vier Edge Functions laufen ungetestet.** Was sie tun, ist geprüft —
   aber an der Datenbank, nicht an der Function: `betrieb-anlegen` und
   `mitarbeiter-anlegen` an der Datenbankfunktion darunter, die Ausleitung an
   ihren Entscheidungen (welcher Pfad, was darf gelöscht werden, wie sieht
   eine Zeile aus), die Push-Meldung am Auslöser und am Empfängerkreis. Das
   Lesen und Schreiben der Function selbst hat nie ein Test ausgeführt. Das
   ist die grösste verbliebene Lücke.

2. **Ein zweiter Betrieb in der echten Auslieferung.** Die Mandantentrennung
   ist gegen eine echte Datenbank geprüft, einschliesslich zweier Betriebe
   nebeneinander. Was fehlt, ist der Betrieb, der tatsächlich bei jemand
   anderem läuft.

3. **Ein echtes Telefon.** Der Durchklick läuft in Chromium; Chromium ist
   nicht Safari, und ein Laptopfenster ist kein iPhone. Die Unterschrift ist
   im Mechanismus nachgewiesen und vom Betrieb einmal bestätigt — automatisch
   abgesichert gegen Rückfall ist sie auf iOS nicht.

4. **Nebenläufigkeit ausserhalb des Lagerabzugs.** Zwei gleichzeitige
   Rechnungsläufe auf derselben Baustelle etwa. Der Nummernkreis ist
   abgesichert (`for update`), der Rest ist es nicht nachgewiesen.

5. **Dass die nächtlichen Auslöser in Produktion feuern.** Dafür gibt es die
   Überwachung, die es MELDET, wenn ein Lauf ausbleibt — aber keinen Test, der
   es vorher zusichert.

> **Eine Lehre aus der Navigation, die bleibt.** Von 18 Reitern auf 14 zu
> verdichten war zur Hälfte richtig: die Einstellungen (Sätze, Module,
> Sicherung) richtet man einmal ein — das ist wirklich ein Bereich. Material
> dagegen ist seit 03.09.2026 wieder getrennt, auf klare Ansage aus dem
> Betrieb: es sind drei Blicke auf dasselbe THEMA, aber drei verschiedene
> TÄTIGKEITEN von drei verschiedenen Leuten. **Die richtige Frage ist nicht,
> ob etwas thematisch zusammengehört, sondern ob es dieselbe Person in
> derselben Situation tut.**

## Eine Ungereimtheit, die noch offen ist

Die **Nachkalkulation** ist bewusst Geschäftsführungssache, weil sie Margen
zeigt. Die **Angebote** stehen dagegen auch der Projektleitung offen — und
darin steht die Vorkalkulation mit den Kostensätzen, also die Marge des
einzelnen Auftrags. Entweder ist die eine Grenze zu eng oder die andere zu
weit; entschieden ist es nicht. Das ist eine Produktfrage, keine
Programmierfrage: sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll.
