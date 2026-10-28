const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..');
const cases=[
 ['planung-monat','/assignments/woche?ansicht=monat','Projektleiter'],
 ['mitarbeiter-woche','/accounting?ansicht=woche','Buchhaltung'],
 ['mitarbeiter-tage','/accounting?tage=alle','Buchhaltung'],
 ['lager-katalog','/lager?reiter=katalog','Administrator'],['lager-import','/lager?reiter=import','Administrator'],
 ['anforderungen-einkauf','/anforderungen?reiter=einkauf','Verwaltung'],
 ['anforderungen-retouren','/anforderungen?reiter=retouren','Verwaltung'],
 ['anforderungen-erledigt','/anforderungen?reiter=erledigt','Verwaltung'],
 ['plattform-support','/plattform','Plattformadministrator','Supportzugänge'],
 ['plattform-fehler','/plattform','Plattformadministrator','Fehlerprotokoll'],
 ['plattform-zins','/plattform','Plattformadministrator','Basiszinssatz'],
 ['plattform-konto','/plattform','Plattformadministrator','Mein Konto'],
 ['urlaub-krank','/vacations','Administrator','Krankenstände'],
 ['urlaub-betrieb','/vacations','Administrator','Betriebsurlaub'],
];
(async()=>{
const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),results=[];
for(const[name,route,role,tab]of cases)for(const width of[390,834,1440]){
 const c=await b.newContext({viewport:{width,height:1000},locale:'de-AT',timezoneId:'Europe/Vienna'}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(`http://127.0.0.1:5218/tools/vorschau/?pfad=${encodeURIComponent(route)}&rolle=${encodeURIComponent(role)}`,{waitUntil:'networkidle'});
  if(tab)await p.getByRole(tab.startsWith('Kranken')||tab==='Betriebsurlaub'?'tab':'button',{name:tab,exact:true}).click({timeout:3500});
  await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(180);
  const m=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.textContent,activeTabs:[...document.querySelectorAll('[aria-selected=true],[aria-current=page]')].map(e=>e.textContent)}));
  await p.screenshot({path:path.join(root,'bestand',`${name}-${width}.jpg`),type:'jpeg',quality:78});
  const axe=width===390?await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze():null;
  results.push({name,route,role,tab,width,...m,errors,violations:axe?.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
 }catch(e){results.push({name,width,error:String(e)})}
 await c.close();console.log(name,width);
}
await b.close();fs.writeFileSync(path.join(root,'weitere-referenzen.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({count:results.length,fail:results.filter(r=>r.error||r.errors?.length||r.scrollWidth>r.width||r.violations?.length)}));
})().catch(e=>{console.error(e);process.exitCode=1});
