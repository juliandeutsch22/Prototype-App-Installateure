/**
 * TESTBERICHT RUNDE 7 — R7-M2 und R7-M3, gegen die echte Datenbank.
 *
 * R7-M2: „Status von Hand setzen › Abholbereit“ umging die Lagerprüfung.
 * 10 im Regal, 10 zugesagt, eine Anforderung über 2 — danach 12 reserviert.
 * Jetzt: dieselbe Prüfung wie „Aus Lager“, in derselben Transaktion;
 * übersteuert wird nur ausdrücklich, und das steht im Protokoll.
 *
 * R7-M3: Ein veralteter Tab meldete Erfolg, obwohl er nichts mehr änderte.
 * Jetzt: jede Statusänderung nur auf dem erwarteten Stand, mit der Antwort,
 * ob sie traf.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as einkauf from '@/lib/db/pg/einkauf';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'r7-anforderung-a';
const FREMD = 'r7-anforderung-b';

let lager: Konto;
let zweiterTab: Konto;
let monteur: Konto;
let chefin: Konto;
let fremdesLager: Konto;
let grosshaendler: string;
let artikel: string;

async function bestandSetzen(stock: number): Promise<void> {
  // Mit dem Dienstschlüssel: der Bestand ändert sich sonst nur über Bewegungen.
  const { error } = await admin.from('materials').update({ stock }).eq('id', artikel);
  if (error) throw new Error(error.message);
}

async function anforderung(menge: number, rest: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: artikel, material_name: 'Pressfitting Bogen 15 mm',
    quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    user_name: 'Max Monteur', project_number: 'PR-2026-0198', ...rest,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function zeile(id: string) {
  const { data } = await admin.from('material_orders')
    .select('status, beschaffung, bestellt_am, geliefert_am, processed, lager_uebersteuert')
    .eq('id', id).single();
  return data!;
}

/** Was das Lager zu diesem Artikel sagt — dieselbe Rechnung wie die Übersicht. */
async function regal() {
  const { data, error } = await lager.client.rpc('lager_frei', { p_ids: [artikel] });
  if (error) throw new Error(error.message);
  const z = (data as { bestand: number; zugesagt: number; geplant: number; frei: number }[])[0];
  return { bestand: Number(z.bestand), zugesagt: Number(z.zugesagt) + Number(z.geplant), frei: Number(z.frei) };
}

/** Alle offenen Zusagen dieses Artikels abschliessen — jeder Test beginnt mit leerem „zugesagt“. */
async function zusagenWeg(): Promise<void> {
  const { error } = await admin.from('material_orders')
    .update({ processed: true, status: 'Erledigt' })
    .eq('company_id', BETRIEB).eq('material_id', artikel).eq('processed', false);
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  lager = await konto(BETRIEB, 'Verwaltung', 'r7lager');
  zweiterTab = await konto(BETRIEB, 'Verwaltung', 'r7tab');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'r7mon');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'r7gf');
  fremdesLager = await konto(FREMD, 'Verwaltung', 'r7fremd');
  await admin.from('users').update({ name: 'Vera Verwaltung' }).eq('id', lager.uid);
  const g = await admin.from('suppliers').insert({ company_id: BETRIEB, name: 'Holter' }).select('id').single();
  grosshaendler = g.data!.id;
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Pressfitting Bogen 15 mm', stock: 10, unit: 'Stk' })
    .select('id').single();
  artikel = m.data!.id;
}, 120_000);

beforeEach(async () => {
  clientEinreichen(lager.client);
  await zusagenWeg();
  await bestandSetzen(10);
});

afterAll(() => clientEinreichen(null));

describe('R7-M2: „Abholbereit“ von Hand nur mit freiem Bestand', () => {
  /** Der Fall aus dem Bericht: 10 im Regal, 10 schon aus Lager zugesagt. */
  async function zehnZugesagt(): Promise<void> {
    const voll = await anforderung(10);
    expect(await einkauf.ausLager(voll, 'Offen')).toBe(true);
  }

  it('10 im Regal, 10 zugesagt, Anforderung über 2: nichts geändert — die Zahlen für die Rückfrage', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    const r = await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen' });
    expect(r).toEqual({ art: 'fehlbestand', bestand: 10, zugesagt: 10, frei: 0, angefordert: 2, einheit: 'Stk' });
    expect(await zeile(id)).toMatchObject({ status: 'Offen', lager_uebersteuert: [] });
    // Reserviert bleibt bei dem, was im Regal liegt.
    expect(await regal()).toEqual({ bestand: 10, zugesagt: 10, frei: 0 });
  });

  it('an der Schnittstelle vorbei (direktes Update): abgewiesen mit denselben Zahlen wie „Aus Lager“', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    const { error } = await lager.client.from('material_orders').update({ status: 'Abholbereit' }).eq('id', id);
    expect(error?.code).toBe('23514');
    expect(error?.message).toMatch(/nur 0 Stk frei \(10 im Regal, 10 schon zugesagt\) — angefordert sind 2/);
    expect((await zeile(id)).status).toBe('Offen');
    expect((await regal()).zugesagt).toBe(10);
  });

  it('bewusst übersteuert: abholbereit — und das Protokoll nennt wer, wann und die Zahlen', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    const vorher = Date.now();
    const r = await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen', trotzFehlbestand: true });
    expect(r).toEqual({ art: 'geaendert' });
    const z = await zeile(id);
    expect(z.status).toBe('Abholbereit');
    expect(z.lager_uebersteuert).toHaveLength(1);
    expect(z.lager_uebersteuert[0]).toMatchObject({
      von: lager.uid, name: 'Vera Verwaltung', bestand: 10, zugesagt: 10, frei: 0, angefordert: 2, einheit: 'Stk',
    });
    expect(Date.parse(z.lager_uebersteuert[0].am)).toBeGreaterThanOrEqual(vorher - 60_000);
    // Über „im Regal“ — aber nicht still: es steht im Protokoll.
    expect(await regal()).toEqual({ bestand: 10, zugesagt: 12, frei: -2 });
  });

  it('die Übersteuerung steht in der Datenauskunft dessen, der sie gesetzt hat — als Anzahl', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen', trotzFehlbestand: true });
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: lager.uid });
    expect(error).toBeNull();
    expect((data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.abholbereit_trotz_fehlbestand)
      .toBeGreaterThanOrEqual(1);
  });

  it('das Protokoll schreibt nur die Datenbank — weder leeren noch vorbelegen', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen', trotzFehlbestand: true });
    const leeren = await lager.client.from('material_orders').update({ lager_uebersteuert: [] }).eq('id', id);
    expect(leeren.error?.code).toBe('42501');
    expect((await zeile(id)).lager_uebersteuert).toHaveLength(1);

    const neu = crypto.randomUUID();
    const { error } = await monteur.client.from('material_orders').insert({
      id: neu, company_id: BETRIEB, material_id: artikel, material_name: 'Pressfitting Bogen 15 mm',
      quantity: 1, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
      lager_uebersteuert: [{ von: lager.uid, name: 'erfunden' }],
    });
    expect(error).toBeNull();
    expect((await zeile(neu)).lager_uebersteuert).toEqual([]);
  });

  it('Gegenprobe: genug frei — abholbereit ohne Rückfrage und ohne Protokolleintrag', async () => {
    await bestandSetzen(20);
    await zehnZugesagt();
    const id = await anforderung(2);
    expect(await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', lager_uebersteuert: [] });
  });

  it('gleich geblieben: eine freie Position ohne Katalogeintrag hat keinen Bestand zu prüfen', async () => {
    await zehnZugesagt();
    const id = await anforderung(2, { material_id: null, material_name: 'Sondernippel ohne Katalog' });
    expect(await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', lager_uebersteuert: [] });
  });

  it('gleich geblieben: über die Einkaufsliste heißt abholbereit „vom Großhändler“ — keine Regalprüfung', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    expect(await einkauf.aufEinkaufsliste(id, grosshaendler, 'Offen')).toBe(true);
    expect(await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'In Bearbeitung' })).toEqual({ art: 'geaendert' });
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', beschaffung: 'einkauf', lager_uebersteuert: [] });
  });

  it('gleich geblieben: zurück auf „Offen“ und andere Wechsel ohne neue Zusage prüfen nichts', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    expect(await anforderungen.updateOrderStatus(id, 'In Bearbeitung', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await anforderungen.updateOrderStatus(id, 'Offen', { von: 'In Bearbeitung' })).toEqual({ art: 'geaendert' });
  });

  it('gleich geblieben: „Aus Lager“ weist wie bisher ab — ohne Übersteuerung', async () => {
    await zehnZugesagt();
    const id = await anforderung(2);
    await expect(einkauf.ausLager(id, 'Offen'))
      .rejects.toThrow(/nur 0 Stk frei \(10 im Regal, 10 schon zugesagt\) — angefordert sind 2/);
  });

  it('zwei gleichzeitig: der Artikel ist gesperrt — nur eine Zusage geht durch', async () => {
    const a = await anforderung(6);
    const b = await anforderung(6);
    const [ra, rb] = await Promise.all([
      lager.client.rpc('anforderung_status_setzen', { p_id: a, p_von: 'Offen', p_nach: 'Abholbereit' }),
      zweiterTab.client.rpc('anforderung_status_setzen', { p_id: b, p_von: 'Offen', p_nach: 'Abholbereit' }),
    ]);
    const ergebnisse = [ra.data?.ergebnis, rb.data?.ergebnis].sort();
    expect(ergebnisse).toEqual(['fehlbestand', 'geaendert']);
    expect((await regal()).zugesagt).toBe(6);
  });

  it('wer darf: nicht der Monteur, und eine fremde Anforderung sieht aus wie keine', async () => {
    const id = await anforderung(1);
    const m = await monteur.client.rpc('anforderung_status_setzen', { p_id: id, p_von: 'Offen', p_nach: 'In Bearbeitung' });
    expect(m.error?.code).toBe('42501');
    const f = await fremdesLager.client.rpc('anforderung_status_setzen', { p_id: id, p_von: 'Offen', p_nach: 'In Bearbeitung' });
    expect(f.error).toBeNull();
    expect(f.data).toMatchObject({ ergebnis: 'veraltet' });
    expect((await zeile(id)).status).toBe('Offen');
  });

  it('„Erledigt“ geht nicht über den Status, sondern über „Abgeholt“', async () => {
    const id = await anforderung(1);
    const r = await lager.client.rpc('anforderung_status_setzen', { p_id: id, p_von: 'Offen', p_nach: 'Erledigt' });
    expect(r.error?.code).toBe('22023');
  });
});

describe('R7-M3: kein Erfolg für einen veralteten Stand — Anforderungen', () => {
  it('Status von Hand: der zweite Tab auf dem alten Stand ändert nichts und erfährt es', async () => {
    const id = await anforderung(1);
    expect(await anforderungen.updateOrderStatus(id, 'In Bearbeitung', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    clientEinreichen(zweiterTab.client);
    expect(await anforderungen.updateOrderStatus(id, 'Abholbereit', { von: 'Offen' })).toEqual({ art: 'veraltet' });
    expect((await zeile(id)).status).toBe('In Bearbeitung');
  });

  it('„Abgeholt“ zweimal: einmal gebucht, einmal „veraltet“ — der Bestand sinkt nur einmal', async () => {
    const id = await anforderung(3);
    expect(await einkauf.ausLager(id, 'Offen')).toBe(true);
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' })).toEqual({ art: 'geaendert' });
    clientEinreichen(zweiterTab.client);
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' })).toEqual({ art: 'veraltet' });
    const { data } = await admin.from('materials').select('stock').eq('id', artikel).single();
    expect(Number(data!.stock)).toBe(7);
  });

  it('„Abgeholt“ auf einem Stand, den jemand inzwischen zurückgesetzt hat: nichts abgebucht', async () => {
    const id = await anforderung(3);
    await einkauf.ausLager(id, 'Offen');
    await anforderungen.updateOrderStatus(id, 'Offen', { von: 'Abholbereit' });
    clientEinreichen(zweiterTab.client);
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Abholbereit' })).toEqual({ art: 'veraltet' });
    expect(await zeile(id)).toMatchObject({ status: 'Offen', processed: false });
  });

  it('„Aus Lager“ und „Nicht auf Lager“ zugleich: der zweite überschreibt den ersten nicht', async () => {
    const id = await anforderung(1);
    expect(await einkauf.ausLager(id, 'Offen')).toBe(true);
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.aufEinkaufsliste(id, grosshaendler, 'Offen')).toBe(false);
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', beschaffung: 'lager' });
  });

  it('gleich geblieben: ohne erwarteten Stand schließt „Abgeholt“ ab wie bisher', async () => {
    const id = await anforderung(1);
    const { data, error } = await lager.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(error).toBeNull();
    expect(data).toBe(1);
    expect((await zeile(id)).status).toBe('Erledigt');
  });
});

describe('R7-M3: kein Erfolg für einen veralteten Stand — Einkaufsliste', () => {
  async function aufDerListe(): Promise<string> {
    const id = await anforderung(14, { material_name: 'Montageschiene R7', material_id: null });
    expect(await einkauf.aufEinkaufsliste(id, grosshaendler, 'Offen')).toBe(true);
    return id;
  }

  it('zwei Sitzungen bestellen denselben Posten: einmal getroffen, einmal nichts — ein Datensatz', async () => {
    const id = await aufDerListe();
    // Tab B bestellt zuerst …
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.alsBestelltMarkieren([id])).toEqual([id]);
    const erst = (await zeile(id)).bestellt_am;
    // … Tab A bestätigt danach den Dialog vom alten Stand.
    clientEinreichen(lager.client);
    expect(await einkauf.alsBestelltMarkieren([id])).toEqual([]);
    expect((await zeile(id)).bestellt_am).toBe(erst);
    const { count } = await admin.from('material_orders').select('id', { count: 'exact', head: true })
      .eq('company_id', BETRIEB).eq('material_name', 'Montageschiene R7').eq('id', id);
    expect(count).toBe(1);
  });

  it('dasselbe für eigene Posten des Büros', async () => {
    const p = await einkauf.lagerPostenAnlegen(BETRIEB, {
      materialId: null, materialName: 'Fürs Lager R7', menge: 5, einheit: 'Stk', supplierId: grosshaendler,
      notiz: null, angelegtVonUid: lager.uid, angelegtVonName: 'Vera Verwaltung',
    });
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.lagerPostenBestellt([p])).toEqual([p]);
    clientEinreichen(lager.client);
    expect(await einkauf.lagerPostenBestellt([p])).toEqual([]);
    expect(await einkauf.lagerPostenLoeschen([p])).toBe(0);
  });

  it('von der Liste genommen, dann vom alten Stand „bestellt“: nichts bestellt, kein Datum an einer offenen Anforderung', async () => {
    const id = await aufDerListe();
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.vonEinkaufslisteNehmen(id)).toBe(true);
    clientEinreichen(lager.client);
    expect(await einkauf.alsBestelltMarkieren([id])).toEqual([]);
    expect(await zeile(id)).toMatchObject({ status: 'Offen', beschaffung: null, bestellt_am: null });
  });

  it('schon bestellt, dann vom alten Stand „von der Liste“: bleibt bestellt, und es heißt so', async () => {
    const id = await aufDerListe();
    expect(await einkauf.alsBestelltMarkieren([id])).toEqual([id]);
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.vonEinkaufslisteNehmen(id)).toBe(false);
    expect((await zeile(id)).beschaffung).toBe('einkauf');
  });

  it('zugeordnet wird nur, was noch keinen Großhändler hat', async () => {
    const id = await anforderung(1, { material_id: null, material_name: 'Zuordnen R7' });
    expect(await einkauf.aufEinkaufsliste(id, null, 'Offen')).toBe(true);
    expect(await einkauf.grosshaendlerZuordnen([id], grosshaendler)).toBe(1);
    const zweiter = await admin.from('suppliers').insert({ company_id: BETRIEB, name: 'Frauenthal' }).select('id').single();
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.grosshaendlerZuordnen([id], zweiter.data!.id)).toBe(0);
    const { data } = await admin.from('material_orders').select('supplier_id').eq('id', id).single();
    expect(data!.supplier_id).toBe(grosshaendler);
  });

  it('„Geliefert“ zweimal: der zweite zählt null', async () => {
    const id = await aufDerListe();
    await einkauf.alsBestelltMarkieren([id]);
    expect(await einkauf.geliefert([id])).toBe(1);
    clientEinreichen(zweiterTab.client);
    expect(await einkauf.geliefert([id])).toBe(0);
  });
});
