# Durchsicht der ganzen Software — Plan (15.11.2026)

Auftrag: Überblick über alle Abläufe, Analyse auf Fehler, Lücken und Schwächen,
Durchsicht der Bildschirme (vor allem mobil), Mikro-Animationen, Ladezeiten,
Funktionen mit Mehrwert. **Das hier ist der Plan. Umgesetzt ist davon nichts**
(Grundsatz 5: erst auf Ansage).

Stand der Analyse: `main` 062407b (nach E94).

## Wie die Analyse entstanden ist — und was sie nicht ist

- Sieben Tiefenanalysen je Fachgebiet (nur gelesen, Code bis in die Datenbank
  verfolgt). Die Einzelberichte mit Datei und Zeile liegen in
  `docs/durchsicht-2026-11-15/analyse/`.
- Rundgang durch die Vorschau: 99 mobile Aufnahmen (390 px, drei Rollen, auch
  geöffnete Fenster) und zwölf Seiten am Schreibtisch. Keine Laufzeitfehler.
- **Kennzeichnung je Punkt:**
  **✔** = von mir im Code oder im Browser nachgeprüft.
  **○** = aus der Analyse belegt, von mir nicht einzeln nachgestellt — wird vor
  der Umsetzung mit einer Prüfung nachgestellt (rot ohne, grün mit der Änderung).
- **Nicht geprüft:** echtes iPhone/Android, gehostete Datenbank, Edge Functions
  im Betrieb, PDF-Inhalte im Einzelnen, DATANORM-Übernahme, Liegenschaften,
  Pläne/Dokumente, der Rechenkern AZG/KJBG und Überstunden nur überflogen.
  Die Analyse hat keine Testsuite laufen lassen.
- **Unauffällig:** Mandantentrennung, Zeilenschutz, Rechte der Edge Functions,
  lückenlose Rechnungsnummer, Doppelverrechnung, Bestandsführung bei
  gleichzeitiger Ausgabe, Zustandsübergänge der Scheine — hier fand die Analyse
  keinen Fehler.

Schwere: **hoch** = falsche Zahl, verlorene Eingabe, Zustand ohne Ausweg oder
gebrochene Zusage. **mittel** = Ablauf lückenhaft oder irreführend.
**niedrig** = Randfall oder Schönheitsfehler.

---

## S — Sofort

| # | Punkt | Lösung |
|---|---|---|
| S1 ✔ **erledigt (15.11.2026, Stand §95)** | **Speicherleiste der Firmendaten ist weiter zerlegt** (Rahmenstücke, Linie durch „Speichern“). Ursache: seit #455 liegt die Kontur jedes Blatts als Ebene 11 über dem Inhalt; die frei klebende Leiste liegt auf Ebene 10. Rollt ein Blatt unter der Leiste durch, wird seine Kontur über die Leiste gezeichnet. Mein „Fix“ in #456 (innere Linie statt Umriss) war eine Fehldiagnose. Betroffen: Firmendaten am Handy und Tablet, Sprungleiste der Angebotsakte am Tablet. | Die Kontur bleibt im Blatt eingeschlossen (eigener Stapel je Blatt), sodass sie nur den Inhalt *dieses* Blatts überdeckt. Vorher prüfen, dass Menüs in Blättern weiter über Nachbarblättern liegen. Neue Prüfung, die die *Schichtung* misst (welches Element liegt an einem Punkt der Leiste oben), nicht nur das Bild — der Bildvergleich aus #456 konnte diesen Fehler nicht finden. Die Erklärung im Handbuch („Safari zeichnet nicht mit“) wird berichtigt. |
| S2 ✔ **erledigt (15.11.2026, Stand §96)** | **Der Taktgeber setzt Blätter gelegentlich eine Zelle zu hoch** (gefunden bei S1). Startseite am Handy: in einem von sechs Ladevorgängen bekommt das zweite Blatt −15 px statt 9 px Abstand und stößt an das erste; auf weiteren Seiten (Sätze, Benutzerakte, Scheine) wechselt der Abstand zwischen Blättern von Lauf zu Lauf. Gemessen in der Vorschau, nach 3 s unverändert — es wird also nicht nachgezogen. | Ursache im Taktgeber (`src/lib/takt.ts`) nachstellen (Reihenfolge von Messung, Schriften und nachgeladenen Daten); der Abstand muss nach jedem Laden derselbe sein. Prüfung: mehrfach laden und Abstände vergleichen. |

---

## 1. Fehler und Lücken in den Abläufen

### Z — Zeit, Abwesenheit, Personal

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| Z1 ✔ **erledigt (Welle 2, 15.11.)** | hoch | **Genehmigter Urlaub/Zeitausgleich einer anderen Person lässt sich nicht zurücknehmen**, solange das Modul Urlaub an ist. „Zurücknehmen“ gibt es nur am eigenen Antrag; der Knopf am Urlaubstag springt auf die Urlaubsseite, wo der fremde Antrag fehlt. | Liste „Genehmigt, noch nicht vorbei“ für alle, die entscheiden dürfen: zurücknehmen und kürzen (früher zurück, einen Tag streichen), mit Grund und Verlauf. Der Sprung vom Tag öffnet genau diesen Antrag. |
| Z2 ○ **erledigt (Welle 2, 15.11.)** | hoch | **Austritt/Deaktivieren räumt nichts auf.** Urlaub und Krank nach dem Austrittstag werden weiter gutgeschrieben (4 Urlaubstage danach = +32 Std Gesamtsaldo), offene Anträge und ein laufender Timer bleiben liegen; „Konto aktivieren“ rechnet die Lücke als Soll. | „Austritt in einem Zug“: beim Setzen des Austritts zeigt die Akte, was danach noch gebucht, genehmigt, beantragt, eingeplant oder am Laufen ist — je mit einem Handgriff. Die Saldorechnung endet am Austrittstag; Wiedereintritt beginnt neu. |
| Z3 ✔ **erledigt (Welle 2, 15.11.)**, mit Z3a/Z3b | hoch | **Wochenstunden, Arbeitstage, Tagessoll und Urlaubstage haben kein „gültig ab“.** Jede Änderung rechnet rückwirkend ab Saldostart (40→30 Std: +936 Std; 25→30 Urlaubstage: 40 statt 35 Tage). Die Rechnung bewertet Abwesenheiten bewusst „mit der aktuellen Konfiguration“. | Arbeitszeit und Urlaubsanspruch als Verlauf mit „gültig ab“ (wie die Einstufung es schon hat). Die Monatsbilanzen speichern das Soll des Monats mit. Bestehende Daten: ein Eintrag „gültig ab Saldostart“ mit den heutigen Werten — nichts wird umgeschrieben. Löst zugleich L1/L2. |
| Z4 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Eine ohne Netz vorgemerkte Zeitbuchung, die nicht ankommt, ist weg** — ohne Tag und Grund; auch gültige Buchungen nach etwa fünf Minuten Serverstörung. Vorgemerktes steht nicht in „Meine Einträge“. | Wie beim Timer schon gebaut: abgelehnte Buchung bleibt als Entwurf mit Tag und Grund zum Wiederöffnen; wartende Buchungen stehen in der Liste als „wartet auf Verbindung“. Wiederholen ohne feste Obergrenze, solange der Server nur nicht antwortet. |
| Z5 ○ **erledigt (Welle 2, 15.11.)** | mittel | **„Resturlaub“ in Übersicht und Monats-CSV ist kein Monatsende-Stand** — er zieht künftigen Urlaub mit ab und hängt vom Exporttag ab. | Zwei klar benannte Zahlen: „Rest am Monatsende“ und „davon schon verplant“. |
| Z6 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Kein Monatsabschluss.** Der Monteur ändert und löscht eigene Buchungen beliebig alter Monate, auch nach dem Lohnexport. | Monatsabschluss je Monat (abschließen, mit Grund wieder öffnen); danach nur noch Korrekturantrag — den gibt es schon. Einstellung je Betrieb (entschieden, E1). |
| Z7 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Scheitert das Laden der Urlaubstage, rechnen Übersicht und CSV still mit null Tagen.** | Teilfehler anzeigen („Urlaub nicht geladen“), Zahl als unbekannt statt null, Export gesperrt bis geladen. |
| Z8 ○ **erledigt (Welle 2, 15.11.)** | niedrig | Monats-CSV: Summe der Detailspalte weicht vom Ist ab (153,40 gegen 153,33). Stundennachweis „auch für Kunden“ zeigt Krank und andere Kunden. Personen-Exporte laden alle Personen. Ganztägiger Zeitausgleich wird mit 0 Tagen genehmigt. | Eine Rundungsregel für Minuten in allen Ausgaben; Stundennachweis je Baustelle/Kunde ohne Abwesenheiten (F12); Exporte je Person abfragen; Zeitausgleich in Tagen prüfen. |
| Z9 **erledigt (Welle 2, 15.11.)** | niedrig | Die Push-Meldung zu einer Entscheidung über Urlaub oder Zeitausgleich (genehmigt, abgelehnt, zurückgenommen) führte nur auf die Urlaubsseite; die Person musste ihren Antrag suchen (gefunden bei Z1). | Die Meldung springt mit `?antrag=` auf genau diesen Antrag, wie schon „gekürzt“. |
| Z10 Verdacht, bestätigt, **erledigt (Welle 3, 15.11.)** | mittel | „Meine Einträge“ zeigte in einem Prüflauf ohne Netz „Das hat nicht geklappt — Failed to fetch“ und erholte sich nicht (gefunden bei Z4). Weder auf `main` noch auf dem Stand von Paket 4b nachgestellt. | Zuerst nachstellen (Live-Abo `abonnieren`, `TimeView`); nur bei Bestätigung: bei Netzfehlern den letzten Stand stehen lassen, den Fehler beim nächsten Erfolg zurücksetzen — für alle Live-Listen gleich. |
| Z11 **erledigt (Welle 2, 15.11.)** | mittel | **0 Wochenstunden zählten als 40** (`Number(x) \|\| 40` in der App, `nullif(x, 0)` in der Datenbank) — entgegen dem Benutzerformular; rund 170 Minusstunden im Monat (gefunden bei Z3). | 0 heißt kein Soll, in App und Datenbank gleich; leer bleibt die Vorgabe 40. |
| Z12 **erledigt (Welle 2, 15.11.)** | mittel | **Krank/Urlaub an einem freien Tag:** der Gesamtsaldo schrieb das Tagessoll gut, die Monatsauswertung nicht — beide Zahlen widersprachen sich (gefunden bei Z3). | Gutschrift für ganztägige und stundenweise Abwesenheiten nur an Tagen mit Soll, in App und Datenbank; der Tag zählt weiter als gebucht. Salden können dort sinken, wo solche Tage gebucht sind. |

### A — Vom Kontakt zur Baustelle

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| A1 ○ **erledigt (Welle 2, 15.11.)** | hoch | **Ein angenommenes Angebot hat keinen Rückweg** (Fehlklick, Rücktritt des Kunden). Die Baustelle lässt sich nicht löschen, weil das Angebot auf sie zeigt; die Meldung nennt falsche Gründe; die andere Fassung bleibt „Ersetzt“. | „Annahme zurücknehmen“: Baustelle ohne Buchungen wird gelöscht, sonst abgeschlossen; Fassungen wieder offen; mit Grund im Verlauf. Die Löschmeldung nennt den wahren Grund und den Weg. |
| A2 ✔ **erledigt (§97)** | mittel | **Die Lieferantennummer am Kunden wird nicht gespeichert**, die Oberfläche meldet „Gespeichert“. Die Datenbankfunktion `kunde_umbenennen` kennt das Feld nicht. | Funktion um das Feld ergänzen und so bauen, dass ein unbekanntes Feld abgewiesen statt verschluckt wird; Prüfung gegen die Datenbank, die jedes Feld der Maske einmal ändert und zurückliest. |
| A3 ○ **erledigt (Welle 2, 15.11.)** | mittel | **„Angebot anlegen und annehmen“ in der Baustellenakte legt eine zweite Baustelle an**; einen Nachtrag zu einer laufenden Baustelle gibt es nicht. | Beim Annehmen wählen: „neue Baustelle“ oder „an Baustelle …“ (Budget addiert sich, Angebot steht in der Akte). |
| A4 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Der alte Annahme-Link bleibt nach „Neue Fassung“ offen** — der Kunde kann die überholte Fassung verbindlich unterschreiben. | Mit der neuen Fassung wird der alte Link ungültig und zeigt „Es gibt eine neuere Fassung“; Widerruf eines Links als eigener Handgriff. |
| A5 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Ein leeres Angebot ist versendbar**; „als versendet/abgelehnt markieren“ wirkt mit einem Tipp, ohne Rückfrage und ohne Rückweg. | Versenden erst mit mindestens einer Position; Rückfrage; „zurück in den Entwurf“, solange kein Link geöffnet wurde. |
| A6 ✔ **erledigt (Welle 2, 15.11.)** | mittel | **„Offen“ in der Angebotsliste filtert nur die zuletzt geladenen** — ältere versendete Angebote mit abgelaufener Frist fallen heraus. | Offene Angebote über eine Datenbankabfrage nach Zustand, seitenweise; die Zahl im Kopf aus derselben Quelle. |
| A7 ✔ **erledigt (§97)** | mittel | **Das Eingangsformular behält den Ort des vorigen Kunden**, wenn man den Kunden wechselt — die falsche Adresse geht in Baustelle oder Angebot. | Ort folgt dem Kunden, solange ihn niemand von Hand geändert hat. |
| A8 ○ **erledigt (Welle 2, 15.11.)** | mittel | Ansprechpartner vor Ort, Dringlichkeit und Wunschtermin gehen auf dem Weg Eingang → Angebot → Baustelle verloren. | Felder durchreichen; in Angebot und Akte sichtbar. |
| A9 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Wartung „Erledigt“ hängt an niemandem**: eine eingeplante Wartung verschwindet von der Startseite; Schein, Baustelle und Rechnung stoßen „Erledigt“ nicht an; der nächste Termin entsteht nur von Hand. | Unterschriebener Schein oder abgeschlossene Baustelle einer Wartung schlägt „Erledigt am …“ vor; bis dahin bleibt sie auf der Startseite. |
| A10 ○ **erledigt (Welle 2, 15.11.)** | mittel | Rechnungen in der Kundenakte laden ab etwa 220 Baustellen nicht mehr (Adresse zu lang). | Abfrage über den Kunden in der Datenbank statt über eine Liste von Kennungen. |
| A11 ○ **erledigt (Welle 2, 15.11.)** | mittel | **„Abgeschlossen“ ist nur ein Auswahlfeld** — es prüft keine offenen Einsätze, Entwürfe, Anforderungen und kein ausgegebenes, unverrechnetes Material; nichts schließt eine Baustelle. „Aktiv“ wächst auf die Auswahlgrenze von 500 zu. | Geführtes Abschließen (F1); Auswahlfelder über Suche statt Liste, damit keine Grenze trägt. |
| A12 ○ **erledigt (Welle 2, 15.11.)** | niedrig | Import ohne Kundenart; Kundenakte zeigt höchstens 300 Baustellen ohne Hinweis; abgelehnter Eingang lässt den Besichtigungstermin stehen; Angebotsdatum nicht änderbar; umbenannter Kunde steht in Wartungen und Entwürfen mit altem Namen. | Je Punkt kleine Korrektur; Listen seitenweise; Namen an einer Stelle nachziehen. |
| A13 **erledigt (Welle 2, 15.11.)** | mittel | „Wartung erledigt“ ohne Baustelle erbte die Baustelle der vorigen Wartung (B14, gefunden bei A9); dort ließ sich eine zweite Wartungsrechnung stellen. | Leer heißt ohne Baustelle, auf jedem Weg (Funktion und Trigger für alte App und Formular). |
| A14 **erledigt (Welle 2, 15.11.)** | mittel | Ein Angebot ohne Position ließ sich annehmen (Baustelle mit Budget 0) — A5 sperrte nur Versand und Link (gefunden bei A5). | Annahme nur mit mindestens einer Position, an jedem Weg; Link eines leeren Angebots gilt als ungültig. |

### P — Planung und Arbeit vor Ort

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| P1 ✔ **erledigt (§97)** | hoch | **Das offene Einsatzformular wird zurückgesetzt, sobald irgendwer im Betrieb einen Einsatz oder eine Rüstliste berührt** (z. B. der Monteur hakt morgens Material ab): Mannschaft, Kommentar, Uhrzeit und ungespeicherte Rüstliste sind weg. | Das Formular übernimmt Live-Daten nur beim Öffnen und beim Wechsel der Baustelle. Kommt währenddessen eine fremde Änderung, steht ein Hinweis „Inzwischen geändert — übernehmen?“ statt stiller Überschreibung. Dasselbe Muster für alle Formulare über Live-Listen prüfen. |
| P2 ✔ **erledigt (Welle 2, 15.11.)** | hoch | **Einsatz verschieben oder entfernen lässt die Rüstliste am alten Tag zurück**; Reservierung und Fehlmengen bleiben verwaist. Auf eine andere Person verschoben, erbt sie das Helfer-Kennzeichen des Vorgängers (falscher Satz in der Zeitbuchung). | Rüstliste und Fehlmengen-Anforderung ziehen in derselben Datenbankfunktion mit; beim Entfernen des Letzten die Frage „Rüstliste auflösen?“. Helfer-Kennzeichen kommt von der neuen Person. |
| P3 ✔ **erledigt (Welle 2, 15.11.)** | mittel | **„Nicht verrechnet“ sieht nur die 60 zuletzt angelegten Scheine** — die Vier-Wochen-Warnung kann ab etwa fünf Monteuren praktisch nie auslösen. | Zählung und älteste Scheine aus einer Datenbankfunktion über alle unterschriebenen, unverknüpften Scheine. Zähler, Liste und Schwelle aus einer Quelle. |
| P4 ○ **erledigt (Welle 2, 15.11.)** | mittel | Ein schon verrechneter Schein lässt sich ohne Hinweis stornieren; der Ersatzschein wird erneut zur Verrechnung vorgeschlagen (Material doppelt). | Storno prüft die Verrechnung und sagt, was mit der Rechnung zu tun ist; der Ersatzschein erbt die Verknüpfung. |
| P5 ○ **erledigt (Welle 2, 15.11.)** | mittel | Zweiter Schein am selben Tag: alle Stunden werden erneut vorgeschlagen und sind nicht entfernbar — der Kunde unterschreibt dieselben Stunden zweimal. | Schon auf einem Schein stehende Stunden nicht erneut vorschlagen; Zeilen entfernbar. |
| P6 ○ **erledigt (Welle 2, 15.11.)** | mittel | Die Erinnerung „Zeit nachtragen“ liest höchstens 20 eigene Scheine. | Über eine Datenbankabfrage „Scheine ohne Buchung“, ohne feste Zahl. |
| P7 ○ **erledigt (Welle 2, 15.11.)** | mittel | Das Formular kennt nur eine Aufgabe/Uhrzeit je Tag und Baustelle; abweichende Zeilen werden beim Speichern still angeglichen. | Abweichungen je Person anzeigen und erhalten; angleichen nur auf Wunsch. |
| P8 ○ **erledigt (Welle 2, 15.11.)** | mittel | Der Zähler „Baustellen ohne Einsatz“ und die Zielliste rechnen verschieden. | Beide aus derselben Datenbankfunktion. |
| P10 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Einstellungskarten verlieren ungespeicherte Eingaben**, wenn eine andere Karte derselben Seite speichert (gefunden bei P1, nicht nachgestellt): `SettingsView`, `LohnregelnKarte`, `SonderurlaubKarte`, `KatalogEinstellungenKarte`, `ModulesView`, `PapierkorbFristKarte`, `NachrichtenEinstellungen` übernehmen den Betrieb per Effekt an `company`; `reloadCompany()` setzt immer ein neues Objekt. Verdacht vor allem auf `/settings/personal`. | Wie P1: Inhalt statt Identität vergleichen, Eingaben stehen lassen; erst nachstellen. |
| P9 ○ **erledigt (Welle 2, 15.11.)** | niedrig | „Lieferung ohne Annahme“ ignoriert Abwesenheit; Auslastung zählt Betriebsurlaub als verfügbar; das Kalender-Abo zeigt Einsätze an Abwesenheitstagen. | Abwesenheit an einer Stelle berechnen und überall verwenden. |

### G — Geld

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| G1 ✔ **erledigt (§97)** | hoch | **„Konditionen für diese Rechnung anpassen“ (Stundensatz, Zahlungsziel, Skonto, USt-Satz) bleiben nach dem Ausstellen stehen** und gelten still für jede weitere Rechnung bis zum Neuladen. Zahlungsziel und Skonto stehen in keiner Vorschau; der Beleg ist danach eingefroren. | Nach dem Ausstellen und bei jedem Wechsel der Baustelle zurück auf die Sätze des Betriebs. Zahlungsziel, Skonto, Rücklass und Zahlbetrag als feste Zeile unter den Summen der Vorschau; abweichende Konditionen dort markiert. |
| G2 ○ **erledigt (Welle 2, 15.11.)** | mittel | Nach einem Netzabbruch beim Anlegen bleibt die Erstellung für jede weitere Vorschau gesperrt; Ausweg ist nur Neuladen, dabei gehen die Angaben verloren. | Jeder Erstellungsversuch bekommt eine Kennung, die die Datenbank mitschreibt — damit lässt sich sicher feststellen, ob die Rechnung entstand, und die Sperre löst sich von selbst. (War in `premium-2026-10-28.md` als Grenze benannt, weil damals keine Datenbankänderung erlaubt war.) |
| G3 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Mahnspesen rechnen nach drei Modellen** (Einstellung: Summe aller Stufen; Brief: nur die Stufe; Verbuchung: letzte Mahnung minus bisherige Eingänge). Zahlt der Kunde nach einer Teilzahlung genau den Betrag aus Mahnung 3, werden 13,16 € zu Guthaben. | Eine Rechenfunktion für Spesen und Zinsen, die Einstellung, Brief und Verbuchung gemeinsam verwenden; das Schreiben nennt schon Bezahltes. |
| G4 ○ **erledigt (Welle 2, 15.11.)** | mittel | Eine Schlussrechnung mit Rest 0,00 € bleibt für immer „Offen“. | Rest null gilt als bezahlt, sobald sie ausgestellt ist. |
| G5 ○ **erledigt (Welle 2, 15.11.)** | mittel | Rechnungsdatum, Zahlungsziel und das Jahr der Nummer kommen von der Geräteuhr; die Stornorechnung nimmt beides vom Server. | Datum und Jahr vom Server; abweichendes Datum nur ausdrücklich. |
| G6 ○ **erledigt (Welle 2, 15.11.)** | mittel | Nachdruck und Belegarchiv enthalten den Leistungsnachweis nie, obwohl der Haken beim Anlegen vorbelegt ist. | Den Leistungsnachweis beim Ausstellen als Teil des Belegs festhalten und beim Nachdruck wieder ausgeben. |
| G7 ✔ **erledigt (§97)** | niedrig | **Rundung an der Halbcent-Grenze:** 4,25 h × 72,30 € ergibt 307,27 statt 307,28 €; beim Skonto rechnet die App 2,13 €, die Datenbank 2,14 €. 20 % USt ist nicht betroffen. | Eine Rundungsfunktion für Geld (kaufmännisch, auf Basis von Cent-Ganzzahlen), in App, PDF und Datenbank gleich; Prüfung mit Grenzfällen gegen die Datenbank. Bestehende Belege bleiben, wie sie sind. |
| G8 ○ **erledigt (Welle 2, 15.11.)** | niedrig | Nachdruck der Stornorechnung ändert seinen Text mit dem Zahlungsstand; Nachkalkulation zählt Skonto als Erlös; Lückenprüfung sieht keine Lücke an der Grenze zweier Exportzeiträume; „Bezahlt im Monat“ zählt Zahlungen auf stornierte Rechnungen mit. | Je Punkt gezielte Korrektur. |
| G9 Verdacht, bestätigt, **erledigt (Welle 2, 15.11.)** | mittel | Zwei gleichzeitige Zahlungseingänge (oder Eingang plus Storno) könnten den Zahlstand überschreiben. | Zuerst nachstellen; falls bestätigt: Rechnung in der Funktion sperren. |
| G10 **erledigt (Welle 2, 15.11.)** | mittel | Angebots- und Baustellennummern nahmen das Jahr von der Geräteuhr (gefunden bei G5). | Jahr vom Server; ein abweichendes Jahr gibt keine Nummer, sondern einen Hinweis auf die Uhr. |
| G11 **erledigt (Welle 2, 15.11.)** | mittel | `naechste_nummer` gab jeder Buchhaltung eine Rechnungsnummer ohne Rechnung — eine Lücke im lückenlosen Kreis (Ursache hinter N4, gefunden bei G5). | Rechnungsnummern nur noch in der Transaktion des Belegs, der sie verbraucht (Rechnung, Stornorechnung). |
| G12 **erledigt (Welle 3, 15.11.)** | niedrig | Die Einstellungen zeigen die „nächsten Nummern“ mit dem Jahr der Geräteuhr (`SettingsView`, gefunden bei G10). | Serverjahr verwenden (`naechste_belegnummer`); nur Anzeige. |
| G13 **erledigt (Welle 3, 15.11.)** | niedrig | Baustellenformular und „Baustelle anlegen“ aus einer Wartung schlugen die Baustellennummer mit dem Jahr der Geräteuhr vor (gefunden bei G12); vergeben wird vom Server. | Jahr und Zähler vom Server (`useBaustellenVorschlag`); ohne Verbindung als Beispiel mit Gerätejahr gekennzeichnet. |

### M — Material

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| M1 ✔ **erledigt (§97)** | mittel–hoch | **Ein Artikel mit Bestand lässt sich ohne Warnung löschen** — Bestand und Bewegungsprotokoll verschwinden mit. Hat er Anforderungen, scheitert das Löschen dagegen ganz, mit einer nichtssagenden Meldung. Der Dialog sagt nur „wird aus dem Katalog entfernt“. | Statt Löschen „auslaufen lassen“ (bleibt lesbar, nicht mehr anforderbar); endgültig löschen nur ohne Bestand, Bewegungen und Anforderungen — der Dialog sagt, was im Weg steht. Das Protokoll hängt nicht mehr am Löschen des Artikels. |
| M2 ✔ **erledigt (Welle 2, 15.11.)** | mittel | **Material fällt still aus der Rechnung:** vorgeschlagen wird nur, was *nach* dem letzten Leistungsende ausgegeben wurde. Eine Ausgabe am selben Tag nach der Rechnung oder eine nachträglich abgehakte Rüstliste wird nie mehr vorgeschlagen. | Verrechnet ist, was auf einer Rechnung steht (Verknüpfung je Ausgabe), nicht was vor einem Datum liegt. |
| M3 ○ **erledigt (Welle 2, 15.11.)** | mittel | Das Fahrzeuglager sinkt nie durch Verbrauch: der Schein bucht nicht. | Beim Unterschreiben die Differenz „auf dem Schein, aber nicht ausgegeben“ als Entnahme aus Hauptlager oder eigenem Fahrzeug anbieten (F10). |
| M4 ○ **erledigt (Welle 2, 15.11.)** | mittel | „Bestellt“ ist nicht rücknehmbar, keine Teillieferung. | Bestellung stornieren (mit Grund); „Geliefert“ mit Menge und Lieferschein-Nr. in einem Dialog. |
| M5 ○ **erledigt (Welle 2, 15.11.)** | mittel | Keine Teilausgabe, Mengenänderung oder Storno einer Anforderung — „Aus Lager“ ist alles oder nichts. | Teilmengen überall (F5); der Besteller kann zurückziehen und ändern, solange „Offen“ (die Datenbankregel gibt es schon). |
| M6 ○ **erledigt (Welle 2, 15.11.)** | mittel | Kommissionsware wird nach der Lieferung dauerhaft Lagerartikel und steht mit Bestand 0 als „knapp“ im Lager und auf der Startseite. | Lagerführung ist eine Eigenschaft des Artikels, nicht die Folge einer Lieferung. |
| M7 ○ **erledigt (Welle 2, 15.11.)** | mittel | Eine Retoure „neu“ des Monteurs schreibt sofort und unbegrenzt gut; nach der Rechnung kein Hinweis auf eine Gutschrift. | Annahme im Lager bestätigt die Gutschrift; Höchstmenge aus dem Ausgegebenen; Hinweis, wenn schon verrechnet. |
| M9 **erledigt (Welle 2, 15.11.)** | mittel (E8) | Ausgelaufene Lagerartikel mit Mindestmenge erscheinen weiter als „knapp“ (gefunden bei M1). Fachlich offen: soll ein ausgelaufener Artikel noch nachbestellt werden? | „knapp“ nur für nicht ausgelaufene Artikel (entschieden, E8). |
| M8 ○ **erledigt (Welle 2, 15.11.)** | niedrig | Freie Zeile mit Kommamenge blockiert „Abgeholt“; Lager kann „Beim Händler“ nicht wählen; Mengen ohne Einheit; Warenkorb-Fehler ohne Grund; Nachkalkulation mit heutigem Einkaufspreis. | Je Punkt gezielte Korrektur; Einkaufspreis zum Zeitpunkt der Ausgabe festhalten. |
| M10 **erledigt (Welle 2, 15.11.)** | mittel | Eine eingeladene Rüstlistenposition ohne Buchung (leeres Regal, ohne Lagerführung, ganz über die Anforderung) blieb bis zum Einsatztag reserviert (B11, gefunden bei M2). | Die Reservierung endet mit dem Haken „eingeladen“, an allen fünf Stellen der Rechnung. |
| M11 **erledigt (Welle 2, 15.11.)** | mittel | Nach dem Storno einer Bestellung (M4) bekam der Besteller keine Meldung; seine Anforderung blieb „In Bearbeitung“ (gefunden bei M4). | Meldung mit Grund an den Besteller; die Anforderung zeigt „Bestellung storniert“, bis wieder bestellt ist. |
| M12 **erledigt (Welle 2, 15.11.)** | mittel | Wareneingang im Lager und „Geliefert“ der Einkaufsliste buchten dieselbe Lieferung unabhängig voneinander (doppelter Bestand oder Anforderung bleibt „bestellt“, B17, gefunden bei M4). | Der Wareneingang erledigt die offenen Bestellungen des Artikels über denselben Weg wie „Geliefert“. |

### K — Konto, Sicherheit, Daten

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| K1 ✔ **erledigt (§97)** | hoch | **Nachricht melden bricht seine Zusage:** der Dialog sagt, der Absender erfahre nichts. Gehört der Absender zur Leitung, sieht er die Meldung samt Namen der meldenden Person und Grund und kann sie erledigen und löschen. | Meldungen über ein Mitglied der Leitung gehen nur an die übrige Leitung und sind für den Gemeldeten unsichtbar. Gibt es keine zweite Leitung, sagt der Dialog das vor dem Absenden. |
| K2 ○ **erledigt (Welle 2, 15.11.)** | mittel | **Verlorenes Telefon bekommt weiter Push-Meldungen** (auch Nachrichtenvorschau): „Auf allen Geräten abmelden“, Deaktivieren und neues Startpasswort lassen die Push-Anmeldungen stehen. | Alle drei Wege löschen die Push-Anmeldungen des Kontos in der Datenbank; Empfänger werden überall nach „aktiv“ gefiltert. |
| K3 ○ **erledigt (Welle 2, 15.11.)** | mittel | Der Nachtlauf der Sicherung arbeitet alle Betriebe in einem Aufruf ab (Frist 300 s) — mit vielen Betrieben werden die hinteren nie gesichert, die Wache meldet dann bei allen „Keine Antwort“. | Ein Anstoß je Betrieb (Warteschlange) oder Lauf mit Zeitbudget und Fortsetzung; die Wache meldet je Betrieb. |
| K4 ○ **erledigt (Welle 2, 15.11.)** | mittel | „Alle Daten herunterladen“ und die Datenauskunft brechen bei 8 MB ab (gemessen mit 40.000 Katalogzeilen). | Ausgabe in Teilen, wie es die Ausleitung schon kann — ohne Obergrenze. |
| K5 ✔ **erledigt (§97)** | mittel | **Die Anmeldemaske sagt bei jeder Ablehnung „Passwort prüfen“** — auch bei deaktiviertem Konto, deaktiviertem Betrieb oder ohne Netz. | Den Grund nennen, soweit es nichts verrät: kein Netz, zu viele Versuche, Konto oder Betrieb deaktiviert (erst nach richtigem Passwort). |
| K6 ○ **erledigt (Welle 2, 15.11.)** | mittel | Wird die Zwei-Faktor-Pflicht eingeschaltet, sehen angemeldete Kollegen ohne Faktor bis zu einer Stunde eine leere App ohne Erklärung. | Beim Einschalten zeigen, wer noch keinen Faktor hat; die App führt Betroffene sofort zur Einrichtung. |
| K7 ○ **erledigt (Welle 2, 15.11.)** | niedrig | Zweiter Faktor nach Rollenwechsel nicht zurücksetzbar; Support „Nur ansehen“ sieht einige Listen leer; Anhang-Adressen im offenen Gespräch laufen nach zehn Minuten ab; „Problem melden“ schickt bei Benutzernamen-Konten eine Kunstadresse. | Je Punkt gezielte Korrektur; Zurücksetzen des Faktors durch eine zweite Leitung mit Protokoll. |
| K8 **erledigt (Welle 2, 15.11.)** | mittel | Die nächtliche Ausleitung brach an einer Zeile über 1 MB ab (Seitennummern mit Lücken); der Nachtlauf des Betriebs scheiterte jede Nacht (gefunden bei K4). | Seiten lückenlos nummerieren, wie bei K4. |
| K9 **erledigt (Welle 2, 15.11.)** | niedrig | `konto_umstellungen` wurde bei der Löschung einer Person weder gelöscht noch genannt (N5 der Analyse). | Umstellungen des Kontos werden gelöscht und im Bericht gezählt; am Konto eines anderen bleibt die Zeile ohne Kennung und Namen. |
| K10 **erledigt (Welle 2, 15.11.)** | niedrig | Offene Passwort-Bitten (V14) blieben beim Deaktivieren des Kontos oder Betriebs offen und tauchten nach einem Aktivieren wieder auf (gefunden bei V14). | Sperren schließt offene Bitten mit dem Vermerk „deaktiviert“. |
| K11 **erledigt (Welle 3, 15.11.)** | mittel | Angemeldete Konten hatten auf 48 Tabellen und Sichten TRUNCATE, TRIGGER, REFERENCES und (Postgres 17) MAINTAIN aus der Vorgabe von Supabase — TRUNCATE und LOCK TABLE fragen den Zeilenschutz nicht; eine gesperrte Tabelle hält alle Betriebe an (gefunden bei F14). | Rechte entzogen, ebenso in der Vorgabe für neue Tabellen; MAINTAIN nur ab Postgres 17; Wächter in `schema.test.ts` mit Gegenprobe. |
| K12 **erledigt (Welle 3, 15.11.)** | niedrig | Die Löschung einer Person nannte das Bewegungsprotokoll des Lagers (`lagerbewegungen.erfasst_von_name`) nicht unter „aufbewahren“ (gefunden bei F14). | Eintrag mit Frist und Grund (§ 132 BAO), wie bei den Materialanforderungen. |

### T — Technik und Prüfwerkzeuge (Befunde aus Welle 3)

| # | Schwere | Punkt | Nachhaltige Lösung |
|---|---|---|---|
| T1 **erledigt (Welle 3, 15.11.)** | hoch auf älteren iPhones | `src/lib/wortfugen.ts` nutzte ein Lookbehind im regulären Ausdruck, obwohl auf Safari 14 gebaut wird — auf iPhones vor Safari 16.4 ein Syntaxfehler (gefunden bei F13). | Fang-Gruppe statt Lookbehind; Wächter `keinLookbehind.test.ts` über alle regulären Ausdrücke in `src/`. |
| T2 **erledigt (Welle 3, 15.11.)** | mittel | `scripts/ui-umbau/testbestand.mjs` startete schon beim bloßen Einbinden seinen ganzen Lauf und schrieb Testdaten in die lokale Datenbank (gefunden bei L11). | Anlegen nur bei eigenem Aufruf; Einbinden geprüft folgenlos. `--neu` entfernt den Betrieb `ui-testbestand` und legt ihn vollständig neu an. |
| T3 **erledigt (Welle 3, 15.11.)** | mittel | Seit Welle 2 blieben Zeiterfassung und Mitarbeiterübersicht in der Vorschau weiß: Attrappen der Datenschicht fehlten; die Attrappe für `beobachte…` gab ein Versprechen statt einer Aufräumfunktion zurück (gefunden bei L11 und 9a). | Fehlende Attrappen ergänzt; `vorschauErsatz.test.ts` prüft jedes Ersatzmodul unter `fest/` auf jeden Export. |

---

## 2. Wo Abläufe nicht nahtlos verknüpft sind

Der Kern des Versprechens „alle Abläufe perfekt verknüpft“. Jeder Punkt ist ein
fehlender nächster Schritt oder eine doppelte Eingabe.

| # | Punkt | Lösung |
|---|---|---|
| V1 **erledigt (Welle 2, 15.11.)** | **Abwesenheit ↔ Einsatzplan:** beim Genehmigen eines Urlaubs oder Erfassen einer Krankmeldung steht nirgends, dass die Person eingeteilt ist. | Im Dialog „an 3 Tagen eingeteilt“ mit Sprung in den Plan; auf der Startseite „Eingeteilte fehlen“ auch für morgen. |
| V2 **erledigt (Welle 2, 15.11.)** | **Baustelle abschließen** hat keinen Handgriff und keinen Anstoß (A11). | Geführter Abschluss (F1), angeboten nach bezahlter Schlussrechnung und nach „Wartung erledigt“. |
| V3 **erledigt (Welle 2, 15.11.)** | **Kundenakte ohne „Neu für diesen Kunden“** — Angebot, Baustelle, Eingang, Wartung beginnen in ihrer Liste, der Kunde wird noch einmal gesucht. Ebenso die Liegenschaftsakte. | Aktion in der Akte, Kunde und Ort vorbelegt. |
| V4 **erledigt (Welle 2, 15.11.)** | **Nach der Annahme kein nächster Schritt;** nach „Baustelle anlegen“ aus der Wartung sagt die Meldung „Jetzt im Einsatzplan einteilen“, führt aber nicht hin. | Die Meldung trägt den Sprung („Einsatz planen“). |
| V5 **erledigt (Welle 2, 15.11.)** | **Rüstliste → Schein:** was eingeplant und eingeladen wurde, wird am Schein nicht vorgeschlagen; der Monteur sucht jede Position noch einmal. | „Für diesen Einsatz eingeladen“ als Vorschlag am Schein, auch für Kollegen im Team. |
| V6 **erledigt (Welle 2, 15.11.)** | **Storno → neu ausstellen:** nach dem Storno muss alles neu zusammengestellt werden. | „Storno und neu ausstellen“ in einem Zug (F4). |
| V7 **erledigt (Welle 2, 15.11.)** | **Guthaben** lässt sich nicht mit einer neuen Rechnung verrechnen, obwohl die Stornorechnung es zusagt. | Guthaben umbuchen als ein Vorgang; im Export als Umbuchung. |
| V8 **erledigt (Welle 2, 15.11.)** | **Termine und Notfall-Eingänge ohne Meldung** — für Einsätze gibt es Push, für Termine und Notfälle nicht. | Push an Teilnehmer bzw. Leitung, gesammelt wie beim Einsatz. |
| V9 **erledigt (Welle 2, 15.11.)** | **Schein kommt im Büro an**, aber niemand ohne Rechnungsrecht erfährt es. | Zeile „neu eingegangen“ auf der Startseite. |
| V10 **erledigt (Welle 3, 15.11.)**, mit L8 | **Zurück aus einer Akte** (Kunden, Angebote, Wartungen, Benutzer): Liste lädt neu, Suchtext ist weg. Bei Baustellen bleibt beides stehen. | Dasselbe Muster wie bei den Baustellen (L8). |
| V11 **erledigt (Welle 2, 15.11.)** | **Anforderung → Rückgabe:** aus einer erledigten Anforderung führt kein Weg zur Retoure; frei getippte Ware lässt sich gar nicht zurückgeben. | „Zurückgeben“ an der Anforderung, alles vorbelegt. |
| V12 **erledigt (Welle 2, 15.11.)** | **Geschäftsführung und Administrator sind nicht einplanbar** — im kleinen Betrieb fährt der Chef mit. | Einstellung je Betrieb, wie es sie für die Projektleitung schon gibt. |
| V13 **erledigt (Welle 2, 15.11.)** | **Mehrtägiger Einsatz** ist nur Tag für Tag änderbar. | „Auch an den folgenden Tagen ändern/entfernen“. |
| V14 **erledigt (Welle 2, 15.11.)** | **Passwort vergessen mit Benutzername:** die Maske sagt „das Büro vergibt ein neues“ — das Büro erfährt es nur durch einen Anruf. | Anfrage landet als Aufgabe bei der Leitung. |

---

## 3. Oberfläche: Uneinheitlichkeiten und was „selbsterklärend“ im Weg steht

Aus dem Rundgang. Die Linie V10 selbst trägt; die Brüche liegen in der Bedienung.
**Stand 15.11. nach Welle 3: offen, nächstes Paket (Paket 10).**

| # | Punkt (Beobachtung) | Vorschlag |
|---|---|---|
| U1 ✔ | **Die Hauptaktion sitzt am Handy an fünf verschiedenen Stellen:** kompakt rechts unten (Listen), Balken über die ganze Breite (Benutzerakte „Bearbeiten“), zwei Knöpfe nebeneinander (Baustellenakte), im Fluss am Ende der Seite („Sätze speichern“), klebende Leiste mit Statuszeile (Firmendaten). | Drei feste Muster: **Liste** = eine kompakte Aktion rechts unten. **Akte** = eine kompakte Aktion, alles Weitere im ⋯. **Formular/Einstellung** = eine klebende Speicherleiste, überall gleich, die erst erscheint, wenn etwas geändert ist. |
| U2 ✔ | **Neu anlegen ist mal ein Blatt von unten (Zeit), mal ein Formular offen auf der Seite** (Urlaub: „Antrag stellen“ steht vor „Meine Anträge“; die Liste rutscht nach unten). | Am Handy öffnet „Neu …“ immer ein Blatt von unten; die Seite zeigt zuerst den Bestand. |
| U3 ✔ | **Dieselbe Aktion doppelt auf einem Bildschirm:** Start zeigt „Zeit erfassen“ schwebend und im Blatt „Dein Einsatz heute“; dort stehen Aktionen einmal als Dreierleiste (Anfordern · Nachricht · Schein), einmal als Verweise und gestapelte Knöpfe. | Je Einsatz eine Aktionszeile in einer Form; die schwebende Aktion entfällt, wo das Blatt sie schon trägt. |
| U4 ✔ | **Fenster mit vielen gleichrangigen Knöpfen:** Rechnung (fünf Knöpfe in drei Zeilen), Schein-Entwurf (PDF · Verwerfen · Weiterbearbeiten, alle gleich, „Löschen“ darunter). | Im Fenster eine gefüllte Hauptaktion, höchstens eine zweite, der Rest im ⋯-Menü; Unumkehrbares immer im Menü. |
| U5 ✔ | **Warnung, Gefahr und Aktion liegen farblich fast aufeinander:** Aktion `#a85439`, Gefahr `#a5483b`, Warnung `#8f5d20`. Warntext ohne Zeichen („Kein Ansprechpartner hinterlegt.“, „Zwischenstand — …“) liest sich wie ein Verweis. | Warn- und Fehlertext nie ohne Zeichen (Regel der Linie, hier nicht eingehalten); Gefahr deutlich vom Terrakotta absetzen (entschieden, E4). |
| U6 ✔ | **Ein/Aus als Kästchen mit dem Wort „ein“/„aus“** (Module, Meldungen). | Schalter als eigener Baustein für alles, was sofort wirkt; Kästchen bleibt für Auswahl in Formularen (entschieden, E3). |
| U7 ✔ | **Zeilen der Zeiterfassung am Handy sind hoch** (drei bis vier Zeilen je Buchung, Papierkorb an jeder Zeile). | Kompakte Zeile (Zeitraum · Baustelle · Dauer); Löschen im Fenster oder per Wischen (F15). |
| U8 ✔ | **Anforderungen (Büro) am Handy:** Kästchen links und Knopf rechts quetschen den Text auf eine schmale Spalte. | Text über die volle Breite, Aktionen darunter. |
| U9 ✔ | **Lange Warntexte offen auf der Seite** (Zeiterfassung: „An 10 Tagen steht dieselbe Buchung zweimal …“ mit allen Tagen). | Ein Satz plus „Anzeigen“ — Regel „eine Hilfe pro Seite“. |
| U10 ✔ | **Datums- und Zeitfelder zeigen das Format des Geräts** (auf einem englisch eingestellten Gerät 11/15/2026 und 07:00 AM) — dieselbe Ursache wie beim Logo-Knopf. | Am Handy ist das Rad des Geräts die beste Eingabe; deutsche Geräte zeigen es richtig. Entschieden (E5): so lassen. |
| U11 ✔ | Baustellenliste: Zustand und Budget stehen je nach Länge mal nebeneinander, mal untereinander. | Feste Anordnung. |
| U12 ✔ | Zeiterfassung am Schreibtisch: „Meine Einträge“ ist schmal, Namen brechen in drei Zeilen. | Liste breiter, Formular schmaler. |
| U13 | Mitarbeiterübersicht am Handy: je Person ein hohes Blatt. | Kompakte Zeile, Einzelheiten im Fenster (wie am Schreibtisch). |

---

## 4. Mikro-Animationen

Vorhanden: Stufen für Druck (100 ms), Zustand (160 ms), Fenster (220/140 ms),
„Bewegung reduzieren“ wird befolgt; Fenster und Menüs blenden ein, das Lot der
Navigation fährt. Was fehlt, ist Bewegung, die **erklärt, was gerade passiert
ist**. Alles nur mit `transform` und Deckkraft, nichts verschiebt Layout.
**Stand 15.11. nach Welle 3: offen, nächstes Paket (Paket 10).**

| # | Wo | Bewegung | Wofür |
|---|---|---|---|
| B1 | Blatt von unten | fährt von unten herein (statt nur einzublenden), folgt dem Finger beim Schließen | Herkunft und Rückweg sind sichtbar |
| B2 | Zeile verschwindet (ausblenden, löschen, erledigen, in den Korb) | klappt in der Höhe zusammen, Nachbarn rücken nach | man sieht, *welche* Zeile ging |
| B3 | Zeile kommt dazu (neue Buchung, neue Nachricht, neue Anforderung) | blendet mit kurzer Markierung ein | das Neue ist auffindbar |
| B4 | Speichern bestätigt | Haken zeichnet sich im Knopf, Leiste zieht sich zurück | „ist gespeichert“ ohne Meldung lesen zu müssen |
| B5 | Reiter und Segmente | die Unterlinie gleitet zum gewählten Reiter | Zusammenhang der Ansichten |
| B6 | Zähler und Kennzahlen (Korb, Abzeichen, Saldo) | Ziffer wechselt mit kurzem Rollen | die Zahl hat sich geändert |
| B7 | Arbeitstag Start/Pause/Stopp | Karte wechselt die Fläche weich, der Knopf wird zum nächsten | Zustand des Tages |
| B8 | Listen laden nach | Platzhalter gehen in Inhalt über, ohne Sprung | Ruhe beim Laden |
| B9 | Schwebende Hauptaktion | zieht sich beim Rollen nach unten zum Symbol zusammen, beim Hochrollen wieder auf | gibt Inhalt frei (siehe U3) |
| B10 | Aufklappen (Weitere Angaben, Gruppen) | Höhe gleitet, Pfeil dreht | Ort des Inhalts |
| B11 | Fehler am Feld | Feld bekommt die Markierung mit einem kurzen Ruck, Fokus springt hin | wo es klemmt |
| B12 | Seitenwechsel Liste → Akte | Akte schiebt sich von rechts herein, zurück nach rechts hinaus | Tiefe der Navigation, wie am iPhone gewohnt |

Haptik: am iPhone im Browser nicht verfügbar; auf Android möglich, aber
uneinheitlich — nicht empfohlen.

---

## 5. Ladezeiten

Gemessen: vor dem ersten Bild 274 KB (gepackt). jsPDF, Tabellen und Push hängen
nirgends fest. Die Datenbank ist schnell (1–3 ms je Abfrage); teuer ist die
Menge, die in den Browser wandert.

| # | Wirkung | Punkt | Lösung | Nachteil |
|---|---|---|---|---|
| L1 ✔ **erledigt (Welle 2, 15.11.)** | groß | **Wer ein Tagessoll je Wochentag hat („kurzer Freitag“), bekommt den Saldo aus allen Buchungen seit Eintritt** — auf Start, Zeiterfassung und Urlaub. Nach fünf Jahren rund 6.000 Zeilen in 13 Anfragen je Besuch. | Monatsbilanzen speichern die Tage je Zustand und das Soll des Monats (zusammen mit Z3). | keiner; Bilanzen werden einmal nachgerechnet |
| L2 ○ **erledigt (Welle 2, 15.11.)** | groß | Gesamtsaldo der Mitarbeiterübersicht holt je Eintrittsmonat die Buchungen des ganzen Betriebs und alle Bilanzen aller Jahre — nach jeder Buchung erneut. | Gesamtsaldo aus der Datenbank (eine Funktion über die Bilanzen). | keiner |
| L3 ○ **erledigt (Welle 3, 15.11.)** | groß bei großem Katalog | **Die Katalogsuche kann ihren Suchindex nicht nutzen** (gemessen bei 120.000 Artikeln: 162 ms + 159 ms Zählen; mit passendem Index 2,6 ms). | Index je durchsuchter Spalte — reine Migration. | etwas mehr Speicher |
| L4 ✔ **erledigt (Welle 3, 15.11.)**; abweichend vom Vorschlag ohne Original in voller Auflösung (begründete Grenze, fachlich) | groß im Chat | **Chatbilder gehen unverkleinert hoch (bis 25 MB) und werden bei jeder neuen Nachricht neu geladen**, weil die Adressen neu erzeugt werden. | Adressen merken, bis sie ablaufen; Bilder beim Senden verkleinern, Vorschaubild in der Liste, Original auf Tipp. | Original lädt erst auf Tipp |
| L5 ○ **erledigt (Welle 3, 15.11.)**, mit begründeter Grenze (Monatsrechnung bleibt in der App) | mittel–groß | Mitarbeiterübersicht: 1,9 s bei 25 Personen, 3,5 s bei 75. Die bisherige Begründung „bis etwa 30 Mitarbeiter“ widerspricht dem Grundsatz „für jeden Betrieb“. | Zeilen der Übersicht aus der Datenbank (baut auf L1/L2 auf). | eigener Umbau |
| L6 ○ **erledigt (Welle 3, 15.11.)** | mittel | Rechnungen laden alle offenen samt Positionen; „Nicht verrechnet“ läuft über bis zu sieben Abfragen nacheinander mit allen Spalten. Ergänzung aus Paket 6: `invoices.leistungsnachweis` (seit G6) kommt in Listen mit `select *` mit. „Nicht verrechnet“ fragt seit P3 eine Datenbankfunktion. | Liste ohne Positionen, Positionen beim Öffnen; eine Abfrage mit den nötigen Spalten. | keiner |
| L7 ○ **erledigt (Welle 3, 15.11.)**, mit begründeter Grenze (Hülle und Datenkern) | mittel | Jede Änderung benennt 172 von 218 Bausteinen um — nach jeder Auslieferung lädt jedes Telefon bis zu 0,9 MB neu. | Dünner Einstieg, gemeinsamer Code in wenigen Bausteinen nach Änderungshäufigkeit. | einmalige Umstellung der Auslieferung, sorgfältig zu prüfen |
| L8 ○ **erledigt (Welle 3, 15.11.)** | mittel (gefühlt) | Kunden, Angebote, Wartungen, Benutzer und ihre Akten beginnen bei jedem Besuch leer; der Suchtext geht bei „Zurück“ verloren. | Gemerkter Stand und Suche in der Adresse — das Muster der Baustellen. | keiner |
| L9 ○ **erledigt (Welle 3, 15.11.)** | klein–mittel | Die Tagesplanung lädt den ganzen Monat aller Personen. | Für den Tag den Tag und die Woche laden; Markierungen als Zählung je Tag. | keiner |
| L10 ○ **erledigt (Welle 3, 15.11.)** | klein, bei jedem Kaltstart sichtbar | Weiß bis zum ersten Bild; Schriften ohne Vorabruf. | Papierfarbe sofort, Schriften vorab laden. | Inhaltsregel (CSP) braucht einen Eintrag |
| L11 **erledigt (Welle 3, 15.11.)**; Messung gegen den Stapel erledigt (L22) | vorbeugend | Die Ladezeit-Messung deckt den Monteur nicht ab und kennt weder verschiedene Eintrittsmonate noch ein Tagessoll — L1 und L2 wurden deshalb nie gemessen. | **Leistungswächter in der CI** (Budget für Einstieg, Bausteine, Zeilen und Anfragen je Seite) und ein **Testbestand wie ein gewachsener Betrieb** (50 Personen, zehn Jahre). | längere CI |
| L12 **erledigt (Welle 3, 15.11.)** | gefühlt | Akte erst beim Loslassen laden. | Baustein und Kopf der Akte schon beim Berühren der Zeile holen. | keiner |
| L13 **erledigt (Welle 3, 15.11.)** | groß bei vielen Jahren | `zeitkonto_salden` rechnet bei jeder Abfrage über alle Buchungen seit dem Saldo-Start: gemessen 56 Personen / 47.867 Buchungen ≈ 850 ms, hochgerechnet 50 Personen × 10 Jahre 2–4 s (gefunden bei Z3/L2). | Abgeschlossene Monate als festen Stand zwischenspeichern, der nur bei Änderungen in diesem Monat neu entsteht. | Stand muss bei jeder rückwirkenden Änderung zuverlässig neu entstehen |
| L14 **erledigt (Welle 3, 15.11.)** | mittel | `app.ist_feiertag` kostet 0,7 ms je Aufruf; `app.urlaubstage` wird bei langen Zeiträumen entsprechend langsam (gefunden bei Z3). | `app.urlaubstage` auf die Feiertagsmenge je Jahr (`app.feiertage`) umstellen, wie `zeitkonto_salden` es schon tut. | keiner |
| L15 offen, in Welle 3 nicht bearbeitet; mit Paket 10 (der Leistungswächter aus L11 steht jetzt) | vorbeugend | Einzelne Komponentenprüfungen liegen unter paralleler Last nahe ihrer Frist von 5 s und fielen in mehreren Paketen gelegentlich aus (`BaustellenakteView` „G5 Kundenwechsel“, `QuotesView` „zählt nur echte Arbeitszeit“, `zip`, `appZeichen`, `infoHintUmbruch`); einzeln und mit `--maxWorkers=1` grün. | Mit dem Leistungswächter (L11): Ursache je Prüfung messen, nicht pauschal die Frist erhöhen. | keiner |
| L16 **erledigt (Welle 3, 15.11.)** | groß bei vielen Einträgen | Keine der Suchen über PostgREST nutzte mit Zeilenschutz ihren Index (Kunden, Baustellen, Wartungen, Scheine, Anforderungen, Eingänge, Rechnungen, Angebote), weil `ilike` nicht „leakproof“ ist (gefunden bei L3). | Kennungen über den Index (`app.suche_treffer`), Zeilen über Funktionen mit den Rechten des Aufrufers; 22 Indizes; 29–378 ms → 3–6 ms. | keiner |
| L17 **erledigt (Welle 3, 15.11.)** | mittel nach großem Import | Nach einem großen DATANORM-Import blieb die Katalogsuche langsam, bis autovacuum die Warteliste der Indizes aufräumte (gefunden bei L3). | `fastupdate` bleibt (aus: Import sechsmal langsamer); die Übernahme räumt die Warteliste am Ende des letzten Blocks auf. | 74 ms je Import |
| L18 **erledigt (Welle 3, 15.11.)** | klein | `einsatz_folgetage` und `einsatz_umplanen` fragten `app.ist_feiertag` je Tag (gefunden bei L14). | Feiertage als Menge aus `app.feiertage`; 62 Tage 40 → 3 ms. | keiner |
| L19 **erledigt (Welle 3, 15.11.)** | groß bei vielen Jahren | Die Monatsliste `zeitkonto_monate` nutzte die Zwischenstände aus L13 nicht (gefunden bei L13). | Gespeicherte Monate bis zur ersten Lücke; zehn Jahre 1,5–2,7 s → 40 ms. | keiner |
| L20 **erledigt (Welle 3, 15.11.)** | klein | Drei Abos blieben nach L6, L9 und L5 in der Datenschicht, ohne dass eine Ansicht sie nutzte. | Entfernt; Prüfungen auf die neuen Wege umgestellt. | keiner |
| L21 **erledigt (Welle 3, 15.11.)** | groß nach jeder Auslieferung | Die Bauzeit stand im gemeinsamen Code; damit benannte jeder Bau, auch ohne geänderte Zeile, 182 Bausteine um — jedes Telefon lud rund 0,9 MB neu (gefunden bei L7). | Die Fassung setzt der Einstieg zur Laufzeit. | keiner |
| L22 **erledigt (Integration Welle 3, 15.11.)** | groß bei vielen unverrechneten Scheinen | Messung gegen den Stapel mit gewachsenem Bestand (aus L11): Startseite und Rechnungen der Geschäftsführung nach 11,9 und 12,3 s bereit, alle anderen Seiten 3,5–5,2 s. Ursache: `scheine_unverrechnet` in 20 Seiten nacheinander, je Seite der ganze Kern neu (8,2–8,8 s); die Scheinliste der Leitung holte dazu jeden ganzen Schein (511 Anfragen, 51 s). | Jede Ansicht fragt, was sie zeigt: `scheine_unverrechnet_stand` (Startseite, Schriftfeld), `scheine_unverrechnet_baustellen` (Rechnungen, ein Wert je Betrieb), die Scheinliste blättert. Start 11,9 → 4,8 s, Rechnungen 12,3 → 4,3 s, Scheinliste 51 → 5,2 s; Monteur 3,0–4,2 s unverändert (`docs/ui-umbau/messung-gewachsen.md`). Die Datenbankprüfungen leeren den Testbestand mit (`tests/supabase/aufraeumen.ts`): erst prüfen, dann `testbestand.mjs --neu`, dann messen. | keiner |

Gemessen und **kein Befund**: der Rastertakt (2–17 ms), Listen (20 Zeilen je
Gruppe, Virtualisierung unnötig), Zeilenschutz, Nachrichten-Postfach.

---

## 6. Funktionen mit großem Mehrwert in den bestehenden Abläufen

Gereiht nach Nutzen je Aufwand. Keine neuen Produkte — jede schließt eine Lücke
aus Abschnitt 1 oder 2.

| # | Funktion | Wofür | Schließt |
|---|---|---|---|
| F1 **erledigt (Welle 2, 15.11.)** | **Baustelle geführt abschließen** — ein Schritt mit Blick auf offene Einsätze, Entwürfe, Material, unverrechnete Leistung; angeboten nach bezahlter Schlussrechnung | hält „Aktiv“ klein, nichts bleibt liegen | A11, V2 |
| F2 **erledigt (Welle 2, 15.11.)** | **Arbeitszeit und Urlaubsanspruch „gültig ab“** | Teilzeit, sechste Urlaubswoche, Wiedereintritt ohne falsche Salden | Z3, L1 |
| F3 **erledigt (Welle 2, 15.11.)** | **Monatsabschluss** der Zeiten | fester Stand für den Lohn | Z6, Z5 |
| F4 **erledigt (Welle 2, 15.11.)** | **Storno und neu ausstellen** in einem Zug | die häufigste Korrektur kostet heute drei Schritte und alles neu | V6 |
| F5 **erledigt (Welle 2, 15.11.)** | **Teilmengen** bei Ausgabe, Abholung, Lieferung | Alltag am Regal | M4, M5 |
| F6 **erledigt (Welle 2, 15.11.)** | **Nachtrag: Angebot an bestehende Baustelle** | Nachträge bleiben beim Auftrag | A3 |
| F7 **erledigt (Welle 2, 15.11.)** | **Annahme zurücknehmen** | einziger Zustand ohne Ausweg der Kette | A1 |
| F8 **erledigt (Welle 2, 15.11.)** | **Betroffene Einsätze bei Abwesenheit** | Umplanen in dem Moment, in dem es entsteht | V1 |
| F9 **erledigt (Welle 3, 15.11.)** | **Kunden zusammenführen** | Dubletten mit Belegen sind heute unlösbar | A12 |
| F10 **erledigt (Welle 2, 15.11.)** | **Verbrauch am Schein bucht das Lager** | Fahrzeuglager und Bestand werden erst verlässlich | M3 |
| F11 **erledigt (Welle 2, 15.11.)** | **„Wer ist heute im Dienst“** — laufende Arbeitstage fürs Büro | Daten und Leserecht sind da, die Ansicht fehlt | — |
| F12 **erledigt (Welle 2, 15.11.)** | **Stundennachweis je Baustelle/Kunde** | der Nachweis, den Regiekunden verlangen | Z8 |
| F13 **erledigt (Welle 3, 15.11.)**, mit Rückzahlungen | **Kontoauszug abgleichen** (Datei der Bank einlesen, Zahlungen als Vorschlag) | spart das Eintippen je Rechnung; der Verwendungszweck steht schon auf jedem Beleg | — |
| F14 **erledigt (Welle 3, 15.11.)** | **Inventur als Zählliste** je Lager/Fahrzeug | Inventur ist heute nur Artikel für Artikel möglich | — |
| F15 offen, nächstes Paket (10) | **Bedienung wie am iPhone:** Wischen an der Zeile (löschen, erledigen), Ziehen zum Aktualisieren, „Rückgängig“ in der Meldung nach jedem Löschen/Verschieben, Aktionen in „Suchen oder springen“ („Neue Rechnung“, „Zeit erfassen“) | weniger Tipps, vertraute Gesten | U7 |
| F16 **erledigt (Welle 3, 15.11.)**, mit Mahnung | **Rechnung und Angebot per Mail aus der App** (steht schon auf der Roadmap, 11.2.1; der Mailversand ist seit 05.11. eingerichtet) | der letzte Schritt verlässt heute die App | — |

---

## 7. Vorgeschlagene Reihenfolge (je Thema ein PR)

1. **S1** — Speicherleiste, **S2** — Taktgeber (beide erledigt 15.11.2026).
2. **Stille Fehler und gebrochene Zusagen** (erledigt 15.11.2026, §97) — klein, hoher Nutzen:
   A2, A7, G1, G7, K1, K5, M1 (Dialog und Sperre), P1.
3. **Planung:** P2–P9, V1, V13 — erledigt (Welle 2, 15.11.), dazu P10, V8, V9, V12.
4. **Zeit und Personal:** Z1–Z8 mit F2 (und damit L1, L2), dann F3 — erledigt (Welle 2, 15.11.), dazu F11, F12, Z9, Z11, Z12; L5 an Paket 9.
5. **Auftragskette:** A1, A3–A12, V3, V4, F1 — erledigt (Welle 2, 15.11.), dazu A13, A14.
6. **Geld:** G2–G9, V6, V7 — erledigt (Welle 2, 15.11.), dazu G10, G11; G12 an Paket 11.
7. **Material:** M2–M8, V5, V11, F5 — erledigt (Welle 2, 15.11.), dazu M9–M12, F10.
8. **Konto und Daten:** K2–K7 — erledigt (Welle 2, 15.11.), dazu V14, K8–K10.
9. **Ladezeiten:** L3–L14 und Z10 — erledigt (Welle 3, 15.11.; Paket 9a Datenbank, Paket 9b Oberfläche), dazu V10 mit L8, L16–L21, T2, T3; L22 (Messung gegen den Stapel) erledigt bei der Integration; offen L15 (mit Paket 10).
10. **Oberfläche — nächstes Paket (Paket 10), offen:** U1–U4 als ein Regelwerk mit Musterseite, danach U5–U13 und die Bewegungen B1–B12, mit den Entscheidungen E3–E5 und F15; dazu L15.
11. **Weitere Funktionen:** F9, F14 und G12 (Paket 11a), F13 und F16 (Paket 11b) — erledigt (Welle 3, 15.11.), dazu G13, K11, K12, T1, Rückzahlungen im Kontoauszug und Mahnung per Mail. F15 gehört zu Paket 10.

Jeder Schritt wie gewohnt: Prüfung mit Gegenprobe, Handbuch, Stand, CI grün,
Auslieferung geprüft. Punkte mit ○ werden zuerst nachgestellt; bestätigt sich
einer nicht, steht das im PR.

## 8. Entscheidungen (getroffen am 15.11.2026)

Der Auftraggeber hat alle sechs Fragen so entschieden, wie empfohlen. Das ist
die Entscheidung über das *Wie*, noch nicht das Startsignal (Grundsatz 5).

| # | Frage | Entschieden |
|---|---|---|
| E1 | Monatsabschluss der Zeiten (Z6): bauen, und als Einstellung je Betrieb? | Ja, als Einstellung je Betrieb; aus = wie heute. |
| E2 | Chef einplanbar (V12)? | Ja, als Einstellung je Betrieb. |
| E3 | Schalter statt Kästchen für Ein/Aus (U6)? Die Linie kannte bisher nur das Häkchen. | Ja — Schalter für alles, was sofort wirkt; das Kästchen bleibt für die Auswahl in Formularen. |
| E4 | Gefahr farblich vom Terrakotta absetzen (U5)? | Ja; Vorschlag mit Kontrastmessung auf der Musterseite, vor dem Einbau zum Ansehen. |
| E5 | Datums- und Zeitfelder (U10): Rad des Geräts behalten? | Behalten — am Handy die beste Eingabe; nur der Text daneben immer deutsch. |
| E6 | Reihenfolge aus Abschnitt 7 — oder andere Schwerpunkte? | Wie in Abschnitt 7 vorgeschlagen. |
| E7 | Hinweis im Meldedialog auf Betriebsrat oder Arbeiterkammer, wenn außer dem Gemeldeten niemand die Meldung sieht (K1)? | So lassen (15.11.2026). |
| E8 | Ausgelaufene Lagerartikel weiter als „knapp“ (M9)? | Nein — ausgelaufen heißt: nicht mehr nachbestellen (15.11.2026). |
| E9 | Ganzer Plan umsetzen, auch F9–F16, in der vorgeschlagenen Reihenfolge? | Ja (15.11.2026). |
