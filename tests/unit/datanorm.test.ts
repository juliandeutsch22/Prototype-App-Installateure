import { describe, it, expect } from 'vitest';
import {
  befunde,
  dekodiere,
  layoutWarnung,
  liesDatanorm,
} from '@/features/materials/datanorm';

/**
 * Der DATANORM-Leser — geprüft wird vor allem, was er NICHT tut.
 *
 * Ein Katalogimport, der beim Zweifel rät, ist gefährlicher als einer, der
 * abbricht: er erzeugt Zehntausende Zeilen, die vollständig aussehen und
 * falsche Preise tragen. Auffallen würde das erst auf der Rechnung beim
 * Kunden. Deshalb prüft fast jeder Fall hier, dass eine zweifelhafte Zeile
 * mit Nummer und Grund herauskommt, statt still ein Artikel zu werden.
 */

const bytes = (...b: number[]) => Uint8Array.from(b).buffer;

describe('DATANORM lesen', () => {
  it('liest den Vorlaufsatz als Kopf und nicht als Artikel', () => {
    const e = liesDatanorm('V;20092026;HTI Grosshandel;EUR;1;04\nA;N;1029384;0;Rohr;;1;0;m;450;10;0');
    expect(e.kopf).toEqual({ datum: '20092026', info: 'HTI Grosshandel', waehrung: 'EUR' });
    expect(e.artikel).toHaveLength(1);
  });

  it('rechnet Cent in Euro und die Preiseinheit heraus', () => {
    /*
      DER TEUERSTE EINZELFEHLER DIESER SCHNITTSTELLE. In der Datei steht
      „2350" und gemeint sind 23,50 € je 100 Stück, also 0,235 € je Stück.
      Wer beides weglässt, trägt 2350 € ein — das Zweihunderttausendfache,
      und es sieht aus wie ein Preis.
    */
    const e = liesDatanorm(
      [
        'A;N;A1;0;Eckventil;;1;0;Stk;2350;10;0',
        'A;N;A2;0;Dichtring;;1;2;Stk;2350;10;0',
        'A;N;A3;0;Schraube;;1;3;Stk;2350;10;0',
      ].join('\n'),
    );
    expect(e.artikel.map((a) => a.preis)).toEqual([23.5, 0.235, 0.0235]);
  });

  it('unterscheidet Listenpreis und Nettopreis und behauptet sonst nichts', () => {
    /*
      Der Listenpreis ist der Preis VOR dem ausgehandelten Rabatt. Wer ihn
      als Einkaufspreis übernimmt, kalkuliert die Baustelle zu teuer und
      sieht einen Deckungsbeitrag, der zu niedrig ist. Ein unbekanntes
      Kennzeichen wird deshalb nicht auf gut Glück als netto gelesen.
    */
    const e = liesDatanorm(
      [
        'A;N;A1;0;Eckventil;;0;0;Stk;2350;10;0',
        'A;N;A2;0;Kugelhahn;;1;0;Stk;2350;10;0',
        'A;N;A3;0;Rohr;;7;0;Stk;2350;10;0',
        'A;N;A4;0;Bogen;;;0;Stk;2350;10;0',
      ].join('\n'),
    );
    expect(e.artikel.map((a) => a.preisArt)).toEqual(['liste', 'netto', 'unbekannt', 'unbekannt']);
  });

  it('nimmt einen Löschsatz ohne Bezeichnung an — er nennt nur die Nummer', () => {
    const e = liesDatanorm('A;L;1029384;;;;;;;;;');
    expect(e.unverstanden).toEqual([]);
    expect(e.artikel[0]).toMatchObject({ artikelnummer: '1029384', verarbeitung: 'loeschung' });
  });

  it('nimmt einen NEUEN Artikel ohne Bezeichnung nicht an', () => {
    // Eine Zeile im Katalog, die niemand wiederfindet, ist kein Artikel.
    const e = liesDatanorm('A;N;1029384;0;;;1;0;Stk;2350;10;0');
    expect(e.artikel).toEqual([]);
    expect(e.unverstanden[0]).toMatchObject({ zeile: 1 });
    expect(e.unverstanden[0].grund).toMatch(/Bezeichnung/);
  });

  it('meldet eine Zeile ohne Artikelnummer mit Zeilennummer und Grund', () => {
    const e = liesDatanorm('V;20092026;HTI;EUR\nA;N;;0;Eckventil;;1;0;Stk;2350;10;0');
    expect(e.artikel).toEqual([]);
    expect(e.unverstanden).toEqual([
      {
        zeile: 2,
        inhalt: 'A;N;;0;Eckventil;;1;0;Stk;2350;10;0',
        grund: 'Ohne Artikelnummer — sie ist der Schlüssel für den Abgleich.',
      },
    ]);
  });

  it('meldet ein unbekanntes Verarbeitungskennzeichen, statt es als „neu" zu lesen', () => {
    const e = liesDatanorm('A;X;1029384;0;Eckventil;;1;0;Stk;2350;10;0');
    expect(e.artikel).toEqual([]);
    expect(e.unverstanden[0].grund).toMatch(/Verarbeitungskennzeichen/);
  });

  it('macht aus einem Preisfeld, das keine Zahl ist, keine Null', () => {
    /*
      „Kostet nichts" und „Preis steht nicht drin" sind zwei Aussagen. Wird
      Unsinn zu 0,00 €, meldet die Nachkalkulation später einen
      Deckungsbeitrag in voller Höhe des Erlöses — und niemand sucht danach.
    */
    const e = liesDatanorm('A;N;1029384;0;Eckventil;;1;0;Stk;PST;10;0');
    expect(e.artikel).toEqual([]);
    expect(e.unverstanden[0].grund).toBe('Preisfeld „PST" ist keine Zahl.');
  });

  it('nimmt einen Artikel ohne Preisangabe an — aber ohne Preis', () => {
    // Fehlt das Feld ganz, ist das kein Fehler in der Datei. Der Artikel
    // gehört in den Katalog, der Probelauf zählt ihn unter „ohne Preis".
    const e = liesDatanorm('A;N;1029384;0;Eckventil;;1;0;Stk;;10;0');
    expect(e.artikel).toHaveLength(1);
    expect(e.artikel[0].preis).toBeUndefined();
  });

  it('setzt Kurztext 1 und 2 zum Namen zusammen', () => {
    const e = liesDatanorm('A;N;1029384;0;Eckventil 1/2 Zoll;verchromt mit Rosette;1;0;Stk;2350;10;7');
    expect(e.artikel[0]).toMatchObject({
      name: 'Eckventil 1/2 Zoll verchromt mit Rosette',
      einheit: 'Stk',
      rabattgruppe: '10',
      warengruppe: '7',
    });
  });

  it('zählt fremde Satzarten je Buchstabe, statt sie wegzuwerfen', () => {
    /*
      Wer eine Datei einliest, in der 12.000 Langtextsätze stehen und drei
      Artikel, soll das SEHEN — und sich nicht über den leeren Katalog
      wundern.
    */
    const e = liesDatanorm(
      ['A;N;A1;0;Rohr;;1;0;m;450;10;0', 'T;N;A1;0;Langtext', 'T;N;A1;1;noch mehr', 'P;N;A1;0;500'].join(
        '\n',
      ),
    );
    expect(e.artikel).toHaveLength(1);
    expect(e.uebersprungen).toEqual({ T: 2, P: 1 });
  });

  it('zählt Zeilen auch über Leerzeilen und CRLF hinweg richtig', () => {
    // Die Zeilennummer ist das Einzige, womit jemand die Zeile in seiner
    // Datei wiederfindet. Stimmt sie nicht, ist der Befund wertlos.
    const e = liesDatanorm('V;20092026;HTI;EUR\r\n\r\nA;N;;0;Eckventil;;1;0;Stk;2350;10;0\r\n');
    expect(e.unverstanden[0].zeile).toBe(3);
  });
});

describe('Zeichensatz erkennen', () => {
  const satz = (umlaut: number) =>
    bytes(0x41, 0x3b, 0x4e, 0x3b, 0x31, 0x3b, 0x30, 0x3b, 0x66, umlaut, 0x72);

  it('lässt UTF-8 UTF-8 sein', () => {
    const d = dekodiere(new TextEncoder().encode('A;N;1;0;für').buffer as ArrayBuffer);
    expect(d).toEqual({ text: 'A;N;1;0;für', zeichensatz: 'utf-8' });
  });

  it('liest Windows-1252, wenn die Umlaute oben liegen', () => {
    const d = dekodiere(satz(0xfc));
    expect(d).toEqual({ text: 'A;N;1;0;für', zeichensatz: 'windows-1252' });
  });

  it('liest CP850, wenn die Umlaute im DOS-Bereich liegen', () => {
    /*
      DATANORM ist im DOS-Zeitalter entstanden, und ein Teil des Grosshandels
      liefert bis heute CP850. Node und Browser kennen den Zeichensatz nicht;
      läse man ihn als Windows-1252, stünde in jedem zweiten Artikelnamen ein
      Steuerzeichen statt eines Umlauts.
    */
    const d = dekodiere(satz(0x81));
    expect(d).toEqual({ text: 'A;N;1;0;für', zeichensatz: 'cp850' });
  });

  it('liest auch ß und die grossen Umlaute aus CP850', () => {
    const d = dekodiere(bytes(0x9a, 0x8e, 0x99, 0xe1, 0x84, 0x94, 0x81));
    expect(d.text).toBe('ÜÄÖßäöü');
  });
});

describe('Befund für den Probelauf', () => {
  it('zählt neu, geändert, gelöscht, ohne Preis und nur Listenpreis getrennt', () => {
    const e = liesDatanorm(
      [
        'A;N;A1;0;Eckventil;;1;0;Stk;2350;10;0',
        'A;A;A2;0;Kugelhahn;;0;0;Stk;1890;10;0',
        'A;L;A3;;;;;;;;;',
        'A;N;A4;0;Rohr;;1;0;m;;10;0',
        'A;N;A5;0;Bogen;;1;0;Stk;PST;10;0',
        'T;N;A1;0;Langtext',
      ].join('\n'),
    );
    expect(befunde(e)).toEqual({
      artikel: 4,
      neu: 2,
      aenderungen: 1,
      loeschungen: 1,
      ohnePreis: 1,
      nurListenpreis: 1,
      unverstanden: 1,
      uebersprungen: 1,
    });
  });

  it('zählt einen Löschsatz nicht als „ohne Preis"', () => {
    // Ein Löschsatz HAT keinen Preis und soll auch keinen haben. Stünde er
    // in der Spalte, sähe jeder Preisimport nach einer Lücke aus.
    const e = liesDatanorm('A;L;A3;;;;;;;;;');
    expect(befunde(e).ohnePreis).toBe(0);
  });
});

describe('Verdacht auf ein verschobenes Feldlayout', () => {
  const sauber = [
    'A;N;A1;0;Eckventil;;1;0;Stk;2350;10;0',
    'A;N;A2;0;Kugelhahn;;1;0;Stk;1890;10;0',
    'A;N;A3;0;Rohr;;1;0;m;450;10;0',
    'A;N;A4;0;Bogen;;1;0;Stk;320;10;0',
    'A;N;A5;0;Muffe;;1;0;Stk;210;10;0',
  ];

  it('schweigt bei einer Datei, die aufgeht', () => {
    expect(layoutWarnung(liesDatanorm(sauber.join('\n')))).toBeUndefined();
  });

  it('schweigt bei einer einzelnen krummen Zeile unter vielen', () => {
    // Eine kaputte Zeile ist ein Datenfehler des Lieferanten, kein Grund,
    // den ganzen Import zu verweigern — sie steht ohnehin im Befund.
    const viele = [...sauber, 'A;N;A6;0;Winkel;;1;0;Stk;90;10;0', 'A;N;A7;0;Nippel;;1;0;Stk;80;10;0',
      'A;N;A8;0;Klemme;;1;0;Stk;70;10;0', 'A;N;;0;Namenlos;;1;0;Stk;60;10;0'];
    expect(layoutWarnung(liesDatanorm(viele.join('\n')))).toBeUndefined();
  });

  it('schweigt bei zwei krummen Zeilen in einer kleinen Nachlieferung', () => {
    /*
      ZWEI VON FÜNF SIND ANTEILIG VIEL UND ALS BEWEIS TROTZDEM NICHTS. Eine
      Nachlieferung hat manchmal nur eine Handvoll Artikel; stünde der ganze
      Import wegen zweier Datenfehler des Lieferanten, wäre die Warnung
      schlimmer als das, wovor sie warnt. Die Zeilen stehen ohnehin im Befund.
    */
    const klein = [
      'A;N;A1;0;Eckventil;;1;0;Stk;2350;10;0',
      'A;N;A2;0;Kugelhahn;;1;0;Stk;1890;10;0',
      'A;N;A3;0;Rohr;;1;0;m;450;10;0',
      'A;N;;0;Ohne Nummer;;1;0;Stk;320;10;0',
      'A;N;A5;0;Muffe;;1;0;Stk;PST;10;0',
    ];
    const e = liesDatanorm(klein.join('\n'));
    expect(e.unverstanden).toHaveLength(2);
    expect(layoutWarnung(e)).toBeUndefined();
  });

  it('schlägt an, wenn die Artikelsätze reihenweise am gleichen Feld scheitern', () => {
    /*
      Das sind Zeilen aus einer Beispieldatei, die eine Stelle mehr führt als
      die Norm: vor der Artikelnummer steht noch eine Katalognummer. Alles
      verschiebt sich um eins, und im Preisfeld landet die Mengeneinheit.
      Genau dieser Fall darf NICHT in den Katalog.
    */
    const verschoben = [
      'A;N;100001;0;HTI-Sanitär-Großhandel GmbH;1;0;0;EUR;0',
      'A;A;100001;A;1029384;Eckventil 1/2 Zoll;verchromt mit Rosette;;1;PST;2350;10;0',
      'A;A;100001;A;1029385;Kugelhahn 1/2 Zoll;messing;;1;PST;1890;10;0',
      'A;A;100001;A;1029386;Kupferrohr 15 mm;weich;;1;PST;450;10;0',
      'A;A;100001;A;1029387;Bogen 90 Grad;;;1;PST;320;10;0',
      'A;A;100001;A;1029388;Muffe;;;1;PST;210;10;0',
    ];
    expect(layoutWarnung(liesDatanorm(verschoben.join('\n')))).toMatch(/nichts übernommen/);
  });

  it('schlägt an, wenn alle Artikel dieselbe Nummer tragen', () => {
    /*
      Der stillere Fall: das Layout ist verschoben, die Felder gehen aber
      zufällig formal auf. Dann steht in der Artikelnummer die
      Lieferantennummer — in jeder Zeile dieselbe. Ohne diese Prüfung
      entstünde ein Katalog aus einem einzigen, immer wieder überschriebenen
      Artikel, und der Probelauf meldete „alles in Ordnung".
    */
    const gleich = [
      'A;N;100001;0;Eckventil;verchromt;0;0;Stk;2350;10;0',
      'A;N;100001;0;Kugelhahn;messing;0;0;Stk;1890;10;0',
      'A;N;100001;0;Rohr;Kupfer;0;0;m;450;10;0',
    ];
    const warnung = layoutWarnung(liesDatanorm(gleich.join('\n')));
    expect(warnung).toMatch(/Artikelnummer/);
    expect(warnung).toMatch(/nichts übernommen/);
  });

  it('schweigt bei einer leeren Datei, statt ein Layout zu beklagen', () => {
    expect(layoutWarnung(liesDatanorm('V;20092026;HTI;EUR\nT;N;A1;0;Langtext'))).toBeUndefined();
  });
});
