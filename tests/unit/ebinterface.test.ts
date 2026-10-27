/**
 * DIE RECHNUNG ALS E-RECHNUNG NACH ebInterface 6.1 (Auftrag 19.10.2026).
 *
 * Jede erzeugte Datei wird gegen das OFFIZIELLE Schema geprüft
 * (`tests/fixtures/ebinterface/Invoice-6p1.xsd`, ebinterface.at, Fassung
 * 6.1 vom 25.06.2022), dazu ihre Beträge gegen das PDF: dieselbe Forderung,
 * derselbe Zahlbetrag, dieselbe Steuer. Die Regeln des Bundes
 * (e-Rechnung.gv.at) stehen als Prüfungen in `ebiPruefen`; das angepasste
 * Schema des Bundes liegt nicht im Repository (Rechte beim BRZ).
 *
 * Gegenprobe: ohne `ebinterface.ts` gibt es nichts zu prüfen (rot); und der
 * Schemaprüfer selbst weist eine Datei ohne Empfänger ab — er prüft also.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateXML } from 'xmllint-wasm';
import type { Company, Invoice } from '@/types';
import {
  anschriftZerlegen,
  auftragsreferenzFehler,
  ebiDateiname,
  ebInterfaceXml,
  ebiPruefen,
  emailAusKontakt,
  EBI_HOECHSTENS_POSITIONEN,
  type EbiOptionen,
} from '@/features/invoices/ebinterface';
import { RC_HINWEIS } from '@/features/invoices/reverseCharge';

const SCHEMA = readFileSync(join(__dirname, '../fixtures/ebinterface/Invoice-6p1.xsd'), 'utf8');

async function gueltig(xml: string): Promise<string[]> {
  const r = await validateXML({ xml: [{ fileName: 'rechnung.xml', contents: xml }], schema: [SCHEMA] });
  return r.errors.map((e) => e.message);
}

/** Alle Werte eines Elements, in der Reihenfolge der Datei. */
function werte(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`, 'g'))].map((m) => m[1]);
}
const wert = (xml: string, name: string) => werte(xml, name)[0];

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  strasse: 'Hauptstraße 12',
  plz: '2700',
  ort: 'Wiener Neustadt',
  land: 'AT',
  contactLine: 'Tel +43 2622 12345 · office@perl.at · www.perl.at',
  iban: 'AT61 1904 3002 3457 3201',
  bic: 'BKAUATWW',
  bankName: 'Bank Austria',
  vatId: 'ATU12345678',
  companyRegister: 'FN 123456a',
  firmenbuchgericht: 'LG Wiener Neustadt',
} as Company;

function rechnung(extra: Partial<Invoice> = {}): Invoice {
  return {
    id: 'r1',
    companyId: 'perl',
    invoiceNumber: 'RE-2026-1042',
    projectNumber: 'B-2026-017',
    customerName: 'Hausverwaltung Nord & Söhne',
    address: 'Hauptplatz 1, 8010 Graz',
    invoiceDate: '2026-10-15',
    dueDate: '2026-10-29',
    leistungVon: '2026-10-01',
    leistungBis: '2026-10-10',
    vatRate: 0.2,
    positions: [
      { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'Facharbeiterstunden', qty: 8, unit: 'Std', unitPrice: 72, netto: 576 },
      { art: 'text', label: 'Montage im Bestand', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'Waschtischarmatur', qty: 1, unit: 'Stk', unitPrice: 189.9, netto: 170.91, rabattProzent: 10 },
      { art: 'titel', label: 'Heizraum', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'Kupferrohr 15 mm', qty: 12.5, unit: 'm', unitPrice: 9.6, netto: 120 },
    ],
    subtotalNetto: 866.91,
    discount: { mode: 'percent', value: 5, label: 'Stammkundenrabatt' },
    discountAmount: 43.35,
    totalNetto: 823.56,
    totalVat: 164.71,
    totalBrutto: 988.27,
    paymentStatus: 'Offen',
    ...extra,
  } as Invoice;
}

const allgemein = (inv: Invoice, extra: Partial<EbiOptionen> = {}): EbiOptionen => ({
  company: firma, invoice: inv, empfaengerArt: 'allgemein', ...extra,
});

describe('ebInterface 6.1: eine Rechnung', () => {
  it('ist gültig nach dem offiziellen Schema', async () => {
    expect(await gueltig(ebInterfaceXml(allgemein(rechnung())))).toEqual([]);
  });

  it('trägt dieselben Beträge wie das PDF: Positionen, Rabatte, Steuer, Brutto', () => {
    const xml = ebInterfaceXml(allgemein(rechnung()));
    expect(werte(xml, 'LineItemAmount')).toEqual(['576.00', '170.91', '120.00']);
    // Positionsrabatt: Basis − Betrag = Zeile.
    expect(wert(xml, 'Percentage')).toBe('10.00');
    expect(werte(xml, 'Amount').slice(0, 2)).toEqual(['18.99', '43.35']);
    // Rabatt über die Rechnung, auf die Zwischensumme.
    expect(xml).toContain('<Comment>Stammkundenrabatt 5 %</Comment>');
    expect(werte(xml, 'BaseAmount')).toContain('866.91');
    expect(werte(xml, 'TaxAmount')).toEqual(['164.71']);
    expect(wert(xml, 'TotalGrossAmount')).toBe('988.27');
    expect(wert(xml, 'PayableAmount')).toBe('988.27');
  });

  it('bildet Titel als Gruppen ab und Text als weitere Beschreibung der Position davor', () => {
    const xml = ebInterfaceXml(allgemein(rechnung()));
    expect(werte(xml, 'HeaderDescription')).toEqual(['Bad', 'Heizraum']);
    const erste = /<ListLineItem>[\s\S]*?<\/ListLineItem>/.exec(xml)![0];
    expect(werte(erste, 'Description')).toEqual(['Facharbeiterstunden', 'Montage im Bestand']);
    expect(werte(xml, 'PositionNumber')).toEqual(['1', '2', '3']);
  });

  it('Rechnungssteller, Empfänger, Leistungszeitraum, Bank und Zahlungsziel', () => {
    const xml = ebInterfaceXml(allgemein(rechnung({ bestellnummer: 'PO-77' }), { kunde: { email: 'buero@hv-nord.at', kundennummer: 'K-100' } }));
    expect(werte(xml, 'VATIdentificationNumber')).toEqual(['ATU12345678', 'ATU00000000']);
    expect(xml).toContain('<FurtherIdentification IdentificationType="FN">FN 123456a</FurtherIdentification>');
    expect(werte(xml, 'Street')).toEqual(['Hauptstraße 12', 'Hauptplatz 1']);
    expect(werte(xml, 'ZIP')).toEqual(['2700', '8010']);
    expect(werte(xml, 'Email')).toEqual(['office@perl.at', 'buero@hv-nord.at']);
    expect(wert(xml, 'BillersInvoiceRecipientID')).toBe('K-100');
    expect(wert(xml, 'OrderID')).toBe('PO-77');
    expect(wert(xml, 'FromDate')).toBe('2026-10-01');
    expect(wert(xml, 'ToDate')).toBe('2026-10-10');
    expect(wert(xml, 'IBAN')).toBe('AT611904300234573201');
    expect(wert(xml, 'BIC')).toBe('BKAUATWW');
    expect(wert(xml, 'DueDate')).toBe('2026-10-29');
    expect(wert(xml, 'PaymentReference')).toBe('RE-2026-1042');
    // Zeichen, die in XML etwas bedeuten, stehen maskiert da.
    expect(xml).toContain('<Name>Hausverwaltung Nord &amp; Söhne</Name>');
  });

  it('ein Leistungstag steht als Datum, nicht als Zeitraum', async () => {
    const xml = ebInterfaceXml(allgemein(rechnung({ leistungVon: '2026-10-04', leistungBis: '2026-10-04' })));
    expect(wert(xml, 'Date')).toBe('2026-10-04');
    expect(xml).not.toContain('<Period>');
    expect(await gueltig(xml)).toEqual([]);
  });

  it('Skonto vom Zahlbetrag, wie auf dem PDF', async () => {
    const xml = ebInterfaceXml(allgemein(rechnung({ skontoProzent: 3, skontoBis: '2026-10-22' })));
    expect(wert(xml, 'PaymentDate')).toBe('2026-10-22');
    expect(xml).toMatch(/<Discount>[\s\S]*<BaseAmount>988.27<\/BaseAmount>[\s\S]*<Percentage>3.00<\/Percentage>[\s\S]*<Amount>29.65<\/Amount>/);
    expect(await gueltig(xml)).toEqual([]);
  });

  it('Dateiname nach der Belegnummer', () => {
    expect(ebiDateiname({ invoice: rechnung() })).toBe('RE-2026-1042.xml');
    expect(ebiDateiname({ invoice: rechnung({ invoiceNumber: 'RE 2026/7' }) })).toBe('RE_2026_7.xml');
  });
});

describe('ebInterface 6.1: Steuer', () => {
  it('Übergang der Steuerschuld: Kategorie AE, keine Steuer, Pflichtsatz', async () => {
    const inv = rechnung({
      reverseCharge: true, vatRate: 0, customerVatId: 'ATU87654321', discount: null, discountAmount: 0,
      positions: [{ label: 'Rohinstallation', qty: 1, unit: 'pauschal', unitPrice: 4200, netto: 4200 }],
      subtotalNetto: 4200, totalNetto: 4200, totalVat: 0, totalBrutto: 4200,
    });
    const xml = ebInterfaceXml(allgemein(inv));
    expect(xml).toContain('<TaxPercent TaxCategoryCode="AE">0.00</TaxPercent>');
    expect(werte(xml, 'TaxAmount')).toEqual(['0.00']);
    expect(werte(xml, 'Comment')).toContain(RC_HINWEIS);
    expect(werte(xml, 'VATIdentificationNumber')[1]).toBe('ATU87654321');
    expect(await gueltig(xml)).toEqual([]);
  });

  it('steuerfrei: Kategorie E mit dem Grund der Befreiung', async () => {
    const inv = rechnung({
      vatRate: 0, steuerbefreiung: 'Steuerfrei gemäß § 6 Abs 1 Z 27 UStG (Kleinunternehmer)', discount: null, discountAmount: 0,
      positions: [{ label: 'Service Therme', qty: 1, unit: 'Stk', unitPrice: 150, netto: 150 }],
      subtotalNetto: 150, totalNetto: 150, totalVat: 0, totalBrutto: 150,
    });
    const xml = ebInterfaceXml(allgemein(inv));
    expect(xml).toContain('<TaxPercent TaxCategoryCode="E">0.00</TaxPercent>');
    expect(werte(xml, 'Comment')).toContain('Steuerfrei gemäß § 6 Abs 1 Z 27 UStG (Kleinunternehmer)');
    expect(await gueltig(xml)).toEqual([]);
  });

  it('ermäßigter Satz: Kategorie AA', () => {
    const inv = rechnung({
      vatRate: 0.13, discount: null, discountAmount: 0,
      positions: [{ label: 'Leistung', qty: 1, unit: 'Stk', unitPrice: 100, netto: 100 }],
      subtotalNetto: 100, totalNetto: 100, totalVat: 13, totalBrutto: 113,
    });
    expect(ebInterfaceXml(allgemein(inv))).toContain('<TaxPercent TaxCategoryCode="AA">13.00</TaxPercent>');
  });
});

describe('ebInterface 6.1: Anzahlung, Teil- und Schlussrechnung', () => {
  const schluss = () => rechnung({
    art: 'schluss',
    discount: null, discountAmount: 0,
    positions: [{ label: 'Heizungsanlage komplett', qty: 1, unit: 'pauschal', unitPrice: 20000, netto: 20000 }],
    subtotalNetto: 20000,
    gesamtNetto: 20000, gesamtVat: 4000, gesamtBrutto: 24000,
    vorrechnungen: [
      { invoiceId: 'a', invoiceNumber: 'RE-2026-0901', invoiceDate: '2026-06-01', netto: 5000, vat: 1000, brutto: 6000 },
      { invoiceId: 't', invoiceNumber: 'RE-2026-0950', invoiceDate: '2026-08-01', netto: 7000, vat: 1400, brutto: 8400 },
    ],
    totalNetto: 8000, totalVat: 1600, totalBrutto: 9600,
    ruecklassArt: 'haft', ruecklassProzent: 3, ruecklassBetrag: 720, ruecklassBis: '2029-10-15',
  });

  it('Schlussrechnung: ganze Leistung, Vorrechnungen negativ mit Verweis, Rücklass unter dem Strich', async () => {
    const xml = ebInterfaceXml(allgemein(schluss()));
    expect(xml).toContain('DocumentType="FinalSettlement"');
    expect(werte(xml, 'LineItemAmount')).toEqual(['20000.00', '-5000.00', '-7000.00', '-720.00']);
    expect(werte(xml, 'InvoiceNumber')).toEqual(['RE-2026-1042', 'RE-2026-0901', 'RE-2026-0950']);
    expect(werte(xml, 'TaxableAmount').slice(-1)).toEqual(['8000.00']);
    expect(werte(xml, 'TaxAmount')).toEqual(['1600.00']);
    // Forderung wie auf dem PDF; der Rücklass mindert nur den Zahlbetrag.
    expect(wert(xml, 'TotalGrossAmount')).toBe('9600.00');
    expect(wert(xml, 'PayableAmount')).toBe('8880.00');
    expect(xml).toContain('<Description>Haftrücklass 3 %, fällig am 15.10.2029</Description>');
    expect(await gueltig(xml)).toEqual([]);
  });

  it('Anzahlungsrechnung: eigene Art und der Hinweis, dass die Leistung aussteht', async () => {
    const xml = ebInterfaceXml(allgemein(rechnung({ art: 'anzahlung' })));
    expect(xml).toContain('DocumentType="InvoiceForAdvancePayment"');
    expect(xml).toContain('DocumentTitle="Anzahlungsrechnung"');
    expect(werte(xml, 'Comment')).toContain('Anzahlung auf eine noch zu erbringende Leistung.');
    expect(await gueltig(xml)).toEqual([]);
  });

  it('Teilrechnung: InvoiceForPartialDelivery', () => {
    expect(ebInterfaceXml(allgemein(rechnung({ art: 'teil' })))).toContain('DocumentType="InvoiceForPartialDelivery"');
  });
});

describe('ebInterface 6.1: Stornorechnung', () => {
  const storniert = () => rechnung({
    paymentStatus: 'Storniert', stornoNummer: 'RE-2026-1050', stornoAm: Date.parse('2026-10-20T09:00:00Z'),
    cancelledAt: Date.parse('2026-10-20T08:00:00Z'), cancellationNote: 'Falscher Empfänger',
  });

  it('eigene Nummer, Verweis auf die Rechnung, dieselben Beträge mit demselben Vorzeichen', async () => {
    const xml = ebInterfaceXml(allgemein(storniert(), { storno: true }));
    expect(werte(xml, 'InvoiceNumber')).toEqual(['RE-2026-1050', 'RE-2026-1042']);
    expect(werte(xml, 'InvoiceDate')).toEqual(['2026-10-20', '2026-10-15']);
    expect(xml).toMatch(/<CancelledOriginalDocument>[\s\S]*<DocumentType>Invoice<\/DocumentType>[\s\S]*Grund: Falscher Empfänger/);
    expect(wert(xml, 'TotalGrossAmount')).toBe('988.27');
    // Kein Zahlungsziel: ein Storno fordert nichts.
    expect(xml).not.toContain('<PaymentConditions>');
    expect(xml).toContain('DocumentTitle="Stornorechnung"');
    expect(ebiDateiname({ invoice: storniert(), storno: true })).toBe('RE-2026-1050.xml');
    expect(await gueltig(xml)).toEqual([]);
  });

  it('ohne ausgestellte Stornorechnung keine Datei', () => {
    const p = ebiPruefen(allgemein(rechnung({ paymentStatus: 'Storniert' }), { storno: true }));
    expect(p.fehler).toContain('Für diese Rechnung ist noch keine Stornorechnung ausgestellt.');
  });
});

describe('ebInterface 6.1: über e-Rechnung.gv.at an den Bund', () => {
  const bund = (extra: Partial<EbiOptionen> = {}): EbiOptionen => ({
    company: firma, invoice: rechnung(), empfaengerArt: 'bund',
    auftragsreferenz: '4700000001', bestellposition: '10', lieferantennummer: '50012345', ...extra,
  });

  it('Lieferantennummer, Auftragsreferenz und Bestellposition je Zeile — gültig', async () => {
    const xml = ebInterfaceXml(bund());
    expect(wert(xml, 'InvoiceRecipientsBillerID')).toBe('50012345');
    expect(werte(xml, 'OrderPositionNumber')).toEqual(['10', '10', '10']);
    expect(werte(xml, 'OrderID')).toEqual(['4700000001', '4700000001', '4700000001', '4700000001']);
    expect(await gueltig(xml)).toEqual([]);
  });

  it('mit Einkäufergruppe ohne Bestellposition', () => {
    const xml = ebInterfaceXml(bund({ auftragsreferenz: 'Z01:111599', bestellposition: '' }));
    expect(xml).not.toContain('OrderPositionNumber');
  });

  it('verlangt E-Mail und IBAN des Rechnungsstellers', () => {
    const p = ebiPruefen(bund({ company: { ...firma, contactLine: 'Tel 02622 12345', iban: '' } }));
    expect(p.fehler.some((f) => f.includes('E-Mail-Adresse des Rechnungsstellers'))).toBe(true);
    expect(p.fehler.some((f) => f.includes('IBAN'))).toBe(true);
    expect(() => ebInterfaceXml(bund({ company: { ...firma, iban: '' } }))).toThrow(/IBAN/);
  });

  it('prüft Auftragsreferenz, Bestellposition und Lieferantennummer', () => {
    expect(ebiPruefen(bund({ auftragsreferenz: '47000' })).fehler.join(' ')).toMatch(/zehnstellige Bestellnummer/);
    expect(ebiPruefen(bund({ bestellposition: '' })).fehler.join(' ')).toMatch(/Bestellposition/);
    expect(ebiPruefen(bund({ lieferantennummer: '1234' })).fehler.join(' ')).toMatch(/achtstellig/);
    expect(ebiPruefen(bund()).fehler).toEqual([]);
  });

  it('andere Empfänger: Kennung mit Schrägstrich und eine Lieferantennummer', () => {
    expect(auftragsreferenzFehler('andere', 'Z0/')).toBeNull();
    expect(auftragsreferenzFehler('andere', 'Z0/Akt 4711')).toBeNull();
    expect(auftragsreferenzFehler('andere', 'Z0')).toMatch(/Schrägstrich/);
    expect(auftragsreferenzFehler('andere', 'Z/')).toMatch(/Schrägstrich/);
    const p = ebiPruefen({ company: firma, invoice: rechnung(), empfaengerArt: 'andere', auftragsreferenz: 'L12/', lieferantennummer: '' });
    expect(p.fehler.join(' ')).toMatch(/Lieferantennummer fehlt/);
  });

  it(`höchstens ${EBI_HOECHSTENS_POSITIONEN} Positionen`, () => {
    const viele = Array.from({ length: 1000 }, () => ({ label: 'Teil', qty: 1, unit: 'Stk', unitPrice: 1, netto: 1 }));
    const inv = rechnung({ positions: viele, discount: null, discountAmount: 0, subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200 });
    expect(ebiPruefen(bund({ invoice: inv })).fehler.join(' ')).toMatch(/höchstens 999 Positionen/);
    // Außerhalb von e-Rechnung.gv.at gilt die Grenze nicht.
    expect(ebiPruefen(allgemein(inv)).fehler).toEqual([]);
  });
});

describe('ebInterface 6.1: was die Datei zurückhält', () => {
  it('ohne Positionen, ohne zerlegbare Anschrift, ohne Leistungsdatum', () => {
    const p = ebiPruefen(allgemein(rechnung({ positions: [], address: 'irgendwo', leistungVon: undefined, leistungBis: undefined })));
    expect(p.fehler.join(' ')).toMatch(/keine festgehaltenen Positionen/);
    expect(p.fehler.join(' ')).toMatch(/lässt sich nicht in Straße, Postleitzahl und Ort zerlegen/);
    expect(p.fehler.join(' ')).toMatch(/Leistungsdatum/);
  });

  /*
    WAS ZU TUN IST (Testbericht Runde 6, M6). Die Anschrift ist festgehalten,
    im Dialog gibt es kein Feld dafür — die Meldung sagt den Weg: Kundenakte,
    Storno, neue Rechnung. Bei der Stornorechnung gibt es diesen Weg nicht.
  */
  it('sagt bei einer Anschrift, die sich nicht zerlegen lässt, was zu tun ist', () => {
    const p = ebiPruefen(allgemein(rechnung({ address: 'Bürgergasse 7, 82 Gleisdorf' })));
    expect(p.fehler).toEqual([
      'Die Anschrift auf der Rechnung („Bürgergasse 7, 82 Gleisdorf“) lässt sich nicht in Straße, Postleitzahl und Ort zerlegen. '
        + 'Das ist mit der Rechnung festgehalten und lässt sich hier nicht ändern: die Anschrift in der Kundenakte berichtigen, '
        + 'dann die Rechnung stornieren und neu ausstellen.',
    ]);
    expect(p.fehler.join(' ')).not.toMatch(/Angaben unten/);
  });

  it('sagt es auch bei fehlendem Leistungsdatum — und bei der Stornorechnung den anderen Weg', () => {
    const ohne = ebiPruefen(allgemein(rechnung({ leistungVon: undefined, leistungBis: undefined })));
    expect(ohne.fehler.join(' ')).toMatch(/stornieren und mit Leistungszeitraum neu ausstellen/);
    const storno = ebiPruefen(allgemein(rechnung({
      address: 'Bürgergasse 7, 82 Gleisdorf', paymentStatus: 'Storniert', stornoNummer: 'RE-2026-1600',
    }), { storno: true }));
    expect(storno.fehler.join(' ')).toMatch(/Stornorechnung trägt die festgehaltenen Angaben der Rechnung/);
    expect(storno.fehler.join(' ')).not.toMatch(/stornieren und neu ausstellen/);
  });

  it('bei einer Anzahlung ist das fehlende Leistungsdatum nur ein Hinweis', () => {
    const p = ebiPruefen(allgemein(rechnung({ art: 'anzahlung', leistungVon: undefined, leistungBis: undefined })));
    expect(p.fehler).toEqual([]);
    expect(p.hinweise.join(' ')).toMatch(/Leistung noch aus/);
  });

  it('wenn Menge × Preis nicht den Betrag der Zeile ergibt — der Empfänger rechnet nach', () => {
    const inv = rechnung({
      positions: [{ label: 'Leistung', qty: 3, unit: 'Std', unitPrice: 70, netto: 200 }],
      discount: null, discountAmount: 0, subtotalNetto: 200, totalNetto: 200, totalVat: 40, totalBrutto: 240,
    });
    expect(ebiPruefen(allgemein(inv)).fehler.join(' ')).toMatch(/Menge × Einzelpreis ergibt 210.00, die Zeile 200.00/);
  });

  it('wenn die Summen der Rechnung nicht zu den Positionen passen', () => {
    expect(ebiPruefen(allgemein(rechnung({ totalBrutto: 990 }))).fehler.join(' ')).toMatch(/gefordert sind 990.00/);
  });

  it('Gleichbleiben: eine vollständige Rechnung hat weder Fehler noch Hinweise', () => {
    expect(ebiPruefen(allgemein(rechnung()))).toEqual({ fehler: [], hinweise: [] });
  });
});

describe('Hilfen', () => {
  it('zerlegt die Anschrift, wie die Datenbank sie zusammensetzt', () => {
    expect(anschriftZerlegen('Hauptplatz 1, 8010 Graz')).toEqual({ strasse: 'Hauptplatz 1', plz: '8010', ort: 'Graz', land: 'AT' });
    expect(anschriftZerlegen('Marienplatz 1, 80331 München, Deutschland')).toEqual({ strasse: 'Marienplatz 1', plz: '80331', ort: 'München', land: 'DE' });
    expect(anschriftZerlegen('Hauptplatz 1, Stiege 2, Top 3, 8010 Graz')).toEqual({ strasse: 'Hauptplatz 1, Stiege 2, Top 3', plz: '8010', ort: 'Graz', land: 'AT' });
    expect(anschriftZerlegen('Graz')).toBeNull();
    expect(anschriftZerlegen('Hauptplatz 1, Graz')).toBeNull();
    expect(anschriftZerlegen('')).toBeNull();
  });

  it('findet die E-Mail-Adresse in der Kontaktzeile', () => {
    expect(emailAusKontakt('Tel 0664 1234 · office@perl.at · www.perl.at')).toBe('office@perl.at');
    expect(emailAusKontakt('Tel 0664 1234')).toBeNull();
  });

  it('Gegenprobe: der Schemaprüfer weist eine Datei ohne Empfänger ab', async () => {
    const xml = ebInterfaceXml(allgemein(rechnung())).replace(/<InvoiceRecipient>[\s\S]*<\/InvoiceRecipient>/, '');
    expect((await gueltig(xml)).length).toBeGreaterThan(0);
  });
});
