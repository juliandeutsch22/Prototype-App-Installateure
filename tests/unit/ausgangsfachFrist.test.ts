import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { supabaseSender, sendefrist, SENDEFRIST_MS } from '@/lib/sync/supabaseSender';
import { nachsenden, type Lager, type Sendung, type Vormerkung } from '@/lib/sync/ausgangsfach';

/**
 * Ein Vorgang, der stillsteht, hält nicht das ganze Ausgangsfach auf
 * (09.11.2026).
 *
 * Das Fach sendet der Reihe nach unter einer Sperre. Schreibzugriffe hatten
 * keine Frist; blieb einer auf einer halb toten Verbindung hängen, wartete
 * das Fach, bis der Browser aufgab — und nichts dahinter ging mehr hinaus.
 *
 * Geprüft mit der ECHTEN Bibliothek (supabase-js mit postgrest-js und
 * storage-js): nur so steht fest, dass das Abbruchsignal bis in `fetch`
 * reicht. Das Netz antwortet hier nie, hört aber auf das Signal — wie ein
 * Browser auf einer Verbindung, die nichts mehr liefert.
 */

/** Jede Anfrage, die hinausging: Adresse, Methode, Signal. */
let anfragen: { url: string; methode: string; signal?: AbortSignal | null }[] = [];
/** Antwortet das Netz (201), oder steht es still? */
let netzSteht = true;

const netz = async (eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
  anfragen.push({ url, methode: init?.method ?? 'GET', signal: init?.signal });
  if (!netzSteht) return new Response(JSON.stringify({}), { status: 201, headers: { 'content-type': 'application/json' } });
  return new Promise<Response>((_, ab) => {
    init?.signal?.addEventListener('abort', () => ab(new DOMException('The operation was aborted.', 'AbortError')));
  });
};

function echterClient() {
  return createClient('https://projekt.example.test', 'anon-schluessel', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: netz },
  });
}

function lagerMit(vormerkungen: Vormerkung[]): Lager & { zeilen: () => Vormerkung[] } {
  let zeilen = [...vormerkungen];
  return {
    zeilen: () => zeilen,
    async alle() { return [...zeilen]; },
    async ablegen(v) { const folge = zeilen.length + 1; zeilen.push({ ...v, folge }); return folge; },
    async entfernen(folge) { zeilen = zeilen.filter((x) => x.folge !== folge); },
    async ersetzen(v) { zeilen = zeilen.map((x) => (x.folge === v.folge ? v : x)); },
  };
}

const anlegen = (folge: number, zeile: string): Vormerkung => ({
  folge, zeile, tabelle: 'time_entries', art: 'anlegen', daten: { date: '2026-11-09' }, versuche: 0, angelegt: 0,
});

const VORGAENGE: Record<string, Sendung> = {
  anlegen: anlegen(1, 'z1'),
  aendern: { zeile: 'z1', tabelle: 'time_entries', art: 'aendern', daten: { comment: 'x' }, versuche: 0, angelegt: 0 },
  aufruf: {
    zeile: 's1', tabelle: 'work_sheets', art: 'aufruf', versuche: 0, angelegt: 0,
    daten: { funktion: 'schein_speichern', parameter: { p_id: 's1' } },
  },
  hochladen: {
    zeile: 'scheine/perl/s1/a.jpg', tabelle: 'scheinfotos', art: 'hochladen', versuche: 0, angelegt: 0,
    daten: { eimer: 'scheinfotos', pfad: 'scheine/perl/s1/a.jpg', inhalt: new TextEncoder().encode('bild').buffer, inhaltsart: 'image/jpeg' },
  },
  entfernen: {
    zeile: 'scheine/perl/s1/a.jpg', tabelle: 'scheinfotos', art: 'entfernen', versuche: 0, angelegt: 0,
    daten: { eimer: 'scheinfotos', pfade: ['scheine/perl/s1/a.jpg'] },
  },
};

afterEach(() => {
  vi.useRealTimers();
  anfragen = [];
  netzSteht = true;
});

describe('Das Ausgangsfach mit Frist', () => {
  it('ein Vorgang, der nie antwortet, blockiert das Nachsenden nach Ablauf der Frist nicht mehr', async () => {
    vi.useFakeTimers();
    const lager = lagerMit([anlegen(1, 'z1'), anlegen(2, 'z2')]);
    let bericht: unknown = 'läuft';
    void nachsenden(lager, supabaseSender(echterClient())).then((b) => { bericht = b; });

    await vi.advanceTimersByTimeAsync(SENDEFRIST_MS - 5_000);
    expect(bericht).toBe('läuft');
    await vi.advanceTimersByTimeAsync(10_000);
    // Liegen geblieben, nicht gezählt, nicht verworfen — und der Zweite wurde nicht vorgezogen.
    expect(bericht).toEqual({ gesendet: 0, abgelehnt: 0, offen: 2 });
    expect(lager.zeilen().map((v) => [v.zeile, v.versuche])).toEqual([['z1', 0], ['z2', 0]]);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0].signal?.aborted).toBe(true);

    // Kommt das Netz wieder, geht beides in der Reihenfolge der Entstehung hinaus.
    netzSteht = false;
    anfragen = [];
    expect(await nachsenden(lager, supabaseSender(echterClient()))).toEqual({ gesendet: 2, abgelehnt: 0, offen: 0 });
    expect(anfragen.map((a) => new URL(a.url).pathname)).toEqual(['/rest/v1/time_entries', '/rest/v1/time_entries']);
  });

  it.each(Object.keys(VORGAENGE))('der Abbruch erreicht das Netz und gilt als fehlendes Netz: %s', async (art) => {
    vi.useFakeTimers();
    let ergebnis: unknown = 'läuft';
    void supabaseSender(echterClient())(VORGAENGE[art]).then((e) => { ergebnis = e; });

    await vi.advanceTimersByTimeAsync(sendefrist(VORGAENGE[art]) + 1);
    expect(ergebnis).toEqual({ art: 'kein-netz' });
    expect(anfragen.length).toBeGreaterThan(0);
    for (const a of anfragen) expect(a.signal?.aborted, a.url).toBe(true);
  });

  it('ein großes Foto bekommt Zeit für seinen Inhalt — abgebrochen wird erst, wenn auch die um ist', async () => {
    vi.useFakeTimers();
    const foto = { ...VORGAENGE.hochladen, daten: { ...VORGAENGE.hochladen.daten, inhalt: new ArrayBuffer(800_000) } };
    // 64 kbit/s: 800 kB brauchen 100 s, dazu die Grundfrist.
    expect(sendefrist(foto)).toBe(SENDEFRIST_MS + 100_000);
    let ergebnis: unknown = 'läuft';
    void supabaseSender(echterClient())(foto).then((e) => { ergebnis = e; });

    await vi.advanceTimersByTimeAsync(SENDEFRIST_MS + 90_000);
    expect(ergebnis).toBe('läuft');
    await vi.advanceTimersByTimeAsync(11_000);
    expect(ergebnis).toEqual({ art: 'kein-netz' });
  });

  it('gleich geblieben: eine Antwort vor der Frist zählt, und keine Uhr bleibt zurück', async () => {
    vi.useFakeTimers();
    netzSteht = false;
    expect(await supabaseSender(echterClient())(VORGAENGE.anlegen)).toEqual({ art: 'ok' });
    expect(anfragen[0].signal?.aborted ?? false).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
