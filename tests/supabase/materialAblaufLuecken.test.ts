/**
 * MATERIALABLAUF: VIER LÜCKEN IN DER DATENBANK (Prüfbericht 10.11.2026,
 * `20261110120000_material_ablauf_luecken.sql`) — echte Datenbank.
 *
 *  1. Zurück auf „Offen“ nach „Aus Lager“ nimmt die Zusage zurück; „Nicht
 *     auf Lager“ geht auch nach „Aus Lager“, solange nichts abgeholt ist.
 *  2. Retoure und Wareneingang: dieselbe Kennung bucht höchstens einmal.
 *  3. Umlagern aus dem Hauptlager nimmt Zugesagtes nur nach Bestätigung mit.
 *  4. Löschen einer verbuchten Zeile bucht den Bestand zurück — oder weist
 *     mit Grund ab; an der Tabelle vorbei geht es nicht mehr.
 *  5. „Material anfordern“ bietet Ausgelaufenes nur an, solange es im Lager liegt.
 *
 * GEGENPROBE: vor der Migration sind 1–4 rot (5 hängt nur an der
 * Datenschicht); die Fälle „gleich geblieben“ sind vorher wie nachher grün.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as einkauf from '@/lib/db/pg/einkauf';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import * as materialien from '@/lib/db/pg/materials';
import { umlagern } from '@/lib/db/pg/lagerorte';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'mat-luecken-a';

let lager: Konto;
let monteur: Konto;
let buch: Konto;
let bus = '';

async function artikel(stock: number, teil: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await lager.client.from('materials')
    .insert({ company_id: BETRIEB, name: `Artikel ${crypto.randomUUID().slice(0, 6)}`, stock, unit: 'Stk', lagerartikel: true, ...teil })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function anforderung(material: string, menge: number, teil: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { data: m } = await admin.from('materials').select('name').eq('id', material).single();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: material, material_name: (m as { name: string }).name,
    quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    user_name: 'Max Monteur', project_number: 'PR-2026-0410', ...teil,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function bestand(material: string): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', material).single();
  return Number((data as { stock: number }).stock);
}

async function frei(material: string): Promise<{ zugesagt: number; frei: number }> {
  const { data, error } = await lager.client.rpc('lager_frei', { p_ids: [material] });
  if (error) throw new Error(error.message);
  const z = (data as { zugesagt: number; geplant: number; frei: number }[])[0];
  return { zugesagt: Number(z.zugesagt) + Number(z.geplant), frei: Number(z.frei) };
}

async function zeile(id: string) {
  const { data } = await admin.from('material_orders').select('*').eq('id', id).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function bewegungen(material: string) {
  // Je Aufruf eine eigene Transaktion, also eine eigene Zeit — die letzte steht unten.
  const { data } = await admin.from('lagerbewegungen').select('*').eq('material_id', material).order('created_at');
  return (data ?? []) as Record<string, unknown>[];
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Lücken GmbH');
  lager = await konto(BETRIEB, 'Verwaltung', 'mlverw');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mlmon');
  buch = await konto(BETRIEB, 'Buchhaltung', 'mlbuch');
  await admin.from('users').update({ name: 'Max Monteur' }).eq('id', monteur.uid);
  // Das Hauptlager legt `betrieb_anlegen` an; ein über den Dienstschlüssel angelegter Prüfbetrieb hat es nicht.
  const { error: he } = await admin.from('lagerorte').insert({ company_id: BETRIEB, art: 'haupt', bezeichnung: 'Hauptlager' });
  if (he) throw new Error(he.message);
  const { data, error } = await lager.client.rpc('fahrzeug_speichern', {
    p_fahrzeug: { kennzeichen: 'W-410L', standardfahrer_uid: monteur.uid, aktiv: true },
  });
  if (error) throw new Error(error.message);
  const { data: o } = await admin.from('lagerorte').select('id').eq('fahrzeug_id', data).single();
  bus = (o as { id: string }).id;
}, 120_000);

beforeEach(() => clientEinreichen(lager.client));
afterAll(() => clientEinreichen(null));

/* ------------------------------------------------------------------ 1 */

describe('Nach „Aus Lager“: zurück auf Offen und „Nicht auf Lager“', () => {
  it('zurück auf „Offen“ nimmt die Zusage zurück — und „Aus Lager“ geht wieder', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 4);
    expect(await einkauf.ausLager(id, 'Offen')).toBe(true);
    expect(await frei(m)).toEqual({ zugesagt: 4, frei: 6 });

    expect(await anforderungen.updateOrderStatus(id, 'Offen', { von: 'Abholbereit' })).toEqual({ art: 'geaendert' });
    expect(await zeile(id)).toMatchObject({ status: 'Offen', beschaffung: null });
    expect(await frei(m)).toEqual({ zugesagt: 0, frei: 10 });
    // Der nächste Schritt ist wieder da: beide Wege, wie bei einer neuen Anforderung.
    expect(await einkauf.aufEinkaufsliste(id, null, 'Offen')).toBe(true);
    expect(await zeile(id)).toMatchObject({ status: 'In Bearbeitung', beschaffung: 'einkauf' });
  });

  it('ebenso zurück auf „In Bearbeitung“', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 3);
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'In Bearbeitung', { von: 'Abholbereit' });
    expect(await zeile(id)).toMatchObject({ status: 'In Bearbeitung', beschaffung: null });
    expect((await frei(m)).zugesagt).toBe(0);
    expect(await einkauf.ausLager(id, 'In Bearbeitung')).toBe(true);
  });

  it('„Nicht auf Lager“ direkt nach „Aus Lager“: auf die Einkaufsliste, die Zusage fällt weg', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 4);
    await einkauf.ausLager(id, 'Offen');
    expect(await einkauf.aufEinkaufsliste(id, null, 'Abholbereit', 'lager')).toBe(true);
    expect(await zeile(id)).toMatchObject({ status: 'In Bearbeitung', beschaffung: 'einkauf' });
    expect(await frei(m)).toEqual({ zugesagt: 0, frei: 10 });
  });

  it('Gegenprobe: abgeholt und verbucht kommt nichts mehr auf die Einkaufsliste', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 2);
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' });
    // Von Hand zurück auf „Abholbereit“: verbucht bleibt verbucht.
    await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Erledigt' });
    expect(await einkauf.aufEinkaufsliste(id, null, 'Abholbereit', 'lager')).toBe(false);
    expect(await zeile(id)).toMatchObject({ beschaffung: 'lager', processed: true });
  });

  it('gleich geblieben: verbucht zurück auf „Offen“ behält die Beschaffung (nichts mehr zugesagt)', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 2);
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' });
    await anforderungen.updateOrderStatus(id, 'Offen', { von: 'Erledigt' });
    expect(await zeile(id)).toMatchObject({ status: 'Offen', beschaffung: 'lager', processed: true });
    expect(await bestand(m)).toBe(8);
  });
});

/* ------------------------------------------------------------------ 2 */

describe('Retoure und Wareneingang: eine Kennung, eine Buchung', () => {
  const beleg = (m: string, menge = 3) => ({
    materialId: m, materialName: '', quantity: menge, condition: 'neu', note: '',
    projectNumber: 'PR-2026-0410', userId: monteur.uid, userName: 'Max Monteur',
  });

  it('zweimal dieselbe Kennung: eine Zeile, eine Gutschrift — zurück kommt dieselbe Kennung', async () => {
    const m = await artikel(5);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    const b = { ...beleg(m), materialName: (a as { name: string }).name };
    const kennung = crypto.randomUUID();
    expect(await anforderungen.createReturn(BETRIEB, b, null, kennung)).toBe(kennung);
    expect(await anforderungen.createReturn(BETRIEB, b, null, kennung)).toBe(kennung);
    const { count } = await admin.from('material_orders').select('id', { count: 'exact', head: true }).eq('id', kennung);
    expect(count).toBe(1);
    expect(await bestand(m)).toBe(8);
    expect((await bewegungen(m)).filter((x) => x.art === 'retoure')).toHaveLength(1);
  });

  it('dieselbe Kennung mit anderer Menge: abgewiesen, nichts gebucht', async () => {
    const m = await artikel(5);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    const b = { ...beleg(m), materialName: (a as { name: string }).name };
    const kennung = crypto.randomUUID();
    await anforderungen.createReturn(BETRIEB, b, null, kennung);
    await expect(anforderungen.createReturn(BETRIEB, { ...b, quantity: 4 }, null, kennung))
      .rejects.toThrow(/schon erfasst — mit anderen Angaben/);
    expect(await bestand(m)).toBe(8);
  });

  it('eine fremde Kennung (eine Anforderung) wird nicht überschrieben und nicht verraten', async () => {
    const m = await artikel(5);
    const fremd = await anforderung(m, 1);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    await expect(anforderungen.createReturn(BETRIEB, { ...beleg(m), materialName: (a as { name: string }).name }, null, fremd))
      .rejects.toThrow(/gehört schon zu einem anderen Beleg/);
    expect(await bestand(m)).toBe(5);
    expect(await zeile(fremd)).toMatchObject({ transaction_type: 'order' });
  });

  it('gleich geblieben: zwei Retouren mit eigener Kennung buchen beide', async () => {
    const m = await artikel(5);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    const b = { ...beleg(m, 1), materialName: (a as { name: string }).name };
    await anforderungen.createReturn(BETRIEB, b);
    await anforderungen.createReturn(BETRIEB, b);
    expect(await bestand(m)).toBe(7);
  });

  it('Wareneingang: zweimal derselbe Vorgang bucht einmal — mit anderen Angaben ein Konflikt', async () => {
    const m = await artikel(5);
    const vorgang = crypto.randomUUID();
    const eingang = { materialId: m, menge: 6, lieferant: 'Holter', lieferschein: 'LS-1', vorgang };
    expect(await materialien.lagerEingang(eingang)).toBe(11);
    expect(await materialien.lagerEingang(eingang)).toBe(11);
    expect(await bestand(m)).toBe(11);
    expect((await bewegungen(m)).filter((x) => x.art === 'eingang')).toHaveLength(1);
    await expect(materialien.lagerEingang({ ...eingang, menge: 7 })).rejects.toThrow(/schon gebucht — mit anderen Angaben/);
    expect(await bestand(m)).toBe(11);
  });

  it('gleich geblieben: Wareneingang ohne Vorgang bucht wie bisher jedes Mal', async () => {
    const m = await artikel(5);
    await materialien.lagerEingang({ materialId: m, menge: 2, lieferant: 'Holter' });
    await materialien.lagerEingang({ materialId: m, menge: 2, lieferant: 'Holter' });
    expect(await bestand(m)).toBe(9);
  });
});

/* ------------------------------------------------------------------ 3 */

describe('Umlagern aus dem Hauptlager: Zugesagtes nur nach Rückfrage', () => {
  const auftrag = (m: string, menge: number, erwartet: number) =>
    ({ artikelId: m, vonId: null, nachId: bus, menge, einheit: 'Stk', erwartetVon: erwartet });

  it('mehr als frei: nichts gebucht, die Zahlen für die Rückfrage', async () => {
    const m = await artikel(10);
    await einkauf.ausLager(await anforderung(m, 7), 'Offen');
    const r = await umlagern(auftrag(m, 5, 10));
    expect(r).toMatchObject({ art: 'reserviert', bestandVon: 10, zugesagt: 7, frei: 3, menge: 5, einheit: 'Stk' });
    expect(await bestand(m)).toBe(10);
    expect((await bewegungen(m)).filter((x) => x.art === 'umlagerung')).toHaveLength(0);
  });

  it('bestätigt: gebucht, und die Übersteuerung steht im Bewegungsprotokoll', async () => {
    const m = await artikel(10);
    await einkauf.ausLager(await anforderung(m, 7), 'Offen');
    const r = await umlagern({ ...auftrag(m, 5, 10), trotzReserviert: true });
    expect(r).toMatchObject({ art: 'ausgefuehrt', bestandVon: 5, bestandNach: 5 });
    const ab = (await bewegungen(m)).find((x) => x.art === 'umlagerung' && Number(x.menge) < 0);
    expect(String(ab?.bezug)).toMatch(/trotz Reservierung \(frei 3 von 10 Stk\)/);
  });

  it('gleich geblieben: so viel wie frei geht ohne Rückfrage', async () => {
    const m = await artikel(10);
    await einkauf.ausLager(await anforderung(m, 7), 'Offen');
    expect(await umlagern(auftrag(m, 3, 10))).toMatchObject({ art: 'ausgefuehrt', bestandVon: 7 });
  });

  it('gleich geblieben: aus einem Fahrzeug gibt es keine Reservierung', async () => {
    const m = await artikel(10);
    expect((await umlagern(auftrag(m, 4, 10))).art).toBe('ausgefuehrt');
    await einkauf.ausLager(await anforderung(m, 6), 'Offen');
    expect(await umlagern({ artikelId: m, vonId: bus, nachId: null, menge: 4, einheit: 'Stk', erwartetVon: 4 }))
      .toMatchObject({ art: 'ausgefuehrt' });
  });
});

/* ------------------------------------------------------------------ 4 */

describe('Löschen bucht den Bestand zurück', () => {
  it('eine abgeholte Anforderung: die Entnahme kommt zurück ins Lager, die Zeile ist weg, der Rechnungsvorschlag stimmt', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 4);
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' });
    expect(await bestand(m)).toBe(6);

    const p = await anforderungen.anforderungLoeschenPruefen(id);
    expect(p).toMatchObject({ art: 'moeglich', gegenbuchung: [{ materialId: m, ortId: null, ort: 'Hauptlager', menge: 4, einheit: 'Stk' }] });
    if (p.art !== 'moeglich') throw new Error('nicht möglich');
    // Nichts geändert durch die Prüfung.
    expect(await bestand(m)).toBe(6);

    expect((await anforderungen.anforderungLoeschen(id, p.erwartet)).art).toBe('geloescht');
    expect(await zeile(id)).toBeNull();
    expect(await bestand(m)).toBe(10);
    const alle = await bewegungen(m);
    const zurueck = alle[alle.length - 1];
    expect(zurueck).toMatchObject({ art: 'zugang', bezug: 'Gegenbuchung' });
    expect(Number(zurueck.menge)).toBe(4);
    expect(String(zurueck.grund)).toMatch(/^Anforderung gelöscht: .* ×4, Baustelle PR-2026-0410, Max Monteur$/);

    clientEinreichen(buch.client);
    expect((await anforderungen.ausgegebenesMaterial('PR-2026-0410')).some((a) => a.belegId === id)).toBe(false);
  });

  it('eine Retoure „neu“: die Gutschrift geht wieder heraus', async () => {
    const m = await artikel(5);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    const id = await anforderungen.createReturn(BETRIEB, {
      materialId: m, materialName: (a as { name: string }).name, quantity: 2, condition: 'neu', note: '',
      projectNumber: 'PR-2026-0411', userId: monteur.uid, userName: 'Max Monteur',
    });
    expect(await bestand(m)).toBe(7);
    const p = await anforderungen.anforderungLoeschenPruefen(id);
    expect(p).toMatchObject({ art: 'moeglich', gegenbuchung: [{ menge: -2 }] });
    if (p.art !== 'moeglich') throw new Error('nicht möglich');
    await anforderungen.anforderungLoeschen(id, p.erwartet);
    expect(await bestand(m)).toBe(5);
    const alle = await bewegungen(m);
    expect(alle[alle.length - 1]).toMatchObject({ art: 'abgang' });
  });

  it('eine Retoure ins Fahrzeug: zurückgebucht am Ort, an dem gutgeschrieben wurde', async () => {
    const m = await artikel(5);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    const id = await anforderungen.createReturn(BETRIEB, {
      materialId: m, materialName: (a as { name: string }).name, quantity: 2, condition: 'neu', note: '',
      projectNumber: '', userId: monteur.uid, userName: 'Max Monteur',
    }, bus);
    const p = await anforderungen.anforderungLoeschenPruefen(id);
    expect(p).toMatchObject({ art: 'moeglich', gegenbuchung: [{ ortId: bus, ort: 'Fahrzeug W-410L', menge: -2 }] });
    if (p.art !== 'moeglich') throw new Error('nicht möglich');
    await anforderungen.anforderungLoeschen(id, p.erwartet);
    const { data: b } = await admin.from('lagerbestaende').select('menge').eq('lagerort_id', bus).eq('material_id', m).single();
    expect(Number((b as { menge: number }).menge)).toBe(0);
    expect(await bestand(m)).toBe(5);
  });

  it('abgewiesen, wenn die Gutschrift nicht mehr am Ort liegt', async () => {
    const m = await artikel(0);
    const { data: a } = await admin.from('materials').select('name').eq('id', m).single();
    const id = await anforderungen.createReturn(BETRIEB, {
      materialId: m, materialName: (a as { name: string }).name, quantity: 3, condition: 'neu', note: '',
      projectNumber: '', userId: monteur.uid, userName: 'Max Monteur',
    });
    // Inzwischen ging die Ware zu einer anderen Baustelle.
    await einkauf.ausLager(await anforderung(m, 2), 'Offen');
    const o = (await admin.from('material_orders').select('id').eq('material_id', m).eq('transaction_type', 'order').single()).data as { id: string };
    await anforderungen.updateOrderStatus(o.id, 'Erledigt', { von: 'Abholbereit' });
    const p = await anforderungen.anforderungLoeschenPruefen(id);
    expect(p).toMatchObject({ art: 'abgewiesen' });
    expect(p.art === 'abgewiesen' && p.grund).toMatch(/Hauptlager: dort liegen nur noch 1 Stk/);
    expect(await anforderungen.anforderungLoeschen(id, [])).toMatchObject({ art: 'abgewiesen' });
    expect(await zeile(id)).not.toBeNull();
  });

  it('abgewiesen, wenn schon abgerechnet — die Zeile bleibt, der Bestand auch', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 4, { project_number: 'PR-2026-0499' });
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' });
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
    const { error } = await admin.from('invoices').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, invoice_number: 'R-2026-0499', project_number: '2026-0499',
      customer_name: 'Familie Huber', invoice_date: heute, due_date: heute, total_netto: 100, total_vat: 20,
      total_brutto: 120, payment_status: 'Offen',
    });
    if (error) throw new Error(error.message);
    const p = await anforderungen.anforderungLoeschenPruefen(id);
    expect(p).toMatchObject({ art: 'abgewiesen' });
    expect(p.art === 'abgewiesen' && p.grund).toMatch(/Schon abgerechnet/);
    expect(await zeile(id)).not.toBeNull();
    expect(await bestand(m)).toBe(6);
  });

  it('abgewiesen ohne Beleg im Bewegungsprotokoll (Altdaten)', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 2, { status: 'Erledigt', processed: true });
    expect(await anforderungen.anforderungLoeschenPruefen(id)).toMatchObject({ art: 'abgewiesen' });
  });

  it('an der Tabelle vorbei: eine verbuchte Zeile lässt sich nicht löschen', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 2);
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' });
    const { error } = await lager.client.from('material_orders').delete().eq('id', id);
    expect(error?.code).toBe('42501');
    expect(await zeile(id)).not.toBeNull();
    expect(await bestand(m)).toBe(8);
  });

  it('nur auf dem geprüften Stand: ist inzwischen abgeholt, wird nichts gelöscht', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 2);
    await einkauf.ausLager(id, 'Offen');
    const p = await anforderungen.anforderungLoeschenPruefen(id);
    if (p.art !== 'moeglich') throw new Error('nicht möglich');
    expect(p.gegenbuchung).toEqual([]);
    await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' });
    expect(await anforderungen.anforderungLoeschen(id, p.erwartet)).toEqual({ art: 'veraltet' });
    expect(await zeile(id)).not.toBeNull();
    expect(await bestand(m)).toBe(8);
  });

  it('gleich geblieben: eine unverbuchte Anforderung löscht sich ohne Gegenbuchung — auch an der Tabelle', async () => {
    const m = await artikel(10);
    const a = await anforderung(m, 2);
    const p = await anforderungen.anforderungLoeschenPruefen(a);
    expect(p).toMatchObject({ art: 'moeglich', gegenbuchung: [] });
    if (p.art !== 'moeglich') throw new Error('nicht möglich');
    await anforderungen.anforderungLoeschen(a, p.erwartet);
    expect(await zeile(a)).toBeNull();
    const b = await anforderung(m, 2);
    expect((await lager.client.from('material_orders').delete().eq('id', b)).error).toBeNull();
    expect(await bestand(m)).toBe(10);
  });

  it('Rechte wie bisher: der Monteur löscht nicht', async () => {
    const m = await artikel(10);
    const id = await anforderung(m, 2);
    clientEinreichen(monteur.client);
    await expect(anforderungen.anforderungLoeschenPruefen(id)).rejects.toThrow(/Löschen darf das Lager/);
    expect(await zeile(id)).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ 5 */

describe('„Material anfordern“: Ausgelaufenes nur, solange es im Lager liegt', () => {
  it('ohne ausgelaufene Artikel ohne Bestand — der Katalog zeigt sie weiter', async () => {
    const marke = `Auslauf${crypto.randomUUID().slice(0, 4)}`;
    // Mit dem Dienstschlüssel: „ausgelaufen“ setzt sonst nur der DATANORM-Import.
    const { error } = await admin.from('materials').insert([
      { company_id: BETRIEB, name: `${marke} weg`, stock: 0, unit: 'Stk', ausgelaufen: true, lagerartikel: false },
      { company_id: BETRIEB, name: `${marke} Restbestand`, stock: 3, unit: 'Stk', ausgelaufen: true, lagerartikel: true },
      { company_id: BETRIEB, name: `${marke} aktuell`, stock: 0, unit: 'Stk', ausgelaufen: false, lagerartikel: false },
    ]);
    if (error) throw new Error(error.message);
    const anfordern = await materialien.katalogSeite(BETRIEB, marke, 20, { nurAnforderbar: true });
    expect(anfordern.zeilen.map((z) => z.name).sort()).toEqual([`${marke} Restbestand`, `${marke} aktuell`]);
    expect(anfordern.gesamt).toBe(2);
    // Gleich geblieben: ohne die Wahl (Katalog, Lager) alle drei.
    const katalog = await materialien.katalogSeite(BETRIEB, marke, 20);
    expect(katalog.gesamt).toBe(3);
  });
});
