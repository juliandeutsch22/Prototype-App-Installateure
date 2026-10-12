/**
 * Audit: Verlust einer Serverantwort darf eine später bestätigte Änderung
 * nicht durch Wiederholen der ursprünglichen Offline-Anlage überschreiben.
 * Echte PostgreSQL-Gegenprobe, ausschließlich im isolierten CI-Teststack.
 *
 * `it.fails` markiert eine NOCH NICHT erfüllte Sollanforderung.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import type { Sendung } from '@/lib/sync/ausgangsfach';

const BETRIEB = 'audit-offline-retry-1012';
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'offline-monteur');
}, 180_000);

describe('Audit: wiederholte Geräte-Anlage', () => {
  it('CHARAKTERISIERUNG: nachweislich geschriebene Korrektur wird durch denselben alten Insert wieder ersetzt', async () => {
    const id = crypto.randomUUID();
    const sender = supabaseSender(monteur.client);
    const alt: Sendung = {
      zeile: id, tabelle: 'time_entries', art: 'anlegen',
      daten: {
        company_id: BETRIEB, user_id: monteur.uid, date: '2026-10-12',
        status: 'Anwesend', start_time: '08:00', end_time: '09:00',
        break_duration: 0, comment: 'Vorheriger Text',
      },
      versuche: 0, angelegt: Date.now(),
    };
    expect(await sender(alt)).toMatchObject({ art: 'ok' });
    const { data: angelegt, error: fehlerAngelegt } = await monteur.client
      .from('time_entries').select('comment').eq('id', id).single();
    expect(fehlerAngelegt).toBeNull();
    expect(angelegt?.comment).toBe('Vorheriger Text');

    const { error: fehlerAendern, count } = await monteur.client
      .from('time_entries').update({ comment: 'Spätere bestätigte Änderung' }, { count: 'exact' }).eq('id', id);
    expect(fehlerAendern).toBeNull();
    expect(count).toBe(1);
    const { data: korrigiert, error: fehlerKorrigiert } = await monteur.client
      .from('time_entries').select('comment').eq('id', id).single();
    expect(fehlerKorrigiert).toBeNull();
    expect(korrigiert?.comment).toBe('Spätere bestätigte Änderung');

    expect(await sender(alt)).toMatchObject({ art: 'ok' });
    const { data: nachRetry, error: fehlerRetry } = await monteur.client
      .from('time_entries').select('comment').eq('id', id).single();
    expect(fehlerRetry).toBeNull();
    // Charakterisiert ausschließlich das bestehende Fehlverhalten, KEINE Freigabe.
    expect(nachRetry?.comment).toBe('Vorheriger Text');
  });

  it.fails('überschreibt mit identischer alter Anlage keine neuere Serveränderung', async () => {
    const id = crypto.randomUUID();
    const sender = supabaseSender(monteur.client);
    const anlegen: Sendung = {
      zeile: id,
      tabelle: 'time_entries',
      art: 'anlegen',
      daten: {
        company_id: BETRIEB, user_id: monteur.uid, date: '2026-10-12',
        status: 'Anwesend', start_time: '08:00', end_time: '09:00',
        break_duration: 0, comment: 'Ursprünglicher Eintrag',
      },
      versuche: 0,
      angelegt: Date.now(),
    };
    const erster = await sender(anlegen);
    expect(erster.art).toBe('ok');

    const { error: updateFehler } = await monteur.client.from('time_entries')
      .update({ comment: 'Bestätigte spätere Korrektur' }).eq('id', id);
    expect(updateFehler).toBeNull();

    // Der Server hat die erste Anlage bereits gespeichert, nur deren Antwort
    // ging verloren. Das Gerät sendet dieselbe Anlage später nochmals.
    await sender(anlegen);

    const { data, error } = await monteur.client.from('time_entries')
      .select('comment').eq('id', id).single();
    expect(error).toBeNull();
    // Soll: spätere bestätigte Änderung bleibt unverändert.
    expect(data?.comment).toBe('Bestätigte spätere Korrektur');
  });
});
