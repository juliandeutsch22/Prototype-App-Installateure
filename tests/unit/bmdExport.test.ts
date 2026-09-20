import { describe, it, expect } from 'vitest';
import { buildBmdCsv, type Buchungskonto } from '@/features/invoices/bmdExport';
import type { Invoice, Vorrechnung } from '@/types';

/**
 * Der Buchungsstapel für BMD.
 *
 * DAS JOURNAL BESCHREIBT, DIESE DATEI BUCHT. Der Unterschied ist die ganze
 * Gefahr: eine falsch kontierte Zeile importiert sich fehlerfrei und fällt
 * frühestens beim Jahresabschluss auf. Fast jede Prüfung hier fragt deshalb,
 * ob lieber GAR NICHTS herauskommt, als etwas Plausibles.
 */

const KONTEN: Buchungskonto[] = [
  { zweck: 'debitoren', konto: '2000' },
  { zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
  { zweck: 'erloes', ustSatz: 0, konto: '4009', steuercode: 'M00' },
  { zweck: 'reverse_charge', konto: '4005', steuercode: 'M00' },
  { zweck: 'anzahlung', konto: '3500', steuercode: 'M20' },
];

const rechnung = (p: Partial<Invoice> = {}): Invoice =>
  ({
    id: p.invoiceNumber ?? 'i1',
    companyId: 'perl',
    invoiceNumber: 'RE-2026-0001',
    projectNumber: 'B-200',
    customerName: 'Familie Huber',
    invoiceDate: '2026-04-30',
    dueDate: '2026-05-14',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    ...p,
  }) as Invoice;

const bauen = (rechnungen: Invoice[], konten = KONTEN, von = '2026-04-01', bis = '2026-04-30') =>
  buildBmdCsv(rechnungen, konten, von, bis);

describe('Eine gewöhnliche Rechnung', () => {
  it('bucht Debitor an Erlöskonto, brutto, mit Steuercode', () => {
    const e = bauen([rechnung()]);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      {
        soll: '2000',
        haben: '4000',
        belegdatum: '30.04.2026',
        belegnummer: 'RE-2026-0001',
        buchungstext: 'Familie Huber / B-200',
        betrag: 1200,
        steuercode: 'M20',
      },
    ]);
  });

  it('schreibt Datum und Betrag so, wie BMD sie liest', () => {
    // TT.MM.JJJJ und Komma. Ein ISO-Datum liest BMD als Text, und aus
    // „1200.00" wird beim Import je nach Einstellung 120000.
    const e = bauen([rechnung()]);
    expect(e.csv.split('\r\n')[1]).toBe('2000;4000;30.04.2026;RE-2026-0001;Familie Huber / B-200;1200,00;M20');
  });

  it('nimmt für Bauleistungen das Konto für den Übergang der Steuerschuld', () => {
    /*
      § 19 Abs 1a UStG ist nicht „0 % Umsatzsteuer". Beides ergibt 0,00 € und
      bedeutet etwas anderes: der eine Umsatz ist steuerfrei, beim anderen
      schuldet der EMPFÄNGER die Steuer. In der UVA stehen sie getrennt.
    */
    const e = bauen([rechnung({ reverseCharge: true, vatRate: 0, totalVat: 0, totalBrutto: 1000 })]);
    expect(e.zeilen[0]).toMatchObject({ haben: '4005', betrag: 1000 });
  });

  it('nimmt für 0 % ohne Bauleistung das Erlöskonto für 0 %', () => {
    // Die Gegenprobe: ohne sie prüfte der Test oben nur, dass irgendein
    // anderes Konto herauskommt.
    const e = bauen([rechnung({ vatRate: 0, totalVat: 0, totalBrutto: 1000 })]);
    expect(e.zeilen[0]).toMatchObject({ haben: '4009' });
  });
});

describe('Was fehlt, wird benannt — und es entsteht keine Datei', () => {
  it('liefert keine Zeile und keinen Inhalt, wenn ein Erlöskonto fehlt', () => {
    /*
      DER GEFÄHRLICHSTE AUSGANG WÄRE EINE DATEI MIT LÜCKEN. Sie importiert
      sich fehlerfrei und bucht einen zu niedrigen Umsatz — und niemand
      sucht danach, weil der Import ja geklappt hat.
    */
    const ohne = KONTEN.filter((k) => !(k.zweck === 'erloes' && k.ustSatz === 0.2));
    const e = bauen([rechnung(), rechnung({ invoiceNumber: 'RE-2026-0002' })], ohne);
    expect(e.csv).toBe('');
    expect(e.zeilen).toEqual([]);
    expect(e.fehlend).toEqual(['Erlöskonto für 20 % Umsatzsteuer']);
  });

  it('nennt das fehlende Debitorenkonto', () => {
    const ohne = KONTEN.filter((k) => k.zweck !== 'debitoren');
    expect(bauen([rechnung()], ohne).fehlend).toContain(
      'Sammelkonto für Forderungen aus Lieferungen und Leistungen (Debitoren)',
    );
  });

  it('nennt jedes fehlende Konto nur einmal, auch bei hundert Rechnungen', () => {
    const ohne = KONTEN.filter((k) => !(k.zweck === 'erloes' && k.ustSatz === 0.2));
    const viele = Array.from({ length: 100 }, (_, n) =>
      rechnung({ invoiceNumber: `RE-2026-${String(n).padStart(4, '0')}` }),
    );
    expect(bauen(viele, ohne).fehlend).toHaveLength(1);
  });

  it('schweigt bei einem Zeitraum ohne Rechnungen, statt Konten anzumahnen', () => {
    // Ein leerer Monat ist kein Fehler im Kontenrahmen.
    const e = bauen([rechnung()], [], '2026-01-01', '2026-01-31');
    expect(e.fehlend).toEqual([]);
    expect(e.csv.trim()).toBe('Sollkonto;Habenkonto;Belegdatum;Belegnummer;Buchungstext;Betrag;Steuercode');
  });
});

  it('liest eine Rechnung OHNE Steuersatz nicht als 0 %', () => {
    /*
      `vatRate` ist am Beleg erst seit einer späteren Fassung Pflicht. Einen
      fehlenden Satz als 0 zu lesen hiesse, eine Rechnung mit 20 % auf das
      Erlöskonto für steuerfreie Umsätze zu buchen — und zwar genau dann,
      wenn der Betrieb ein solches Konto hinterlegt hat, der Export also
      fehlerfrei durchläuft.
    */
    const alt = rechnung({ vatRate: undefined });
    const e = bauen([alt]);
    expect(e.csv).toBe('');
    expect(e.fehlend[0]).toContain('RE-2026-0001');
    expect(e.fehlend[0]).toContain('keinen Steuersatz');
  });

describe('Anzahlung und Schlussrechnung', () => {
  const anzahlung: Vorrechnung = {
    invoiceId: 'a1',
    invoiceNumber: 'RE-2026-0001',
    invoiceDate: '2026-04-05',
    netto: 500,
    vat: 100,
    brutto: 600,
  };

  it('bucht die Anzahlung NICHT auf ein Erlöskonto', () => {
    /*
      Was der Kunde vorab zahlt, ist eine Verbindlichkeit, solange die
      Leistung aussteht. Als Erlös gebucht wäre der Umsatz zu früh im
      falschen Jahr — und beim Jahresabschluss doppelt.
    */
    const e = bauen([rechnung({ art: 'anzahlung', totalBrutto: 600, totalNetto: 500, totalVat: 100 })]);
    expect(e.zeilen[0]).toMatchObject({ soll: '2000', haben: '3500', betrag: 600 });
  });

  it('holt sie mit der Schlussrechnung aus der Verbindlichkeit in den Erlös', () => {
    /*
      OHNE DIESE ZEILE BLIEBE DAS ANZAHLUNGSKONTO FÜR IMMER STEHEN. Die
      Schlussrechnung bucht nur die RESTforderung — der Umsatz wäre dauerhaft
      um die Anzahlung zu niedrig, und das Konto 3500 trüge einen Saldo, den
      niemand mehr erklären kann.
    */
    const e = bauen([
      rechnung({
        invoiceNumber: 'RE-2026-0002',
        art: 'schluss',
        vorrechnungen: [anzahlung],
        gesamtNetto: 1000, gesamtVat: 200, gesamtBrutto: 1200,
        totalNetto: 500, totalVat: 100, totalBrutto: 600,
      }),
    ]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 600 }),
      expect.objectContaining({
        soll: '3500', haben: '4000', betrag: 600,
        buchungstext: 'Anzahlung RE-2026-0001 verrechnet',
        belegnummer: 'RE-2026-0002',
      }),
    ]);
  });

  it('bucht beide Teile zusammen über die volle Leistung', () => {
    // Die Probe aufs Ganze: Restforderung plus umgebuchte Anzahlung müssen
    // den Gesamtbetrag ergeben, sonst fehlt Umsatz.
    const e = bauen([
      rechnung({
        art: 'schluss', vorrechnungen: [anzahlung],
        gesamtBrutto: 1200, totalNetto: 500, totalVat: 100, totalBrutto: 600,
      }),
    ]);
    const aufErloes = e.zeilen.filter((z) => z.haben === '4000').reduce((s, z) => s + z.betrag, 0);
    expect(aufErloes).toBe(1200);
  });

  it('verlangt das Anzahlungskonto auch dann, wenn nur eine Schlussrechnung im Zeitraum liegt', () => {
    const ohne = KONTEN.filter((k) => k.zweck !== 'anzahlung');
    const e = bauen([rechnung({ art: 'schluss', vorrechnungen: [anzahlung], totalBrutto: 600 })], ohne);
    expect(e.fehlend).toContain('Konto für erhaltene Anzahlungen (eine Verbindlichkeit, kein Erlös)');
    expect(e.csv).toBe('');
  });
});

describe('Stornierte Rechnungen', () => {
  const storno = (p: Partial<Invoice> = {}) =>
    rechnung({
      paymentStatus: 'Storniert',
      cancellationNote: 'Falsche Baustelle',
      cancelledAt: new Date('2026-04-20T10:00:00').getTime(),
      ...p,
    });

  it('bucht den Storno mit vertauschten Konten am Stornotag', () => {
    /*
      Eine stornierte Rechnung wegzulassen hiesse, einen Vorgang zu
      unterschlagen, der einmal in den Büchern stand. Der Storno ist die
      Gegenbuchung, nicht das Löschen.
    */
    const e = bauen([storno()]);
    expect(e.zeilen).toHaveLength(2);
    expect(e.zeilen[1]).toMatchObject({
      soll: '4000', haben: '2000', belegdatum: '20.04.2026', betrag: 1200,
      buchungstext: 'Storno RE-2026-0001 — Falsche Baustelle',
    });
  });

  it('bucht den Storno auch, wenn die Rechnung aus einem früheren Monat stammt', () => {
    // Sonst fiele die Gegenbuchung durch jedes Raster: die Rechnung liegt im
    // März, der Storno im April, und in keinem der beiden Monate stünde er.
    const e = bauen([storno({ invoiceDate: '2026-03-12' })]);
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen[0]).toMatchObject({ soll: '4000', haben: '2000', belegdatum: '20.04.2026' });
  });

  it('bucht die Rechnung allein, wenn der Storno später kommt', () => {
    const e = bauen([storno({ cancelledAt: new Date('2026-05-03T10:00:00').getTime() })]);
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen[0]).toMatchObject({ soll: '2000', haben: '4000' });
  });

  it('nimmt den Stornotag in Ortszeit und nicht in UTC', () => {
    /*
      Ein Storno am 1. Mai um 00:30 Wiener Zeit ist der 30. April in UTC. Wer
      in UTC rechnet, bucht ihn in den falschen MONAT — und damit in die
      falsche Umsatzsteuervoranmeldung.
    */
    const e = bauen([storno({ cancelledAt: new Date('2026-05-01T00:30:00').getTime() })]);
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen[0]).toMatchObject({ haben: '4000' });
  });
});
