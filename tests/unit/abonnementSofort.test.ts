// @vitest-environment jsdom
/**
 * LIVE-LISTEN ZEIGEN IHREN BESTAND SOFORT (Analyse 09.10.2026, Maßnahme 6).
 *
 * Bisher holte `abonnieren` den Bestand erst, wenn der Kanal stand — je nach
 * Netz einige hundert Millisekunden bis Sekunden, in denen die Liste leer
 * war. Jetzt wird gleich zu Beginn geholt und gezeigt; das Laden nach
 * `SUBSCRIBED` und das Nachfassen bleiben (Gleichbleiben: eigene Prüfung).
 *
 * Gegenprobe: gegen den Stand davor meldet `abonnieren` vor `SUBSCRIBED`
 * nichts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { abonnieren, NACHFASSEN_MS } from '@/lib/db/pg/kern';
import { verbindungZuruecksetzen } from '@/lib/liveVerbindung';

interface Abruf { antworte: (zeilen: Record<string, unknown>[]) => void }

/** Ein Client, dessen Abfragen die Prüfung einzeln beantwortet. */
function gestellterClient() {
  const status: Array<(s: string) => void> = [];
  const abrufe: Abruf[] = [];
  const client = {
    channel: () => {
      const kanal = {
        on: () => kanal,
        subscribe: (cb: (s: string) => void) => { status.push(cb); return kanal; },
      };
      return kanal;
    },
    removeChannel: () => Promise.resolve('ok'),
    from: () => {
      let antwort: Promise<{ data: unknown[]; error: null }> | null = null;
      const bauer = {
        select: () => bauer, eq: () => bauer, order: () => bauer, range: () => bauer, limit: () => bauer,
        then: (aufl: (w: { data: unknown[]; error: null }) => unknown, abl?: (e: unknown) => unknown) => {
          if (!antwort) {
            antwort = new Promise((fertig) => {
              abrufe.push({ antworte: (zeilen) => fertig({ data: zeilen, error: null }) });
            });
          }
          return antwort.then(aufl, abl);
        },
      };
      return bauer;
    },
  } as unknown as SupabaseClient;
  return { client, status, abrufe };
}

const zeile = (id: string, name: string) => ({ id, company_id: 'perl', name });

beforeEach(() => { vi.useFakeTimers(); verbindungZuruecksetzen(); });
afterEach(() => { vi.useRealTimers(); });

describe('abonnieren: das erste Bild', () => {
  it('meldet den Bestand, bevor der Kanal steht', async () => {
    const { client, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);

    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(1);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([['Rohr']]);
    stopp();
  });

  it('nach SUBSCRIBED wird wie bisher geholt und nachgefasst — der neuere Stand gilt', async () => {
    const { client, status, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);

    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(2);
    // Das Laden nach dem Aufbau antwortet zuerst, das erste Laden danach — es wird verworfen.
    abrufe[1].antworte([zeile('a', 'Rohr'), zeile('b', 'Bogen')]);
    await vi.advanceTimersByTimeAsync(0);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([['Rohr', 'Bogen']]);

    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS);
    expect(abrufe).toHaveLength(3);
    stopp();
  });

  it('meldet nach dem Abmelden nichts mehr', async () => {
    const { client, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    stopp();
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([]);
  });
});

describe('abonnieren: viele Meldungen auf einmal (Analyse 09.10.2026, Maßnahme 12)', () => {
  it('zeichnet nach einem Schwall einmal neu, nicht je Meldung — und verliert keine', async () => {
    let melde: ((n: unknown) => void) | undefined;
    const status: Array<(s: string) => void> = [];
    const client = {
      channel: () => {
        const kanal = {
          on: (_e: string, _o: unknown, cb: (n: unknown) => void) => { melde = cb; return kanal; },
          subscribe: (cb: (s: string) => void) => { status.push(cb); return kanal; },
        };
        return kanal;
      },
      removeChannel: () => Promise.resolve('ok'),
      from: () => {
        const bauer = {
          select: () => bauer, eq: () => bauer, order: () => bauer, range: () => bauer, limit: () => bauer,
          then: (aufl: (w: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(aufl),
        };
        return bauer;
      },
    } as unknown as SupabaseClient;
    const gemeldet: number[] = [];
    const stopp = abonnieren('materials', 'perl', (z) => gemeldet.push(z.length), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    const vorher = gemeldet.length;

    for (let i = 0; i < 500; i += 1) {
      melde!({ eventType: 'INSERT', new: { id: `m${i}`, company_id: 'perl', name: `Artikel ${i}` }, old: {} });
    }
    expect(gemeldet.length).toBe(vorher);
    await vi.advanceTimersByTimeAsync(60);
    expect(gemeldet.slice(vorher)).toEqual([500]);
    stopp();
  });
});
