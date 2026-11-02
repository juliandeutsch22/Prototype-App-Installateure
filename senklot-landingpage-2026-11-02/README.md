# Senklot – Dein Betrieb. Im Lot.

Landingpage-Entwurf auf Grundlage der am 02.11.2026 veröffentlichten App. Die Seite enthält lokale Schriften, Bilder und JavaScript sowie einen Node-Server für das Kontaktformular. Sie wurde nicht als Website veröffentlicht; die App bleibt unverändert.

[![Einstieg](01-einstieg.png)](landingpage-1440.png)

- [Vollständige Desktop-Seite](landingpage-1440.png)
- [Vollständige mobile Seite](landingpage-390.png)
- [Tablet](landingpage-834.png)
- [Fertige HTML-Seite herunterladen](landingpage.zip?raw=true) – entpacken und mit Node.js ab 24.5 über `npm run preview` starten. Die rein visuelle Seite lässt sich auch als `index.html` öffnen; die Formularprüfung benötigt den Server.

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

**Noch nicht live aktiviert:** Cloudflare Turnstile und Resend sind vorbereitet, aber noch nicht als Dienste eingerichtet. Die lokale Vorschau zeigt das ausdrücklich und sendet keine E-Mails. Bei fehlender produktiver Konfiguration bleibt der Versand gesperrt. Für echte Anfragen sind Domainfreigabe, privater CAPTCHA-Schlüssel, verifizierter Mailabsender/API-Schlüssel sowie angepasste Datenschutzhinweise erforderlich. [Konfiguration und Betriebsgrenzen](server/README.md).

`npm test` prüft zehn serverseitige Fälle mit simulierten Diensten. Browserprüfungen testen zusätzlich Tokenablauf, gesperrte Mehrfachklicks, erhaltene Eingaben bei Fehlern, serverseitige Feldfehler, Wiederholungsschlüssel sowie das Zurücksetzen erst nach bestätigtem Versand. Keine echte Test-E-Mail wurde verschickt. Die tatsächliche Zustellung und Turnstile-Integration müssen nach Einrichtung auf der eigenen Domain noch geprüft werden.

## Tatsächliche Produktansichten

Zehn neue Aufnahmen aus dem veröffentlichten Quellstand, mit derselben App-Oberfläche und ausschließlich fiktiven Vorschau-Daten. Die Oberfläche wurde für die Bilder nicht vereinfacht, umgebaut oder durch generierte UI ersetzt. Die IBM-Plex-Mono-Schrift wird in der lokalen App-Vorschau entsprechend der Produktions-Schriftdefinition ergänzt.

Die Landingpage übernimmt Petrol, das technische Raster, Poppins und IBM Plex Mono sowie die sachliche Liniengestaltung der aktuellen Planlinie. Auf der Website sind die Texte und Abstände auf Produktvorstellung statt tägliche App-Bedienung abgestimmt.

## Prüfung

Geprüft bei 390, 834 und 1440 px: keine horizontalen Dokumentüberläufe, JavaScriptfehler oder fehlenden lokalen Ressourcen. Produkt-Tabs, Tastatursteuerung, Bildvergrößerung, Escape/Rückfokus, Fragen, interne Sprungziele und Kontakt-/Login-Links sind geprüft. Hinzu kommen monatliche/jährliche Preise, Tarifvorauswahl und Formularprüfung ohne Versand. Die automatische axe-Prüfung meldete auf diesen Ansichten keine Befunde; das ersetzt keine vollständige Barrierefreiheitsabnahme.

Die Aufnahmen sind keine erneute fachliche Prüfung der Betriebssoftware. Es wurden keine Produktionskonten angemeldet, Geschäftsdaten geschrieben oder E-Mails versendet.

[Quellen und Abgrenzung](QUELLEN.md) · [Messdaten](nachweise/pruefung.json) · [Produktaufnahmen](nachweise/app-aufnahmen.json) · [Formularprüfungen](nachweise/kontakt-pruefung.json) · [Serverprüfungen](nachweise/server-tests.txt)
