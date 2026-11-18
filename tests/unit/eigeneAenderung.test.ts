// @vitest-environment jsdom
/**
 * EIGENES SCHREIBEN ZEIGT SICH, AUCH OHNE LIVE-MELDUNG (E99, 18.11.2026).
 *
 * In der CI (`runde4.spec.ts`) war die Buchung gespeichert (201), aber die
 * Meldung des Kanals kam in 20 s nicht — die Mitarbeiterübersicht zeigte den
 * Tag weiter „ohne Buchung“. Dasselbe draußen, wo ein Netz Websockets
 * sperrt: die eigene Buchung erst nach dem Neuladen. Jetzt gleicht jede
 * Live-Liste nach eigenem Schreiben ihrer Tabelle selbst ab.
 *
 * Gegenprobe: vor E99 fragte die Liste nach `eigeneAenderung` nichts — die
 * Prüfungen „gleicht ab …“ sind rot; was gleich bleiben muss (andere
 * Tabelle, abgemeldet), prüfen eigene Fälle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { abonnieren, anlegen, anlegenMitKennung, aendern, loeschen, BUENDELN_MS } from '@/lib/db/pg/kern';
import { beiEigenerAenderung, eigeneAenderung } from '@/lib/db/eigeneAenderung';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import type { Sendung } from '@/lib/sync/ausgangsfach';
import { verbindungZuruecksetzen } from '@/lib/liveVerbindung';

interface Abruf {
  antworte: (zeilen: Record<string, unknown>[]) => void;
  scheitere: () => void;
  /** Was gefragt wurde: die Spalten (`*` ohne Angabe) und eine Einschränkung auf Kennungen. */
  spalten: string;
  ids: string[] | null;
}

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
      let spalten = '*';
      let ids: string[] | null = null;
      const bauer = {
        select: (s?: string) => { spalten = s ?? '*'; return bauer; },
        in: (feld: string, werte: string[]) => { if (feld === 'id') ids = werte; return bauer; },
        eq: () => bauer, order: () => bauer, range: () => bauer, limit: () => bauer,
        then: (aufl: (w: { data: unknown[]; error: null }) => unknown, abl?: (e: unknown) => unknown) => {
          if (!antwort) {
            antwort = new Promise((fertig) => {
              abrufe.push({
                antworte: (zeilen) => fertig({ data: zeilen, error: null }),
                scheitere: () => fertig({ data: null, error: { message: 'kein Netz' } } as never),
                spalten,
                ids,
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

const zeile = (id: string, name: string, stand = '2026-10-19T08:00:00+00:00') =>
  ({ id, company_id: 'perl', name, updated_at: stand });
/** Was der Abgleich holt: Kennung und Änderungszeit. */
const stand = (id: string, s = '2026-10-19T08:00:00+00:00') => ({ id, updated_at: s });

beforeEach(() => { vi.useFakeTimers(); verbindungZuruecksetzen(); });
afterEach(() => { vi.useRealTimers(); });

/** Eine Liste mit stehendem Kanal und erstem Bild „Rohr“ — Meldungen des Kanals kommen keine. */
async function stehendeListe(tabelle = 'materials') {
  const g = gestellterClient();
  const gemeldet: string[][] = [];
  const stopp = abonnieren<{ name: string }>(tabelle, 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, g.client);
  await vi.advanceTimersByTimeAsync(0);
  g.status[0]('SUBSCRIBED');
  g.abrufe[0].antworte([zeile('a', 'Rohr')]);
  await vi.advanceTimersByTimeAsync(0);
  // Das reguläre Nachfassen nach dem Aufbau, damit es den Fall nicht überdeckt.
  await vi.advanceTimersByTimeAsync(5_000);
  for (const a of g.abrufe.slice(1)) a.antworte([stand('a')]);
  await vi.advanceTimersByTimeAsync(0);
  return { ...g, gemeldet, stopp, vorher: g.abrufe.length };
}

describe('Live-Liste nach eigenem Schreiben', () => {
  it('gleicht ab, ohne auf den Kanal zu warten — die eigene Zeile steht da', async () => {
    const l = await stehendeListe();
    expect(l.gemeldet[l.gemeldet.length - 1]).toEqual(['Rohr']);
    eigeneAenderung('materials');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    expect(l.abrufe).toHaveLength(l.vorher + 1);
    expect(l.abrufe[l.vorher].spalten).toBe('id,updated_at');
    l.abrufe[l.vorher].antworte([stand('a'), stand('b')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(l.abrufe[l.vorher + 1].ids).toEqual(['b']);
    l.abrufe[l.vorher + 1].antworte([zeile('b', 'Bogen')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(l.gemeldet[l.gemeldet.length - 1]).toEqual(['Rohr', 'Bogen']);
    l.stopp();
  });

  it('gleicht mehrere Schreibvorgänge kurz hintereinander einmal ab', async () => {
    const l = await stehendeListe();
    eigeneAenderung('materials');
    eigeneAenderung('materials');
    eigeneAenderung('materials');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    expect(l.abrufe).toHaveLength(l.vorher + 1);
    l.stopp();
  });

  it('gleicht noch einmal ab, wenn während des Abgleichs geschrieben wird', async () => {
    const l = await stehendeListe();
    eigeneAenderung('materials');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    expect(l.abrufe).toHaveLength(l.vorher + 1);
    eigeneAenderung('materials');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    // Der erste läuft noch: kein zweiter daneben.
    expect(l.abrufe).toHaveLength(l.vorher + 1);
    l.abrufe[l.vorher].antworte([stand('a')]);
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    expect(l.abrufe).toHaveLength(l.vorher + 2);
    l.stopp();
  });

  it('ist das erste Bild noch unterwegs, gleicht es danach ab', async () => {
    const g = gestellterClient();
    const gemeldet: string[][] = [];
    const stopp = abonnieren<{ name: string }>('materials', 'perl', (z) => gemeldet.push(z.map((x) => x.name)), () => {}, {}, g.client);
    await vi.advanceTimersByTimeAsync(0);
    eigeneAenderung('materials');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    expect(g.abrufe).toHaveLength(1);
    g.abrufe[0].antworte([zeile('a', 'Rohr')]);
    await vi.advanceTimersByTimeAsync(BUENDELN_MS);
    expect(g.abrufe).toHaveLength(2);
    expect(g.abrufe[1].spalten).toBe('id,updated_at');
    stopp();
  });

  it('gleich geblieben: eine andere Tabelle löst nichts aus, nach dem Abmelden auch die eigene nicht', async () => {
    const l = await stehendeListe();
    eigeneAenderung('time_entries');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS * 4);
    expect(l.abrufe).toHaveLength(l.vorher);
    l.stopp();
    eigeneAenderung('materials');
    await vi.advanceTimersByTimeAsync(BUENDELN_MS * 4);
    expect(l.abrufe).toHaveLength(l.vorher);
  });
});

describe('Jeder geglückte eigene Schreibweg meldet seine Tabelle', () => {
  /** Ein Client, dessen Schreibketten gelingen (oder mit `fehler` scheitern). */
  function schreibClient(fehler: { message: string; code?: string } | null = null) {
    const fertig = { data: { id: 'neu' }, error: fehler, count: fehler ? null : 1 };
    const kette: Record<string, unknown> = {};
    for (const m of ['insert', 'select', 'update', 'delete', 'eq', 'upsert']) kette[m] = () => kette;
    kette.single = async () => fertig;
    kette.abortSignal = async () => fertig;
    kette.then = (aufl: (w: unknown) => unknown) => Promise.resolve(fertig).then(aufl);
    return { from: () => kette } as unknown as SupabaseClient;
  }
  function zaehler(tabelle: string) {
    const z = { n: 0 };
    const ab = beiEigenerAenderung(tabelle, () => { z.n += 1; });
    return { z, ab };
  }

  it('anlegen, anlegenMitKennung, aendern, loeschen', async () => {
    const { z, ab } = zaehler('materials');
    const c = schreibClient();
    await anlegen('materials', 'perl', { name: 'Rohr' }, c);
    await anlegenMitKennung('materials', 'perl', 'k1', { name: 'Rohr' }, c);
    await aendern('materials', 'k1', { name: 'Bogen' }, c);
    await loeschen('materials', 'k1', c);
    expect(z.n).toBe(4);
    ab();
  });

  it('gleich geblieben: ein gescheiterter Schreibvorgang meldet nichts', async () => {
    const { z, ab } = zaehler('materials');
    await expect(anlegen('materials', 'perl', { name: 'Rohr' }, schreibClient({ message: 'nein' }))).rejects.toThrow('nein');
    expect(z.n).toBe(0);
    ab();
  });

  it('das Ausgangsfach: angekommen meldet, abgelehnt nicht', async () => {
    const { z, ab } = zaehler('time_entries');
    const sendung = { folge: 1, zeile: 'z1', tabelle: 'time_entries', art: 'anlegen', daten: {}, versuche: 0, angelegt: 0 } as Sendung;
    expect((await supabaseSender(schreibClient())(sendung)).art).toBe('ok');
    expect(z.n).toBe(1);
    expect((await supabaseSender(schreibClient({ message: 'Regel', code: '42501' }))(sendung)).art).toBe('abgelehnt');
    expect(z.n).toBe(1);
    ab();
  });
});
