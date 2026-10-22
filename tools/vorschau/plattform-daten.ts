/** Ausschließlich fiktive Plattformdaten für die Vorschau ohne Datenbank. */
const jetzt = Date.now();
const bis = (stunden: number) => new Date(jetzt + stunden * 3_600_000).toISOString();
const zustand = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('plattformzustand');
export const plattformBetriebe = [
  { kennung: 'mustertechnik', name: 'Mustertechnik Installationen GmbH', angelegtAm: '2026-09-01T08:00:00Z', leitungskonten: 2, leitungMitMail: 2, notzugangBis: null, testbetrieb: false, deaktiviertAm: zustand ? '2026-09-20T08:00:00Z' : null, deaktiviertGrund: zustand ? 'Fiktiver Antrag des Betriebs' : null, exportAm: ['frist', 'loeschen'].includes(zustand ?? '') ? '2026-09-20T09:00:00Z' : null, loeschungGeplantFuer: zustand === 'frist' ? bis(720) : zustand === 'loeschen' ? new Date(jetzt - 3_600_000).toISOString() : null, echteDaten: 'er hat Rechnungen' },
  { kennung: 'beispiel', name: 'Haustechnik Beispiel KG', angelegtAm: '2026-09-08T08:00:00Z', leitungskonten: 1, leitungMitMail: 0, notzugangBis: bis(4), testbetrieb: false, deaktiviertAm: null, deaktiviertGrund: null, exportAm: null, loeschungGeplantFuer: null, echteDaten: null },
  { kennung: 'test-nord', name: 'Testbetrieb Nord', angelegtAm: '2026-10-02T08:00:00Z', leitungskonten: 1, leitungMitMail: 1, notzugangBis: null, testbetrieb: true, deaktiviertAm: '2026-10-20T08:00:00Z', deaktiviertGrund: 'Test abgeschlossen', exportAm: null, loeschungGeplantFuer: null, echteDaten: null },
];
export const plattformGeloescht = [{ kennung: 'demo-alt', name: 'Vorführbetrieb Alt', geloeschtAm: '2026-10-12T08:00:00Z', testbetrieb: true }];
export const plattformFreigaben = [
  { id: 'freigabe-1', company_id: 'mustertechnik', name: plattformBetriebe[0].name, grund: 'Rückfrage zur Angebotsdarstellung', notzugang: false, stufe: 'ansehen', gilt_bis: bis(24) },
  { id: 'freigabe-2', company_id: 'beispiel', name: plattformBetriebe[1].name, grund: 'Einziges Leitungskonto ausgesperrt', notzugang: true, stufe: 'ansehen', gilt_bis: bis(4) },
];
export const plattformFehler = [
  { id: 'meldung-1', art: 'meldung', companyId: 'mustertechnik', betrieb: 'Mustertechnik Installationen GmbH', wer: 'Andrea Muster', beschreibung: 'Fiktive Rückfrage zur PDF-Vorschau am Telefon.', pfad: '/quotes', fassung: 'vorschau', createdAt: jetzt - 3_600_000 },
  { id: 'fehler-1', art: 'absturz', nachricht: 'Fiktiver technischer Fehler – kein Produktbefund', pfad: '/projects', fassung: 'vorschau', geraet: 'Beispielgerät', stapel: 'Error: Fiktiver Fehler\n  at BeispielAnsicht (beispiel.js:42:8)', createdAt: jetzt - 1_800_000 },
];
export const plattformKonten = [{ uid: 'beispiel-leitung', name: 'Robin Beispiel', benutzername: 'robin.beispiel', rolle: 'Geschäftsführung' }];
export const plattformProtokoll = [{ aktion: 'deaktiviert', am: '2026-10-20T08:00:00Z', grund: 'Fiktiver Antrag des Betriebs' }];
