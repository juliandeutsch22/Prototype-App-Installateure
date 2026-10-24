import { describe, it, expect } from 'vitest';
import {
  abgelaufeneStaende,
  alleSeitenLesen,
  ordnungNachSchluessel,
  ausleitungsPfad,
  ausleitungsPraefix,
  datumAusPfad,
  datumsStempel,
  inTeilen,
  alleNamen,
  inBloecken,
  jsonZeile,
  teilPfad,
  weitererTeil,
} from '@shared/ausleitungPlan';

/**
 * Die Entscheidungen der nächtlichen Ausleitung.
 *
 * WARUM AUSGERECHNET DIESE. Das Lesen und Schreiben prüft hier niemand — die
 * Cloud Functions laufen ungetestet, das steht so in der Übergabe. Was sich
 * ohne Emulator und ohne Firebase prüfen lässt, ist die eine Entscheidung,
 * bei der ein Fehler nicht auffällt und trotzdem alles kostet: **welche Datei
 * wieder gelöscht wird.** Ein Aufräumen, das einen Tag zu weit greift,
 * vernichtet genau den Stand, für den die Ausleitung gebaut wurde — und es
 * fällt erst auf, wenn man ihn braucht.
 */

const heute = new Date(2026, 8, 2); // 2. September 2026

describe('Pfade der Ausleitung', () => {
  it('legt je Mandant und Tag genau einen Stand an', () => {
    expect(ausleitungsPfad('firmaA', heute)).toBe('ausleitung/firmaA/2026-09-02.jsonl');
  });

  it('ein zweiter Lauf am selben Tag ueberschreibt den ersten', () => {
    /**
     * Absicht, kein Zufall: sonst wüchse der Speicher mit jedem
     * Wiederholungsversuch, und beim Wiederanlauf müsste jemand raten, welche
     * von zwei Dateien die vollständige ist.
     */
    const abends = new Date(2026, 8, 2, 23, 45);
    expect(ausleitungsPfad('firmaA', abends)).toBe(ausleitungsPfad('firmaA', heute));
  });

  it('trennt die Mandanten', () => {
    expect(ausleitungsPraefix('firmaA')).not.toBe(ausleitungsPraefix('firmaB'));
    expect(ausleitungsPfad('firmaA', heute).startsWith(ausleitungsPraefix('firmaA'))).toBe(true);
  });

  it('nimmt das lokale Datum, nicht UTC', () => {
    // Ein Lauf um 02:30 Wiener Zeit liegt im Sommer eine Stunde vor UTC —
    // nach UTC gerechnet trüge der Stand das Datum des Vortags.
    expect(datumsStempel(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(datumAusPfad('ausleitung/firmaA/2026-09-02.jsonl')).toBe('2026-09-02');
    expect(datumAusPfad('ausleitung/firmaA/irgendwas.txt')).toBeNull();
  });
});

describe('Aufraeumen alter Staende', () => {
  const stand = (datum: string) => `ausleitung/firmaA/${datum}.jsonl`;

  it('loescht, was aelter ist als die Aufbewahrungsfrist', () => {
    const weg = abgelaufeneStaende(
      [stand('2026-07-01'), stand('2026-08-25'), stand('2026-09-02')],
      heute,
      30,
    );
    expect(weg).toEqual([stand('2026-07-01')]);
  });

  it('behaelt den juengsten Stand IMMER', () => {
    /**
     * Der wichtigste Test dieser Datei. Scheitert die Ausleitung wochenlang —
     * abgelaufene Zugangsdaten, geänderte Berechtigung —, wären irgendwann
     * alle Stände älter als die Frist. Ein Aufräumen nach reinem Alter
     * löschte dann den letzten vorhandenen Stand, und zwar ausgerechnet
     * dann, wenn ohnehin niemand hinsieht.
     */
    const alt = [stand('2026-01-01'), stand('2026-01-02')];
    expect(abgelaufeneStaende(alt, heute, 30)).toEqual([stand('2026-01-01')]);

    // Und bei einem einzigen: gar nichts.
    expect(abgelaufeneStaende([stand('2020-01-01')], heute, 30)).toEqual([]);
  });

  it('fasst nichts an, was nicht wie ein Stand heißt', () => {
    // Läge aus irgendeinem Grund etwas anderes im Verzeichnis, wäre ein
    // Aufräumen, das es mitnimmt, ein Datenverlust ohne Ankündigung.
    const weg = abgelaufeneStaende(
      ['ausleitung/firmaA/README.txt', stand('2020-01-01'), stand('2026-09-02')],
      heute,
      30,
    );
    expect(weg).toEqual([stand('2020-01-01')]);
  });

  it('laesst den Tag der Grenze selbst stehen', () => {
    // Genau 30 Tage alt heisst „noch innerhalb", nicht „abgelaufen".
    const grenze = stand('2026-08-03'); // 30 Tage vor dem 2. September
    expect(abgelaufeneStaende([grenze, stand('2026-09-02')], heute, 30)).toEqual([]);
  });

  it('kommt mit einer leeren Ablage zurecht', () => {
    expect(abgelaufeneStaende([], heute, 30)).toEqual([]);
  });
});

describe('Zeilenformat', () => {
  it('schreibt eine Zeile je Dokument, mit seiner Sammlung', () => {
    const zeile = jsonZeile('invoices', { id: 'r1', invoiceNumber: 'RE-2026-1001' });
    expect(zeile.endsWith('\n')).toBe(true);
    expect(JSON.parse(zeile)).toEqual({
      sammlung: 'invoices',
      daten: { id: 'r1', invoiceNumber: 'RE-2026-1001' },
    });
  });

  it('haelt Zeilenumbrueche im Inhalt aus', () => {
    // Ein Kommentarfeld mit Absatz darf das zeilenweise Format nicht sprengen.
    const zeile = jsonZeile('timeEntries', { comment: 'erste Zeile\nzweite Zeile' });
    expect(zeile.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(zeile).daten.comment).toBe('erste Zeile\nzweite Zeile');
  });
});

describe('Seitenweise lesen', () => {
  /*
    PRÜFLAUF 25.09.2026 (P3-16). Die Schleife hörte auf, sobald eine Seite
    kürzer war als erbeten. Kappt der Server jede Antwort bei einem
    kleineren Höchstwert (`max_rows`), ist JEDE Seite kürzer — und der Stand
    endete nach der ersten.
  */
  const bestand = Array.from({ length: 23 }, (_, i) => ({ id: i }));
  /** Ein Server, der nie mehr als `hoechstens` Zeilen herausgibt. */
  const server = (hoechstens: number) => async (von: number, bis: number) =>
    bestand.slice(von, Math.min(bis + 1, von + hoechstens));

  it('liest alles, auch wenn der Server jede Seite kürzt', async () => {
    const gelesen: number[] = [];
    const n = await alleSeitenLesen(server(4), 10, (z) => gelesen.push(z.id));
    expect(n).toBe(23);
    expect(gelesen).toEqual(bestand.map((z) => z.id));
  });

  it('liest jede Zeile genau einmal, wenn der Server ganze Seiten liefert', async () => {
    const gelesen: number[] = [];
    await alleSeitenLesen(server(1000), 5, (z) => gelesen.push(z.id));
    expect(gelesen).toEqual(bestand.map((z) => z.id));
  });

  it('eine leere Tabelle ist eine Abfrage und null Zeilen', async () => {
    let abfragen = 0;
    const n = await alleSeitenLesen(async () => { abfragen += 1; return []; }, 5, () => undefined);
    expect({ n, abfragen }).toEqual({ n: 0, abfragen: 1 });
  });

  it('sortiert nach dem Primärschlüssel, auch einem zusammengesetzten', () => {
    expect(ordnungNachSchluessel(['id'])).toBe('id.asc');
    expect(ordnungNachSchluessel(['company_id', 'art', 'jahr'])).toBe('company_id.asc,art.asc,jahr.asc');
    expect(ordnungNachSchluessel(undefined)).toBeNull();
    expect(ordnungNachSchluessel([])).toBeNull();
  });
});

describe('Ein Stand in Teilen (10.10.2026)', () => {
  /*
    Bis hierher ging der Stand in einem Stück hinaus und brach ab 256 MB ab.
    Jetzt in Teilen — und an genau diesen Regeln hängt, ob der Rücklauf
    später ALLE Teile EINES Laufs erkennt und ob das Aufräumen sie mit ihrem
    Stand behandelt.
  */
  const erster = 'ausleitung/firmaA/2026-09-02.jsonl';

  it('der erste Teil heisst wie bisher, die weiteren tragen Lauf und Nummer', () => {
    expect(teilPfad(erster, 'ab12', 1)).toBe(erster);
    expect(teilPfad(erster, 'ab12', 3)).toBe('ausleitung/firmaA/2026-09-02.ab12.teil-3.jsonl');
    expect(weitererTeil(teilPfad(erster, 'ab12', 3))).toEqual({ lauf: 'ab12', nr: 3 });
    expect(weitererTeil(erster)).toBeNull();
  });

  it('ein weiterer Teil trägt das Datum seines Stands', () => {
    expect(datumAusPfad(teilPfad(erster, 'ab12', 2))).toBe('2026-09-02');
  });

  it('das Aufräumen nimmt die Teile mit ihrem Stand — und lässt fremde Dateien', () => {
    const alt = 'ausleitung/firmaA/2026-01-01.jsonl';
    const weg = abgelaufeneStaende(
      [alt, teilPfad(alt, 'x1', 2), erster, 'ausleitung/firmaA/2026-01-01.teil-2.txt'],
      heute, 30,
    );
    expect(weg.sort()).toEqual([alt, teilPfad(alt, 'x1', 2)].sort());
  });

  it('übrige Teile eines gescheiterten Laufs machen den letzten vollständigen Stand nicht zum alten', () => {
    /*
      Scheitert die Ausleitung wochenlang, bleiben je Nacht vielleicht weitere
      Teile ohne ersten liegen. Sie sind kein Stand; zählten sie als „der
      jüngste", ginge der letzte vollständige nach der Frist verloren.
    */
    const letzterGanzer = 'ausleitung/firmaA/2026-07-01.jsonl';
    const reste = [teilPfad('ausleitung/firmaA/2026-08-30.jsonl', 'r1', 2)];
    expect(abgelaufeneStaende([letzterGanzer, teilPfad(letzterGanzer, 'g1', 2), ...reste], heute, 30))
      .toEqual([]);
  });

  async function schreiben(zeilen: string[], grenze: number) {
    const abgegeben: Array<{ nr: number; text: string }> = [];
    const stand = inTeilen('lauf1', grenze, async (inhalt, nr) => {
      abgegeben.push({ nr, text: new TextDecoder().decode(inhalt) });
    });
    for (const z of zeilen) await stand.anhaengen(z);
    return { bilanz: await stand.abschliessen(), abgegeben };
  }
  const lesen = (text: string) => text.split('\n').filter(Boolean).map((z) => JSON.parse(z));

  it('ein kleiner Stand bleibt ein Teil, mit Kopfzeile', async () => {
    const zeilen = [jsonZeile('companies', { id: 'a' }), jsonZeile('users', { id: 'u' })];
    const { bilanz, abgegeben } = await schreiben(zeilen, 1_000_000);
    expect(abgegeben.map((t) => t.nr)).toEqual([1]);
    expect(lesen(abgegeben[0].text)[0]).toEqual({ sammlung: '_teil', daten: { lauf: 'lauf1', nr: 1, teile: 1 } });
    expect(abgegeben[0].text.endsWith(zeilen.join(''))).toBe(true);
    expect(bilanz).toEqual({ teile: 1, zeilen: 2, bytes: abgegeben[0].text.length });
  });

  it('ein grosser geht in Teilen, keiner über der Grenze, der erste zuletzt — ohne eine Zeile zu verlieren', async () => {
    const zeilen = Array.from({ length: 10 }, (_, i) => jsonZeile('t', { i, f: 'x'.repeat(20) }));
    const grenze = zeilen[0].length * 3;
    const { bilanz, abgegeben } = await schreiben(zeilen, grenze);
    expect(abgegeben.map((t) => t.nr)).toEqual([2, 3, 4, 1]);
    expect(bilanz.teile).toBe(4);
    expect(bilanz.zeilen).toBe(10);
    expect(bilanz.bytes).toBe(abgegeben.reduce((s, t) => s + t.text.length, 0));

    const nachNummer = [...abgegeben].sort((a, b) => a.nr - b.nr);
    const koepfe = nachNummer.map((t) => lesen(t.text)[0]);
    expect(koepfe).toEqual([
      { sammlung: '_teil', daten: { lauf: 'lauf1', nr: 1, teile: 4 } },
      { sammlung: '_teil', daten: { lauf: 'lauf1', nr: 2 } },
      { sammlung: '_teil', daten: { lauf: 'lauf1', nr: 3 } },
      { sammlung: '_teil', daten: { lauf: 'lauf1', nr: 4 } },
    ]);
    for (const t of nachNummer) {
      const daten = t.text.slice(t.text.indexOf('\n') + 1);
      expect(daten.length).toBeLessThanOrEqual(grenze);
    }
    const zusammen = nachNummer.map((t) => t.text.slice(t.text.indexOf('\n') + 1)).join('');
    expect(zusammen).toBe(zeilen.join(''));
  });

  it('eine Zeile über der Grenze steht allein in ihrem Teil, statt verloren zu gehen', async () => {
    const klein = jsonZeile('t', { i: 1 });
    const riesig = jsonZeile('t', { f: 'y'.repeat(500) });
    const { abgegeben } = await schreiben([klein, riesig, klein], 100);
    const nachNummer = [...abgegeben].sort((a, b) => a.nr - b.nr);
    expect(nachNummer.map((t) => t.text.slice(t.text.indexOf('\n') + 1))).toEqual([klein, riesig, klein]);
  });

  /*
    IN BYTES (N1, 24.10.2026): gezählt wird, was der Speicher zählt. In
    Zeichen gezählt wäre ein Teil mit Umlauten größer als die Grenze.
  */
  it('zählt in Bytes — ein Teil mit Umlauten bleibt unter der Grenze', async () => {
    const zeilen = Array.from({ length: 6 }, (_, i) => jsonZeile('t', { i, f: 'ä'.repeat(20) }));
    const bytes = new TextEncoder().encode(zeilen[0]).byteLength;
    const grenze = bytes * 2;
    const { abgegeben } = await schreiben(zeilen, grenze);
    expect(abgegeben).toHaveLength(3);
    for (const t of abgegeben) {
      expect(new TextEncoder().encode(t.text.slice(t.text.indexOf('\n') + 1)).byteLength).toBeLessThanOrEqual(grenze);
    }
  });

  it('nimmt ganze Seiten als Bytes und zählt ihre Zeilen, wie angesagt', async () => {
    const seite = new TextEncoder().encode(jsonZeile('t', { i: 1 }) + jsonZeile('t', { i: 2 }));
    const abgegeben: string[] = [];
    const stand = inTeilen('lauf1', 1_000_000, async (inhalt) => { abgegeben.push(new TextDecoder().decode(inhalt)); });
    await stand.anhaengen(seite, 2);
    await stand.anhaengen(seite, 2);
    const bilanz = await stand.abschliessen();
    expect(bilanz.zeilen).toBe(4);
    expect(abgegeben[0].split('\n').filter(Boolean)).toHaveLength(5);
    expect(bilanz.bytes).toBe(new TextEncoder().encode(abgegeben[0]).byteLength);
  });
});

/*
  ALLE NAMEN, NICHT DIE ERSTEN TAUSEND (N1, 24.10.2026): das Aufräumen sah
  nur eine Seite der Liste; was dahinter lag, blieb liegen.
*/
describe('Liste über alle Seiten', () => {
  const bestand = Array.from({ length: 2500 }, (_, i) => `ausleitung/b/${String(i).padStart(5, '0')}.jsonl`);
  const seite = async (offset: number, limit: number) => bestand.slice(offset, offset + limit);

  it('holt 2.500 Namen in drei Seiten, ohne einen zu verlieren', async () => {
    const abrufe: number[] = [];
    const namen = await alleNamen(async (o, l) => { abrufe.push(o); return seite(o, l); });
    expect(namen).toEqual(bestand);
    expect(abrufe).toEqual([0, 1000, 2000]);
  });

  it('bleibt gleich: ein kleiner Bestand ist eine Abfrage', async () => {
    const abrufe: number[] = [];
    await alleNamen(async (o, l) => { abrufe.push(o); return bestand.slice(0, 12).slice(o, o + l); });
    expect(abrufe).toEqual([0]);
  });

  it('genau 1.000 fragt einmal nach, statt die Grenze für das Ende zu halten', async () => {
    const tausend = bestand.slice(0, 1000);
    const namen = await alleNamen(async (o, l) => tausend.slice(o, o + l));
    expect(namen).toHaveLength(1000);
  });

  it('löscht in Blöcken, die der Speicher annimmt', () => {
    expect(inBloecken(bestand).map((b) => b.length)).toEqual([1000, 1000, 500]);
    expect(inBloecken([])).toEqual([]);
  });
});
