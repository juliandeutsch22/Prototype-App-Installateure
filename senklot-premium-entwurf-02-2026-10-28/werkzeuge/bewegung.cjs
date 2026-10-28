const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const{chromium,expect}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..'),out=path.join(root,'bewegung');fs.mkdirSync(out,{recursive:true});
async function record(page,name,actions){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lot-motion-')),session=await page.context().newCDPSession(page),frames=[];
 session.on('Page.screencastFrame',e=>{const file=path.join(dir,String(frames.length).padStart(6,'0')+'.jpg');fs.writeFileSync(file,Buffer.from(e.data,'base64'));frames.push({file,t:e.metadata.timestamp});session.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
 await session.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:page.viewportSize().width,maxHeight:page.viewportSize().height,everyNthFrame:1});
 await page.waitForTimeout(500);await actions();await page.waitForTimeout(1000);await session.send('Page.stopScreencast');await session.detach();
 if(frames.length<3)throw Error('Keine ausreichenden Frames '+name);
 const list=frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.016,i+1<frames.length?frames[i+1].t-f.t:1).toFixed(6)}`).join('\n')+`\nfile '${frames.at(-1).file}'\n`;
 fs.writeFileSync(path.join(dir,'frames.txt'),list);
 execFileSync('/usr/bin/ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(dir,'frames.txt'),'-vf','fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-y',path.join(out,name+'.mp4')]);
 fs.rmSync(dir,{recursive:true});console.log(name,frames.length);
}
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),c=await b.newContext({viewport:{width:390,height:1000},locale:'de-AT',reducedMotion:'no-preference'}),p=await c.newPage(),checks=[];
 const go=s=>p.goto('http://127.0.0.1:5220/vorschau.html?screen='+s);
 await go('firmendaten');await p.evaluate(()=>document.fonts.ready);
 await record(p,'01-speichern',async()=>{
  await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();await expect(p.getByRole('button',{name:'Gespeichert',exact:true})).toBeDisabled();await p.waitForTimeout(650);
  await p.getByLabel('Firmenname',{exact:true}).fill('Leitner Haustechnik GmbH · neu');await p.evaluate(()=>window.CraftDemo.setOutcome('error'));await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();await expect(p.locator('.craft-save-error')).toBeVisible();await p.waitForTimeout(950);
  await p.evaluate(()=>window.CraftDemo.setOutcome('ok'));await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();await expect(p.getByRole('button',{name:'Gespeichert',exact:true})).toBeDisabled();
 });
 await go('firmendaten');
 await record(p,'02-rueckfrage',async()=>{
  await p.getByLabel('Firmenname',{exact:true}).fill('Neue nicht gespeicherte Eingabe');await p.evaluate(()=>window.CraftDemo.openDialog());await p.waitForTimeout(850);await p.getByRole('link',{name:'Weiter bearbeiten',exact:true}).click();await expect(p.getByRole('dialog')).toHaveCount(0);await p.waitForTimeout(500);
  await p.evaluate(()=>window.CraftDemo.openDialog());await p.waitForTimeout(750);await p.getByRole('link',{name:'Änderungen verwerfen',exact:true}).click();await expect(p.getByRole('dialog')).toHaveCount(0);
 });
 await go('katalog-treffer');
 await record(p,'03-katalog',async()=>{
  await p.getByRole('button',{name:'Übernehmen',exact:true}).first().click();await p.waitForTimeout(700);await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('CU-22-H');await expect(p.getByRole('button',{name:'Übernehmen',exact:true})).toHaveCount(1);await p.waitForTimeout(550);
  await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('zzzz');await expect(p.getByRole('button',{name:'Suche zurücksetzen',exact:true})).toBeVisible();await p.waitForTimeout(800);await p.getByRole('button',{name:'Suche zurücksetzen',exact:true}).click();await expect(p.getByLabel('Name, Artikelnummer oder Kategorie')).toHaveValue('');await p.waitForTimeout(400);await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('Kupferrohr 22');await expect(p.getByRole('button',{name:'Übernehmen',exact:true})).toHaveCount(2);
 });
 await c.close();
 // Fokuskontraste auf tatsächlichen React-Ansichten, einschließlich dunklem Farbsatz.
 for(const theme of['light','dark'])for(const width of[390,1440]){
  const c=await b.newContext({viewport:{width,height:1000},locale:'de-AT'}),p=await c.newPage();if(theme==='dark')await c.addInitScript(()=>localStorage.setItem('senklot.darstellung','dunkel'));
  await p.goto('http://127.0.0.1:5221/tools/vorschau/?pfad=%2Fcustomers&rolle=Administrator',{waitUntil:'networkidle'});await p.addStyleTag({content:fs.readFileSync(path.join(root,'lot-craft.css'),'utf8')});await p.addScriptTag({content:fs.readFileSync(path.join(root,'craft.js'),'utf8')});
  await p.keyboard.press('Tab');const nav=p.locator(width===1440?'.navi a[href]':'.unten a[href]').first();await nav.focus();
  const state=await nav.evaluate(el=>({focus:el.matches(':focus-visible'),color:getComputedStyle(el).outlineColor,width:getComputedStyle(el).outlineWidth,offset:getComputedStyle(el).outlineOffset}));
  if(!state.focus||state.width!=='3px'||(width===1440&&state.color!=='rgb(255, 255, 255)'))throw Error('Fokus unzureichend '+JSON.stringify(state));checks.push({theme,viewportWidth:width,...state});
  if(theme==='light'&&width===1440){
   await record(p,'04-zeilenmenue',async()=>{const button=p.getByRole('button',{name:/Weitere Aktionen für/}).first();await button.click();await expect(p.getByRole('menu')).toBeVisible();await p.waitForTimeout(750);await p.keyboard.press('ArrowDown');await p.waitForTimeout(400);await p.keyboard.press('Escape');await expect(p.getByRole('menu')).toHaveCount(0);await expect(button).toBeFocused();});
  }
  await c.close();
 }
 await b.close();fs.writeFileSync(path.join(root,'bewegung-pruefung.json'),JSON.stringify({focus:checks,recordings:['01-speichern','02-rueckfrage','03-katalog','04-zeilenmenue'],scope:'Drei isolierte asynchrone Designmodelle und ein Menü der echten lokalen React-Vorschau. Keine Produktionsschreibvorgänge. Videozeit ist keine Performance-Messung.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
