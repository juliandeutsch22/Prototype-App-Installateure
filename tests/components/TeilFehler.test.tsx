import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeilFehler } from '@/components/States';

/**
 * Der Hinweis für einen ausgefallenen Nebenladevorgang.
 *
 * Er existiert, weil „es gibt keine Baustellen" und „die Baustellen konnten
 * nicht geladen werden" in einem leeren Auswahlfeld identisch aussehen. Genau
 * dieser Unterschied musste schon einmal aus dem Betrieb zurückgemeldet
 * werden („leeres Auswahlfeld beim Schein").
 */

describe('Teilfehler-Hinweis', () => {
  it('sagt, WAS fehlt — nicht nur, dass etwas fehlt', () => {
    render(<TeilFehler was="Die Baustellen" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Baustellen konnte nicht geladen werden.',
    );
  });

  it('meldet sich als Warnung, damit Screenreader sie ansagen', () => {
    render(<TeilFehler was="Die Kunden" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('bietet einen zweiten Versuch nur an, wenn es einen gibt', async () => {
    // Ein Knopf ohne Wirkung wäre schlimmer als keiner.
    const { unmount } = render(<TeilFehler was="Die Belegschaft" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();

    const nochmal = vi.fn();
    render(<TeilFehler was="Die Belegschaft" onRetry={nochmal} />);
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(nochmal).toHaveBeenCalledTimes(1);
  });
});
