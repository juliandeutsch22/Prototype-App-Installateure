/**
 * DIE LAGERLISTE AUS DER DATENBANK (`lager_liste`, Durchsicht 15.11.2026,
 * Budget B3: höchstens 50 Zeilen je Anfrage).
 *
 * Vorher holte das Lager jeden Lagerartikel und sein Freies und rechnete im
 * Browser: suchen, filtern, nach dem Freien sortieren, zählen. Jetzt rechnet
 * die Datenbank dasselbe und gibt die gezeigte Seite und die Zahlen über alle.
 *
 * Geprüft wird vor allem „bleibt gleich“: Seite, Reihenfolge und Zahlen sind
 * dieselben wie die Rechnung im Browser bis dahin (Lagerartikel, `lager_frei`,
 * `istKnapp`, sortiert nach dem Freien und dem Namen). Dazu die Suche
 * (Teilwort ohne Platzhalter, Treffer über Nummern), die Filter, ein weiterer
 * Ort, ein einzelner Artikel und die Rechte.
 *
 * Gegenprobe: ohne 20261118030000 gibt es die Funktion nicht (rot); mit einer
 * Zählung über die Seite statt über alle wichen `im_lager`, `knapp` und
 * `reserviert` ab (rot).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { lagerFrei, lagerListe, listLagerartikel } from '@/lib/db/pg/materials';
import { istKnapp } from '@/features/orders/lagerartikel';

const A = 'lagerliste-a';
const B = 'lagerliste-b';
const GRENZE = 5;
let lager: Konto;
let monteur: Konto;
let fremd: Konto;
const ids: Record<string, string> = {};
let ort = '';

function artikel(name: string, p: Record<string, unknown> = {}) {
  const id = randomUUID();
  ids[name] = id;
  // PostgREST setzt fehlende Spalten in einem Sammelaufruf auf null — deshalb alle Schalter ausdrücklich.
  return {
    id, company_id: A, name, unit: 'Stk', stock: 10, category: null, article_number: null,
    lagerartikel: true, mindestmenge: null, ausgelaufen: false, ausgelaufen_von_hand: false, warengruppe: null, ...p,
  };
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  lager = await konto(A, 'Verwaltung', 'll-lager');
  monteur = await konto(A, 'Mitarbeiter', 'll-monteur');
  fremd = await konto(B, 'Verwaltung', 'll-fremd');
  const zeilen = [
    // 24 gewöhnliche Artikel mit steigendem Bestand — die Reihenfolge nach dem Freien ist nicht die nach dem Namen.
    ...Array.from({ length: 24 }, (_, i) => artikel(`Artikel ${String(23 - i).padStart(2, '0')}`, { stock: 6 + i, warengruppe: i % 2 ? 'Fittings' : ' Rohre ' })),
    artikel('Zylinder knapp', { stock: 3 }),
    artikel('Ölabscheider mit Mindestmenge', { stock: 20, mindestmenge: 25, category: 'Abscheider' }),
    artikel('Pressfitting reserviert', { stock: 4, article_number: 'PF-22%X' }),
    artikel('Auslauf knapp', { stock: 1, ausgelaufen: true }),
    artikel('Leeres Regal', { stock: 0 }),
    artikel('Nur im Katalog', { stock: 0, lagerartikel: false }),
  ];
  const { error } = await admin.from('materials').insert(zeilen);
  if (error) throw new Error(error.message);
  // Ein fremder Artikel gleichen Namens: er darf nirgends mitzählen.
  const f = await admin.from('materials').insert({ ...artikel('Zylinder knapp'), id: randomUUID(), company_id: B });
  if (f.error) throw new Error(f.error.message);
  ids['Zylinder knapp'] = zeilen.find((z) => z.name === 'Zylinder knapp')!.id;

  // Zugesagt aus dem Lager: 9 Pressfittings bei Bestand 4 — 5 fehlen.
  const o = await admin.from('material_orders').insert({
    id: randomUUID(), company_id: A, material_id: ids['Pressfitting reserviert'], material_name: 'Pressfitting reserviert',
    quantity: 9, status: 'Abholbereit', transaction_type: 'order', user_id: monteur.uid, beschaffung: 'lager',
  });
  if (o.error) throw new Error(o.error.message);

  // Ein weiterer Ort mit zwei Artikeln.
  const l = await admin.from('lagerorte').insert({ company_id: A, art: 'lager', bezeichnung: 'Außenlager' }).select('id').single();
  if (l.error) throw new Error(l.error.message);
  ort = l.data.id as string;
  const b = await admin.from('lagerbestaende').insert([
    { lagerort_id: ort, material_id: ids['Artikel 05'], company_id: A, menge: 7 },
    { lagerort_id: ort, material_id: ids['Zylinder knapp'], company_id: A, menge: 2 },
  ]);
  if (b.error) throw new Error(b.error.message);
  clientEinreichen(lager.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Die Rechnung im Browser bis 15.11.2026 — über alle Lagerartikel. */
async function wieBisher() {
  const alle = (await listLagerartikel(A)).filter((m) => m.lagerartikel !== false);
  const stand = await lagerFrei(alle.map((m) => m.id));
  const zeilen = alle.map((m) => {
    const s = stand.get(m.id);
    const reserved = (s?.zugesagt ?? 0) + (s?.geplant ?? 0);
    return { ...m, reserved, free: (m.stock ?? 0) - reserved };
  }).sort((a, b) => a.free - b.free || a.name.localeCompare(b.name, 'de'));
  return {
    zeilen,
    knapp: zeilen.filter((m) => istKnapp(m.free, m, GRENZE)),
    fehlt: zeilen.filter((m) => m.free < 0),
    reserviert: zeilen.reduce((n, m) => n + m.reserved, 0),
  };
}

describe('Lagerliste aus der Datenbank', () => {
  it('bleibt gleich: Seite, Reihenfolge und Zahlen wie die Rechnung im Browser', async () => {
    const vorher = await wieBisher();
    const l = await lagerListe({ anzahl: 20, grenze: GRENZE });
    expect(l.zeilen.map((m) => m.name)).toEqual(vorher.zeilen.slice(0, 20).map((m) => m.name));
    expect(l.zeilen.map((m) => [m.free, m.reserved])).toEqual(vorher.zeilen.slice(0, 20).map((m) => [m.free, m.reserved]));
    expect(l.treffer).toBe(vorher.zeilen.length);
    expect(l.imLager).toBe(vorher.zeilen.length);
    expect(l.knapp).toBe(vorher.knapp.length);
    expect(l.fehlt).toBe(vorher.fehlt.length);
    expect(l.reserviert).toBe(vorher.reserviert);
    // Der Katalogartikel gehört nicht ins Lager, der fremde Betrieb nirgends hin.
    expect(l.imLager).toBe(29);
  });

  it('gibt nur die gefragte Seite zurück — die Zahlen gelten weiter über alle', async () => {
    const l = await lagerListe({ anzahl: 5, grenze: GRENZE });
    expect(l.zeilen).toHaveLength(5);
    expect(l.treffer).toBe(29);
    expect((await lagerListe({ anzahl: 0, grenze: GRENZE })).zeilen).toEqual([]);
    expect(l.zeilen[0]).toMatchObject({ name: 'Pressfitting reserviert', free: -5, reserved: 9, articleNumber: 'PF-22%X' });
  });

  it('knapp wie `istKnapp`: Mindestmenge, sonst die Grenze, nie ausgelaufen; fehlt unter null', async () => {
    const knapp = await lagerListe({ filter: 'knapp', anzahl: 50, grenze: GRENZE });
    expect(knapp.zeilen.map((m) => m.name).sort()).toEqual(['Leeres Regal', 'Pressfitting reserviert', 'Zylinder knapp', 'Ölabscheider mit Mindestmenge'].sort());
    expect(knapp.treffer).toBe(knapp.knapp);
    const fehlt = await lagerListe({ filter: 'fehlt', anzahl: 50, grenze: GRENZE });
    expect(fehlt.zeilen.map((m) => m.name)).toEqual(['Pressfitting reserviert']);
    // Nach dem reinen Bestand (Kopf des Katalogs): das reservierte Pressfitting zählt mit 4 im Regal auch.
    expect(knapp.knappBestand).toBe(4);
  });

  it('sucht im Teilwort von Name, Kategorie und Artikelnummer — ein % ist kein Platzhalter', async () => {
    expect((await lagerListe({ begriff: 'ABSCHEIDER', anzahl: 20, grenze: GRENZE })).zeilen.map((m) => m.name))
      .toEqual(['Ölabscheider mit Mindestmenge']);
    expect((await lagerListe({ begriff: '22%x', anzahl: 20, grenze: GRENZE })).zeilen.map((m) => m.name))
      .toEqual(['Pressfitting reserviert']);
    expect((await lagerListe({ begriff: 'a%e', anzahl: 20, grenze: GRENZE })).treffer).toBe(0);
    // Treffer über die Nummer eines Großhändlers kommen als Kennungen dazu.
    const mitNummer = await lagerListe({ begriff: 'B-7788', treffer: [ids['Artikel 07']], anzahl: 20, grenze: GRENZE });
    expect(mitNummer.zeilen.map((m) => m.name)).toEqual(['Artikel 07']);
  });

  it('nach Namen für die Artikelwahl; Warengruppen der Lagerartikel bereinigt', async () => {
    const l = await lagerListe({ reihenfolge: 'name', anzahl: 3, grenze: GRENZE });
    expect(l.zeilen.map((m) => m.name)).toEqual(['Artikel 00', 'Artikel 01', 'Artikel 02']);
    expect(l.warengruppen).toEqual(['Fittings', 'Rohre']);
  });

  it('am weiteren Ort: nur, was dort liegt, mit der Menge dort, nach Namen', async () => {
    const l = await lagerListe({ ort, filter: 'knapp', reihenfolge: 'name', anzahl: 20, grenze: GRENZE });
    expect(l.zeilen.map((m) => [m.name, m.amOrt])).toEqual([['Artikel 05', 7], ['Zylinder knapp', 2]]);
    expect(l.treffer).toBe(2);
  });

  it('ein einzelner Artikel für das Seitenfenster', async () => {
    const l = await lagerListe({ nur: [ids['Zylinder knapp']], anzahl: 1, grenze: GRENZE });
    expect(l.zeilen.map((m) => [m.name, m.free])).toEqual([['Zylinder knapp', 3]]);
  });

  it('Rechte: jeder im Betrieb liest den eigenen Bestand, nie den fremden; ohne Anmeldung nichts', async () => {
    clientEinreichen(monteur.client);
    expect((await lagerListe({ anzahl: 1, grenze: GRENZE })).imLager).toBe(29);
    clientEinreichen(fremd.client);
    const b = await lagerListe({ anzahl: 50, grenze: GRENZE });
    expect(b.zeilen.map((m) => m.name)).toEqual(['Zylinder knapp']);
    expect(b.imLager).toBe(1);
    clientEinreichen(lager.client);
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('lager_liste', { p_anzahl: 1 });
    expect(error).not.toBeNull();
  });

  it('weist unbekannte Angaben ab, statt eine leere Liste vorzutäuschen', async () => {
    await expect(lagerListe({ filter: 'irgendwas' as 'alle', anzahl: 1, grenze: GRENZE })).rejects.toThrow(/Unbekannte Angabe/);
  });
});
