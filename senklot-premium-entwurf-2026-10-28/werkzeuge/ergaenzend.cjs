const fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const states=JSON.parse(fs.readFileSync(path.join(root,'szenarien.json')));
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),layout=[],interactions=[];
 for(const width of[320,375,430,1112]){
  const c=await b.newContext({viewport:{width,height:width===1112?834:900},reducedMotion:'reduce'}),p=await c.newPage();
  for(const {id}of states){await p.goto(`http://127.0.0.1:5219/vorschau.html?screen=${id}`);await p.evaluate(()=>document.fonts.ready);const m=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));layout.push({state:id,...m});if(m.scrollWidth>width)throw Error('Überlauf '+id+' '+width)}
  await c.close();
 }
 const c=await b.newContext({viewport:{width:390,height:1000},locale:'de-AT',reducedMotion:'reduce'}),p=await c.newPage();
 const go=s=>p.goto(`http://127.0.0.1:5219/vorschau.html?screen=${s}`);
 await go('firmendaten');
 const save=p.getByRole('button',{name:'Firmendaten speichern',exact:true});
 await expect(save).toBeInViewport();
 await p.getByLabel('Firmenname',{exact:true}).fill('Leitner Haustechnik GmbH · geändert');
 await save.click();await expect(p.locator('.stateword')).toContainText('Gespeichert');
 await expect(p.getByRole('button',{name:'Firmendaten speichern',exact:true})).toBeDisabled();
 interactions.push('Speichern-Simulation: sichtbare mobile Aktion, bestätigter Zustand, kein aktives erneutes Speichern');
 await go('verlassen');
 for(let i=0;i<9;i++){await p.keyboard.press('Tab');if(!await p.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')))throw Error('Fokus verlässt Dialog')}
 await p.keyboard.press('Escape');await expect(p.locator('.stateword')).toContainText('Nicht gespeicherte');
 interactions.push('Verlassen-Rückfrage: Tab bleibt im Dialog, Escape führt zum Bearbeiten');
 await go('katalog');
 for(let i=0;i<8;i++){await p.keyboard.press('Tab');if(!await p.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')))throw Error('Fokus verlässt Katalog')}
 const animation=await p.locator('.spinner').evaluate(el=>getComputedStyle(el).animationName);
 if(animation!=='none')throw Error('Reduzierte Bewegung nicht berücksichtigt');
 await p.getByRole('link',{name:'Fertig',exact:true}).click();await expect(p.locator('h1')).toHaveText('Angebot bearbeiten');await expect(p.getByRole('dialog')).toHaveCount(0);
 interactions.push('Katalog: Fokus bleibt im Fenster, reduzierte Bewegung respektiert, Fertig bleibt im Angebot');
 await go('rechnung-pdf');await p.getByRole('button',{name:'PDF erneut laden',exact:true}).click();await expect(p.getByRole('button',{name:'PDF wird vorbereitet …'})).toBeDisabled();await expect(p.locator('.toast')).toContainText('Designsimulation');
 await p.getByRole('link',{name:'Rechnung öffnen',exact:true}).click();await expect(p.getByRole('dialog')).toContainText('RE-2026-0142');
 interactions.push('PDF-Simulation: laufende Aktion gesperrt, Rückmeldung, vorhandene Rechnung im Detail');
 await go('rechnung-unklar');await p.getByRole('button',{name:'Status prüfen',exact:true}).click();await expect(p.getByRole('button',{name:'Stand wird geprüft …'})).toBeDisabled();await expect(p.locator('h2').first()).toContainText('Rechnung RE-2026-0142 wurde erstellt');
 interactions.push('Statusabgleich nur simuliert: eindeutige Ladephase und gefundener bestehender Beleg; kein Backendbeweis');
 await go('buchung-abgelehnt');await p.getByRole('button',{name:'Gelesen',exact:true}).click();await expect(p.locator('.message')).toHaveCount(0);
 interactions.push('Wichtige Fehlermeldung: bewusst bestätigen');
 const long=[];
 for(const width of[320,834])for(const state of['rechnungen','firmendaten']){
  await p.setViewportSize({width,height:1000});await go(state);await p.locator('h1').evaluate(el=>el.textContent='Wohnungseigentümergemeinschaft Hauptstraße 112–118 · sehr langer Beispielname für den Umbruch');
  const m=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));long.push({state,...m});if(m.scrollWidth>width)throw Error('Langer Name läuft über')
 }
 await c.close();await b.close();const report={layoutCases:layout.length,layout,longTextCases:long,prototypeInteractions:interactions.length,interactions,scope:'Nur eigenständige Designvorschau. Keine Aussage über reale Server-, PDF- oder Speicherfunktion.'};fs.writeFileSync(path.join(root,'ergaenzende-pruefung.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({layoutCases:layout.length,longTextCases:long.length,prototypeInteractions:interactions.length,ok:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
