const fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..');
(async()=>{const preview=await require('./preview-server.cjs')(5290);const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),proof=[];try{
for(const width of[390,834,1440]){const context=await b.newContext({viewport:{width,height:1000},locale:'de-AT',reducedMotion:'reduce'}),p=await context.newPage(),errors=[],failed=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})});
await p.goto('http://127.0.0.1:5290/',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
await p.locator('img').evaluateAll(imgs=>{for(const i of imgs)i.loading='eager'});await p.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
const sw=await p.evaluate(()=>document.documentElement.scrollWidth);if(sw>width)throw Error('Überlauf bei '+width+': '+sw);
for(const tab of await p.getByRole('tab').all()){await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');await expect(p.getByRole('tabpanel')).toHaveAttribute('aria-labelledby',await tab.getAttribute('id'));}
await p.getByRole('tab',{name:'Einsatzplanung',exact:true}).focus();await p.keyboard.press('ArrowRight');await expect(p.getByRole('tab',{name:'Kundenakte',exact:true})).toBeFocused();
await p.getByRole('button',{name:/Ansicht vergrößern/}).click();await expect(p.getByRole('dialog')).toBeVisible();await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).not.toBeVisible();await expect(p.getByRole('button',{name:/Ansicht vergrößern/})).toBeFocused();
await p.getByRole('tab',{name:'Einsatzplanung',exact:true}).click();
for(const d of await p.locator('details').all()){await d.locator('summary').click();await expect(d).toHaveAttribute('open','');await d.locator('summary').click();}
const internal=await p.locator('a[href^="#"]').evaluateAll(a=>a.map(x=>x.getAttribute('href')).filter(x=>x!=='#'));for(const href of internal)if(await p.locator(href).count()!==1)throw Error('Anker fehlt '+href);
for(const a of await p.getByRole('link',{name:/Demo anfragen/}).all())await expect(a).toHaveAttribute('href','#kontakt');
await expect(p.getByRole('link',{name:/Anmelden/})).toHaveAttribute('href','https://app.senklot.at/');
await expect(p.locator('[data-preis="starter"]')).toHaveText('129 €');
await p.locator('[data-zahlung="jaehrlich"]').click();
for(const[id,price,total]of[['starter','116,10 €','1.393,20 €'],['team','161,10 €','1.933,20 €'],['betrieb','224,10 €','2.689,20 €']]){await expect(p.locator('[data-preis="'+id+'"]')).toHaveText(price);await expect(p.locator('[data-jahrespreis="'+id+'"]')).toContainText(total);}
await p.locator('[data-tarif="team"]').click();await expect(p.locator('#kontakt-tarif')).toHaveValue('team');await expect(p.locator('#anfrage-auswahl')).toContainText('1.933,20 €');await expect(p.locator('#anfrage-auswahl')).toContainText('keine Einrichtungsgebühr');await expect(p.locator('#kontakt-einrichtung')).not.toBeChecked();
await p.locator('#kontakt-name').fill('Anna Beispiel');await p.locator('#kontakt-firma').fill('Testbetrieb');await p.locator('#kontakt-email').fill('anna@example.at');
await p.getByRole('button',{name:'Formular prüfen',exact:true}).click();await expect(p.locator('#formular-status')).toContainText('Es wurde keine Anfrage versendet.');await expect(p.locator('#kontakt-name')).toHaveValue('Anna Beispiel');
await expect(p.locator('.footer a[href="tel:+436606322503"]')).toHaveText('+43 660 6322503');
await p.locator('[data-zahlung="monatlich"]').click();await p.evaluate(()=>{document.getElementById('anfrageformular').reset();document.getElementById('formular-status').textContent='';window.dispatchEvent(new Event('senklot:auswahl'));});
const violations=(await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));
await p.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});
await p.screenshot({path:path.join(root,`landingpage-${width}.png`),fullPage:true});
if(width===390)await p.screenshot({path:path.join(root,'mobil-einstieg.png')});
if(width===1440){
 const cuts=await p.evaluate(()=>[0,document.getElementById('ablauf').offsetTop,document.getElementById('einblicke').offsetTop,document.querySelector('.rollen').offsetTop,document.documentElement.scrollHeight]);
 for(let i=0;i<cuts.length-1;i++)await p.screenshot({path:path.join(root,`chat-0${i+1}.png`),clip:{x:0,y:cuts[i],width,height:cuts[i+1]-cuts[i]},fullPage:true});
 await p.screenshot({path:path.join(root,'01-einstieg.png')});for(const[id,file]of[['produkt','02-funktionen.png'],['ablauf','03-ablauf.png'],['einblicke','04-produkteinblick.png'],['fragen','05-fragen-kontakt.png']]){await p.locator('#'+id).scrollIntoViewIfNeeded();await p.evaluate(id=>window.scrollTo(0,document.getElementById(id).getBoundingClientRect().top+scrollY-30),id);await p.screenshot({path:path.join(root,file)});}}
for(const[id,file]of[['preise','06-preise'],['kontakt','07-kontakt'],['einstieg','08-einstieg'],['betrieb','09-vertrauen']]){const rect=await p.locator('#'+id).evaluate(el=>({y:el.offsetTop,height:el.offsetHeight}));await p.screenshot({path:path.join(root,file+'-'+width+'.png'),clip:{x:0,y:rect.y,width,height:rect.height},fullPage:true});}
if(width===390||width===1440){for(const d of await p.locator('.tarif-einrichtung').all())await d.locator('summary').click();const rect=await p.locator('#preise').evaluate(el=>({y:el.offsetTop,height:el.offsetHeight}));await p.screenshot({path:path.join(root,'06-einrichtung-offen-'+width+'.png'),clip:{x:0,y:rect.y,width,height:rect.height},fullPage:true});for(const d of await p.locator('.tarif-einrichtung').all())await d.locator('summary').click();}
if(width===1440){await p.locator('[data-zahlung="jaehrlich"]').click();const rect=await p.locator('#preise').evaluate(el=>({y:el.offsetTop,height:el.offsetHeight}));await p.screenshot({path:path.join(root,'06-preise-jaehrlich-1440.png'),clip:{x:0,y:rect.y,width,height:rect.height},fullPage:true});await p.locator('[data-zahlung="monatlich"]').click();}
proof.push({pricing:true,contactPreview:true,phone:true,width,scrollWidth:sw,height:await p.evaluate(()=>document.documentElement.scrollHeight),errors,failed,violations,links:true,tabs:true,keyboard:true,dialog:true,faq:true});if(errors.length||failed.length||violations.length)throw Error(JSON.stringify(proof.at(-1)));await context.close();
}
}finally{await b.close();await preview.close()}fs.writeFileSync(path.join(__dirname,'pruefung.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));})().catch(e=>{console.error(e);process.exit(1)});
