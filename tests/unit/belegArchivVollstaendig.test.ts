// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Company, Invoice, Quote, WorkSheet } from '@/types';
import { belegArchiv, ersterBelegTag } from '@/features/invoices/belegArchiv';

vi.mock('jspdf-autotable', () => ({ default: (doc: { lastAutoTable?: { finalY: number } }) => {
  doc.lastAutoTable = { finalY: 110 };
} }));

const company = { id: 'archiv', name: 'Archivbetrieb' } as Company;
const angebot: Quote = {
  id: 'q1', kalkulierteStunden: 1,
  companyId: 'archiv', quoteNumber: 'AN-2026-0001', customerName: 'Familie Nord',
  address: 'Ring 1, 1010 Wien', quoteDate: '2026-02-01', validUntil: '2026-03-01', status: 'Versendet',
  positions: [{ label: 'Arbeit', qty: 1, unit: 'h', unitPrice: 100, netto: 100 }],
  subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2,
};
const schein: WorkSheet = {
  id: 's1', companyId: 'archiv', projectNumber: 'B-1', customerName: 'Familie Nord',
  address: 'Ring 1, 1010 Wien', datum: '2026-03-02', status: 'Unterschrieben', abrechnung: 'Regie',
  zeiten: [{ datum: '2026-03-02', mitarbeiter: 'Max', minuten: 60 }], material: [],
  erstelltVonUid: 'm1', erstelltVonName: 'Max', inhaltHash: 'eingefrorener-beleg',
};
const original = '%PDF-1.4\nUnveränderte ursprüngliche Mahnung\n%%EOF';
const mahnung = {
  id: 'm1', companyId: 'archiv', invoiceId: 'r1', invoiceNumber: 'RE-2025-0001',
  stufe: 2, datum: '2026-04-01', frist: '2026-04-15', spesen: 5, pdfBase64: btoa(original),
};
const basis = { company, rechnungen: [], kunden: [], von: '2026-01-01', bis: '2026-12-31' };

async function entpacken(blob: Blob) {
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.readAsArrayBuffer(blob);
  });
  const v = new DataView(buffer);
  const ende = buffer.byteLength - 22;
  let p = v.getUint32(ende + 16, true);
  const dateien = new Map<string, Uint8Array>();
  for (let i = 0; i < v.getUint16(ende + 10, true); i++) {
    const n = v.getUint16(p + 28, true), offset = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, n));
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    dateien.set(name, new Uint8Array(buffer.slice(start, start + v.getUint32(p + 24, true))));
    p += 46 + n;
  }
  return dateien;
}

describe('Vollständiges Belegarchiv', () => {
  it('enthält Angebote, unterschriebene und stornierte Scheine sowie unveränderte Originalmahnungen', async () => {
    const e = await belegArchiv({ ...basis, angebote: [angebot], scheine: [schein,
      { ...schein, id: 's2', status: 'Storniert', stornoGrund: 'Auftrag geändert' }], mahnbelege: [mahnung] });
    const d = await entpacken(e.blob);
    expect([...d.keys()]).toEqual(expect.arrayContaining([
      'Angebote/Angebot_AN-2026-0001.pdf', 'Scheine/Handwerksschein_s1.pdf',
      'Scheine/Handwerksschein_s2.pdf', 'Mahnungen/RE-2025-0001_Stufe-2_2026-04-01.pdf',
    ]));
    expect(d.get('Mahnungen/RE-2025-0001_Stufe-2_2026-04-01.pdf')).toEqual(Uint8Array.from(atob(mahnung.pdfBase64), (c) => c.charCodeAt(0)));
    expect(new TextDecoder('latin1').decode(d.get('Scheine/Handwerksschein_s2.pdf'))).toContain('STORNIERT');
    expect(e).toMatchObject({ angebote: 1, scheine: 2, mahnungen: 1 });
  });

  it('filtert jeden Beleg nach seinem eigenen Datum und schließt offene Scheinentwürfe aus', async () => {
    const e = await belegArchiv({ ...basis,
      angebote: [{ ...angebot, quoteDate: '2025-12-31' }],
      scheine: [{ ...schein, datum: '2027-01-01' }, { ...schein, status: 'Entwurf' }],
      mahnbelege: [{ ...mahnung, datum: '2025-12-31' }],
    });
    expect([...(await entpacken(e.blob)).keys()].filter((n) => n.endsWith('.pdf'))).toEqual([]);
  });

  it('nennt nicht gespeicherte alte Mahnstufen, ohne Originale zu erfinden', async () => {
    const r = { invoiceNumber: 'RE-2025-0001', invoiceDate: '2025-01-01', mahnstufe: 2,
      gemahntAm: '2026-04-01', paymentStatus: 'Offen' } as Invoice;
    const e = await belegArchiv({ ...basis, rechnungen: [r], mahnbelege: [mahnung] });
    expect(e.hinweise).toEqual(expect.arrayContaining([expect.stringMatching(/RE-2025-0001.*Stufe 1.*nicht gespeichert/)]));
    const names = [...(await entpacken(e.blob)).keys()].filter((n) => n.startsWith('Mahnungen/'));
    expect(names).toHaveLength(1);
  });

  it('beginnt Alle Belege auch ohne Rechnung beim ersten Angebot, Schein oder Mahnbeleg', () => {
    expect(ersterBelegTag([], '2026-12-31', { angebote: [angebot], scheine: [schein], mahnbelege: [mahnung] }))
      .toBe('2026-02-01');
  });
});
