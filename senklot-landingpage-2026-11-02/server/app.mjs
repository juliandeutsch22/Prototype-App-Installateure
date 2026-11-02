import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createHandler } from './contact.mjs';
import { publicFiles, publicRedirect } from './public.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const preview=process.argv.includes('--preview');
if(preview&&process.env.NODE_ENV==='production')throw Error('Die Vorschau darf nicht im Produktionsmodus laufen.');
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
const origins=(process.env.CONTACT_ORIGINS||`http://127.0.0.1:${port},http://localhost:${port}`).split(',').map(v=>new URL(v.trim()).origin);
if(process.env.NODE_ENV==='production'&&(!process.env.CONTACT_ORIGINS||origins.some(o=>!o.startsWith('https://'))))throw Error('Für die Veröffentlichung sind die HTTPS-Adressen der Website erforderlich.');
const sitekey=process.env.TURNSTILE_SITE_KEY||'',secret=process.env.TURNSTILE_SECRET_KEY||'',mailkey=process.env.RESEND_API_KEY||'',from=process.env.RESEND_FROM||'';
// Öffentliche Testschlüssel werden in der produktiven Anbindung abgewiesen.
const testkey=/^[123]x0/.test(sitekey)||/^[123]x0/.test(secret);
const ready=!!sitekey&&!!secret&&!!mailkey&&!!from&&!testkey&&!preview;
const handle=createHandler({origins,preview,ready,
 verify:async(token,ip)=>{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,response:token,remoteip:ip}),signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('Sicherheitsprüfung nicht erreichbar');return r.json();},
 send:async(m)=>{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${mailkey}`,'Idempotency-Key':m.idempotencyKey},body:JSON.stringify({from,to:[m.to],reply_to:m.replyTo,subject:m.subject,text:m.text}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Versand nicht bestätigt');return r.json();}
});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const security={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
function json(res,status,data){res.writeHead(status,{...security,'X-Robots-Tag':'noindex, nofollow','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/contact-config'){
   if(req.method!=='GET')return json(res,405,{message:'Methode nicht unterstützt.'});
   return json(res,200,{mode:preview?'preview':ready?'live':'unavailable',ready,sitekey:ready?sitekey:null});
  }
  if(url.pathname==='/api/contact'){
   let size=0,chunks=[];if(Number(req.headers['content-length'])>12000)return json(res,413,{message:'Die Anfrage ist zu groß.'});
   for await(const c of req){size+=c.length;if(size>12000){json(res,413,{message:'Die Anfrage ist zu groß.'});return;}chunks.push(c);}
   const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
   const request=new Request(origins[0]+'/api/contact',{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const forwarded=process.env.TRUST_PROXY==='true'?req.headers['x-forwarded-for']?.split(',').at(-1)?.trim():null;
   const ip=forwarded&&isIP(forwarded)?forwarded:(req.socket.remoteAddress||'unknown');
   const r=await handle(request,ip);res.writeHead(r.status,{...security,...Object.fromEntries(r.headers)});return res.end(await r.text());
  }
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{message:'Methode nicht unterstützt.'});
  const redirect=publicRedirect(url.pathname,url.search,req.headers.host||'');
  if(redirect){res.writeHead(308,{...security,Location:redirect,'Cache-Control':'no-cache'});return res.end();}
  const file=publicFiles.get(url.pathname)||(url.pathname.startsWith('/assets/')?decodeURIComponent(url.pathname):null);
  if(!file)return json(res,404,{message:'Nicht gefunden.'});
  const resolved=path.resolve(root,'.'+file);if(!resolved.startsWith(root+path.sep)||(file.startsWith('/assets/')&&!resolved.startsWith(path.join(root,'assets')+path.sep)))return json(res,404,{message:'Nicht gefunden.'});
  const data=await readFile(resolved);res.writeHead(200,{...security,'Content-Type':mime[path.extname(resolved)]||'application/octet-stream','Cache-Control':['.html','.xml','.txt'].includes(path.extname(resolved))?'no-cache':'public, max-age=86400'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){if(!res.headersSent)json(res,e.code==='ENOENT'?404:500,{message:'Die Anfrage konnte nicht verarbeitet werden.'});else res.end();}
});
server.requestTimeout=20000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
server.listen(port,host,()=>console.log(`Senklot-Landingpage: http://${host}:${port} · ${preview?'Vorschau ohne Versand':ready?'Kontakt konfiguriert':'Kontakt nicht aktiviert'}`));
