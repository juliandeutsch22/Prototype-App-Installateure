# Funktionserhalt bei der späteren Umsetzung

Die Produktanwendung ist für diesen Entwurf unverändert. Damit sind ihre bisherigen Funktionen nicht durch den Entwurf entfernt worden. Daraus folgt noch nicht, dass ein späterer Nachbau der Screens automatisch alle Funktionen bewahrt.

Die Einzelprüfungen ordnen den Ansichten bestehende Komponenten und zu erhaltende Aufgaben zu. Quellpfade wurden auf Vorhandensein geprüft und in `Seitenpruefung.json` mit SHA-256 dokumentiert. Dies ist ein nachvollziehbarer Quellbezug, keine vollständige Prüfung jeder Codeverzweigung.

## Regeln für die Umsetzung

Bestehende Fachlogik, Dienste, Validierungen und Berechtigungen wiederverwenden. Zunächst Darstellung und Navigation schrittweise ändern, keine fachlichen Berechnungen nebenbei neu schreiben. Die erwarteten Arbeitswege pro Rolle vor und nach einer Änderung mit denselben Datensätzen vergleichen.

| Arbeitsweg | Unbedingt erhalten / noch im echten System abnehmen |
|---|---|
| Mitarbeiter und Zeitkonto | Benutzerprofil, Eintritt/Saldo-Start, Tagessoll, gutgeschriebene Abwesenheiten, Monats-/Gesamtsaldo, mehrere Buchungen am Tag, Grenzprüfung, CSV und Berichtszeitraum. |
| Fremde Zeiten | Richtiger Zielmitarbeiter und Tag beim Erstellen; Eintragsinhaber beim Bearbeiten; Korrekturrechte, Doppelbuchung, verrechnete Buchungen und Jugendschutz. |
| Einsatzplanung | Mehrfachauswahl, Gruppen, Helferkennzeichnung, Zeit/Kommentar, Personen-/Baustellensicht und alle Zeiträume. Abwesenheiten und Konflikte müssen mit realen Daten stimmen. |
| Kunden bis Rechnung | Kunde → Angebot → Baustelle → Zeit/Material/Schein → Rechnung; IDs, Zuordnungen und Statusübergänge unverändert. |
| Scheine | Dauerhafte Entwürfe, Dateiuploads, unvollständige Materialzeilen, beide Signaturen, Unterzeichnernamen, Sperre nach Abschluss und PDF. Offene Uploads müssen den Abschluss weiter korrekt blockieren. |
| Rechnungen | Steuer, Reverse Charge, Rabatt, Skonto, Rücklass, Garantie, Teil-/Schlussrechnung, Überzahlung, Rückzahlung, Mahnung, Storno und bedingte Rücknahme des Stornos. PDF/Exporte und Protokoll müssen reale Daten verwenden. |
| Material/Lager | Auswahl und freie Zeilen, Warenkorb, Anforderung/Reservierung/Ausgabe/Rückgabe, Einkaufspreisrechte, Bestandsbewegungen, Mindestmenge und Import. Mitnehmen abhaken ist keine Lagerbewegung. |
| Urlaub/Abwesenheit | Genehmigungsrechte, Anrechnung, Feiertage, Betriebsurlaub, Ausnahmen, Stundenabwesenheit, Berufsschule und getrennte Gründe im lesenden Teamplan. |
| Konten/Rechte | Geschützte Anmeldeart, Rollenvergabe, Zusatzrechte, persönliche Einstellungen, Zwei-Faktor-Anmeldung, Supportgrenzen und Plattformtrennung. UI-Ausblenden ersetzt keine serverseitige Prüfung. |
| Löschen | Reale Datenabhängigkeiten und tatsächliche Folgen. Wartungslöschung verliert Historie; Materialkataloglöschung darf vorhandene Bestellpositionen nicht verändern. |

## Was der Prototyp tatsächlich kann

Navigation, Suche/Filter, ausgewählte Kalender-/Planumschaltungen, lokale Formularstände beim Wechsel, bedingte Felder, Positionszeilen, Checkbox-Auswahl, Mengenbearbeitung und gezeichnete/geleerte Signaturen sind im Browser demonstrierbar. Die Fremderfassung übernimmt im gezeigten Weg Person und Tag. Die Galerie benötigt keine Serverdaten.

Speichern, Buchen, Bestellen, Genehmigen, Export/PDF und Löschen sind Vorschauaktionen. Es werden keine APIs aufgerufen. Kalenderpfeile und Monatswahl zeigen ihren vorgesehenen Ort, bleiben aber im fiktiven Oktober-Datensatz. Material „Hinzufügen“ demonstriert die Auswahl und löst keine Bestellung aus; kein vollständiger durchgängiger Warenkorb-/Angebotsimport. Formularstände bestehen nur im laufenden Browserdokument, nicht dauerhaft nach Neuladen. Dateieingaben sind nicht wiederherstellbar. Summen sind feste, konsistente Beispieldaten und werden nicht bei jeder Eingabe neu berechnet. Signaturdarstellung beweist keine rechtssichere Abschlussstrecke.

## Vor einer Freigabe offen

1. Konzept und Informationsdichte mit Monteuren, Büro/Buchhaltung und Leitung an realen Aufgaben durchgehen, insbesondere Mitarbeiterprüfung und Wochenplanung.
2. Reale Rollen, Zusatzrechte, Support und vertrauliche Daten pro Ansicht abnehmen.
3. Persistenz, Entwurfswiederaufnahme, Uploadfehler, Gleichzeitigkeit, lange Datensätze sowie alle fachlich bedingten Leer-/Fehler-/Sperrzustände prüfen.
4. Die oben genannten Arbeitswege mit Backend, Belegen, Berechnungen und Exporten vollständig testen; erst dann Funktionsgleichheit bestätigen.
5. Tastatur, Screenreader, Fokusführung von Dialogen, Kontraste unter echten Daten, Touch/Zoom und reale Mobilgeräte manuell prüfen. Automatische Tests des Entwurfs sind keine WCAG-Zertifizierung.
6. Die schrittweise Produktumsetzung mit bestehender CI absichern; App-CI, Merge und Deployment gehören nicht zu dieser Konzeptlieferung. Rechtstexte gesondert fachlich/juristisch freigeben, soweit noch ausstehend.
