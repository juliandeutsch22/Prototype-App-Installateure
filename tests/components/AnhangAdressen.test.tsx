import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * K7 (Durchsicht 15.11.2026): die Adresse eines Anhangs gilt zehn Minuten.
 * Vorher wurde sie nur neu geholt, wenn sich der Verlauf änderte — ein Plan,
 * nach einer Viertelstunde Ruhe angetippt, endete auf der Fehlerseite des
 * Speichers. Jetzt erneuert sie sich vor Ablauf und beim Zurückkommen.
 *
 * GEGENPROBE (Erwartung): mit dem alten Effekt (einmal je Verlauf) sind
 * „vor Ablauf“ und „beim Zurückkommen“ rot; „dieselbe Liste holt nicht neu“
 * ist in beiden Fassungen grün.
 */
const holen = vi.fn(async (liste: { eimer: string; pfad: string }[]) =>
  new Map(liste.map((a) => [`${a.eimer}/${a.pfad}`, `https://speicher/${a.pfad}?zeit=${Date.now()}`])));
vi.mock('@/lib/db/nachrichten', () => ({
  anhangAdressen: (l: { eimer: string; pfad: string }[]) => holen(l),
  ANHANG_ADRESSE_GUELTIG_S: 600,
}));

const { useAnhangAdressen } = await import('@/features/nachrichten/useAnhangAdressen');

const PLAN = [{ eimer: 'nachrichten', pfad: 'k1/plan.pdf' }];

let sichtbar: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  holen.mockClear();
  sichtbar = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => sichtbar);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Die Adressen der Anhänge im offenen Gespräch', () => {
  it('werden eine Minute vor Ablauf erneuert — immer wieder', async () => {
    const { result } = renderHook(() => useAnhangAdressen(PLAN));
    await act(async () => { await Promise.resolve(); });
    expect(holen).toHaveBeenCalledTimes(1);
    const erste = result.current.get('nachrichten/k1/plan.pdf');

    await act(async () => { vi.advanceTimersByTime(9 * 60_000); });
    expect(holen).toHaveBeenCalledTimes(2);
    expect(result.current.get('nachrichten/k1/plan.pdf')).not.toBe(erste);
    await act(async () => { vi.advanceTimersByTime(9 * 60_000); });
    expect(holen).toHaveBeenCalledTimes(3);
  });

  it('nach langer Zeit im Hintergrund: sofort beim Zurückkommen', async () => {
    renderHook(() => useAnhangAdressen(PLAN));
    await act(async () => { await Promise.resolve(); });
    sichtbar = 'hidden';
    // Am Telefon schlafen die Zeitgeber im Hintergrund — die Uhr läuft trotzdem.
    vi.setSystemTime(Date.now() + 15 * 60_000);
    sichtbar = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(holen).toHaveBeenCalledTimes(2);
  });

  it('bleibt gleich: dieselbe Liste (neu gebaut) holt nicht neu, kurz zurückkommen auch nicht', async () => {
    const { rerender } = renderHook(({ l }) => useAnhangAdressen(l), { initialProps: { l: PLAN } });
    await act(async () => { await Promise.resolve(); });
    rerender({ l: [{ ...PLAN[0] }] });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(holen).toHaveBeenCalledTimes(1);
  });

  it('ohne Anhänge wird nichts geholt', async () => {
    renderHook(() => useAnhangAdressen([]));
    await act(async () => { vi.advanceTimersByTime(20 * 60_000); });
    expect(holen).not.toHaveBeenCalled();
  });
});
