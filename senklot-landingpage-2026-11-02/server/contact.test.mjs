import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,validieren,AnfrageLimit,emailText} from './contact.mjs';
import tarife from '../tarife.js';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {emailParts} from './mail.mjs';
const origin='https://senklot.at';
const data={name:'Anna Beispiel',firma:'Testbetrieb',email:'anna@example.at',telefon:'+43 660 123456',tarif:'team',zahlung:'jaehrlich',einrichtung:true,nutzer:'8',nachricht:'Bitte um eine Demo.',website:'',token:'valid-token',requestId:'f178f466-386f-47f0-81af-d426d08117aa'};
function request(d=data,options={}){return new Request(origin+'/api/contact',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...options.headers},body:typeof d==='string'?d:JSON.stringify(d)});}
function setup(overrides={}){const verified=[],sent=[];const handler=createHandler({origins:[origin],ready:true,verify:async(...args)=>{verified.push(args);return {success:true,action:'contact',hostname:'senklot.at'};},send:async m=>{sent.push(m);return {id:'mock-message'};},...overrides});return {handler,verified,sent};}
test('Alle sechs Abopreise und Einrichtung werden exakt in Cent berechnet',()=>{
 for(const[id,month,annual,setup]of[['starter',12900,139320,19900],['team',17900,193320,39900],['betrieb',24900,268920,69900]]){
  assert.equal(tarife.preis(id,'monatlich').effektivMonatCent,month);const p=tarife.preis(id,'jaehrlich');assert.equal(p.jahrCent,annual);assert.equal(p.effektivMonatCent,annual/12);assert.equal(p.einrichtungCent,setup);
 }assert.equal(tarife.preis('falsch','monatlich'),null);assert.equal(tarife.preis('team','falsch'),null);
});
test('Bestätigter Versand nutzt feste Empfängeradresse und serverseitige Preise',async()=>{
 const s=setup(),r=await s.handler(request({...data,preis:1,to:'falsch@example.com'}),'ip');assert.equal(r.status,200);assert.equal((await r.json()).code,'ACCEPTED');assert.equal(s.verified.length,1);assert.equal(s.sent.length,1);const m=s.sent[0];assert.equal(m.to,'office@senklot.at');assert.equal(m.replyTo,data.email);assert.match(m.text,/1\.933,20 € jährlich/);assert.match(m.text,/399,00 € netto/);
 await s.handler(request(),'ip');assert.deepEqual(s.sent[0],s.sent[1]);
});
test('Einrichtung ist freiwillig und wird nur nach ausdrücklicher Auswahl angefragt',()=>{
 for(const id of ['starter','team','betrieb','offen']){
  const no=validieren({...data,tarif:id,einrichtung:false}).data;const text=emailText(no);assert.match(text,/Einrichtung: nicht angefragt/);assert.doesNotMatch(text,/Einrichtung angefragt:/);
  if(id!=='offen')assert.match(text,/keine Einrichtungsgebühr/);
  const yes=emailText(validieren({...data,tarif:id,einrichtung:true}).data);assert.match(yes,/Optionale Einrichtung angefragt:/);assert.match(yes,/12 Monate garantiert/);
 }
 const absent={...data};delete absent.einrichtung;assert.equal(validieren(absent).data.einrichtung,false);
});
test('HTML-Mail maskiert Eingaben, nutzt eingebettete Marke und behält Klartext',async()=>{
 const d={...data,name:'Anna <script>alert(1)</script>',firma:'Betrieb <b>& Co</b>',nachricht:'<img src=x onerror=alert(1)>\nZweite Zeile'};
 const s=setup();assert.equal((await s.handler(request(d),'ip')).status,200);const m=s.sent[0];
 assert.match(m.html,/Anna &lt;script&gt;/);assert.doesNotMatch(m.html,/<script>|<img src=x/);assert.match(m.html,/Zweite Zeile/);assert.match(m.html,/1\.933,20 €/);assert.match(m.html,/399,00 €/);assert.match(m.html,/cid:senklot-logo/);assert.doesNotMatch(m.html,/\{\{|<script|<link|<img[^>]+src="https?:/i);
 assert.equal(m.attachments[0].content_id,'senklot-logo');assert.ok(m.attachments[0].content.length>100);assert.match(m.text,/Betrieb <b>& Co<\/b>/);
 const no=emailParts({...data,einrichtung:false});assert.match(no.html,/Keine Einrichtungsgebühr/);assert.doesNotMatch(no.html,/399,00 €/);
});
test('Vorschau und fehlende Konfiguration versenden nie',async()=>{
 for(const[config,status,code]of[[{preview:true},200,'PREVIEW_ONLY'],[{ready:false},503,undefined]]){const s=setup(config),r=await s.handler(request(),'ip');assert.equal(r.status,status);assert.equal((await r.json()).code,code);assert.equal(s.verified.length,0);assert.equal(s.sent.length,0);}
});
test('Fehlendes, ungültiges, falsches Host- oder Aktions-Token sperrt den Versand',async()=>{
 for(const v of[{success:false},{success:true,hostname:'evil.example',action:'contact'},{success:true,hostname:'senklot.at',action:'login'}]){const s=setup({verify:async()=>v});assert.equal((await s.handler(request(),'ip')).status,403);assert.equal(s.sent.length,0);}
 const s=setup();assert.equal((await s.handler(request({...data,token:''}),'ip')).status,403);assert.equal(s.sent.length,0);
});
test('Dienstausfälle oder fehlende Versandbestätigung ergeben niemals Erfolg',async()=>{
 const v=setup({verify:async()=>{throw Error('offline');}});assert.equal((await v.handler(request(),'ip')).status,503);assert.equal(v.sent.length,0);
 for(const send of[async()=>{throw Error('offline');},async()=>({}),async()=>({id:''})]){const s=setup({send}),r=await s.handler(request(),'ip');assert.equal(r.status,502);assert.equal((await r.json()).code,undefined);}
});
test('Servervalidierung stoppt Manipulationen unabhängig vom Browser',()=>{
 for(const change of[{name:'x'},{firma:[]},{email:'a@b.at\r\nBcc:x@y.at'},{telefon:{}},{tarif:'__proto__'},{zahlung:'free'},{einrichtung:'ja'},{nutzer:true},{nutzer:1.2},{nutzer:10001},{nachricht:{}},{nachricht:'x'.repeat(3001)},{website:'spam'},{requestId:'x'},{token:'x'.repeat(2049)}])assert.ok(validieren({...data,...change}).errors,JSON.stringify(change));
 assert.ok(validieren([]).errors);assert.ok(validieren(null).errors);assert.ok(validieren(data).data);
});
test('HTTP- und Origin-Grenzen werden vor dem Versand geprüft',async()=>{
 const s=setup();for(const[req,status]of[[new Request(origin,{method:'GET'}),405],[request(data,{headers:{Origin:'https://evil.example'}}),403],[request(data,{headers:{'Content-Type':'text/plain'}}),415],[request('{'),400],[request('x'.repeat(12001)),413],[request({...data,website:'spam'}),422]])assert.equal((await s.handler(req,'ip')).status,status);assert.equal(s.sent.length,0);
});
test('Rate-Limit ist begrenzt, läuft ab und kann nicht durch Überfüllung umgangen werden',async()=>{
 let now=0;const limit=new AnfrageLimit({max:2,fensterMs:100,kapazitaet:1,jetzt:()=>now});assert.equal(limit.nehmen('a'),true);assert.equal(limit.nehmen('a'),true);assert.equal(limit.nehmen('a'),false);assert.equal(limit.nehmen('b'),false);assert.equal(limit.eintraege.size,1);now=100;assert.equal(limit.nehmen('b'),true);assert.equal(limit.eintraege.size,1);
 const s=setup({limit:new AnfrageLimit({max:1})});await s.handler(request(),'a');const r=await s.handler(request(),'a');assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'900');assert.equal(s.sent.length,1);
});
test('HTTP-Server schützt private Dateien und bleibt ohne Dienste gesperrt',async()=>{
 const child=spawn(process.execPath,['server/app.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',CONTACT_ORIGINS:origin,HOST:'127.0.0.1',PORT:'5243',TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:'',RESEND_API_KEY:'',RESEND_FROM:''},stdio:['ignore','pipe','pipe']});
 try{await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Server startet nicht')),5000);t.unref();})]);
  const base='http://127.0.0.1:5243';const config=await (await fetch(base+'/api/contact-config')).json();assert.deepEqual(config,{mode:'unavailable',ready:false,sitekey:null});
  for(const file of['/.env','/.env.example','/server/contact.mjs','/assets/..%2f.env.example','/assets/%2e%2e%2fpackage.json'])assert.equal((await fetch(base+file)).status,404,file);
  const r=await fetch(base+'/api/contact',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,503);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal((await fetch(base+'/')).status,200);
 }finally{const ended=once(child,'exit');child.kill();await ended;}
});
test('Produktionsmodus verbietet die Vorschau',async()=>{
 const child=spawn(process.execPath,['server/app.mjs','--preview'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production'},stdio:'ignore'});const[code]=await once(child,'exit');assert.notEqual(code,0);
});
