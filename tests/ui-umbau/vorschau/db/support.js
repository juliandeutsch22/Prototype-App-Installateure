/*
 * Supportfreigaben für die Bestandsaufnahme. Siehe `plattform.js`.
 *
 * NUR IM SUPPORTMODUS EINE OFFENE FREIGABE (`einblick=` in der Adresse): dann
 * steht das Band „Support sieht mit“ über jeder Seite, wie im Betrieb. Ohne
 * den Parameter bleibt alles wie in der Vorschau, damit die übrigen Rollen
 * dieselbe Oberfläche zeigen wie dort.
 */
export * from '../../../../tools/vorschau/db/support';
import * as vorschau from '../../../../tools/vorschau/db/support';

const A = (v) => Promise.resolve(v);
const stufe = new URLSearchParams(location.search).get('einblick');

const OFFEN = {
  id: 'f1', company_id: 'perl', name: 'Perl Installationen GmbH',
  grund: 'Rückfrage zur Rechnung 2026-0231', notzugang: false,
  stufe: stufe ?? 'ansehen', gilt_bis: '2026-10-08T18:00:00Z',
};

export const offeneFreigaben = () => A([OFFEN]);
export const freigaben = stufe
  ? () =>
      A([{
        id: 'f1', companyId: 'perl', gewaehrtVon: 'u4', grund: OFFEN.grund, notzugang: false,
        stufe, giltBis: Date.parse('2026-10-08T18:00:00Z'), widerrufenAm: null,
        createdAt: Date.parse('2026-10-07T07:00:00Z'),
      }])
  : vorschau.freigaben;
