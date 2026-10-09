# Betrieb und fachliche Abnahme

Stand: 09.10.2026. Diese Liste bereitet reale Prüfungen vor; kein Punkt gilt
allein durch das Vorliegen dieser Vorlage als bestanden.

## Betreiberkonten und produktive Einrichtung

| Schritt | Konkreter Nachweis |
|---|---|
| Supabase | Projektkennung, EU-Region, bezahlter Tarif, Betreiberzugänge; Auth-Registrierung aus, sichere Passwortänderung und TOTP an |
| Domain/Hosting | Domain im gewählten Firebase-Projekt, DNS und TLS korrekt; Auth-Weiterleitungen auf die tatsächlich verwendete Domain |
| SMTP | Anbieter, Absenderdomain/SPF/DKIM/DMARC, sichere Konfiguration im Auth-Dienst; echte Einladung und Rücksetzung auf Testkonto, Link einmalig und richtige Domain |
| Push | Firebase-Web-/VAPID-Werte und Edge-Secret `FCM_DIENSTKONTO`; Zustellung auf realem Gerät |
| Externe Sicherung | Zweiter S3-Anbieter; fünf Secrets ausschließlich bei den Edge Functions; nur Anlegen erlaubt, Lesen/Löschen separat; Lifecycle schriftlich bestätigt |
| Rücklauf | Eine externe Sicherung in isolierter Umgebung einlesen, Zeilen und Dateien/Prüfsummen samt Mahnungen/Journal vergleichen; Dauer, Alter und verantwortliche Person protokollieren |

Keine Zugangsschlüssel in Chat, Repository oder Prüfbericht übernehmen.
Konfigurationsorte und genaue Schritte stehen in `../DEPLOYMENT.md`.
Die lokalen Rücklauftests ersetzen die Prüfung beim gewählten Anbieter nicht.

## Kanzlei: Import und fachliche Abstimmung

Die feststehenden Muster aus `tests/unit/belegReferenz.test.ts` decken
Rechnung, Reverse Charge mit Storno, Teilzahlung und Zahlung mit Skonto ab.
Konten und Steuercodes sind Muster; weder die Zahlen noch die Kundennummern
sind Produktionsdaten. BMD-Stapel bleiben bis zum echten Import „vorgebaut“.

1. Beide CSVs mit Semikolon, Komma-Beträgen, Datum TT.MM.JJJJ und Kundennummer
   in eine isolierte BMD-Testmandanz importieren; Importdefinition aufheben.
2. Rechnungsausgang: 1.416,60 EUR, 768,00 EUR und Reverse Charge 2.000,00 EUR;
   Storno der RC-Rechnung mit vertauschten Konten am 20.09.2026 vergleichen.
3. Zahlungen: 752,64 EUR Bank + 15,36 EUR Skonto auf 768,00 EUR; Teilzahlung
   500,00 EUR auf 1.416,60 EUR. OP, Erlös und Steuer gemeinsam abstimmen.
4. Zusätzlich mit betrieblich korrektem Kontenrahmen: Anzahlung/Schlussrechnung
   mit und ohne Steuercode am Anzahlungskonto; Skonto/USt-Korrektur,
   Fremdperioden-Storno, mehrere Steuersätze und fehlende Kundennummer prüfen.
5. Ergebnis: BMD-Version, Importdefinition, Konten/Steuercodes, Soll/Ist,
   Warnungen, korrigierte Datei und Freigabe der Kanzlei festhalten.

UID/VIES: gültige, ungültige und nicht erreichbare Abfrage über die produktiv
konfigurierte Edge Function prüfen. Die lokalen Fälle prüfen Verarbeitung und
Fehlerbehandlung, bestätigen keine Erreichbarkeit des EU-Dienstes.

## WKO/Arbeitsrecht

Bereits bestätigte Entscheidungen zum Sonderurlaub nicht erneut ändern.
Offen sind insbesondere Ruhepausen und der 48-Stunden-Durchschnitt, die
derzeit nicht als vollständige Grenzprüfung vorliegen. Normalarbeitszeit gilt;
Gleitzeit/Durchrechnung sind zurückgestellt.

Prüffälle: 60-Stunden-Woche, tägliche Ruhezeit, Wochenruhe, Feiertag/Nacht,
zulässige Ausnahme mit Büro-Begründung, Jugend-/Lehrlingsgrenzen und das
Zusammenspiel von Urlaub, Krankheit und Freistellung. Dazu Mahnzinsen,
Basiszinssatz, Spesen gegenüber Unternehmen/Verbrauchern und Rücklass
fachlich bestätigen. Je Fall Norm/KV-Fassung, Zeitraum, Soll/Ist und
Entscheidung dokumentieren. Gesetzliche Werte ohne belastbare Entscheidung
nicht pauschal umstellen.

## Drei reale Geräte

Je Gerät Modell, iOS/Android-Version, Browser/PWA-Modus, App-Commit und
Prüfperson notieren. Mindestens ein aktuelles und ein älteres unterstütztes
iPhone sowie ein Android-Gerät verwenden; iOS-Web-Push nur unter tatsächlich
unterstützten System-/PWA-Bedingungen erwarten.

| Ablauf | Nachweis |
|---|---|
| PWA installieren und wieder öffnen | Navigation, gespeicherte Sitzung, richtiger Commit |
| Globaler Admin | Einmalige TOTP-Einrichtung, Sitzung wieder öffnen ohne neuen Code; ausdrückliches Abmelden verlangt wieder Bestätigung |
| Monteur/Betriebskonten | Keine verpflichtende TOTP-Einrichtung; eingerichtete freiwillige Faktoren behalten ihren Schutz |
| Push erlauben/ablehnen | Tatsächliche Zustellung, Zielseite, Sperrbildschirm und Entzug; ohne Erlaubnis übrige App nutzbar |
| Foto/Kamera | Aufnahme, Abbruch, erneute Auswahl, Upload und Öffnen nach Neuanmeldung |
| Unterschrift | Touch-Eingabe, Speichern, PDF, Öffnen auf anderem Gerät; keine verlorenen Striche |
| Ohne Netz → mit Netz | Zeit/Material erfassen, wartenden Stand sehen, genau einmal abgleichen; Konflikt sichtbar |
| Neue App-Fassung | Mit alter geöffneter PWA ausliefern, Aktualisierung abwarten, Daten erhalten, Commit geprüft |

Automatisiertes WebKit bestätigt Browserabläufe, ersetzt aber keine Kamera-
oder Pushprüfung auf iOS-Hardware.

## Zwei Pilotwochen

Start/Ende, verwendeter Commit und Rollen festlegen. Täglich mindestens
Zeit → Schein → Rechnung/Zahlung, Material → Lieferung/Lager und
Urlaub → Genehmigung → Zeitkonto prüfen. Seltene Abläufe gezielt einplanen:
Storno, Skonto, Retoure, Berechtigungswechsel, Offline-Abgleich und Auskunft.

Rückmeldungsvorlage: Datum · Rolle/Gerät · Ablauf · Soll/Ist · reproduzierbare
Schritte · Schweregrad · Beleg ohne fremde personenbezogene Daten · Behebung
und Nachprüfung. Abschluss erst nach mindestens zwei Wochen ohne offene
Rückmeldung der Stufe hoch; vorhandene Handbuch-Kurzinfo je Rolle verwenden.

## Angebotsdoppelbestände

Produktive Bestände wurden nicht gelesen oder verändert. Nur lesend prüfen:
mehrere Baustellen mit demselben Angebotsbezug, angenommene Angebote ohne
Baustelle, abgebrochene Annahmen und belegte Folgeaufträge. Gemeinsam mit dem
Betrieb jeden Verdacht an Angebot, Baustellenakte, Zeiten, Scheinen und
Rechnungen abgleichen. Gleiche Namen oder Adressen sind kein Löschgrund.
Keine automatische Zusammenführung/Löschung; die atomare Annahme schützt
neue Vorgänge und erhält vorhandene Zuordnungen.
