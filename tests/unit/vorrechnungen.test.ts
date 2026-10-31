/**
 * Der Abzug auf der Schlussrechnung.
 *
 * Geprüft wird hier die RECHENSEITE. Dass die Datenbank denselben Abzug noch
 * einmal nachrechnet und einen falschen abweist, steht in
 * `tests/supabase/rechnungsarten.test.ts` — beides ist nötig: die Ansicht
 * muss die richtige Zahl anzeigen, bevor jemand auf „Anlegen" drückt, und die
 * Datenbank muss sie halten, wenn jemand anders schreibt.
 */
import { describe, it, expect } from 'vitest';
import {
  abziehbar, alsVorrechnung, abzugssumme, gueltigeSchlussrechnung, mitAbzug, nachSteuer, schlussNachStorno, stornoText,
  teilrechnungenText,
} from '@/features/invoices/vorrechnungen';
import type { Invoice } from '@/types';

type R = Invoice & { id: string };

function rechnung(over: Partial<R> = {}): R {
  return {
    id: 'r1',
    companyId: 'c',
    invoiceNumber: 'RE-2026-1001',
    projectNumber: '2026-001',
    customerName: 'Huber',
    invoiceDate: '2026-04-30',
    dueDate: '2026-05-14',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    paymentStatus: 'Offen',
    ...over,
  };
}

describe('Was sich abziehen lässt', () => {
  it('nimmt die Anzahlung derselben Baustelle', () => {
    const a = rechnung({ id: 'a', art: 'anzahlung' });
    expect(abziehbar([a], '2026-001').map((x) => x.id)).toEqual(['a']);
  });

  it('gleicht das Präfix der Baustellennummer an', () => {
    // Altbestände schreiben mal „2026-001", mal „PR-2026-001". Ohne die
    // Angleichung stünde die Anzahlung nicht zur Auswahl — und die
    // Schlussrechnung forderte die volle Leistung ein zweites Mal.
    const a = rechnung({ id: 'a', projectNumber: 'PR-2026-001', art: 'anzahlung' });
    expect(abziehbar([a], '2026-001').map((x) => x.id)).toEqual(['a']);
  });

  it('lässt eine Rechnung liegen, die Belege verbraucht hat', () => {
    /*
      DER DOPPELTE ABZUG. Eine Teilrechnung über einen abgeschlossenen
      Bauabschnitt hat dessen Zeiteinträge verbraucht — sie stehen in der
      Schlussrechnung gar nicht mehr. Ihre Summe ist schon heraussen; ein
      Abzug zöge sie ein zweites Mal ab.
    */
    const t = rechnung({ id: 't', art: 'teil', linkedEntries: ['e1'] });
    expect(abziehbar([t], '2026-001')).toEqual([]);

    const s = rechnung({ id: 's', art: 'teil', linkedWorkSheets: ['s1'] });
    expect(abziehbar([s], '2026-001')).toEqual([]);

    const m = rechnung({ id: 'm', art: 'teil', linkedOrders: ['o1'] });
    expect(abziehbar([m], '2026-001')).toEqual([]);
  });

  it('lässt eine fremde Baustelle und eine stornierte Rechnung liegen', () => {
    const fremd = rechnung({ id: 'f', projectNumber: '2026-999', art: 'anzahlung' });
    const storniert = rechnung({ id: 'x', art: 'anzahlung', paymentStatus: 'Storniert' });
    expect(abziehbar([fremd, storniert], '2026-001')).toEqual([]);
  });

  it('bietet keine Anzahlung an, die schon abgezogen ist', () => {
    const a = rechnung({ id: 'a', art: 'anzahlung' });
    const schluss = rechnung({
      id: 's',
      art: 'schluss',
      vorrechnungen: [alsVorrechnung(a)],
    });
    expect(abziehbar([a, schluss], '2026-001').map((x) => x.id)).toEqual(['s']);
  });

  it('gibt die Anzahlung wieder frei, wenn die Schlussrechnung storniert ist', () => {
    const a = rechnung({ id: 'a', art: 'anzahlung' });
    const schluss = rechnung({
      id: 's',
      art: 'schluss',
      paymentStatus: 'Storniert',
      vorrechnungen: [alsVorrechnung(a)],
    });
    expect(abziehbar([a, schluss], '2026-001').map((x) => x.id)).toEqual(['a']);
  });
});

describe('Der Abzug selbst', () => {
  it('kopiert Nummer, Datum und Beträge der abgezogenen Rechnung', () => {
    const a = rechnung({ id: 'a', invoiceNumber: 'RE-2026-1007', art: 'anzahlung' });
    expect(alsVorrechnung(a)).toEqual({
      invoiceId: 'a',
      invoiceNumber: 'RE-2026-1007',
      invoiceDate: '2026-04-30',
      netto: 1000,
      vat: 200,
      brutto: 1200,
    });
  });

  it('summiert mehrere Anzahlungen auf den Cent', () => {
    const summe = abzugssumme([
      { invoiceId: 'a', invoiceNumber: 'A', invoiceDate: '2026-01-01', netto: 333.33, vat: 66.67, brutto: 400 },
      { invoiceId: 'b', invoiceNumber: 'B', invoiceDate: '2026-02-01', netto: 333.33, vat: 66.67, brutto: 400 },
    ]);
    expect(summe).toEqual({ netto: 666.66, vat: 133.34, brutto: 800 });
  });
});

describe('Was die Schlussrechnung fordert', () => {
  it('zieht Entgelt UND Steuer ab, nicht nur den Bruttobetrag', () => {
    /*
      GENAU HIER SITZT DIE STEUERFALLE. Zöge man nur das Brutto ab und liesse
      die volle Steuer stehen, wäre dieselbe Steuer zweimal ausgewiesen — und
      der Betrieb schuldet sie zweimal (§ 11 Abs 12 UStG).
    */
    const anzahlung = { invoiceId: 'a', invoiceNumber: 'A', invoiceDate: '2026-01-01', netto: 1000, vat: 200, brutto: 1200 };
    const r = mitAbzug({ totalNetto: 3000, totalVat: 600, totalBrutto: 3600 }, [anzahlung]);

    expect(r.gesamtNetto).toBe(3000);
    expect(r.gesamtVat).toBe(600);
    expect(r.gesamtBrutto).toBe(3600);
    expect(r.abzug).toEqual({ netto: 1000, vat: 200, brutto: 1200 });
    expect(r.totalNetto).toBe(2000);
    expect(r.totalVat).toBe(400);
    expect(r.totalBrutto).toBe(2400);
    expect(r.gutschrift).toBe(false);
  });

  it('lässt ohne Abzug alles, wie es war', () => {
    const r = mitAbzug({ totalNetto: 3000, totalVat: 600, totalBrutto: 3600 }, []);
    expect(r.totalBrutto).toBe(3600);
    expect(r.abzug).toEqual({ netto: 0, vat: 0, brutto: 0 });
  });

  it('benennt die Gutschrift, statt sie auf null zu kappen', () => {
    // Gekappt verschwände der Betrag, den der Betrieb dem Kunden
    // zurückschuldet — lautlos und zu seinen Gunsten.
    const anzahlung = { invoiceId: 'a', invoiceNumber: 'A', invoiceDate: '2026-01-01', netto: 1000, vat: 200, brutto: 1200 };
    const r = mitAbzug({ totalNetto: 800, totalVat: 160, totalBrutto: 960 }, [anzahlung]);
    expect(r.gutschrift).toBe(true);
    expect(r.totalBrutto).toBe(-240);
  });

  it('rechnet auf den Cent, nicht auf Gleitkommastellen', () => {
    const anzahlung = { invoiceId: 'a', invoiceNumber: 'A', invoiceDate: '2026-01-01', netto: 0.1, vat: 0.02, brutto: 0.12 };
    const r = mitAbzug({ totalNetto: 0.3, totalVat: 0.06, totalBrutto: 0.36 }, [anzahlung]);
    expect(r.totalNetto).toBe(0.2);
  });
});

/*
  PRÜFLAUF 25.09.2026, P2-08: eine Anzahlung mit USt auf einer
  Reverse-Charge-Schlussrechnung abzuziehen zieht Steuer von einem Betrag ohne
  Steuer ab. Angeboten wird nur, was dieselbe Steuerbehandlung trägt.
*/
describe('Abzug nur bei derselben Steuerbehandlung', () => {
  const mitUst = rechnung({ id: 'u', invoiceNumber: 'RE-2026-1001' });
  const rc = rechnung({ id: 'r', invoiceNumber: 'RE-2026-1002', reverseCharge: true, totalVat: 0, totalBrutto: 1000 });
  const altbestand = rechnung({ id: 'x', invoiceNumber: 'RE-2026-1003', reverseCharge: undefined });

  it('trennt nach Reverse Charge', () => {
    const ohne = nachSteuer([mitUst, rc, altbestand], false);
    expect(ohne.passend.map((r) => r.id)).toEqual(['u', 'x']);
    expect(ohne.andere.map((r) => r.id)).toEqual(['r']);

    const mit = nachSteuer([mitUst, rc, altbestand], true);
    expect(mit.passend.map((r) => r.id)).toEqual(['r']);
    expect(mit.andere.map((r) => r.id)).toEqual(['u', 'x']);
  });
});

/*
  TESTBERICHT RUNDE 6, M7, G27 und Hinweis 8 — Schlussrechnung und Storno.
*/
describe('Schlussrechnung und Storno (Runde 6)', () => {
  const r = (id: string, art: Invoice['art'], teil: Partial<Invoice> = {}) =>
    ({
      id, invoiceNumber: `RE-${id}`, art, projectNumber: 'PR-2026-0194', paymentStatus: 'Offen',
      invoiceDate: '2026-10-21', ...teil,
    }) as Invoice;

  it('findet die gültige Schlussrechnung der Baustelle, in jeder Schreibweise der Nummer', () => {
    expect(gueltigeSchlussrechnung([r('1', 'teil'), r('2', 'schluss')], '2026-0194')?.invoiceNumber).toBe('RE-2');
    expect(gueltigeSchlussrechnung([r('2', 'schluss', { paymentStatus: 'Storniert' })], '2026-0194')).toBeNull();
    expect(gueltigeSchlussrechnung([r('2', 'schluss', { projectNumber: '2026-0195' })], '2026-0194')).toBeNull();
  });

  it('beim Storno: die Schlussrechnung zieht die Anzahlung ab', () => {
    const anz = r('1508', 'anzahlung');
    const schluss = r('1510', 'schluss', { vorrechnungen: [{ invoiceId: '1508' } as never] });
    expect(schlussNachStorno(anz, [anz, schluss])).toMatchObject({ schluss: { invoiceNumber: 'RE-1510' }, abgezogen: true });
  });

  it('beim Storno: die Schlussrechnung rechnet nach der Teilrechnung ab', () => {
    const teil = r('1509', 'teil', { invoiceDate: '2026-10-21' });
    const schluss = r('1510', 'schluss', { invoiceDate: '2026-10-27' });
    expect(schlussNachStorno(teil, [teil, schluss])).toMatchObject({ schluss: { invoiceNumber: 'RE-1510' }, abgezogen: false });
  });

  it('Gleichbleiben: ohne gültige Schlussrechnung, bei einer Einzelrechnung und bei nicht abgezogener Anzahlung nichts', () => {
    const teil = r('1509', 'teil');
    expect(schlussNachStorno(teil, [teil])).toBeNull();
    expect(schlussNachStorno(teil, [teil, r('1510', 'schluss', { paymentStatus: 'Storniert' })])).toBeNull();
    expect(schlussNachStorno(r('9', 'einzel'), [r('1510', 'schluss')])).toBeNull();
    expect(schlussNachStorno(r('1508', 'anzahlung'), [r('1510', 'schluss')])).toBeNull();
  });

  it('der Storno-Text passt zur Art: eine Anzahlung gibt nichts frei', () => {
    expect(stornoText(r('1508', 'anzahlung'))).toBe(
      'RE-1508 wird storniert. Eine Anzahlung verrechnet keine Stunden und kein Material — freigegeben wird deshalb nichts.',
    );
    expect(stornoText(r('1509', 'teil', { linkedEntries: ['z1'], linkedWorkSheets: ['s1'] })))
      .toBe('RE-1509 wird storniert; die verknüpften Zeiteinträge und Scheine werden wieder freigegeben.');
    expect(stornoText(r('1510', 'schluss', { vorrechnungen: [{ invoiceId: '1508' } as never] })))
      .toMatch(/Die abgezogenen Rechnungen lassen sich danach wieder abziehen\.$/);
  });

  /*
    TESTBERICHT RUNDE 7, R7-G2: bei einer Pauschal-Teilrechnung ohne
    Zeiteinträge stand, „die verknüpften Zeiteinträge und Scheine“ würden frei.
  */
  it('nennt nur, was die Rechnung wirklich verknüpft', () => {
    expect(stornoText(r('1511', 'teil', { linkedEntries: [], linkedWorkSheets: [] })))
      .toBe('RE-1511 wird storniert. Sie verknüpft keine Zeiteinträge und keine Scheine — freigegeben wird deshalb nichts.');
    expect(stornoText(r('1512', 'einzel', { linkedEntries: ['z1'], linkedWorkSheets: [] })))
      .toBe('RE-1512 wird storniert; die verknüpften Zeiteinträge werden wieder freigegeben.');
    expect(stornoText(r('1513', 'einzel', { linkedEntries: [], linkedWorkSheets: ['s1'] })))
      .toBe('RE-1513 wird storniert; die verknüpften Scheine werden wieder freigegeben.');
  });

  it('Gegenprobe: kennt die Zeile ihre Verknüpfungen nicht, behauptet sie nichts', () => {
    const kopf = { invoiceNumber: 'RE-1514', art: 'teil' as const, vorrechnungen: undefined };
    expect(stornoText(kopf)).toBe('RE-1514 wird storniert; was sie verrechnet hat, wird wieder freigegeben.');
  });

  it('nennt die Teilrechnungen, die ihre Belege verbraucht haben — nur nennen, nicht abziehen', () => {
    expect(teilrechnungenText([
      r('1509', 'teil', { leistungBis: '2026-10-20', linkedEntries: ['z1'] }),
      r('1507', 'teil'), // ohne Belege: wird abgezogen, nicht genannt
      r('1506', 'teil', { linkedWorkSheets: ['s'], paymentStatus: 'Storniert' }),
      r('1508', 'anzahlung'),
    ], '2026-0194')).toBe(
      'Bereits mit Teilrechnung RE-1509 vom 21.10.2026 (Leistung bis 20.10.2026) verrechnet und hier nicht enthalten.',
    );
    expect(teilrechnungenText([r('1508', 'anzahlung')], '2026-0194')).toBeNull();
  });
});
