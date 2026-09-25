import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * Prüflauf 25.09.2026, P1-06: nachsenden auch ohne Ereignis.
 *
 * Bis hierher stiess nur dreierlei das Nachsenden an: der Start, `online` und
 * die Rückkehr zur App. Blieb der Monteur in der App und kam der Empfang still
 * zurück, lag die Buchung — bis er zufällig die App wechselte. Jetzt sieht ein
 * Zeitgeber jede Minute ins Fach und sendet, sobald dort etwas liegt.
 */

const nachsendenJetzt = vi.fn(async () => ({ gesendet: 0, abgelehnt: 0, offen: 0 }));
const offeneVormerkungen = vi.fn(async () => 0);
vi.mock('@/lib/db/pg/ohneEmpfang', () => ({
  nachsendenJetzt: () => nachsendenJetzt(),
  offeneVormerkungen: () => offeneVormerkungen(),
}));

const { default: Nachsender, NACHSEHEN_MS } = await import('@/components/Nachsender');

beforeEach(() => {
  vi.useFakeTimers();
  nachsendenJetzt.mockClear();
  offeneVormerkungen.mockReset().mockResolvedValue(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Der Nachsender', () => {
  it('sendet nach einer Minute nach, wenn etwas im Fach liegt', async () => {
    render(<Nachsender />);
    // Der Anlass beim Start.
    expect(nachsendenJetzt).toHaveBeenCalledTimes(1);

    offeneVormerkungen.mockResolvedValue(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NACHSEHEN_MS);
    });
    expect(nachsendenJetzt).toHaveBeenCalledTimes(2);
    expect(NACHSEHEN_MS).toBeLessThanOrEqual(60_000);
  });

  it('geht bei leerem Fach nicht ans Netz', async () => {
    render(<Nachsender />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NACHSEHEN_MS * 3);
    });
    expect(offeneVormerkungen).toHaveBeenCalledTimes(3);
    expect(nachsendenJetzt).toHaveBeenCalledTimes(1);
  });

  it('räumt den Zeitgeber beim Aushängen weg', async () => {
    const { unmount } = render(<Nachsender />);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NACHSEHEN_MS * 2);
    });
    expect(offeneVormerkungen).not.toHaveBeenCalled();
  });
});
