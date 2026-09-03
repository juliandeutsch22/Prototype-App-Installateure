import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonPicker, { type PickablePerson } from '@/components/PersonPicker';

/**
 * Die Auswahlliste, an der die Einsatzplanung haengt.
 *
 * Sie hatte den Umgang mit zwanzig Namen schon geloest (Pillen, Bildlauf,
 * Suche). Was fehlte, war die Frage, mit der jemand ueberhaupt in die
 * Planung geht: WER IST AN DIESEM TAG NOCH FREI. Die stand nur als Text am
 * Namen und musste Zeile fuer Zeile gelesen werden.
 *
 * Zwei Dinge muessen dabei gelten, und beide sind hier festgehalten: die
 * Belegten verschwinden nicht (verboten wird nichts), und ohne das Merkmal
 * verhaelt sich die Liste exakt wie vorher — sie wird auch an Stellen
 * benutzt, an denen es keine Verfuegbarkeit gibt.
 */

const LEUTE: PickablePerson[] = [
  { uid: 'u1', name: 'Anna Belegt', nichtFrei: true, hint: 'im Urlaub' },
  { uid: 'u2', name: 'Bert Frei' },
  { uid: 'u3', name: 'Cora Belegt', nichtFrei: true, hint: 'heute schon eingeteilt: Huber' },
  { uid: 'u4', name: 'Dora Frei' },
];

/** Die Namen in der Reihenfolge, in der sie in der Liste stehen. */
function reihenfolge() {
  return screen
    .getAllByRole('checkbox')
    .map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent?.trim() ?? '')
    .filter((t) => t !== '');
}

function zeige(people: PickablePerson[], selected: string[] = []) {
  const onChange = vi.fn();
  render(
    <PersonPicker
      legend="Mitarbeiter"
      idPrefix="t"
      people={people}
      selected={selected}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('PersonPicker — wer ist frei', () => {
  it('stellt die freien nach oben', () => {
    zeige(LEUTE);
    const namen = reihenfolge().filter((t) => !t.startsWith('Nur freie'));
    expect(namen[0]).toContain('Bert Frei');
    expect(namen[1]).toContain('Dora Frei');
    expect(namen[2]).toContain('Anna Belegt');
    expect(namen[3]).toContain('Cora Belegt');
  });

  it('blendet die Belegten auf Wunsch aus', async () => {
    zeige(LEUTE);
    await userEvent.click(screen.getByRole('checkbox', { name: /Nur freie/ }));

    expect(screen.getByRole('checkbox', { name: /Bert Frei/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Anna Belegt/ })).toBeNull();
  });

  it('laesst einen bereits GEWAEHLTEN Belegten stehen', async () => {
    /**
     * Sonst verschwindet ein gesetzter Haken aus der Liste, und der naechste
     * Blick sagt: die ist gar nicht eingeteilt. Bei einem Notdienst holt man
     * auch mal jemanden aus dem Urlaub — verboten wird hier nichts.
     */
    zeige(LEUTE, ['u1']);
    await userEvent.click(screen.getByRole('checkbox', { name: /Nur freie/ }));

    expect(screen.getByRole('checkbox', { name: /Anna Belegt/ })).toBeChecked();
  });

  it('sagt, dass der FILTER der Grund fuer die leere Liste ist', async () => {
    // Sonst sieht ein gesetzter Filter aus wie „niemand vorhanden" — und
    // wer das glaubt, plant den Tag gar nicht.
    zeige([LEUTE[0], LEUTE[2]]);
    await userEvent.click(screen.getByRole('checkbox', { name: /Nur freie/ }));

    expect(screen.getByText(/Der Filter blendet die Belegten aus/)).toBeInTheDocument();
  });
});

describe('PersonPicker — ohne Verfuegbarkeit unveraendert', () => {
  it('zeigt gar keinen Filter, wenn alle frei sind', () => {
    // Die Liste wird auch fuer „wer darf Urlaub genehmigen" benutzt. Dort
    // gibt es keine Verfuegbarkeit, und ein Schalter ohne Wirkung waere
    // schlimmer als keiner.
    zeige([{ uid: 'a', name: 'Anna' }, { uid: 'b', name: 'Bert' }]);
    expect(screen.queryByRole('checkbox', { name: /Nur freie/ })).toBeNull();
  });

  it('laesst die Reihenfolge der Aufrufstelle unangetastet', () => {
    // Die Sortierung ist stabil: ohne `nichtFrei` sind alle gleich, und die
    // Namenssortierung der Aufrufstelle bleibt stehen.
    zeige([
      { uid: 'c', name: 'Zacharias' },
      { uid: 'a', name: 'Anton' },
      { uid: 'b', name: 'Berta' },
    ]);
    const namen = reihenfolge();
    expect(namen[0]).toContain('Zacharias');
    expect(namen[1]).toContain('Anton');
    expect(namen[2]).toContain('Berta');
  });
});
