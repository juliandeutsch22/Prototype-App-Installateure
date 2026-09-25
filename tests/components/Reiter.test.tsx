import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Reiter, Reiterleiste } from '@/components/Reiter';

/**
 * Der gemeinsame Reiter-Baustein (Material, Lager, Anforderungen, Urlaub).
 *
 * Vorher stand jede dieser Leisten als eigene Kette von Hilfsklassen im
 * Markup. Jetzt trägt jedes Element genau eine Klasse, je Zustand eine — und
 * Rolle, Auswahlzustand und Handler bleiben, wie sie waren.
 */
describe('Reiter', () => {
  function zeige(aktiv: 'a' | 'b', onClick = vi.fn()) {
    render(
      <Reiterleiste>
        <Reiter aktiv={aktiv === 'a'} onClick={() => onClick('a')}>
          Bestand
        </Reiter>
        <Reiter aktiv={aktiv === 'b'} onClick={() => onClick('b')}>
          Katalog
        </Reiter>
      </Reiterleiste>,
    );
    return onClick;
  }

  it('ist eine Reiterliste mit Reitern und markiert den gewählten', () => {
    zeige('b');
    const leiste = screen.getByRole('tablist');
    expect(leiste.className).toBe('reiterleiste');
    const bestand = screen.getByRole('tab', { name: 'Bestand' });
    const katalog = screen.getByRole('tab', { name: 'Katalog' });
    expect(bestand).toHaveAttribute('aria-selected', 'false');
    expect(katalog).toHaveAttribute('aria-selected', 'true');
    // Eine Klasse je Zustand, wörtlich — keine zusammengesetzte Kette.
    expect(bestand.className).toBe('reiter');
    expect(katalog.className).toBe('reiter-aktiv');
  });

  it('meldet den Klick und schickt kein Formular ab', async () => {
    const klick = zeige('a');
    const katalog = screen.getByRole('tab', { name: 'Katalog' });
    expect(katalog).toHaveAttribute('type', 'button');
    await userEvent.click(katalog);
    expect(klick).toHaveBeenCalledWith('b');
  });
});
