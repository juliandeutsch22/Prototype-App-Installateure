import { describe, it, expect } from 'vitest';
import { buildBmdCsv, buildBmdZahlungenCsv, type AbgezogeneVon, type Buchungskonto } from '@/features/invoices/bmdExport';
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

const bauen = (rechnungen: Invoice[], konten = KONTEN, von = '2026-04-01', bis = '2026-04-30', artVon?: AbgezogeneVon) =>
  buildBmdCsv(rechnungen, konten, von, bis, undefined, artVon);

/*
  DIE ART DER ABGEZOGENEN RECHNUNG KOMMT VON DER ANSICHT, wenn sie nicht im
  Zeitraum liegt (Durchsicht 09.11.2026). 'a1' ist in diesen Prüfungen die
  Anzahlung aus einem früheren Monat. Seit 09.11.2026 kommt die
  Steuerbehandlung mit — von ihr hängt das Anzahlungskonto ab.
*/
const ANZAHLUNG_A1: AbgezogeneVon = (id) =>
  (id === 'a1' ? { art: 'anzahlung', reverseCharge: false, vatRate: 0.2 } : undefined);

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
        // Runde 3, M5: ohne Kundennummer das Sammelkonto der Debitoren.
        debitor: '2000',
      },
    ]);
  });

  it('schreibt Datum und Betrag so, wie BMD sie liest', () => {
    // TT.MM.JJJJ und Komma. Ein ISO-Datum liest BMD als Text, und aus
    // „1200.00" wird beim Import je nach Einstellung 120000.
    const e = bauen([rechnung()]);
    expect(e.csv.split('\r\n')[1]).toBe('2000;4000;30.04.2026;RE-2026-0001;Familie Huber / B-200;1200,00;M20;2000');
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
    expect(e.csv.trim()).toBe('Sollkonto;Habenkonto;Belegdatum;Belegnummer;Buchungstext;Betrag;Steuercode;Kundennummer');
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
    ], KONTEN, undefined, undefined, ANZAHLUNG_A1);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 600 }),
      // Netto und ohne Steuercode: die Steuer der Anzahlung ist schon
      // gebucht (siehe unten, „zählt die Umsatzsteuer genau einmal").
      expect.objectContaining({
        soll: '3500', haben: '4000', betrag: 500, steuercode: '',
        buchungstext: 'Anzahlung RE-2026-0001 verrechnet',
        belegnummer: 'RE-2026-0002',
      }),
    ]);
  });

  /*
    DIE PROBE AUFS GANZE, so gerechnet, wie BMD bucht: eine Zeile mit
    Steuercode ist brutto, BMD spaltet die Steuer ab; eine ohne ist netto.
    Anzahlungsrechnung und Schlussrechnung zusammen müssen genau die volle
    Leistung ergeben — 1.000 € Erlös und 200 € Umsatzsteuer, nicht mehr.
  */
  const SAETZE: Record<string, number> = { M20: 0.2, M00: 0 };
  function wieBmd(zeilen: { haben: string; soll: string; betrag: number; steuercode: string }[]) {
    let erloes = 0;
    let ust = 0;
    for (const z of zeilen) {
      const satz = z.steuercode ? SAETZE[z.steuercode] : 0;
      const netto = z.betrag / (1 + satz);
      if (z.haben === '4000') erloes += netto;
      if (z.soll === '4000') erloes -= netto;
      ust += (z.betrag - netto) * (z.soll === '2000' || z.soll === '3500' ? 1 : -1);
    }
    return { erloes: Math.round(erloes * 100) / 100, ust: Math.round(ust * 100) / 100 };
  }
  const beide = [
    // Liegt im Zeitraum: die Art kommt aus der Liste selbst.
    rechnung({ id: 'a1', art: 'anzahlung', invoiceDate: '2026-04-05', totalNetto: 500, totalVat: 100, totalBrutto: 600 }),
    rechnung({
      invoiceNumber: 'RE-2026-0002', art: 'schluss', vorrechnungen: [anzahlung],
      gesamtNetto: 1000, gesamtVat: 200, gesamtBrutto: 1200,
      totalNetto: 500, totalVat: 100, totalBrutto: 600,
    }),
  ];

  it('zählt die Umsatzsteuer genau einmal — Erlös und Steuer ergeben die volle Leistung', () => {
    // P2-06: vorher ging die Umbuchung brutto mit Steuercode, und die 100 €
    // der Anzahlung standen ein zweites Mal in der Voranmeldung (300 statt 200).
    expect(wieBmd(bauen(beide).zeilen)).toEqual({ erloes: 1000, ust: 200 });
  });

  it('Gegenprobe: ohne Steuercode am Anzahlungskonto entsteht die Steuer beim Umbuchen — auch dann genau einmal', () => {
    const ohneCode = KONTEN.map((k) => (k.zweck === 'anzahlung' ? { ...k, steuercode: undefined } : k));
    const e = bauen(beide, ohneCode);
    expect(e.zeilen.find((z) => z.buchungstext.startsWith('Anzahlung'))).toMatchObject({
      betrag: 600, steuercode: 'M20',
    });
    expect(wieBmd(e.zeilen)).toEqual({ erloes: 1000, ust: 200 });
  });

  it('verlangt das Anzahlungskonto auch dann, wenn nur eine Schlussrechnung im Zeitraum liegt', () => {
    const ohne = KONTEN.filter((k) => k.zweck !== 'anzahlung');
    const e = bauen([rechnung({ art: 'schluss', vorrechnungen: [anzahlung], totalBrutto: 600 })], ohne, undefined, undefined, ANZAHLUNG_A1);
    expect(e.fehlend).toContain('Konto für erhaltene Anzahlungen mit 20 % Umsatzsteuer');
    expect(e.csv).toBe('');
  });
});

/*
  DURCHSICHT 09.11.2026: eine abgezogene TEILRECHNUNG (oder eine freiwillig
  abgezogene Einzelrechnung) wurde wie eine Anzahlung vom Anzahlungskonto in
  den Erlös umgebucht. Sie hatte ihren Erlös aber schon selbst gebucht
  (Debitoren an Erlös) — Erlös und Steuer standen doppelt in den Büchern, das
  Anzahlungskonto im Minus.
*/
/*
  DURCHSICHT 09.11.2026: jede Anzahlung ging auf DAS Anzahlungskonto mit
  dessen Steuercode (M20). Eine Anzahlung mit Übergang der Steuerschuld oder
  mit 0 % bekam so 20 % Umsatzsteuer, die niemand schuldet, und die
  Umbuchung bei der Schlussrechnung holte vom Konto mehr, als darauf stand.
  Jetzt gibt es je Steuerbehandlung ein Anzahlungskonto, gewählt wie das
  Erlöskonto.
*/
describe('Anzahlungskonto je Steuerbehandlung', () => {
  const RC = { zweck: 'anzahlung_rc', konto: '3505', steuercode: 'M00' } as const;
  const NULL = { zweck: 'anzahlung', ustSatz: 0, konto: '3509', steuercode: 'M00' } as const;
  const MIT_ALLEN: Buchungskonto[] = [...KONTEN, RC, NULL];
  const rcAnzahlung = (p: Partial<Invoice> = {}) => rechnung({
    id: 'a1', art: 'anzahlung', reverseCharge: true, vatRate: 0,
    totalNetto: 500, totalVat: 0, totalBrutto: 500, ...p,
  });
  const nullAnzahlung = (p: Partial<Invoice> = {}) => rechnung({
    id: 'a1', art: 'anzahlung', vatRate: 0, steuerbefreiung: 'Kleinunternehmer',
    totalNetto: 500, totalVat: 0, totalBrutto: 500, ...p,
  });
  const abzugOhneSteuer: Vorrechnung = {
    invoiceId: 'a1', invoiceNumber: 'RE-2026-0001', invoiceDate: '2026-04-05', netto: 500, vat: 0, brutto: 500,
  };
  const schlussRc = (p: Partial<Invoice> = {}) => rechnung({
    id: 's1', invoiceNumber: 'RE-2026-0002', art: 'schluss', reverseCharge: true, vatRate: 0,
    vorrechnungen: [abzugOhneSteuer],
    gesamtNetto: 1000, gesamtVat: 0, gesamtBrutto: 1000, totalNetto: 500, totalVat: 0, totalBrutto: 500, ...p,
  });

  it('bucht eine Anzahlung mit Übergang der Steuerschuld auf ihr eigenes Konto, mit dessen Steuercode', () => {
    const e = bauen([rcAnzahlung()], MIT_ALLEN);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '3505', betrag: 500, steuercode: 'M00' }),
    ]);
    expect(e.zeilen.some((z) => z.haben === '3500' || z.steuercode === 'M20')).toBe(false);
  });

  it('ohne dieses Konto entsteht keine Datei — die Anzahlung geht nicht auf das Konto mit M20', () => {
    const e = bauen([rcAnzahlung()], KONTEN);
    expect(e.fehlend).toEqual([
      'Konto für erhaltene Anzahlungen auf Bauleistungen mit Übergang der Steuerschuld (§ 19 Abs 1a UStG)',
    ]);
    expect(e.csv).toBe('');
  });

  it('bucht eine Anzahlung mit 0 % auf das Anzahlungskonto für 0 %', () => {
    const e = bauen([nullAnzahlung()], MIT_ALLEN);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '3509', betrag: 500, steuercode: 'M00' }),
    ]);
  });

  it('fehlt das Konto für den Satz der Anzahlung, wird es mit dem Satz benannt', () => {
    expect(bauen([nullAnzahlung()], KONTEN).fehlend).toEqual(['Konto für erhaltene Anzahlungen mit 0 % Umsatzsteuer']);
    const zehn = rechnung({ id: 'a1', art: 'anzahlung', vatRate: 0.1, totalNetto: 500, totalVat: 50, totalBrutto: 550 });
    const mitErloes10: Buchungskonto[] = [...KONTEN, { zweck: 'erloes', ustSatz: 0.1, konto: '4010', steuercode: 'M10' }];
    expect(bauen([zehn], mitErloes10).fehlend).toEqual(['Konto für erhaltene Anzahlungen mit 10 % Umsatzsteuer']);
  });

  it('die Schlussrechnung bucht vom Konto der Anzahlung um, mit dessen Code und Betrag', () => {
    const rcAbgezogen: AbgezogeneVon = (id) => (id === 'a1' ? { art: 'anzahlung', reverseCharge: true, vatRate: 0 } : undefined);
    const e = bauen([schlussRc()], MIT_ALLEN, undefined, undefined, rcAbgezogen);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4005', betrag: 500, steuercode: 'M00' }),
      expect.objectContaining({
        soll: '3505', haben: '4005', betrag: 500, steuercode: '', buchungstext: 'Anzahlung RE-2026-0001 verrechnet',
      }),
    ]);
  });

  it('und dreht genau diese Umbuchung beim Storno zurück', () => {
    const e = bauen([
      rcAnzahlung({ invoiceDate: '2026-04-05' }),
      schlussRc({ paymentStatus: 'Storniert', cancelledAt: new Date('2026-04-20T10:00:00').getTime() }),
    ], MIT_ALLEN);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen.filter((z) => z.soll === '3505' || z.haben === '3505').map((z) => [z.soll, z.haben, z.betrag])).toEqual([
      ['2000', '3505', 500],
      ['3505', '4005', 500],
      ['4005', '3505', 500],
    ]);
    // Das Konto der 20-%-Anzahlungen bleibt unberührt.
    expect(e.zeilen.some((z) => z.soll === '3500' || z.haben === '3500')).toBe(false);
  });

  it('Gleichbleiben: die 20-%-Anzahlung auf dem bisherigen Anzahlungskonto ohne Satz bucht wie zuvor', () => {
    const e = bauen([rechnung({ art: 'anzahlung', totalBrutto: 600, totalNetto: 500, totalVat: 100 })], MIT_ALLEN);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '3500', betrag: 600, steuercode: 'M20' }),
    ]);
  });

  it('ein ausdrücklich für 20 % hinterlegtes Anzahlungskonto geht dem ohne Satz vor', () => {
    const e = bauen(
      [rechnung({ art: 'anzahlung', totalBrutto: 600, totalNetto: 500, totalVat: 100 })],
      [...KONTEN, { zweck: 'anzahlung', ustSatz: 0.2, konto: '3520', steuercode: 'M20' }],
    );
    expect(e.zeilen[0]).toMatchObject({ haben: '3520', betrag: 600, steuercode: 'M20' });
  });
});

describe('Abgezogene Teil- und Einzelrechnungen', () => {
  const teil: Vorrechnung = {
    invoiceId: 't1', invoiceNumber: 'RE-2026-0001', invoiceDate: '2026-04-05',
    netto: 500, vat: 100, brutto: 600,
  };
  const schluss = (p: Partial<Invoice> = {}) =>
    rechnung({
      invoiceNumber: 'RE-2026-0002', art: 'schluss', vorrechnungen: [teil],
      gesamtNetto: 1000, gesamtVat: 200, gesamtBrutto: 1200,
      totalNetto: 500, totalVat: 100, totalBrutto: 600,
      ...p,
    });
  const ALS = (art: 'teil' | 'einzel'): AbgezogeneVon => (id) =>
    (id === 't1' ? { art, reverseCharge: false, vatRate: 0.2 } : undefined);

  it('bucht für eine abgezogene Teilrechnung keine Umbuchung vom Anzahlungskonto', () => {
    const e = bauen([schluss()], KONTEN, undefined, undefined, ALS('teil'));
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 600, belegnummer: 'RE-2026-0002' }),
    ]);
    expect(e.csv).not.toContain('verrechnet');
  });

  it('ebenso für eine freiwillig abgezogene Einzelrechnung', () => {
    const e = bauen([schluss()], KONTEN, undefined, undefined, ALS('einzel'));
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen.some((z) => z.soll === '3500' || z.haben === '3500')).toBe(false);
  });

  it('Teilrechnung und Schlussrechnung ergeben zusammen genau die volle Leistung — Erlös einmal', () => {
    // Die Teilrechnung liegt im Zeitraum: die Art kommt aus der Liste.
    const beide = [
      rechnung({ id: 't1', art: 'teil', invoiceDate: '2026-04-05', totalNetto: 500, totalVat: 100, totalBrutto: 600 }),
      schluss(),
    ];
    const e = bauen(beide);
    expect(e.fehlend).toEqual([]);
    const erloesNetto = e.zeilen.reduce((s, z) => s + (z.haben === '4000' ? z.betrag / 1.2 : 0), 0);
    expect(Math.round(erloesNetto * 100) / 100).toBe(1000);
    // Das Anzahlungskonto bleibt unberührt — es hat nie etwas bekommen.
    expect(e.zeilen.some((z) => z.soll === '3500' || z.haben === '3500')).toBe(false);
  });

  it('Altbestand ohne Art in der Liste gilt als Einzelrechnung, wie die Datenbank ihn vorbelegt', () => {
    const e = bauen([rechnung({ id: 't1', invoiceDate: '2026-04-05', totalBrutto: 600 }), schluss()]);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toHaveLength(2);
  });

  it('braucht dafür kein Anzahlungskonto — ein Betrieb ohne Anzahlungen hinterlegt keines', () => {
    const ohne = KONTEN.filter((k) => k.zweck !== 'anzahlung');
    const e = bauen([schluss()], ohne, undefined, undefined, ALS('teil'));
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toHaveLength(1);
  });

  it('bucht nur die Anzahlung um, wenn Anzahlung und Teilrechnung abgezogen sind', () => {
    const anzahlung: Vorrechnung = { ...teil, invoiceId: 'a1', invoiceNumber: 'RE-2026-0000', netto: 200, vat: 40, brutto: 240 };
    const artVon: AbgezogeneVon = (id) => ({
      a1: { art: 'anzahlung', reverseCharge: false, vatRate: 0.2 },
      t1: { art: 'teil', reverseCharge: false, vatRate: 0.2 },
    } as const)[id as 'a1' | 't1'];
    const e = bauen([schluss({ vorrechnungen: [anzahlung, teil], totalNetto: 300, totalVat: 60, totalBrutto: 360 })],
      KONTEN, undefined, undefined, artVon);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 360 }),
      expect.objectContaining({ soll: '3500', haben: '4000', betrag: 200, buchungstext: 'Anzahlung RE-2026-0000 verrechnet' }),
    ]);
  });

  it('dreht beim Storno auch nichts zurück, was nie umgebucht wurde', () => {
    const e = bauen([
      schluss({ paymentStatus: 'Storniert', cancelledAt: new Date('2026-04-20T10:00:00').getTime() }),
    ], KONTEN, undefined, undefined, ALS('teil'));
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 600 }),
      expect.objectContaining({ soll: '4000', haben: '2000', betrag: 600, belegdatum: '20.04.2026' }),
    ]);
  });

  it('ist die abgezogene Rechnung unbekannt, entsteht keine Datei — sie wird benannt', () => {
    // Raten hieße: Erlös entweder doppelt oder gar nicht gebucht.
    const e = bauen([schluss()]);
    expect(e.csv).toBe('');
    expect(e.zeilen).toEqual([]);
    expect(e.fehlend).toHaveLength(1);
    expect(e.fehlend[0]).toContain('RE-2026-0001');
    expect(e.fehlend[0]).toContain('Anzahlung');
  });

  it('Gleichbleiben: eine abgezogene Anzahlung wird weiter umgebucht', () => {
    const e = bauen([schluss({ vorrechnungen: [{ ...teil, invoiceId: 'a1' }] })], KONTEN, undefined, undefined, ANZAHLUNG_A1);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 600 }),
      expect.objectContaining({ soll: '3500', haben: '4000', betrag: 500, steuercode: '' }),
    ]);
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

  it('mit Stornorechnung (B7) ist sie der Beleg der Stornobuchung', () => {
    const e = bauen([storno({ stornoNummer: 'RE-2026-0007' })]);
    expect(e.zeilen[1]).toMatchObject({
      belegnummer: 'RE-2026-0007', belegdatum: '20.04.2026', betrag: 1200,
      buchungstext: 'Stornorechnung RE-2026-0007 zu RE-2026-0001 — Falsche Baustelle',
    });
    // Die Rechnung selbst bleibt unter ihrer eigenen Nummer.
    expect(e.zeilen[0]).toMatchObject({ belegnummer: 'RE-2026-0001' });
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

  /*
    PRÜFLAUF 25.09.2026, P2-05. Der Storno einer Schlussrechnung buchte nur
    die Restforderung zurück, nicht die Umbuchung der Anzahlung in den Erlös.
    Der Erlös blieb um die Anzahlung zu hoch, das Anzahlungskonto um sie zu
    niedrig.
  */
  it('dreht beim Storno einer Schlussrechnung auch die Umbuchung der Anzahlung zurück', () => {
    const anzahlung = {
      invoiceId: 'a1', invoiceNumber: 'RE-2026-0001', invoiceDate: '2026-04-05',
      netto: 500, vat: 100, brutto: 600,
    };
    const e = bauen([
      storno({
        invoiceNumber: 'RE-2026-0002',
        art: 'schluss',
        vorrechnungen: [anzahlung],
        gesamtNetto: 1000, gesamtVat: 200, gesamtBrutto: 1200,
        totalNetto: 500, totalVat: 100, totalBrutto: 600,
      }),
    ], KONTEN, undefined, undefined, ANZAHLUNG_A1);
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen).toEqual([
      expect.objectContaining({ soll: '2000', haben: '4000', betrag: 600 }),
      expect.objectContaining({ soll: '3500', haben: '4000', betrag: 500 }),
      expect.objectContaining({ soll: '4000', haben: '2000', betrag: 600, belegdatum: '20.04.2026' }),
      expect.objectContaining({
        soll: '4000', haben: '3500', betrag: 500, steuercode: '', belegdatum: '20.04.2026',
        buchungstext: 'Storno: Anzahlung RE-2026-0001 verrechnet',
        belegnummer: 'RE-2026-0002',
      }),
    ]);
    // Und alles zusammen: auf dem Erlöskonto bleibt nichts stehen — netto
    // gerechnet, wie BMD es verbucht (die Restforderung trägt den Steuercode).
    const netto = (z: { betrag: number; steuercode: string }) => (z.steuercode === 'M20' ? z.betrag / 1.2 : z.betrag);
    const erloes = e.zeilen.reduce(
      (s, z) => s + (z.haben === '4000' ? netto(z) : 0) - (z.soll === '4000' ? netto(z) : 0), 0,
    );
    expect(erloes).toBe(0);
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

/*
  TESTBERICHT 30.09.2026, H7 VORGEBAUT — die Debitorennummer aus dem
  Kundenstamm und Zahlungen samt Skonto als eigener Stapel.
*/
/*
  RUNDE 3, M5: die Spalte steht IMMER da — vorher nur, wenn ein Kunde eine
  Nummer hatte, und der Pilotbetrieb sah sie deshalb nie.
*/
describe('Die Kundennummer', () => {
  it('steht als letzte Spalte da, mit der Nummer des Kunden', () => {
    const e = buildBmdCsv([rechnung()], KONTEN, '2026-04-01', '2026-04-30', () => '10042');
    const [kopf, zeile] = e.csv.split('\r\n');
    expect(kopf.endsWith(';Steuercode;Kundennummer')).toBe(true);
    expect(zeile).toBe('2000;4000;30.04.2026;RE-2026-0001;Familie Huber / B-200;1200,00;M20;10042');
  });

  it('ohne Kundennummer steht das Sammelkonto der Debitoren', () => {
    const ohne = buildBmdCsv([rechnung()], KONTEN, '2026-04-01', '2026-04-30');
    const leer = buildBmdCsv([rechnung()], KONTEN, '2026-04-01', '2026-04-30', () => '');
    expect(leer.csv).toBe(ohne.csv);
    expect(ohne.csv.split('\r\n')[0]).toBe('Sollkonto;Habenkonto;Belegdatum;Belegnummer;Buchungstext;Betrag;Steuercode;Kundennummer');
    expect(ohne.csv.split('\r\n')[1].split(';').slice(-1)[0]).toBe('2000');
  });

  it('Gegenprobe: die ersten sieben Spalten bleiben, wie sie waren', () => {
    const e = buildBmdCsv([rechnung()], KONTEN, '2026-04-01', '2026-04-30', () => '10042');
    expect(e.csv.split('\r\n')[1].split(';').slice(0, 7)).toEqual(
      ['2000', '4000', '30.04.2026', 'RE-2026-0001', 'Familie Huber / B-200', '1200,00', 'M20']);
  });
});

describe('Der Zahlungsstapel', () => {
  const MIT_BANK: Buchungskonto[] = [...KONTEN, { zweck: 'bank', konto: '2800' }, { zweck: 'skonto', konto: '4420' }];
  const r = { ...rechnung({ invoiceNumber: 'RE-2026-0001' }), id: 'r1' } as Invoice & { id: string };
  const rc = { ...rechnung({ invoiceNumber: 'RE-2026-0002', reverseCharge: true, vatRate: 0 }), id: 'r2' } as Invoice & { id: string };

  it('Eingang, Rückzahlung und Skonto — mit den richtigen Seiten', () => {
    const e = buildBmdZahlungenCsv([
      { invoiceId: 'r1', datum: '2026-05-10', betrag: 1176, art: 'Überweisung' },
      { invoiceId: 'r1', datum: '2026-05-10', betrag: 24, art: 'Skonto' },
      { invoiceId: 'r1', datum: '2026-05-20', betrag: -50, art: 'Überweisung', hinweis: 'zu viel' },
    ], [r], MIT_BANK, '2026-05-01', '2026-05-31', () => '10042');
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen.map((z) => [z.soll, z.haben, z.betrag, z.steuercode, z.debitor])).toEqual([
      ['2800', '2000', 1176, '', '10042'],
      ['4420', '2000', 24, 'M20', '10042'],
      ['2000', '2800', 50, '', '10042'],
    ]);
    expect(e.zeilen[2].buchungstext).toBe('Rückzahlung RE-2026-0001 Familie Huber / zu viel');
  });

  it('Skonto auf Reverse Charge nimmt den Code des Übergangs der Steuerschuld', () => {
    const e = buildBmdZahlungenCsv(
      [{ invoiceId: 'r2', datum: '2026-05-10', betrag: 10, art: 'Skonto' }], [rc], MIT_BANK, '2026-05-01', '2026-05-31',
    );
    expect(e.zeilen[0]).toMatchObject({ soll: '4420', steuercode: 'M00' });
  });

  it('Gegenprobe: ohne Bank- oder Skontokonto entsteht keine Datei', () => {
    const e = buildBmdZahlungenCsv([
      { invoiceId: 'r1', datum: '2026-05-10', betrag: 1176, art: 'Überweisung' },
      { invoiceId: 'r1', datum: '2026-05-10', betrag: 24, art: 'Skonto' },
    ], [r], KONTEN, '2026-05-01', '2026-05-31');
    expect(e.csv).toBe('');
    expect(e.fehlend).toEqual([
      'Bankkonto (für Zahlungseingänge und Rückzahlungen)',
      'Konto für gewährte Skonti (Erlösschmälerung)',
    ]);
  });

  it('Gegenprobe: Zahlungen außerhalb des Zeitraums bleiben draußen', () => {
    const e = buildBmdZahlungenCsv(
      [{ invoiceId: 'r1', datum: '2026-06-01', betrag: 100, art: 'Bar' }], [r], MIT_BANK, '2026-05-01', '2026-05-31',
    );
    expect(e.zeilen).toEqual([]);
  });

  /*
    DURCHSICHT 09.11.2026: bezahlte Mahnspesen und Zinsen sind ein eigener
    Ertrag, keine Zahlung auf die Forderung — Bank an das Konto dafür, ohne
    Debitoren und ohne Umsatzsteuer.
  */
  it('bucht Mahnspesen und Zinsen Bank an ihr eigenes Konto, nicht an die Debitoren', () => {
    const e = buildBmdZahlungenCsv([
      { invoiceId: 'r1', datum: '2026-05-10', betrag: 1200, art: 'Überweisung' },
      { invoiceId: 'r1', datum: '2026-05-10', betrag: 13.16, art: 'Mahnkosten' },
      { invoiceId: 'r1', datum: '2026-05-20', betrag: -3.16, art: 'Mahnkosten', hinweis: 'Zinsen erlassen' },
    ], [r], [...MIT_BANK, { zweck: 'mahnkosten', konto: '4880' }], '2026-05-01', '2026-05-31', () => '10042');
    expect(e.fehlend).toEqual([]);
    expect(e.zeilen.map((z) => [z.soll, z.haben, z.betrag, z.steuercode])).toEqual([
      ['2800', '2000', 1200, ''],
      ['2800', '4880', 13.16, ''],
      ['4880', '2800', 3.16, ''],
    ]);
    expect(e.zeilen[1].buchungstext).toBe('Mahnspesen und Zinsen RE-2026-0001 Familie Huber');
    expect(e.zeilen[2].buchungstext).toBe('Rückbuchung Mahnspesen und Zinsen RE-2026-0001 Familie Huber / Zinsen erlassen');
  });

  it('ohne Konto für Mahnspesen und Zinsen entsteht keine Datei', () => {
    const e = buildBmdZahlungenCsv(
      [{ invoiceId: 'r1', datum: '2026-05-10', betrag: 13.16, art: 'Mahnkosten' }], [r], MIT_BANK, '2026-05-01', '2026-05-31',
    );
    expect(e.csv).toBe('');
    expect(e.fehlend).toEqual(['Konto für bezahlte Mahnspesen und Verzugszinsen (Ertrag)']);
  });
});
