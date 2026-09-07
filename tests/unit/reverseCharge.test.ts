import { describe, it, expect } from 'vitest';
import {
  geltenderSatz,
  pruefeReverseCharge,
  sichtAusWieUid,
  RC_HINWEIS,
} from '@/features/invoices/reverseCharge';

/**
 * Bauleistung mit Übergang der Steuerschuld — § 19 Abs 1a UStG.
 *
 * Erbringt der Betrieb eine Bauleistung an einen anderen Bauunternehmer, geht
 * die Umsatzsteuerschuld auf den Empfänger über: die Rechnung geht netto
 * hinaus, und auf dem Beleg muss der Übergang ausdrücklich stehen.
 *
 * WAS OHNE DAS PASSIERT: die App schreibt 20 % auf eine Rechnung an einen
 * Baumeister. Der zahlt sie nicht und verlangt eine Berichtigung — die
 * ausgewiesene Steuer schuldet der Betrieb bis dahin trotzdem
 * (§ 11 Abs 12 UStG).
 */

describe('Der geltende Steuersatz', () => {
  it('ist null, sobald der Übergang gilt', () => {
    expect(geltenderSatz(true, 0.2)).toBe(0);
  });

  it('bleibt sonst der eingestellte', () => {
    expect(geltenderSatz(false, 0.2)).toBe(0.2);
    expect(geltenderSatz(false, 0.1)).toBe(0.1);
  });

  it('ist EINE Stelle für diese Entscheidung', () => {
    /*
      Vorschau, gespeicherte Rechnung und PDF fragen dieselbe Funktion.
      Stünde die Entscheidung an drei Stellen, liefen sie irgendwann
      auseinander — und der Kunde bekäme einen Beleg mit Steuer über einen
      Betrag ohne.
    */
    expect(geltenderSatz(true, 0.13)).toBe(geltenderSatz(true, 0.2));
  });
});

describe('Wann die Rechnung vollständig ist', () => {
  it('ohne Reverse Charge ist nichts zu prüfen', () => {
    expect(pruefeReverseCharge(false, undefined, undefined).vollstaendig).toBe(true);
  });

  it('verlangt die UID des Empfängers', () => {
    // Ohne sie ist der Übergang nicht belegt, und der Empfänger kann seine
    // eigene Steuerschuld damit nicht zuordnen.
    const p = pruefeReverseCharge(true, '', 'ATU12345678');
    expect(p.vollstaendig).toBe(false);
    expect(p.fehlt.join(' ')).toContain('UID-Nummer des Kunden');
  });

  it('verlangt auch die eigene', () => {
    const p = pruefeReverseCharge(true, 'ATU99999999', undefined);
    expect(p.vollstaendig).toBe(false);
    expect(p.fehlt.join(' ')).toContain('eigene UID-Nummer');
  });

  it('nennt beide, wenn beide fehlen', () => {
    // Eine Meldung, die nur die halbe Wahrheit sagt, schickt den Nutzer
    // zweimal los.
    expect(pruefeReverseCharge(true, '', '').fehlt).toHaveLength(2);
  });

  it('lässt eine vollständige Rechnung durch', () => {
    expect(pruefeReverseCharge(true, 'ATU11112222', 'ATU12345678').vollstaendig).toBe(true);
  });

  it('zählt Leerraum nicht als Angabe', () => {
    expect(pruefeReverseCharge(true, '   ', 'ATU12345678').vollstaendig).toBe(false);
  });
});

describe('Die Form einer UID', () => {
  it('nimmt eine österreichische an', () => {
    expect(sichtAusWieUid('ATU12345678')).toBe(true);
    expect(sichtAusWieUid(' atu 1234 5678 ')).toBe(true);
  });

  it('fängt den Vertipper', () => {
    // Eine Ziffer zu wenig, das „U" vergessen — genau das passiert beim
    // Abtippen vom Briefkopf.
    expect(sichtAusWieUid('ATU1234567')).toBe(false);
    expect(sichtAusWieUid('AT12345678')).toBe(true); // fremde Form, nicht abgelehnt
    expect(sichtAusWieUid('12345678')).toBe(false);
  });

  it('lehnt eine fremde UID NICHT ab', () => {
    /*
      Absichtlich nur eine Formprüfung: die echte Gültigkeit läuft über das
      MIAS-Verfahren beim Finanzamt und braucht einen Netzzugang, den eine
      Rechnungsmaske nicht haben sollte. Andere Länder haben andere Formen —
      sie zurückzuweisen wäre falsch.
    */
    expect(sichtAusWieUid('DE123456789')).toBe(true);
    expect(sichtAusWieUid('IT12345678901')).toBe(true);
  });
});

describe('Der Pflichtsatz', () => {
  it('nennt den Übergang und die Vorschrift', () => {
    // § 11 Abs 1a UStG verlangt den Hinweis; ohne ihn ist der Beleg
    // unvollständig.
    expect(RC_HINWEIS).toContain('Steuerschuld');
    expect(RC_HINWEIS).toContain('Leistungsempfänger');
    expect(RC_HINWEIS).toContain('19 Abs 1a');
  });
});
