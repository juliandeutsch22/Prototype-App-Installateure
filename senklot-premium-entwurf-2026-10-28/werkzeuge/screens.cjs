const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..');
const states=['firma-teilerfolg','rechnungen','rechnung-pdf','rechnung-unklar','rechnung-pruefen','rechnung-fehler','firmendaten','verlassen','gespeichert','katalog','katalog-fehler','material-offline','zeit-vorgemerkt','buchung-abgelehnt','berechtigung','leer'];
async function main(){
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),result=[];
 const cases=states.flatMap(screen=>[390,834,1440].map(width=>({screen,width,theme:'light'})));
 cases.push(...['rechnung-pdf','verlassen','katalog','buchung-abgelehnt'].flatMap(screen=>[390,1440].map(width=>({screen,width,theme:'dark'}))));
 for(const {screen,width,theme} of cases){
  const c=await b.newContext({viewport:{width,height:width>=760?1120:1000},locale:'de-AT',timezoneId:'Europe/Vienna',reducedMotion:'reduce'});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:5219/vorschau.html?screen=${screen}&theme=${theme}`);
  await p.evaluate(()=>document.fonts.ready);
  const m=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,mainWidth:document.querySelector('main').getBoundingClientRect().width}));
  const axe=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  const file=`${screen}-${width}${theme==='dark'?'-dunkel':''}.jpg`;
  await p.screenshot({path:path.join(root,'screens',file),type:'jpeg',quality:88,fullPage:false});
  result.push({screen,width,theme,file,...m,errors,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  await c.close();console.log(file);
 }
 await b.close();fs.writeFileSync(path.join(root,'entwurf-pruefung.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({count:result.length,overflow:result.filter(r=>r.scrollWidth>r.width),errors:result.filter(r=>r.errors.length),axe:result.filter(r=>r.violations.length)}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
