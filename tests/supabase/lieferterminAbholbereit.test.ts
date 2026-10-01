/**
 * Nachtest 01.10.2026, Paket B — was die Startseite der Verwaltung braucht:
 * der erwartete Liefertermin an bestellten Zeilen und „abholbereit seit“,
 * das nur die Datenbank stempelt.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'liefertermin-b';
let verwaltung: Konto;
let monteur: Konto;

async function zeile(id: string) {
  const { data } = await admin.from('material_orders')
    .select('status, liefertermin, abholbereit_seit, updated_at').eq('id', id).single();
  return data as { status: string; liefertermin: string | null; abholbereit_seit: string | null; updated_at: string };
}

async function anforderung(teil: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_name: 'Kupferrohr 15', quantity: 4, status: 'Offen',
    transaction_type: 'order', user_id: monteur.uid, user_name: 'Max', ...teil,
  });
  if (error) throw new Error(error.message);
  return id;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'ltvw');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ltmon');
}, 60_000);

describe('Abholbereit seit', () => {
  it('stempelt der Übergang auf „Abholbereit“ — und nur der', async () => {
    const id = await anforderung();
    expect((await zeile(id)).abholbereit_seit).toBeNull();

    const vorher = Date.now();
    expect((await verwaltung.client.from('material_orders').update({ status: 'Abholbereit' }).eq('id', id)).error).toBeNull();
    const seit = Date.parse((await zeile(id)).abholbereit_seit!);
    expect(seit).toBeGreaterThanOrEqual(vorher - 5_000);

    // Was die App schickt, zählt nicht.
    await verwaltung.client.from('material_orders').update({ abholbereit_seit: '2020-01-01T00:00:00Z', note: 'Kiste 3' }).eq('id', id);
    expect(Date.parse((await zeile(id)).abholbereit_seit!)).toBe(seit);

    // Zurück in Bearbeitung: nicht mehr abholbereit, kein Stempel.
    expect((await verwaltung.client.from('material_orders').update({ status: 'In Bearbeitung' }).eq('id', id)).error).toBeNull();
    expect((await zeile(id)).abholbereit_seit).toBeNull();
  });

  it('auch beim Anlegen gleich als abholbereit', async () => {
    const id = await anforderung({ status: 'Abholbereit' });
    expect((await zeile(id)).abholbereit_seit).not.toBeNull();
  });
});

describe('Liefertermin', () => {
  it('nur an einer bestellten Zeile', async () => {
    const id = await anforderung({ status: 'In Bearbeitung', beschaffung: 'einkauf' });
    const ohne = await verwaltung.client.from('material_orders').update({ liefertermin: '2026-10-05' }).eq('id', id);
    expect(ohne.error?.code).toBe('23514');

    const mit = await verwaltung.client.from('material_orders')
      .update({ bestellt_am: new Date().toISOString(), liefertermin: '2026-10-05' }).eq('id', id);
    expect(mit.error).toBeNull();
    expect((await zeile(id)).liefertermin).toBe('2026-10-05');
  });

  it('setzt das Lager, nicht der Monteur', async () => {
    const id = await anforderung({
      status: 'In Bearbeitung', beschaffung: 'einkauf', bestellt_am: new Date().toISOString(), liefertermin: '2026-10-05',
    });
    const versuch = await monteur.client.from('material_orders').update({ liefertermin: '2026-12-24' }).eq('id', id);
    const stand = await zeile(id);
    expect(stand.liefertermin).toBe('2026-10-05');
    // Abgewiesen — oder für ihn gar nicht änderbar; geändert ist es jedenfalls nicht.
    expect(versuch.error !== null || (versuch.count ?? 0) === 0).toBe(true);
  });

  it('gilt ebenso für die eigenen Posten des Büros', async () => {
    const { data, error } = await admin.from('einkauf_posten')
      .insert({ company_id: BETRIEB, material_name: 'Silikon', menge: 6 }).select('id').single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    const ohne = await verwaltung.client.from('einkauf_posten').update({ liefertermin: '2026-10-05' }).eq('id', id);
    expect(ohne.error?.code).toBe('23514');
    const mit = await verwaltung.client.from('einkauf_posten')
      .update({ bestellt_am: new Date().toISOString(), liefertermin: '2026-10-05' }).eq('id', id);
    expect(mit.error).toBeNull();
  });
});
