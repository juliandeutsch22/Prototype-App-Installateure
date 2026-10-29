const fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('/workspace/Senklot-Premium-Umsetzung/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..'),rows=JSON.parse(fs.readFileSync(path.join(root,'pruefung-seiten.json')));
const total=rows.filter(r=>!r.error).length;
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),proof=[];
 for(const name of ['01-start','02-auftraege','03-planung','04-team','05-finanzen','06-material','07-einstellungen','08-plattform','09-zugang']){
  const p=await b.newPage({viewport:{width:2400,height:1080},deviceScaleFactor:1});
  await p.goto('http://127.0.0.1:5233/'+name+'.html',{waitUntil:'networkidle'});
  await p.evaluate(()=>document.fonts.ready);
  if(await p.locator('img').evaluateAll(images=>images.some(i=>!i.complete||i.naturalWidth===0)))throw Error('Bereichsbogen: Bild fehlt '+name);
  await p.screenshot({path:path.join(root,name+'.jpg'),type:'jpeg',quality:91,fullPage:true});await p.close();
 }
 for(const width of [390,834,1440]){
  const p=await b.newPage({viewport:{width,height:900},locale:'de-AT'}),errors=[],failed=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await p.goto('http://127.0.0.1:5233/',{waitUntil:'networkidle'});
  await expect(p.locator('#count')).toHaveText(`${total} von ${total} Ansichten`);
  await p.locator('#search').fill('Benutzerakte');await p.locator('#width').selectOption('390');
  const n=rows.filter(r=>!r.error&&r.title.includes('Benutzerakte')&&r.width===390).length;
  await expect(p.locator('.shot:visible')).toHaveCount(n);
  await p.getByRole('button',{name:'Zurücksetzen',exact:true}).click();
  await p.locator('#group').selectOption('Finanzen');await p.locator('#width').selectOption('390');await p.locator('#theme').selectOption('dark');
  await expect(p.locator('.shot:visible')).toHaveCount(rows.filter(r=>!r.error&&r.group==='Finanzen'&&r.width===390&&r.theme==='dark').length);
  await p.getByRole('button',{name:'Zurücksetzen',exact:true}).click();
  const opener=p.locator('.shot .imagebutton').first();await opener.focus();await p.keyboard.press('Enter');
  await expect(p.locator('dialog')).toBeVisible();await expect(p.locator('#picture')).toHaveAttribute('src','seiten/'+rows[0].file);
  await p.keyboard.press('ArrowRight');await expect(p.locator('#picture')).toHaveAttribute('src','seiten/'+rows[1].file);
  await p.keyboard.press('ArrowLeft');await expect(p.locator('#picture')).toHaveAttribute('src','seiten/'+rows[0].file);
  await p.keyboard.press('Escape');await expect(p.locator('dialog')).not.toBeVisible();await expect(opener).toBeFocused();
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth);if(sw>width)throw Error('Galerie überläuft '+width);
  if(errors.length||failed.length)throw Error(JSON.stringify({width,errors,failed}));
  proof.push({width,filters:true,keyboardViewer:true,escapeAndFocusReturn:true,scrollWidth:sw,errors,failed});await p.close();
 }
 // file:// ist im verwalteten Chromium per Richtlinie gesperrt. Ohne
 // Richtlinienänderung: Paket lokal mit gesperrtem externem Netz prüfen.
 const context=await b.newContext(),p=await context.newPage(),errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
 await p.goto('http://127.0.0.1:5233/',{waitUntil:'networkidle'});
 await expect(p.locator('#count')).toHaveText(`${total} von ${total} Ansichten`);
 await p.locator('#search').fill('Kundenakte');await expect(p.locator('.shot:visible').first()).toBeVisible();
 await p.locator('.shot:visible .imagebutton').first().click();await expect(p.locator('dialog')).toBeVisible();
 await expect(p.locator('#picture')).toHaveJSProperty('complete',true);
 if(await p.locator('#picture').evaluate(e=>e.naturalWidth)<=0)throw Error('Offlinebild fehlt');
 if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
 proof.push({localBundleWithExternalNetworkBlocked:true,noExternalRequests:true,fileNavigationCheck:'blocked by managed browser policy; no policy change',filters:true,viewer:true,errors});await context.close();

 await b.close();fs.writeFileSync(path.join(root,'galerie-pruefung.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e);process.exit(1)});
