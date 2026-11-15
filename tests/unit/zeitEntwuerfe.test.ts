// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Lager, Sendeergebnis, Vormerkung } from '@/lib/sync/ausgangsfach';
import { nachsenden } from '@/lib/sync/ausgangsfach';
import { ausgangsfachKonto, lagerEinreichen, zeitbuchungZurueckholen } from '@/lib/db/pg/ohneEmpfang';
import { zeitEntwuerfeLesen } from '@/lib/zeitEntwuerfe';
import { createTimeEntryOhneEmpfang, DuplicateEntryError, eintraegeUmDenTag } from '@/lib/db/timeEntries';
import { wartendeZeitbuchungen } from '@/lib/db/wartendeZeiten';

/**
 * Z4 (Durchsicht 15.11.2026): eine vorgemerkte Zeitbuchung, die nicht
 * ankommt, war ohne Tag und Grund verloren; ohne Netz wurde gegen das, was
 * schon im Fach wartet, nicht geprüft.
 *
 * Gegenprobe: ohne die Sicherung (`beiVormerkungGesichert` in
 * `pg/ohneEmpfang.ts`) und ohne `wartendeZeiten.ts` sind alle drei rot.
 */
function lagerImKopf(): Lager {
  let zeilen: Vormerkung[] = [];
  let n = 0;
  return {
    async alle() { return [...zeilen]; },
    async ablegen(v) { n += 1; zeilen.push({ ...v, folge: n }); return n; },
    async entfernen(f) { zeilen = zeilen.filter((x) => x.folge !== f); },
    async ersetzen(v) { zeilen = zeilen.map((x) => (x.folge === v.folge ? v : x)); },
  };
}

const zeile = (id: string, daten: Record<string, unknown>, art: 'anlegen' | 'aendern' = 'anlegen') => ({
  zeile: id, tabelle: 'time_entries', art, daten, versuche: 0, angelegt: 1, uid: 'u1',
});

let lager: Lager;
beforeEach(() => {
  localStorage.clear();
  lager = lagerImKopf();
  lagerEinreichen(lager);
  ausgangsfachKonto('u1');
});
afterEach(() => {
  lagerEinreichen(null);
  ausgangsfachKonto(null);
  vi.unstubAllGlobals();
});

describe('Vorgemerkte Zeitbuchungen (Z4)', () => {
  it('eine abgelehnte Buchung wird zum Entwurf — mit Tag, Daten und dem Grund des Servers', async () => {
    await lager.ablegen(zeile('z1', { company_id: 'perl', user_id: 'u1', date: '2026-11-12', start_time: '11:00', end_time: '16:00', project_number: 'PR-2' }));
    const ablehnung: Sendeergebnis = { art: 'abgelehnt', grund: 'Überschneidet sich mit 07:00–12:00' };
    await nachsenden(lager, async () => ablehnung, 'u1');
    const [e] = zeitEntwuerfeLesen('u1', 'perl');
    expect(e).toMatchObject({
      kennung: 'z1', art: 'anlegen', grund: 'Überschneidet sich mit 07:00–12:00', quelle: 'abgelehnt',
      daten: { date: '2026-11-12', start_time: '11:00', project_number: 'PR-2' },
    });
    expect(await lager.alle()).toEqual([]);
  });

  it('wartende Buchungen stehen bereit — und ohne Netz prüft das Anlegen gegen sie', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await lager.ablegen(zeile('z1', { company_id: 'perl', user_id: 'u1', date: '2026-11-12', status: 'Anwesend', start_time: '07:00', end_time: '12:00', project_number: 'PR-1' }));
    const w = await wartendeZeitbuchungen('perl');
    expect(w.map((x) => [x.art, x.eintrag.id, x.eintrag.date, x.eintrag.startTime])).toEqual([['anlegen', 'z1', '2026-11-12', '07:00']]);
    // Dieselbe Baustelle noch einmal am selben Tag: die Sperre greift, obwohl der Server nichts weiß.
    await expect(createTimeEntryOhneEmpfang('perl', {
      userId: 'u1', userName: 'Max', date: '2026-11-12', status: 'Anwesend', startTime: '07:00', endTime: '12:00', projectNumber: 'PR-1',
    })).rejects.toBeInstanceOf(DuplicateEntryError);
    // Die Vorwarnung der Maske sieht sie ebenso — ohne Netz kommt der Tag aus dem Gerät.
    expect((await eintraegeUmDenTag('perl', 'u1', '2026-11-12')).map((e) => e.id)).toEqual(['z1']);
    // Gegenprobe: ein Tag weit weg kennt sie nicht.
    expect(await eintraegeUmDenTag('perl', 'u1', '2026-11-20')).toEqual([]);
  });

  it('„Nicht senden“ holt eine wartende Buchung samt Änderung zurück — sie wird zum Entwurf', async () => {
    await lager.ablegen(zeile('z1', { company_id: 'perl', user_id: 'u1', date: '2026-11-12', start_time: '07:00' }));
    await lager.ablegen(zeile('z1', { end_time: '12:00' }, 'aendern'));
    expect(await zeitbuchungZurueckholen('z1')).toBe(true);
    expect(await lager.alle()).toEqual([]);
    expect(zeitEntwuerfeLesen('u1', 'perl')[0]).toMatchObject({
      kennung: 'z1', quelle: 'zurueckgeholt', daten: { date: '2026-11-12', start_time: '07:00', end_time: '12:00' },
    });
    expect(await zeitbuchungZurueckholen('z1')).toBe(false);
  });
});
