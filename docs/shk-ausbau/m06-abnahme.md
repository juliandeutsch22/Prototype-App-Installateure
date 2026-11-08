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
