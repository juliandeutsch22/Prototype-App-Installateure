import { describe, it, expect } from 'vitest';
import {
  firmenbuchEingetragen, firmenbuchFehlt, firmenbuchGesperrt, firmenbuchPflichtform, firmenbuchZeile, imFirmenbuch, inGruendung,
} from '@/lib/firmenbuch';

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

  it('die Angabe „nicht eingetragen“ zählt vor dem Namen — wo der Haken frei ist', () => {
    // Seit Runde 7 (6.1) nicht mehr bei einer OG, sondern nur, wo der Haken frei ist.
    expect(firmenbuchFehlt({ name: 'Gruber e.U.', imFirmenbuch: false })).toEqual([]);
    expect(firmenbuchFehlt({ name: 'Maier GmbH i. G.', imFirmenbuch: false })).toEqual([]);
  });

  it('bleibt gleich: ohne Angabe entscheidet der Name', () => {
    expect(firmenbuchEingetragen({ name: 'Perl Installationen GmbH', imFirmenbuch: null })).toBe(true);
    expect(firmenbuchEingetragen({ name: 'Franz Huber' })).toBe(false);
    expect(firmenbuchEingetragen(null)).toBe(false);
  });
});

/*
  RUNDE 7, 6.1: Bei Rechtsformen, die es nur mit Eintragung gibt, ist der
  Haken fest — abgewählt schaltete er nur die Mahnung zu Firmenbuchnummer
  und -gericht ab. Ausnahme „in Gründung“. Einzelunternehmen bleiben frei.
*/
describe('Firmenbuch: fester Haken (Runde 7, 6.1)', () => {
  it('gesperrt bei GmbH, GmbH & Co KG, FlexCo, AG, SE, OG, KG und Genossenschaft — mit der Rechtsform für den Satz', () => {
    const faelle: [string, string][] = [
      ['Perl Installationen GmbH', 'GmbH'],
      ['Huber Ges.m.b.H.', 'GmbH'],
      ['Muster Bau GmbH & Co KG', 'GmbH & Co KG'],
      ['Neu FlexCo', 'FlexCo'],
      ['Neu FlexKapG', 'FlexKapG'],
      ['Bau AG', 'AG'],
      ['Haustechnik SE', 'SE'],
      ['Maier OG', 'OG'],
      ['Huber & Co KG', 'KG'],
      ['Wohnbau eGen', 'Genossenschaft'],
      ['Installateure eingetragene Genossenschaft', 'Genossenschaft'],
    ];
    for (const [name, form] of faelle) expect(firmenbuchGesperrt(name), name).toBe(form);
  });

  it('frei bei „in Gründung“ / „i. G.“ — dort steht noch keine Nummer', () => {
    for (const n of ['Muster GmbH i. G.', 'Muster GmbH i.G.', 'Muster GmbH in Gründung', 'Muster GmbH (in Gründung)']) {
      expect(firmenbuchGesperrt(n), n).toBeNull();
      expect(inGruendung(n), n).toBe(true);
      expect(firmenbuchPflichtform(n), n).toBe('GmbH');
    }
  });

  it('frei bei Einzelunternehmen, mit oder ohne „e.U.“, und bei Wörtern, die nur so aussehen', () => {
    for (const n of ['Installateur Franz Huber', 'Gruber e.U.', 'Agrartechnik Moser', 'Kogler Haustechnik', 'Ogris Bad', 'Segl Installationen']) {
      expect(firmenbuchGesperrt(n), n).toBeNull();
    }
  });

  it('ein abgewählter Altwert zählt bei gesperrter Rechtsform nicht — die Mahnung bleibt', () => {
    expect(firmenbuchEingetragen({ name: 'Maier OG', imFirmenbuch: false })).toBe(true);
    expect(firmenbuchFehlt({ name: 'Maier OG', imFirmenbuch: false })).toEqual(['Firmenbuchnummer', 'Firmenbuchgericht']);
  });

  it('gleich geblieben: die Erkennung „im Firmenbuch“ liest dieselben Namen wie vorher', () => {
    for (const n of ['Perl Installationen GmbH', 'Huber & Co KG', 'Maier OG', 'Gruber e.U.', 'Bau AG', 'Muster GmbH & Co KG', 'Neu FlexCo', 'Wohnbau eGen', 'Haustechnik SE']) {
      expect(imFirmenbuch(n), n).toBe(true);
    }
    for (const n of ['Installateur Franz Huber', 'Agrartechnik Moser', 'Kogler Haustechnik', 'Ogris Bad']) {
      expect(imFirmenbuch(n), n).toBe(false);
    }
  });
});
