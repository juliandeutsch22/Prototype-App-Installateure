import { describe, it, expect } from 'vitest';
import { buildInvoiceCsv, findeLuecken, invoiceCsvFilename } from '@/features/invoices/buchhaltungExport';
import type { Customer, Invoice } from '@/types';

/**
 * Das Rechnungsausgangsbuch geht an den Steuerberater und von dort in die
 * Umsatzsteuervoranmeldung. Zwei Regeln entscheiden, ob es brauchbar ist —
 * und beide sind leicht falsch zu machen:
 *
 *  1. STORNIERTE RECHNUNGEN GEHÖREN INS JOURNAL, aber nicht in die Summe.
 *     Sie wegzufiltern ist der naheliegende Fehler und erzeugt eine Lücke im
 *     Nummernkreis — für jede Prüfung ein Befund.
 *  2. LÜCKEN MÜSSEN AUFFALLEN. Eine fehlende Nummer heißt: eine Rechnung
 *     fehlt, oder sie wurde gelöscht statt storniert. Beides gehört geklärt,
 *     bevor der Export die Kanzlei erreicht.
 */

const re = (nr: string, netto: number, status: Invoice['paymentStatus'] = 'Offen'): Invoice => ({
  id: nr,
  companyId: 'perl',
  invoiceNumber: nr,
  projectNumber: 'B-001',
  customerName: 'Hausverwaltung Nord',
  invoiceDate: '2026-08-15',
  dueDate: '2026-08-29',
  totalNetto: netto,
  totalVat: netto * 0.2,
  totalBrutto: netto * 1.2,
  vatRate: 0.2,
  paymentStatus: status,
});

const kunden: Customer[] = [
  {
    id: 'k1',
    companyId: 'perl',
    name: 'Hausverwaltung Nord',
    vatId: 'ATU12345678',
  },
];

describe('Rechnungsausgangsbuch', () => {
  it('nimmt stornierte Rechnungen auf, zählt sie aber nicht zur Summe', () => {
    const rows = [re('RE-2026-0001', 1000), re('RE-2026-0002', 500, 'Storniert')];
    const e = buildInvoiceCsv(rows, kunden, '2026-08-01', '2026-08-31');

    // Beide im Journal …
    expect(e.csv).toContain('RE-2026-0001');
    expect(e.csv).toContain('RE-2026-0002');
    expect(e.anzahl).toBe(2);
    // … aber nur eine in der Summe.
    expect(e.summeNetto).toBe(1000);
    expect(e.csv).toContain('Summe (ohne Storni)');
  });

  it('meldet eine Lücke im Nummernkreis', () => {
    const luecken = findeLuecken([re('RE-2026-0001', 100), re('RE-2026-0003', 100)]);
    expect(luecken).toEqual(['RE-2026-0002']);
  });

  it('meldet keine Lücke, wenn der Kreis geschlossen ist', () => {
    expect(
      findeLuecken([re('RE-2026-0001', 1), re('RE-2026-0002', 1), re('RE-2026-0003', 1)]),
    ).toEqual([]);
  });

  it('prüft je Jahr getrennt — der Kreis beginnt jährlich neu', () => {
    /**
     * Ohne die Trennung nach Jahr wäre der Sprung von RE-2025-0087 auf
     * RE-2026-0001 eine Lücke von sechsundachtzig Nummern — und die Meldung
     * damit wertlos, weil sie jedes Jahr einmal falsch Alarm schlägt.
     */
    const a = { ...re('RE-2025-0087', 1), invoiceDate: '2025-12-20' };
    const b = re('RE-2026-0001', 1);
    expect(findeLuecken([a, b])).toEqual([]);
  });

  it('nimmt die UID-Nummer aus den Kundenstammdaten', () => {
    /**
     * Vor den Kundenstammdaten gab es die UID im System gar nicht — die
     * Rechnung trägt nur einen Kundennamen. Für Rechnungen an Unternehmen im
     * EU-Ausland ist sie Pflichtangabe.
     */
    const e = buildInvoiceCsv([re('RE-2026-0001', 100)], kunden, '2026-08-01', '2026-08-31');
    expect(e.csv).toContain('ATU12345678');
  });

  it('lässt die UID leer, wenn der Kunde keine hat', () => {
    const e = buildInvoiceCsv([re('RE-2026-0001', 100)], [], '2026-08-01', '2026-08-31');
    expect(e.csv).not.toContain('ATU');
    expect(e.anzahl).toBe(1);
  });

  it('grenzt auf den Zeitraum ein', () => {
    const drin = re('RE-2026-0001', 100);
    const draussen = { ...re('RE-2026-0002', 100), invoiceDate: '2026-09-02' };
    const e = buildInvoiceCsv([drin, draussen], kunden, '2026-08-01', '2026-08-31');
    expect(e.anzahl).toBe(1);
    expect(e.csv).not.toContain('RE-2026-0002');
  });

  it('schreibt Zahlen im deutschen Format', () => {
    // Der Steuerberater öffnet die Datei in Excel mit deutscher Einstellung;
    // ein Punkt als Dezimaltrenner ergäbe dort Tausender.
    const e = buildInvoiceCsv([re('RE-2026-0001', 1234.5)], kunden, '2026-08-01', '2026-08-31');
    expect(e.csv).toContain('1234,50');
    expect(e.csv).toContain('20,00'); // USt-Satz in Prozent
  });

  it('schützt Felder mit Semikolon', () => {
    /**
     * Ein Kundenname wie „Huber; Sohn KG" würde die Spalten verschieben und
     * damit stillschweigend Beträge in die falschen Felder rutschen lassen.
     */
    const heikel = { ...re('RE-2026-0001', 100), customerName: 'Huber; Sohn KG' };
    const e = buildInvoiceCsv([heikel], [], '2026-08-01', '2026-08-31');
    expect(e.csv).toContain('"Huber; Sohn KG"');
  });

  it('benennt die Datei nach dem Zeitraum', () => {
    expect(invoiceCsvFilename('2026-08-01', '2026-08-31')).toBe(
      'Rechnungsausgangsbuch_2026-08-01_bis_2026-08-31.csv',
    );
  });
});

describe('Der Leistungszeitraum im Journal', () => {
  it('steht als eigene Spalte darin', async () => {
    /*
      Er entscheidet über die PERIODE, in die der Umsatz fällt — genau die
      Frage, die der Steuerberater an diese Datei stellt. Eine Rechnung vom
      2. Jänner über eine Leistung vom Dezember gehört in die
      Dezemberumsatzsteuer.

      Der Test hält die SPALTEN fest, nicht nur die Werte: eine verschobene
      Spalte fällt beim Einlesen nicht auf, sie landet nur im falschen Feld.
    */
    const r = buildInvoiceCsv(
      [
        {
          invoiceNumber: 'RE-2026-0001',
          invoiceDate: '2027-01-02',
          dueDate: '2027-01-16',
          leistungVon: '2026-12-03',
          leistungBis: '2026-12-19',
          customerName: 'Huber',
          projectNumber: 'B-001',
          totalNetto: 100,
          totalVat: 20,
          totalBrutto: 120,
          vatRate: 0.2,
          paymentStatus: 'Offen',
        } as never,
      ],
      [],
      '2027-01-01',
      '2027-01-31',
    );
    const [kopf, zeile] = r.csv.split('\n');
    expect(kopf.split(';')).toEqual([
      'Rechnungsnummer',
      'Rechnungsdatum',
      'Leistung von',
      'Leistung bis',
      'Fälligkeitsdatum',
      'Kunde',
      'UID-Nummer',
      'Baustelle',
      'Netto',
      'USt-Satz %',
      'USt-Betrag',
      'Reverse Charge',
      'Brutto',
      'Zahlungsstatus',
      'Storniert',
      'Stornogrund',
    ]);
    const felder = zeile.split(';');
    expect(felder[2]).toBe('03.12.2026');
    expect(felder[3]).toBe('19.12.2026');
  });

  it('bleibt leer, wenn er nicht angegeben ist', async () => {
    // Altbestände tragen ihn nicht. Eine erfundene Angabe wäre schlimmer als
    // ein leeres Feld, das jemandem auffällt.
    const r = buildInvoiceCsv(
      [
        {
          invoiceNumber: 'RE-2026-0001',
          invoiceDate: '2026-09-01',
          dueDate: '2026-09-15',
          customerName: 'Huber',
          projectNumber: 'B-001',
          totalNetto: 100,
          totalVat: 20,
          totalBrutto: 120,
          vatRate: 0.2,
          paymentStatus: 'Offen',
        } as never,
      ],
      [],
      '2026-09-01',
      '2026-09-30',
    );
    const felder = r.csv.split('\n')[1].split(';');
    expect(felder[2]).toBe('');
    expect(felder[3]).toBe('');
  });
});

describe('Reverse Charge im Journal', () => {
  /**
   * Ein Feld über seinen SPALTENNAMEN holen, nicht über eine gezählte
   * Position.
   *
   * Beim Schreiben dieser Tests habe ich mich um eine Spalte verzählt — und
   * genau das passiert dem Nächsten auch, sobald eine Spalte dazukommt. Die
   * REIHENFOLGE hält der Kopfzeilentest weiter oben fest; hier geht es um die
   * Werte, und die sollen nicht an einer Zahl hängen.
   */
  function feld(csv: string, spalte: string): string {
    const [kopf, zeile] = csv.split('\n');
    const i = kopf.split(';').indexOf(spalte);
    expect(i).toBeGreaterThanOrEqual(0);
    return zeile.split(';')[i];
  }

  function zeile(inv: Record<string, unknown>) {
    const r = buildInvoiceCsv(
      [
        {
          invoiceNumber: 'RE-2026-0001',
          invoiceDate: '2026-09-10',
          dueDate: '2026-09-24',
          customerName: 'Baumeister Gruber',
          projectNumber: 'B-001',
          totalNetto: 1000,
          totalVat: 0,
          totalBrutto: 1000,
          vatRate: 0,
          paymentStatus: 'Offen',
          ...inv,
        } as never,
      ],
      [{ name: 'Baumeister Gruber', vatId: 'ATU99999999' } as never],
      '2026-09-01',
      '2026-09-30',
    );
    return r.csv;
  }

  it('steht als eigene Spalte da, nicht als Null im Steuersatz', () => {
    /*
      Beides ergibt 0,00 € und bedeutet etwas anderes: „0 %" ist ein
      Steuersatz, der Übergang der Steuerschuld ist ein anderer Umsatz, den
      der Steuerberater getrennt erklären muss. Wer die Fälle über eine Null
      zusammenlegt, kann sie im Nachhinein nicht mehr trennen.
    */
    const rc = zeile({ reverseCharge: true, customerVatId: 'ATU11112222' });
    const normal = zeile({ reverseCharge: false, vatRate: 0.2, totalVat: 200, totalBrutto: 1200 });
    expect(feld(rc, 'Reverse Charge')).toBe('ja');
    expect(feld(normal, 'Reverse Charge')).toBe('nein');
  });

  it('nimmt die auf der RECHNUNG festgehaltene UID, nicht die aktuelle', () => {
    // Die Stammdaten können sich seither geändert haben; auf dem Beleg, den
    // der Kunde bekommen hat, stand die eine.
    expect(feld(zeile({ reverseCharge: true, customerVatId: 'ATU11112222' }), 'UID-Nummer')).toBe(
      'ATU11112222',
    );
  });

  it('fällt ohne festgehaltene UID auf die Stammdaten zurück', () => {
    // Altbestände tragen sie nicht — dann ist die aus dem Kundenstamm besser
    // als ein leeres Feld.
    expect(feld(zeile({}), 'UID-Nummer')).toBe('ATU99999999');
  });
});
