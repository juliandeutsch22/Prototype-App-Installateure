// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  AuszugUnlesbar, betragLesen, datumLesen, kontoauszugKennungen, kontoauszugLesen,
} from '@/features/invoices/kontoauszugLesen';
import { dekodiere } from '@/features/materials/datanorm';

/*
  DEN KONTOAUSZUG LESEN (F13). Die Proben sind nach den Formaten gebaut, wie
  österreichische Banken sie ausgeben: camt.053 in der alten (001.02) und der
  neuen Fassung (001.08) mit Sammelbuchung, MT940 mit gegliedertem `:86:`,
  CSV mit Kopfzeile (George-Art), ohne Kopfzeile (ELBA/Raiffeisen und
  BAWAG/easybank), in Windows-1252. Erwartet wird jeweils dasselbe: Eingänge
  in Euro mit Tag, Betrag, Auftraggeber und Zweck; Abbuchungen, Vormerkungen
  und fremde Währungen gezählt, nicht übernommen.
*/

const CAMT_02 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>1</MsgId><CreDtTm>2026-11-12T06:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>2026-11-11</Id>
      <Acct><Id><IBAN>AT48 3200 0000 1234 5864</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="EUR">1234.56</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-11</Dt></BookgDt>
        <ValDt><Dt>2026-11-11</Dt></ValDt>
        <AcctSvcrRef>REF-1</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
          <RltdPties>
            <Dbtr><Nm>Maria Huber</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>AT611904300234573201</IBAN></Id></DbtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>RE-2026-1001 / B-2026-</Ustrd><Ustrd>0007</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">89.90</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-11</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties>
            <Dbtr><Nm>Perl Installationen</Nm></Dbtr>
            <Cdtr><Nm>Maria Huber</Nm></Cdtr>
            <CdtrAcct><Id><IBAN>AT611904300234573201</IBAN></Id></CdtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>Rueckzahlung Guthaben RE-2026-0990</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">50.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>PDNG</Sts>
        <BookgDt><Dt>2026-11-12</Dt></BookgDt>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">70.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-11</Dt></BookgDt>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const CAMT_08_SAMMEL = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Acct><Id><IBAN>AT483200000012345864</IBAN></Id></Acct>
    <Ntry>
      <Amt Ccy="EUR">300.00</Amt>
      <CdtDbtInd>CRDT</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><DtTm>2026-11-10T09:12:00+01:00</DtTm></BookgDt>
      <NtryDtls>
        <TxDtls>
          <Amt Ccy="EUR">100.00</Amt>
          <RltdPties><Dbtr><Pty><Nm>Bau Meier GmbH</Nm></Pty></Dbtr></RltdPties>
          <RmtInf><Strd><CdtrRefInf><Ref>RE20261002</Ref></CdtrRefInf></Strd></RmtInf>
        </TxDtls>
        <TxDtls>
          <Amt Ccy="EUR">200.00</Amt>
          <RltdPties><Dbtr><Pty><Nm>Hausverwaltung Gruber</Nm></Pty></Dbtr></RltdPties>
          <RmtInf><Ustrd>Rechnung 2026-1003</Ustrd></RmtInf>
        </TxDtls>
      </NtryDtls>
    </Ntry>
    <Ntry>
      <Amt Ccy="EUR">10.00</Amt>
      <CdtDbtInd>CRDT</CdtDbtInd>
      <RvslInd>true</RvslInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>2026-11-10</Dt></BookgDt>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`;

const MT940 = [
  ':20:STARTUMS',
  ':25:AT483200000012345864',
  ':28C:00001/001',
  ':60F:C261110EUR1000,00',
  ':61:2611111111C240,00NTRFNONREF//1234',
  ':86:166?00GUTSCHRIFT?20RE-2026-1004 Danke?21fuer die Arbeit?31AT611904300234573201',
  '?32Josef Steiner',
  ':61:2611111111D35,50NDDTNONREF',
  ':86:105?00LASTSCHRIFT?20Strom',
  ':62F:C261111EUR1204,50',
  '-',
].join('\r\n');

const CSV_GEORGE = [
  'Buchungsdatum;Valutadatum;Partnername;Partner IBAN;Betrag;Währung;Buchungstext;Zahlungsreferenz',
  '11.11.2026;11.11.2026;Anna Berger;AT02 2050 3021 0102 3600;1.500,00;EUR;Überweisung;RE-2026-1005',
  '11.11.2026;11.11.2026;Stadtwerke;AT11 1100 0000 1234 5678;-120,00;EUR;Lastschrift;Strom Oktober',
  '12.11.2026;12.11.2026;Karl Fuchs;;99,99;EUR;Gutschrift;Rechnung RE 2026 1006',
].join('\n');

const CSV_ELBA = [
  '11.11.2026;"Gutschrift Überweisung WALTER LANG AT61 1904 3002 3457 3201 RE-2026-1007";11.11.2026;+2.400,00;EUR;11.11.2026 07:01:22:123',
  '11.11.2026;"Bezahlung Karte Tankstelle";11.11.2026;-62,40;EUR;11.11.2026 10:15:00:000',
].join('\r\n');

const CSV_BAWAG = [
  'AT141400012345678901;"Gutschrift RE-2026-1008 PETER WINKLER";12.11.2026;12.11.2026;+350,00;EUR',
  'AT141400012345678901;"Miete November";12.11.2026;12.11.2026;-900,00;EUR',
  'AT141400012345678901;"Gutschrift RE-2026-1009";13.11.2026;13.11.2026;+80,00;EUR',
].join('\n');

describe('Beträge und Tage, wie Banken sie schreiben', () => {
  it('liest die üblichen Schreibweisen', () => {
    expect(betragLesen('1.234,56')).toBe(1234.56);
    expect(betragLesen('+1.234,56')).toBe(1234.56);
    expect(betragLesen('-12,00')).toBe(-12);
    expect(betragLesen('12,00-')).toBe(-12);
    expect(betragLesen('1234.56')).toBe(1234.56);
    expect(betragLesen('1,234.56')).toBe(1234.56);
    expect(betragLesen('1 234,56 EUR')).toBe(1234.56);
    expect(betragLesen('€ 7,5')).toBe(7.5);
  });
  it('erfindet keinen Betrag', () => {
    expect(betragLesen('')).toBeNull();
    expect(betragLesen('Saldo')).toBeNull();
    expect(betragLesen('12a')).toBeNull();
    // Ohne Cent mehrdeutig (1.234 € oder 1,234 €?) — wird nicht geraten.
    expect(betragLesen('1.234')).toBeNull();
  });
  it('liest Tage in österreichischer und ISO-Schreibweise, auch mit Uhrzeit', () => {
    expect(datumLesen('31.10.2026')).toBe('2026-10-31');
    expect(datumLesen('1.3.26')).toBe('2026-03-01');
    expect(datumLesen('2026-10-31T10:00:00+01:00')).toBe('2026-10-31');
    expect(datumLesen('11.11.2026 07:01:22:123')).toBe('2026-11-11');
    expect(datumLesen('31.02.2026')).toBeNull();
    expect(datumLesen('Saldo')).toBeNull();
  });
});

describe('camt.053', () => {
  it('liest Eingänge mit Auftraggeber, IBAN und zusammengefügtem Zweck; zählt den Rest', () => {
    const a = kontoauszugLesen(CAMT_02);
    expect(a.format).toBe('camt.053');
    expect(a.konto).toBe('AT483200000012345864');
    expect(a.eingaenge).toEqual([{
      stelle: 1, buchungstag: '2026-11-11', valuta: '2026-11-11', betrag: 1234.56,
      name: 'Maria Huber', iban: 'AT611904300234573201', zweck: 'RE-2026-1001 / B-2026- 0007',
    }]);
    expect(a.nichtBetrachtet).toEqual({ vorgemerkt: 1, rueckbuchungen: 0, fremdwaehrung: 1 });
    // Die Abbuchung mit dem EMPFÄNGER als Gegenseite (Kreditor), nicht dem eigenen Betrieb.
    expect(a.ausgaenge).toEqual([{
      stelle: 2, buchungstag: '2026-11-11', betrag: 89.9, ausgang: true,
      name: 'Maria Huber', iban: 'AT611904300234573201', zweck: 'Rueckzahlung Guthaben RE-2026-0990',
    }]);
    expect(a.von).toBe('2026-11-11');
  });

  it('teilt eine Sammelbuchung mit eigenen Beträgen in einzelne Eingänge (camt.053.001.08)', () => {
    const a = kontoauszugLesen(CAMT_08_SAMMEL);
    expect(a.eingaenge.map((e) => [e.betrag, e.name, e.zweck, e.buchungstag])).toEqual([
      [100, 'Bau Meier GmbH', 'RE20261002', '2026-11-10'],
      [200, 'Hausverwaltung Gruber', 'Rechnung 2026-1003', '2026-11-10'],
    ]);
    expect(a.nichtBetrachtet.rueckbuchungen).toBe(1);
  });

  it('eine XML-Datei, die kein Auszug ist, und eine beschädigte sagen, was zu tun ist', () => {
    expect(() => kontoauszugLesen('<?xml version="1.0"?><Rechnung/>')).toThrow(AuszugUnlesbar);
    expect(() => kontoauszugLesen('<Document><BkToCstmrStmt>')).toThrow(/beschädigt|kein Kontoauszug/);
  });
});

describe('MT940', () => {
  it('liest :61: und den gegliederten :86:', () => {
    const a = kontoauszugLesen(MT940);
    expect(a.format).toBe('mt940');
    expect(a.konto).toBe('AT483200000012345864');
    expect(a.eingaenge).toEqual([{
      stelle: 1, buchungstag: '2026-11-11', valuta: '2026-11-11', betrag: 240,
      name: 'Josef Steiner', iban: 'AT611904300234573201', zweck: 'RE-2026-1004 Dankefuer die Arbeit',
    }]);
    expect(a.ausgaenge.map((x) => [x.betrag, x.ausgang, x.zweck])).toEqual([[35.5, true, 'Strom']]);
  });
});

describe('CSV', () => {
  it('mit Kopfzeile: Spalten nach Namen, Abbuchungen gezählt', () => {
    const a = kontoauszugLesen(CSV_GEORGE);
    expect(a.format).toBe('csv');
    expect(a.beschreibung).toMatch(/mit Kopfzeile/);
    expect(a.eingaenge).toEqual([
      { stelle: 1, buchungstag: '2026-11-11', valuta: '2026-11-11', betrag: 1500, name: 'Anna Berger', iban: 'AT022050302101023600', zweck: 'Überweisung RE-2026-1005' },
      { stelle: 3, buchungstag: '2026-11-12', valuta: '2026-11-12', betrag: 99.99, name: 'Karl Fuchs', zweck: 'Gutschrift Rechnung RE 2026 1006' },
    ]);
    expect(a.ausgaenge).toEqual([
      { stelle: 2, buchungstag: '2026-11-11', valuta: '2026-11-11', betrag: 120, ausgang: true, name: 'Stadtwerke', iban: 'AT111100000012345678', zweck: 'Lastschrift Strom Oktober' },
    ]);
  });

  it('ohne Kopfzeile (ELBA): Datum, Text, Betrag am Inhalt erkannt; die IBAN steht im Text', () => {
    const a = kontoauszugLesen(CSV_ELBA);
    expect(a.beschreibung).toMatch(/ohne Kopfzeile/);
    expect(a.eingaenge).toEqual([{
      stelle: 1, buchungstag: '2026-11-11', valuta: '2026-11-11', betrag: 2400,
      iban: 'AT611904300234573201', zweck: 'Gutschrift Überweisung WALTER LANG AT61 1904 3002 3457 3201 RE-2026-1007',
    }]);
    expect(a.ausgaenge.map((x) => [x.betrag, x.ausgang, x.zweck])).toEqual([[62.4, true, 'Bezahlung Karte Tankstelle']]);
  });

  it('ohne Kopfzeile (BAWAG): die gleichbleibende IBAN vorne ist das eigene Konto', () => {
    const a = kontoauszugLesen(CSV_BAWAG);
    expect(a.konto).toBe('AT141400012345678901');
    expect(a.eingaenge.map((e) => [e.buchungstag, e.betrag, e.zweck])).toEqual([
      ['2026-11-12', 350, 'Gutschrift RE-2026-1008 PETER WINKLER'],
      ['2026-11-13', 80, 'Gutschrift RE-2026-1009'],
    ]);
  });

  it('Windows-1252 (ältere Exporte) kommt mit Umlauten an', () => {
    const bytes = new Uint8Array([...CSV_GEORGE].map((c) => (c === 'ä' ? 0xe4 : c === 'Ü' ? 0xdc : c.charCodeAt(0))));
    const a = kontoauszugLesen(dekodiere(bytes.buffer).text);
    expect(a.eingaenge[0].zweck).toBe('Überweisung RE-2026-1005');
  });

  it('eine Datei ohne Datum und Betrag wird nicht geraten', () => {
    expect(() => kontoauszugLesen('Name;Ort\nHuber;Wien\nMaier;Graz')).toThrow(AuszugUnlesbar);
    expect(() => kontoauszugLesen('%PDF-1.7 …')).toThrow(/PDF/);
  });
});

describe('Die Kennung einer Bewegung', () => {
  it('dieselbe Datei ergibt dieselben Kennungen — Wiederholungssperre beim erneuten Einlesen', async () => {
    const a = await kontoauszugKennungen(kontoauszugLesen(CSV_GEORGE).eingaenge);
    const b = await kontoauszugKennungen(kontoauszugLesen(CSV_GEORGE).eingaenge);
    expect(a).toEqual(b);
    expect(a.every((k) => /^[0-9a-f]{64}$/.test(k))).toBe(true);
    expect(new Set(a).size).toBe(a.length);
  });

  it('zwei gleiche Bewegungen in einer Datei bekommen verschiedene Kennungen', async () => {
    const doppelt = `${CSV_GEORGE}\n12.11.2026;12.11.2026;Karl Fuchs;;99,99;EUR;Gutschrift;Rechnung RE 2026 1006`;
    const k = await kontoauszugKennungen(kontoauszugLesen(doppelt).eingaenge);
    expect(k).toHaveLength(3);
    expect(new Set(k).size).toBe(3);
  });

  it('Zeilenumbrüche im Zweck ändern die Kennung nicht (camt bricht, CSV fügt)', async () => {
    const basis = { stelle: 1, buchungstag: '2026-11-11', betrag: 10, iban: 'AT611904300234573201' };
    const [x] = await kontoauszugKennungen([{ ...basis, zweck: 'RE-2026-1001 / B-2026-0007' }]);
    const [y] = await kontoauszugKennungen([{ ...basis, zweck: 'RE-2026-1001 /  B-2026- 0007' }]);
    expect(x).toBe(y);
  });

  it('Gegenprobe: dieselbe Zahl als Abbuchung ist eine andere Bewegung als der Eingang', async () => {
    const basis = { stelle: 1, buchungstag: '2026-11-11', betrag: 10, zweck: 'RE-2026-1001' };
    const [ein] = await kontoauszugKennungen([basis]);
    const [aus] = await kontoauszugKennungen([{ ...basis, ausgang: true }]);
    expect(ein).not.toBe(aus);
  });

  it('Gegenprobe: ein anderer Betrag ist eine andere Bewegung', async () => {
    const basis = { stelle: 1, buchungstag: '2026-11-11', zweck: 'RE-2026-1001' };
    const [x] = await kontoauszugKennungen([{ ...basis, betrag: 10 }]);
    const [y] = await kontoauszugKennungen([{ ...basis, betrag: 10.01 }]);
    expect(x).not.toBe(y);
  });
});
