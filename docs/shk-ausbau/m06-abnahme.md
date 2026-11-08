# M06: Umsetzung und Prüfbelege

Stand: 8. November 2026. Grundlage: `bauplanung-geprueft.md`, Bestandsmatrix und E61/E63.

## Bestandsabgleich

M06b (freie Zeitfelder, N01) war mit PR #423 bereits vorhanden. Die bestehende
Fassungsverwaltung, Pflichtprüfung, Offline-Übertragung, Rollenbegrenzung und
Änderungshistorie werden weiterverwendet. Die festen Spalten werden nicht zu
freien Feldern umgebaut; ihre Bedeutung für Budget und Abrechnung bleibt bestehen.

Ergänzt wurden M06a (Start/Stopp, B02 und Erinnerungen Z04), M06c
(Korrekturanträge, Z01), M06d (abschaltbare Zeiterfassung, V2) sowie die
Verwaltung der sieben optionalen Standardfelder. Neue optionale Arbeitsabläufe
sind standardmäßig ausgeschaltet. Die vorhandene direkte Zeiterfassung bleibt
standardmäßig aktiv.

## Nachweise der Arbeitsabläufe

- `tests/supabase/m06Zeit.test.ts`: Rollen und Betriebe, wiederholbare Befehle,
  Gerätekonflikte, getrennte Pausen, unveränderte Überschneidungsprüfung,
  Rechnungssperren, tatsächliche Korrektur statt bloßem Statuswechsel,
  protokollierte Entfernung, Datenauskunft und Modulabschaltung.
- `tests/durchklick/m06Zeit.spec.ts`: Standardfelder aus- und einschalten ohne
  Werteverlust; Timer mit Pause und Offline-Abschluss; Anwesenheit ohne
  erfundene Baustelle; gesperrte Korrektur und tatsächliche Berichtigung;
  lesbares Archiv ohne Neuanlage; abgelehnten Offline-Abschluss mit seinen
  Tätigkeiten wieder öffnen und berichtigen. Läuft auch in den bestehenden
  Telefon- und Tabletprojekten.
- `tests/unit/zeitsitzung*.test.ts`: lokale Zustandsvorschau, vollständiges
  Nachladen, getrennte Entwürfe je Versuch und Person, Daten bleiben nach
  Ablehnung erhalten; nur die zugehörige Serverbestätigung entfernt sie.
- `tests/components/TimeFormZeitfelder.test.tsx` und
  `tests/unit/standardZeitfelder.test.ts`: bestehende Werte ausgeblendeter
  Felder bleiben beim Ändern anderer Angaben erhalten.
- Bestehende Gesamtprüfungen kontrollieren insbesondere die Rollenmatrix,
  Supportzugänge, Personenauskunft und Löschung, Modulregister, Datenbankfunktionen,
  normalen Buchungen, Abwesenheiten und Belegabläufe.

## Gegenproben und gefundene Fehler

Vor den neuen Migrationen scheiterten fünf neue Datenbankprüfungen, zwei
Bestandserhaltungsprüfungen bestanden. Die gesonderte Korrektur-Gegenprobe
lieferte vier Fehler bei sieben bestandenen Prüfungen. Eine isolierte
Gegenprobe mit dem bisherigen Standardfeldverhalten lieferte zwei Fehler und
eine bestandene Prüfung. Die tatsächliche Rechnungssperre bleibt Teil der
Negativprüfung, keine Testfreigabe umgeht sie.

Im echten Browser wurde außerdem eine doppelte React-Komponentenkennung von
Timer und Korrekturen gefunden und berichtigt. Der Ablauf verlangt nun genau
einen Timer. Die Testuhr verändert nur `Date`; Ereignisschleife und
Animationen laufen normal weiter.

Eine weitere echte Browser-Gegenprobe mit der früheren Segmentkennung hat
nachgewiesen, dass ein noch offener Kommentar beim Abgleich eines offline
gestarteten Timers geleert wurde. Die stabile Kennung aus Sitzung und
Abschnitt erhält diese Eingaben. Eine bereits aufgezeichnete Baustelle bleibt
auch ohne nachladbare Auswahlliste prüfbar; der Server ergänzt den Kundennamen
aus demselben Betrieb, falls er im Offline-Paket fehlt.

## Datenschutz und Bestandsschutz

Rohsitzungen und Korrekturanträge gehören zur Personenauskunft und zum
bestehenden gesetzlichen Aufbewahrungsweg. Plattform-Support erhält keinen
Zugriff auf diese Arbeitszeitdaten. Benachrichtigungen enthalten weder Stunden
noch den persönlichen Korrekturtext. Inaktive Personen und ruhende Betriebe
werden bei Timer-Erinnerungen ausgeschlossen. Entwürfe bleiben wie das
bestehende Ausgangsfach auf die Person und den Betrieb beschränkt.

V3 bleibt erhalten: Die bestehenden API-Schreibwege werden nicht nachträglich
mit einer neuen Modulsperre versehen. Die Oberfläche bietet bei ausgeschalteter
Zeiterfassung keine Neuanlage und keine neue Regierechnung aus Stunden an;
Historie, Exporte und der vorhandene Scheinweg bleiben bestehen. Laufende
Sitzungen und offene Anträge können weiterhin abgeschlossen werden.

## Noch fachlich offen: M06e

Zusätzliche Zeitmodelle, Durchrechnung und Zulagen (Z02/Z03) verlangen nach dem
Bauplan verifizierte KV-/WKO-Regeln und konkrete Betriebsvereinbarungen. Diese
Nachweise wurden nicht mitgeliefert und sind angefragt. Deshalb gibt es hierfür
keine behauptete Fertigstellung, keinen ungeprüften Lohnregelleditor und keine
rückwirkende Umrechnung. Die bestehende Zeitrechnung bleibt unverändert.

## Technischer Prüfstand

- Typprüfung, Lint und Produktionsbuild: bestanden.
- Unit-/Komponentenprüfungen: 6.997 Fälle, Gesamtlauf mit gezielten
  Nachprüfungen. Die letzten 682 betroffenen Prüfungen zu Maske, Modulregister,
  Schreibweise und Handbuch bestehen.
- Datenbank/Edge Functions: 2.583 Prüfungen in 213 Dateien bestanden, kein
  übersprungener Fall.
- Echte Browser gegen den lokalen Stapel: 29 verschiedene ausgeführte Fälle
  bestanden, einschließlich aller sieben M06-Abläufe auf Desktop und Tablet,
  der bisherigen Zeitbuchungen, freien Felder und sechs Rechnungsabläufe.
- Vorschau: 35 Link-/UI-Prüfungen bestanden (Rollen, Suchfelder, Seitenposition,
  Touchgesten, Dialog-Abdunkelung und reduzierte Bewegung).
- iPhone/WebKit und der vollständige Browserbestand werden zusätzlich von der
  bestehenden Pull-Request-CI geprüft. Vor grüner CI kein Merge und kein Deploy.

Die Modulabschaltung wurde zusätzlich negativ geprüft: Ein vorhandener
Korrekturantrag darf feste Angaben berichtigen, schreibt dabei aber keine
abgeschalteten freien Angaben neu. Vor der Korrektur zeigte die Maske diese
Felder fälschlich noch; die eigene Gegenprobe war rot und ist jetzt grün.

Auch ältere Modulwerte folgen beim Timerabschluss derselben Wahrheitsprüfung
wie im bestehenden Register. Die zusätzliche Gegenprobe mit einem numerischen
Wert fand den zu strengen Boolean-Cast (22P02). Unset, null, Zahlen, Text,
Objekte und Arrays sowie ausdrücklich falsche/leere Werte werden mitgeprüft;
ein ausgeschaltetes freies Feld erhält dadurch keine Schreibfreigabe. Die
119 betroffenen Datenbankprüfungen und 682 Modul-/Ansichtsprüfungen bestehen.

Zwei weitere rote Komponentengegenproben belegen den Schutz gegen verspätete
Filterantworten sowie den Erhalt eines Direktlink-Fehlerhinweises nach einer
unabhängigen Listenladung. Die Korrekturansicht nimmt nur das Ergebnis der
neuesten Listenanforderung an; Linkfehler haben einen eigenen Zustand.

Die vollständige CI fand außerdem eine ungültige E2E-Vorbelegung: historische
Timerzeiten lagen vor dem auf einem frischen Stapel gesetzten Eintritt.
Die M06-Fälle setzen jetzt einen echten früheren Eintritt für ihre Testperson
und stellen den ursprünglichen Wert danach wieder her. Die produktive Sperre
für Zeiten vor Eintritt bleibt unverändert. Der Browserkalender ist für alle
M06-Fälle kontrolliert.

Ein mobiler Korrekturanfragedialog lag im Stapelkontext der Listenaktionen
unter der unteren Navigation. Die native Telefon-Klickgegenprobe war rot.
Die neuen Korrekturdialoge liegen jetzt wie bestehende globale Dialoge über
React-Portalen im Seitenkörper. Alle sieben M06-Abläufe bestehen anschließend
sowohl im Telefon-Chromium als auch in der echten WebKit-iPhone-Konfiguration.
Globale Dialog-, Navigations- und Gestenbausteine wurden dabei nicht verändert.
