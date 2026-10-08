/* Ein Eintrag im Fehlerprotokoll der Plattformseite (Bestandsaufnahme). Siehe `plattform.js`. */
export * from '../../../../tools/vorschau/db/fehlerprotokoll';

export const plattformFehler = () =>
  Promise.resolve([
    {
      id: 'e1', companyId: 'perl', betrieb: 'Perl Installationen GmbH', art: 'meldung',
      nachricht: 'Rechnung lässt sich nicht drucken', stapel: null, pfad: '/invoices',
      fassung: 'vorschau', geraet: 'Chrome 140 · Windows', beschreibung: 'Der Knopf reagiert nicht.',
      createdAt: Date.parse('2026-10-06T14:00:00Z'), wer: 'Michaela Wagner',
    },
  ]);
