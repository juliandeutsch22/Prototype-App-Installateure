/**
 * Kunden aus CSV lesen — so, wie die Dateien wirklich aussehen.
 *
 * Excel in Österreich speichert mit Strichpunkt, Outlook mit Komma, manche
 * Programme mit Tabulator; Adressen stehen in Anführungszeichen, weil ein
 * Strichpunkt darin vorkommt; Notizen haben Zeilenumbrüche. Und keine Zeile,
 * die nicht passt, geht still verloren oder wird still „repariert".
 */
import { describe, it, expect } from 'vitest';
import { liesCsv, pruefeKunden, spaltenSchluessel, VORLAGE, HOECHSTENS } from '@/features/customers/kundenCsv';

const probe = (text: string) => pruefeKunden(liesCsv(text));

describe('CSV lesen', () => {
  it('erkennt Strichpunkt, Komma und Tabulator an der Kopfzeile', () => {
    expect(liesCsv('Name;Ort\nHuber;Wien')).toEqual([['Name', 'Ort'], ['Huber', 'Wien']]);
    expect(liesCsv('Name,Ort\r\nHuber,Wien\r\n')).toEqual([['Name', 'Ort'], ['Huber', 'Wien']]);
    expect(liesCsv('Name\tOrt\nHuber\tWien')).toEqual([['Name', 'Ort'], ['Huber', 'Wien']]);
  });

  it('versteht Anführungszeichen — mit Trenner, verdoppeltem Zeichen und Zeilenumbruch darin', () => {
    const z = liesCsv('\uFEFFName;Notiz\n"Huber; Franz";"Sagt ""Servus""\nzweite Zeile"\nMaier;');
    expect(z).toEqual([
      ['Name', 'Notiz'],
      ['Huber; Franz', 'Sagt "Servus"\nzweite Zeile'],
      ['Maier', ''],
    ]);
  });

  it('vergleicht Spaltennamen ohne Satzzeichen, Gross-/Kleinschreibung und ß', () => {
    expect(spaltenSchluessel('E-Mail')).toBe('email');
    expect(spaltenSchluessel('Straße')).toBe('strasse');
    expect(spaltenSchluessel(' UID-Nr. ')).toBe('uidnr');
  });
});

describe('Probelauf', () => {
  it('liest die eigene Vorlage vollständig', () => {
    const p = probe(VORLAGE);
    expect(p.fehler).toEqual([]);
    expect(p.ignoriert).toEqual([]);
    expect(p.kunden.map((k) => k.kunde)).toEqual([
      expect.objectContaining({
        name: 'Muster Bau GmbH', contactName: 'Anna Muster', address: 'Hauptstraße 1, 1010 Wien',
        contactPhone: '+43 1 234567', email: 'office@muster.at', vatId: 'ATU12345678',
      }),
      expect.objectContaining({
        name: 'Franz Huber', contactName: '', address: 'Dorfweg 3, 3100 St. Pölten',
        notes: 'Schlüssel beim Nachbarn',
      }),
    ]);
    expect(p.kunden.map((k) => k.zeile)).toEqual([2, 3]);
  });

  it('nimmt „Name" als Nachnamen, wenn ein Vorname daneben steht', () => {
    expect(probe('Vorname;Name\nFranz;Huber').kunden[0].kunde.name).toBe('Franz Huber');
    expect(probe('Name\nFamilie Huber').kunden[0].kunde.name).toBe('Familie Huber');
  });

  it('fügt Telefonnummern zusammen, lässt Österreich weg und nennt ein anderes Land', () => {
    const k = probe('Name;Tel.;Handy;Straße;PLZ;Ort;Land\nHuber;01 234;0664 1;Weg 1;80331;München;Deutschland\nMaier;;0664 2;Gasse 2;1010;Wien;Österreich')
      .kunden.map((x) => x.kunde);
    expect(k[0].contactPhone).toBe('01 234 / 0664 1');
    expect(k[0].address).toBe('Weg 1, 80331 München, Deutschland');
    expect(k[1].address).toBe('Gasse 2, 1010 Wien');
  });

  it('übernimmt die Kundennummer des Altsystems in die Notiz — und nennt, was ignoriert wird', () => {
    const p = probe('Kd.-Nr.;Name;Umsatz 2024\n4711;Huber;12000');
    expect(p.kunden[0].kunde.notes).toBe('Kundennummer im Altsystem: 4711');
    expect(p.ignoriert).toEqual(['Umsatz 2024']);
  });

  it('meldet jede fehlerhafte Zeile mit Zeile und Grund — und übernimmt sie nicht', () => {
    const p = probe(
      'Name;E-Mail;UID\n' +
      ';x@y.at;\n' +
      'Huber;keine-adresse;\n' +
      'Maier;;ATU1234\n' +
      'Berger;b@b.at;atu 12345678\n' +
      '  huber  ;;\n' +
      '\n' +
      'Holzer;h@h.at;DE123456789\n',
    );
    expect(p.fehler.map((f) => [f.zeile, f.grund])).toEqual([
      [2, 'Kein Name'],
      [3, 'E-Mail-Adresse „keine-adresse" ist ungültig'],
      [4, '„ATU1234" hat nicht die Form einer UID-Nummer'],
    ]);
    // Huber in Zeile 3 war fehlerhaft — die zweite Schreibweise in Zeile 6 ist damit die erste gültige.
    expect(p.kunden.map((k) => [k.zeile, k.kunde.name, k.kunde.vatId])).toEqual([
      [5, 'Berger', 'ATU12345678'],
      [6, 'huber', ''],
      [8, 'Holzer', 'DE123456789'],
    ]);
  });

  it('nimmt denselben Kunden nur einmal — der zweite steht mit Verweis da', () => {
    const p = probe('Name\nFamilie Huber\nMaier\nfamilie   HUBER');
    expect(p.kunden).toHaveLength(2);
    expect(p.fehler).toEqual([
      { zeile: 4, grund: '„familie   HUBER" steht schon in Zeile 2', inhalt: 'familie   HUBER' },
    ]);
  });

  it('bricht ab, wenn es keine Namensspalte gibt, die Datei leer oder zu gross ist', () => {
    expect(() => probe('Ort;PLZ\nWien;1010')).toThrow(/keine Spalte für den Namen/);
    expect(() => probe('')).toThrow('Die Datei ist leer.');
    const gross = `Name\n${Array.from({ length: HOECHSTENS + 1 }, (_, i) => `K${i}`).join('\n')}`;
    expect(() => probe(gross)).toThrow(`höchstens ${HOECHSTENS}`);
  });
});
