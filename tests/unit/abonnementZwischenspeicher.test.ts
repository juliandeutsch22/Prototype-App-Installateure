// @vitest-environment jsdom
/**
 * LIVE-LISTEN BEIM ZWEITEN BESUCH (Laden ohne Springen, Stufe 3).
 *
 * War eine Liste vor kurzem offen, steht ihr letzter Bestand sofort da —
 * statt Platzhaltern, bis die erste Antwort kommt. Was seither geschah,
 * bringen erstes Bild und Laden nach `SUBSCRIBED` wie bisher und ersetzen ihn.
 *
 * Gegenprobe: gegen den Stand davor meldet das zweite Abonnieren nichts,
 * bevor eine Abfrage antwortet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { abonnieren } from '@/lib/db/pg/kern';
import { verbindungZuruecksetzen } from '@/lib/liveVerbindung';
import { zwischenspeicherFuer } from '@/lib/liveSpeicher';

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

/** Einmal abonnieren, bis der Bestand gemeldet ist, dann abmelden — der erste Besuch. */
async function ersterBesuch(abfrage = {}) {
  const { client, abrufe } = gestellterClient();
  const stopp = abonnieren<{ name: string }>('materials', 'perl', () => {}, () => {}, abfrage, client);
  await vi.advanceTimersByTimeAsync(0);
  abrufe[0].antworte([zeile('a', 'Rohr'), zeile('b', 'Bogen')]);
  await vi.advanceTimersByTimeAsync(0);
  stopp();
}

beforeEach(() => {
  vi.useFakeTimers();
  verbindungZuruecksetzen();
  zwischenspeicherFuer('u1', 'perl');
});
afterEach(() => { vi.useRealTimers(); });

describe('abonnieren: der zweite Besuch', () => {
  it('zeigt sofort den letzten Bestand — bevor eine Abfrage antwortet', async () => {
    await ersterBesuch();
    const { client, abrufe } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([['Rohr', 'Bogen']]);

    // Der frische Bestand ersetzt ihn, sobald er da ist.
    abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet[gemeldet.length - 1]).toEqual(['Rohr']);
    stopp();
  });

  it('nur für dieselbe Abfrage — eine andere wartet wie bisher', async () => {
    await ersterBesuch();
    const { client } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>(
      'materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {},
      { wo: [{ art: 'gleich', feld: 'name', wert: 'Rohr' }] }, client,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([]);
    stopp();
  });

  it('nach einem Wechsel des Benutzers nichts vom Vorgänger', async () => {
    await ersterBesuch();
    zwischenspeicherFuer('u2', 'perl');
    const { client } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([]);
    stopp();
  });

  /*
    Die Rechnungen setzen offene Rechnungen mit überschrittener Frist von
    selbst auf „Überfällig“ — aus einem alten Stand träfe das eine
    inzwischen bezahlte Rechnung. Ihre Liste merkt sich nichts.
  */
  it('die Rechnungen nicht: aus ihrer Liste schreibt die Ansicht selbst', async () => {
    const erst = gestellterClient();
    const stopp1 = abonnieren<{ name: string }>('invoices', 'perl', () => {}, () => {}, {}, erst.client);
    await vi.advanceTimersByTimeAsync(0);
    erst.abrufe[0].antworte([zeile('r1', 'Rechnung 1')]);
    await vi.advanceTimersByTimeAsync(0);
    stopp1();

    const { client } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('invoices', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([]);
    stopp();
  });

  it('wer sofort wieder abmeldet, bekommt auch den letzten Bestand nicht mehr', async () => {
    await ersterBesuch();
    const { client } = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, client);
    stopp();
    await vi.advanceTimersByTimeAsync(0);
    expect(gemeldet).toEqual([]);
  });
});
