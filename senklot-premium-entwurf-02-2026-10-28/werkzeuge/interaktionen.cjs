const fs=require('node:fs'),path=require('node:path');
const{chromium,expect}=require('/workspace/Senklot-Audit-Basis-2026-10-28/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
(async()=>{
const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),checks=[],layout=[];
const c=await b.newContext({viewport:{width:390,height:1000},locale:'de-AT'}),p=await c.newPage();
await c.addInitScript(()=>{window.__hapticCalls=0;navigator.vibrate=()=>{window.__hapticCalls++;return false;}});
const go=s=>p.goto('http://127.0.0.1:5220/vorschau.html?screen='+s);
await go('firmendaten');
const original=await p.getByLabel('Firmenname',{exact:true}).inputValue();
await p.getByLabel('Firmenname',{exact:true}).fill('Erster gesendeter Stand');
const before=await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).boundingBox();
await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();
await expect(p.getByRole('button',{name:'Speichert …',exact:true})).toHaveAttribute('aria-busy','true');
const pending=await p.getByRole('button',{name:'Speichert …',exact:true}).boundingBox();
if(Math.abs(pending.width-before.width)>1)throw Error('Buttonbreite springt');
await p.evaluate(()=>{const form=document.querySelector('[data-form=company]');for(let i=0;i<20;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
if(await p.evaluate(()=>window.CraftDemo.state.saves)!==1)throw Error('Mehrfaches Absenden');
await p.getByLabel('Firmenname',{exact:true}).fill('Neue Eingabe während des Speicherns');
await expect(p.locator('.stateword')).toContainText('neue Änderungen noch offen');
await expect(p.locator('.stateword')).toContainText('weitere Änderungen noch offen',{timeout:2500});
await expect(p.getByLabel('Firmenname',{exact:true})).toHaveValue('Neue Eingabe während des Speicherns');
checks.push('Speichern: 20 weitere Submit-Ereignisse erzeugen keinen zweiten Modellaufruf; Buttonbreite stabil');
checks.push('Eingabe während laufendem Speichern bleibt als noch ungespeichert erkennbar');
await p.evaluate(()=>window.CraftDemo.openDialog());
for(let i=0;i<12;i++){await p.keyboard.press('Tab');if(!await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')))throw Error('Fokus verlässt Dialog')}
await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);checks.push('Dialog: Fokus bleibt im Fenster, Escape schließt und gibt Hintergrund frei');
await p.evaluate(()=>window.CraftDemo.openDialog());await p.getByRole('link',{name:'Änderungen verwerfen',exact:true}).click();
await expect(p.getByLabel('Firmenname',{exact:true})).toHaveValue('Erster gesendeter Stand');checks.push('Verwerfen stellt den im Modell bestätigten Stand wieder her');
await p.getByLabel('Firmenname',{exact:true}).fill('Nicht verlieren');await p.evaluate(()=>window.CraftDemo.setOutcome('error'));
await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();await expect(p.locator('.craft-save-error')).toBeVisible({timeout:2500});
await expect(p.getByLabel('Firmenname',{exact:true})).toHaveValue('Nicht verlieren');await expect(p.locator('form .craft-check')).toHaveCount(0);checks.push('Fehler: Eingaben erhalten, kein Erfolgssymbol, Aktion erneut erreichbar');
await p.evaluate(()=>window.CraftDemo.setOutcome('ok'));await p.getByRole('button',{name:'Firmendaten speichern',exact:true}).click();
await expect(p.getByRole('button',{name:'Gespeichert',exact:true})).toBeDisabled({timeout:2500});checks.push('Erfolg erscheint erst nach dem simulierten bestätigten Ergebnis');
await go('katalog-treffer');
await p.getByRole('button',{name:'Übernehmen',exact:true}).first().click();await expect(p.locator('[data-selection-live]')).toContainText('übernommen');
await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('Kupferrohr');await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('fehler');
await expect(p.locator('[data-search-results] [role=alert]')).toBeVisible({timeout:2000});await expect(p.getByRole('button',{name:'Übernehmen',exact:true})).toHaveCount(0);checks.push('Neue Suche: alte Treffer sofort weg; überholte Antwort wird nicht angezeigt; Übernahmebestätigung bleibt erhalten');
await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('CU-22-H');await expect(p.getByRole('button',{name:'Übernehmen',exact:true})).toHaveCount(1,{timeout:2000});checks.push('Trefferzahl gehört zur aktuellen Suche, Artikelnummer findet genau den passenden Artikel');
await p.getByLabel('Name, Artikelnummer oder Kategorie').fill('zzzz');await expect(p.getByRole('button',{name:'Suche zurücksetzen',exact:true})).toBeVisible({timeout:2000});await p.getByRole('button',{name:'Suche zurücksetzen',exact:true}).click();await expect(p.getByLabel('Name, Artikelnummer oder Kategorie')).toHaveValue('');checks.push('Keine Treffer und Zurücksetzen erhalten den Suchkontext');
await p.getByRole('link',{name:'Fertig',exact:true}).click();await expect(p.locator('h1')).toHaveText('Angebot bearbeiten');checks.push('Katalog schließen führt zurück ins Angebot');
await go('firmendaten');for(let i=0;i<8;i++){await p.evaluate(()=>window.CraftDemo.openDialog());await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);}checks.push('Acht schnelle Öffnen-/Schließen-Folgen hinterlassen keinen Dialog oder inerten Hintergrund');
await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>window.CraftDemo.openDialog());await p.waitForTimeout(50);
if(await p.getByRole('dialog').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length))throw Error('Bewegung trotz Reduce');await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);checks.push('Reduzierte Bewegung: keine laufende Dialoganimation, vollständige Bedienung');
if(await p.evaluate(()=>window.__hapticCalls)!==0)throw Error('Unerwartete Vibration');checks.push('Kein Vibration-Aufruf; kein taktiles Erfolgsversprechen');
await c.close();
const cases=JSON.parse(fs.readFileSync(path.join(root,'szenarien.json'))).filter(x=>x.id!=='bausteine');
for(const width of[320,375,430,1112]){
 const c=await b.newContext({viewport:{width,height:width===1112?834:1000},locale:'de-AT',reducedMotion:'reduce'}),p=await c.newPage();
 for(const {id}of cases){const screen=id.startsWith('firma-')&&['firma-speichert','firma-fehler'].includes(id)?'firmendaten':id;await p.goto(`http://127.0.0.1:5220/vorschau.html?screen=${screen}`);await p.evaluate(()=>document.fonts.ready);const m=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));layout.push({state:id,...m});if(m.scrollWidth>width)throw Error('Überlauf '+id+' '+width)}
 await c.close();
}
await b.close();fs.writeFileSync(path.join(root,'interaktionen-pruefung.json'),JSON.stringify({checks,layout,scope:'Eigenständiges Designmodell. Keine Produktionsschreibtests und kein Hardwaretest.'},null,2));console.log(JSON.stringify({checks:checks.length,layout:layout.length,ok:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
