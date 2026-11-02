# Kontaktformular betreiben

Node.js ab 24.5, keine zusätzlichen Pakete. Im Projektverzeichnis: `npm run preview` für die ausdrücklich gekennzeichnete lokale Vorschau ohne Versand. `npm test` prüft ausschließlich mit simulierten Sicherheits- und Versanddiensten; es werden keine echten E-Mails versendet.

## Veröffentlichung vorbereiten

1. Cloudflare Turnstile einrichten: tatsächliche Website-Domains freigeben, öffentlichen Site-Key und privaten Secret-Key erstellen. Die Anwendung prüft serverseitig Erfolg, exakten Hostnamen und die Aktion `contact`. Öffentliche Testschlüssel aktivieren den Versand nicht.
2. Resend einrichten und die Absenderdomain `senklot.at` über DNS verifizieren. API-Schlüssel und freigegebenen Absender hinterlegen. Empfänger ist fest `office@senklot.at`; die Kundenadresse wird ausschließlich als Reply-To verwendet.
3. Variablen aus `.env.example` im privaten Secret-/Environment-Bereich des Hosters setzen. Die Beispieldatei ist keine automatisch geladene Konfiguration. Optional lokal mit `node --env-file=.env --use-env-proxy server/app.mjs` starten. Niemals echte Schlüssel veröffentlichen.
4. Website und API unter derselben HTTPS-Domain betreiben. `CONTACT_ORIGINS` enthält ausschließlich die tatsächlichen, vollständigen Website-Origins. `NODE_ENV=production npm start` starten; Reverse-Proxy zum konfigurierten Host/Port einrichten. Ein reines statisches Hosting führt den geschützten Versand nicht aus.
5. `TRUST_PROXY` nur aktivieren, wenn der Node-Port ausschließlich vom eigenen Reverse-Proxy erreichbar ist und dieser X-Forwarded-For zuverlässig setzt/ergänzt. Verwendet wird der letzte Eintrag. Standardmäßig wird nur die Socket-Adresse vertraut.
6. Datenschutzinformation um die tatsächlich gewählten Auftragsverarbeiter und deren Verarbeitung ergänzen. Danach mit echten Schlüsseln auf der eigenen Domain manuell den gesamten Ablauf prüfen: gültige Anfrage, abgelaufene Prüfung, Fehlerfall und tatsächlicher Eingang im Postfach.

## Grenzen und Sicherheitsverhalten

Ohne vollständige Konfiguration bleibt das Formular gesperrt; E-Mail und Telefon funktionieren als direkte Alternativen. `--preview` ist in Produktion verboten und gibt niemals eine Versandbestätigung aus. Servervalidierung, Origin-Prüfung, Honeypot, 12-KB-Grenze und ein begrenzter IP-Ratelimiter ergänzen Turnstile. Private Schlüssel gelangen nicht in die öffentliche Konfigurationsantwort. Der Server schreibt weder Formularinhalte noch Tokens in Logs.

Der Ratelimiter gilt für **eine Node-Instanz** (8 Versuche je 15 Minuten, maximal 5.000 gleichzeitig gespeicherte IP-Hashes). Für mehrere Instanzen oder Neustartbeständigkeit muss vor dem öffentlichen Betrieb ein gemeinsamer Limitspeicher bzw. ein vorgeschaltetes verbindliches Gateway-Limit eingerichtet werden. Ein Neustart setzt den lokalen Zähler zurück. Ein Request kann bei Versandproblemen bereits angekommen sein: dieselbe unveränderte Wiederholung verwendet deshalb denselben Resend-Idempotenzschlüssel. Die providerseitige Gültigkeit beträgt 24 Stunden. Keine unbegrenzte Zustellgarantie; das Formular bewahrt bei Fehlern die Angaben.

Preise werden in Cent serverseitig berechnet. Jahreszahlung: genau 10 % Rabatt auf zwölf Monatsbeträge, Einrichtung unverändert. Alle Beträge netto zuzüglich gesetzlicher Umsatzsteuer. Die Anfrage löst weder Zahlung noch Vertragsabschluss aus.

## SEO und statische Funktionsseiten

Der Node-Server liefert Startseite, sechs Funktionsseiten, Sitemap, robots.txt und optimierte WebP-Bilder aus. Er normalisiert www-, Verzeichnis- und index.html-Adressen. Die HTTPS-Weiterleitung muss bei Node-Betrieb im vertrauenswürdigen TLS-Reverse-Proxy erfolgen. Die `.htaccess` übernimmt diese Aufgabe nur auf Apache/World4you. Das separate World4you-Uploadpaket enthält ausschließlich öffentliche Dateien und führt den Node-Versand nicht aus.
