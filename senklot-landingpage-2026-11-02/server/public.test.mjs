import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {publicRedirect, funktionen} from './public.mjs';

test('Kanonische URLs erhalten Queryparameter und zeigen keine fremden Hosts an',()=>{
 assert.equal(publicRedirect('/index.html','?utm_source=demo'),'/?utm_source=demo');
 for(const slug of funktionen){
  assert.equal(publicRedirect('/'+slug,'?a=1&b=2'),'/'+slug+'/?a=1&b=2');
  assert.equal(publicRedirect('/'+slug+'/index.html'),'/'+slug+'/');
  assert.equal(publicRedirect('/'+slug+'/'),null);
 }
 assert.equal(publicRedirect('/einsatzplanung/index.html','?a=1','www.senklot.at'),'https://senklot.at/einsatzplanung/?a=1');
 assert.equal(publicRedirect('/','','evil.example'),null);
 assert.equal(publicRedirect('/','','app.senklot.at'),null);
});

test('Öffentliche Seiten, Sitemap, Crawlingregeln und Dateitypen werden korrekt ausgeliefert',async()=>{
 const child=spawn(process.execPath,['server/app.mjs','--preview'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'development',PORT:'5254',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Server startet nicht')),5000);t.unref();})]);
  const base='http://127.0.0.1:5254';
  for(const slug of ['',...funktionen]){
   const url='/'+(slug?slug+'/':'');const r=await fetch(base+url);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/html/);const html=await r.text();assert.ok(html.includes('rel="canonical" href="https://senklot.at'+url+'"'));assert.match(html,/<h1>/);assert.equal((await fetch(base+url+'index.html?src=test',{redirect:'manual'})).headers.get('location'),url+'?src=test');
  }
  for(const[file,mime]of[['robots.txt','text/plain'],['sitemap.xml','application/xml'],['assets/planung.webp','image/webp'],['effekte.js','text/javascript'],['assets/senklot.svg','image/svg+xml']]){const r=await fetch(base+'/'+file);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(mime));}
  const sitemap=await (await fetch(base+'/sitemap.xml')).text();assert.equal((sitemap.match(/<loc>/g)||[]).length,7);assert.ok(!sitemap.includes('app.senklot.at'));
  const robots=await (await fetch(base+'/robots.txt')).text();assert.ok(robots.includes('User-agent: OAI-SearchBot\nAllow: /'));assert.ok(!robots.includes('Disallow: /\n'));
  for(const file of['/.env','/.htaccess','/werkzeuge/funktionen.json','/vorlagen/startseite-vor-seo.html','/server/public.mjs','/assets/..%2f.env.example','/nicht-vorhanden/'])assert.equal((await fetch(base+file)).status,404,file);
 }finally{const done=once(child,'exit');child.kill();await done;}
});
