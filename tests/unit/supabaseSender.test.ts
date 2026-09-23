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
