# Prüfung der Sicherheitsrevision

Die Protokolle beziehen sich auf den ausgelieferten Quellstand, lokale Server und ausschließlich künstliche Daten. Keine produktiven Postfächer oder CAPTCHA-Schlüssel wurden verwendet.

- `php-tests.txt`: PHP-Eingabe-/Origin-/Turnstile-/Fehler-/Wiederholungstests, persistente Speichergrenzen und 16 parallele PHP-Prozesse.
- `smtp-tests.txt`, `smtp-pruefung.json`: echter lokaler TLS-SMTP-Dialog mit PHPMailer. Ein unbekanntes Testzertifikat wird abgelehnt; dasselbe Zertifikat wird nur nach explizitem Vertrauen in die lokale Test-CA akzeptiert. Empfänger und Reply-To wurden geprüft. Keine Weiterleitung echter E-Mails.
- `apache-pruefung.json`: realer Apache mit PHP 8.3, HTTP/HTTPS, gültig geprüftem lokalem Testzertifikat, Sicherheitsheadern, gesperrten internen Pfaden und deaktiviertem Formular ohne Konfiguration.
- `browser-pruefung.json`: neun Seiten bei 320, 390, 834 und 1440 Pixeln, axe bei 390/1440, CSP- und JavaScriptfehler, keine externen Anfragen vor Einwilligung, kein Browser-Speicher und JavaScript-freie Kontaktalternative.
- `../kontakt-pruefung.json`: Live-Modus mit simuliertem Turnstile, ausdrückliche Aktivierung/Widerruf, Tokenablauf, Fehlererhalt, wiederholte Anfrage-ID und Erfolg nur nach Bestätigung.
- `paket-pruefung.json`: Quellenprüfsummen des gepinnten Versandbausteins, Tarifkonsistenz, ZIP-Integrität und Ausschluss echter Konfiguration/Zustandsdateien.

Die Prüfscripte liegen neben diesen Protokollen. Die Testumgebung verwendet Docker `php:8.3-apache`, Chromium und Playwright/axe aus dem vorhandenen App-Testworkspace. Für eine erneute Ausführung sind diese Abhängigkeiten sowie lokale Testserver/Ports und Testzertifikate einzurichten; sie sind keine Hosting-Abhängigkeiten.

Der Testserver `smtp-mock.py` bindet nur 127.0.0.1:5283. Testzertifikate liegen ausschließlich im temporären Testverzeichnis und werden nicht ausgeliefert. Im Produktivcode wird die TLS-Zertifikatsprüfung weder deaktiviert noch durch eine Test-CA ersetzt.

Offen bleiben der reale World4you-Upload, echte Kontokonfiguration, Prüfung der Rechtstexte und tatsächliche Zustellung/Turnstile auf der Produktdomain. Die Tests sind keine vollständige Penetrationsprüfung.
