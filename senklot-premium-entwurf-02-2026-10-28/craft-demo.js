'use strict';
// Asynchrones Designmodell. Ergebnisse unten sind ausdrücklich simuliert.
// Es gibt keine Datenbankaufrufe, keine Vibration und kein dauerhaftes Speichern.
const C=window.LotCraft;
const demo={pending:false,revision:0,saves:0,outcome:params.get('outcome')||'ok',search:0,selected:0,latency:Math.max(0,Math.min(60000,Number(params.get('lag'))||1050))};
let confirmedValues=new Map([...document.querySelectorAll('[data-form=company] input')].map(el=>[el.id,el.value]));
window.CraftDemo={state:demo,setOutcome:v=>demo.outcome=v,openDialog:()=>openLeaveDialog()};
const check=`<svg class="craft-check" viewBox="0 0 24 24" aria-hidden="true"><path d="${window.SENKLOT_ICONS.haken}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function responseDelay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function buttonLabel(el,content){
 if(!el.dataset.craftWidth)el.dataset.craftWidth=String(Math.ceil(el.getBoundingClientRect().width));
 el.style.minWidth=el.dataset.craftWidth+'px';
 el.innerHTML='<span class="btn-content">'+content+'</span>';
}
function formStatus(form,text){const s=form.querySelector('.stateword');s.textContent=text;C.animate(s,[{opacity:.3},{opacity:1}],160)}
function keepDiscardSpace(form){
 const old=form.querySelector('.formfoot .ghost');
 if(old){const space=document.createElement('span');space.className='craft-discard-space';space.setAttribute('aria-hidden','true');space.style.width=Math.ceil(old.getBoundingClientRect().width)+'px';old.replaceWith(space);}
 else if(!form.querySelector('.craft-discard-space')){const space=document.createElement('span');space.className='craft-discard-space';space.setAttribute('aria-hidden','true');form.querySelector('.formfoot .actions').prepend(space);}
}
function ensureDiscard(form){
 if(form.querySelector('.formfoot .ghost'))return;
 const box=document.createElement('div');box.innerHTML=btn('Verwerfen','gespeichert','ghost');const link=box.firstElementChild;
 const space=form.querySelector('.craft-discard-space');if(space)space.replaceWith(link);else form.querySelector('.formfoot .actions').prepend(link);C.mark(form);
}
async function saveCompany(form){
 if(demo.pending)return;
 demo.pending=true;demo.saves++;const sentRevision=demo.revision;
 const sentValues=new Map([...form.querySelectorAll('input')].map(el=>[el.id,el.value]));
 const button=form.querySelector('[type=submit]');
 button.removeAttribute('data-craft-state');
 button.disabled=true;button.setAttribute('aria-busy','true');
 form.querySelector('.formfoot .ghost')?.setAttribute('aria-disabled','true');
 buttonLabel(button,'<span class="spinner" aria-hidden="true"></span>Speichert …');
 formStatus(form,'Änderungen werden gespeichert …');
 form.querySelector('.craft-save-error')?.remove();
 // Nur zur Sichtbarkeit der asynchronen Designvorschau. Im Produkt keine künstliche Mindestwartezeit.
 const outcome=demo.outcome;await responseDelay(demo.latency);
 demo.pending=false;button.removeAttribute('aria-busy');
 form.querySelector('.formfoot .ghost')?.removeAttribute('aria-disabled');
 if(outcome==='error'){
  button.disabled=false;buttonLabel(button,'Firmendaten speichern');formStatus(form,'Nicht gespeicherte Änderungen');
  const error=document.createElement('p');error.className='craft-save-error error';error.id='craft-save-error';error.setAttribute('role','alert');
  error.textContent='Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.';
  form.querySelector('.formfoot').prepend(error);button.setAttribute('aria-describedby',error.id);
 }else if(demo.revision!==sentRevision){
  confirmedValues=sentValues;
  button.disabled=false;buttonLabel(button,'Firmendaten speichern');formStatus(form,'Vorheriger Stand gespeichert · weitere Änderungen noch offen');
 }else{
  confirmedValues=sentValues;
  button.disabled=true;button.dataset.craftState='success';button.removeAttribute('aria-describedby');buttonLabel(button,check+'Gespeichert');formStatus(form,'Gespeichert · heute, 10:18 Uhr');
  keepDiscardSpace(form);
 }
}
document.addEventListener('submit',e=>{
 if(!e.target.matches('[data-form=company]'))return;
 e.preventDefault();e.stopImmediatePropagation();saveCompany(e.target);
},true);
document.addEventListener('input',e=>{
 const form=e.target.closest('[data-form=company]');
 if(!form)return;demo.revision++;
 form.querySelector('.craft-save-error')?.remove();
 const button=form.querySelector('[type=submit]');button.removeAttribute('aria-describedby');
 button.removeAttribute('data-craft-state');
 ensureDiscard(form);
 if(demo.pending){formStatus(form,'Speichert bisherigen Stand · neue Änderungen noch offen');return;}
 button.disabled=false;buttonLabel(button,'Firmendaten speichern');formStatus(form,'Nicht gespeicherte Änderungen');
});

function plumbMotif(kind='project'){
 const paper=kind==='quote';
 return `<svg class="craft-empty-motif" viewBox="0 0 148 100" aria-hidden="true"><g class="construction">${paper?'<path d="M39 13h56l17 17v58H39zM95 13v17h17M51 41h35M51 52h47M51 63h30M51 74h38M29 22v65m-4-55h8m-8 16h8m-8 16h8m-8 16h8"/>':'<path d="M17 82h114M26 16v70M122 16v70M22 26h8m-8 14h8m-8 14h8m-8 14h8M118 26h8m-8 14h8m-8 14h8m-8 14h8M44 25h20m20 0h20M43 80l12-17m38 17-12-17"/>'}</g><g class="plumb"><path d="${paper?'M102 42v15M99 61h6v4h-6zM97 69h10l4 5H93zM93 77h18l-9 14z':'M74 14v28M71 47h6v5h-6zM68 56h12l6 8H62zM62 68h24L74 88z'}"/></g></svg>`;
}
function renderEmpty(){
 let html='';
 if(current==='baustellen-leer')html=`<section class="craft-empty">${plumbMotif()}<h2>Noch keine Baustellen angelegt</h2><p>Lege deine erste Baustelle an. Hier findest du anschließend Auftrag, Planung und zugehörige Belege zusammen.</p><div class="actions">${btn('Erste Baustelle anlegen','baustelle-neu','primary')}</div></section>`;
 if(current==='angebote-leer')html=`<section class="craft-empty">${plumbMotif('quote')}<h2>Dein erstes Angebot beginnt hier</h2><p>Erstelle ein Angebot für einen Kunden. Entwürfe und versandte Angebote findest du später in dieser Übersicht.</p><div class="actions">${btn('Erstes Angebot erstellen','angebot','primary')}</div></section>`;
 if(current==='filter-leer')html=`<div class="toolbar"><div class="tabs" role="group" aria-label="Angebotsfilter"><button class="tab active" aria-pressed="true">Offen</button><a class="tab" href="${href('angebot')}">Alle</a></div>${searchbox('Kunde oder Angebotsnummer')}</div><section class="craft-empty craft-empty-quiet"><h2>In dieser Auswahl keine Angebote</h2><p>Für „Offen“ sind keine passenden Angebote vorhanden. Unter „Alle“ findest du die übrigen Angebote.</p><div class="actions">${btn('Alle Angebote anzeigen','angebot')}</div></section>`;
 if(current==='zeitraum-leer')html=`<div class="sectionhead"><div><h2>Diese Woche</h2><p class="meta">KW 44 · 26. Oktober – 1. November 2026</p></div></div><section class="craft-empty craft-empty-quiet"><h2>Für diese Woche noch keine Buchungen</h2><p>Wähle einen anderen Zeitraum oder erfasse deine Arbeitszeit für einen Tag dieser Woche.</p><div class="actions">${btn('Zeit erfassen','zeit-vorgemerkt','primary')}</div></section>`;
 if(current==='baustelle-neu')html=`<form class="formgrid" data-project-demo><section><h2>Auftrag und Kunde</h2><div class="space"></div>${input('Bezeichnung der Baustelle','','projekt-name')}${input('Kunde','','projekt-kunde')}${input('Anschrift der Baustelle','','projekt-ort')}<p class="note">Ausschnitt der Designvorschau. In der App bleiben alle bestehenden Felder, Vorgaben und Prüfungen erhalten.</p><div class="formfoot static"><span class="stateword">Noch nicht angelegt</span><div class="actions">${btn('Abbrechen','baustellen-leer','ghost')}<button class="btn primary" type="submit">Baustelle anlegen</button></div></div></section></form>`;
 if(!html)return;
 const main=document.querySelector('.main');main.querySelectorAll(':scope > :not(.pagehead)').forEach(el=>el.remove());main.insertAdjacentHTML('beforeend',html);
 const active=current.startsWith('baustelle')?'Baustellen':current==='zeitraum-leer'?'Zeiterfassung':'Angebote';
 document.querySelectorAll('.navitem').forEach(el=>{const on=el.textContent.trim()===active;el.classList.toggle('active',on);if(on)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
 const mobileActive=current.startsWith('baustelle')?'Baustellen':current==='zeitraum-leer'?'Zeit':'Mehr';
 document.querySelectorAll('.bottomnav a').forEach(el=>{const on=el.textContent.trim()===mobileActive;el.classList.toggle('active',on);if(on)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
 C.mark();
}
renderEmpty();
if(current==='gespeichert'||current==='firma-teilerfolg'){
 const button=document.querySelector('[data-form=company] [type=submit]');
 if(button){keepDiscardSpace(button.closest('form'));button.dataset.craftState='success';buttonLabel(button,check+'Gespeichert');}
}
document.addEventListener('submit',e=>{if(!e.target.matches('[data-project-demo]'))return;e.preventDefault();const missing=[...e.target.querySelectorAll('input')].find(el=>!el.value.trim());if(missing){missing.setAttribute('aria-invalid','true');missing.focus();return;}showFeedback('Designsimulation: Baustelle angelegt.')});

function resultArea(){
 const drawer=document.querySelector('.drawer');if(!drawer)return null;
 let area=drawer.querySelector('[data-search-results]');
 if(!area){
  const input=drawer.querySelector('#artikel-suche');if(!input)return null;
  const anchor=input.closest('label').nextElementSibling;
  let el=anchor?.nextElementSibling;while(el){const next=el.nextElementSibling;el.remove();el=next;}
  area=document.createElement('div');area.dataset.searchResults='';area.className='search-results';drawer.append(area);
 }
 return area;
}
const materials=[{id:'kupfer-hart',name:'Kupferrohr 22 mm, hart',nr:'CU-22-H',unit:'Stk',price:'€ 14,80'},{id:'kupfer-weich',name:'Kupferrohr 22 mm, weich',nr:'CU-22-W',unit:'m',price:'€ 9,20'}];
function searchRender(kind,q){
 const area=resultArea();if(!area)return;
 if(kind==='loading')area.innerHTML=`<p class="screen-state" role="status" aria-busy="true"><span><span class="spinner" aria-hidden="true"></span>Suche nach „${safe(q)}“ …</span></p>${Array.from({length:4},()=>'<div class="skeletonrow" aria-hidden="true"><div class="skeleton"></div><div class="skeleton short"></div></div>').join('')}`;
 if(kind==='ready'){
  const matches=materials.filter(m=>(m.name+' '+m.nr).toLocaleLowerCase('de-AT').includes(q.toLocaleLowerCase('de-AT')));
  if(matches.length===0){searchRender('empty',q);return;}
  area.innerHTML=`<p class="screen-state" role="status">${matches.length} Treffer für „${safe(q)}“</p>${matches.map(m=>`<div class="result"><div><p>${m.name}</p><small>${m.nr} · ${m.price} je ${m.unit}</small></div><button class="btn small" data-add-material="${m.id}">Übernehmen</button></div>`).join('')}<p class="craft-live" role="status" data-selection-live></p>`;
 }
 if(kind==='empty')area.innerHTML=`<section class="craft-empty craft-empty-quiet"><h2>Kein Artikel passt zur Suche</h2><p>Ändere die Bezeichnung oder suche mit einer Artikelnummer.</p><button class="btn small" data-clear-search>Suche zurücksetzen</button></section>`;
 if(kind==='error')area.innerHTML=`<section class="message error" role="alert"><h2>Die Suche konnte nicht geladen werden.</h2><p>Bereits übernommene Positionen bleiben erhalten. Zur aktuellen Suche liegen keine bestätigten Treffer vor.</p><div class="actions"><button class="btn small" data-retry-search>Suche wiederholen</button></div></section>`;
 if(kind==='initial')area.innerHTML='<p class="craft-description">Gib mindestens zwei Zeichen ein.</p>';
 C.mark(area);
}
function safe(s){const el=document.createElement('span');el.textContent=s;return el.innerHTML}
async function catalogSearch(){
 const el=document.querySelector('#artikel-suche');if(!el)return;
 const q=el.value.trim(),generation=++demo.search;
 if(q.length<2){searchRender('initial',q);return;}
 searchRender('loading',q);await responseDelay(850);
 if(generation!==demo.search)return;
 searchRender(/fehler/i.test(q)?'error':/ohne|zzzz/i.test(q)?'empty':'ready',q);
}
if(current==='katalog-treffer')searchRender('ready','Kupferrohr 22');
if(current==='katalog')searchRender('loading','Kupferrohr 22');
if(current==='katalog-fehler')searchRender('error','Kupferrohr 22');
if(current==='katalog'&&params.get('auto')==='1')catalogSearch();
document.addEventListener('input',e=>{if(e.target.id==='artikel-suche')catalogSearch()});

let closeInProgress=false,priorFocus=null;
function restorePage(){document.getElementById('app').inert=false;document.querySelector('.entwurfband').inert=false;priorFocus?.focus({preventScroll:true})}
async function closeModal(next){
 const shade=document.querySelector('.shade');if(!shade||closeInProgress)return;
 closeInProgress=true;await C.close(shade);
 if(shade.dataset.liveModal){shade.remove();restorePage();closeInProgress=false;return;}
 location.href=href(next);
}
function openLeaveDialog(){
 if(document.querySelector('.shade'))return;
 priorFocus=document.activeElement;
 const wrapper=document.createElement('div');wrapper.innerHTML=leaveDialog();const shade=wrapper.firstElementChild;shade.dataset.liveModal='1';
 shade.addEventListener('click',e=>{if(e.target===shade)closeModal('firmendaten')});
 document.body.append(shade);document.getElementById('app').inert=true;document.querySelector('.entwurfband').inert=true;
 const dialog=shade.querySelector('[role=dialog]');dialog.tabIndex=-1;dialog.focus();
}
document.addEventListener('keydown',e=>{
 const shade=document.querySelector('.shade');if(!shade)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeModal(current==='verlassen'?'firmendaten':isQuote?'angebot':'firmendaten');}
 if(e.key==='Tab'&&shade.dataset.liveModal){
  const targets=[...shade.querySelectorAll('a[href],button:not(:disabled),input')].filter(el=>el.getClientRects().length);
  const i=targets.indexOf(document.activeElement);
  if(i<0||(!e.shiftKey&&i===targets.length-1)||(e.shiftKey&&i===0)){e.preventDefault();(e.shiftKey?targets.at(-1):targets[0]).focus()}
 }
},true);
document.addEventListener('click',async e=>{
 const el=e.target.closest('a,button');if(!el)return;
 if(el.closest('.shade')&&el.matches('a[href]')){
  e.preventDefault();e.stopImmediatePropagation();const next=new URL(el.href).searchParams.get('screen');
  if(el.closest('.shade').dataset.liveModal&&el.textContent.includes('verwerfen')){await closeModal('gespeichert');const form=document.querySelector('[data-form=company]');for(const input of form.querySelectorAll('input'))if(confirmedValues.has(input.id))input.value=confirmedValues.get(input.id);demo.revision++;const button=form.querySelector('[type=submit]');button.disabled=true;button.dataset.craftState='success';buttonLabel(button,check+'Gespeichert');keepDiscardSpace(form);formStatus(form,'Gespeicherter Stand wiederhergestellt · Designsimulation');return;}
  closeModal(next||'firmendaten');return;
 }
 if(el.matches('[data-add-material]')){
  const m=materials.find(m=>m.id===el.dataset.addMaterial);demo.selected++;
  const live=document.querySelector('[data-selection-live]');live.textContent=`„${m.name}“ übernommen.`;C.animate(live,[{opacity:0},{opacity:1}],160);
  const old=document.querySelector('.drawer .note');if(old)old.textContent=`Zuletzt übernommen: ${m.name} · ${demo.selected} ${m.unit}`;
  return;
 }
 if(el.matches('[data-clear-search]')){const input=document.querySelector('#artikel-suche');input.value='';catalogSearch();input.focus();return;}
 if(el.matches('[data-retry-search]')){catalogSearch();return;}
 if(el.matches('[data-action=pdf]')){
  e.preventDefault();if(el.disabled)return;el.disabled=true;el.setAttribute('aria-busy','true');buttonLabel(el,'<span class="spinner" aria-hidden="true"></span>PDF wird vorbereitet …');
  await responseDelay(950);el.disabled=false;el.removeAttribute('aria-busy');buttonLabel(el,'PDF erneut laden');showFeedback('Designsimulation: PDF aus dem gespeicherten Beleg geladen.');return;
 }
 if(el.matches('[data-action=check]')){
  if(el.disabled)return;el.disabled=true;el.setAttribute('aria-busy','true');buttonLabel(el,'Stand wird geprüft …');await responseDelay(950);location.href=href('rechnung-pdf');return;
 }
 if(el.matches('[data-action=dismiss]')){el.closest('.message').remove();return;}
 if(el.matches('[data-action=quote-save]')){buttonLabel(el,check+'Gespeichert');el.disabled=true;el.closest('.formfoot').querySelector('.stateword').textContent='Angebot gespeichert · Designsimulation';return;}
 if(el.matches('[data-demo]')){showFeedback('Designvorschau: '+el.dataset.demo);return;}
 if(el.closest('form[data-form=company]')&&el.textContent.trim()==='Verwerfen'){e.preventDefault();e.stopImmediatePropagation();if(!demo.pending)openLeaveDialog();}
},true);

function showFeedback(message){
 document.querySelector('.toast')?.remove();const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');
 t.innerHTML='<span></span><button type="button" aria-label="Meldung schließen">Schließen</button>';t.querySelector('span').textContent=message;
 let left=5000,start=Date.now(),timer;
 const stop=()=>{clearTimeout(timer);left-=Date.now()-start;};
 const resume=()=>{clearTimeout(timer);start=Date.now();timer=setTimeout(()=>t.remove(),Math.max(0,left));};
 t.addEventListener('mouseenter',stop);t.addEventListener('mouseleave',resume);t.addEventListener('focusin',stop);t.addEventListener('focusout',resume);
 t.querySelector('button').onclick=()=>{clearTimeout(timer);t.remove()};document.body.append(t);resume();C.animate(t,[{opacity:0},{opacity:1}],160);
}
C.mark();
