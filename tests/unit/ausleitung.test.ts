import { describe, it, expect } from 'vitest';
import {
  abgelaufeneStaende,
  ausleitungsPfad,
  ausleitungsPraefix,
  datumAusPfad,
  datumsStempel,
  jsonZeile,
} from '../../functions/src/ausleitungPlan';

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
