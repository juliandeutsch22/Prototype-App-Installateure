/**
 * Die Abfrage des Objektverlaufs (M01b): welche Zeilen, in welcher
 * Reihenfolge, wo die nächste Seite beginnt — und dass in die Bedingung nur
 * eine echte Kennung kommt. Gegen die echte Datenbank blättert
 * `tests/supabase/aenderungsjournal.test.ts`; hier steht, was gefragt wird.
 *
 * Gegenprobe: ohne `pg/objektVerlauf.ts` gibt es nichts zu importieren — rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Abfrage } from '@/lib/db/pg/kern';

const abfragen = vi.fn<(t: string, c: string, a: Abfrage) => Promise<unknown[]>>();
vi.mock('@/lib/db/pg/kern', () => ({ abfragen: (t: string, c: string, a: Abfrage) => abfragen(t, c, a) }));

const { listObjektVerlauf, VERLAUF_SEITE } = await import('@/lib/db/pg/objektVerlauf');

const ID = '11111111-1111-4111-8111-111111111111';
const zeile = (i: number) => ({ id: `z${i}`, amRoh: `2026-11-06 12:00:00.${String(i).padStart(6, '0')}+00` });

beforeEach(() => abfragen.mockReset());

describe('listObjektVerlauf', () => {
  it('ein Objekt: seine Zeilen, neueste zuerst, eine Seite fester Größe — aus der Sicht mit dem rohen Zeitpunkt', async () => {
    abfragen.mockResolvedValue([zeile(1)]);
    const seite = await listObjektVerlauf('perl', 'kunde', ID);
    expect(abfragen).toHaveBeenCalledWith('objekt_verlauf', 'perl', {
      wo: [{ art: 'gleich', feld: 'objektart', wert: 'kunde' }, { art: 'gleich', feld: 'objektId', wert: ID }],
      oder: null,
      sortiere: { feld: 'am', absteigend: true },
      grenze: VERLAUF_SEITE,
      spalten: '*,am_roh:am::text',
    });
    // Eine nicht volle Seite ist die letzte.
    expect(seite.weiter).toBeNull();
  });

  it('eine Rechnung samt ihrer Zahlungen; die nächste Seite ab dem letzten Eintrag, Werte in Anführungszeichen', async () => {
    abfragen.mockResolvedValue(Array.from({ length: VERLAUF_SEITE }, (_, i) => zeile(i)));
    const eins = await listObjektVerlauf('perl', 'rechnung', ID);
    expect(abfragen.mock.calls[0][2]).toMatchObject({
      wo: [],
      oder: `and(or(and(objektart.eq.rechnung,objekt_id.eq.${ID}),and(objektart.eq.zahlung,bezug_id.eq.${ID})))`,
    });
    const letzte = zeile(VERLAUF_SEITE - 1);
    expect(eins.weiter).toEqual({ am: letzte.amRoh, id: letzte.id });

    abfragen.mockResolvedValue([]);
    await listObjektVerlauf('perl', 'rechnung', ID, eins.weiter);
    expect(abfragen.mock.calls[1][2].oder).toBe(
      `and(or(and(objektart.eq.rechnung,objekt_id.eq.${ID}),and(objektart.eq.zahlung,bezug_id.eq.${ID})),`
      + `or(am.lt."${letzte.amRoh}",and(am.eq."${letzte.amRoh}",id.gt."${letzte.id}")))`,
    );
  });

  it('nimmt nur eine Kennung und keinen Wert, der die Bedingung verbiegen könnte', async () => {
    await expect(listObjektVerlauf('perl', 'kunde', 'x),objektart.eq.benutzer')).rejects.toThrow(/Keine Kennung/);
    await expect(listObjektVerlauf('perl', 'kunde', ID, { am: '2026"),or(true', id: 'z' })).rejects.toThrow(/Unbrauchbarer Wert/);
    expect(abfragen).not.toHaveBeenCalled();
  });
});
