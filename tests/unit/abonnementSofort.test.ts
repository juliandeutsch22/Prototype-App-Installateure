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

interface Abruf { antworte: (zeilen: Record<string, unknown>[]) => void; scheitere: () => void }

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
              abrufe.push({
                antworte: (zeilen) => fertig({ data: zeilen, error: null }),
                scheitere: () => fertig({ data: null, error: { message: 'kein Netz' } } as never),
              });
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

  /*
    SEIT 18.10.2026 zählt das erste Bild auch dann als Laden nach dem Aufbau,
    wenn der Kanal vor ihm steht (im langsamen Netz der Normalfall): kein
    zweites Holen, das Nachfassen bleibt — es allein ist sicher nach dem
    Moment geholt, in dem der Server hört.
  */
  it('steht der Kanal vor dem ersten Bild, gilt das erste Bild — nachgefasst wird wie bisher', async () => {
    const { client, status, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);

    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(1);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([['Rohr']]);

    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS);
    expect(abrufe).toHaveLength(2);
    abrufe[1].antworte([zeile('a', 'Rohr'), zeile('b', 'Bogen')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr', 'Bogen']);
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

/*
  KEIN DRITTES LADEN (Mengengerüst, 18.10.2026). Kam das erste Bild vor dem
  Kanal, holte das Laden nach SUBSCRIBED denselben Bestand ein zweites Mal —
  vor dem Nachfassen, das ihn ohnehin ein drittes Mal holt. Gemessen bei den
  Artikeln: drei volle Durchgänge, die Datenmenge doppelt so groß wie vor #265.
*/
describe('abonnieren: kein doppeltes Laden nach dem ersten Bild', () => {
  /** Ein gestellter Client, dessen Kanal auch Meldungen schicken kann. */
  function mitMeldungen() {
    const g = gestellterClient();
    let melde: ((n: unknown) => void) | undefined;
    const kanalVorher = (g.client as unknown as { channel: () => unknown }).channel;
    (g.client as unknown as { channel: () => unknown }).channel = () => {
      const kanal = kanalVorher() as { on: (e: unknown, o: unknown, cb: (n: unknown) => void) => unknown };
      kanal.on = (_e, _o, cb) => { melde = cb; return kanal; };
      return kanal;
    };
    return { ...g, melde: (n: unknown) => melde!(n) };
  }

  it('holt nach SUBSCRIBED nicht noch einmal, wenn das erste Bild schon steht — das Nachfassen bleibt', async () => {
    const { client, status, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);

    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS);
    expect(abrufe).toHaveLength(2);
    // Das Nachfassen ersetzt den Bestand wie bisher.
    abrufe[1].antworte([zeile('a', 'Rohr'), zeile('b', 'Bogen')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr', 'Bogen']);
    stopp();
  });

  it('eine Meldung zwischen Aufbau und Nachfassen gilt sofort — und bleibt nach dem Nachfassen', async () => {
    const { client, status, abrufe, melde } = mitMeldungen();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);

    melde({ eventType: 'INSERT', new: zeile('n', 'Muffe'), old: {} });
    await vi.advanceTimersByTimeAsync(60);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr', 'Muffe']);

    // Während das Nachfassen holt, kommt noch eine — sie geht nicht verloren.
    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS);
    melde({ eventType: 'INSERT', new: zeile('k', 'Kappe'), old: {} });
    abrufe[1].antworte([zeile('a', 'Rohr'), zeile('n', 'Muffe')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr', 'Muffe', 'Kappe']);
    stopp();
  });

  it('Gegenprobe: nach einem Abriss lädt der neue Kanal gleich — nicht erst mit dem Nachfassen', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { client, status, abrufe } = gestellterClient();
    const stopp = abonnieren<{ name: string }>('materials', 'perl', () => {}, () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS);
    abrufe[1].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(2);

    status[0]('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(1100);
    expect(status).toHaveLength(2);
    status[1]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(3);
    stopp();
  });

  it('fasst so spät nach wie bisher: Aufbau + Dauer eines Ladens + NACHFASSEN_MS', async () => {
    const { client, status, abrufe } = gestellterClient();
    const stopp = abonnieren<{ name: string }>('materials', 'perl', () => {}, () => {}, {}, client);
    // Das erste Bild braucht 500 ms; der Kanal steht danach.
    await vi.advanceTimersByTimeAsync(500);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(NACHFASSEN_MS);
    // Bisher lud der Aufbau (500 ms) und fasste dann nach — nicht früher als das.
    expect(abrufe).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(abrufe).toHaveLength(2);
    stopp();
  });

  it('eine Meldung, die vor dem ersten Bild ankommt, wartet — und gilt danach', async () => {
    const { client, status, abrufe, melde } = mitMeldungen();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    melde({ eventType: 'INSERT', new: zeile('n', 'Muffe'), old: {} });
    await vi.advanceTimersByTimeAsync(60);
    expect(gemeldet).toEqual([]);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr', 'Muffe']);
    stopp();
  });

  it('Gegenprobe: scheiterte das erste Bild, wird nach SUBSCRIBED geladen wie bisher', async () => {
    const { client, status, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    abrufe[0].scheitere();
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(2);
    abrufe[1].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([['Rohr']]);
    stopp();
  });

  it('Gegenprobe: ein erstes Bild, das erst nach einem Wiederaufbau kommt, gilt nicht mehr', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { client, status, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    status[0]('SUBSCRIBED');
    status[0]('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(1100);
    status[1]('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(abrufe).toHaveLength(2);
    abrufe[1].antworte([zeile('a', 'Rohr'), zeile('b', 'Bogen')]);
    await vi.advanceTimersByTimeAsync(0);
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr', 'Bogen']);
    stopp();
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
