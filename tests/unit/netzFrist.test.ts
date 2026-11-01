import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { PostgrestClient } from '@supabase/postgrest-js';
import { FRISTEN, LESENDE_FUNKTIONEN, Stillstand, fetchMitFrist, zugriffsart } from '@/lib/netzFrist';
import { grundAus } from '@/lib/fehlerGrund';

/*
  „Lädt sehr lange bzw. gar nicht mehr, scheinbar willkürlich beim Wechseln
  der Seiten“ (01.11.2026). Hier steht mit simulierter Uhr fest, dass ein
  stillstehender Lesezugriff endet, ein fließender nie — und dass Schreiben
  nie abgebrochen wird.
*/

const BASIS = 'https://projekt.supabase.co';

/** Ein Netz, das nie antwortet — wie eine halb tote Verbindung. Hört aber auf `signal`. */
function totesNetz() {
  const aufrufe: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn((eingabe: RequestInfo | URL, init?: RequestInit) => {
    aufrufe.push({ url: String(eingabe), init });
    return new Promise<Response>((_, ab) => {
      init?.signal?.addEventListener('abort', () => ab(init.signal!.reason ?? new DOMException('aborted', 'AbortError')));
    });
  });
  return { fn: fn as unknown as typeof fetch, aufrufe };
}

/** Eine Antwort, deren Rumpf Stück für Stück kommt — `abstand` ms zwischen den Stücken, `null` = bleibt danach stehen. */
function tropfend(stuecke: string[], abstand: number, danachStehen = false) {
  const kodierer = new TextEncoder();
  let i = 0;
  const strom = new ReadableStream<Uint8Array>({
    pull(ziel) {
      return new Promise<void>((fertig) => {
        if (i >= stuecke.length) {
          if (danachStehen) return; // nie wieder etwas
          ziel.close();
          return fertig();
        }
        setTimeout(() => {
          ziel.enqueue(kodierer.encode(stuecke[i]));
          i += 1;
          fertig();
        }, i === 0 ? 0 : abstand);
      });
    },
  });
  return new Response(strom, { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('welche Zugriffe eine Frist bekommen', () => {
  it('Lesen aus Datenbank und Ablage, Erneuern und Anmelden — mit der passenden Frist', () => {
    expect(zugriffsart(`${BASIS}/rest/v1/projects?select=*`, 'GET')).toBe('lesen');
    expect(zugriffsart(`${BASIS}/rest/v1/projects?select=*`, 'HEAD')).toBe('lesen');
    expect(zugriffsart(`${BASIS}/storage/v1/object/belege/a.pdf`, 'GET')).toBe('lesen');
    expect(zugriffsart(`${BASIS}/rest/v1/rpc/baustellen_stunden`, 'POST')).toBe('lesen');
    expect(zugriffsart(`${BASIS}/auth/v1/token?grant_type=refresh_token`, 'POST')).toBe('erneuern');
    expect(zugriffsart(`${BASIS}/auth/v1/token?grant_type=password`, 'POST')).toBe('anmelden');
    expect(zugriffsart(`${BASIS}/auth/v1/user`, 'GET')).toBe('authLesen');
  });

  it('gleich geblieben: alles, was schreiben kann, bekommt keine', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(zugriffsart(`${BASIS}/rest/v1/time_entries`, m), m).toBeNull();
      expect(zugriffsart(`${BASIS}/storage/v1/object/belege/a.pdf`, m), m).toBeNull();
    }
    expect(zugriffsart(`${BASIS}/rest/v1/rpc/rechnung_ausstellen`, 'POST')).toBeNull();
    expect(zugriffsart(`${BASIS}/rest/v1/rpc/verkaufspreise_vorschlagen`, 'POST')).toBeNull();
    expect(zugriffsart(`${BASIS}/functions/v1/mitarbeiter-anlegen`, 'POST')).toBeNull();
    expect(zugriffsart(`${BASIS}/auth/v1/user`, 'PUT')).toBeNull();
    expect(zugriffsart(`${BASIS}/auth/v1/logout`, 'POST')).toBeNull();
    expect(zugriffsart('/assets/x.js', 'GET')).toBeNull();
  });

  it('die Erneuerung bleibt im Wiederverwendungsfenster des Anmeldedienstes (10 s)', () => {
    // Zweiter Versuch: Frist plus 200 ms Pause von auth-js.
    expect(FRISTEN.erneuern.bisAntwort + 200).toBeLessThan(10_000);
  });
});

describe('Stillstand vor der Antwort', () => {
  it('ein Lesezugriff endet nach der Frist als Netzfehler — nicht früher', async () => {
    const netz = totesNetz();
    let ergebnis: unknown = 'läuft';
    fetchMitFrist(netz.fn)(`${BASIS}/rest/v1/projects`, { method: 'GET' }).then(
      () => { ergebnis = 'geantwortet'; },
      (e) => { ergebnis = e; },
    );
    await vi.advanceTimersByTimeAsync(FRISTEN.lesen.bisAntwort - 100);
    expect(ergebnis).toBe('läuft');
    await vi.advanceTimersByTimeAsync(200);
    expect(ergebnis).toBeInstanceOf(Stillstand);
    expect((ergebnis as Error).name).toBe('TypeError');
    // Die Meldung, die der Benutzer dazu sieht.
    expect(grundAus(ergebnis, 'Die Liste ließ sich nicht laden.')).toMatch(/Keine Verbindung zum Server/);
  });

  it('die Erneuerung der Sitzung endet nach 8 s', async () => {
    const netz = totesNetz();
    const p = fetchMitFrist(netz.fn)(`${BASIS}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', body: '{}' });
    const pruefung = expect(p).rejects.toBeInstanceOf(Stillstand);
    await vi.advanceTimersByTimeAsync(FRISTEN.erneuern.bisAntwort + 10);
    await pruefung;
  });

  it('Gegenprobe: ohne Frist wartet derselbe Zugriff unbegrenzt', async () => {
    const netz = totesNetz();
    let fertig = false;
    netz.fn(`${BASIS}/rest/v1/projects`, {}).finally(() => { fertig = true; });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fertig).toBe(false);
  });

  it('gleich geblieben: ein Schreibvorgang wird nie abgebrochen und bekommt das Signal des Aufrufers', async () => {
    const netz = totesNetz();
    const eigenes = new AbortController();
    let fertig = false;
    fetchMitFrist(netz.fn)(`${BASIS}/rest/v1/time_entries`, { method: 'POST', body: '{}', signal: eigenes.signal })
      .finally(() => { fertig = true; })
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fertig).toBe(false);
    expect(netz.aufrufe[0].init?.signal).toBe(eigenes.signal);
  });

  it('bricht der Aufrufer ab, bleibt es sein AbortError — keine Wiederholung als Netzfehler', async () => {
    const netz = totesNetz();
    const eigenes = new AbortController();
    const p = fetchMitFrist(netz.fn)(`${BASIS}/rest/v1/projects`, { signal: eigenes.signal });
    const pruefung = expect(p).rejects.toMatchObject({ name: 'AbortError' });
    eigenes.abort();
    await vi.advanceTimersByTimeAsync(1);
    await pruefung;
  });
});

describe('Stillstand mitten in der Antwort', () => {
  it('eine Antwort, die stehen bleibt, endet nach der Frist', async () => {
    const basis = vi.fn(async () => tropfend(['[{"id":1}'], 0, true)) as unknown as typeof fetch;
    const antwort = await fetchMitFrist(basis)(`${BASIS}/rest/v1/projects`);
    let ergebnis: unknown = 'läuft';
    antwort.text().then((t) => { ergebnis = t; }, (e) => { ergebnis = e; });
    await vi.advanceTimersByTimeAsync(FRISTEN.lesen.stillstand - 100);
    expect(ergebnis).toBe('läuft');
    await vi.advanceTimersByTimeAsync(200);
    expect(ergebnis).toBeInstanceOf(Stillstand);
  });

  it('eine große Antwort, die stetig fließt, läuft beliebig lange — die Frist gilt dem Stillstand, nicht der Dauer', async () => {
    // 40 Stücke im Abstand von 10 s: über sechs Minuten, nie 15 s Stillstand.
    const stuecke = ['[', ...Array.from({ length: 38 }, (_, i) => `{"id":${i}},`), '{"id":38}]'];
    const basis = vi.fn(async () => tropfend(stuecke, 10_000)) as unknown as typeof fetch;
    const antwort = await fetchMitFrist(basis)(`${BASIS}/rest/v1/time_entries?select=*`);
    let text: string | null = null;
    antwort.text().then((t) => { text = t; });
    await vi.advanceTimersByTimeAsync(41 * 10_000);
    expect(text).not.toBeNull();
    expect(JSON.parse(text!)).toHaveLength(39);
  });

  it('Kopf und Zustand der Antwort bleiben, wie der Server sie geschickt hat', async () => {
    const basis = vi.fn(async () => new Response('[]', { status: 206, statusText: 'Partial Content', headers: { 'content-range': '0-0/7' } })) as unknown as typeof fetch;
    const antwort = await fetchMitFrist(basis)(`${BASIS}/rest/v1/projects`);
    expect(antwort.status).toBe(206);
    expect(antwort.statusText).toBe('Partial Content');
    expect(antwort.headers.get('content-range')).toBe('0-0/7');
    expect(await antwort.text()).toBe('[]');
  });
});

describe('mit der echten Bibliothek', () => {
  it('ein stillstehender Lesezugriff wird über eine frische Verbindung wiederholt und gelingt', async () => {
    let versuch = 0;
    const basis = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      versuch += 1;
      if (versuch === 1) {
        return new Promise<Response>((_, ab) => init?.signal?.addEventListener('abort', () => ab(new DOMException('aborted', 'AbortError'))));
      }
      return Promise.resolve(new Response('[{"id":"a"}]', { status: 200, headers: { 'content-type': 'application/json' } }));
    }) as unknown as typeof fetch;
    const db = new PostgrestClient(`${BASIS}/rest/v1`, { fetch: fetchMitFrist(basis) });
    let ergebnis: { data: unknown; error: unknown } | null = null;
    db.from('projects').select('*').then((r) => { ergebnis = r; });
    await vi.advanceTimersByTimeAsync(FRISTEN.lesen.bisAntwort + 5_000);
    expect(versuch).toBe(2);
    expect(ergebnis).toMatchObject({ data: [{ id: 'a' }], error: null });
  });

  it('bleibt es tot, kommt ein Fehler mit „Keine Verbindung“ statt ewigem Laden', async () => {
    const netz = totesNetz();
    const db = new PostgrestClient(`${BASIS}/rest/v1`, { fetch: fetchMitFrist(netz.fn) });
    let ergebnis: { data: unknown; error: { message: string } | null } | null = null;
    db.from('projects').select('*').then((r) => { ergebnis = r as typeof ergebnis; });
    await vi.advanceTimersByTimeAsync(4 * FRISTEN.lesen.bisAntwort + 10_000);
    expect(ergebnis).not.toBeNull();
    expect(ergebnis!.data).toBeNull();
    expect(grundAus(new Error(ergebnis!.error!.message), 'Die Liste ließ sich nicht laden.')).toMatch(/Keine Verbindung zum Server/);
  });
});

describe('im Client verdrahtet', () => {
  it('beide Supabase-Clients gehen über das Fetch mit Frist', () => {
    const quelle = readFileSync('src/lib/supabase.ts', 'utf8');
    expect(quelle.match(/global: \{ fetch: fetchMitFrist\(\) \}/g)).toHaveLength(2);
  });

  it('lesende Funktionen sind eine feste, sortierte Liste', () => {
    const namen = [...LESENDE_FUNKTIONEN];
    expect(namen).toEqual([...namen].sort());
    expect(namen.length).toBeGreaterThan(0);
  });
});
