const fs=require('node:fs'),path=require('node:path');
const{chromium}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..');
const states=JSON.parse(fs.readFileSync(path.join(__dirname,'basis-szenarien.json')));
states.push(
 {id:'baustellen-leer',title:'Erste Baustelle · Lot-Zeichnung',finding:'C04',description:'Eine kleine statische Zeichnung nur beim Einstieg; eindeutige nächste Aktion.'},
 {id:'angebote-leer',title:'Erstes Angebot · dieselbe Bildsprache',finding:'C04',description:'Gleiche Konstruktion, Strichführung, Größe und Abstände wie bei den Baustellen.'},
 {id:'filter-leer',title:'Filter ohne passende Ergebnisse',finding:'C04',description:'Keine Illustration; ein verständlicher Weg zurück zum Bestand.'},
 {id:'zeitraum-leer',title:'Zeitraum ohne Buchungen',finding:'C04',description:'Der Zeitraum bleibt sichtbar. Leerer Bestand und Fehler werden getrennt.'},
 {id:'katalog-treffer',title:'Katalogtreffer und Übernahme',finding:'C03',description:'Aktueller Suchlauf, lesbare Ergebnisse und direkte Bestätigung der Übernahme.'},
 {id:'firma-speichert',title:'Speichert · Eingaben bleiben erhalten',finding:'C01',description:'Unmittelbare Rückmeldung, stabile Buttonbreite und Schutz vor wiederholtem Absenden.'},
 {id:'firma-fehler',title:'Speicherfehler · wieder sicher fortfahren',finding:'C01',description:'Gleiche Aktion, erhaltene Werte, konkrete Fehlerrückmeldung. Keine falsche Erfolgsanimation.'},
 {id:'bausteine',title:'Gemeinsame Bausteine und Icons',finding:'C01 / C05',description:'Gestaltungsfläche zur Durchsicht der gemeinsamen Zustände; keine neue Seite der App.'}
);
fs.writeFileSync(path.join(root,'szenarien.json'),JSON.stringify(states,null,2));
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),results=[];
 const shots=states.flatMap(s=>[390,834,1440].map(width=>({state:s.id,width,theme:'light'})));
 for(const state of['rechnung-pdf','verlassen','katalog','buchung-abgelehnt','baustellen-leer','bausteine'])for(const width of[390,1440])shots.push({state,width,theme:'dark'});
 for(const entry of shots){
  const c=await b.newContext({viewport:{width:entry.width,height:entry.width>=760?1120:1000},locale:'de-AT',timezoneId:'Europe/Vienna',reducedMotion:'reduce'}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   const company=entry.state.startsWith('firma-')&&['firma-speichert','firma-fehler'].includes(entry.state);
   const page=entry.state==='bausteine'?'werkstatt.html':`vorschau.html?screen=${company?'firmendaten':entry.state}&theme=${entry.theme}${entry.state==='firma-fehler'?'&outcome=error':entry.state==='firma-speichert'?'&lag=15000':''}`;
   await p.goto('http://127.0.0.1:5220/'+page+(entry.state==='bausteine'?'?theme='+entry.theme:''));await p.evaluate(()=>document.fonts.ready);
   if(company){await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();await p.waitForTimeout(entry.state==='firma-fehler'?1150:180)}else await p.waitForTimeout(240);
   if(['baustellen-leer','angebote-leer','filter-leer','zeitraum-leer'].includes(entry.state)){
    if(await p.getByRole('dialog').count())throw Error('Ein Leerzustand darf nicht hinter einem Dialog liegen');
    if(!await p.locator('.craft-empty').isVisible())throw Error('Erwarteter kontextbezogener Leerzustand fehlt');
   }
   if(entry.state==='firma-speichert'&&!await p.getByRole('button',{name:'Speichert …',exact:true}).isDisabled())throw Error('Laufender Speicherzustand nicht eindeutig');
   const layout=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
   const axe=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   const file=`${entry.state}-${entry.width}${entry.theme==='dark'?'-dunkel':''}.jpg`;
   await p.screenshot({path:path.join(root,'screens',file),type:'jpeg',quality:87,fullPage:entry.state==='bausteine'});
   results.push({...entry,file,...layout,errors,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  }catch(e){results.push({...entry,error:String(e)})}finally{await c.close()}
  console.log(entry.state,entry.width,entry.theme);
 }
 await b.close();fs.writeFileSync(path.join(root,'zustaende-pruefung.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({count:results.length,bad:results.filter(r=>r.error||r.errors?.length||r.scrollWidth>r.width||r.violations?.length)}));
})().catch(e=>{console.error(e);process.exitCode=1});
