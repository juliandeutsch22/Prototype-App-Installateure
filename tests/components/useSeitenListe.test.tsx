import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSeitenListe } from '@/lib/useSeitenListe';

const cursor = { id: 'a', zeit: '2026-01-01T00:00:00Z' };
const seite = (id: string, mehr = false) => ({ zeilen: [{ id }], naechste: mehr ? cursor : null });
function warten<T>() {
  let fertig!: (wert: T) => void;
  const promise = new Promise<T>((resolve) => { fertig = resolve; });
  return { promise, fertig };
}

describe('Listen laden ihre nächsten Serverseiten', () => {
  it('hängt nur die nächste Seite an und fragt vorhandene Seiten nicht nochmals ab', async () => {
    const laden = vi.fn().mockResolvedValueOnce(seite('a', true)).mockResolvedValueOnce(seite('b'));
    const h = renderHook(() => useSeitenListe(laden));
    await waitFor(() => expect(h.result.current.mehr).toBe(true));
    await act(() => h.result.current.nachladen());
    expect(h.result.current.zeilen).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(laden.mock.calls).toEqual([[null], [cursor]]);
    expect(h.result.current.mehr).toBe(false);
  });
  it('verwirft alte Treffer und Antworten, wenn die Suche während des Weiterladens wechselt', async () => {
    const alt = warten<ReturnType<typeof seite>>();
    const ladenAlt = vi.fn().mockResolvedValueOnce(seite('a', true)).mockReturnValueOnce(alt.promise);
    const neu = warten<ReturnType<typeof seite>>();
    const ladenNeu = vi.fn(() => neu.promise);
    const h = renderHook(({ laden }) => useSeitenListe(laden), { initialProps: { laden: ladenAlt } });
    await waitFor(() => expect(h.result.current.mehr).toBe(true));
    act(() => { void h.result.current.nachladen(); });
    h.rerender({ laden: ladenNeu });
    expect(h.result.current.zeilen).toEqual([]);
    await act(async () => { alt.fertig(seite('falsch')); });
    expect(h.result.current.zeilen).toEqual([]);
    await act(async () => { neu.fertig(seite('richtig')); });
    expect(h.result.current.zeilen).toEqual([{ id: 'richtig' }]);
    expect(h.result.current.laedt).toBe(false);
    expect(h.result.current.mehrLaedt).toBe(false);
  });
  it('zeigt einen Fehler beim Weiterladen und lässt dieselbe Stelle wiederholen', async () => {
    const laden = vi.fn().mockResolvedValueOnce(seite('a', true))
      .mockRejectedValueOnce(new Error('Netz unterbrochen')).mockResolvedValueOnce(seite('b'));
    const h = renderHook(() => useSeitenListe(laden));
    await waitFor(() => expect(h.result.current.mehr).toBe(true));
    await act(() => h.result.current.nachladen());
    expect(h.result.current.fehler).toBe('Netz unterbrochen');
    expect(h.result.current.zeilen).toEqual([{ id: 'a' }]);
    await act(() => h.result.current.nachladen());
    expect(h.result.current.fehler).toBeNull();
    expect(laden.mock.calls[1]).toEqual(laden.mock.calls[2]);
    expect(h.result.current.zeilen).toHaveLength(2);
  });
  it('behält beim Aktualisieren den bereits aufgeklappten Umfang', async () => {
    const laden = vi.fn().mockResolvedValueOnce(seite('a', true)).mockResolvedValueOnce(seite('b'))
      .mockResolvedValueOnce(seite('neu', true)).mockResolvedValueOnce(seite('b'));
    const h = renderHook(() => useSeitenListe(laden));
    await waitFor(() => expect(h.result.current.mehr).toBe(true));
    await act(() => h.result.current.nachladen());
    await act(() => h.result.current.neuLaden());
    expect(h.result.current.zeilen).toEqual([{ id: 'neu' }, { id: 'b' }]);
    expect(laden).toHaveBeenCalledTimes(4);
  });
});
