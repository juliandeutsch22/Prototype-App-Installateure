# Funktionsumfang für eine spätere Umsetzung

Die Vorschau ist ein eigenständiges Designmodell mit fiktiven Daten. Sie ist
kein auslieferbarer Ersatz der bestehenden Seiten. Aktionen simulieren nur
die im Entwurf besprochenen Zustände; sie schreiben nichts in die App.

| Gezeigter Ausschnitt | Was bei der Umsetzung vollständig erhalten bleiben muss |
|---|---|
| Rechnung: Liste / Rückmeldung | Alle bestehenden Filter, Rechnungsarten, Suche, Nachladen, Nummernregeln, Leistungsstichtage, Positionen, Rabatte, Reverse Charge, UID-Prüfung, Rücklässe, Anzahlungs-/Teil-/Schlussrechnung, Zahlungen, Mahnungen, Storno, E-Rechnung, Exporte und gespeicherter Ausstellerstand. |
| Rechnung: Fehlerzusammenfassung | Nur Rückmeldung und Feldzuordnung verfeinern. Vorhandene fachliche Sperren und Hinweise nicht durch die zwei Beispielprüfungen im Mockup ersetzen. |
| Rechnung: ungewisser Ausgang | Keine Zusage „gespeichert“ oder „nicht gespeichert“ ohne Beweis. Kein automatischer zweiter Ausstellungsaufruf. „Status prüfen“ ist ein Ablaufentwurf, dessen sichere technische Grundlage noch nachzuweisen ist. |
| Firmendaten: Briefkopf / Steuer / Speicherleiste | Logo samt Aufbereitung, sämtliche Adressfelder und Länderwahl, Firmenbucheintrag und Gericht, UID, IBAN/BIC/Bank, Kontakt, Firmenfarben samt Kontrastprüfung, alle bestehenden Pflicht-/Altbestands-/PLZ-Regeln. Die Screens fokussieren Briefkopf und Speicherstand; die weiteren Formularabschnitte werden nicht entfernt. |
| Schutz ungespeicherter Eingaben | Bestehenden Hook und Dialoge wiederverwenden. Erkennen, ob wirklich etwas geändert wurde. Speichern, Verwerfen, Linkwechsel, Browser-Neuladen und Browser-Zurück getrennt prüfen; keine stillschweigende Router-Neuentwicklung. |
| Katalogsuche im Angebot | Vollständige Serversuche, Mindestlänge, Verzögerung, Ausschluss ausgelaufener Artikel, Name/Artikelnummer/Preis/Einheit, Übernahme mehrerer Positionen, Hinweis auf fehlenden Verkaufspreis und vorhandene Positionen beibehalten. |
| Zeiten / Material ohne Verbindung | Bestehendes Ausgangsfach, Eigentümerbindung, Bestätigt-/Queued-Unterscheidung, Wiederanlauf und Offline-Grenzen. Die gezeigte Zeile ist ein konkretes Beispiel nach bekanntem Queued-Ergebnis; keine beliebige Zeile als vorgemerkt oder abgelehnt markieren. Für Fehlermeldungen ohne verlässliche fachliche Zuordnung bleibt der Text allgemein. |
| Wichtige Nachsendefehler | Aktuelle Meldung ist nicht dauerhaft. Das Mockup zeigt die gewünschte Bestätigung innerhalb der Sitzung. Eine Haltbarkeit über App-Neustart benötigt ausdrücklich ein kontogebundenes Ablagekonzept; sie wird hier nicht als vorhanden behauptet. |
| Standardzustände leer / laden / Berechtigung | Bestehende Rollen- und Modulprüfung bleibt allein maßgeblich. Keine neue Berechtigung aus einem UI-Button. Leere Suche und leerer Datenbestand bleiben verschieden. |
| Start, Akten, Mitarbeiterübersicht, Planung, andere Tabs | Kein grundlegender Umbau vorgeschlagen. Insbesondere mobile Reiter statt Hamburger, Tage ohne Buchung mobil aufklappbar, vollständige Tabellen-/Zeitkonten-/Exportfunktionen und die zuletzt freigegebenen Planungsansichten erhalten. |

Die Screens sind für die Bewertung der Zustände und der gemeinsamen visuellen
Sprache gedacht. Die Prüfung von Funktionsvollständigkeit muss nach Freigabe
an den echten Komponenten und ihren realen Datenwegen erfolgen.
