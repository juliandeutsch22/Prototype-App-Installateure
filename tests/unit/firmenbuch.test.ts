import { describe, it, expect } from 'vitest';
import { firmenbuchEingetragen, firmenbuchFehlt, firmenbuchZeile, imFirmenbuch } from '@/lib/firmenbuch';

/** Runde 3, M8: Firmenbuchnummer und -gericht (§ 14 UGB). */
describe('Firmenbuch', () => {
  it('erkennt die Rechtsformen aus dem Namen', () => {
    for (const n of ['Perl Installationen GmbH', 'Huber & Co KG', 'Maier OG', 'Gruber e.U.', 'Bau AG', 'Muster GmbH & Co KG', 'Neu FlexCo']) {
      expect(imFirmenbuch(n), n).toBe(true);
    }
  });

  it('Gegenprobe: Einzelunternehmer ohne Eintragung und Wörter, die nur so aussehen', () => {
    for (const n of ['Installateur Franz Huber', 'Agrartechnik Moser', 'Kogler Haustechnik', 'Ogris Bad']) {
      expect(imFirmenbuch(n), n).toBe(false);
    }
  });

  it('nennt, was fehlt', () => {
    expect(firmenbuchFehlt({ name: 'Perl Installationen GmbH', companyRegister: 'FN 123456a' })).toEqual(['Firmenbuchgericht']);
    expect(firmenbuchFehlt({ name: 'Perl Installationen GmbH' })).toEqual(['Firmenbuchnummer', 'Firmenbuchgericht']);
    expect(firmenbuchFehlt({ name: 'Perl Installationen GmbH', companyRegister: '123456a', firmenbuchgericht: 'LG Wr. Neustadt' })).toEqual([]);
    expect(firmenbuchFehlt({ name: 'Franz Huber' })).toEqual([]);
  });

  it('die Zeile im Belegfuß: „FN …, Gericht“, FN wird ergänzt', () => {
    expect(firmenbuchZeile({ companyRegister: 'FN 123456a', firmenbuchgericht: 'Landesgericht Wiener Neustadt' }))
      .toBe('FN 123456a, Landesgericht Wiener Neustadt');
    expect(firmenbuchZeile({ companyRegister: '123456a' })).toBe('FN 123456a');
    expect(firmenbuchZeile({})).toBe('');
  });
});

/*
  DIE EIGENE ANGABE (A12, 24.10.2026): ein eingetragenes Einzelunternehmen
  ohne „e.U.“ im Namen setzt den Haken; ohne Angabe zählt der Name.
*/
describe('Firmenbuch: eigene Angabe', () => {
  it('ein eingetragenes Einzelunternehmen ohne Zusatz bekommt die Warnung', () => {
    expect(firmenbuchEingetragen({ name: 'Installateur Franz Huber', imFirmenbuch: true })).toBe(true);
    expect(firmenbuchFehlt({ name: 'Installateur Franz Huber', imFirmenbuch: true })).toEqual(['Firmenbuchnummer', 'Firmenbuchgericht']);
  });

  it('die Angabe „nicht eingetragen“ zählt vor dem Namen', () => {
    expect(firmenbuchFehlt({ name: 'Maier OG', imFirmenbuch: false })).toEqual([]);
  });

  it('bleibt gleich: ohne Angabe entscheidet der Name', () => {
    expect(firmenbuchEingetragen({ name: 'Perl Installationen GmbH', imFirmenbuch: null })).toBe(true);
    expect(firmenbuchEingetragen({ name: 'Franz Huber' })).toBe(false);
    expect(firmenbuchEingetragen(null)).toBe(false);
  });
});
