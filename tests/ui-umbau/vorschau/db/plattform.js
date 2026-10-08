/*
 * Beispieldaten für die Plattformseite des globalen Admins (Bestandsaufnahme).
 *
 * Die erzeugten Stubs der Vorschau liefern hier `undefined` — die Seite
 * stürzt damit ab, und ihr Bestand wäre leer. Absichtlich `.js`: die
 * erzeugten Stubs liegen nicht im Repository, und `tsc` prüft `tests/` mit.
 * Je ein Betrieb in jedem Zustand, damit jede Zeile und jede Aktion einmal
 * zu sehen ist.
 */
export * from '../../../../tools/vorschau/db/plattform';

const A = (v) => Promise.resolve(v);

const BETRIEBE = [
  {
    kennung: 'perl', name: 'Perl Installationen GmbH', angelegtAm: '2026-09-11T08:00:00Z',
    leitungskonten: 2, leitungMitMail: 2, notzugangBis: null, testbetrieb: false,
    deaktiviertAm: null, deaktiviertGrund: null, exportAm: '2026-10-01T06:00:00Z',
    loeschungGeplantFuer: null, echteDaten: 'er hat Rechnungen',
  },
  {
    kennung: 'vorfuehrung', name: 'Vorführbetrieb Installationen', angelegtAm: '2026-09-20T08:00:00Z',
    leitungskonten: 1, leitungMitMail: 0, notzugangBis: '2026-10-08T18:00:00Z', testbetrieb: true,
    deaktiviertAm: null, deaktiviertGrund: null, exportAm: null, loeschungGeplantFuer: null, echteDaten: null,
  },
  {
    kennung: 'alt', name: 'Altbetrieb Haustechnik', angelegtAm: '2026-09-12T08:00:00Z',
    leitungskonten: 1, leitungMitMail: 1, notzugangBis: null, testbetrieb: false,
    deaktiviertAm: '2026-10-02T08:00:00Z', deaktiviertGrund: 'Vertrag gekündigt',
    exportAm: '2026-10-02T08:30:00Z', loeschungGeplantFuer: '2026-11-02T08:30:00Z', echteDaten: 'er hat Zeiten',
  },
];

export const plattformBetriebe = () => A(BETRIEBE);
export const geloeschteBetriebe = () =>
  A([{ kennung: 'probe', name: 'Probebetrieb', geloeschtAm: '2026-09-30T10:00:00Z', testbetrieb: true }]);
export const betriebProtokoll = () =>
  A([
    { kennung: 'alt', aktion: 'deaktiviert', grund: 'Vertrag gekündigt', am: '2026-10-02T08:00:00Z', angaben: {} },
    { kennung: 'alt', aktion: 'export', grund: null, am: '2026-10-02T08:30:00Z', angaben: {} },
  ]);
export const leitungskontenImNotzugang = () => A([]);
export const leitungMitZweitemFaktor = () => A([]);
