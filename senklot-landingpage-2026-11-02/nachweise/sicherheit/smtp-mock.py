"""Nur lokaler TLS-SMTP-Testserver; keine Weiterleitung und keine echten Postfächer."""
import socket,ssl,json
from pathlib import Path
F=Path('/tmp/senklot-security-fixtures')
ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(F/'test.crt',F/'test.key')
s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',5283));s.listen(3);s.settimeout(60)
result={'tlsFailures':0,'messages':[]}
while not result['messages']:
 raw,_=s.accept()
 try: conn=ctx.wrap_socket(raw,server_side=True)
 except ssl.SSLError: result['tlsFailures']+=1;raw.close();continue
 with conn:
  f=conn.makefile('rwb',buffering=0)
  def reply(v):f.write((v+'\r\n').encode())
  reply('220 localhost test SMTP')
  auth=0;msg={'recipients':[]}
  while True:
   line=f.readline().decode().rstrip('\r\n')
   if not line:break
   cmd=line.split(' ',1)[0].upper()
   if auth:
    if auth==1:reply('334 UGFzc3dvcmQ6');auth=2
    else:reply('235 Authentication successful');auth=0
   elif cmd in ['EHLO','HELO']:reply('250-localhost\r\n250 AUTH LOGIN')
   elif cmd=='AUTH':reply('334 VXNlcm5hbWU6');auth=1
   elif cmd=='MAIL':msg['from']=line;reply('250 OK')
   elif cmd=='RCPT':msg['recipients'].append(line);reply('250 OK')
   elif cmd=='DATA':
    reply('354 End with dot');data=[]
    while True:
     part=f.readline()
     if part==b'.\r\n':break
     if not part:raise RuntimeError('SMTP body incomplete')
     data.append(part)
    msg['data']=b''.join(data).decode();result['messages'].append(msg);reply('250 queued locally')
   elif cmd=='QUIT':reply('221 Bye');break
   else:reply('250 OK')
s.close();(F/'smtp-result.json').write_text(json.dumps(result,indent=2))
