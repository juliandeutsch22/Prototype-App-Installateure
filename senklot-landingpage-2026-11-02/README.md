# Senklot – Dein Betrieb. Im Lot.

Landingpage auf Grundlage der am 02.11.2026 veröffentlichten App. Die bisherige Preis-/Kontaktfassung ist inzwischen unter senklot.at erreichbar. **Die neue Sicherheitsrevision mit PHP/SMTP für World4you, optional aktivierbarem Turnstile und separaten Rechtstext-Entwürfen ist vorbereitet; sie wurde aus dieser Sitzung noch nicht zu World4you hochgeladen.** Die Betriebssoftware bleibt unverändert.

[![Einstieg](01-einstieg.png)](landingpage-1440.png)

- [Vollständige Desktop-Seite](landingpage-1440.png)
- [Vollständige mobile Seite](landingpage-390.png)
- [Tablet](landingpage-834.png)
- [Fertige HTML-Seite herunterladen](landingpage.zip?raw=true) – entpacken und mit Node.js ab 24.5 über `npm run preview` starten. Für funktionierende Verzeichnislinks und die Formularprüfung den lokalen Server verwenden.
- [World4you-Uploadpaket](world4you-upload.zip?raw=true) – Website und geschütztes PHP-Backend einschließlich `.htaccess`, Sitemap und Rechtstext-Entwürfen. Kein Node-Server und keine echten Zugangsdaten. In das Hauptverzeichnis der Domain hochladen.
- [Veröffentlichung und Google/Bing einrichten](VEROEFFENTLICHEN.md).
- [Kurze Aufnahme der Animationen](animationen.webm?raw=true).

## SEO und Funktionsseiten

Individuelle Titel und Beschreibungen, Canonical-URLs, Open-Graph-/Social-Vorschaubild, strukturierte Anbieter-/Software-/Preisdaten, Sitemap mit sieben URLs sowie Crawlingregeln einschließlich OAI-SearchBot sind enthalten. Die sechs Seiten besitzen eigene Inhalte, Abläufe, Fragen, Produktbilder und passende Verbindungen:

| Funktion | Desktop | Mobil |
|---|---|---|
| Einsatzplanung | [Screen](einsatzplanung-1440.png) | [Screen](einsatzplanung-390.png) |
| Zeiterfassung & Team | [Screen](zeiterfassung-1440.png) | [Screen](zeiterfassung-390.png) |
| Digitale Handwerksscheine | [Screen](handwerksscheine-1440.png) | [Screen](handwerksscheine-390.png) |
| Kunden & Baustellen | [Screen](kunden-baustellen-1440.png) | [Screen](kunden-baustellen-390.png) |
| Material & Lager | [Screen](material-lager-1440.png) | [Screen](material-lager-390.png) |
| Angebote & Rechnungen | [Screen](angebote-rechnungen-1440.png) | [Screen](angebote-rechnungen-390.png) |

Die Apache-Datei führt HTTP und www dauerhaft auf `https://senklot.at/` und entfernt `index.html` aus den öffentlichen URLs. Pfade und Queryparameter bleiben erhalten; Status 308 erhält auch die Request-Methode. Die Regeln wurden lokal in einem tatsächlichen Apache-Server geprüft. Die Konfiguration auf World4you muss nach dem Upload ebenfalls geprüft werden.

Die kurzen Erscheinanimationen laufen einmal beim Sichtbarwerden. Reduzierte Bewegung wird auch bei nachträglicher Änderung respektiert; Inhalte bleiben ohne JavaScript oder Animationsunterstützung sichtbar. Produktbilder sind verlustfrei als WebP rund 65 % kleiner. Es gibt keine dauernden Bewegungen oder animierten Formularzustände.

**Noch extern auszuführen:** Upload zu World4you, Verifizierung in Google Search Console und Bing Webmaster Tools, Sitemap einreichen und den tatsächlichen Indexierungsstatus beobachten. Dafür fehlen in dieser Sitzung die Kontozugänge. Es wurde keine Indexierung oder bestimmte Suchplatzierung behauptet.

## Die Seite von oben nach unten

[![Einstieg und Funktionen](chat-01.png)](chat-01.png)
[![Ablauf und Außendienst](chat-02.png)](chat-02.png)
[![Produkteinblick und kaufmännischer Überblick](chat-03.png)](chat-03.png)
[![Rollen, Fragen und Kontakt](chat-04.png)](chat-04.png)

## Inhalt und Verbindungen

- Demo-Anfragen: Kontaktformular mit Tarifvorauswahl sowie direkter E-Mail-Link **office@senklot.at**.
- Telefon im Kontaktbereich und Footer: **+43 660 6322503**.
- Anmeldung: **https://app.senklot.at/**. Die erreichbare Schreibweise mit „k“ wurde anhand der App und ihrer Versionskennung überprüft.
- Impressum und Datenschutz verweisen auf die vorhandenen Seiten der App.
- Preise nach Vorgabe: Starter 129 €, Team 229 €, Betrieb 379 € monatlich. Einrichtung 290 / 590 / 990 €. Alle Beträge netto zuzüglich gesetzlicher Umsatzsteuer. Keine erfundenen Referenzkunden, Bewertungen oder Einsparungszahlen.

## Neue Preis- und Kontaktbereiche

[![Preise – monatlich](06-preise-1440.png)](06-preise-1440.png)
[![Anfrageformular](07-kontakt-1440.png)](07-kontakt-1440.png)

[Jahreszahlung ansehen](06-preise-jaehrlich-1440.png) · [Preise mobil](06-preise-390.png) · [Kontakt mobil](07-kontakt-390.png)

Jährliche Vorauszahlung: genau 10 % Rabatt auf zwölf Monatsbeträge. Das entspricht effektiv 116,10 / 206,10 / 341,10 € monatlich; abgerechnet werden 1.393,20 / 2.473,20 / 4.093,20 € jährlich im Voraus. Die Einrichtung wird nicht rabattiert. Alle sechs vom Auftraggeber genannten Paketleistungen sind enthalten.

**Noch nicht live aktiviert:** Das World4you-Paket enthält jetzt PHP 8.2+ mit PHPMailer/SMTP statt des ursprünglichen Node-/Resend-Versandwegs. Turnstile lädt nur nach ausdrücklicher Aktivierung. Für echte Anfragen fehlen Postfachdaten, Turnstile-Schlüssel, Betreiberangaben, Prüfung der Rechtstexte und der Upload. Das Formular bleibt bis zur vollständigen privaten Konfiguration gesperrt. [Konkrete Einrichtung und verbleibende Aufgaben](VEROEFFENTLICHEN.md).

Die zwölf bisherigen Node-Tests bleiben als Prüfung des Vorschau-/alternativen Backends erhalten. Das neue PHP-Backend hat zusätzliche automatisierte Sicherheits- und Persistenzprüfungen, einen lokalen TLS-SMTP-Test und Browserprüfungen unter echtem Apache/PHP. Protokolle und reproduzierbare Tests stehen unter `nachweise/sicherheit/`. Es wurden keine echten E-Mails versendet. Die reale Turnstile-Integration und der Postfacheingang müssen auf dem eigenen Hosting geprüft werden.

## Tatsächliche Produktansichten

Zehn neue Aufnahmen aus dem veröffentlichten Quellstand, mit derselben App-Oberfläche und ausschließlich fiktiven Vorschau-Daten. Die Oberfläche wurde für die Bilder nicht vereinfacht, umgebaut oder durch generierte UI ersetzt. Die IBM-Plex-Mono-Schrift wird in der lokalen App-Vorschau entsprechend der Produktions-Schriftdefinition ergänzt.

Die Landingpage übernimmt Petrol, das technische Raster, Poppins und IBM Plex Mono sowie die sachliche Liniengestaltung der aktuellen Planlinie. Auf der Website sind die Texte und Abstände auf Produktvorstellung statt tägliche App-Bedienung abgestimmt.

## Prüfung

Die Sicherheitsrevision wurde auf allen neun Seiten bei 320, 390, 834 und 1440 px geprüft. Die bestehenden Funktionsprüfungen der Startseite liefen bei 390, 834 und 1440 px: keine horizontalen Dokumentüberläufe, JavaScriptfehler oder fehlenden lokalen Ressourcen. Produkt-Tabs, Tastatursteuerung, Bildvergrößerung, Escape/Rückfokus, Fragen, interne Sprungziele und Kontakt-/Login-Links sind geprüft. Hinzu kommen monatliche/jährliche Preise, Tarifvorauswahl und Formularprüfung ohne Versand. Die automatische axe-Prüfung meldete auf diesen Ansichten keine Befunde; das ersetzt keine vollständige Barrierefreiheitsabnahme.

Die Aufnahmen sind keine erneute fachliche Prüfung der Betriebssoftware. Es wurden keine Produktionskonten angemeldet, Geschäftsdaten geschrieben oder E-Mails versendet.

[Quellen und Abgrenzung](QUELLEN.md) · [Messdaten](nachweise/pruefung.json) · [Produktaufnahmen](nachweise/app-aufnahmen.json) · [Formularprüfungen](nachweise/kontakt-pruefung.json) · [Serverprüfungen](nachweise/server-tests.txt) · [SEO-Prüfungen](nachweise/seo-pruefung.json) · [Animationen](nachweise/animationen-pruefung.json) · [Apache](nachweise/apache-pruefung.json) · [Sicherheitsprüfung](nachweise/sicherheit/README.md)
