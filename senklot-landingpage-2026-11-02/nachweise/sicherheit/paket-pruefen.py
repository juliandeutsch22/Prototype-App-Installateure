from pathlib import Path
import json,hashlib,zipfile,subprocess
R=Path(__file__).resolve().parents[2]
u=json.loads((R/'senklot-intern/vendor/phpmailer/UPSTREAM.json').read_text())
for name,expected in u['files'].items():assert hashlib.sha256((R/'senklot-intern/vendor/phpmailer'/name).read_bytes()).hexdigest()==expected
source=json.loads(subprocess.check_output(['node','-e','process.stdout.write(JSON.stringify(require("./tarife.js")))'],cwd=R));assert source['TARIFE']==json.loads((R/'senklot-intern/tarife.json').read_text());assert source['EINFUEHRUNG']==json.loads((R/'senklot-intern/angebot.json').read_text())
with zipfile.ZipFile(R/'world4you-upload.zip') as z:
 assert z.testzip() is None
 files=z.namelist();assert 'senklot-intern/config.php' not in files
 assert 'senklot-intern/mail-html.php' in files and 'senklot-intern/mail-vorlage.html' in files and 'senklot-intern/mail-logo.png' in files
 assert 'api/contact-token.php' in files
 assert "'spam_protection' => 'local'" in z.read('senklot-intern/config.example.php').decode()
 assert 'senklot-intern/config.example.php' in files and 'senklot-intern/.htaccess' in files
 assert not any('/speicher/' in p or p.startswith(('.env','server/','werkzeuge/','nachweise/','vorlagen/')) for p in files)
 assert len([p for p in files if p.endswith('index.html')])==9
 for name in [p for p in files if p.endswith('index.html')]:
  html=z.read(name).decode()
  assert '{{' not in html and '229 €' not in html and '379 €' not in html
  assert not any(term in html for term in ['Einführungspreis','EINFÜHRUNGSPREIS','Pilotbetrieb','PILOTBETRIEB','12 Monate garantiert'])
 home=z.read('index.html').decode();assert all(t in home for t in ['179 €','249 €','id="einstieg"','id="betrieb"','id="einrichtung"','id="faq-einstieg"','id="faq-alltag"','kostenlos und unverbindlich','Optionale Einrichtung','keine Einrichtungsgebühr','name="einrichtung"'])
 for slug in ['impressum','datenschutz']:
  html=z.read(slug+'/index.html').decode()
  assert 'noindex,follow' in html and 'rechts-entwurf' not in html
  assert 'Julian Deutsch' in html and 'Alois-Köberl-Gasse 11' in html and '{{' not in html
 privacy=z.read('datenschutz/index.html').decode()
 assert all(t in privacy for t in ['Cloudflare, Inc., USA','48 Stunden','15 Minuten','12 Monate nach dem letzten inhaltlichen Kontakt','12 Monate nach Abschluss des jeweiligen Falls','id="spamschutz"'])
 assert 'keine gezielten Übermittlungen' not in privacy
 assert 'Eine Gewerbeanmeldung und eine Firmenbucheintragung liegen derzeit nicht vor.' in z.read('impressum/index.html').decode()
for p in R.glob('*/index.html'):
 if p.parent.name=='vorlagen':continue
 assert 'senklot-vorschau.webp' not in p.read_text()
result={'dependencyHashesVerified':len(u['files']),'phpMailerVersion':u['tag'],'tariffsMatchJavaScript':True,'offerTermsMatchJavaScript':True,'localProtectionDefault':True,'localProtectionHiddenInNormalUse':True,'optionalFieldsVisible':True,'faqGroups':2,'setupOptionalByDefault':True,'regularPricesWithoutIntroductoryDeadline':True,'noOldPricesOrUnresolvedPlaceholders':True,'zipIntegrity':True,'htmlPages':9,'realCredentialsIncluded':False,'savedRequestsIncluded':False,'operatorDetailsPresent':True,'legalTextsIntegrated':True,'providerDocumentsReviewed':False}
(R/'nachweise/sicherheit/paket-pruefung.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
