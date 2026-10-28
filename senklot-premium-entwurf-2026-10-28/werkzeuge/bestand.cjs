const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const AxeBuilder = require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@axe-core/playwright').default;
const root = path.resolve(__dirname, '..');
const routes = [
 ['start','/','Administrator'],['start-monteur','/','Mitarbeiter'],['start-buchhaltung','/','Buchhaltung'],
 ['zeit','/time','Mitarbeiter'],['material','/material','Mitarbeiter'],['anforderungen','/anforderungen','Verwaltung'],['lager','/lager','Verwaltung'],
 ['eigener-plan','/my-schedule/mein','Mitarbeiter'],['teamplan','/my-schedule/team','Mitarbeiter'],['meine-baustellen','/my-projects','Mitarbeiter'],
 ['urlaub','/vacations','Administrator'],['sonderurlaub','/sonderurlaub','Administrator'],
 ['scheine','/worksheets','Administrator'],['schein-neu','/worksheet','Mitarbeiter'],
 ['angebote','/quotes','Administrator'],['angebotsakte','/quotes/q1','Administrator'],
 ['kunden','/customers','Administrator'],['kundenakte','/customers/k1','Administrator'],['wartungen','/wartungen','Administrator'],
 ['baustellen','/admin-projects','Administrator'],['baustellenakte','/admin-projects/p1','Administrator'],
 ['wochenplan','/assignments/woche','Projektleiter'],['tagesplan','/assignments/tag','Projektleiter'],
 ['benutzer','/user-mgmt','Administrator'],['benutzerakte','/user-mgmt/u1','Administrator'],
 ['konto','/settings/meldungen','Mitarbeiter'],['einstellungen','/settings/uebersicht','Administrator'],
 ['firmendaten','/settings/firma','Administrator'],['saetze','/settings/saetze','Administrator'],['rechnungsvorgaben','/settings/rechnung','Buchhaltung'],
 ['nummern','/settings/nummern','Administrator'],['personal','/settings/personal','Administrator'],['konten','/settings/konten','Buchhaltung'],
 ['support','/settings/support','Administrator'],['module','/settings/module','Administrator'],['sicherung','/settings/sicherung','Administrator'],
 ['kalkulation','/costing','Administrator'],['rechnungen','/invoices','Buchhaltung'],['mitarbeiter','/accounting','Buchhaltung'],
 ['impressum','/impressum','Administrator'],['datenschutz','/datenschutz','Administrator'],['plattform','/plattform','Plattformadministrator']
];
async function main(){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
 const results=[];
 for (const [name,route,role] of routes){
  for (const width of [390,834,1440]) {
   const context=await browser.newContext({viewport:{width,height:1000},locale:'de-AT',timezoneId:'Europe/Vienna'});
   const p=await context.newPage();
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   try {
    await p.goto(`http://127.0.0.1:5218/tools/vorschau/?pfad=${encodeURIComponent(route)}&rolle=${encodeURIComponent(role)}`,{waitUntil:'networkidle'});
    await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);
    const measurement=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.textContent,dialogs:document.querySelectorAll('[role=dialog]').length}));
    await p.screenshot({path:path.join(root,'bestand',`${name}-${width}.jpg`),type:'jpeg',quality:78,fullPage:false});
    const axe=width===390?await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze():null;
    results.push({name,route,role,width,...measurement,errors,violations:axe?.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
   }catch(e){results.push({name,route,role,width,failure:String(e)})}
   await context.close();
  }
  console.log(name);
 }
 await browser.close();fs.writeFileSync(path.join(root,'bestand-pruefung.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({screens:results.length,overflow:results.filter(r=>r.scrollWidth>r.width),runtimeErrors:results.filter(r=>r.errors?.length||r.failure),axe:results.filter(r=>r.violations?.length).map(r=>({name:r.name,violations:r.violations}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
