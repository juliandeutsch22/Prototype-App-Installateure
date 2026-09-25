import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import type { Sendung } from '@/lib/sync/ausgangsfach';

/**
 * Die Einordnung der Antworten — die eine Entscheidung, an der das
 * Ausgangsfach hängt.
 *
 * GEFUNDEN IM BETRIEB: die Buchhaltung erfasste Zeit für einen Monteur, die
 * App meldete „gespeichert, wird automatisch gesendet", und nichts kam an.
 * Der Server hatte mit PGRST204 geantwortet („Spalte gibt es nicht") — und
 * das stand unter „unklar", also: vormerken, wiederholen, später still
 * aufgeben. Eine Antwort, die sich durch Wiederholen nicht ändert, muss
 * sofort als Ablehnung zurück in die Maske.
 */

/** Ein Client, der auf jeden Schreibversuch mit `antwort` reagiert. */
function clientMit(antwort: { error: { code?: string; message?: string } | null } | Error) {
  const ergebnis = async () => {
    if (antwort instanceof Error) throw antwort;
    return antwort;
  };
  const tabelle = {
    upsert: ergebnis,
    update: () => ({ eq: ergebnis }),
  };
  return { from: () => tabelle } as unknown as SupabaseClient;
}

const sendung: Sendung = {
  folge: 1,
  zeile: 'z1',
  tabelle: 'time_entries',
  art: 'anlegen',
  daten: { date: '2026-09-23' },
  versuche: 0,
  angelegt: 0,
} as Sendung;

async function einordnen(error: { code?: string; message?: string } | null) {
  return (await supabaseSender(clientMit({ error }))(sendung)).art;
}

describe('Der Sender ordnet die Antworten ein', () => {
  it('nimmt eine Bestätigung als Bestätigung', async () => {
    expect(await einordnen(null)).toBe('ok');
  });

  it('weist eine unbekannte Spalte sofort ab (PGRST204)', async () => {
    expect(
      await einordnen({
        code: 'PGRST204',
        message: "Could not find the 'last_edited_at' column of 'time_entries' in the schema cache",
      }),
    ).toBe('abgelehnt');
  });

  it('weist auch die anderen Anfrage- und Schemafehler ab', async () => {
    for (const code of ['PGRST100', 'PGRST102', 'PGRST200', 'PGRST205', '42703', '42P01']) {
      expect(await einordnen({ code, message: 'x' }), code).toBe('abgelehnt');
    }
  });

  it('weist Zeilenschutz und Tabellenregeln ab, wie bisher', async () => {
    for (const code of ['42501', '23505', '23503', '23514', '22P02']) {
      expect(await einordnen({ code, message: 'x' }), code).toBe('abgelehnt');
    }
  });

  it('hält Fehler, die sich von selbst geben, für unklar — nicht für endgültig', async () => {
    // Verbindung zur Datenbank weg, Schemacache lädt noch, Anmeldung abgelaufen.
    for (const code of ['PGRST000', 'PGRST002', 'PGRST301', '57014', '53300']) {
      expect(await einordnen({ code, message: 'x' }), code).toBe('unklar');
    }
  });

  it('erkennt fehlendes Netz', async () => {
    expect(await einordnen({ message: 'TypeError: Failed to fetch' })).toBe('kein-netz');
    const wirft = await supabaseSender(clientMit(new Error('NetworkError when attempting to fetch')))(sendung);
    expect(wirft.art).toBe('kein-netz');
  });
});

/** Ein Client mit voller Antwort — Fehler, HTTP-Status und Trefferzahl. */
function clientMitAntwort(antwort: {
  error: { code?: string; message?: string } | null;
  status?: number;
  count?: number | null;
}) {
  const ergebnis = async () => antwort;
  const tabelle = {
    upsert: ergebnis,
    update: () => ({ eq: ergebnis }),
  };
  return { from: () => tabelle } as unknown as SupabaseClient;
}

describe('Prüflauf 25.09.2026', () => {
  it('P1-05: wertet eine Abweisung OHNE Anmeldung (401) nicht als endgültig', async () => {
    // PostgREST antwortet einem Aufruf ohne Sitzung mit 401 und 42501. Mit
    // der Sitzung des Besitzers geht derselbe Vorgang durch.
    const erg = await supabaseSender(
      clientMitAntwort({ error: { code: '42501', message: 'permission denied' }, status: 401 }),
    )(sendung);
    expect(erg.art).toBe('kein-netz');
  });

  it('P1-05: der abgewiesene Zeilenschutz MIT Anmeldung (403) bleibt endgültig', async () => {
    const erg = await supabaseSender(
      clientMitAntwort({ error: { code: '42501', message: 'rls' }, status: 403 }),
    )(sendung);
    expect(erg.art).toBe('abgelehnt');
  });

  it('P1-22: ein „Ändern" ohne getroffene Zeile ist abgelehnt, nicht gesendet', async () => {
    const aendern = { ...sendung, art: 'aendern' as const };
    const keine = await supabaseSender(clientMitAntwort({ error: null, count: 0 }))(aendern);
    expect(keine.art).toBe('abgelehnt');
    const eine = await supabaseSender(clientMitAntwort({ error: null, count: 1 }))(aendern);
    expect(eine.art).toBe('ok');
  });

  it('P1-22: fragt beim Ändern die Trefferzahl ab', async () => {
    const optionen: unknown[] = [];
    const client = {
      from: () => ({
        update: (_d: unknown, o: unknown) => {
          optionen.push(o);
          return { eq: async () => ({ error: null, count: 1 }) };
        },
      }),
    } as unknown as SupabaseClient;
    await supabaseSender(client)({ ...sendung, art: 'aendern' });
    expect(optionen).toEqual([{ count: 'exact' }]);
  });
});
