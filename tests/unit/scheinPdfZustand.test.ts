// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/*
  Wie in `pdfUnveraendert`: unter Node ist der Default von `jspdf-autotable`
  ein Objekt statt einer Funktion. Der Ersatz zeichnet nichts und meldet nur
  die Endhoehe — geprueft wird der Kopf, und der entsteht davor.
*/
/** Die Zeilen, die die Tabellen bekommen hätten — für die Schreibweise der Menge. */
const tabellen: unknown[][][] = [];
vi.mock('jspdf-autotable', () => ({
  default: (
    doc: { lastAutoTable?: { finalY: number } },
    opts: { startY?: number; body?: unknown[][] },
  ) => {
    tabellen.push(opts.body ?? []);
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

  /*
    Bis zum Prüflauf 25.09.2026 hiess dieser Test „schreibt dem gewoehnlichen
    Entwurf keinen Vermerk aufs Blatt" — genau das war der Befund P1-13: ein
    Entwurf ohne Kennzeichnung, dazu „Elektronisch unterschrieben" im Fuss.
    Er prüft jetzt nur noch, dass kein FREMDER Vermerk dasteht; der eigene
    steht im Test darunter.
  */
  it('schreibt dem gewoehnlichen Entwurf keinen Verworfen- oder Storno-Vermerk aufs Blatt', async () => {
    const s = await text(basis);
    expect(s).not.toContain('VERWORFENER ENTWURF');
    expect(s).not.toContain('STORNIERT');
    // Der Beleg selbst steht aber da.
    expect(s).toContain('Handwerksschein');
    expect(s).toContain('Familie Huber');
  });
});

/** Wo ein Text steht — in Millimetern von oben, je Zeichenbefehl. */
function positionen(pdf: string): { y: number; text: string }[] {
  return [...pdf.matchAll(/([\d.]+) ([\d.]+) Td\n\((.*?)\) Tj/g)].map((m) => ({
    y: 297 - (Number(m[2]) * 25.4) / 72,
    text: m[3],
  }));
}

describe('Prüflauf 25.09.2026', () => {
  it('P1-13: kennzeichnet den Entwurf und sagt nicht „Elektronisch unterschrieben"', async () => {
    const s = await text(basis);
    expect(s).toContain('ENTWURF \u2014 kein g');
    expect(s).not.toContain('Elektronisch unterschrieben');
  });

  it('P1-13: der unterschriebene Schein trägt den Fusssatz, aber keinen Entwurfsvermerk', async () => {
    const s = await text({ ...basis, status: 'Unterschrieben', inhaltHash: 'abc123' });
    expect(s).toContain('Elektronisch unterschrieben');
    expect(s).not.toContain('ENTWURF');
  });

  it('P1-12: bricht einen langen Schein um — Fuss und Prüfsumme auf jeder Seite, nichts darüber', async () => {
    const s = await text({
      ...basis,
      status: 'Unterschrieben',
      inhaltHash: 'abc123',
      notizen: Array.from({ length: 60 }, (_, i) => `Anmerkung ${i + 1}`).join('\n'),
      unterschriften: {
        monteur: { name: 'Max Mustermann', bild: 'data:kaputt', geraetZeit: 1 },
        kunde: { name: 'Frau Huber', bild: 'data:kaputt', geraetZeit: 1 },
      },
    });
    expect(s).toContain('Seite 2 von 2');
    expect(s.split('abc123').length - 1).toBe(2);
    const fuss = /^(Prüfsumme|Elektronisch|Seite )/;
    const inhalt = positionen(s).filter((p) => !fuss.test(p.text));
    expect(inhalt.find((p) => p.text === 'Anmerkung 60')).toBeDefined();
    expect(inhalt.find((p) => p.text === 'Kunde: Frau Huber')).toBeDefined();
    // Alles, was kein Fuss ist, endet über ihm (285 mm).
    for (const p of inhalt) expect(p.y, p.text).toBeLessThanOrEqual(280);
  });

  it('P1-12: schreibt die Menge deutsch — „2,5 m", nicht „2.5 m"', async () => {
    tabellen.length = 0;
    await text({ ...basis, material: [{ name: 'Kupferrohr', menge: 2.5, einheit: 'm' }] });
    const material = tabellen.find((t) => t[0]?.[0] === 'Kupferrohr');
    expect(material?.[0][1]).toBe('2,5 m');
  });
});
