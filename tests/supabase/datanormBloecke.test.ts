/**
 * DIE DATANORM-ÜBERNAHME IN BLÖCKEN (`20261010300000_datanorm_in_bloecken.sql`).
 *
 * In einem Zug brach jede Übernahme über ein paar hundert Zeilen an der
 * Zeitgrenze angemeldeter Konten ab (8 s; gemessen: 600 Zeilen → „canceling
 * statement due to statement timeout“, nichts geschrieben). Jetzt arbeitet
 * die App Block für Block ab.
 *
 * GEGENPROBE: der erste Fall läuft mit derselben Zeilenzahl, die vorher
 * scheiterte — gegen den Stand davor rot (Zeitgrenze).
 * GLEICH BLEIBT: dasselbe Ergebnis wie in einem Zug, doppelte Nummern
 * sperren vor dem ersten Schreiben, ein Lauf ist einmal zu haben.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as dn from '@/lib/db/pg/datanorm';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'dnb-a';
let chefin: Konto;
let lieferant: string;
let lfd = 0;

const zeile = (extra: Partial<dn.DatanormZeile> = {}): dn.DatanormZeile => {
  lfd += 1;
  return {
    zeile: lfd, artikelnummer: `B-${lfd}`, name: `Artikel ${lfd}`, einheit: 'Stk',
    preis: 10 + (lfd % 7), preisArt: 'netto', verarbeitung: 'neu', ...extra,
  };
};

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'dnbgf');
  clientEinreichen(chefin.client);
  lieferant = await dn.lieferantAnlegen(BETRIEB, 'Block Grosshandel');
}, 120_000);

afterAll(() => clientEinreichen(null));

async function lauf(zeilen: dn.DatanormZeile[]) {
  const id = await dn.laufAnlegen(BETRIEB, lieferant, 'block.001', 'cp850', { artikel: zeilen.length });
  await dn.zeilenSchicken(BETRIEB, id, zeilen);
  return id;
}

async function laufStand(id: string) {
  const { data } = await admin.from('datanorm_laeufe').select('status, bericht').eq('id', id).single();
  return data as { status: string; bericht: Record<string, unknown> };
}

describe('Übernahme in Blöcken', () => {
  it('übernimmt 600 Zeilen — in einem Zug brach das an der Zeitgrenze ab', async () => {
    const zeilen = Array.from({ length: 600 }, () => zeile());
    const id = await lauf(zeilen);
    const offen: number[] = [];
    const bericht = await dn.uebernehmen(id, undefined, (n) => offen.push(n));
    expect(bericht).toMatchObject({ angelegt: 600, geaendert: 0, preise: 600 });
    expect(offen).toEqual([500, 400, 300, 200, 100]);
    expect((await laufStand(id)).status).toBe('uebernommen');
    const { count } = await admin.from('materials').select('id', { count: 'exact', head: true })
      .eq('company_id', BETRIEB).like('article_number', 'B-%');
    expect(count).toBe(600);
  }, 180_000);

  it('ergibt dasselbe wie in einem Zug: Neuanlage, Änderung, Löschsatz, Bericht', async () => {
    const vorhanden = zeile({ name: 'Alt' });
    await dn.uebernehmen(await lauf([vorhanden]));

    const satz = [
      zeile(), zeile(),
      { ...vorhanden, zeile: ++lfd, name: 'Neu benannt', preis: 99, verarbeitung: 'aenderung' as const },
      zeile({ verarbeitung: 'loeschung' }),
      zeile(),
    ];
    const inBloecken = await lauf(satz);
    // Kleine Blöcke direkt über die Funktion: zwei Zeilen je Aufruf.
    let r: Record<string, unknown> = {};
    for (let i = 0; i < 10; i += 1) {
      const { data, error } = await chefin.client.rpc('datanorm_uebernehmen', { p_lauf: inBloecken, p_menge: 2 });
      expect(error).toBeNull();
      r = data as Record<string, unknown>;
      if (r.fertig) break;
      // Der Zwischenstand steht am Lauf, solange er offen ist.
      const stand = await laufStand(inBloecken);
      expect(stand.status).toBe('offen');
      expect((stand.bericht.zwischenstand as { offen: number }).offen).toBe(r.offen);
    }
    expect(r).toMatchObject({
      fertig: true, offen: 0, angelegt: 3, geaendert: 1, loeschungOhneArtikel: 1, preise: 4,
    });
    const ende = await laufStand(inBloecken);
    expect(ende.status).toBe('uebernommen');
    expect(ende.bericht.zwischenstand).toBeUndefined();
    expect(ende.bericht.uebernahme).toMatchObject({ angelegt: 3, geaendert: 1, loeschungOhneArtikel: 1, preise: 4 });
    const { data: geaendert } = await admin.from('materials').select('name')
      .eq('company_id', BETRIEB).eq('article_number', vorhanden.artikelnummer).single();
    expect(geaendert).toEqual({ name: 'Neu benannt' });
    const { data: rest } = await admin.from('datanorm_zeilen').select('id').eq('lauf_id', inBloecken);
    expect(rest).toEqual([]);
  });

  it('eine doppelte Nummer im Stamm sperrt, bevor der erste Block etwas schreibt', async () => {
    const doppelt = `D-${++lfd}`;
    await admin.from('materials').insert([
      { company_id: BETRIEB, name: 'Zwilling A', article_number: doppelt, stock: 0 },
      { company_id: BETRIEB, name: 'Zwilling B', article_number: doppelt, stock: 0 },
    ]);
    const vorne = zeile();
    const zeilen = [vorne, ...Array.from({ length: 5 }, () => zeile()), zeile({ artikelnummer: doppelt })];
    const id = await lauf(zeilen);
    const { error } = await chefin.client.rpc('datanorm_uebernehmen', { p_lauf: id, p_menge: 2 });
    expect(error?.message).toMatch(/mehrfach/);
    const { data } = await admin.from('materials').select('id').eq('article_number', vorne.artikelnummer);
    expect(data).toEqual([]);
    expect((await laufStand(id)).status).toBe('offen');
  });

  it('ohne Blockgröße alles in einem Zug — wie bisher, für eine ältere Fassung der App', async () => {
    const id = await lauf([zeile(), zeile()]);
    const { data, error } = await chefin.client.rpc('datanorm_uebernehmen', { p_lauf: id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ fertig: true, angelegt: 2 });
  });

  it('weist eine Blockgröße unter eins ab', async () => {
    const id = await lauf([zeile()]);
    const { error } = await chefin.client.rpc('datanorm_uebernehmen', { p_lauf: id, p_menge: 0 });
    expect(error?.message).toMatch(/mindestens eine Zeile/);
  });
});
