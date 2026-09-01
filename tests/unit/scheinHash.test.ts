import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { kanonischerInhalt, type HashbarerSchein } from '@shared/scheinHash';

/**
 * Die Prüfsumme ist der eigentliche Manipulationsschutz des Handwerksscheins.
 * Sie muss zwei Dinge leisten, und beide sind hier festgehalten:
 *
 *   1. STABIL sein — derselbe Inhalt ergibt immer denselben Wert. Sonst
 *      ergäbe ein Neuberechnen eine Abweichung, obwohl sich nichts geändert
 *      hat, und die Prüfsumme wäre als Beweis wertlos.
 *   2. EMPFINDLICH sein — jede Änderung am Inhalt ändert sie. Sonst ließe
 *      sich ein unterschriebener Beleg verändern, ohne dass es auffällt.
 */

const basis: HashbarerSchein = {
  projectNumber: 'B-001',
  customerName: 'Familie Huber',
  address: 'Hauptstraße 12, 2700 Wiener Neustadt',
  datum: '2026-09-01',
  abrechnung: 'Regie',
  zeiten: [
    {
      datum: '2026-09-01',
      mitarbeiter: 'Anton Berger',
      von: '07:00',
      bis: '16:00',
      pauseMin: 30,
      minuten: 510,
      taetigkeit: 'Bad, Rohinstallation',
      helfer: false,
    },
    {
      datum: '2026-09-01',
      mitarbeiter: 'Bernd Cerny',
      von: '08:00',
      bis: '12:00',
      pauseMin: 0,
      minuten: 240,
      helfer: true,
    },
  ],
  material: [{ name: 'Kupferrohr 18mm', menge: 12, einheit: 'm' }],
  notizen: 'Altbestand teilweise korrodiert, Kunde informiert.',
  unterschriften: {
    monteur: { name: 'Anton Berger', bild: 'data:image/png;base64,AAAA', geraetZeit: 1_800_000_000 },
    kunde: { name: 'Josef Huber', bild: 'data:image/png;base64,BBBB', geraetZeit: 1_800_000_060 },
  },
};

const hash = (s: HashbarerSchein) =>
  createHash('sha256').update(kanonischerInhalt(s), 'utf8').digest('hex');

describe('Prüfsumme des Handwerksscheins', () => {
  it('ist stabil — zweimal gerechnet ergibt dasselbe', () => {
    expect(hash(basis)).toBe(hash(structuredClone(basis)));
  });

  it('hängt nicht an der Reihenfolge der Objektfelder', () => {
    /**
     * Der Grund, warum der Inhalt ausdrücklich Feld für Feld aufgeschrieben
     * und nicht einfach serialisiert wird. Ein `JSON.stringify` hinge an der
     * Einfügereihenfolge — nach einem Umweg über Firestore wäre sie eine
     * andere, und die Prüfsumme stimmte nicht mehr, ohne dass sich am Inhalt
     * etwas geändert hätte.
     */
    const andersHerum: HashbarerSchein = {
      ...basis,
      zeiten: basis.zeiten.map((z) => ({
        helfer: z.helfer,
        taetigkeit: z.taetigkeit,
        minuten: z.minuten,
        pauseMin: z.pauseMin,
        bis: z.bis,
        von: z.von,
        mitarbeiter: z.mitarbeiter,
        datum: z.datum,
      })),
    };
    expect(hash(andersHerum)).toBe(hash(basis));
  });

  it('behandelt fehlende Felder wie leere', () => {
    // Firestore speichert kein `undefined`; ein weggelassenes Feld darf nicht
    // anders hashen als ein leerer String.
    const ohne = { ...basis, address: undefined };
    const leer = { ...basis, address: '' };
    expect(hash(ohne)).toBe(hash(leer));
  });

  it.each([
    ['eine geänderte Stundenzahl', (s: HashbarerSchein) => {
      s.zeiten[0].minuten = 570;
    }],
    ['eine geänderte Tätigkeit', (s: HashbarerSchein) => {
      s.zeiten[0].taetigkeit = 'Etwas ganz anderes';
    }],
    ['eine zusätzliche Materialposition', (s: HashbarerSchein) => {
      s.material.push({ name: 'Eckventil', menge: 4 });
    }],
    ['eine geänderte Notiz', (s: HashbarerSchein) => {
      s.notizen = 'Alles bestens.';
    }],
    ['ein ausgetauschtes Unterschriftsbild', (s: HashbarerSchein) => {
      s.unterschriften!.kunde!.bild = 'data:image/png;base64,ZZZZ';
    }],
    ['ein geänderter Kundenname', (s: HashbarerSchein) => {
      s.unterschriften!.kunde!.name = 'Jemand anderer';
    }],
    ['eine umsortierte Positionsliste', (s: HashbarerSchein) => {
      s.zeiten.reverse();
    }],
  ])('ändert sich durch %s', (_was, aendern) => {
    const kopie = structuredClone(basis);
    aendern(kopie);
    expect(hash(kopie)).not.toBe(hash(basis));
  });

  it('lässt sich nicht durch Trennzeichen im Freitext austricksen', () => {
    /**
     * Mit einem Semikolon als Feldtrenner wäre eine Tätigkeit „A;B" von zwei
     * Feldern „A" und „B" nicht zu unterscheiden — zwei verschiedene Belege
     * ergäben dieselbe Prüfsumme. Deshalb trennt ein Zeichen, das in
     * Freitextfeldern nicht vorkommt.
     */
    const a = structuredClone(basis);
    a.zeiten[0].taetigkeit = 'Bad';
    a.zeiten[0].von = '07:00';

    const b = structuredClone(basis);
    b.zeiten[0].taetigkeit = 'Bad;07:00';
    b.zeiten[0].von = '';

    expect(hash(a)).not.toBe(hash(b));
  });
});
