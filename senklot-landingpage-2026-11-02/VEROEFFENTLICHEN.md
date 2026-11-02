# World4you: SEO und neue Seiten veröffentlichen

Dieses Update ergänzt die bestehende Landingpage, sechs Funktionsseiten und dezente Animationen. Der aktuelle Stand auf senklot.at wurde vor der Bearbeitung nur gelesen. Aus dieser Sitzung ist kein World4you-, Google-Search-Console- oder Bing-Kontozugriff eingerichtet. Deshalb wurde dieses Update **noch nicht auf die Produktdomain hochgeladen** und die Indexierung **noch nicht in den Konten beantragt**.

## 1. Website-Dateien hochladen

1. Aktuelle Website-Dateien und eine vorhandene `.htaccess` bei World4you sichern.
2. `world4you-upload.zip` lokal entpacken. Den **Inhalt** in das Web-Hauptverzeichnis von `senklot.at` hochladen, sodass `index.html`, `robots.txt`, `sitemap.xml`, `.htaccess`, die sechs Funktionsordner und `assets` direkt dort liegen. Versteckte Dateien beim Upload berücksichtigen. Keinen zusätzlichen übergeordneten ZIP-Ordner anlegen.
3. Eine bereits vorhandene `.htaccess` vor dem Ersetzen prüfen und anwendungsspezifische Regeln zusammenführen. Die mitgelieferte Datei enthält dauerhafte HTTPS-/www-/index.html-Weiterleitungen für **senklot.at und www.senklot.at**. `app.senklot.at` ist davon ausgenommen. Ein gültiges HTTPS-Zertifikat muss für beide Website-Varianten eingerichtet sein, auch für die weiterleitende www-Adresse.
4. Der Webserver muss `.htaccess`, `mod_rewrite`, `DirectoryIndex` und Apache-2.4-Zugriffsregeln erlauben. Bei abweichender Hostingkonfiguration müssen diese Regeln in der World4you-Konfiguration umgesetzt werden. Die lokale Apache-Prüfung ersetzt den Test auf dem tatsächlichen Hosting nicht.
5. Die unten aufgeführten URLs und die Weiterleitungen testen. Erwartet: HTTP und www führen mit Status 308 dauerhaft auf `https://senklot.at/`. Pfad und Queryparameter bleiben erhalten. `index.html` führt auf das jeweilige Verzeichnis. 308 erhält im Gegensatz zu manchen 301-Abläufen auch POST-Methode und Body.

Nur das Upload-ZIP gehört auf den öffentlichen Webspace. Das vollständige Entwicklerpaket enthält zusätzliche Quellen, Node-Server, Tests und Dokumentation. Es gehört nicht vollständig in ein öffentliches PHP-Webverzeichnis. Niemals `.env`, private Schlüssel oder Postfach-Passwörter hochladen.

## 2. Google Search Console

1. Unter https://search.google.com/search-console/ die Domain-Property `senklot.at` hinzufügen.
2. Den **von Google für dein Konto erzeugten** TXT-Eintrag in der DNS-Verwaltung der Domain bei World4you hinzufügen. Vorhandene Mail-/SPF-/DKIM-/MX-Einträge nicht ersetzen. Den konkreten Verifizierungscode gibt es erst im eigenen Google-Konto; im Paket ist kein erfundener Code enthalten.
3. Nach erfolgreicher Verifizierung `https://senklot.at/sitemap.xml` einreichen.
4. Mit der URL-Prüfung die Startseite und die sechs Funktionsseiten live testen und bei Bedarf die Indexierung beantragen. Anschließend den Indexierungsbericht prüfen. Ein Antrag ist keine Garantie für die Aufnahme oder Platzierung.
5. Später Suchanfragen, Klicks und tatsächlich verfügbare Core-Web-Vitals-Felddaten beobachten. Bei einer neuen Website stehen Felddaten unter Umständen noch nicht zur Verfügung.

## 3. Bing Webmaster Tools

Unter https://www.bing.com/webmasters/ anmelden und die Website nach der Google-Verifizierung aus der Search Console importieren oder eigenständig per DNS verifizieren. Dieselbe Sitemap einreichen und die URL- und Crawlingberichte prüfen. Auch dieser Schritt benötigt dein eigenes Konto.

## 4. KI-Suchen

Die Website liefert wesentliche Informationen direkt als HTML, erläutert tatsächliche Funktionen und Grenzen und besitzt intern verlinkte Funktionsseiten. `robots.txt` erlaubt öffentlichen Suchzugriff, einschließlich `OAI-SearchBot`, und sperrt nur `/api/` für Crawling. Diese Datei ist kein Zugriffsschutz.

Es wurden keine speziellen KI-Skripte, keine erfundenen Bewertungen und keine Rankingversprechen hinzugefügt. `llms.txt` ist keine Voraussetzung für Google-KI-Funktionen. Die Freigabe für Suchcrawler muss zusätzlich durch tatsächliche Hosting-/Firewall-Einstellungen respektiert werden; unbekannte Bots dürfen nicht pauschal mit einem Formular-CAPTCHA blockiert werden. Training und Suchzugriff sind unterschiedliche Steuerungen; eine zusätzliche Trainingsrichtlinie wurde hier nicht eingeführt.

## 5. URLs nach dem Upload prüfen

- https://senklot.at/
- https://senklot.at/einsatzplanung/
- https://senklot.at/zeiterfassung/
- https://senklot.at/handwerksscheine/
- https://senklot.at/kunden-baustellen/
- https://senklot.at/material-lager/
- https://senklot.at/angebote-rechnungen/
- https://senklot.at/robots.txt
- https://senklot.at/sitemap.xml

Die Funktionsseiten besitzen individuelle Titel, Beschreibungen, Canonical-URLs und Brotpfade. Die Startseite beschreibt Anbieter, Software und drei monatliche Netto-Abos als strukturierte Daten. Die Einrichtung wird gesondert erklärt. Es wird keine Eignung für besondere Rich Results behauptet.

## Kontaktformular bleibt eine getrennte Einrichtung

Das SEO-Update aktiviert keinen Versand. Die vorhandene Versandvorbereitung ist weiterhin Node/Resend; für die angekündigte PHP-/World4you-SMTP-Variante muss das konkrete Hostingpaket geklärt und der Versandteil angepasst werden. Auf einem rein statischen/PHP-Webspace bleibt die bestehende Formularoberfläche ohne passende API gesperrt und nennt E-Mail und Telefon als Alternativen. Die Funktionsseiten selbst benötigen weder Node noch PHP.

## Animationen und Wartung

Kurze Erscheinanimationen mit 14 Pixeln Versatz laufen beim ersten Sichtbarwerden, nicht als Endlosschleife. Bei reduzierter Bewegung, fehlender Browserunterstützung oder ausgeschaltetem JavaScript bleiben die Inhalte sichtbar. Tastaturfokus und eine nachträgliche Änderung der Bewegungseinstellung beenden laufende Animationen. Formularfelder, Preiswahl und Dialogzustände werden nicht animiert.

Die Produktbilder wurden ohne Pixelverlust nach WebP umgewandelt. Vorher: 1.571.739 Bytes, danach: 551.878 Bytes für zehn Bilder (rund 65 % weniger). Das ist eine gemessene Dateigrößenersparnis, kein pauschaler Lighthouse- oder Core-Web-Vitals-Wert. Die ursprünglichen PNGs bleiben im Entwicklerpaket erhalten.

Neue Inhalte stehen in `werkzeuge/funktionen.json`. `python werkzeuge/seo-erstellen.py` erzeugt die statischen HTML-Seiten und die Sitemap neu. Benötigt lokal Python mit Pillow und Node; die veröffentlichten Funktionsseiten selbst haben keine Generator-Abhängigkeit. Bei weiteren Änderungen den Asset-Versionswert im Generator erhöhen und die Ausgabe erneut prüfen.

## Fachliche Quellen

- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.openai.com/api/docs/bots
