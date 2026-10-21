# Lot: Umsetzung des Gesamtentwurfs vom 21.10.2026

Ausgangsstand: `3e49090d4054ebbd3ecbce6ab583bb944c2c0770`.
Auftrag: „top wenn alle screens nun stehen kannst du mit der Umsetzung beginnen“.

Grundlage sind der [Gesamtentwurf mit 263 Ansichten](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/8a36a015ada022670910ea353525ac95cad8cd03/lot-gesamtentwurf-2026-10-21/README.md),
die [überarbeitete Mitarbeiterübersicht](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/24aaed89d43b25a8703b9c51b825fc490d79f93f/lot-mitarbeiter-2026-10-21/README.md)
und die [mobile Ergänzung](https://github.com/juliandeutsch22/Prototype-App-Installateure/tree/053a971a9e273d812d973d0aac0611fcc25c60b5/lot-mitarbeiter-mobil-2026-10-21).
Die Entwürfe bestimmen die Gestaltung; ihre Beispieldaten und nachgebauten
Funktionen werden nicht in die App übernommen.

## Umfang und Zuordnung

Die bereits ausgelieferte Startseite und die drei Akten sind die Grundlage.
Viele übrige Seiten besitzen bereits die richtige Struktur: flache Gruppen,
vollständige Formulare mit begrenzter Breite, ganze Zeilen als Ziele und
rollenabhängige Register. Dort tragen die gemeinsamen Bausteine die Anpassung;
es gibt keinen zusätzlichen neuen Klickweg nur für das Aussehen.

| Bereich | Umsetzung / bewusste Beibehaltung |
| --- | --- |
| Start, Baustellen-, Kunden-, Benutzerakte | Freigegebener Aufbau aus T-12/T-13 bleibt. Die gemeinsame Formularbeschriftung wird ruhiger. Keine große Baustellen-Kennzahlenleiste. |
| Mitarbeiterübersicht | Keine große Kennzahlenzeile über dem Zeitraum. Zeitraum, Suche, Monats-/Wochenwahl und Prüfsteuerung zusammen. Direkter Checkboxfilter mit unverändertem URL-Verhalten. Monat: bestehender Vergleich mit Monats- und Gesamtsaldo; mobil zwei gleichwertige Salden und kleine Gebucht-/Sollzeile. Monatstage und Woche weiterhin vollständig bedienbar. |
| Person im Monat | Drei kompakte Kontowerte, Buchungsstand darunter; vollständiger Tagesnachweis, optionaler Kalender und alle bisherigen Aktionen. Abwesenheits- und Kontogrundlagen unter benanntem Aufklappbereich. Fehlende Arbeitstage mobil geschlossen, Zahl immer sichtbar; ab 760 px weiterhin offen. Gezielte Tagesauswahl öffnet den Abschnitt. Der Zustand bleibt beim Formularrückweg je Person und Monat erhalten. |
| Summen der Übersicht | Leise unter der Liste, ausdrücklich über alle Personen, auch bei Suche/Filter. Die Wochenansicht summiert die vorhandenen Tageswerte der gewählten Woche, die Monatsansicht dieselben Monatswerte wie bisher. Keine neue Saldenberechnung. |
| Angebote | Liste/Formular über gemeinsame Bausteine; Positionen bleiben breit. Angebotsakte am Desktop mit Hauptinhalt und begrenzter ruhiger Kontextspalte für Verlauf/Angaben. Mobile Reihenfolge und Sprungziele bleiben. |
| Rechnungen | Gemeinsame Filter und Beschriftungen. Einzelbeleg mit benannten Abschnitten für Angaben, Leistungen, Belegsumme, Zahlstand und Mahnungen; breiteres vorhandenes Seitenfenster. Alle gespeicherten Positionen, Abzüge, Rücklässe, Stornoangaben und Aktionen bleiben. |
| Einsatzplanung, eigener Plan, Teamwoche | Bewährtes Personen-/Tagesraster, Einsätze, Abwesenheiten, Termine, Lieferhinweise, Rüstlisten und Kalender-Abo bleiben. Ansichtswahl folgt der gleichen Unterstreichung wie andere Register. Die Woche wird nicht in lose Karten aufgeteilt. |
| Zeiterfassung, Urlaub, Krankenstand | Bestehende Formular-/Listenaufteilung und statusabhängige Felder bleiben; gemeinsame Feldbeschriftungen und Filter. Tagesaktionen und Daumenleiste bleiben. |
| Material anfordern, Anforderungen, Lager | Bestehende Arbeitslisten, Katalog, Warenkorb, Retouren, Bestellabläufe, Inventur und Importe bleiben; gemeinsame Auswahl- und Feldbausteine. |
| Handwerksscheine, Wartungen, Kalkulation | Vorhandene flache Arbeitslisten und vollständige Erfassungswege bleiben; gemeinsame Bausteine. Unterschrift, Fotos, Nachträge und Exporte bleiben in ihren bisherigen Abläufen. |
| Einstellungen, alle elf Unterseiten | Rollenabhängige Register und getrennte Speichervorgänge bleiben; lesbare Feldgruppen mit vorhandener Formularbreite. Kein Feld wird zur rein optischen Zusammenfassung zusammengelegt. |
| Anmeldung, Wiederherstellung, Plattform, Hilfe und globale Fenster | Bestehende Abläufe und Abgrenzungen bleiben; gemeinsame Formularbeschriftung. Sicherheitsabfragen, Hilfe, Fokusführung, Hintergrundsperre und Fehlerbehandlung werden nicht ersetzt. |

Die 263 Entwurfsansichten sind keine 263 eigenständigen neuen Routen. Sie
umfassen auch Register, Dialoge, Rollen und Fehler-/Leerzustände derselben
Komponenten. Die Quellabdeckung der Studie bleibt über deren
`quelleninventar.json`, `rollenmatrix.json` und `Abdeckung.md` nachvollziehbar.
Automatische Funktionstests ersetzen dabei keine Behauptung, jede denkbare
Kombination manuell geprüft zu haben.

Die [ergänzende Elementzuordnung](zuordnung-lot-gesamt-2026-10-21.json) beschreibt
die geänderten Stellen und Klickwege. Die bestehenden Paketzuordnungen gelten
für die erhaltenen Elemente weiter.

## Erhaltene Grenzen

- Keine Änderung an Datenmodell, Migrationen, Datenschicht, Rollen oder Routen.
- Keine Änderung an Fachberechnungen, PDF-/CSV-/BMD-Ausgaben oder Belegfarben.
- Die mobile Navigation mit ihren rollenabhängigen Zielen und „Mehr“ bleibt.
- Der Filter „Tage ohne Buchung“ bezieht sich wie bisher auf den ausgewählten
  Monat; in der Wochenansicht benennt die Beschriftung diesen Bezug ausdrücklich.
- Mehrere Buchungen desselben Tages bleiben einzelne Einträge. Verrechnete
  Einträge und Krankmeldungs-/Urlaubs-/Freistellungstage behalten ihre Grenzen.
- Im Supportzugang weiterhin keine Zeitdaten, Summen oder fehlenden Tage.

## Prüfstand

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript und ESLint | grün |
| Modul-/Komponentensuite | 5.372/5.372, 352 Dateien |
| Chromium und Tablet | 77 unterschiedliche Wege bestanden, 1 vorgesehener Skip; elf Wege nach getrenntem Lauf erneut grün |
| WebKit am Telefon | 11 bestanden, 1 vorgesehener Skip |
| Links über alle Rollen | 7/7 |
| Responsive Messung | 38 Routen × 375/390/834/1440 px, kein Seitenüberlauf und kein JavaScript-Absturz; zwei Hinweise auf absichtlich für Vorlesehilfen beschnittene Zahlbeschriftungen |
| Zusätzliche Mitarbeiterdetails | 16 axe-Prüfungen ohne Befund: 320/390/430 px geschlossen/offen, 834/1440 px mit sichtbaren Tagen, jeweils hell/dunkel; Enter/Leertaste geprüft |
| Rechnungsdetail | 390/834/1440 px: fünf benannte Bereiche, kein Überlauf, axe ohne Befund |
| Gegenproben am Ausgangsstand | neun erwartete rote Modul-/Strukturprüfungen; neuer mobiler Browserweg rot, weil der Aufklappschalter dort noch fehlt |

Der erste Browserlauf und der Linklauf teilten versehentlich ihr
Ergebnisverzeichnis. Dabei wurden laufende Trace-Dateien gelöscht; drei
Browserwege meldeten `ENOENT` beim Protokollieren. Die elf Wege der beiden
betroffenen Dateien wurden danach mit getrenntem Ergebnisverzeichnis geprüft
und bestanden, einschließlich Jugendschutz, Schleier und Lage der Zeitraumwahl.
Es wurde dafür keine fachliche App-Funktion geändert.

Für die ergänzende Sichtprüfung wurden 120 Grundansichten fotografiert.
Die Vorschau rechnet mit Beispieldaten: Datensicherungswarnung, doppelte
Beispielbuchungen und die dort nicht nachgebildete Datenbasis der Kalkulation
sind keine Befunde über den produktiven Betrieb. Neue Prüfungen bleiben von
solchen Ersatzdaten getrennt; die Browserwege oben verwenden die lokale echte
Datenbank. Die GitHub-CI und die Auslieferung werden am PR dokumentiert.

Für die Sichtprüfung liefern die Vorschau-Ersatzmodule jetzt auch bei Kundennamensuche
und Arbeitszeit-Vorlauf Listen. Das korrigiert ausschließlich die Ersatzdaten der Vorschau
(`tools/vorschau`), nicht die echte Grenzprüfung oder die Produktionsdaten.
