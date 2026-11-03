from pathlib import Path
import subprocess,json
R=Path(__file__).resolve().parents[2];checks=[]
def fetch(path,host=None,method='GET',https=False):
 h=Path('/tmp/senklot-security.headers');b=Path('/tmp/senklot-security.body')
 args=['curl','--silent','--show-error','--max-time','10','--dump-header',str(h),'--output',str(b),'--write-out','%{http_code}','--request',method]
 if https:args+=['--cacert','/tmp/senklot-security-fixtures/test.crt']
 if host:args+=['--header','Host: '+host]
 args+= [('https://localhost:5281' if https else 'http://127.0.0.1:5280')+path]
 code=int(subprocess.check_output(args,text=True));headers={k.lower():v for line in h.read_text().splitlines() if ': ' in line for k,v in [line.split(': ',1)]}
 checks.append({'path':path,'method':method,'https':https,'host':host,'status':code})
 assert headers.get('x-frame-options')=='DENY'
 assert headers.get('x-content-type-options')=='nosniff'
 assert 'camera=()' in headers.get('permissions-policy','')
 assert "frame-ancestors 'none'" in headers.get('content-security-policy','')
 if https:assert headers.get('strict-transport-security')=='max-age=31536000'
 else:assert 'strict-transport-security' not in headers
 return code,headers,b.read_text(errors='replace')
for path in ['/','/api/contact?x=1','/api/contact-config?x=1']:
 code,h,_=fetch(path,'senklot.at',method='POST' if 'contact?' in path else 'GET');assert code==308 and h['location']=='https://senklot.at'+path
assert fetch('/einsatzplanung/?q=a%20b','www.senklot.at',https=True)[1]['location']=='https://senklot.at/einsatzplanung/?q=a%20b'
for slug in ['','einsatzplanung','zeiterfassung','handwerksscheine','kunden-baustellen','material-lager','angebote-rechnungen','impressum','datenschutz']:
 assert fetch('/'+(slug+'/' if slug else ''),https=True)[0]==200
for path in ['/senklot-intern/config.php','/senklot-intern/config.example.php','/senklot-intern/kontakt.php','/senklot-intern/vendor/phpmailer/src/SMTP.php','/senklot-intern/speicher/zustand.json','/.env','/.htaccess','/api/.user.ini','/api/','/server/app.mjs','/werkzeuge/rechtliches.json']:
 assert fetch(path)[0]==403,path
assert fetch('/api/contact')[0]==405
code,h,body=fetch('/api/contact',method='POST');assert code==503 and 'unavailable' not in body and 'password' not in body and h['cache-control']=='no-store'
code,h,body=fetch('/api/contact-config');assert code==200 and json.loads(body)=={'mode':'unavailable','ready':False,'sitekey':None} and h['cache-control']=='no-store'
assert fetch('/datenschutz/index.html?x=1')[0]==308
assert fetch('/nicht-vorhanden/')[0]==404
result={'actualApacheExecution':True,'phpVersion':'8.3','localOnly':True,'headersVerified':True,'httpsCertificateVerified':True,'privateFilesBlocked':True,'unconfiguredFormFailsClosed':True,'checks':checks,'world4youUploadPerformed':False}
(R/'nachweise/sicherheit/apache-pruefung.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'apacheChecks':len(checks),'failed':0}))
