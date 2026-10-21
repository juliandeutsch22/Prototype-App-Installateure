# Startseite in der Linie „Akte mit Kontext“

Freigabe vom 21.10.2026: „lasse das mobil menü wie bisher. die startseite kannst du direkt nach dem Entwurf umsetzen“.

## Umsetzung

Der Seitenkopf bleibt `PageHeader`, mit Datum, KW, Firma und tatsächlicher Rollenanzeige. Die Geschäftsführung beginnt bei „Heute im Überblick“, Monteure bei „Dein Tag“. Wer die Einsatzplanung öffnen darf, erhält am Tablet/Schreibtisch einen direkten Einstieg in die Woche. Die Kennzahlen behalten ihre bisherigen Berechnungen und Ziele; Zahlengewicht 500, Fehlerwerte rot, andere Werte im hellen wie dunklen Satz kontrastreich.

Arbeitsbereich und Tageskontext stehen ab 760 px nebeneinander, mobil untereinander. Gibt es keinen Kontext, entsteht keine leere Spalte. Der ruhige Tag zeigt weiterhin seine Erklärung und den vorhandenen Tagesüberblick. Der Monteur sieht zuerst seinen Einsatz und dann die Nachträge. `PageHeader` bietet für seinen ersten Einsatz die direkte Zeitbuchung an — mobil in der vorhandenen Aktionsleiste oberhalb der unveränderten unteren Navigation. Diese Aktion ersetzt beim ersten Einsatz den dortigen direkten Einstieg; „Wie zuletzt buchen“ bleibt als gesonderte Nebenaktion mitsamt seinen vorbelegten Zeiten erhalten. Weitere Einsätze behalten ihre eigenen Handgriffe.

Der Tageskontext fasst eigene Termine und den vorhandenen betrieblichen Tagesblock zusammen. Die feine Terminlinie ist eine Folge, keine maßstäbliche Zeitachse. Die Fachseiten werden weiterhin mit ihren bestehenden Filtern geöffnet. Alle übrigen Themen bleiben aufklappbar beziehungsweise über die Fachseite erreichbar.

## Fachlicher Umfang bleibt erhalten

| Bereich | Unverändert übernommen |
|---|---|
| Daten | `start/laden.ts`, parallele Ladeblöcke, Zwischenspeicher, Teilausfälle und sämtliche vorhandenen Abfragen |
| Aufgaben | `start/aufbau.ts`, `regeln.ts`, `themen.ts`, `abschnitte.ts`: alle Rollen, Dringlichkeiten, maximal drei Vorschauzeilen, mehr anzeigen/aufklappen, alle Fachfilter |
| Geld | Offen und Überfällig mit ihrer bisherigen getrennten Bedeutung, Rücklässe, Garantien, Mahnlauf und Scheine; keine neue Summenbildung |
| Persönlicher Einsatz | Alle Einsätze, Helferkennzeichen, Zeiten, Aufgabe, Kartenlink, Telefon, Schein, direkte Buchung und „Wie zuletzt“, Rüstliste mit echter Speicherung |
| Kontext | Eigene Termine mit Notiz/Adresse, Anwesenheit, Abwesenheiten und Besetzungsprobleme; Lieferung/Zahlung je Rolle |
| Rechte | Bisherige Rollen-, Zusatzrechte- und Modulprüfung; keine neuen Links auf gesperrte Ansichten |
| Zustände | Gemeinsames Fertigwerden, Platzhalter, Laufwarnung, Wartungshinweise, fehlender Eintritt, Feiertag, Meldung bei Teilausfall |
| Navigation | `Layout.tsx`, `navigation.ts`, Sidebar, Kopfzeile, Suche und bestehende mobile Leiste/„Mehr“ unverändert |

Keine Änderung an Datenbank, Funktionen auf dem Server, Exporten, Berechnungen oder Datenbeständen.

## Nachweise

- `DashboardView.test.tsx`: 51 Prüfungen einschließlich drei neuen Prüfungen für gemeinsamen Tageskontext, Einsatz vor Nachträgen und direkte Zeitbuchung im Kopf. Die drei neuen Prüfungen waren gegen den vorherigen Quellstand rot. Die bisherigen Prüfungen für beide Einsätze, Buchungszeiten, Scheinrechte, Rüstliste, alle Rollen, Teilausfälle, Konten, Module und Filter bleiben erhalten.
- `startseiteViel.spec.ts`: bestehender echter Browserweg mit 40 Baustellen, 20 Anforderungen und zehn Personen erweitert. Misst Spalten nebeneinander ab Tablet, mobil gestapelt, Reihenfolge der Monteuransicht und unverändertes mobiles Menü einschließlich „Mehr“. Die Zeitaktion muss über der Navigation liegen. Die bisherigen Grenzen für Seitenhöhe, vollständige Zahlen und höchstens drei Vorschauzeilen bleiben bestehen.
- Sichtprüfung: sechs Rollen, 390/834/1440 px, hell und dunkel. Gemessen werden Seitenüberlauf, abgeschnittene Kennzahlwerte, JavaScript-Fehler und axe-Befunde.

Die Vorschau arbeitet mit fiktiven Stubs; etwaige dort angezeigte fachliche Warnungen sind kein Befund über den Produktionsbetrieb. Die Funktionswege werden zusätzlich gegen die lokale Datenbank geprüft.
