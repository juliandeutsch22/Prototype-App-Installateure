const fs=require('node:fs'),path=require('node:path');
const{chromium,expect}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),checks=[];
 const c=await b.newContext({viewport:{width:1760,height:1200},locale:'de-AT',reducedMotion:'reduce'}),p=await c.newPage();
 for(const mode of['mobil','desktop']){
  await p.goto('http://127.0.0.1:5220/ueberblick-'+mode+'.html');await p.evaluate(()=>document.fonts.ready);await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));await p.screenshot({path:path.join(root,'ueberblick-'+mode+'.jpg'),type:'jpeg',quality:90,fullPage:true});
 }
 for(const width of[390,1440]){
  await p.setViewportSize({width,height:1000});await p.goto('http://127.0.0.1:5220/index.html');await p.evaluate(()=>document.fonts.ready);
  await expect(p.locator('.shot:visible')).toHaveCount(303);await p.locator('#kind').selectOption('Seiten');await p.locator('#width').selectOption('390');await expect(p.locator('.shot:visible')).toHaveCount(75);await p.locator('#search').fill('Kundenakte');await expect(p.locator('.shot:visible')).toHaveCount(6);await p.locator('#reset').click();await expect(p.locator('.shot:visible')).toHaveCount(303);
  const axe=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();if(axe.violations.length)throw Error('Galerie axe '+JSON.stringify(axe.violations));
  const size=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(size.scrollWidth>width)throw Error('Galerie Überlauf');checks.push({gallery:true,...size,axeViolations:0});
 }
 await p.setViewportSize({width:390,height:1000});await p.goto('http://127.0.0.1:5220/vorschau.html?screen=firmendaten');
 const button=p.getByRole('button',{name:'Firmendaten speichern',exact:true}),before=await button.boundingBox();await button.click();await expect(p.getByRole('button',{name:'Gespeichert',exact:true})).toBeDisabled();const after=await p.getByRole('button',{name:'Gespeichert',exact:true}).boundingBox();if(Math.abs(before.width-after.width)>1)throw Error('Erfolgsbreite springt');checks.push({successWidth:{before:before.width,after:after.width}});
 await c.close();await b.close();fs.writeFileSync(path.join(root,'abschluss-pruefung.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
})().catch(e=>{console.error(e);process.exitCode=1});
