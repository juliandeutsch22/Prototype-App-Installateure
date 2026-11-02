const ansichten={
 planung:{file:'planung.webp',title:'Einsatzplanung',text:'Wer ist wann auf welcher Baustelle? Das Team in einer gemeinsamen Planung.'},
 kundenakte:{file:'kundenakte.webp',title:'Kundenakte',text:'Kontakte, Baustellen, Termine und Belege dort, wo sie zusammengehören.'},
 zeit:{file:'zeit-mobil.webp',title:'Mobile Zeiterfassung',text:'Zeiten, Pausen und Baustelle direkt am Handy erfassen.'},
 rechnungen:{file:'rechnungen.webp',title:'Rechnungen',text:'Nicht verrechnete Leistungen, offene Rechnungen und fällige Mahnungen im Blick.'},
 mitarbeiter:{file:'mitarbeiter.webp',title:'Mitarbeiterübersicht',text:'Gebuchte Stunden, Soll, Salden und Tage ohne Buchung nachvollziehen.'}
};
const tabs=[...document.querySelectorAll('[data-ansicht]')],panel=document.getElementById('produktansicht'),bild=document.getElementById('produktbild'),bildtext=document.getElementById('bildtext'),dialog=document.getElementById('bilddialog'),gross=document.getElementById('grossesbild'),oeffnen=document.getElementById('bild-oeffnen');
let aktuell='planung';
function waehlen(tab,fokus=false){aktuell=tab.dataset.ansicht;const a=ansichten[aktuell];for(const t of tabs){t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1}panel.setAttribute('aria-labelledby',tab.id);bild.src='assets/'+a.file;bild.alt='Senklot · '+a.title+' mit Beispieldaten.';bildtext.textContent=a.text;if(fokus)tab.focus()}
tabs.forEach((t,i)=>{t.addEventListener('click',()=>waehlen(t));t.addEventListener('keydown',e=>{let j;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;else return;e.preventDefault();waehlen(tabs[j],true);tabs[j].scrollIntoView({block:'nearest',inline:'nearest'})})});
oeffnen.addEventListener('click',()=>{const a=ansichten[aktuell];gross.src='assets/'+a.file;gross.alt=bild.alt;gross.style.width=aktuell==='zeit'?'390px':'1440px';document.getElementById('dialogtitel').textContent='Senklot · '+a.title;dialog.showModal()});
document.getElementById('dialog-schliessen').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>oeffnen.focus());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});

const auswahl=window.SenklotAuswahl={tarif:'offen',zahlung:'monatlich'};
function preiseAktualisieren(){
 const{preis,euro}=window.SenklotTarife,jaehrlich=auswahl.zahlung==='jaehrlich';
 document.querySelectorAll('[data-zahlung]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.zahlung===auswahl.zahlung)));
 for(const id of Object.keys(window.SenklotTarife.TARIFE)){const p=preis(id,auswahl.zahlung);document.querySelector(`[data-preis="${id}"]`).textContent=euro(p.effektivMonatCent,jaehrlich);document.querySelector(`[data-jahrespreis="${id}"]`).textContent=jaehrlich?`${euro(p.jahrCent,true)} jährlich im Voraus`:'Monatlich abgerechnet';}
 document.getElementById('preis-erlaeuterung').textContent=jaehrlich?'Monatlicher Vergleichspreis bei jährlicher Vorauszahlung mit 10 % Rabatt. Die Einrichtung bleibt unverändert.':'Monatliche Abrechnung. Die einmalige Einrichtung kommt zusätzlich dazu.';
 window.dispatchEvent(new Event('senklot:auswahl'));
}
document.querySelectorAll('[data-zahlung]').forEach(b=>b.addEventListener('click',()=>{auswahl.zahlung=b.dataset.zahlung;preiseAktualisieren()}));
document.querySelectorAll('[data-tarif]').forEach(a=>a.addEventListener('click',()=>{auswahl.tarif=a.dataset.tarif;document.getElementById('kontakt-tarif').value=auswahl.tarif;window.dispatchEvent(new Event('senklot:auswahl'))}));
preiseAktualisieren();
