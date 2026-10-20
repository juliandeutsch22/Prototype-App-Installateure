# Akten in der bestätigten Lot-Linie · 20.10.2026

Freigabe: „finde ich gut kannst du das so umsetzen?“ nach Entwurf 03. Die große
Kennzahlenleiste der Baustelle entfällt; Stunden und Budget stehen klein beim
Auftrag. Vorbild ist die bestehende App mit ihren Grundwerten und Bausteinen.

## Aufbau und vollständige Zuordnung

| Akte | Übersicht / Profil | Weitere Bereiche | Bearbeiten und seltene Aktionen |
| --- | --- | --- | --- |
| Baustelle | Nummer, Status, Adresse und Telefon im Kopf; Auftrag mit Beschreibung, Abrechnung, Budget, Beginn und Ende; kompakte Fachzeit, verbleibende Stunden oder Überschreitung, Helfer und ausgenommene Lehrlingsstunden getrennt; Stunden je Person und letzte Buchung aufklappbar; Angebote und Verlauf; Kunde, Ansprechpartner, Team und Leitung | Termine und Team: vollständige bestehende Terminkarte mit Anlegen, Ändern, Löschen und vergangenen Terminen. Scheine und Pläne: bestehende Scheine mit Verrechnungsstand und Nachladen; bestehende Dokumente mit Hochladen, Kennzeichnung und Löschen | Vollständiges bisheriges Stammdatenformular im Seitenfenster. Nummernwechsel weiterhin über `baustelleUmnummern` mit eigener Rückfrage. Pauschal- und Einheitspreishinweis weiterhin aus dem angenommenen Angebot und nur im bestehenden Rechteumfang. Kein neues Preisfeld |
| Kunde | Name, Nummer, Zustand und Kontakt im Kopf; Kundenart, UID, Ansprechpartner, Lieferantennummer, Notiz; kurze Liste aktiver Baustellen und Vorschau des nächsten Termins; VIES und Datenschutz | Baustellen und Belege: vollständige Baustellenliste, namensgleiche unverknüpfte Altbestände und Zuordnen, Rechnungen mit jüngsten fünf / allen, Angebote. Wartungen: alle Vereinbarungen mit Fälligkeit; vollständige Terminkarte. Ohne Wartungsmodul heißt der dritte Bereich „Termine“, falls Termine zulässig sind | Vollständiges bisheriges Formular einschließlich strukturierter Anschrift, Kunden-/Lieferantennummer, Kundenart, UID, Notiz und Zustand. VIES prüft weiterhin nur die gespeicherte UID; bei geändertem Entwurf deaktiviert. Support liest ohne Prüfschreibrecht |
| Benutzer | Name und Rolle im Kopf; Anmeldekonto, Einstufung einschließlich Lehrzeit/Budgetregel und Eintritt; Geburtsdatum mit eigenem Bearbeitungsfenster | Arbeitszeit und Urlaub: alle bisherigen Soll-, Startsaldo-, Resturlaubs-, Tagessoll- und Arbeitstagewerte, bestehende Urlaubsanspruchsanpassungen. Zugang und Rechte: Rolle/Freigaben, Passwort-Mail oder Startpasswort, Konto umstellen, aktivieren/deaktivieren, Datenschutz. Wo kein Zugang verwaltet werden darf, heißt der Bereich „Datenschutz“, falls vorhanden | Vollständiges bisheriges Profilformular einschließlich Rollen, Freigaben, Einstufung und Zeitkonto. Keine neue Kontenanlage und keine neue Saldoberechnung. Sperre des eigenen Kontos, Administratorgrenze und KJBG-Rückfrage bleiben bestehen |

## Gemeinsame Bedienung

`AktenBereiche` verbindet drei horizontale Bereiche mit beschrifteten Panels,
Pfeiltasten, Pos1/Ende und `?bereich=`. Alte Abschnittsanker öffnen den passenden
Bereich. Panels bleiben montiert: ein Bereichswechsel verwirft weder Eingaben
noch Aufklappzustände. Nicht erlaubte Inhalte werden weiterhin nicht gerendert.

`AktenBearbeiten` verwendet das vorhandene Seitenfenster / mobile Blatt mit
Fokusfalle und gesperrtem Hintergrund. Schließen, Escape und der Schleier fragen
bei einem geänderten Entwurf nach; Abbrechen behält die Eingaben, Verwerfen setzt
sie zurück. Während des Speicherns schließt das Fenster nicht. Erfolgreiches
Speichern schließt es; ein Fehler bleibt bei den Eingaben. Der bestehende
Seitenwechsel-/Unload-Schutz bleibt zusätzlich bestehen.

`AktenTerminVorschau` erhält den Lade- und Fehlerstand aus derselben Terminkarte;
keine zusätzliche Terminabfrage. „Nächster Termin“ ist ein Kundentermin und kein
erfundener Einsatz. Ohne Termin oder bei einem Ladefehler steht der entsprechende
Zustand da. Die Arbeitszeitwerte des Benutzers sind Einstellungen, keine aktuellen
Salden; diese stehen weiter in der Mitarbeiterübersicht.

## Prüfung

- Vorher: 182 bestehende Akten-/Stundenprüfungen grün.
- Gegenprobe vor Umsetzung: neue Bereichs-/Fensterprüfungen mangels Bausteinen rot;
  sechs neue Verhaltensprüfungen rot, vorhandene Administratorgrenze weiterhin grün.
- Bestehende Tests gehen über Bearbeiten bzw. den passenden Reiter; fachliche
  Aussagen zu Schreibargumenten, Rechten, Fehlermeldungen, UID, Zahlen, KJBG,
  Nummernwechsel, Dokumenten und Belegen bleiben geprüft.
- Browserweg `akten.spec.ts`: alle drei Akten lesen, bearbeiten, speichern,
  Datenbankstand und erneutes Öffnen prüfen; Entwurfsrückfrage mit Abbrechen.
- Geburtsdatum: eigener Entwurf mit Verwerfenschutz, unabhängiges Speichern und
  anschließende KJBG-Rückfrage mit dem neu gespeicherten Datum; Gegenprobe gegen
  die vorherige Akte rot.
- Neuer Browserweg gegen den vorherigen Quellstand: rot an den fehlenden Bereichen,
  mit der neuen Akte grün einschließlich realer Schreibvorgänge.
- 72 Browseransichten (hell und dunkel): drei Akten × drei Breiten (390 / 834 / 1440) × drei
  Bereiche und Bearbeitungsfenster × zwei Farbsätze. Keine JavaScript-Fehler, Überbreiten oder
  axe-Verstöße nach WCAG 2 A/AA, 2.1 AA und 2.2 AA.

Die Vorschau verwendet Beispieldaten. Die Schreibprüfung verwendet ausschließlich
den lokalen Durchklick-Betrieb. Keine Änderung an Migrationen, Rechten,
Berechnungen, Exporten oder Produktionsdaten.

Bei der ersten Gesamtprüfung gefunden und berichtigt: zwei neue Aufklapptexte
verwendeten einen im Dunkelmodus zu dunklen Petrolton; jetzt den semantischen
Textton. Die lokale Testdatenbank hatte sechs aus main bekannte Migrationen
noch nicht angewendet. Nach `db push --local` entspricht sie dem Quellstand;
keine Änderung an den Migrationen und keine Produktionsmigration durch diesen
Arbeitsschritt. Die Startanleitung der Cloud-Umgebung prüft das künftig mit.

Die neue Aktenprüfung kontrolliert auch, dass Speichern nach einer Änderung
im obersten Feld des Kundenformulars im sichtbaren Fenster liegt. Der
Speichern-Balken steht dafür außerhalb der Notizgruppe am Formularende;
sonst hätte deren Beginn die klebende Leiste unter den sichtbaren Ausschnitt
geschoben. Auf allen drei Breiten mit erhaltenem Entwurf nach Abbrechen geprüft.
