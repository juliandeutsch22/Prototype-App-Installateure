# Auslieferungsprotokoll

**Merge und Deployment sind seit der neuesten Nutzerentscheidung am
09.10.2026 ausgesetzt.** Erst den neuesten Repository-Stand und bereits
eingebrachte Fixes abgleichen, alle Zusammenhänge erneut prüfen und das
Ergebnis vorlegen. Nur nach einem ausdrücklichen neuen Go des Nutzers mergen;
vorher auch keine Auslieferung.

GitHub-Lesen und CLI-Schreiben funktionieren inzwischen. Der vollständige
Arbeitsstand und die Themenbranches sind gesichert; frühere 403-Proben sind
überholt. Ein hochgeladener Arbeitsbranch ist kein Nachweis grüner GitHub-CI.
Anbieterzugänge sind in dieser Umgebung nicht konfiguriert.

## Vorbereitung und Reihenfolge

1. Die Änderungen nach Themen als prüfbare PRs vorbereiten. Kein Token in Chat
   oder Berichte übernehmen. Aktuellen `main` vor Veröffentlichung erneut
   vergleichen und zwischenzeitliche Änderungen erhalten.
2. Nur den abschließend korrigierten Gesamtstand ausliefern. Insbesondere
   darf die überholte verpflichtende Betriebs-MFA aus einem Zwischenstand
   nicht produktiv werden. Bei mehreren Topic-Merges die automatische
   Main-Auslieferung zunächst anhalten; PR-CI weiter ausführen. Nach sämtlichen
   grünen PR-Prüfungen und Merges die Auslieferung wieder aktivieren und den
   finalen Main-Commit gezielt ausliefern. Die vorhandenen Workflows liefern
   sonst jeden Main-Push nacheinander aus.
3. Migrationen von null in CI und produktiven Migrationsstand vergleichen;
   vorhandene Migrationen nicht umschreiben, produktive Zeilen nicht löschen.
   Neue Funktionen besitzen feste Suchpfade und eng begrenzte Rechte.
4. Bestehende Workflow-Kette verwenden: Schema → Edge Functions → App.
   Nicht den eigenständigen App-Workflow vor dem Schema auslösen. Pflichtwerte
   und Secrets gemäß `../DEPLOYMENT.md` sicher an den vorgesehenen Orten setzen.
5. GitHub-Läufe und tatsächlich ausgelieferten Commit/Bauzeit prüfen.
   Lokale Tests oder der Hosting-Emulator ersetzen diese Schritte nicht.

## Prüfung live mit eigens vorgesehenen Testkonten

| Ablauf | Erwartung |
|---|---|
| Globaler Admin, bestätigte gespeicherte Sitzung | Plattformzugang; erneutes Öffnen ohne neue TOTP-Einrichtung/-Prüfung |
| Globaler Admin, ausdrücklich abgemeldet | Anmeldung mit vorhandenem Faktor; kein Zugang zu Plattformfunktionen auf aal1 |
| Buchhaltung/GF/Administration ohne Faktor | Betrieb bleibt nutzbar, kein Pflicht-Setup |
| Fremder Betrieb und Support „ansehen“ | Keine Erweiterung vorhandener Daten-/Schreibrechte |
| Angebotsannahme zweimal/gleichzeitig | Eine bestehende Baustelle, kein halb angelegter Auftrag |
| Alte Angebote/Anforderungen suchen | Treffer über den ganzen Serverbestand; 50er-Seiten, vollständige Einkaufssumme |
| Urlaub genehmigen | Datenbankstand und Abwesenheitsmonat stimmen; erlaubte Gründe je Rolle |
| Anforderung eilig an/aus | Nur Priorität geändert; Status, Beschaffung und Bestand gleich |
| Zeit ändern/löschen | Journal mit tatsächlichem Bearbeiter und Vorher/Nachher; keine fremden privaten Daten |
| Mahnung/Archiv | Gespeichertes Original gleich Download und ZIP; fehlende historische Originale ausdrücklich benannt |
| Start, Fachroute, Asset | nosniff/Referrer-Policy, ausschließlich CSP-Report-Only; HTML nicht dauerhaft gecacht, Hash-Assets immutable |
| Bestehende mobile Abläufe | Zeit, Material, Schein/PDF, Storno/Zahlung und Offline-Abgleich vollständig |

Fachliche Testbuchungen nur in einem eigens vorgesehenen Testbetrieb nach
betrieblicher Regelung durchführen. Keine produktiven Bestände bereinigen.

## Rückbau und Vorfälle

Fehler: betroffenen Ablauf, Commit, Gerät und reproduzierbare Schritte
festhalten; nach Schweregrad Zugang/Auslieferung begrenzen. Hosting-Version
kann zurückgestellt werden. Ein Git-Revert rollt Datenbankmigrationen nicht
zurück: additive Migrationen bestehen weiter; bei Datenbankfehlern eine
gezielte Korrekturmigration prüfen. Keine automatische Rücksicherung über
laufende Produktionsdaten. Verantwortliche, Kontaktweg und getestete
Rücklaufzeiten vor dem Launch eintragen.

## Tatsächliche Nachweise eintragen

- Finaler Main-Commit und PRs: offen.
- GitHub-CI des Arbeitsbranches: [aktuelle Prüfung](erneute-pruefung.md). Typen,
  Lint, 4.697 Einheiten sowie 55 Browser-/sieben Rollenwege grün. Abschluss
  der letzten Datenbanksuite noch ausstehend; Auslieferungsjobs übersprungen.
- Migrationen/Functions/Hosting-Lauf und Zielprojekt: offen.
- Domain, ausgelieferter Commit, Headerantworten: offen.
- Live-Prüfperson, Zeitpunkt und Resultate: offen.
- Externe Sicherung/Geräte-/fachliche Abnahmen: siehe
  `betrieb-und-fachpruefung.md`; noch nicht bestanden.
