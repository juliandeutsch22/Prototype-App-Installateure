import { describe, it, expect } from 'vitest';
import { ohneKennung, neueKennung, type MaterialZeile } from '@/features/worksheets/materialZeilen';

/**
 * Was von den eingetragenen Materialzeilen im Schein LANDET.
 *
 * Der Schein wird eingefroren und mit einer Prüfsumme versehen; was hier
 * hineingeht, steht danach unveränderlich auf einem Beleg, den ein Kunde
 * unterschrieben hat. Zwei Dinge dürfen dabei nicht passieren: eine
 * Anzeigekennung, die in den Beleg gerät, und ein `undefined`, das Firestore
 * beim Speichern ablehnt — das erste ist Ballast, das zweite kostet den
 * ganzen Schein.
 */

describe('Materialzeilen zum Speichern', () => {
  it('nimmt die Anzeigekennung heraus', () => {
    const zeilen: MaterialZeile[] = [{ id: 'm1', name: 'Eckventil', menge: 2, einheit: 'Stk' }];
    expect(ohneKennung(zeilen)).toEqual([{ name: 'Eckventil', menge: 2, einheit: 'Stk' }]);
    // Kein `id` im Ergebnis — auch nicht als undefined.
    expect(Object.keys(ohneKennung(zeilen)[0])).not.toContain('id');
  });

  it('lässt die Einheit ganz weg, wenn es keine gibt', () => {
    /*
      Ein ausdrückliches `einheit: undefined` lehnt Firestore ab — der Schein
      liesse sich dann nicht speichern, und zwar genau in dem Moment, in dem
      der Kunde schon unterschrieben hat. Eine freie Zeile hat nie eine
      Einheit, ist also der Regelfall und nicht der Ausnahmefall.
    */
    const [erg] = ohneKennung([{ id: 'm1', name: 'Dichtungen', menge: 5 }]);
    expect(erg).toEqual({ name: 'Dichtungen', menge: 5 });
    expect('einheit' in erg).toBe(false);
  });

  it('behält die Reihenfolge', () => {
    // Der Monteur liest seine Liste am Bildschirm vor; steht sie auf dem PDF
    // anders, sucht der Kunde beim Gegenlesen.
    const zeilen: MaterialZeile[] = [
      { id: 'a', name: 'Erstes', menge: 1 },
      { id: 'b', name: 'Zweites', menge: 2 },
      { id: 'c', name: 'Drittes', menge: 3 },
    ];
    expect(ohneKennung(zeilen).map((z) => z.name)).toEqual(['Erstes', 'Zweites', 'Drittes']);
  });

  it('vergibt Kennungen, die sich nicht wiederholen', () => {
    /*
      An der Kennung hängt, welche Zeile beim Löschen geht und in welchem
      Feld die Menge steht. Zwei gleiche Kennungen hiessen: eine gelöschte
      Zeile nimmt eine zweite mit — auf einem Beleg, den der Kunde gleich
      unterschreibt.
    */
    const kennungen = new Set(Array.from({ length: 200 }, () => neueKennung()));
    expect(kennungen.size).toBe(200);
  });
});
