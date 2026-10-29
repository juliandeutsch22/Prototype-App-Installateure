const fs=require('node:fs'),path=require('node:path');
const motifs=JSON.parse(fs.readFileSync(path.join(__dirname,'motive.json')));
const css=fs.readFileSync(path.join(__dirname,'entwurf.css'),'utf8');

module.exports=async function decorate(page,entry){
 await page.addStyleTag({content:css});
 return page.evaluate(({entry,motifs})=>{
  const drawing=(name,kind)=>{const d=document.createElement('div');d.className='entwurf-zeichnung '+kind;d.dataset.entwurfMotiv=name;d.setAttribute('aria-hidden','true');d.innerHTML=motifs[name];return d;};
  const result={header:false,empty:false,onboarding:false,notes:[]};
  if(entry.motif){
   const header=document.querySelector('.seitenkopf-rechts');
   if(header){header.prepend(drawing(entry.motif,'entwurf-kopfzeichnung'));result.header=true;}
  }
  if(entry.emptyMotif){
   const root=document.querySelector('main')||document.body;
   let holder=root.querySelector('.lot-erstnutzung,.start-leer');
   if(!holder){
    const candidates=[...root.querySelectorAll('div,section')].filter(e=>/^(Noch keine|Keine |Noch kein|Nichts |Für diese|Zu dieser|In dieser|In den nächsten 30 Tagen|Aktuell keine|Es gibt |Hier gibt|Kein |Heute )/.test(e.innerText?.trim()||'')&&e.children.length<7&&e.innerText.length<620&&e.querySelector('p'));
    holder=candidates.filter(e=>!candidates.some(c=>c!==e&&e.contains(c))).sort((a,b)=>a.innerText.length-b.innerText.length)[0];
   }
   if(holder){
    holder.querySelectorAll('.lot-leerzeichnung').forEach(e=>e.remove());
    holder.classList.add('entwurf-leerbereich');
    holder.prepend(drawing(entry.emptyMotif,'entwurf-leerzeichnung'));
    result.empty=true;result.emptyText=holder.innerText;
   }else result.notes.push('Kein tatsächlicher Leerbereich gefunden');
  }
  if(entry.action==='einrichtung'){
   const form=document.querySelector('main form')||document.querySelector('main .karte');
   if(form){const hint=document.createElement('div');hint.className='entwurf-einrichtung';hint.append(drawing('einrichtung',''));const p=document.createElement('p');p.innerHTML='<b>Deine Firma auf jedem Beleg.</b>Prüfe die Angaben für Angebote und Rechnungen.';hint.append(p);form.prepend(hint);result.onboarding=true;}
  }
  return result;
 },{entry,motifs});
};
