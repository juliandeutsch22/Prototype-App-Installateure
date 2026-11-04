# Prüfung der Sicherheitsrevision

Die Protokolle beziehen sich auf den ausgelieferten Quellstand, lokale Server und ausschließlich künstliche Daten. Keine produktiven Postfächer oder CAPTCHA-Schlüssel wurden verwendet.

- `php-tests.txt`: PHP-Eingabe-/Origin-/Turnstile-/Fehler-/Wiederholungstests, persistente Speichergrenzen und 16 parallele PHP-Prozesse. Zusätzlich werden alle neuen Monats-/Jahrespreise sowie eine ausdrücklich gewählte oder nicht gewählte optionale Einrichtung geprüft.
- `smtp-tests.txt`, `smtp-pruefung.json`: echter lokaler TLS-SMTP-Dialog mit PHPMailer. Ein unbekanntes Testzertifikat wird abgelehnt; dasselbe Zertifikat wird nur nach explizitem Vertrauen in die lokale Test-CA akzeptiert. Empfänger und Reply-To wurden geprüft. Keine Weiterleitung echter E-Mails.
- `apache-pruefung.json`: realer Apache mit PHP 8.3, HTTP/HTTPS, gültig geprüftem lokalem Testzertifikat, Sicherheitsheadern, gesperrten internen Pfaden und deaktiviertem Formular ohne Konfiguration.
- `browser-pruefung.json`: neun Seiten bei 320, 390, 834 und 1440 Pixeln, axe bei 390/1440, CSP- und JavaScriptfehler, keine externen Anfragen vor Einwilligung, kein Browser-Speicher und JavaScript-freie Kontaktalternative.
- `../kontakt-pruefung.json`: Live-Modus mit simuliertem Turnstile, ausdrückliche Aktivierung/Widerruf, Tokenablauf, Fehlererhalt, wiederholte Anfrage-ID, optionale Einrichtung und Erfolg nur nach Bestätigung.
- `paket-pruefung.json`: Quellenprüfsummen des gepinnten Versandbausteins, Tarifkonsistenz, ZIP-Integrität und Ausschluss echter Konfiguration/Zustandsdateien.

Die Prüfscripte liegen neben diesen Protokollen. Die Testumgebung verwendet Docker `php:8.3-apache`, Chromium und Playwright/axe aus dem vorhandenen App-Testworkspace. Für eine erneute Ausführung sind diese Abhängigkeiten sowie lokale Testserver/Ports und Testzertifikate einzurichten; sie sind keine Hosting-Abhängigkeiten.

Der Testserver `smtp-mock.py` bindet nur 127.0.0.1:5283. Testzertifikate liegen ausschließlich im temporären Testverzeichnis und werden nicht ausgeliefert. Im Produktivcode wird die TLS-Zertifikatsprüfung weder deaktiviert noch durch eine Test-CA ersetzt.

Offen bleiben der reale World4you-Upload, echte Kontokonfiguration, Prüfung der Rechtstexte und tatsächliche Zustellung/Turnstile auf der Produktdomain. Die Tests sind keine vollständige Penetrationsprüfung.

## Lokaler Formularschutz

`lokal-tests.txt` prüft zusätzlich Herkunftsbindung, Signaturen, Mindestzeit, Ablauf, Einmalverwendung mit 16 parallelen Prozessen, Schlüsseltrennung, getrennte Anfragebegrenzungen, Fehlerfälle und Kompatibilität mit bisherigen Konfigurationen/Zustandsdateien.

`lokal-http-pruefung.json` stammt aus einer isolierten Apache/PHP-Instanz mit ausschließlich künstlicher SMTP-Konfiguration und einem lokalen TLS-SMTP-Testserver. Geprüft werden das echte Vorbereiten und Absenden ohne Cloudflare-Schlüssel, gesperrte interne Dateien, Origin-/JSON-/Größengrenzen, Mindestzeit, Token-Replay, feste Empfängeradresse und freiwillige Einrichtung. Die Test-CA wird nur in der Testinstanz ausdrücklich vertraut. Die Produktions-SMTP-Verbindung prüft weiterhin das Serverzertifikat. Der lokale Testserver fordert kein Client-Zertifikat und leitet keine E-Mail nach außen weiter.

`lokal-browser-pruefung.json` prüft den lokalen Live-Modus bei vier Bildschirmbreiten mit simulierten Tokens: keine externen Requests, kein Browser-Speicher, Erneuerung, Wiederholungsschlüssel, Fehlererhalt und Erholung nach Ablauf oder Verbindungsfehler. Der tatsächliche kryptographische Token-/HTTP-Ablauf wird separat durch die PHP- und HTTP-Prüfungen geprüft.
