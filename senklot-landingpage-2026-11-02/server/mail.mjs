import {readFileSync} from 'node:fs';
import tarifdaten from '../tarife.js';
const {preis,euro}=tarifdaten;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export function emailParts(d){
 let template;try{template=readFileSync(new URL('../senklot-intern/mail-vorlage.html',import.meta.url),'utf8');}catch{return {};}
 let logo;try{logo=readFileSync(new URL('../senklot-intern/mail-logo.png',import.meta.url));}catch{}
 const p=preis(d.tarif,d.zahlung),yearly=d.zahlung==='jaehrlich';
 const line=text=>`<p style="margin:9px 0 0;font-size:12px;line-height:1.8;color:#536a72;">${esc(text)}</p>`;
 let selection=`<p style="margin:0;font-size:16px;line-height:1.5;font-weight:500;color:#0f4552;">${esc(p?.name??'Tarif noch offen')}</p>`;
 if(p){selection+=`<p style="margin:10px 0 0;font-size:23px;line-height:1.5;font-weight:400;color:#0f4552;">${esc(euro(yearly?p.jahrCent:p.monatCent,true))}<span style="font-size:12px;"> netto / ${yearly?'Jahr':'Monat'}</span></p>`;selection+=line(yearly?'Jährliche Vorauszahlung mit 10 % Rabatt.':'Monatliche Abrechnung.');}
 else selection+=line(yearly?'Gewünschte Abrechnung: jährlich.':'Gewünschte Abrechnung: monatlich.');
 selection+=line(d.einrichtung?(p?`Optionale Einrichtung angefragt: ${euro(p.einrichtungCent,true)} netto einmalig.`:'Optionale Einrichtung angefragt; Umfang und Preis vorab klären.'):'Keine begleitete Einrichtung angefragt. Keine Einrichtungsgebühr bei eigenständigem Start.');
 const rows=Object.entries({'Name':d.name??'','E-Mail':d.email??'','Telefon':d.telefon||'Nicht angegeben','Mitarbeiter / Nutzer':d.nutzer??'Nicht angegeben'}).map(([label,value])=>`<tr><th scope="row" align="left" valign="top" style="width:39%;padding:11px 12px 11px 0;border-bottom:1px solid #c6d5da;font-size:12px;line-height:1.8;font-weight:400;color:#536a72;">${esc(label)}</th><td valign="top" style="padding:11px 0;border-bottom:1px solid #c6d5da;font-size:13px;line-height:1.8;overflow-wrap:anywhere;word-break:break-word;">${esc(value)}</td></tr>`).join('');
 const replacements={'PREHEADER':esc('Neue Anfrage von '+(d.firma??'einem Interessenten')),'MARKE':logo?'<img src="cid:senklot-logo" alt="Senklot" width="176" style="display:block;width:176px;max-width:100%;height:auto;border:0;">':'<span style="font-size:28px;line-height:1.4;color:#0f4552;">Senklot</span>','FIRMA':esc(d.firma??'Allgemeine Anfrage'),'AUSWAHL':selection,'KONTAKT':rows,'NACHRICHT':esc(d.nachricht||'Keine zusätzliche Nachricht.').replace(/\r\n|\r|\n/g,'<br>'),'REQUEST_ID':esc(d.requestId??''),'ANTWORTLINK':esc('mailto:'+encodeURIComponent(d.email??'').replace(/'/g,'%27'))};
 const html=template.replace(/\{\{([A-Z_]+)\}\}/g,(m,k)=>replacements[k]??m);
 return {html,...(logo?{attachments:[{filename:'senklot.png',content:logo.toString('base64'),content_type:'image/png',content_id:'senklot-logo'}]}:{})};
}
