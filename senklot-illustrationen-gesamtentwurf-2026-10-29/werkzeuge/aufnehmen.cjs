const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/workspace/Senklot-Premium-Umsetzung/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Premium-Umsetzung/node_modules/@axe-core/playwright').default;
const decorate=require('./dekorieren.cjs');
const root=path.resolve(__dirname,'..'),cases=JSON.parse(fs.readFileSync(path.join(root,'seiten.json')));
const base='http://127.0.0.1:5232/tools/vorschau/';
const arg=process.argv[2]||'alle';
const widths=process.env.BREITEN?process.env.BREITEN.split(',').map(Number):[390,834,1440];
const fingerprint=()=>({text:(document.querySelector('main')||document.body).innerText,controls:document.querySelectorAll('a,button,input,select,textarea').length,h1:document.querySelector('h1')?.textContent,scrollWidth:document.documentElement.scrollWidth,h1Height:document.querySelector('h1')?.getBoundingClientRect().height});

async function render(browser,entry,width,theme){
 const context=await browser.newContext({viewport:{width,height:width===390?844:width===834?1112:1000},locale:'de-AT',timezoneId:'Europe/Vienna',reducedMotion:'reduce',colorScheme:theme==='dark'?'dark':'light'});
 const page=await context.newPage(),errors=[],responses=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:5232')&&r.status()>=400)responses.push({url:r.url(),status:r.status()});});
 const row={name:entry.name,title:entry.title,route:entry.route,role:entry.role,group:entry.group,state:!!entry.state,width,theme,decision:entry.decision};
 try{
  await page.clock.setFixedTime(new Date('2026-10-29T09:30:00+01:00'));
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  if(theme==='dark')await context.addInitScript(()=>localStorage.setItem('senklot.darstellung','dunkel'));
  if(entry.auth)await page.route('**/tools/vorschau/AuthStub.tsx*',route=>route.fulfill({contentType:'text/javascript',body:`const value={user:null,company:null,loading:false,error:null,plattformAdmin:false,einblick:null,zweiterFaktor:${JSON.stringify(entry.auth==='mfa'?'pruefen':'keiner')},signIn:async()=>{},signOut:async()=>{},resetPassword:async()=>{},reloadCompany:async()=>{}};export function useAuth(){return value}export function AuthProvider({children}){return children}`}));
  if(entry.extraAuth)await page.route('**/tools/vorschau/AuthStub.tsx*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace("role: ROLLE,","role: ROLLE, rechnungenLesen: true,")});});
  if(entry.fixture)await page.route('**/tools/vorschau/daten.ts*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+`\n${entry.fixture}.splice(0);`});});
  if(entry.name==='plattform-sitzung')await page.route('**/src/features/plattform/PlattformView.tsx*',async route=>{
   const r=await route.fetch();let body=await r.text();
   body=body.replace(/(const \[angelegt, setAngelegt\] = useState)\(\[\]\)/,'$1([{companyId:"entwurf-betrieb",name:"Beispielbetrieb · Designvorschau",adminEmail:"admin@beispiel.invalid",passwortLink:"https://beispiel.invalid/nur-entwurf"}])');
   await route.fulfill({response:r,body});
  });
  if(entry.action==='ruhig'||entry.action==='ladefehler')await page.route('**/src/features/dashboard/start/laden.ts*',async route=>{
   const r=await route.fetch();let body=await r.text();
   if(entry.action==='ruhig')body+='\npersoenlich=async()=>({hatEintritt:true,fehlendeTage:[],nachtraege:[],eigeneOrders:[],heuteEigene:[]});lager=async()=>({orders:[],lagerPosten:[],knapp:[]});buchhaltung=async()=>({unbezahlt:[],unverrechnet:[],offeneStunden:[]});team=async()=>({antraege:[],freistellungen:[],team:[]});leitung=async()=>({heuteBetrieb:[],abwesendHeute:[],ohneEinsatz:[],budget:[],wartungen:[]});einstellungen=async()=>({firmaFehlt:[],firmaSperrt:[],kontenFehlen:false,lehrzeitEnden:[]});';
   else body+='\nteam=async()=>{throw new Error("Designvorschau: Teamdaten nicht geladen")};';
   await route.fulfill({response:r,body});
  });
  await page.goto(`${base}?pfad=${encodeURIComponent(entry.route)}&rolle=${encodeURIComponent(entry.role)}`,{waitUntil:'networkidle',timeout:25000});
  if(entry.tab){const role=entry.name.startsWith('urlaub-')?'tab':'button';await page.getByRole(role,{name:entry.auth==='mfa'?/Wiederherstellungscode/:entry.tab,exact:entry.auth!=='mfa'}).click({timeout:5000});}
  if(entry.open)await page.getByRole('button',{name:entry.open,exact:true}).first().click({timeout:5000});
  if(entry.action==='invoice'||entry.action==='betrieb')await page.locator('main button.zeile-ziel').first().click({timeout:5000});
  if(entry.action==='person')await page.locator('main .ue-person').first().click({timeout:5000});
  if(['projekt-edit','kunde-edit','benutzer-edit'].includes(entry.action))await page.getByRole('button',{name:'Bearbeiten',exact:true}).first().click({timeout:5000});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(180);
  if(entry.area&&await page.getByRole('tab',{name:entry.area,exact:true}).getAttribute('aria-selected')!=='true')throw Error('Aktenreiter nicht aktiv: '+entry.area);
  if(entry.action==='ruhig'&&await page.locator('.start-leer').count()!==1)throw Error('Aufgaben sind nicht leer');
  if(entry.action==='ladefehler'&&!await page.getByText(/Nicht geladen:/).isVisible())throw Error('Warnung fehlt');
  const before=await page.evaluate(fingerprint);
  row.decoration=await decorate(page,entry);
  await page.evaluate(()=>window.scrollTo(0,0));
  const after=await page.evaluate(fingerprint);
  row.before=before;row.after=after;
  row.controlsUnchanged=before.controls===after.controls;
  row.copyUnchanged=entry.action==='einrichtung'||before.text===after.text;
  row.headerTitleUnchanged=before.h1===after.h1;
  if(!row.controlsUnchanged||!row.copyUnchanged||!row.headerTitleUnchanged)throw Error('Unbeabsichtigte Änderung von Inhalt oder Bedienelementen');
  if(after.scrollWidth>width)throw Error('Horizontaler Dokumentüberlauf: '+after.scrollWidth);
  row.height=await page.evaluate(()=>document.documentElement.scrollHeight);
  row.file=`${entry.name}-${width}${theme==='dark'?'-dunkel':''}.jpg`;
  await page.screenshot({path:path.join(root,'seiten',row.file),type:'jpeg',quality:86,fullPage:false});
  row.fullFile=row.file.replace('.jpg','-gesamt.jpg');
  await page.screenshot({path:path.join(root,'seiten',row.fullFile),type:'jpeg',quality:82,fullPage:true});
  // Mobile Ansichten werden zusätzlich auf häufige a11y-Probleme geprüft.
  if(width===390){const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();row.violations=axe.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));}
 }catch(e){row.error=String(e);row.visible=await page.locator('body').innerText().catch(()=>'');}
 finally{row.errors=errors;row.failedResponses=responses;await context.close();}
 return row;
}

(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'}),results=[];
 const selected=arg==='alle'?cases:cases.filter(c=>arg.split(',').includes(c.name));
 if(!selected.length)throw Error('Keine Ansichten gewählt');
 // Kleine unabhängige Browserkontexte, maximal drei gleichzeitig.
 for(const entry of selected){
  const rows=await Promise.all(widths.map(w=>render(browser,entry,w,process.env.NUR_DUNKEL?'dark':'light')));results.push(...rows);
  fs.writeFileSync(path.join(root,process.env.BERICHT||`pruefung-${arg==='alle'?'seiten':'auswahl'}.json`),JSON.stringify(results,null,2));
  console.log(JSON.stringify({name:entry.name,count:rows.length,bad:rows.filter(r=>r.error||r.errors.length||r.failedResponses.length||r.violations?.length).map(r=>({width:r.width,error:r.error,errors:r.errors,violations:r.violations,decoration:r.decoration})),decoration:rows[0].decoration}));
 }
 if(arg==='alle'){
  for(const name of ['start','wochenplan','mitarbeiter','kundenakte','rechnungen','plattform','kunden-erstnutzung','start-ruhig','firma-einrichtung']){
   const entry=cases.find(c=>c.name===name);
   for(const width of [390,1440]){const row=await render(browser,entry,width,'dark');results.push(row);console.log(JSON.stringify({name,width,theme:'dark',error:row.error,violations:row.violations}));}
  }
  fs.writeFileSync(path.join(root,'pruefung-seiten.json'),JSON.stringify(results,null,2));
 }
 await browser.close();
 console.log(JSON.stringify({total:results.length,failed:results.filter(r=>r.error||r.errors.length||r.failedResponses.length).map(r=>({name:r.name,width:r.width,error:r.error,errors:r.errors})),axe:results.filter(r=>r.violations?.length).map(r=>({name:r.name,width:r.width,violations:r.violations}))}));
})().catch(e=>{console.error(e);process.exit(1)});
