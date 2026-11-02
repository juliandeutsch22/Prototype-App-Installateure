(function(){
 const form=document.getElementById('anfrageformular');if(!form)return;
 const send=document.getElementById('anfrage-senden'),status=document.getElementById('formular-status'),schutz=document.getElementById('spamschutz-status'),auswahl=document.getElementById('kontakt-tarif');
 let mode='unavailable',token='',widget=null,pending=false,requestId=null;
 function id(){return crypto.randomUUID();}
 function meldung(text,art='info'){status.textContent=text;status.dataset.art=art;}
 function bereit(){send.disabled=pending||(mode!=='preview'&&(!token||mode!=='live'));}
 function zusammenfassung(){const a=window.SenklotAuswahl;a.tarif=auswahl.value;const p=window.SenklotTarife.preis(a.tarif,a.zahlung);document.getElementById('anfrage-auswahl').textContent=p?`${p.name} · ${a.zahlung==='jaehrlich'?`${window.SenklotTarife.euro(p.jahrCent,true)} netto jährlich im Voraus (10 % Rabatt)`:`${window.SenklotTarife.euro(p.monatCent)} netto pro Monat`} · Einrichtung einmalig ${window.SenklotTarife.euro(p.einrichtungCent)} netto. Unverbindliche Anfrage.`:'Deine Anfrage ist unverbindlich. Der passende Tarif lässt sich gemeinsam klären.';if(!pending)requestId=null;}
 window.addEventListener('senklot:auswahl',zusammenfassung);auswahl.addEventListener('change',zusammenfassung);zusammenfassung();
 form.addEventListener('input',()=>{if(!pending)requestId=null;});
 async function starten(){
  try{const r=await fetch('/api/contact-config',{headers:{Accept:'application/json'}});if(!r.ok)throw Error();const c=await r.json();mode=c.mode;
   if(mode==='preview'){schutz.textContent='Vorschau: Botschutz und E-Mail-Versand sind noch nicht aktiviert. Du kannst das Formular ohne Versand prüfen.';send.textContent='Formular prüfen';bereit();return;}
   if(mode!=='live'||!c.ready||!c.sitekey)throw Error();
   const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
   script.onload=()=>{widget=window.turnstile.render('#turnstile-widget',{sitekey:c.sitekey,action:'contact',theme:'light',size:document.getElementById('turnstile-widget').clientWidth<300?'compact':'flexible','response-field':false,callback:t=>{token=t;schutz.textContent='Sicherheitsprüfung erfolgreich.';bereit();},'expired-callback':()=>{token='';schutz.textContent='Bitte wiederhole die Sicherheitsprüfung.';bereit();},'error-callback':()=>{token='';schutz.textContent='Die Sicherheitsprüfung ist momentan nicht verfügbar. Du kannst uns direkt per E-Mail oder Telefon erreichen.';bereit();}});};
   script.onerror=()=>{token='';schutz.textContent='Die Sicherheitsprüfung konnte nicht geladen werden. Bitte lade die Seite neu oder kontaktiere uns direkt.';bereit();};document.head.append(script);
  }catch{mode='unavailable';schutz.textContent='Das geschützte Formular ist momentan nicht verfügbar. Du erreichst uns direkt per E-Mail oder Telefon.';bereit();}
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(pending||!form.reportValidity()||send.disabled)return;
  document.querySelectorAll('.feldfehler').forEach(p=>p.textContent='');form.querySelectorAll('[aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
  const data=Object.fromEntries(new FormData(form));data.zahlung=window.SenklotAuswahl.zahlung;data.token=token;data.requestId=requestId??(requestId=id());
  const controls=[...form.querySelectorAll('input,textarea,select')];pending=true;controls.forEach(el=>el.disabled=true);send.setAttribute('aria-busy','true');send.textContent=mode==='preview'?'Wird geprüft …':'Wird gesendet …';bereit();meldung('Bitte einen Moment …');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data),signal:controller.signal});const result=await r.json();
   if(!r.ok){if(result.fields)for(const[k,v]of Object.entries(result.fields)){const input=form.elements.namedItem(k),error=document.getElementById('fehler-'+k);if(input&&error){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);error.textContent=String(v);}}throw Error(result.message||'Die Anfrage konnte nicht übermittelt werden. Deine Angaben bleiben erhalten.');}
   if(result.code==='PREVIEW_ONLY'){meldung(result.message,'vorschau');}
   else if(result.code==='ACCEPTED'){meldung(result.message,'erfolg');form.reset();window.SenklotAuswahl.tarif='offen';zusammenfassung();requestId=null;}
   else throw Error('Die Zustellung konnte nicht bestätigt werden. Deine Angaben bleiben erhalten.');
  }catch(error){meldung(error.name==='AbortError'?'Die Rückmeldung dauert zu lange. Die Zustellung ist unklar; bitte sende nicht mehrfach. Deine Angaben bleiben erhalten.':error.message||'Die Verbindung ist unterbrochen. Deine Angaben bleiben erhalten.','fehler');}
  finally{clearTimeout(timeout);pending=false;controls.forEach(el=>el.disabled=false);send.removeAttribute('aria-busy');send.textContent=mode==='preview'?'Formular prüfen':'Anfrage senden';token='';if(widget!==null&&window.turnstile)window.turnstile.reset(widget);bereit();status.focus();}
 });
 starten();
})();
