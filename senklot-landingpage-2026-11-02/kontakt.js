(() => {
 const form=document.getElementById('anfrageformular'); if(!form)return;
 const send=document.getElementById('anfrage-senden'),status=document.getElementById('formular-status'),schutz=document.getElementById('spamschutz-status'),auswahl=document.getElementById('kontakt-tarif');
 const aktivieren=document.getElementById('spamschutz-aktivieren'),beenden=document.getElementById('spamschutz-beenden'),einrichtung=document.getElementById('kontakt-einrichtung');
 let protection='local',localReadyAt=0,localExpiresAt=0,localRefreshing=false,localWaitTimer=null,localExpiryTimer=null;
 const schutzBereich=document.getElementById('formular-schutz'),cloudflareInfo=document.getElementById('spamschutz-cloudflare');
 let mode='unavailable',sitekey='',token='',widget=null,pending=false,activated=false,requestId=null,signature='';
 const meldung=(text,art='info')=>{status.textContent=text;status.dataset.art=art;};
 function bereit(){
  const localOk=protection==='local'&&!!token&&!localRefreshing&&performance.now()>=localReadyAt&&performance.now()<localExpiresAt;
  const remoteOk=protection==='turnstile'&&activated&&!!token;
  send.disabled=pending||(mode!=='preview'&&(mode!=='live'||!(localOk||remoteOk)));beenden.disabled=pending;
  if(!pending&&mode==='live'&&protection==='local')send.textContent=localRefreshing||(!!token&&performance.now()<localReadyAt)?'Wird vorbereitet …':'Anfrage senden';
 }
 async function lokalVorbereiten(){
  if(mode!=='live'||protection!=='local'||pending||localRefreshing)return;
  clearTimeout(localWaitTimer);clearTimeout(localExpiryTimer);token='';localRefreshing=true;schutzBereich.hidden=true;aktivieren.hidden=true;schutz.textContent='Das Formular wird vorbereitet …';bereit();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const r=await fetch('/api/contact-token',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:'{}',signal:controller.signal});
   if(!r.ok)throw Error();const c=await r.json();
   if(typeof c.token!=='string'||!c.token||!Number.isFinite(c.minWaitMs)||c.minWaitMs<0||c.minWaitMs>10000||!Number.isFinite(c.expiresInMs)||c.expiresInMs<=c.minWaitMs||c.expiresInMs>1800000)throw Error();
   token=c.token;localReadyAt=performance.now()+c.minWaitMs;localExpiresAt=performance.now()+c.expiresInMs;
   localWaitTimer=setTimeout(()=>{schutz.textContent='Formular bereit. Es ist keine externe Sicherheitsprüfung erforderlich.';bereit();},c.minWaitMs);
   localExpiryTimer=setTimeout(()=>{token='';bereit();if(!pending&&document.visibilityState!=='hidden')lokalVorbereiten();},c.expiresInMs);
  }catch{
   token='';schutzBereich.hidden=false;schutz.textContent='Das Formular konnte nicht vorbereitet werden. Bitte versuche es erneut oder kontaktiere uns direkt per E-Mail oder Telefon.';
   aktivieren.textContent='Formular erneut vorbereiten';aktivieren.hidden=false;aktivieren.disabled=false;
  }finally{clearTimeout(timer);localRefreshing=false;bereit();}
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&mode==='live'&&protection==='local'&&!pending&&performance.now()>=localExpiresAt)lokalVorbereiten();});
 window.addEventListener('pageshow',e=>{if(e.persisted&&mode==='live'&&protection==='local')lokalVorbereiten();});
 function zusammenfassung(){
  const a=window.SenklotAuswahl;a.tarif=auswahl.value;const p=window.SenklotTarife.preis(a.tarif,a.zahlung),angefragt=einrichtung.checked;
  const optional=p?`Optionale Einrichtung: ${window.SenklotTarife.euro(p.einrichtungCent)} netto einmalig, nur bei Buchung.`:'Umfang und Preis vereinbaren wir vor einer Buchung.';
  document.getElementById('einrichtung-preis').textContent=optional;
  const hilfe=angefragt?(p?`Optionale Einrichtung angefragt: ${window.SenklotTarife.euro(p.einrichtungCent)} netto einmalig.`:'Du interessierst dich für die optionale Einrichtung. Umfang und Preis klären wir vorab.'):'Ohne begleitete Einrichtung: keine Einrichtungsgebühr.';
  document.getElementById('anfrage-auswahl').textContent=p?`${p.name} · ${a.zahlung==='jaehrlich'?`${window.SenklotTarife.euro(p.jahrCent,true)} netto jährlich im Voraus (10 % Rabatt)`:`${window.SenklotTarife.euro(p.monatCent)} netto pro Monat`} · ${hilfe} ${window.SenklotTarife.EINFUEHRUNG.preisbindung} Unverbindliche Anfrage.`:`Deine Anfrage ist unverbindlich. Der passende Tarif lässt sich gemeinsam klären. ${hilfe}`;
 }
 einrichtung.addEventListener('change',zusammenfassung);
 window.addEventListener('senklot:auswahl',zusammenfassung);auswahl.addEventListener('change',zusammenfassung);zusammenfassung();
 function pruefungFehlgeschlagen(text){token='';schutz.textContent=text;bereit();}
 aktivieren.addEventListener('click',()=>{
  if(mode==='live'&&protection==='local'){lokalVorbereiten();return;}
  if(mode!=='live'||protection!=='turnstile'||activated)return;activated=true;aktivieren.disabled=true;beenden.hidden=false;
  schutz.textContent='Die ausdrücklich aktivierte Cloudflare-Sicherheitsprüfung wird geladen.';
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
  script.onload=()=>{try{
   widget=window.turnstile.render('#turnstile-widget',{sitekey,action:'contact',theme:'light',size:document.getElementById('turnstile-widget').clientWidth<300?'compact':'flexible','response-field':false,
    callback:t=>{token=typeof t==='string'?t:'';schutz.textContent='Sicherheitsprüfung erfolgreich.';bereit();},
    'expired-callback':()=>pruefungFehlgeschlagen('Bitte wiederhole die Sicherheitsprüfung.'),
    'error-callback':()=>pruefungFehlgeschlagen('Die Sicherheitsprüfung ist momentan nicht verfügbar. Du erreichst uns auch direkt per E-Mail oder Telefon.')});
   aktivieren.hidden=true;
  }catch{pruefungFehlgeschlagen('Die Sicherheitsprüfung konnte nicht gestartet werden. Bitte lade die Seite neu oder kontaktiere uns direkt.');}};
  script.onerror=()=>pruefungFehlgeschlagen('Die Sicherheitsprüfung konnte nicht geladen werden. Bitte lade die Seite neu oder kontaktiere uns direkt.');document.head.append(script);
 });
 beenden.addEventListener('click',()=>{if(!pending)window.location.reload();});
 async function starten(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const r=await fetch('/api/contact-config',{headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw Error();const c=await r.json();mode=c.mode;
   if(mode==='preview'){schutzBereich.hidden=true;schutz.textContent='Vorschau: Botschutz und E-Mail-Versand sind nicht aktiviert. Du kannst das Formular ohne Versand prüfen.';send.textContent='Formular prüfen';bereit();return;}
   if(mode!=='live'||!c.ready)throw Error();protection=c.protection??'turnstile';
   if(protection==='local'){
    schutzBereich.hidden=true;
    cloudflareInfo.hidden=true;beenden.hidden=true;await lokalVorbereiten();return;
   }
   if(protection!=='turnstile'||!c.sitekey)throw Error();sitekey=c.sitekey;schutzBereich.hidden=false;cloudflareInfo.hidden=false;
   aktivieren.textContent='Cloudflare-Spamschutz aktivieren';
   schutz.textContent='Cloudflare wird erst nach deinem Klick geladen. Alternativ erreichst du uns direkt per E-Mail oder Telefon.';aktivieren.hidden=false;aktivieren.disabled=false;bereit();
  }catch{mode='unavailable';schutzBereich.hidden=false;schutz.textContent='Das geschützte Formular ist momentan nicht verfügbar. Du erreichst uns direkt per E-Mail oder Telefon.';bereit();}
  finally{clearTimeout(timer);}
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(pending||!form.reportValidity()||send.disabled)return;
  if(mode==='live'&&protection==='local'&&performance.now()>=localExpiresAt){await lokalVorbereiten();return;}
  form.querySelectorAll('.feldfehler').forEach(p=>p.textContent='');form.querySelectorAll('[aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
  const data=Object.fromEntries(new FormData(form));data.zahlung=window.SenklotAuswahl.zahlung;data.einrichtung=einrichtung.checked;
  const next=JSON.stringify(data);if(!requestId||next!==signature){requestId=crypto.randomUUID();signature=next;}
  data.token=token;data.requestId=requestId;data.spamschutzZugestimmt=activated;
  const controls=[...form.querySelectorAll('input,textarea,select')];pending=true;controls.forEach(el=>el.disabled=true);send.setAttribute('aria-busy','true');send.textContent=mode==='preview'?'Wird geprüft …':'Wird gesendet …';bereit();meldung('Bitte einen Moment …');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data),signal:controller.signal});
   let result;try{result=await r.json();}catch{throw Error('Die Rückmeldung konnte nicht verarbeitet werden. Deine Angaben bleiben erhalten. Bitte kontaktiere uns bei Bedarf direkt.');}
   if(!r.ok){if(result.fields)for(const[k,v]of Object.entries(result.fields)){const input=form.elements.namedItem(k),error=document.getElementById('fehler-'+k);if(input&&error){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);error.textContent=String(v);}}throw Error(result.message||'Die Anfrage konnte nicht übermittelt werden. Deine Angaben bleiben erhalten.');}
   if(result.code==='PREVIEW_ONLY')meldung(result.message,'vorschau');
   else if(result.code==='ACCEPTED'){meldung(result.message,'erfolg');form.reset();window.SenklotAuswahl.tarif='offen';zusammenfassung();requestId=null;signature='';}
   else throw Error('Die Zustellung konnte nicht bestätigt werden. Deine Angaben bleiben erhalten.');
  }catch(error){meldung(error.name==='AbortError'?'Die Rückmeldung dauert zu lange. Die Zustellung ist unklar; bitte sende dieselbe Anfrage nicht mehrfach. Deine Angaben bleiben erhalten.':error instanceof TypeError?'Die Verbindung ist unterbrochen. Deine Angaben bleiben erhalten.':error.message,'fehler');}
  finally{clearTimeout(timer);pending=false;controls.forEach(el=>el.disabled=false);send.removeAttribute('aria-busy');send.textContent=mode==='preview'?'Formular prüfen':'Anfrage senden';token='';if(widget!==null&&window.turnstile)window.turnstile.reset(widget);bereit();status.focus();if(mode==='live'&&protection==='local')lokalVorbereiten();}
 });
 starten();
})();
