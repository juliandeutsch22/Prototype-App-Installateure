/* Dieselben Cent-Beträge für Preisanzeige, Anfrage und serverseitige E-Mail. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SenklotTarife=factory();})(globalThis,function(){
  const TARIFE=Object.freeze({
    starter:Object.freeze({name:'Starter',nutzer:'Bis 5',monatCent:12900,einrichtungCent:19900,einrichtungLeistungen:Object.freeze(["Firmenstammdaten und vereinbarte Grundeinstellungen gemeinsam einrichten", "Benutzerkonten und Rollen für bis zu 5 Nutzer vorbereiten", "Die vereinbarten Module für eure Abläufe konfigurieren", "Einführung anhand eines Beispielauftrags und gemeinsamer Check der Startkonfiguration"])}),
    team:Object.freeze({name:'Team',nutzer:'6–15',monatCent:17900,einrichtungCent:39900,einrichtungLeistungen:Object.freeze(["Firmenstammdaten und vereinbarte Grundeinstellungen gemeinsam einrichten", "Benutzerkonten und Rollen für bis zu 15 Nutzer vorbereiten", "Die vereinbarten Module für eure Abläufe konfigurieren", "Einführung anhand eines Beispielauftrags und gemeinsamer Check der Startkonfiguration"])}),
    betrieb:Object.freeze({name:'Betrieb',nutzer:'16–30',monatCent:24900,einrichtungCent:69900,einrichtungLeistungen:Object.freeze(["Firmenstammdaten und vereinbarte Grundeinstellungen gemeinsam einrichten", "Benutzerkonten und Rollen für bis zu 30 Nutzer vorbereiten", "Die vereinbarten Module für eure Abläufe konfigurieren", "Einführung anhand eines Beispielauftrags und gemeinsamer Check der Startkonfiguration"])})
  });
  const EINFUEHRUNG=Object.freeze({titel:'Pakete für deinen Betrieb',preisbindung:'Wähle das Paket, das zu deinem Team passt. Wenn du noch unsicher bist, schauen wir es uns gemeinsam an.'});
  function preis(id,zahlung){const t=Object.hasOwn(TARIFE,id)?TARIFE[id]:null;if(!t||!['monatlich','jaehrlich'].includes(zahlung))return null;const jahrCent=zahlung==='jaehrlich'?Math.round(t.monatCent*12*90/100):t.monatCent*12;return {...t,jahrCent,effektivMonatCent:jahrCent/12,zahlung};}
  function euro(cent,dezimal=false){return new Intl.NumberFormat('de-DE',{minimumFractionDigits:dezimal?2:0,maximumFractionDigits:2}).format(cent/100)+' €';}
  return Object.freeze({TARIFE,EINFUEHRUNG,preis,euro,rabattProzent:10});
});
