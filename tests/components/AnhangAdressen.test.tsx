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

const { useAnhangAdressen, adressenVergessen } = await import('@/features/nachrichten/useAnhangAdressen');

const PLAN = [{ eimer: 'nachrichten', pfad: 'k1/plan.pdf' }];

let sichtbar: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  holen.mockClear();
  // Seit L4 merkt sich die App die Adressen je Datei über das Gespräch hinaus.
  adressenVergessen();
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

/*
  L4 (17.11.2026): eine Adresse gilt, bis sie bald abläuft — für jede Ansicht,
  die dieselbe Datei zeigt. Vorher bekam mit jeder neuen Nachricht mit Anhang
  jeder Anhang des Gesprächs eine neue Adresse, und beim nächsten Öffnen
  ebenso; der Browser holte jedes Bild noch einmal.

  GEGENPROBE (Erwartung): mit dem Effekt aus K7 (alles neu je Liste) sind die
  beiden ersten Fälle rot.
*/
describe('Gemerkte Adressen je Datei (L4)', () => {
  const FOTO = { eimer: 'nachrichten', pfad: 'k1/n1/foto' };
  const NEU = { eimer: 'nachrichten', pfad: 'k1/n2/neu' };

  it('eine neue Nachricht mit Anhang: nur ihre Datei wird signiert, die alten behalten ihre Adresse', async () => {
    const { result, rerender } = renderHook(({ l }) => useAnhangAdressen(l), { initialProps: { l: [FOTO] } });
    await act(async () => { await Promise.resolve(); });
    const alt = result.current.get('nachrichten/k1/n1/foto');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    rerender({ l: [FOTO, NEU] });
    await act(async () => { await Promise.resolve(); });
    expect(holen).toHaveBeenCalledTimes(2);
    expect(holen.mock.calls[1][0]).toEqual([NEU]);
    expect(result.current.get('nachrichten/k1/n1/foto')).toBe(alt);
    expect(result.current.get('nachrichten/k1/n2/neu')).toBeDefined();
  });

  it('das Gespräch erneut geöffnet: nichts wird neu signiert, solange die Adressen gelten', async () => {
    const erst = renderHook(() => useAnhangAdressen([FOTO]));
    await act(async () => { await Promise.resolve(); });
    const alt = erst.result.current.get('nachrichten/k1/n1/foto');
    erst.unmount();
    await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
    const wieder = renderHook(() => useAnhangAdressen([FOTO]));
    await act(async () => { await Promise.resolve(); });
    expect(holen).toHaveBeenCalledTimes(1);
    expect(wieder.result.current.get('nachrichten/k1/n1/foto')).toBe(alt);
  });

  it('bleibt gleich: eine Adresse, die bald abläuft, wird beim Öffnen neu geholt', async () => {
    const erst = renderHook(() => useAnhangAdressen([FOTO]));
    await act(async () => { await Promise.resolve(); });
    erst.unmount();
    vi.setSystemTime(Date.now() + 9 * 60_000 + 1);
    renderHook(() => useAnhangAdressen([FOTO]));
    await act(async () => { await Promise.resolve(); });
    expect(holen).toHaveBeenCalledTimes(2);
  });

  it('ohne Netz: kein neuer Versuch jede Sekunde, sondern nach einer halben Minute', async () => {
    holen.mockRejectedValueOnce(new Error('Failed to fetch'));
    renderHook(() => useAnhangAdressen([FOTO]));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(holen).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(11_000); });
    expect(holen).toHaveBeenCalledTimes(2);
  });
});
