const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..'),cases=JSON.parse(fs.readFileSync(path.join(root,'seiten.json')));
const css=fs.readFileSync(path.join(root,'lot-craft.css'),'utf8'),js=fs.readFileSync(path.join(root,'craft.js'),'utf8');
function signature(){return JSON.stringify([...document.querySelectorAll('main button,main a[href],main input,main select,main textarea,[role=tab]')].map(el=>({tag:el.tagName,name:el.getAttribute('aria-label')||el.textContent?.trim().replace(/\s+/g,' '),id:el.id,href:el.getAttribute('href'),disabled:el.disabled,selected:el.getAttribute('aria-selected')})))}
async function render(b,entry,width,theme){
 const c=await b.newContext({viewport:{width,height:1000},locale:'de-AT',timezoneId:'Europe/Vienna',reducedMotion:'reduce'}),p=await c.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  if(theme==='dark')await c.addInitScript(()=>localStorage.setItem('senklot.darstellung','dunkel'));
  if(entry.auth)await p.route('**/tools/vorschau/AuthStub.tsx*',route=>route.fulfill({contentType:'text/javascript',body:`const value={user:null,company:null,loading:false,error:null,plattformAdmin:false,einblick:null,zweiterFaktor:${JSON.stringify(entry.auth==='mfa'?'pruefen':'keiner')},signIn:async()=>{},signOut:async()=>{},resetPassword:async()=>{},reloadCompany:async()=>{}};export function useAuth(){return value}export function AuthProvider({children}){return children}`}));
  await p.goto(`http://127.0.0.1:5221/tools/vorschau/?pfad=${encodeURIComponent(entry.route)}&rolle=${encodeURIComponent(entry.role)}`,{waitUntil:'networkidle'});
  if(entry.tab){const role=entry.name.startsWith('urlaub-')?'tab':'button';await p.getByRole(role,{name:entry.auth==='mfa'?new RegExp('Wiederherstellungscode'):entry.tab,exact:entry.auth!=='mfa'}).click({timeout:4500});}
  await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(120);
  if(entry.area){const selected=await p.getByRole('tab',{name:entry.area,exact:true}).getAttribute('aria-selected');if(selected!=='true')throw Error('Erwarteter Aktenreiter nicht aktiv: '+entry.area)}
  const before=await p.evaluate(signature);
  await p.addStyleTag({content:css});await p.addScriptTag({content:js});await p.waitForTimeout(50);
  const after=await p.evaluate(signature);
  const layout=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.textContent,theme:document.documentElement.dataset.theme||'light',buttonCount:document.querySelectorAll('[data-craft-button]').length}));
  const file=`${entry.name}-${width}${theme==='dark'?'-dunkel':''}.jpg`;
  await p.screenshot({path:path.join(root,'seiten',file),type:'jpeg',quality:80,fullPage:false});
  const axe=width===390?await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze():null;
  return{...entry,width,theme,file,...layout,controlsUnchanged:before===after,errors,violations:axe?.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};
 }catch(e){return{...entry,width,theme,error:String(e)}}finally{await c.close()}
}
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),result=[];
 for(const entry of cases){for(const width of[390,834,1440])result.push(await render(b,entry,width,'light'));console.log(entry.name);}
 for(const name of['start','wochenplan','mitarbeiter','kundenakte','rechnungen','plattform'])for(const width of[390,1440])result.push(await render(b,cases.find(c=>c.name===name),width,'dark'));
 await b.close();fs.writeFileSync(path.join(root,'seiten-pruefung.json'),JSON.stringify(result,null,2));
 const bad=result.filter(r=>r.error||r.errors?.length||r.controlsUnchanged===false||r.scrollWidth>r.width||r.violations?.length);
 console.log(JSON.stringify({count:result.length,bad}));
})().catch(e=>{console.error(e);process.exitCode=1});
