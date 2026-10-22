# Abnahme: globale Plattformverwaltung · 22.10.2026

Auftrag und Freigabe: Umsetzung des am 22.10. gezeigten Plattform-Entwurfs;
keine Bestandsfunktion verlieren. Grundlage und
[Elementzuordnung](../zuordnung-lot-plattform-2026-10-22.json) sind dokumentiert.

## Geprüft

| Prüfung | Nachweis |
| --- | --- |
| Typen und Lint | `npx tsc --noEmit -p .`, `npm run -s lint`: grün |
| Produktionsbau | `npm run build`: grün |
| Gesamte Modul-/Komponentensuite | 353 Dateien, **5.379 Prüfungen grün** |
| Neue Verhaltensprüfungen | `PlattformLot.test.tsx`: sieben grün; dieselben sieben gegen unveränderten Ausgangsstand im isolierten Arbeitsbaum rot |
| Bestehende Plattform-, Verwaltungs-, Zins- und Wiederherstellungsprüfungen | fachliche Bedingungen beibehalten, neue Klickwege berücksichtigt; im Gesamtlauf grün |
| Browser | 96 Fälle in Chromium, Tablet 834 und WebKit am Telefon; 94 bestanden, zwei vorgesehene Skips ohne Bedeutung für die Plattform |
| Neue Plattform-Browserabläufe | beide Abläufe auf allen drei Geräten bestanden: E-Mail-Anlage / Bereichswechsel / Übergabe / Frist / Reaktivierung; Benutzername / Notzugang / Rückrufbestätigung / Passwort / Testlöschung |
| Zwei-Faktor-Sperre | bestehender echter Browserweg mit neuem Abmeldeweg bestanden: Pflicht und Einmaligkeit der Wiederherstellung bleiben |
| Links | sieben Linkprüfungen bestanden; zusätzliche Bestätigung durch CI |
| Darstellung und axe | 51 Fälle in 390 / 834 / 1440 px, zusätzlich drei dunkle Darstellungen; **54 axe-Prüfungen ohne gemeldeten Verstoß**, kein horizontaler Überlauf und keine sichtbaren Ziele unter 44 × 44 px |
| Sichtprüfung | echte React-Vorschau mit fiktiven Daten: Betriebsübersicht, Anlegen, Support, Verwaltung und Mobilansichten geprüft |
| API-Erhalt | [AST-Abgleich der fünf Ansichten](lot-plattform-api-2026-10-22.json): alle bisherigen direkten Datenaufrufe und ihre Argumente unverändert |

Die bestehenden Browserwege wurden vollständig geprüft; neue Plattformabläufe
wurden ergänzt. Zwei vorgesehene Skips betreffen die Tablet-spezifische
Seitenleistenaussage in Desktop-/Telefonprojekten. Sie sind keine ausgelassenen
Plattformfunktionen.

## Rückmeldungen und Zustände

Bereichswechsel erhalten Eingaben und einmalige Ausgaben, ohne neue dauerhafte
Ablage. Fehlende Supportverbindung wird ausdrücklich von einer leeren Freigabe
unterschieden und ist wiederholbar. Nach Verwaltungsaktionen werden Betriebe
und Freigaben zusammen aktualisiert. Das Löschresultat bleibt außerhalb des
verschwindenden Fensters sichtbar, einschließlich vorhandener Hinweise auf
nicht entfernte, gesperrte Anmeldekonten.

## Grenzen

Keine Änderung an Datenmodell, Datenschicht, Routen, Berechtigungen,
Fachberechnungen oder Exportfunktionen. Keine Migration. Reale Schreibvorgänge
der Browserprüfungen liefen ausschließlich gegen den lokalen Teststapel;
Produktionsdaten wurden nicht verändert. Die Szenarien decken die genannten
Abläufe ab, nicht jede theoretische Kombination aus Bestandsdaten und Ausfällen.
Automatisches axe ist keine vollständige manuelle Barrierefreiheitszertifizierung.

Auslieferung erst nach grüner GitHub-CI. Die produktive Plattformrolle wird
nicht durch eine Vorschaurolle oder Testanmeldung ersetzt; nach dem Deploy
werden die veröffentlichte Fassung und die öffentlichen Startdateien geprüft.
Die tatsächliche Produktionsanmeldung des globalen Administrators benötigt
dessen eigenen zweiten Faktor.
