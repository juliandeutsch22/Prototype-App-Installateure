import { describe, it, expect } from 'vitest';
import { adresseZeile, landName, plzFehler } from '@/lib/adresse';
import { adresszeilen } from '@/lib/belegLayout';

// Testbericht 30.09.2026, M12 — Adressen in Teilen, die Zeile daraus.
describe('adresseZeile', () => {
  it('Straße, PLZ Ort — Österreich steht nicht da', () => {
    expect(adresseZeile({ strasse: 'Gartengasse 12', plz: '2700', ort: 'Wiener Neustadt', land: 'AT' }))
      .toBe('Gartengasse 12, 2700 Wiener Neustadt');
  });
  it('ein anderes Land steht dahinter', () => {
    expect(adresseZeile({ strasse: 'Marienplatz 1', plz: '80331', ort: 'München', land: 'DE' }))
      .toBe('Marienplatz 1, 80331 München, Deutschland');
    expect(landName('xx')).toBe('XX');
  });
  it('fehlende Teile fallen weg, leer bleibt leer', () => {
    expect(adresseZeile({ strasse: 'Gartengasse 12' })).toBe('Gartengasse 12');
    expect(adresseZeile({})).toBe('');
  });
  it('die Zeile zerfällt auf dem Beleg wieder in Straße und Ort', () => {
    expect(adresszeilen(adresseZeile({ strasse: 'Stiege 2, Top 5', plz: '8010', ort: 'Graz' })))
      .toEqual(['Stiege 2, Top 5', '8010 Graz']);
  });
});

describe('plzFehler', () => {
  it('Österreich vier, Deutschland fünf Ziffern', () => {
    expect(plzFehler('2700', 'AT')).toBeNull();
    expect(plzFehler('27000', 'AT')).not.toBeNull();
    expect(plzFehler('80331', 'DE')).toBeNull();
    expect(plzFehler('8033', 'DE')).not.toBeNull();
  });
  it('Gegenprobe: leer ist kein Fehler', () => {
    expect(plzFehler('', 'AT')).toBeNull();
  });
});
