import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { zurueckhalten } from './zurueckhalten';

/**
 * Der Helfer `zurueckhalten` (Stand 18, K1, 12.10.2026).
 *
 * Nachgestellt ist die Lage in der CI: die Mock-Funktion hat schon Aufrufe
 * aus früheren Tests, und die Ansicht fragt erst etwas später.
 *
 * Gegenprobe: das alte Warten (`toHaveBeenCalled()`) ist in dieser Lage
 * sofort erfüllt, obwohl die Ansicht noch nicht gefragt hat — genau daran
 * blieb „Mein Einsatzplan“ in der CI bei „Wird geladen“ hängen.
 */
const holen = vi.fn(async (): Promise<string> => 'früher');

function Ansicht() {
  const [text, setText] = useState('Wird geladen');
  useEffect(() => {
    // Erst nach einer anderen Antwort gefragt — wie unter Last in der CI.
    const t = setTimeout(() => { void holen().then(setText); }, 30);
    return () => clearTimeout(t);
  }, []);
  return <p>{text}</p>;
}

describe('Eine Antwort zurückhalten', () => {
  it('gibt erst frei, wenn die Ansicht gefragt hat — auch mit Aufrufen aus früheren Tests', async () => {
    await holen();
    const h = zurueckhalten<string>();
    holen.mockImplementationOnce(h.antwort);
    render(<Ansicht />);

    // Gegenprobe: das alte Warten wäre hier schon fertig, gefragt hat aber noch niemand.
    expect(holen).toHaveBeenCalled();
    expect(h.gefragt).toBe(false);

    await waitFor(() => expect(h.gefragt).toBe(true));
    expect(screen.getByText('Wird geladen')).toBeInTheDocument();
    await act(async () => h.liefern('Familie Huber'));
    expect(await screen.findByText('Familie Huber')).toBeInTheDocument();
  });

  it('wirft, wenn ein Test zu früh freigibt — statt die Seite still hängen zu lassen', () => {
    const h = zurueckhalten<string>();
    expect(() => h.liefern('zu früh')).toThrow(/bevor danach gefragt wurde/);
  });
});
