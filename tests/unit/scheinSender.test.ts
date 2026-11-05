/**
 * Der Sender für den Handwerksschein ohne Netz (E49): Aufrufe, Hochladen,
 * Entfernen.
 *
 * Wie bei den Zeilen hängt alles an der Einordnung. Drei Dinge sind neu und
 * werden hier festgehalten:
 *   - nur Aufrufe und Eimer aus der festen Liste gehen hinaus;
 *   - ein zweites Zustellen DERSELBEN Unterschrift ist kein Verlust;
 *   - der Speicher spricht HTTP statt Datenbankcodes.
 * Gegenprobe: mit dem Sender von `main` gehen alle drei Arten als Zeile an
 * `from(...).update` und werden falsch eingeordnet.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSender, AUFRUFE_OHNE_EMPFANG, EIMER_OHNE_EMPFANG } from '@/lib/sync/supabaseSender';
import type { Sendung } from '@/lib/sync/ausgangsfach';

type Fehler = { code?: string; message?: string } | null;

function client({
  rpc = { error: null },
  stand = { data: null, error: null },
  upload = { error: null },
  remove = { error: null },
}: {
  rpc?: { error: Fehler; status?: number };
  stand?: { data: unknown; error: Fehler };
  upload?: { error: unknown };
  remove?: { error: unknown };
}) {
  const aufrufe = { rpc: vi.fn(async () => rpc), upload: vi.fn(async () => upload), remove: vi.fn(async () => remove) };
  const c = {
    rpc: aufrufe.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => stand }) }) }),
    storage: { from: () => ({ upload: aufrufe.upload, remove: aufrufe.remove }) },
  } as unknown as SupabaseClient;
  return { c, aufrufe };
}

const monteur = { name: 'Max', bild: 'x', geraetZeit: 1_778_000_000_000 };
const kunde = { name: 'Frau Keller', bild: 'y', geraetZeit: 1_778_000_000_000 };
const aufruf = (funktion: string, parameter: Record<string, unknown> = { p_id: 's1' }): Sendung => ({
  tabelle: 'work_sheets', art: 'aufruf', zeile: 's1', daten: { funktion, parameter }, versuche: 0, angelegt: 0,
});
const unterschreiben = aufruf('schein_unterschreiben', { p_id: 's1', p_monteur: monteur, p_kunde: kunde });
const hochladen: Sendung = {
  tabelle: 'scheinfotos', art: 'hochladen', zeile: 'scheine/perl/s1/a.jpg', versuche: 0, angelegt: 0,
  daten: { eimer: 'scheinfotos', pfad: 'scheine/perl/s1/a.jpg', inhalt: new TextEncoder().encode('bild').buffer, inhaltsart: 'image/jpeg', schein: 's1' },
};
const entfernen: Sendung = {
  tabelle: 'scheinfotos', art: 'entfernen', zeile: 'scheine/perl/s1/a.jpg', versuche: 0, angelegt: 0,
  daten: { eimer: 'scheinfotos', pfade: ['scheine/perl/s1/a.jpg'] },
};

describe('Aufrufe', () => {
  it('nur die beiden Funktionen des Scheins gehen hinaus', async () => {
    expect([...AUFRUFE_OHNE_EMPFANG]).toEqual(['schein_speichern', 'schein_unterschreiben']);
    const { c, aufrufe } = client({});
    expect(await supabaseSender(c)(aufruf('schein_speichern'))).toEqual({ art: 'ok' });
    expect(aufrufe.rpc).toHaveBeenCalledWith('schein_speichern', { p_id: 's1' });

    const fremd = await supabaseSender(c)(aufruf('lager_buchen'));
    expect(fremd.art).toBe('abgelehnt');
    expect(aufrufe.rpc).toHaveBeenCalledTimes(1);
  });

  it('ordnet Fehler wie bei den Zeilen ein', async () => {
    const art = async (rpc: { error: Fehler; status?: number }) =>
      (await supabaseSender(client({ rpc }).c)(aufruf('schein_speichern'))).art;
    expect(await art({ error: { message: 'TypeError: Failed to fetch' } })).toBe('kein-netz');
    expect(await art({ error: { code: '42501', message: 'x' }, status: 401 })).toBe('kein-netz');
    expect(await art({ error: { code: '42501', message: 'Ein Schein im Zustand Unterschrieben …' }, status: 403 })).toBe('abgelehnt');
    expect(await art({ error: { code: 'PGRST000', message: 'x' }, status: 503 })).toBe('unklar');
  });

  it('dieselbe Unterschrift ein zweites Mal: angekommen, nicht abgelehnt', async () => {
    const { c } = client({
      rpc: { error: { code: '42501', message: 'lässt sich nicht mehr ändern' }, status: 403 },
      stand: {
        data: { status: 'Unterschrieben', monteur_name: 'Max', monteur_zeit: monteur.geraetZeit, kunde_name: 'Frau Keller', kunde_zeit: kunde.geraetZeit },
        error: null,
      },
    });
    expect(await supabaseSender(c)(unterschreiben)).toEqual({ art: 'ok' });
  });

  it('eine andere Unterschrift auf dem eingefrorenen Schein: abgelehnt', async () => {
    const { c } = client({
      rpc: { error: { code: '42501', message: 'lässt sich nicht mehr ändern' }, status: 403 },
      stand: {
        data: { status: 'Unterschrieben', monteur_name: 'Max', monteur_zeit: monteur.geraetZeit, kunde_name: 'Herr Anders', kunde_zeit: 1 },
        error: null,
      },
    });
    expect((await supabaseSender(c)(unterschreiben)).art).toBe('abgelehnt');
  });

  it('lässt sich das nicht feststellen, wird nichts verworfen', async () => {
    const { c } = client({
      rpc: { error: { code: '42501', message: 'lässt sich nicht mehr ändern' }, status: 403 },
      stand: { data: null, error: { message: 'TypeError: Failed to fetch' } },
    });
    expect((await supabaseSender(c)(unterschreiben)).art).toBe('unklar');
  });
});

describe('Dateien', () => {
  it('nur in den Eimer der Scheinfotos', async () => {
    expect([...EIMER_OHNE_EMPFANG]).toEqual(['scheinfotos']);
    const { c, aufrufe } = client({});
    const fremd = await supabaseSender(c)({ ...hochladen, daten: { ...hochladen.daten, eimer: 'ausleitung' } });
    expect(fremd.art).toBe('abgelehnt');
    expect(aufrufe.upload).not.toHaveBeenCalled();
  });

  it('lädt unter dem Pfad hoch, wiederholbar (`upsert`)', async () => {
    const { c, aufrufe } = client({});
    expect(await supabaseSender(c)(hochladen)).toEqual({ art: 'ok' });
    expect(aufrufe.upload).toHaveBeenCalledWith('scheine/perl/s1/a.jpg', expect.any(Blob), { contentType: 'image/jpeg', upsert: true });
    // Aus den abgelegten Bytes wird wieder die Datei, mit ihrer Art.
    const datei = (aufrufe.upload.mock.calls[0] as unknown[])[1] as Blob;
    expect(datei.type).toBe('image/jpeg');
    expect(await datei.text()).toBe('bild');
  });

  it('ordnet die Antworten des Speichers ein', async () => {
    const art = async (error: unknown) => (await supabaseSender(client({ upload: { error } }).c)(hochladen)).art;
    expect(await art({ message: 'fetch failed' })).toBe('kein-netz');
    expect(await art({ message: 'jwt expired', status: 400, statusCode: '403' })).toBe('kein-netz');
    expect(await art({ message: 'x', status: 401 })).toBe('kein-netz');
    expect(await art({ message: 'new row violates row-level security policy', status: 400, statusCode: '403' })).toBe('abgelehnt');
    expect(await art({ message: 'Payload too large', status: 413 })).toBe('abgelehnt');
    expect(await art({ message: 'Bad gateway', status: 502 })).toBe('unklar');
    expect(await art({ message: 'irgendwas' })).toBe('unklar');
  });

  it('ein Bild, das sich nicht entfernen lässt, ist kein Verlust — ohne Netz bleibt es liegen', async () => {
    expect((await supabaseSender(client({ remove: { error: { message: 'x', status: 400, statusCode: '403' } } }).c)(entfernen)).art).toBe('ok');
    expect((await supabaseSender(client({ remove: { error: { message: 'Failed to fetch' } } }).c)(entfernen)).art).toBe('kein-netz');
  });
});
