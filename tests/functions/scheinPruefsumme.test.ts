import { describe, it, expect, beforeEach } from 'vitest';
import { scheinPruefsumme } from '../../functions/src/scheinPruefsumme';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import { loeseAus, protokoll, protokollLeeren, type SchreibEreignis } from './ersatz/funktionen';

/**
 * Die Prüfsumme über den eingefrorenen Schein.
 *
 * Sie ist der eigentliche Manipulationsschutz: mit ihr lässt sich belegen,
 * dass ein vorgelegtes PDF genau das ist, was der Kunde unterschrieben hat.
 * Genau deshalb darf sie NUR einmal entstehen — würde sie bei jedem Schreiben
 * neu gerechnet, liefe sie einem nachträglich geänderten Inhalt einfach
 * hinterher und bewiese gar nichts mehr.
 */

let db: FakeDb;

const SCHEIN = {
  companyId: 'perl',
  projectNumber: 'B-001',
  customerName: 'Familie Huber',
  datum: '2026-09-04',
  abrechnung: 'Regie',
  zeiten: [{ datum: '2026-09-04', mitarbeiter: 'Max', minuten: 300 }],
  material: [{ name: 'Eckventil', menge: 2 }],
  status: 'Unterschrieben',
};

function ereignis(nachher: Record<string, unknown> | null, id = 's1') {
  return {
    data: {
      after: nachher
        ? { exists: true, data: () => nachher }
        : { exists: false, data: () => undefined },
    },
    params: { id },
  } as SchreibEreignis<Record<string, unknown>>;
}

beforeEach(() => {
  db = neueDatenbank();
  protokollLeeren();
  db.seed('workSheets', { s1: { ...SCHEIN } });
});

describe('Wann eine Prüfsumme entsteht', () => {
  it('beim Unterschreiben', async () => {
    await loeseAus(scheinPruefsumme, ereignis(SCHEIN));
    const hash = db.alles('workSheets').s1.inhaltHash as string;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('NICHT am Entwurf', async () => {
    // Er ist noch änderbar. Eine Prüfsumme darauf wäre eine Zusage über
    // etwas, das sich morgen anders liest.
    await loeseAus(scheinPruefsumme, ereignis({ ...SCHEIN, status: 'Entwurf' }));
    expect(db.alles('workSheets').s1.inhaltHash).toBeUndefined();
  });

  it('NICHT am verworfenen Entwurf', async () => {
    await loeseAus(scheinPruefsumme, ereignis({ ...SCHEIN, status: 'Verworfen' }));
    expect(db.alles('workSheets').s1.inhaltHash).toBeUndefined();
  });

  it('nicht zweimal', async () => {
    /*
      Der wichtigste Fall. Firestore-Trigger laufen MINDESTENS einmal, nicht
      genau einmal — und der Storno schreibt später erneut auf dasselbe
      Dokument. Würde dabei neu gerechnet, wanderte die Prüfsumme mit jeder
      Änderung mit und bewiese nichts mehr.
    */
    await loeseAus(scheinPruefsumme, ereignis(SCHEIN));
    const erste = db.alles('workSheets').s1.inhaltHash;
    await loeseAus(scheinPruefsumme, ereignis({ ...SCHEIN, ...db.alles('workSheets').s1 }));
    expect(db.alles('workSheets').s1.inhaltHash).toBe(erste);
    expect(db.schreibt.filter((s) => s.art === 'update')).toHaveLength(1);
  });

  it('nicht beim Löschen', async () => {
    await loeseAus(scheinPruefsumme, ereignis(null));
    expect(db.schreibt).toHaveLength(0);
  });
});

describe('Worüber gerechnet wird', () => {
  it('ein anderer Inhalt ergibt eine andere Summe', async () => {
    await loeseAus(scheinPruefsumme, ereignis(SCHEIN));
    const a = db.alles('workSheets').s1.inhaltHash;

    db.inhalt('workSheets').set('s2', {});
    await loeseAus(scheinPruefsumme, ereignis({ ...SCHEIN, zeiten: [{ datum: '2026-09-04', mitarbeiter: 'Max', minuten: 301 }] }, 's2'));
    expect(db.alles('workSheets').s2.inhaltHash).not.toBe(a);
  });

  it('derselbe Inhalt ergibt dieselbe Summe', async () => {
    // Sonst wäre sie als Nachweis wertlos: die Gegenprobe am vorgelegten PDF
    // müsste denselben Wert ergeben.
    await loeseAus(scheinPruefsumme, ereignis(SCHEIN));
    const a = db.alles('workSheets').s1.inhaltHash;
    db.inhalt('workSheets').set('s2', {});
    await loeseAus(scheinPruefsumme, ereignis(SCHEIN, 's2'));
    expect(db.alles('workSheets').s2.inhaltHash).toBe(a);
  });
});

describe('Wenn das Schreiben scheitert', () => {
  it('macht es den Schein nicht ungültig', async () => {
    /*
      Die Unterschrift steht, der Inhalt ist eingefroren. Die Prüfsumme lässt
      sich nachtragen — das PDF sagt in diesem Fall ausdrücklich, dass sie
      noch aussteht. Ein geworfener Fehler liesse den Trigger stattdessen
      endlos wiederholen.
    */
    db.inhalt('workSheets').delete('s1');
    await expect(loeseAus(scheinPruefsumme, ereignis(SCHEIN))).resolves.toBeUndefined();
    expect(protokoll.some((p) => p.stufe === 'error')).toBe(true);
  });
});
