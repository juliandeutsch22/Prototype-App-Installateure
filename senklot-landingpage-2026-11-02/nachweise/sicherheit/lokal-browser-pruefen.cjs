const fs=require('node:fs');
const {chromium,expect}=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@playwright/test');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),views=[];try{
for(const width of [320,390,834,1440]){
 const c=await b.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),p=await c.newPage();const external=[],errors=[],bodies=[];let tokens=0,release;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5280/'))external.push(r.url());});
 await p.route('**/api/contact-config',r=>r.fulfill({json:{mode:'live',ready:true,protection:'local',sitekey:null}}));
 await p.route('**/api/contact-token',r=>{if(r.request().method()!=='POST'||r.request().postData()!=='{}')throw Error('Token-Anfrage enthält unnötige Daten');return r.fulfill({json:{token:'local-'+(++tokens),minWaitMs:100,expiresInMs:60000}});});
 await p.route('**/api/contact',async r=>{
  bodies.push(r.request().postDataJSON());if(bodies.length===1){await new Promise(resolve=>release=resolve);return r.fulfill({status:502,json:{message:'Simuliert: Zustellung unklar.'}});}
  if(bodies.length===2)return r.fulfill({status:422,json:{message:'Bitte prüfe die Angaben.',fields:{nutzer:'Bitte prüfe die Nutzerzahl.'}}});
  return r.fulfill({json:{code:'ACCEPTED',message:'Simuliert: Anfrage übermittelt.'}});
 });
 await p.goto('http://127.0.0.1:5280/',{waitUntil:'networkidle'});await expect(p.locator('#anfrage-senden')).toBeEnabled();await expect(p.locator('#spamschutz-aktivieren')).toBeHidden();await expect(p.locator('#spamschutz-cloudflare')).toBeHidden();
 await expect(p.locator('#kontakt-einrichtung')).not.toBeChecked();await p.locator('#kontakt-name').fill('Anna Beispiel');await p.locator('#kontakt-firma').fill('Testbetrieb');await p.locator('#kontakt-email').fill('anna@example.org');
 await p.locator('[data-zahlung="jaehrlich"]').click();await p.locator('[data-tarif="team"]').click();await p.locator('#anfrage-details summary').click();await p.locator('#kontakt-nutzer').fill('8');await p.locator('#kontakt-einrichtung').check();await p.locator('#anfrage-details summary').click();
 await p.locator('#anfrage-senden').click();await expect(p.locator('#kontakt-name')).toBeDisabled();await p.locator('form').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));await expect.poll(()=>bodies.length).toBe(1);release();
 await expect(p.locator('#formular-status')).toContainText('Zustellung unklar');await expect(p.locator('#kontakt-name')).toHaveValue('Anna Beispiel');await expect(p.locator('#anfrage-senden')).toBeEnabled();
 await p.locator('#anfrage-senden').click();await expect(p.locator('#anfrage-details')).toHaveAttribute('open','');await expect(p.locator('#fehler-nutzer')).toHaveText('Bitte prüfe die Nutzerzahl.');await expect(p.locator('#anfrage-senden')).toBeEnabled();
 if(bodies[0].requestId!==bodies[1].requestId||bodies[0].token===bodies[1].token)throw Error('Wiederholungsschlüssel oder Token-Erneuerung fehlerhaft');
 await p.locator('#kontakt-nutzer').fill('9');await p.locator('#anfrage-senden').click();await expect(p.locator('#formular-status')).toContainText('Anfrage übermittelt');await expect(p.locator('#kontakt-name')).toHaveValue('');await expect(p.locator('#kontakt-einrichtung')).not.toBeChecked();
 if(bodies.some(d=>d.spamschutzZugestimmt!==false||d.einrichtung!==true||d.tarif!=='team'||d.zahlung!=='jaehrlich')||bodies[1].requestId===bodies[2].requestId)throw Error('Auswahl oder Einwilligungsstatus falsch');
 if(external.length||errors.length||(await c.cookies()).length||await p.evaluate(()=>localStorage.length+sessionStorage.length))throw Error(JSON.stringify({external,errors}));
 views.push({width,noExternalRequests:true,noCookiesOrBrowserStorage:true,tokenRefresh:true,stableRetryId:true,optionalSetupPreserved:true,fieldsRetainedOnError:true,busyGuard:true,resetOnlyOnAccepted:true});await c.close();
}
// Fehler bei der Vorbereitung, bewusster Wiederholungsversuch und automatischer Token-Ablauf.
const c=await b.newContext({viewport:{width:390,height:900}}),p=await c.newPage();let issued=0;
await p.route('**/api/contact-config',r=>r.fulfill({json:{mode:'live',ready:true,protection:'local',sitekey:null}}));
await p.route('**/api/contact-token',r=>{issued++;return issued===1?r.fulfill({status:503,json:{message:'offline'}}):r.fulfill({json:{token:'renewed-'+issued,minWaitMs:40,expiresInMs:issued===2?700:60000}});});
await p.goto('http://127.0.0.1:5280/');await expect(p.locator('#spamschutz-aktivieren')).toHaveText('Formular erneut vorbereiten');await expect(p.locator('#anfrage-senden')).toBeDisabled();
await p.locator('#kontakt-name').fill('Anna bleibt');await p.locator('#spamschutz-aktivieren').click();await expect(p.locator('#anfrage-senden')).toBeEnabled();await expect.poll(()=>issued).toBeGreaterThanOrEqual(3);await expect(p.locator('#anfrage-senden')).toBeEnabled();await expect(p.locator('#kontakt-name')).toHaveValue('Anna bleibt');await c.close();
const result={views,preparationFailureHasRetry:true,automaticExpiryRefreshRetainsFields:true,simulatedLocalTokens:true,realMailSent:false};fs.writeFileSync(__dirname+'/lokal-browser-pruefung.json',JSON.stringify(result,null,2));console.log(JSON.stringify({localBrowserViews:views.length,externalRequests:0,errorAndExpiryRecovery:true}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
