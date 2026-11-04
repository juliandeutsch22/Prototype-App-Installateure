# World4you: Sicherheit und Kontaktformular veröffentlichen

Stand 4. November 2026. **Diese Revision ist vorbereitet und lokal getestet; sie wurde aus dieser Sitzung nicht auf World4you hochgeladen.** Weder Hosting- noch Postfach- noch Cloudflare-Zugang sind hier eingerichtet. Die Anwendung unter app.senklot.at wurde nicht verändert.

## Was bereits enthalten ist

- Keine Analyse- oder Werbeskripte, kein allgemeines Cookiebanner und kein eigener Browser-Speicher. Schriftarten und Bilder bleiben lokal.
- Standardmäßig arbeitet der Formularschutz lokal mit Honeypot, Mindestzeit, signierten Einmal-Tokens und Anfragebegrenzung. Cloudflare ist dafür nicht erforderlich. Falls später Turnstile gewählt wird, lädt der Dienst erst nach ausdrücklichem Klick mit Datenhinweis. Die Einwilligung wird nicht gespeichert. Deaktivieren lädt die Seite neu; E-Mail und Telefon bleiben Alternativen. Vor der Freigabe muss die rechtliche Bewertung der konkreten Konfiguration erfolgen.
- Sicherheitsheader (CSP, Schutz vor Einbettung, nosniff, Referrer-/Permissions-Policy und HSTS über HTTPS nur für diese Domain), HTTPS-/www-Weiterleitung und gesperrte interne Verzeichnisse.
- PHP-8.2+-Kontaktbackend für World4you mit verschlüsseltem, zertifikatsgeprüftem SMTP. Kein Node-Server, Composer oder Resend-Konto auf dem Hosting erforderlich.
- Servervalidierung, feste Empfängeradresse office@senklot.at, lokaler Tokenprüfung (höchstens 30 Minuten gültig, zwei Sekunden Mindestzeit) bzw. optionaler Turnstile-Prüfung einschließlich Host/Aktion, Honeypot, Größenbegrenzung, Dateisperren für parallele PHP-Prozesse, Rate-Limit (8 Versuche pro 15 Minuten/IP-Hash) und Schutz vor wiederholtem Versand derselben Anfrage-ID (48 Stunden).
- Fehlende Konfiguration oder nicht bestätigter Versand werden nicht als Erfolg angezeigt. Eingaben bleiben bei Fehlern erhalten. Bei unklarer Zustellung wird derselbe Vorgang nicht automatisch erneut verschickt. Der Schutz bezieht sich auf dieselbe Anfrage-ID; nach Neuladen oder bei geänderten Angaben entsteht ein neuer Vorgang.
- Eigene Impressums- und Datenschutzseiten im bestehenden Design mit den von Julian Deutsch bereitgestellten Betreiberangaben und Texten. Cloudflare und der technische Missbrauchs-/Mehrfachversandschutz sind ergänzt. Die Seiten stehen nicht in der Sitemap und sind noindex. Die Einbindung ist keine unabhängige rechtliche Prüfung.

## Neu in dieser Revision: Preise und Einstieg

Einführungspreise für Pilotbetriebe: **129 / 180 / 249 € netto monatlich** für bis 5 / 6–15 / 16–30 Nutzer. Bei jährlicher Vorauszahlung und unverändert 10 % Rabatt: **1.393,20 / 1.933,20 / 2.689,20 € netto pro Jahr** (effektiv 116,10 / 161,10 / 224,10 € monatlich). Die begleitete Einrichtung ist optional: 290 / 590 / 699 € netto ausschließlich bei Buchung; keine Einrichtungsgebühr bei eigenständigem Start. Die Einführungspreise sind ab Vertragsbeginn für 12 Monate garantiert. Die Konditionen einer Weiterführung werden vor Vertragsabschluss im Angebot festgehalten. Die Preisbindung legt keine Mindestvertragslaufzeit fest. Keine nicht vereinbarten Folgepreise oder automatischen Erhöhungen.

**Vor den ersten Angeboten festlegen:** konkreter Umfang der optional buchbaren Grundkonfiguration/Einführung je Paket, regulärer Support und Servicezeiten, Abgrenzung zusätzlicher Schulungen, Datenübernahmen und Anpassungen. Die persönliche kostenlose Demo ist mit etwa 30 Minuten angesetzt; Termine werden individuell abgestimmt. Die Website verspricht weder eine pauschale Datenmigration noch einen festen Sofort-Starttermin.

**Vor Produktivstart prüfen:** Sicherungsrhythmus, Aufbewahrung und Wiederherstellungsablauf verbindlich festhalten und einen Wiederherstellungstest durchführen. Dafür sind die tatsächlichen App-Dienste und deren Konfiguration erforderlich; der World4you-Website-Upload richtet keine App-Backups ein. Die optionale Einrichtung wird im Formular nur nach ausdrücklicher Checkbox-Auswahl angefragt; Preise und E-Mail unterscheiden beide Fälle. Nach den ersten Monaten Einrichtungszeit, Supportzeit und laufende Kosten je Betrieb auswerten, bevor Preise für weitere Kunden dauerhaft festgelegt werden.

Echte Referenzen oder gemessene Einsparungen erst nach einem tatsächlichen Pilotbetrieb und dessen Zustimmung ergänzen. Die gelieferten Analysebewertungen und Conversion-Szenarien sind keine gemessenen Kundenergebnisse und werden nicht auf der Website veröffentlicht.

## 1. Rechtstexte und betriebliche Vorgaben abgleichen

Die am 3. November 2026 bereitgestellten Texte sind eingebunden: Julian Deutsch, Alois-Köberl-Gasse 11, 8200 Gleisdorf, Österreich. Der angegebene Unternehmensstatus „Gründung in Vorbereitung, keine Gewerbeanmeldung und keine Firmenbucheintragung“ ist übernommen. Es wurden keine UID, Gewerbeberechtigung oder Registerangaben erfunden.

Die Datenschutzerklärung übernimmt die Fristen von zwölf Monaten für unverbindliche Kontaktanfragen nach dem letzten inhaltlichen Kontakt bzw. für gewöhnliche Supportkorrespondenz nach Fallabschluss. Ergänzt wurden die tatsächlich vorbereiteten Funktionen: ausdrückliche Cloudflare-Aktivierung samt möglicher Verarbeitung in den USA, Abrechnungswahl, 15-Minuten-IP-Hash und 48-Stunden-Anfrage-ID/Status/Hash. Die bisherige pauschale Aussage, es seien keine gezielten Drittlandübermittlungen vorgesehen, wurde entsprechend korrigiert.

**Vor Freischaltung weiterhin erforderlich:** tatsächliche World4you-Vertragsgesellschaft, Serverstandorte, Serverlog-Löschfristen und Auftragsverarbeitung prüfen; nur bei späterer Turnstile-Nutzung zusätzlich die Cloudflare-Konfiguration, Dienstbedingungen, Auftragsverarbeitung und anwendbaren Garantien für Drittlandübermittlungen prüfen. Für den lokalen Formularschutz ist kein Cloudflare-Konto erforderlich. Die öffentlichen Texte mit diesen tatsächlichen Anbieterangaben abgleichen und gegebenenfalls fachkundig präzisieren. Nicht geprüfte Verträge oder Datenstandorte werden hier nicht als bestätigt dargestellt. `anbieterunterlagenGeprueft` steht deshalb weiterhin auf `false`; diese Dokumentationsangabe aktiviert keinen Versand.

**Die 12-Monats-Fristen im Postfach umsetzen:** Geeigneten regelmäßigen Lösch-/Prüfprozess für unverbindliche Anfragen und erledigte Supportfälle einrichten. Die Website löscht keine Nachrichten aus dem World4you-Postfach. Gesetzliche Aufbewahrungspflichten und konkrete Gründe für eine längere Speicherung jeweils beachten; auch Sicherungskopien berücksichtigen. Die kurzen technischen Formularfristen betreffen nur den separaten pseudonymen Anwendungsspeicher.

Die öffentlichen Betreiberangaben stehen in `werkzeuge/rechtliches.json`, die Texte in `vorlagen/impressum.html` und `vorlagen/datenschutz.html`. Änderungen anschließend neu erzeugen:

```
python3 werkzeuge/recht-erstellen.py
python3 werkzeuge/world4you-paket.py
```

Benötigt lokal Python mit Pillow und Node. Das erzeugte Upload-ZIP enthält die aktualisierten Seiten. Der frühere Hinweis auf fehlende Namen/Anschrift wurde entfernt; eine unabhängige rechtliche Prüfung oder die Betriebsbereitschaft der Dienste wird damit nicht bestätigt.

**Getrennte Anwendung:** Die App-Datei `src/features/recht/betreiber.ts` enthält weiterhin ihre bisherigen Platzhalter und `GEPRUEFT=false`. Diese Website-Revision verändert weder App-Rechtstexte noch App-Datenschutzerklärung. Die Website-Erklärung gilt ausdrücklich nur für senklot.at.

## 2. Dateien bei World4you hochladen

1. Aktuellen Webspace einschließlich versteckter Dateien sichern. **Beim Update die funktionierende `senklot-intern/config.php` und den Ordner `senklot-intern/speicher/` erhalten.** Beide sind absichtlich nicht im Upload-ZIP enthalten. Die Beispielkonfiguration nicht erneut über die aktive Konfiguration kopieren.
2. PHP **8.2 oder neuer** aktivieren; die PHP-Erweiterungen **openssl und ctype** (zusätzlich **curl**, falls später Turnstile verwendet wird) müssen verfügbar sein.
3. Nur `world4you-upload.zip` entpacken und dessen Inhalt in das Web-Hauptverzeichnis von senklot.at laden. `index.html`, `.htaccess`, `api/`, `senklot-intern/`, `assets/` und die Seitenverzeichnisse liegen unmittelbar dort. Versteckte `.htaccess` und `api/.user.ini` unbedingt mit übertragen. Nicht den gesamten Entwickler-ZIP auf den öffentlichen Webspace laden.
4. Bestehende Hosting-Regeln vor dem Ersetzen mit der mitgelieferten `.htaccess` abgleichen. Erforderlich sind Apache-2.4-Regeln mit `mod_rewrite`, `mod_headers`, `AllowOverride` und `Options -Indexes`. Bei HTTP 500 den Hosting-Fehlerbericht prüfen bzw. World4you um die entsprechende Konfiguration bitten; nicht einfach den Zugriffsschutz entfernen.
5. Gültige HTTPS-Zertifikate für senklot.at und www.senklot.at sicherstellen. Die App-Subdomain wird nicht umgeleitet. HSTS enthält absichtlich weder includeSubDomains noch preload.

Das Upload-ZIP enthält geschützten Backend-Code und eine leere Beispielkonfiguration, **keine echten Zugangsdaten und keine gespeicherten Anfragen**. Bei späteren Updates ist eine bestehende `senklot-intern/config.php` nicht im ZIP und muss erhalten bleiben.

## 3. World4you-Postfach verbinden

Im World4you-Portal die **SMTP-Verbindungsdaten des tatsächlichen Postfachs** ansehen. Der Beispielhost `smtp.world4you.com` ist nur eine Vorgabe und muss mit dem Portal abgeglichen werden.

Auf dem Webspace `senklot-intern/config.example.php` zu `senklot-intern/config.php` kopieren und dort ergänzen:

- `smtp.host`: SMTP-Server aus dem Portal.
- `smtp.port` / `smtp.security`: **587 / tls** für STARTTLS oder **465 / ssl**, genau nach Anbieterangabe. Unverschlüsselter Versand ist nicht vorgesehen.
- `smtp.username`: vollständiger Postfach-Benutzername laut Portal, normalerweise office@senklot.at.
- `smtp.password`: Passwort dieses Postfachs, nicht automatisch das Kundenportal-Passwort.
- `smtp.from`: zulässiger Absender dieses Postfachs, vorgesehen office@senklot.at.

Empfänger bleibt im Backend fest office@senklot.at. Die Besucheradresse wird ausschließlich Reply-To. Passwörter niemals in Chat, E-Mail, Git oder öffentliche JavaScript-Dateien kopieren. Die PHP-Konfiguration nur über einen verschlüsselten, authentifizierten Hostingzugang bearbeiten. Berechtigungen möglichst eng setzen, beispielsweise 600 oder 640, soweit der PHP-Prozess die Datei lesen kann. `data_dir` muss nur für PHP beschreibbar sein; **kein chmod 777**. Standardmäßig legt PHP dort den Ordner `speicher` selbst an.

SPF/DKIM im World4you-Portal für den tatsächlichen Versand aktivieren/prüfen. Bestehende MX-/SPF-Einträge nicht blind ersetzen und keinen zweiten SPF-Eintrag erstellen. DMARC mit zunächst beobachtender Richtlinie kann danach anhand der vorhandenen Domainkonfiguration eingerichtet werden. Die dafür richtigen DNS-Werte müssen aus deinem Konto kommen.

## 4. Ohne Cloudflare freischalten; Turnstile bleibt optional

Die neue Beispielkonfiguration enthält **`'spam_protection' => 'local'`**. In diesem Modus bleiben `turnstile.site_key` und `turnstile.secret_key` leer. Es ist kein Cloudflare-Konto nötig und es werden keine Cloudflare-Skripte geladen. Der Server erzeugt die kurz gültigen Tokens selbst; dafür muss der konfigurierte `data_dir` durch PHP beschreibbar sein. Der private Schlüssel wird dort automatisch angelegt. Bei Updates **config.php und speicher erhalten**; die Dateien nicht zum Umgehen einer Fehlermeldung löschen.

Bestehende Konfigurationen ohne `spam_protection` bleiben kompatibel: Sind beide Turnstile-Schlüssel leer, wird der lokale Schutz verwendet. Bereits eingetragene oder teilweise eingetragene Schlüssel werden als bisherige Turnstile-Konfiguration behandelt; eine unvollständige Konfiguration wird nicht stillschweigend herabgestuft. Zum bewussten Wechsel auf lokal `spam_protection` ausdrücklich auf `local` setzen.

Erst wenn SMTP, Betreiberangaben, World4you-Anbieterunterlagen und Datenschutzhinweise abgeglichen sind, **`legal_ready => true` und `enabled => true`** setzen. Dann lässt sich das Formular nach einer kurzen Vorbereitung ohne externes CAPTCHA absenden. Tokens laufen nach höchstens 30 Minuten ab und werden erneuert; Eingaben bleiben erhalten. Ein zu altes, zu schnell verwendetes oder bereits verbrauchtes Token berechtigt nicht zu einer neuen Zustellung. Der Wiederholungsschutz derselben Anfrage-ID bleibt separat bestehen.

Der lokale Schutz begrenzt gewöhnliche automatisierte Anfragen, ersetzt aber keine spezialisierte Bot-Erkennung. Bei erhöhtem Spamaufkommen kann später auf Turnstile umgestellt werden: im Cloudflare-Konto ein Managed-Widget für senklot.at und gegebenenfalls www.senklot.at erstellen, Pre-clearance ausgeschaltet lassen, beide echten Schlüssel eintragen und `spam_protection => 'turnstile'` wählen. Dafür ist kein DNS-Umzug erforderlich. Vor dieser Umstellung Anbieterunterlagen und Datenschutzhinweise zur externen Verarbeitung erneut abgleichen. Bei Turnstile-Ausfällen erfolgt kein automatischer Wechsel auf lokalen Schutz.

## 5. Nach dem Upload tatsächlich prüfen

- `https://senklot.at/api/contact-config` liefert bei vollständiger Einrichtung `{mode:"live",ready:true,sitekey:null,protection:"local"}`. Im später optionalen Turnstile-Modus darf nur der öffentliche Widgetschlüssel ausgegeben werden, niemals der geheime Schlüssel. Vor Freigabe ist `unavailable` korrekt.
- `https://senklot.at/senklot-intern/config.php`, `/senklot-intern/config.example.php`, `/senklot-intern/vendor/phpmailer/src/SMTP.php` und `/senklot-intern/speicher/zustand.json` müssen **403** liefern. Falls davon etwas lesbar ist, Formular nicht aktivieren und Hosting-Zugriffsschutz korrigieren.
- Im lokalen Modus darf die Browser-Netzwerkansicht keine Cloudflare-Aufrufe zeigen. Nach kurzer Vorbereitung ist „Anfrage senden“ verfügbar. `/api/contact-token` wird von der Website per POST aufgerufen; ein direkter GET-Aufruf im Browser liefert absichtlich 405. Falls später Turnstile genutzt wird, zusätzlich dessen Aktivierung und Widerruf prüfen.
- Eine eigene Testanfrage absenden: tatsächlichen Eingang im Postfach **und Spamordner** prüfen, auf die Anfrage antworten und Reply-To kontrollieren. Erst der Postfacheingang bestätigt die reale Zustellung; eine SMTP-Annahme allein garantiert das nicht.
- Formular auf Mobilgerät und Desktop prüfen, einschließlich Fehlerfall/abgelaufener Prüfung. Keine echten Anfragen zum Testen mehrfach absenden.
- Mit `curl -I https://senklot.at/` Header prüfen: Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Permissions-Policy, Referrer-Policy und Strict-Transport-Security. HTTPS-/www-Weiterleitung und alle sieben Marketingseiten prüfen. `/impressum/` und `/datenschutz/` müssen die bereitgestellten Betreiberangaben korrekt anzeigen und dürfen keine Platzhalter enthalten.
- Hosting-/Postfach-Backups und Aufbewahrung nach tatsächlichem Vertrag prüfen, Zugänge mit 2FA schützen und Passwort-/Schlüsselwechsel sowie Updates des Versandbausteins einplanen. PHPMailer 7.1.1 ist mit konkretem Quellcommit und SHA256 in `senklot-intern/vendor/phpmailer/UPSTREAM.json` dokumentiert.

## Grenzen dieser Prüfung

Lokale Apache-/PHP-, Browser- und TLS-SMTP-Tests prüfen Implementierung und Fehlerfälle. Es wurden **keine echten E-Mails verschickt**, kein Cloudflare-Konto angelegt und keine World4you-Konfiguration geändert. Cloudflare ist für den lokalen Standardmodus nicht nötig. Die Prüfung ist keine vollständige Penetrationsprüfung oder verbindliche rechtliche Freigabe. Ein pauschales Sicherheitsversprechen oder eine garantierte Zustellung wird nicht gegeben.

## Bestehende SEO-Einrichtung

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


Die sieben Marketingseiten bleiben indexierbar; die beiden Rechtstexte sind noindex. Sitemap und Suchkonten müssen nach Upload weiterhin im eigenen Konto geprüft werden.


## Update: Formular, FAQ und gestaltete Anfrage-Mail

Auch `senklot-intern/mail-html.php`, `senklot-intern/mail-vorlage.html` und `senklot-intern/mail-logo.png` mit übertragen. Diese Dateien liegen im geschützten Verzeichnis; das Logo wird in die E-Mail eingebettet und benötigt keinen externen Abruf. Die Klartextversion bleibt enthalten. Eine fehlende Gestaltungsvorlage führt zum bisherigen Klartextversand. Bestehende SMTP-Daten und Freigaben nicht ändern.

Nach dem Upload einmal mit einer eigenen Testanfrage kontrollieren: optionale Felder direkt sichtbar, kein lokaler Schutz-Hinweisblock im Normalbetrieb, FAQ in zwei Gruppen und eingegangene Mail mit Logo, vollständigen Angaben sowie funktionierender Antwortadresse. Die sichtbare Gestaltung hängt auch vom Mailprogramm und dessen Einstellungen ab.
