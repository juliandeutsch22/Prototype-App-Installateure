// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anlegenOhneEmpfang,
  ausgangsfachKonto,
  lagerEinreichen,
  nachsendenJetzt,
  offeneVormerkungen,
} from '@/lib/db/pg/ohneEmpfang';
import type { Lager, Vormerkung } from '@/lib/sync/ausgangsfach';

/**
 * Prüflauf 25.09.2026, P1-05: das Ausgangsfach und die Sitzung.
 *
 * Nachgesendet wird nur mit einer Sitzung, und nur, was deren Konto gehört
 * (oder aus der Zeit davor keinen Besitzer trägt). Ohne Sitzung ging der
 * Aufruf vorher als „anon" hinaus, der Zeilenschutz wies ihn ab — und das
 * Fach warf die Buchung als endgültig verloren weg.
 */

function lagerImKopf(): Lager & { inhalt: () => Vormerkung[] } {
  let zeilen: Vormerkung[] = [];
  let zaehler = 0;
  return {
    inhalt: () => [...zeilen].sort((a, b) => a.folge - b.folge),
    async alle() { return [...zeilen]; },
    async ablegen(v) { zaehler += 1; zeilen.push({ ...v, folge: zaehler }); return zaehler; },
    async entfernen(folge) { zeilen = zeilen.filter((x) => x.folge !== folge); },
    async ersetzen(v) { zeilen = zeilen.map((x) => (x.folge === v.folge ? v : x)); },
  };
}

/** Ein Client mit (oder ohne) Sitzung, der jeden Schreibversuch mitschreibt. */
function client(sitzungFuer: string | null, antwort: { error: unknown } = { error: null }) {
  const gesendet: string[] = [];
  const c = {
    auth: {
      getSession: async () => ({
        data: { session: sitzungFuer ? { user: { id: sitzungFuer } } : null },
        error: null,
      }),
    },
    from: (tabelle: string) => ({
      upsert: async () => {
        gesendet.push(tabelle);
        return antwort;
      },
      update: () => ({
        eq: async () => {
          gesendet.push(tabelle);
          return { ...antwort, count: 1 };
        },
      }),
    }),
  };
  return { c: c as unknown as SupabaseClient, gesendet };
}

const offline = () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
};
const online = () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
};

afterEach(() => {
  lagerEinreichen(null);
  ausgangsfachKonto(null);
  online();
});

describe('Ausgangsfach und Sitzung', () => {
  it('trägt beim Vormerken das angemeldete Konto ein — auch ohne gültige Sitzung', async () => {
    // Nach einer Stunde offline ist die Zugangsmarke abgelaufen; angemeldet
    // ist der Monteur trotzdem, und seine Buchung gehört ihm.
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    ausgangsfachKonto('max');
    offline();
    const { c } = client(null);
    const { stand } = await anlegenOhneEmpfang('time_entries', 'perl', { date: '2026-09-25' }, c);
    expect(stand).toBe('queued');
    expect(fach.inhalt()[0].uid).toBe('max');
  });

  it('sendet ohne Sitzung nichts nach — die Buchung bleibt liegen', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    ausgangsfachKonto('max');
    offline();
    await anlegenOhneEmpfang('time_entries', 'perl', { date: '2026-09-25' }, client(null).c);
    online();

    const ohne = client(null);
    const bericht = await nachsendenJetzt(ohne.c);
    expect(ohne.gesendet).toEqual([]);
    expect(bericht.offen).toBe(1);
    expect(fach.inhalt()).toHaveLength(1);
  });

  it('sendet mit der Sitzung eines anderen Kontos nicht — erst mit der eigenen', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    ausgangsfachKonto('max');
    offline();
    await anlegenOhneEmpfang('time_entries', 'perl', { date: '2026-09-25' }, client(null).c);
    online();

    const kollegin = client('erna');
    await nachsendenJetzt(kollegin.c);
    expect(kollegin.gesendet).toEqual([]);
    expect(fach.inhalt()).toHaveLength(1);
    expect(await offeneVormerkungen('erna')).toBe(0);
    expect(await offeneVormerkungen('max')).toBe(1);

    const selbst = client('max');
    const bericht = await nachsendenJetzt(selbst.c);
    expect(selbst.gesendet).toEqual(['time_entries']);
    expect(bericht).toEqual({ gesendet: 1, abgelehnt: 0, offen: 0 });
  });

  it('läuft nicht doppelt, wenn zwei Anlässe zusammenfallen', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    ausgangsfachKonto('max');
    offline();
    await anlegenOhneEmpfang('time_entries', 'perl', { date: '2026-09-25' }, client(null).c);
    online();

    const selbst = client('max');
    await Promise.all([nachsendenJetzt(selbst.c), nachsendenJetzt(selbst.c)]);
    expect(selbst.gesendet).toEqual(['time_entries']);
  });
});
