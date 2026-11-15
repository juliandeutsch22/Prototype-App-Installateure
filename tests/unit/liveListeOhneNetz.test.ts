// @vitest-environment jsdom
/**
 * Z10 (Prüflauf 15.11.2026, Verdacht): „Meine Einträge“ zeigte ohne Netz
 * „Das hat nicht geklappt — Failed to fetch“ und erholte sich nicht.
 *
 * NACHGESTELLT mit einem gestellten Client, wie `abonnementWiederaufbau`:
 * die Liste steht, das Nachfassen nach dem Aufbau des Kanals fällt ins
 * Funkloch. `abonnieren` meldete das als Ladefehler (`onError`), obwohl der
 * Bestand gültig dastand — die Ansicht ersetzte ihre Liste durch den Fehler.
 * Kam das Netz zurück und änderte sich nichts, meldete der Abgleich kein
 * neues Bild; die Ansicht blieb beim Fehler.
 *
 * JETZT, für alle Live-Listen in `abonnieren`: scheitert ein Abgleich, bleibt
 * der letzte Stand stehen (kein `onError`), und er wird wiederholt, bis er
 * gelingt. Scheitert das Laden ohne gültigen Bestand, wird es wie bisher
 * gemeldet — und der nächste Erfolg meldet ein Bild, auch ohne Änderung,
 * damit die Ansicht ihren Fehler zurücknehmen kann.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { abonnieren, NACHFASSEN_MS } from '@/lib/db/pg/kern';
import { verbindungZuruecksetzen } from '@/lib/liveVerbindung';

function client(netz: { an: boolean }, zeilen: Array<Record<string, unknown>>) {
  const kanaele: Array<(s: string) => void> = [];
  const c = {
    channel: () => {
      const k = { on: () => k, subscribe: (cb: (s: string) => void) => { kanaele.push(cb); return k; } };
      return k;
    },
    removeChannel: () => Promise.resolve('ok'),
    from: () => {
      const bauer = {
        select: () => bauer, eq: () => bauer, in: () => bauer, order: () => bauer, range: () => bauer, limit: () => bauer,
        then: (aufl: (w: unknown) => unknown, ab?: (e: unknown) => unknown) =>
          (netz.an
            ? Promise.resolve({ data: zeilen, error: null })
            : Promise.reject(new TypeError('Failed to fetch'))).then(aufl, ab),
      };
      return bauer;
    },
  } as unknown as SupabaseClient;
  return { c, kanaele };
}

const ZEILE = { id: 'e1', company_id: 'perl', date: '2026-11-14', updated_at: '2026-11-14T10:00:00Z' };

beforeEach(() => {
  vi.useFakeTimers();
  verbindungZuruecksetzen();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Live-Liste ohne Netz (Z10)', () => {
  it('ein gescheiterter Abgleich lässt den letzten Stand stehen und meldet keinen Ladefehler', async () => {
    const netz = { an: true };
    const { c, kanaele } = client(netz, [ZEILE]);
    const cb = vi.fn();
    const onError = vi.fn();
    abonnieren('time_entries', 'perl', cb, onError, {}, c);
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'e1' })]);

    kanaele[0]('SUBSCRIBED');
    netz.an = false;
    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS + 10);
    expect(onError).not.toHaveBeenCalled();
  });

  it('… und holt nach, sobald das Netz zurück ist — auch ohne neuen Kanal', async () => {
    const netz = { an: true };
    const zeilen = [ZEILE];
    const { c, kanaele } = client(netz, zeilen);
    const cb = vi.fn();
    abonnieren('time_entries', 'perl', cb, vi.fn(), {}, c);
    await vi.advanceTimersByTimeAsync(0);
    kanaele[0]('SUBSCRIBED');
    netz.an = false;
    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS + 10);
    // Während des Funklochs kam eine Buchung dazu, die der Kanal nicht meldete.
    zeilen.push({ id: 'e2', company_id: 'perl', date: '2026-11-15', updated_at: '2026-11-15T08:00:00Z' });
    netz.an = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'e2' })]));
  });

  it('bleibt gleich: scheitert das Laden ohne Bestand, wird es gemeldet; der nächste Erfolg meldet ein Bild', async () => {
    const netz = { an: false };
    const { c, kanaele } = client(netz, [ZEILE]);
    const cb = vi.fn();
    const onError = vi.fn();
    abonnieren('time_entries', 'perl', cb, onError, {}, c);
    await vi.advanceTimersByTimeAsync(0);
    kanaele[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();

    netz.an = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'e1' })]);
  });
});
