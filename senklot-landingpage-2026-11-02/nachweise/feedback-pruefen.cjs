const fs=require('node:fs');
const {chromium,expect}=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@playwright/test');
(async()=>{const preview=await require('./preview-server.cjs')(5292);const browser=await chromium.launch({executablePath:'/usr/bin/chromium'}),views=[];try{
for(const width of [320,390,834,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},locale:'de-AT',reducedMotion:'reduce'}),p=await context.newPage();let sent=0;const bodies=[];
 p.on('request',r=>{if(new URL(r.url()).pathname==='/api/contact'){sent++;bodies.push(r.postDataJSON());}});
 await p.goto('http://127.0.0.1:5292/',{waitUntil:'networkidle'});
 for(const [id,amount] of [['starter','129 €'],['team','179 €'],['betrieb','249 €']])await expect(p.locator(`[data-preis="${id}"]`)).toHaveText(amount);
 const graph=JSON.parse(await p.locator('script[type="application/ld+json"]').textContent())['@graph'];
 const offers=graph.find(x=>x['@type']==='SoftwareApplication').offers;
 if(JSON.stringify(offers.map(x=>x.price))!==JSON.stringify([129,179,249]))throw Error('Suchmaschinenpreise weichen ab');
 if(offers.some(x=>!x.description.includes('Einführungspreis')))throw Error('Einführungspreis im Suchmaschinenkontext fehlt');
 const scopes=p.locator('.tarif-einrichtung');await expect(scopes).toHaveCount(3);
 for(const [i,amount,count]of [[0,'199 €','5 Nutzer'],[1,'399 €','15 Nutzer'],[2,'699 €','30 Nutzer']]){
  const d=scopes.nth(i),summary=d.locator('summary');await expect(summary).toContainText(amount);await expect(d).not.toHaveAttribute('open','');await summary.focus();await summary.press('Enter');await expect(d).toHaveAttribute('open','');await expect(d.locator('li')).toHaveCount(4);await expect(d).toContainText(count);await expect(d).toContainText('nicht pauschal enthalten');await expect(p.locator('#kontakt-einrichtung')).not.toBeChecked();await summary.press('Enter');await expect(d).not.toHaveAttribute('open','');
 }
 await expect(p.locator('#anfrageformular details')).toHaveCount(0);await expect(p.locator('#kontakt-einrichtung')).not.toBeChecked();
 for(const name of ['name','firma','email','telefon','tarif','nutzer','nachricht'])await expect(p.locator(`#anfrageformular [name="${name}"]`)).toBeVisible();
 const groups=p.locator('#fragen .faq-gruppe');await expect(groups).toHaveCount(2);for(const g of await groups.all())await expect(g.locator('details')).toHaveCount(5);
 const [a,b]=await groups.evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));if(width>=760?!(a.x<b.x&&Math.abs(a.y-b.y)<2):!(a.y<b.y))throw Error('FAQ-Gruppen falsch angeordnet');
 await expect(p.locator('#formular-schutz')).toBeHidden();
 const fields=await p.locator('#anfrageformular [name]').evaluateAll(es=>es.map(e=>e.name).sort());
 if(fields.join(',')!==['name','firma','email','telefon','tarif','nutzer','nachricht','website','einrichtung'].sort().join(','))throw Error('Formularfeld verloren');
 await p.locator('#kontakt-name').fill('Anna Beispiel');await p.locator('#kontakt-firma').fill('Testbetrieb');await p.locator('#kontakt-email').fill('anna@example.org');
 await p.locator('#kontakt-nutzer').fill('0');
 await p.getByRole('button',{name:'Formular prüfen',exact:true}).click();
 await expect(p.locator('#kontakt-nutzer')).toBeVisible();await expect(p.locator('#kontakt-nutzer')).toBeFocused();if(sent!==0)throw Error('Ungültige Anfrage versendet');
 await p.locator('#kontakt-nutzer').fill('8');await p.locator('#kontakt-telefon').fill('+43 660 123456');await p.locator('#kontakt-nachricht').fill('Bitte um eine kostenlose Demo.');
 await p.locator('[data-zahlung="jaehrlich"]').click();await p.locator('[data-tarif="team"]').click();
 await expect(p.locator('#kontakt-nachricht')).toBeVisible();await expect(p.locator('#anfrage-auswahl')).toContainText('1.933,20 €');await expect(p.locator('#anfrage-auswahl')).toContainText('keine Einrichtungsgebühr');await expect(p.locator('#anfrage-auswahl')).toContainText('12 Monate garantiert');
 await p.getByRole('button',{name:'Formular prüfen',exact:true}).click();await expect(p.locator('#formular-status')).toContainText('Es wurde keine Anfrage versendet.');if(sent!==1)throw Error('Unerwartete Anzahl Formularanfragen');
 await p.locator('#kontakt-einrichtung').check();await expect(p.locator('#anfrage-auswahl')).toContainText('Optionale Einrichtung angefragt: 399 €');
 const finished=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/contact');await p.getByRole('button',{name:'Formular prüfen',exact:true}).click();await finished;if(bodies.length!==2||bodies[0].einrichtung!==false||bodies[1].einrichtung!==true||bodies[0].requestId===bodies[1].requestId)throw Error('Optionale Einrichtung nicht korrekt übertragen oder alter Wiederholungsschlüssel');
 const data=await p.locator('form').evaluate(f=>Object.fromEntries(new FormData(f)));if(data.nutzer!=='8'||data.telefon!=='+43 660 123456'||data.tarif!=='team'||data.einrichtung!=='ja'||!data.nachricht.includes('kostenlose Demo'))throw Error('Optionale Angaben verloren');
 const sw=await p.evaluate(()=>document.documentElement.scrollWidth);if(sw>width)throw Error('Horizontaler Überlauf');
 views.push({width,matchingHTMLSchemaAndJSPrices:true,threeRequiredFieldsVisible:true,allFieldsPreserved:true,optionalInvalidFieldVisible:true,invalidFormNotSent:true,visibleOptionalFieldsSubmitted:true,annualAndSetupPreserved:true,setupOptionalByDefault:true,setupOnlyRequestedAfterOptIn:true,priceBindingTwelveMonths:true,setupScopeAccordionsKeyboardVerified:true,faqGroupsAligned:true,normalProtectionBlockHidden:true});await context.close();
}
const c=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}}),p=await c.newPage();await p.goto('http://127.0.0.1:5280/');for(const[id,price] of [['starter','129 €'],['team','179 €'],['betrieb','249 €']])await expect(p.locator(`[data-preis="${id}"]`)).toHaveText(price);
await expect(p.locator('#kontakt-nachricht')).toBeVisible();await c.close();
fs.writeFileSync(__dirname+'/feedback-pruefung.json',JSON.stringify({views,noJavaScriptPricesCorrect:true,noJavaScriptOptionalFieldsVisible:true,realMailSent:false},null,2));console.log(JSON.stringify({feedbackViews:views.length,pricesAndOptionalFieldsVerified:true,realMailSent:false}));
}finally{await browser.close();await preview.close();}})().catch(e=>{console.error(e);process.exit(1)});
