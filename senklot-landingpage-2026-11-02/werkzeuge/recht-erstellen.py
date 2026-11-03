"""Erzeugt separate Website-Rechtstexte. Ohne Betreiberangaben bleiben es sichtbare Entwürfe."""
from pathlib import Path
from html import escape as e
import json, re, runpy
R = Path(__file__).resolve().parent.parent
s = runpy.run_path(str(R/'werkzeuge/seo-erstellen.py'))
c = json.loads((R/'werkzeuge/rechtliches.json').read_text())
ready = c['freigegeben'] is True and bool(c['name'].strip()) and bool(c['anschrift'].strip()) and bool(c['hostingDetails'].strip()) and bool(c['turnstileDetails'].strip())
draft = '' if ready else '<aside class="rechts-entwurf"><strong>Entwurf – Betreiberangaben und rechtliche Prüfung fehlen.</strong><p>Diese Texte müssen vor der Veröffentlichung vervollständigt und auf die tatsächlich eingesetzten Dienste abgestimmt werden.</p></aside>'
identity = '<p>'+e(c['name'] or '[Rechtlich vollständigen Namen / Firma ergänzen]')+'<br>'+e(c['anschrift'] or '[Vollständige ladungsfähige Anschrift ergänzen]').replace('\n','<br>')+'</p>'
contact = '<p>E-Mail: <a href="mailto:office@senklot.at">office@senklot.at</a><br>Telefon: <a href="tel:+436606322503">+43 660 6322503</a></p>'
optional = ''.join('<h2>'+label+'</h2><p>'+e(c[k]).replace('\n','<br>')+'</p>' for k,label in [('uid','Umsatzsteuer-ID'),('firmenbuch','Firmenbuch'),('gewerbe','Gewerbe und berufsrechtliche Angaben'),('aufsicht','Zuständige Aufsicht'),('weitereAngaben','Weitere gesetzliche Angaben')] if c[k])
if not ready:
    optional += '<p>Abhängig von der Rechtsform und Tätigkeit ergänzen: UID, Firmenbuchnummer und Firmenbuchgericht, Gewerbe, Kammerzugehörigkeit, zuständige Aufsicht und anwendbare Berufsregeln. Auch gegebenenfalls erforderliche Offenlegungsangaben sind zu prüfen.</p>'
privacy = '''
<h2>Verantwortlicher und Kontakt</h2>IDENTITY CONTACT
<p>Diese Hinweise betreffen die öffentliche Website senklot.at. Für die getrennte Anwendung unter app.senklot.at gelten deren eigene <a href="https://app.senklot.at/datenschutz">Datenschutzhinweise</a>.</p>
<h2>Hosting und technische Bereitstellung</h2>
<p>Die Website und das E-Mail-Postfach werden bei World4you betrieben. Bei einem Seitenaufruf verarbeitet der Hostinganbieter technisch notwendige Verbindungsdaten, insbesondere IP-Adresse, Zeitpunkt, angeforderte Adresse, Status und Browserinformationen. Das dient der Auslieferung, Stabilität und Sicherheit der Website. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren Websitebetrieb (Art. 6 Abs. 1 lit. f DSGVO).</p>
<p>Die konkrete Gesellschaft, Serverstandorte, Protokollierung und Löschfristen des gebuchten World4you-Vertrags sind vor Veröffentlichung zu ergänzen bzw. anhand der Anbieterunterlagen zu bestätigen. Der erforderliche Vertrag zur Auftragsverarbeitung ist abzuschließen.</p>
<h2>Cookies, Schriftarten und Reichweitenmessung</h2>
<p>Der eigene Website-Code setzt keine Analyse- oder Werbecookies und speichert keine Angaben in Local Storage oder Session Storage. Es werden keine Analyse- oder Werbedienste eingebunden. Schriftarten und Produktbilder werden vom eigenen Webspace geladen. Die optionale externe Sicherheitsprüfung ist im folgenden Abschnitt gesondert beschrieben.</p>
<h2 id="spamschutz">Optionale externe Sicherheitsprüfung</h2>
<p>Für das Kontaktformular ist Cloudflare Turnstile vorgesehen. Der Dienst wird erst geladen, wenn du im Formular ausdrücklich auf „Cloudflare-Spamschutz aktivieren“ klickst. Ohne diesen Klick wird durch die Website keine Verbindung zu Cloudflare hergestellt. Alternativ erreichst du uns ohne diese Prüfung per E-Mail oder Telefon.</p>
<p>Mit deiner Aktivierung willigst du in die beschriebene Sicherheitsprüfung ein (Art. 6 Abs. 1 lit. a DSGVO). Dabei werden IP-Adresse sowie technische Browser-, Geräte- und Interaktionsdaten an Cloudflare, Inc., USA, übermittelt und zur Erkennung automatisierter Anfragen verarbeitet. Eine Verarbeitung in den USA ist möglich. Cloudflare beschreibt den Dienst unter <a href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer">Cloudflare Datenschutz</a>.</p>
<p>Vor der Freigabe sind die konkrete Turnstile-Konfiguration, Dienstbedingungen, Auftragsverarbeitung sowie anwendbare Garantien für internationale Datenübermittlungen und gegebenenfalls weitere Einwilligungsanforderungen zu prüfen. Die Funktion „Pre-clearance“ ist für diesen Entwurf nicht vorgesehen und muss deaktiviert bleiben.</p>
<p>Deine Aktivierung wird von der Website nicht gespeichert. Über „Spamschutz deaktivieren und Seite neu laden“ wird die Seite neu geladen und der Dienst anschließend nicht erneut eingebunden. Du kannst dadurch die Einwilligung für zukünftige Verarbeitungen widerrufen; bereits erfolgte Verarbeitungen bleiben davon unberührt.</p>
<h2>Kontaktanfragen</h2>
<p>Wenn du das Formular absendest, verarbeiten wir Name, Betrieb, E-Mail, gegebenenfalls Telefonnummer, Nutzerzahl, Tarifwunsch, Abrechnungswahl und deine Nachricht zur Bearbeitung der Anfrage. Die Anfrage wird per verschlüsseltem SMTP über das World4you-Postfach an office@senklot.at versendet. Es erfolgt keine automatische Aufnahme in einen Newsletter.</p>
<p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO bei vorvertraglichen Anfragen bzw. Art. 6 Abs. 1 lit. f DSGVO bei sonstiger geschäftlicher Kommunikation. Bitte sende keine sensiblen Daten oder Passwörter. Eine Formularanfrage schließt keinen Vertrag ab.</p>
<p>Wir bewahren die E-Mail-Korrespondenz so lange auf, wie es zur Bearbeitung und gegebenenfalls zur Wahrung oder Abwehr von Ansprüchen notwendig ist. Soweit gesetzliche Aufbewahrungspflichten tatsächlich bestehen, gelten diese. Für rein unverbindliche Anfragen entsteht nicht pauschal eine mehrjährige Aufbewahrungspflicht.</p>
<h2>Missbrauchsschutz und doppelte Übermittlung</h2>
<p>Der Server speichert für die Begrenzung von Anfragen einen geheimnisgestützten Hashwert der IP-Adresse für 15 Minuten. Zur Vermeidung doppelter E-Mails werden Anfrage-ID, Status und ein Hashwert der Formulardaten für 48 Stunden vorgehalten. Nachrichteninhalte und Klartext-IP-Adressen werden in diesem Anwendungsspeicher nicht abgelegt. Abgelaufene Einträge werden beim nächsten Zugriff auf diesen Speicher bereinigt. Diese pseudonymen Daten dienen dem sicheren Betrieb und der Vermeidung mehrfacher Zustellungen (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>Deine Rechte</h2>
<p>Nach Maßgabe der DSGVO hast du Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung. Wende dich dafür an office@senklot.at. Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren, in Österreich bei der <a href="https://www.dsb.gv.at/" rel="noreferrer">Österreichischen Datenschutzbehörde</a>.</p>
<p>Stand: 3. November 2026. Diese Texte müssen bei Änderungen der Verarbeitung aktualisiert werden.</p>
'''.replace('IDENTITY',identity).replace('CONTACT',contact)
if c['hostingDetails']:
    privacy=privacy.replace('Die konkrete Gesellschaft, Serverstandorte, Protokollierung und Löschfristen des gebuchten World4you-Vertrags sind vor Veröffentlichung zu ergänzen bzw. anhand der Anbieterunterlagen zu bestätigen. Der erforderliche Vertrag zur Auftragsverarbeitung ist abzuschließen.',e(c['hostingDetails']))
if c['turnstileDetails']:
    privacy=privacy.replace('Vor der Freigabe sind die konkrete Turnstile-Konfiguration, Dienstbedingungen, Auftragsverarbeitung sowie anwendbare Garantien für internationale Datenübermittlungen und gegebenenfalls weitere Einwilligungsanforderungen zu prüfen. Die Funktion „Pre-clearance“ ist für diesen Entwurf nicht vorgesehen und muss deaktiviert bleiben.',e(c['turnstileDetails']))
for slug,title,body in [('impressum','Impressum','<h2>Angaben zum Websitebetreiber</h2>'+identity+contact+optional),('datenschutz','Datenschutzhinweise',privacy)]:
    head=s['head'](title+' | Senklot',title+' der Senklot-Website.',prefix='../')
    head=re.sub(r'<script type="application/ld\+json">.*?</script>','',head,flags=re.S)
    head=head.replace('href="https://senklot.at/"','href="https://senklot.at/'+slug+'/"').replace('content="https://senklot.at/"','content="https://senklot.at/'+slug+'/"')
    # Rechtsseiten bleiben außerhalb des Marketing-Suchindex; Links sind weiterhin crawlbar.
    head=head.replace('index,follow,max-image-preview:large','noindex,follow')
    html=f'<!doctype html>\n<html lang="de-AT">{head}<body class="funktionsseite"><a class="skip" href="#inhalt">Zum Inhalt</a>{s["header"]}<main id="inhalt" class="wrap rechtstext"><p class="rubrik">SENKLOT / RECHTLICHES</p><h1>{title}</h1>{draft}{body}</main>{s["footer"]}</body></html>\n'
    (R/slug).mkdir(exist_ok=True);(R/slug/'index.html').write_text(html)
(R/'senklot-intern/tarife.json').write_text(json.dumps(s['tarife'],ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'legalPages':2,'operatorComplete':ready}))
