import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schreiben, nachsenden, type Lager, type Vormerkung } from '@/lib/sync/ausgangsfach';
import { aendernOhneEmpfang, lagerEinreichen } from '@/lib/db/pg/ohneEmpfang';

function fach(): Lager {
  const daten = new Map<number, Vormerkung>();
  let nr = 0;
  return {
    alle: async () => [...daten.values()],
    ablegen: async (v) => { daten.set(++nr, { ...v, folge: nr }); return nr; },
    entfernen: async (n) => { daten.delete(n); },
    ersetzen: async (v) => { daten.set(v.folge, v); },
  };
}
const auftrag = { tabelle: 'time_entries', zeile: 'z', art: 'anlegen' as const, daten: { wert: 1 } };

describe('Dauerhafte und geordnete Buchungen', () => {
  it('legt auch bei vermeintlich bestehendem Netz vor dem ersten Senden dauerhaft ab', async () => {
    const l = fach();
    await schreiben(auftrag, l, async () => {
      expect(await l.alle()).toHaveLength(1);
      return { art: 'ok' };
    }, () => false);
    expect(await l.alle()).toHaveLength(0);
  });

  it('zwei Nachsender lesen den Bestand erst unter derselben Sperre', async () => {
    const l = fach();
    await schreiben(auftrag, l, async () => ({ art: 'ok' }), () => true);
    let sends = 0;
    const senden = async () => { sends++; await new Promise((r) => setTimeout(r, 10)); return { art: 'ok' as const }; };
    const berichte = await Promise.all([nachsenden(l, senden), nachsenden(l, senden)]);
    expect(sends).toBe(1);
    expect(berichte.reduce((n, b) => n + b.gesendet, 0)).toBe(1);
  });

  it('lässt eine neue Änderung beim laufenden Nachsenden nicht vorbeiziehen', async () => {
    const l = fach();
    await schreiben(auftrag, l, async () => ({ art: 'ok' }), () => true);
    let frei!: () => void;
    const wartet = new Promise<void>((r) => { frei = r; });
    const werte: number[] = [];
    const lauf = nachsenden(l, async () => { await wartet; werte.push(1); return { art: 'ok' }; });
    await new Promise((r) => setTimeout(r, 0));
    const neu = schreiben({ ...auftrag, art: 'aendern', daten: { wert: 2 } }, l,
      async () => { werte.push(2); return { art: 'ok' }; }, () => false);
    frei();
    await Promise.all([lauf, neu]);
    expect(werte).toEqual([1, 2]);
  });

  it.each([0, 1])('bestätigt ohne IndexedDB nur eine wirklich geänderte Zeile (%s Treffer)', async (count) => {
    lagerEinreichen(null);
    const client = { from: () => ({ update: () => ({ eq: async () => ({ error: null, count }) }) }) } as unknown as SupabaseClient;
    const p = aendernOhneEmpfang('time_entries', 'z', {}, client);
    if (count) await expect(p).resolves.toBe('confirmed');
    else await expect(p).rejects.toThrow('Kein Datensatz');
  });
});
