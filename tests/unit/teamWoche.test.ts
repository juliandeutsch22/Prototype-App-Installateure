import { describe, it, expect } from 'vitest';
import { unterseitenFuer } from '@/app/navigation';

/**
 * Die Team-Woche gibt es nur, wenn der Betrieb sie einschaltet.
 *
 * Ohne Schalter bleibt „Mein Einsatzplan" EINE Seite — ohne Leiste, genau wie
 * vorher. Und die Unterseite ist dann auch per Adresse nicht erreichbar: der
 * Unterreiter legt für sie keine Route an.
 */
describe('Mein Einsatzplan', () => {
  it('ist ohne Schalter eine einzige Seite', () => {
    expect(unterseitenFuer('/my-schedule', 'Mitarbeiter').map((s) => s.pfad)).toEqual(['mein']);
    expect(
      unterseitenFuer('/my-schedule', 'Mitarbeiter', { wochenplanFuerAlle: false }).map((s) => s.pfad),
    ).toEqual(['mein']);
  });

  it('bekommt mit Schalter die Team-Woche dazu', () => {
    expect(
      unterseitenFuer('/my-schedule', 'Mitarbeiter', { wochenplanFuerAlle: true }).map((s) => s.pfad),
    ).toEqual(['mein', 'team']);
  });

  it('lässt die übrigen Reiter unberührt', () => {
    expect(unterseitenFuer('/assignments', 'Projektleiter').map((s) => s.pfad)).toEqual(['tag', 'woche']);
  });
});
