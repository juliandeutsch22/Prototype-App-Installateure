const fs=require('node:fs');
const {chromium,expect}=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@playwright/test');
const Axe=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@axe-core/playwright').default;
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});const views=[];try{
for(const width of [320,390,834,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();const errors=[],external=[],csp=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5280/'))external.push(r.url());});
 await p.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>(window.cspErrors??=[]).push(e.violatedDirective)));
 for(const slug of ['','einsatzplanung','zeiterfassung','handwerksscheine','kunden-baustellen','material-lager','angebote-rechnungen','impressum','datenschutz']){
  const response=await p.goto('http://127.0.0.1:5280/'+(slug?slug+'/':''),{waitUntil:'networkidle'});if(response.status()!==200)throw Error('HTTP '+slug);
  await p.evaluate(()=>document.fonts.ready);const sw=await p.evaluate(()=>document.documentElement.scrollWidth);if(sw>width)throw Error('Überlauf '+slug+' '+width);
  csp.push(...await p.evaluate(()=>window.cspErrors??[]));await expect(p.locator('h1')).toHaveCount(1);
  if(['impressum','datenschutz'].includes(slug)){await expect(p.locator('.rechts-entwurf')).toBeVisible();await expect(p.locator('meta[name=robots]')).toHaveAttribute('content','noindex,follow');}
  if(!slug){await expect(p.locator('#anfrage-senden')).toBeDisabled();await expect(p.locator('#spamschutz-status')).toContainText('momentan nicht verfügbar');await expect(p.locator('#spamschutz-aktivieren')).toBeHidden();}
  let violations=[];if([390,1440].includes(width))violations=(await new Axe({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
  if(violations.length)throw Error(JSON.stringify({slug,width,violations}));
  if(width===390 && ['datenschutz','impressum'].includes(slug))await p.screenshot({path:__dirname+'/'+slug+'-390.png',fullPage:true});
  if(!slug && [390,1440].includes(width)){await p.locator('#kontakt').scrollIntoViewIfNeeded();await p.screenshot({path:__dirname+'/kontakt-'+width+'.png'});}
  views.push({slug:slug||'startseite',width,scrollWidth:sw,violations});
 }
 if(errors.length||external.length||csp.length)throw Error(JSON.stringify({width,errors,external,csp}));
 if((await context.cookies()).length||await p.evaluate(()=>localStorage.length+sessionStorage.length))throw Error('Unerwarteter Speicher');await context.close();
}
const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});const p=await nojs.newPage();await p.goto('http://127.0.0.1:5280/');await expect(p.locator('#anfrageformular noscript p')).toContainText('Für das Formular benötigst du JavaScript');await nojs.close();
fs.writeFileSync(__dirname+'/browser-pruefung.json',JSON.stringify({actualApachePHP:true,views,externalRequestsBeforeConsent:0,cspViolations:0,browserErrors:0,noBrowserStorage:true,noJavaScriptContactAlternative:true},null,2));console.log(JSON.stringify({views:views.length,violations:0,cspErrors:0,externalRequests:0}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
