import { createHash } from 'node:crypto';
import {emailParts} from './mail.mjs';
import tarifdaten from '../tarife.js';
const { TARIFE, EINFUEHRUNG, preis, euro } = tarifdaten;
export const EMPFAENGER='office@senklot.at';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plain=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
export function validieren(raw){
 const e={},d={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return {errors:{formular:'Bitte prüfe deine Angaben.'}};
 for(const[k,min,max]of[['name',2,100],['firma',2,150],['email',3,254],['telefon',0,40]]){
  const v=typeof raw[k]==='string'?raw[k].trim():'';
  if((raw[k]!==undefined&&typeof raw[k]!=='string')||!plain(v,max)||v.length<min||/[\r\n]/.test(v))e[k]='Bitte prüfe diese Angabe.';d[k]=v;
 }
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.email))e.email='Bitte gib eine gültige E-Mail-Adresse ein.';
 d.tarif=raw.tarif??'offen';if(typeof d.tarif!=='string'||(d.tarif!=='offen'&&!Object.hasOwn(TARIFE,d.tarif)))e.tarif='Bitte wähle einen vorhandenen Tarif.';
 d.zahlung=raw.zahlung;if(!['monatlich','jaehrlich'].includes(d.zahlung))e.tarif='Bitte prüfe die gewählte Abrechnung.';
 d.nutzer=raw.nutzer===undefined||raw.nutzer===''?null:Number(raw.nutzer);
 if(d.nutzer!==null&&(!['number','string'].includes(typeof raw.nutzer)||!Number.isInteger(d.nutzer)||d.nutzer<1||d.nutzer>10000))e.nutzer='Bitte gib eine ganze Zahl ab 1 ein.';
 d.nachricht=typeof raw.nachricht==='string'?raw.nachricht.trim():'';if((raw.nachricht!==undefined&&typeof raw.nachricht!=='string')||!plain(d.nachricht,3000))e.nachricht='Die Nachricht darf höchstens 3.000 Zeichen enthalten.';
 if(typeof raw.website!=='string'||raw.website.trim())e.formular='Die Anfrage konnte nicht verarbeitet werden. Bitte verwende bei Bedarf E-Mail oder Telefon.';
 d.einrichtung=raw.einrichtung??false;if(typeof d.einrichtung!=='boolean')e.einrichtung='Bitte prüfe die optionale Einrichtung.';
 d.requestId=raw.requestId;if(typeof d.requestId!=='string'||!UUID.test(d.requestId))e.formular='Bitte lade das Formular neu.';
 d.token=raw.token;if(d.token!==undefined&&(typeof d.token!=='string'||d.token.length>2048))e.formular='Bitte wiederhole die Sicherheitsprüfung.';
 return Object.keys(e).length?{errors:e}:{data:d};
}
export class AnfrageLimit{
 constructor({max=8,fensterMs=15*60*1000,kapazitaet=5000,jetzt=Date.now}={}){this.max=max;this.fensterMs=fensterMs;this.kapazitaet=kapazitaet;this.jetzt=jetzt;this.eintraege=new Map();}
 nehmen(ip){const n=this.jetzt();for(const[k,v]of this.eintraege)if(v.bis<=n)this.eintraege.delete(k);
  const key=createHash('sha256').update(ip).digest('hex');let v=this.eintraege.get(key);
  if(!v){if(this.eintraege.size>=this.kapazitaet)return false;v={anzahl:0,bis:n+this.fensterMs};this.eintraege.set(key,v);}
  return ++v.anzahl<=this.max;
 }
}
function antwort(status,data,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});}
export function emailText(d){
 const p=d.tarif==='offen'?null:preis(d.tarif,d.zahlung);
 return ['Senklot – neue Website-Anfrage','',EINFUEHRUNG.titel,EINFUEHRUNG.preisbindung,'',`Name: ${d.name}`,`Betrieb: ${d.firma}`,`E-Mail: ${d.email}`,`Telefon: ${d.telefon||'Nicht angegeben'}`,`Mitarbeiter / Nutzer: ${d.nutzer??'Nicht angegeben'}`,`Tarif: ${p?p.name:'Noch offen / allgemeine Anfrage'}`,`Abrechnung: ${d.zahlung==='jaehrlich'?'Jährliche Vorauszahlung, 10 % Rabatt':'Monatlich'}`,
 ...(p?[`Abonnement: ${euro(p.effektivMonatCent,true)} netto pro Monat${d.zahlung==='jaehrlich'?` (${euro(p.jahrCent,true)} jährlich im Voraus)`:''}`,...(d.einrichtung?[`Optionale Einrichtung angefragt: ${euro(p.einrichtungCent,true)} netto einmalig`]:['Begleitete Einrichtung: nicht angefragt; keine Einrichtungsgebühr für eigenständigen Start.'])]:(d.einrichtung?['Optionale Einrichtung angefragt: Umfang und Preis vorab vereinbaren.']:['Begleitete Einrichtung: nicht angefragt.'])),'','Nachricht:',d.nachricht||'Keine zusätzliche Nachricht.','',`Anfrage-ID: ${d.requestId}`,'Unverbindliche Anfrage; kein Vertragsabschluss.'].join('\n');
}
export function createHandler({origins,preview=false,ready=false,verify,send,limit=new AnfrageLimit()}){
 return async function(request,ip){
  if(request.method!=='POST')return antwort(405,{message:'Diese Methode wird nicht unterstützt.'},{Allow:'POST'});
  const origin=request.headers.get('origin');if(!origins.includes(origin))return antwort(403,{message:'Bitte öffne das Formular auf der Senklot-Website.'});
  if(!limit.nehmen(ip))return antwort(429,{message:'Bitte versuche es später erneut oder kontaktiere uns direkt per E-Mail oder Telefon.'},{'Retry-After':'900'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return antwort(415,{message:'Bitte sende das Formular erneut.'});
  let raw;try{const text=await request.text();if(Buffer.byteLength(text)>12000)return antwort(413,{message:'Die Anfrage ist zu groß.'});raw=JSON.parse(text);}catch{return antwort(400,{message:'Bitte prüfe deine Angaben.'});}
  const result=validieren(raw);if(result.errors)return antwort(422,{message:'Bitte prüfe die markierten Angaben.',fields:result.errors});
  const d=result.data;
  // Nur der ausdrücklich gestartete lokale Entwurf darf ohne Dienste prüfen.
  if(preview)return antwort(200,{code:'PREVIEW_ONLY',message:'Vorschau: Deine Angaben sind gültig. Es wurde keine Anfrage versendet.'});
  if(!ready)return antwort(503,{message:'Das Formular ist momentan nicht verfügbar. Bitte kontaktiere uns direkt per E-Mail oder Telefon.'});
  if(!d.token)return antwort(403,{message:'Bitte schließe die Sicherheitsprüfung ab.'});
  try{
   const v=await verify(d.token,ip);
   if(v?.success!==true||v.action!=='contact'||v.hostname!==new URL(origin).hostname)return antwort(403,{message:'Die Sicherheitsprüfung ist nicht mehr gültig. Bitte versuche es erneut.'});
  }catch{return antwort(503,{message:'Die Sicherheitsprüfung ist momentan nicht erreichbar. Deine Angaben bleiben erhalten.'});}
  try{
   const sent=await send({to:EMPFAENGER,replyTo:d.email,subject:'Senklot – Anfrage über die Website',text:emailText(d),...emailParts(d),idempotencyKey:'senklot-contact/'+d.requestId});
   if(!sent||typeof sent.id!=='string'||!sent.id.trim())throw Error('Keine Versandbestätigung');
   return antwort(200,{code:'ACCEPTED',message:'Vielen Dank. Deine Anfrage wurde übermittelt. Wir melden uns bei dir.'});
  }catch{return antwort(502,{message:'Die Zustellung konnte nicht bestätigt werden. Deine Angaben bleiben erhalten. Bitte sende dieselbe Anfrage nicht mehrfach; du erreichst uns auch per E-Mail oder Telefon.'});}
 };
}
