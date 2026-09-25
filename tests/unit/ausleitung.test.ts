import { describe, it, expect } from 'vitest';
import {
  abgelaufeneStaende,
  alleSeitenLesen,
  ordnungNachSchluessel,
  ausleitungsPfad,
  ausleitungsPraefix,
  datumAusPfad,
  datumsStempel,
  jsonZeile,
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

  it('fasst nichts an, was nicht wie ein Stand heisst', () => {
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
