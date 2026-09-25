// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/*
  Wie in `pdfUnveraendert`: unter Node ist der Default von `jspdf-autotable`
  ein Objekt statt einer Funktion. Der Ersatz zeichnet nichts und meldet nur
  die Endhoehe — geprueft wird der Kopf, und der entsteht davor.
*/
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number }) => {
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { buildWorkSheetPdf } from '@/features/worksheets/worksheetPdf';
import type { WorkSheet } from '@/types';

/**
 * DER ZUSTAND MUSS AUF DEM PAPIER STEHEN, nicht nur in der Liste.
 *
 * Das PDF eines Entwurfs laesst sich erzeugen, ehe jemand ihn verwirft — und
 * ein Blatt ohne Kennzeichnung sieht aus wie ein gueltiger Beleg. Genau das
 * ist der Grund, warum der Storno seinen Vermerk traegt; fuer den
 * aufgegebenen Entwurf gilt dasselbe.
 */

const basis: WorkSheet = {
  id: 's1',
  companyId: 'perl',
  projectNumber: 'B-001',
  customerName: 'Familie Huber',
  address: 'Hauptstraße 12',
  datum: '2026-09-04',
  status: 'Entwurf',
  abrechnung: 'Regie',
  zeiten: [{ datum: '2026-09-04', mitarbeiter: 'Max Mustermann', minuten: 300 }],
  material: [],
  erstelltVonUid: 'm1',
  erstelltVonName: 'Max Mustermann',
};

const betrieb = { name: 'Perl Installationen GmbH' };

/**
 * Der Textstrom des PDFs. jsPDF schreibt die Zeichenbefehle unkomprimiert;
 * jedes gezeichnete Wort steht als eigener Befehl darin.
 */
async function text(schein: WorkSheet): Promise<string> {
  const blob = await buildWorkSheetPdf(schein, betrieb);
  // jsdom kennt `Blob.arrayBuffer()` in dieser Fassung noch nicht; der
  // FileReader ist der Weg, den auch der Browser dieser Baujahre geht.
  return await new Promise<string>((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsText(blob, 'latin1');
  });
}

describe('Der Zustand des Scheins im PDF', () => {
  it('kennzeichnet den verworfenen Entwurf', async () => {
    const s = await text({ ...basis, status: 'Verworfen', verworfenVonName: 'Max' });
    expect(s).toContain('VERWORFENER ENTWURF');
    expect(s).toContain('kein g');
  });

  it('kennzeichnet den Storno weiterhin, und mit seinem Grund', async () => {
    // Der bestehende Vermerk darf durch den neuen nicht verdraengt werden.
    const s = await text({ ...basis, status: 'Storniert', stornoGrund: 'Zahlendreher' });
    expect(s).toContain('STORNIERT');
    expect(s).toContain('Zahlendreher');
    expect(s).not.toContain('VERWORFENER ENTWURF');
  });

  it('schreibt dem gewoehnlichen Entwurf keinen Vermerk aufs Blatt', async () => {
    const s = await text(basis);
    expect(s).not.toContain('VERWORFENER ENTWURF');
    expect(s).not.toContain('STORNIERT');
    // Der Beleg selbst steht aber da.
    expect(s).toContain('Handwerksschein');
    expect(s).toContain('Familie Huber');
  });
});

/**
 * DAS GESPEICHERTE UNTERSCHRIFTSBILD GEHT UNVERÄNDERT INS PDF.
 *
 * Seit dem 25.09.2026 entstehen neue Bilder auf einer festen Fläche von
 * 700 × 250 Pixeln (`unterschriftExport.ts`) — genau im Verhältnis des
 * Felds hier. Das PDF selbst ist dabei unverändert: es setzt den Text aus
 * dem Schein, ob alt oder neu, in dasselbe Feld von 70 × 25 mm. Ein alter
 * Schein sieht auf Papier also aus wie vorher.
 */
describe('Die Unterschrift im PDF', () => {
  it('setzt das gespeicherte Bild unverändert in das Feld von 70 × 25 mm', async () => {
    const { jsPDF } = await import('jspdf');
    // `addImage` hängt als Erweiterung an `jsPDF.API`; die Typen kennen es dort nicht.
    const api = jsPDF.API as unknown as { addImage: (...a: unknown[]) => unknown };
    const gesetzt: unknown[][] = [];
    const vorher = api.addImage;
    api.addImage = function (this: unknown, ...a: unknown[]) {
      gesetzt.push(a);
      return this;
    };
    try {
      await text({
        ...basis,
        status: 'Unterschrieben',
        unterschriften: {
          monteur: { name: 'Max Mustermann', bild: 'data:image/png;base64,ALTESBILD', geraetZeit: 1 },
          kunde: { name: 'Josef Huber', bild: 'data:image/png;base64,NEUESBILD', geraetZeit: 2 },
        },
      });
    } finally {
      api.addImage = vorher;
    }
    const bilder = gesetzt.filter((a) => String(a[0]).startsWith('data:image/png;base64,'));
    expect(bilder.map((a) => [a[0], a[1], a[4], a[5]])).toEqual([
      ['data:image/png;base64,ALTESBILD', 'PNG', 70, 25],
      ['data:image/png;base64,NEUESBILD', 'PNG', 70, 25],
    ]);
  });
});
