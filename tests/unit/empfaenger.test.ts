import { describe, it, expect } from 'vitest';
import { empfaengerFehler, hatPlzUndOrt, kundenartFehlt } from '@/features/invoices/empfaenger';

/** Runde 3, M9 und M10 — dieselben Regeln wie `app.rechnung_empfaenger_pruefen`. */
const KUNDE = { id: 'k1', name: 'Familie Huber', plz: '2700', ort: 'Wiener Neustadt', adressePruefen: false, kundenart: 'privat' as const };

describe('Der Empfänger einer Rechnung', () => {
  it('ein vollständiger Kunde: kein Befund', () => {
    expect(empfaengerFehler(KUNDE, 'Bergweg 3, 2700 Wiener Neustadt', '')).toBeNull();
  });

  it('„Adresse prüfen“, fehlende PLZ, fehlende Kundenart — mit Weg in die Kundenakte', () => {
    expect(empfaengerFehler({ ...KUNDE, adressePruefen: true }, 'x', '')).toMatchObject({ kundeId: 'k1', text: expect.stringMatching(/Adresse prüfen/) });
    expect(empfaengerFehler({ ...KUNDE, ort: '' }, 'x', '')?.text).toMatch(/fehlen PLZ und Ort/);
    expect(empfaengerFehler({ ...KUNDE, kundenart: null }, 'x', '')?.text).toMatch(/keine Kundenart/);
  });

  it('eine UID auf dem Beleg ersetzt die Kundenart', () => {
    expect(kundenartFehlt({ kundenart: null }, 'ATU12345678')).toBe(false);
    expect(kundenartFehlt({ kundenart: null }, '')).toBe(true);
    expect(kundenartFehlt(undefined, '')).toBe(false);
  });

  it('ohne Kunden im Stamm braucht die Anschrift PLZ und Ort', () => {
    expect(empfaengerFehler(undefined, 'Alois-Köberl-Gasse 11', '')?.text).toMatch(/keine PLZ/);
    expect(empfaengerFehler(undefined, 'Alois-Köberl-Gasse 11, 8010 Graz', '')).toBeNull();
    expect(hatPlzUndOrt('D-80331 München')).toBe(true);
  });

  it('Gegenprobe: mit Kunden im Stamm gelten seine Felder — auch eine britische Postleitzahl', () => {
    expect(empfaengerFehler({ ...KUNDE, plz: 'SW1A 1AA', ort: 'London' }, '10 Downing Street, London SW1A 1AA', '')).toBeNull();
  });
});
