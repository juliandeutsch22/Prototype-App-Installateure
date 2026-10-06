import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import Aktionsleiste from '@/components/Aktionsleiste';

/**
 * Runde 3, G22: Beim Öffnen der Zeiterfassung am Handy lag der klebende
 * Knopf „Zeit buchen“ über dem Datumsfeld. Mit `erstNachDemRollen` steht die
 * Leiste beim Öffnen unter dem Formular und klebt erst, wenn gerollt wurde
 * und das Formular über der Bildschirmmitte beginnt. Im echten Browser bei
 * 390 px geprüft in `tests/durchklick/aktionsleisteTelefon.spec.ts`.
 */

function zeichne(erstNachDemRollen: boolean) {
  render(
    <form aria-label="Formular">
      <input aria-label="Datum" />
      <Aktionsleiste erstNachDemRollen={erstNachDemRollen} rechts={<button type="submit">Zeit buchen</button>} />
    </form>,
  );
  const formular = screen.getByRole('form', { name: 'Formular' });
  const leiste = screen.getByRole('button', { name: 'Zeit buchen' }).closest('.aktionsleiste')!;
  return { formular, leiste };
}

function obenBei(el: Element, oben: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: oben, bottom: oben + 900, left: 0, right: 390, width: 390, height: 900, x: 0, y: oben, toJSON: () => ({}),
  });
}

async function rollen() {
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => window.requestAnimationFrame(() => r(null)));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Aktionsleiste der Zeiterfassung am Telefon (G22)', () => {
  it('klebt beim Öffnen nicht — auch wenn das Formular oben beginnt', () => {
    const { leiste } = zeichne(true);
    expect(leiste).toHaveClass('aktionsleiste-frei');
  });

  it('nach dem Rollen klebt sie, sobald das Formular über der Mitte beginnt', async () => {
    const { formular, leiste } = zeichne(true);
    obenBei(formular, window.innerHeight * 0.7);
    await rollen();
    expect(leiste).toHaveClass('aktionsleiste-frei');
    obenBei(formular, 40);
    await rollen();
    expect(leiste).not.toHaveClass('aktionsleiste-frei');
    expect(leiste).toHaveClass('aktionsleiste');
  });

  it('Gegenprobe: ohne den Schalter klebt sie wie bisher — auch beim Öffnen', () => {
    const { leiste } = zeichne(false);
    expect(leiste).toHaveClass('aktionsleiste');
    expect(leiste).not.toHaveClass('aktionsleiste-frei');
  });
});
