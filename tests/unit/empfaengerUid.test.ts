import { describe, it, expect } from 'vitest';
import { pruefeEmpfaengerUid, UID_PFLICHT_AB_BRUTTO } from '@/features/invoices/empfaengerUid';

/**
 * Die UID des Leistungsempfängers — § 11 Abs 1 Z 2 UStG.
 *
 * GEFUNDEN BEI EINER DURCHSICHT: die App lud die UID aus dem Kundenstamm,
 * zeigte sie im Formular und warf sie beim Speichern weg, sobald der
 * Reverse-Charge-Haken aus war. Über 10.000 € brutto an ein Unternehmen ist
 * sie aber Pflichtangabe.
 *
 * WEN DAS TRIFFT: nicht den Aussteller, sondern den KUNDEN. Ihm steht der
 * Vorsteuerabzug erst zu, wenn sämtliche Rechnungsmerkmale vorliegen — bei
 * einer Rechnung über 12.000 € sind das rund 2.000 € Steuer, die bei ihm
 * hängenbleiben, bis jemand berichtigt.
 */

const pruefe = (bruttoBetrag: number, uid?: string, reverseCharge = false) =>
  pruefeEmpfaengerUid({ bruttoBetrag, uid, reverseCharge });

describe('Wann die UID Pflicht ist', () => {
  it('unter der Grenze nicht', () => {
    expect(pruefe(9_999.99).pflicht).toBe(false);
    expect(pruefe(9_999.99).fehlt).toBe(false);
  });

  /*
    DIE GRENZE GENAU. Das Gesetz sagt „übersteigt" — bei exakt 10.000 € ist
    sie also noch nicht Pflicht. Ein `>=` statt `>` verlangte die UID einen
    Cent zu früh; das wäre harmlos, aber falsch, und der umgekehrte Fehler
    wäre es nicht.
  */
  it('bei genau 10.000 € noch nicht', () => {
    expect(pruefe(UID_PFLICHT_AB_BRUTTO).pflicht).toBe(false);
  });

  it('einen Cent darüber schon', () => {
    expect(pruefe(UID_PFLICHT_AB_BRUTTO + 0.01).pflicht).toBe(true);
  });

  /*
    BRUTTO, NICHT NETTO. „Gesamtbetrag" ist der Rechnungsbetrag samt
    Umsatzsteuer. Mit dem Netto gerechnet läge die Grenze faktisch bei 12.000 €
    brutto — und dazwischen gingen Rechnungen ohne Pflichtangabe hinaus.
  */
  it('rechnet mit dem Bruttobetrag', () => {
    // 9.000 € netto sind 10.800 € brutto: über der Grenze.
    expect(pruefe(10_800).pflicht).toBe(true);
  });

  it('bei Reverse Charge unabhängig vom Betrag', () => {
    // Dort belegt die UID den Übergang der Steuerschuld, nicht den Betrag.
    expect(pruefe(500, undefined, true).pflicht).toBe(true);
  });
});

describe('Was gemeldet wird', () => {
  it('nennt Grenze, Bestimmung und die Folge für den Kunden', () => {
    const u = pruefe(12_000);
    expect(u.fehlt).toBe(true);
    expect(u.text).toContain('10.000');
    expect(u.text).toContain('§ 11 Abs 1 Z 2 UStG');
    expect(u.text).toContain('Vorsteuerabzug');
  });

  it('sagt dazu, dass eine Privatperson keine braucht', () => {
    /*
      Ohne diesen Satz sucht jemand eine UID für einen Kunden, der keine hat —
      und traut der Rechnung dann nicht. Ob der Empfänger Unternehmer ist,
      steht in keinem Datenfeld: die App warnt, sie sperrt nicht.
    */
    expect(pruefe(12_000).text).toMatch(/Privatperson/);
  });

  it('schweigt, sobald die UID dasteht', () => {
    const u = pruefe(12_000, 'ATU12345678');
    expect(u.pflicht).toBe(true);
    expect(u.fehlt).toBe(false);
    expect(u.text).toBe('');
  });

  it('schweigt auch unter der Grenze ohne UID', () => {
    // Eine Warnung, die immer dasteht, wird nicht gelesen.
    expect(pruefe(800).text).toBe('');
  });

  it('überlässt Reverse Charge seinen eigenen Wortlaut', () => {
    /*
      Dort meldet `pruefeReverseCharge` bereits, dass der Beleg unvollständig
      ist — und sperrt sogar das Anlegen. Zwei Warnungen nebeneinander über
      dasselbe fehlende Feld liest niemand als zwei.
    */
    const u = pruefe(500, undefined, true);
    expect(u.fehlt).toBe(true);
    expect(u.text).toBe('');
  });

  it('behandelt Leerraum wie nichts', () => {
    expect(pruefe(12_000, '   ').fehlt).toBe(true);
  });
});
