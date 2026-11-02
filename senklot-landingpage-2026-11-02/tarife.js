/* Dieselben Cent-Beträge für Preisanzeige, Anfrage und serverseitige E-Mail. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SenklotTarife=factory();})(globalThis,function(){
  const TARIFE=Object.freeze({
    starter:Object.freeze({name:'Starter',nutzer:'Bis 5',monatCent:12900,einrichtungCent:29000}),
    team:Object.freeze({name:'Team',nutzer:'6–15',monatCent:22900,einrichtungCent:59000}),
    betrieb:Object.freeze({name:'Betrieb',nutzer:'16–30',monatCent:37900,einrichtungCent:99000})
  });
  function preis(id,zahlung){const t=Object.hasOwn(TARIFE,id)?TARIFE[id]:null;if(!t||!['monatlich','jaehrlich'].includes(zahlung))return null;const jahrCent=zahlung==='jaehrlich'?Math.round(t.monatCent*12*90/100):t.monatCent*12;return {...t,jahrCent,effektivMonatCent:jahrCent/12,zahlung};}
  function euro(cent,dezimal=false){return new Intl.NumberFormat('de-DE',{minimumFractionDigits:dezimal?2:0,maximumFractionDigits:2}).format(cent/100)+' €';}
  return Object.freeze({TARIFE,preis,euro,rabattProzent:10});
});
