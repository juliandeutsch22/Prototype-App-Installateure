import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAbBreite } from '@/lib/useAbBreite';

/**
 * Die eine Breitenweiche: Tabelle oder Liste, eine Seite oder Schritte.
 *
 * Das Wichtigste steht im ersten Test. Ohne `matchMedia` (jsdom, alte
 * Browser) muss die Telefonform kommen — sie funktioniert überall, die
 * Tabelle nicht.
 */
const vorher = window.matchMedia;
afterEach(() => {
  window.matchMedia = vorher;
});

/** Eine Medienabfrage, deren Ergebnis sich von aussen umschalten lässt. */
function abfrage(anfangs: boolean, { alt = false } = {}) {
  const hoerer = new Set<() => void>();
  const mq = {
    matches: anfangs,
    media: '',
    ...(alt
      ? {
          addListener: (f: () => void) => hoerer.add(f),
          removeListener: (f: () => void) => hoerer.delete(f),
        }
      : {
          addEventListener: (_: string, f: () => void) => hoerer.add(f),
          removeEventListener: (_: string, f: () => void) => hoerer.delete(f),
        }),
  };
  const gefragt: string[] = [];
  window.matchMedia = ((q: string) => {
    gefragt.push(q);
    return mq;
  }) as unknown as typeof window.matchMedia;
  return {
    gefragt,
    hoerer,
    setze(wert: boolean) {
      mq.matches = wert;
      act(() => hoerer.forEach((f) => f()));
    },
  };
}

describe('useAbBreite', () => {
  it('fällt ohne matchMedia auf die Telefonform zurück', () => {
    // @ts-expect-error — jsdom hat keines; hier ausdrücklich entfernt.
    window.matchMedia = undefined;
    const { result } = renderHook(() => useAbBreite());
    expect(result.current).toBe(false);
  });

  it('fragt nach der Grenze von Tailwinds `lg`', () => {
    const m = abfrage(true);
    const { result } = renderHook(() => useAbBreite());
    expect(result.current).toBe(true);
    expect(m.gefragt).toContain('(min-width: 1024px)');
  });

  it('steht schon beim ersten Zeichnen richtig — kein Umspringen danach', () => {
    abfrage(true);
    const werte: boolean[] = [];
    renderHook(() => {
      const breit = useAbBreite();
      werte.push(breit);
      return breit;
    });
    expect(werte[0]).toBe(true);
  });

  it('folgt einer Änderung der Fensterbreite', () => {
    const m = abfrage(false);
    const { result } = renderHook(() => useAbBreite());
    expect(result.current).toBe(false);
    m.setze(true);
    expect(result.current).toBe(true);
    m.setze(false);
    expect(result.current).toBe(false);
  });

  it('räumt den Hörer beim Aushängen weg', () => {
    const m = abfrage(false);
    const { unmount } = renderHook(() => useAbBreite());
    expect(m.hoerer.size).toBe(1);
    unmount();
    expect(m.hoerer.size).toBe(0);
  });

  it('kommt auch mit dem alten `addListener` älterer Safari zurecht', () => {
    const m = abfrage(false, { alt: true });
    const { result, unmount } = renderHook(() => useAbBreite());
    m.setze(true);
    expect(result.current).toBe(true);
    unmount();
    expect(m.hoerer.size).toBe(0);
  });
});
