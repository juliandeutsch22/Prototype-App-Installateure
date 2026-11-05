"""Vollständiger Apache/PHP/TLS-SMTP-Test, ausschließlich lokal und mit künstlichen Daten."""
from pathlib import Path
import subprocess,json,shutil,time,uuid,email
R=Path(__file__).resolve().parents[2]
D=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock']
F=Path('/tmp/senklot-local-http-fixtures');F.mkdir(exist_ok=True);F.chmod(0o755)
for n in ['test.crt','test.key','apache.conf']:shutil.copyfile(Path('/tmp/senklot-security-fixtures')/n,F/n)
(F/'test.crt').chmod(0o644)
(F/'test.key').chmod(0o600)
(F/'local.ini').write_text('openssl.cafile=/fixtures/test.crt\ndisplay_errors=Off\n')
(F/'config.php').write_text("<?php return ['enabled'=>true,'legal_ready'=>true,'spam_protection'=>'local','origins'=>['https://senklot.at'],'data_dir'=>'/tmp/local-api-state','smtp'=>['host'=>'localhost','port'=>465,'security'=>'ssl','username'=>'local-test','password'=>'not-a-real-password','from'=>'office@senklot.at','from_name'=>'Senklot'],'turnstile'=>['site_key'=>'','secret_key'=>'']];\n")
(F/'config.php').chmod(0o644)
shutil.copytree('/tmp/senklot-world4you-upload',F/'web',dirs_exist_ok=True)
shutil.copyfile(F/'config.php',F/'web/senklot-intern/config.php')
(F/'web/senklot-intern/config.php').chmod(0o644)
name='senklot-local-e2e-'+str(__import__('os').getpid());checks=[]
def docker(args):
 try:return subprocess.check_output(D+args,text=True,stderr=subprocess.STDOUT).strip()
 except subprocess.CalledProcessError as e:
  print(e.output);raise
def req(path,method='GET',body=None,origin='https://senklot.at',ctype='application/json'):
 args=['curl','--silent','--show-error','--max-time','20','--cacert',str(F/'test.crt'),'-H','Host: senklot.at','--dump-header',str(F/'response.headers'),'--output',str(F/'response.body'),'--write-out','%{http_code}','-X',method]
 if method=='POST':
  args+=['-H','Content-Type: '+ctype]
  if origin:args+=['-H','Origin: '+origin]
  args+=['--data-binary',body if isinstance(body,str) else json.dumps(body)]
 code=int(subprocess.check_output(args+['https://localhost:5295'+path],text=True));text=(F/'response.body').read_text();data=json.loads(text) if 'application/json' in (F/'response.headers').read_text().lower() else text
 checks.append({'path':path,'method':method,'status':code});return code,data
try:
 docker(['run','-d','--name',name,'-p','127.0.0.1:5294:80','-p','127.0.0.1:5295:443','-v',str(F/'web')+':/var/www/html:ro','-v',str(F)+':/fixtures:ro','-v',str(F/'apache.conf')+':/etc/apache2/conf-enabled/senklot-test.conf:ro','-v',str(F/'local.ini')+':/usr/local/etc/php/conf.d/local-test.ini:ro','-v',str(R/'nachweise/sicherheit/lokal-smtp-mock.php')+':/smtp-mock.php:ro','php:8.3-apache','sh','-c','a2enmod rewrite headers ssl >/dev/null && apache2-foreground'])
 for i in range(40):
  try:
   if req('/api/contact-config')[0]==200:break
  except subprocess.CalledProcessError:pass
  time.sleep(.15)
 else:raise RuntimeError('Apache startet nicht')
 status,c=req('/api/contact-config');assert status==200 and c=={'mode':'live','ready':True,'sitekey':None,'protection':'local'}
 for path in ['/senklot-intern/config.php','/senklot-intern/speicher/zustand.json']:
  assert req(path)[0]==403
 assert req('/api/contact-token')[0]==405
 assert req('/api/contact-token','POST',{},origin='https://evil.example')[0]==403
 assert req('/api/contact-token','POST',{},origin=None)[0]==403
 assert req('/api/contact-token','POST',{},ctype='text/plain')[0]==415
 assert req('/api/contact-token','POST','x'*257)[0]==413
 assert req('/api/contact-token','POST','{')[0]==400
 assert req('/api/contact-token','POST',[])[0]==400
 status,t=req('/api/contact-token','POST',{});assert status==200 and t['minWaitMs']==2100 and t['expiresInMs']==1795000
 data={'name':'Anna Beispiel','firma':'Testbetrieb','email':'anna@example.org','telefon':'','nachricht':'Lokaler Test, keine echte Mail.','tarif':'team','zahlung':'jaehrlich','einrichtung':False,'nutzer':'8','website':'','requestId':str(uuid.uuid4()),'token':t['token'],'spamschutzZugestimmt':False}
 status,_=req('/api/contact','POST',data);assert status==429
 assert req('/api/contact','POST',{**data,'website':'bot'})[0]==422
 docker(['exec','-d',name,'php','/smtp-mock.php'])
 time.sleep(2.2)
 status,result=req('/api/contact','POST',data);assert status==200 and result['code']=='ACCEPTED'
 assert req('/api/contact','POST',{**data,'token':''})[0]==200
 assert req('/api/contact','POST',{**data,'requestId':str(uuid.uuid4())})[0]==403
 status,t=req('/api/contact-token','POST',{});assert status==200
 time.sleep(2.2)
 status,result=req('/api/contact','POST',{**data,'requestId':str(uuid.uuid4()),'token':t['token'],'einrichtung':True});assert status==200 and result['code']=='ACCEPTED'
 messages=json.loads(docker(['exec',name,'cat','/tmp/local-smtp.json']));assert len(messages)==2
 for i,m in enumerate(messages):
  assert m['recipients']==['RCPT TO:<office@senklot.at>'];parsed=email.message_from_bytes(m['data'].encode('utf-8'));assert parsed['Reply-To']=='anna@example.org'
  assert parsed.is_multipart();plain=next(p for p in parsed.walk() if p.get_content_type()=='text/plain');html=next(p for p in parsed.walk() if p.get_content_type()=='text/html');image=next(p for p in parsed.walk() if p.get_content_type()=='image/png');assert plain.get_content_charset()=='utf-8' and html.get_content_charset()=='utf-8';body=plain.get_payload(decode=True).decode('utf-8');markup=html.get_payload(decode=True).decode('utf-8');assert 'cid:senklot-logo' in markup and '<senklot-logo>'==image['Content-ID'] and image.get_payload(decode=True)==(R/'senklot-intern/mail-logo.png').read_bytes();assert 'Neue Anfrage.' in markup and '1.933,20 €' in markup;assert '1.933,20 €' in body and 'Lokaler Formularschutz' in body and 'Externe Sicherheitsprüfung wurde' not in body
  assert not any(term in body or term in markup for term in ['Einführungspreis','Pilotbetrieb','12 Monate garantiert'])
  assert ('399,00 €' in body)==bool(i)
 assert 'keine Einrichtungsgebühr' in next(p for p in email.message_from_bytes(messages[0]['data'].encode('utf-8')).walk() if p.get_content_type()=='text/plain').get_payload(decode=True).decode('utf-8')
 report={'actualApachePHP':True,'localTLSCertificateVerified':True,'localSMTPOnly':True,'noCloudflareKeys':True,'localConfigReady':True,'tokenEndpointLimitsVerified':True,'minimumWaitEnforced':True,'usedTokenRejected':True,'acceptedReplayNotResent':True,'setupOptInPreserved':True,'fixedRecipientAndReplyToVerified':True,'multipartHTMLAndPlainText':True,'inlineBrandLogoVerified':True,'regularPricesWithoutIntroductoryDeadline':True,'smtpMessages':len(messages),'realMailSent':False,'checks':checks}
 (R/'nachweise/sicherheit/lokal-http-pruefung.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
except Exception:
 print('Letzte lokale Antwort:',(F/'response.body').read_text() if (F/'response.body').exists() else 'keine')
 print(docker(['logs',name]))
 raise
finally:
 subprocess.run(D+['rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
