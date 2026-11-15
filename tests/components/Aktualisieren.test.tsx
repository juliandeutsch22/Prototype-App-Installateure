import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { aktualisierenAusloesen, useAktualisierungsRunde, useBeiAktualisieren } from '@/lib/aktualisieren';

/* F15: „jetzt aktualisieren“ erreicht Listen, die selbst laden — beide Wege. */
function MitLaden({ laden }: { laden: () => unknown }) {
  useBeiAktualisieren(laden);
  return null;
}
function MitRunde() {
  return <p data-testid="runde">{useAktualisierungsRunde()}</p>;
}

describe('Aktualisieren für selbst ladende Listen', () => {
  it('ruft das Laden — ein Fehlschlag lässt den Stand stehen, ohne Ausnahme', async () => {
    const laden = vi.fn().mockRejectedValueOnce(new Error('kein Netz')).mockResolvedValue(undefined);
    const { unmount } = render(<MitLaden laden={laden} />);
    await act(async () => { aktualisierenAusloesen(); await Promise.resolve(); });
    await act(async () => { aktualisierenAusloesen(); await Promise.resolve(); });
    expect(laden).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { aktualisierenAusloesen(); await Promise.resolve(); });
    expect(laden).toHaveBeenCalledTimes(2);
  });
  it('die Runde wächst je Aktualisieren', () => {
    render(<MitRunde />);
    expect(screen.getByTestId('runde')).toHaveTextContent('0');
    act(() => aktualisierenAusloesen());
    expect(screen.getByTestId('runde')).toHaveTextContent('1');
  });
});
