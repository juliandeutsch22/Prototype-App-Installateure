import { describe, it, expect } from 'vitest';
import {
  decideInvoiceSeq,
  highestInvoiceSeq,
  invoiceSeqOf,
  nextInvoiceNumber,
  formatInvoiceNumber,
  isInvoiceNumberTaken,
} from '@/lib/invoiceNumbers';

const inv = (invoiceNumber: string) => ({ invoiceNumber });

describe('Nummer aus einer Rechnungsnummer lesen', () => {
  it('liest die laufende Nummer', () => {
    expect(invoiceSeqOf('RE-2026-1042')).toBe(1042);
    expect(invoiceSeqOf('  RE-2026-0500 ')).toBe(500);
  });

  it('gibt null zurueck, wenn keine Ziffern am Ende stehen', () => {
    expect(invoiceSeqOf('Entwurf')).toBeNull();
    expect(invoiceSeqOf('')).toBeNull();
  });

  it('findet die hoechste aus einer Liste', () => {
    expect(highestInvoiceSeq([inv('RE-2026-1001'), inv('RE-2026-1042'), inv('RE-2026-1007')]))
      .toBe(1042);
    expect(highestInvoiceSeq([])).toBe(0);
  });
});

describe('Vorschlag fuer die naechste Nummer', () => {
  it('startet bei 1001, wenn noch nichts existiert', () => {
    expect(nextInvoiceNumber([])).toBe(formatInvoiceNumber(1001));
  });

  const J = new Date().getFullYear();

  it('setzt einen niedrigeren Nummernkreis fort, statt auf 1001 zu springen', () => {
    // Sonst entstuende eine Luecke von 501 bis 1000, die der Betrieb
    // gegenueber dem Finanzamt begruenden muesste.
    expect(nextInvoiceNumber([inv(`RE-${J}-0500`)])).toBe(formatInvoiceNumber(501));
  });

  it('zählt nur Nummern dieses Jahres — wie der Zähler in der Datenbank', () => {
    // Im Jänner stünde sonst die Fortsetzung des Vorjahres im Feld, und die
    // Rechnung bekäme danach eine andere Nummer.
    expect(nextInvoiceNumber([inv(`RE-${J - 1}-1500`)])).toBe(formatInvoiceNumber(1001));
    expect(nextInvoiceNumber([inv(`RE-${J - 1}-1500`), inv(`R-${J}-1003`)])).toBe(formatInvoiceNumber(1004));
  });
});

describe('Nummernvergabe im Zaehler', () => {
  it('zaehlt ohne Wunsch einfach hoch', () => {
    expect(decideInvoiceSeq(1041)).toBe(1042);
  });

  it('beginnt bei 1001, wenn der Zaehler noch bei null steht', () => {
    expect(decideInvoiceSeq(0)).toBe(1001);
  });

  it('uebernimmt eine Wunschnummer nur, solange noch nichts vergeben ist', () => {
    // Der Umstieg: ein Betrieb, der seinen bestehenden Kreis fortfuehrt.
    expect(decideInvoiceSeq(0, 1500)).toBe(1500);
    // Danach lückenlos (Launch-Check, K8) — die nächste als Wunsch ist kein Sprung.
    expect(decideInvoiceSeq(1041, 1042)).toBe(1042);
    expect(() => decideInvoiceSeq(1041, 2000, 2026)).toThrow('lückenlos — die nächste ist RE-2026-1042');
  });

  it('lehnt eine bereits verbrauchte Nummer ab und nennt die naechste freie', () => {
    // Der eigentliche Schaden ohne diese Sperre: zwei Rechnungen mit
    // derselben Nummer in den Buechern.
    expect(() => decideInvoiceSeq(1041, 1041, 2026)).toThrow(/RE-2026-1041 ist bereits vergeben/);
    expect(() => decideInvoiceSeq(1041, 1000, 2026)).toThrow('nächste freie ist RE-2026-1042');
  });

  it('lehnt eine Wunschnummer ab, die keine ganze Zahl ist', () => {
    expect(() => decideInvoiceSeq(10, 0)).toThrow();
    expect(() => decideInvoiceSeq(10, -5)).toThrow();
    expect(() => decideInvoiceSeq(10, 12.5)).toThrow();
  });

  it('zwei gleichzeitige Abrechnungen erhalten verschiedene Nummern', () => {
    // Das Verhalten der Transaktion, nachgestellt: der zweite Aufruf sieht
    // den vom ersten geschriebenen Stand. Vorher leiteten beide max+1 aus
    // ihrer eigenen Liste ab und bekamen dieselbe Nummer.
    let zaehler = 1041;
    const ziehen = () => {
      const seq = decideInvoiceSeq(zaehler);
      zaehler = seq;
      return seq;
    };
    expect([ziehen(), ziehen()]).toEqual([1042, 1043]);
  });
});

describe('Vergebene Nummern erkennen', () => {
  it('erkennt eine belegte Nummer unabhaengig von Gross- und Kleinschreibung', () => {
    const list = [{ id: 'a', invoiceNumber: 'RE-2026-1001' }];
    expect(isInvoiceNumberTaken(list, 're-2026-1001')).toBe(true);
    expect(isInvoiceNumberTaken(list, 'RE-2026-1002')).toBe(false);
  });

  it('blendet die gerade bearbeitete Rechnung aus', () => {
    const list = [{ id: 'a', invoiceNumber: 'RE-2026-1001' }];
    expect(isInvoiceNumberTaken(list, 'RE-2026-1001', 'a')).toBe(false);
  });
});
