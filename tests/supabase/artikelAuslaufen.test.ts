/**
 * EIN ARTIKEL MIT SPUREN WIRD NICHT GELÖSCHT, SONDERN LÄUFT AUS
 * (Durchsicht 15.11.2026, M1; `20261115300000_artikel_auslaufen.sql`).
 *
 * Geprüft wird gegen die Datenbank:
 *  - Löschen mit Bestand (Hauptlager oder weiterer Ort), mit Buchungen, mit
 *    Anforderung, Rüstliste, Schein oder offenem Einkaufsposten: abgewiesen,
 *    mit dem Grund in Worten — und Bestand und Protokoll bleiben.
 *  - Das Bewegungsprotokoll hängt nicht mehr per `cascade` am Artikel —
 *    auch der Dienstschlüssel, den die Sperre durchlässt, nimmt es nicht mit.
 *  - Die Rückfrage der App (`artikel_verwendung`) nennt dieselben Gründe —
 *    nur für wer den Katalog pflegt, nur im eigenen Betrieb.
 *  - Auslaufen lassen: nicht mehr anforderbar, sobald das Lager leer ist,
 *    kein Bestellvorschlag mehr, der Verlauf bleibt lesbar; der Katalog des
 *    Großhändlers holt den Artikel nicht zurück, „Wieder aufnehmen“ schon.
 *  - Bleibt gleich: ein unbenutzter Artikel lässt sich löschen wie bisher;
 *    mit Restbestand bleibt ein ausgelaufener Artikel anforderbar.
 *
 * GEGENPROBE: ohne die Migration ist jeder Fall rot außer den beiden
 * „bleibt gleich“ — dort löscht bzw. listet die Datenbank vorher wie nachher.
 * (Ohne Migration löscht sie den Artikel mit Bestand samt Protokoll, und die
 * Funktionen `artikel_verwendung` / `artikel_auslaufen` gibt es nicht.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as material from '@/lib/db/pg/materials';
import * as dn from '@/lib/db/pg/datanorm';
import { clientEinreichen } from '@/lib/db/pg/kern';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'auslauf-a';
const FREMD = 'auslauf-b';

let db: Client;
let verwaltung: Konto;
let chefin: Konto;
let monteur: Konto;
let fremd: Konto;

let lfd = 0;
const name = (wort: string) => `${wort} ${++lfd}`;

async function anlegen(wort: string, stock = 0, unit = 'm'): Promise<{ id: string; name: string }> {
  const n = name(wort);
  const id = await material.createMaterial(BETRIEB, { name: n, stock, unit });
  return { id, name: n };
}

async function gibtEs(id: string): Promise<boolean> {
  const { data } = await admin.from('materials').select('id').eq('id', id).maybeSingle();
  return !!data;
}

async function buchungen(id: string): Promise<number> {
  const { count } = await admin.from('lagerbewegungen').select('id', { count: 'exact', head: true }).eq('material_id', id);
  return count ?? 0;
}

async function stand(id: string): Promise<{ stock: number; ausgelaufen: boolean; ausgelaufen_von_hand: boolean }> {
  const { data } = await admin.from('materials').select('stock, ausgelaufen, ausgelaufen_von_hand').eq('id', id).single();
  const d = data as { stock: number; ausgelaufen: boolean; ausgelaufen_von_hand: boolean };
  return { ...d, stock: Number(d.stock) };
}

async function anforderung(materialId: string, materialName: string) {
  const { error } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, material_id: materialId, material_name: materialName,
    quantity: 2, status: 'Offen', transaction_type: 'order', user_id: monteur.uid, user_name: 'Max',
  });
  if (error) throw new Error(error.message);
}

async function vorschlaege(): Promise<Array<{ material: string }>> {
  const { data, error } = await verwaltung.client.rpc('bestellvorschlaege');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return data as Array<{ material: string }>;
}

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'ausvw');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'ausgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ausma');
  fremd = await konto(FREMD, 'Verwaltung', 'ausfremd');
  clientEinreichen(verwaltung.client);
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

describe('Löschen nur ohne Spuren', () => {
  it('mit Bestand: abgewiesen mit Grund — Bestand und Protokoll bleiben', async () => {
    const a = await anlegen('Kupferrohr 15 mm', 50);
    expect(await buchungen(a.id)).toBe(1); // der Anfangsbestand

    await expect(material.deleteMaterial(a.id))
      .rejects.toThrow(new RegExp(`„${a.name}“ lässt sich nicht löschen — daran hängen: 50 m im Lager, 1 Buchung im Bewegungsprotokoll\\. Stattdessen auslaufen lassen`));
    expect(await gibtEs(a.id)).toBe(true);
    expect((await stand(a.id)).stock).toBe(50);
    expect(await buchungen(a.id)).toBe(1);
  });

  it('kein Bestand mehr, aber Buchungen: abgewiesen — das Protokoll ist der Nachweis', async () => {
    const a = await anlegen('Pressfitting', 5, 'Stk');
    await material.lagerInventur(a.id, 0, 'Bruch');
    expect((await stand(a.id)).stock).toBe(0);

    const fehler = await material.deleteMaterial(a.id).then(() => null, (e: Error) => e.message);
    expect(fehler).toMatch(/daran hängen: 2 Buchungen im Bewegungsprotokoll\./);
    expect(fehler).not.toMatch(/im Lager/);
    expect(await buchungen(a.id)).toBe(2);
  });

  it('mit Anforderung: der Grund statt der Fremdschlüssel-Meldung', async () => {
    const a = await anlegen('Eckventil');
    await anforderung(a.id, a.name);
    const fehler = await material.deleteMaterial(a.id).then(() => null, (e: Error) => e.message);
    expect(fehler).toMatch(/daran hängen: 1 Anforderung\./);
    expect(fehler).not.toMatch(/foreign key/i);
    expect(await gibtEs(a.id)).toBe(true);
  });

  it('auf einer Rüstliste', async () => {
    const a = await anlegen('Siphon');
    const { data: kopf, error } = await admin.from('einsatz_material')
      .insert({ company_id: BETRIEB, date: '2026-11-20', project_number: 'PR-2026-001' }).select('id').single();
    expect(error).toBeNull();
    const pos = await admin.from('einsatz_material_positionen').insert({
      company_id: BETRIEB, einsatz_material_id: (kopf as { id: string }).id, position: 0,
      material_id: a.id, name: a.name, menge: 1, einheit: 'm',
    });
    expect(pos.error).toBeNull();
    await expect(material.deleteMaterial(a.id)).rejects.toThrow(/daran hängen: 1 Rüstliste\./);
  });

  it('auf einem Handwerksschein — dort holt die Rechnung den Preis über den Artikel', async () => {
    const a = await anlegen('Flexschlauch', 0, 'Stk');
    const schein = crypto.randomUUID();
    const s = await admin.from('work_sheets').insert({
      id: schein, company_id: BETRIEB, project_number: 'PR-2026-001', customer_name: 'Familie Huber',
      datum: '2026-11-10', status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
    });
    expect(s.error).toBeNull();
    const z = await admin.from('work_sheet_material').insert({
      company_id: BETRIEB, work_sheet_id: schein, position: 0, name: a.name, menge: 2, material_id: a.id,
    });
    expect(z.error).toBeNull();
    await expect(material.deleteMaterial(a.id)).rejects.toThrow(/daran hängen: 1 Handwerksschein\./);
  });

  it('mit offenem Posten auf der Einkaufsliste', async () => {
    const a = await anlegen('Spülkasten', 0, 'Stk');
    const p = await admin.from('einkauf_posten').insert({
      company_id: BETRIEB, material_id: a.id, material_name: a.name, menge: 1, einheit: 'Stk',
      angelegt_von_uid: verwaltung.uid, angelegt_von_name: 'Verwaltung',
    });
    expect(p.error).toBeNull();
    await expect(material.deleteMaterial(a.id)).rejects.toThrow(/daran hängen: 1 offener Posten auf der Einkaufsliste\./);
  });

  it('mit Bestand an einem weiteren Lagerort', async () => {
    const a = await anlegen('Isolierung');
    const { data: ort, error } = await admin.from('lagerorte')
      .insert({ company_id: BETRIEB, art: 'lager', bezeichnung: `Außenlager ${lfd}` }).select('id').single();
    expect(error).toBeNull();
    const b = await admin.from('lagerbestaende')
      .insert({ lagerort_id: (ort as { id: string }).id, material_id: a.id, company_id: BETRIEB, menge: 4 });
    expect(b.error).toBeNull();
    await expect(material.deleteMaterial(a.id)).rejects.toThrow(/4 m an einem weiteren Lagerort oder Fahrzeug/);
    const { data: rest } = await admin.from('lagerbestaende').select('menge').eq('material_id', a.id);
    expect(rest).toEqual([{ menge: 4 }]);
  });

  it('auch der Dienstschlüssel nimmt das Protokoll nicht mit — der Fremdschlüssel hält', async () => {
    /*
      Die Sperre mit Grund lässt den Dienstschlüssel durch (Löschen eines
      Betriebs, Aufräumen der Prüfungen — wie beim Wächter der Bewegungen).
      Das Protokoll nimmt er trotzdem nicht mit: vorher ging es per
      `cascade` still mit.
    */
    const a = await anlegen('Heizungsrohr', 12);
    const { error } = await admin.from('materials').delete().eq('id', a.id);
    expect(error?.code).toBe('23503');
    expect(error?.message).toMatch(/lagerbewegungen/);
    expect(await gibtEs(a.id)).toBe(true);
    expect(await buchungen(a.id)).toBe(1);
  });

  it('das Protokoll hängt nicht mehr per „cascade“ am Artikel', async () => {
    const { rows } = await db.query<{ art: string }>(
      `select confdeltype as art from pg_constraint
        where conrelid = 'public.lagerbewegungen'::regclass and confrelid = 'public.materials'::regclass and contype = 'f'`);
    expect(rows).toEqual([{ art: 'a' }]); // NO ACTION — vorher 'c'
  });

  it('bleibt gleich: ein unbenutzter Artikel lässt sich löschen wie bisher', async () => {
    const a = await anlegen('Probeartikel');
    await expect(material.deleteMaterial(a.id)).resolves.toBeUndefined();
    expect(await gibtEs(a.id)).toBe(false);
  });
});

describe('Was am Artikel hängt — die Rückfrage der App', () => {
  it('nennt dieselben Gründe wie die Sperre; ohne Spuren nichts', async () => {
    const a = await anlegen('Kugelhahn', 3, 'Stk');
    await anforderung(a.id, a.name);
    expect(await material.artikelVerwendung(a.id)).toEqual({
      imWeg: ['3 Stk im Lager', '1 Buchung im Bewegungsprotokoll', '1 Anforderung'],
      ausgelaufen: false,
      vonHand: false,
    });
    const frei = await anlegen('Leer');
    expect((await material.artikelVerwendung(frei.id)).imWeg).toEqual([]);
  });

  it('nur wer den Katalog pflegt, nur im eigenen Betrieb', async () => {
    const a = await anlegen('Rosette');
    const m = await monteur.client.rpc('artikel_verwendung', { p_material: a.id });
    expect(m.error?.code).toBe('42501');
    const f = await fremd.client.rpc('artikel_verwendung', { p_material: a.id });
    expect(f.error?.code).toBe('P0002');
    const g = await chefin.client.rpc('artikel_verwendung', { p_material: a.id });
    expect(g.error).toBeNull();
  });
});

describe('Auslaufen lassen', () => {
  it('Lager leer: nicht mehr anforderbar — der Verlauf bleibt lesbar', async () => {
    const a = await anlegen('Wandscheibe', 2, 'Stk');
    await material.lagerInventur(a.id, 0, 'Verbraucht');
    expect((await material.katalogSeite(BETRIEB, a.name, 20, { nurAnforderbar: true })).zeilen.map((m) => m.id)).toEqual([a.id]);

    await material.artikelAuslaufen(a.id, true);
    expect(await stand(a.id)).toMatchObject({ ausgelaufen: true, ausgelaufen_von_hand: true });
    // Material anfordern bietet ihn nicht mehr an; der Katalog zeigt ihn weiter.
    expect((await material.katalogSeite(BETRIEB, a.name, 20, { nurAnforderbar: true })).zeilen).toEqual([]);
    expect((await material.katalogSeite(BETRIEB, a.name, 20)).zeilen.map((m) => m.id)).toEqual([a.id]);
    // Das Protokoll ist lesbar, wie vorher.
    expect((await material.listLagerbewegungen(a.id)).map((b) => b.art)).toEqual(['inventur', 'anfangsbestand']);
  });

  it('bleibt gleich: mit Restbestand bleibt er anforderbar, bis das Lager leer ist', async () => {
    const a = await anlegen('Rest', 4, 'Stk');
    await material.artikelAuslaufen(a.id, true);
    expect((await material.katalogSeite(BETRIEB, a.name, 20, { nurAnforderbar: true })).zeilen.map((m) => m.id)).toEqual([a.id]);
  });

  it('taucht in den Bestellvorschlägen nicht mehr auf', async () => {
    const a = await anlegen('Mindestmengenartikel', 2, 'Stk');
    await material.updateMaterial(a.id, { mindestmenge: 10 });
    expect((await vorschlaege()).some((v) => v.material === a.id)).toBe(true);
    await material.artikelAuslaufen(a.id, true);
    expect((await vorschlaege()).some((v) => v.material === a.id)).toBe(false);
    // Gegenprobe im selben Fall: wieder aufgenommen, wieder vorgeschlagen.
    await material.artikelAuslaufen(a.id, false);
    expect((await vorschlaege()).some((v) => v.material === a.id)).toBe(true);
  });

  it('der Monteur lässt nichts auslaufen, ein fremder Betrieb erst recht nicht', async () => {
    const a = await anlegen('Dichtung', 0, 'Stk');
    const m = await monteur.client.rpc('artikel_auslaufen', { p_material: a.id, p_aus: true });
    expect(m.error?.code).toBe('42501');
    const f = await fremd.client.rpc('artikel_auslaufen', { p_material: a.id, p_aus: true });
    expect(f.error?.code).toBe('P0002');
    expect(await stand(a.id)).toMatchObject({ ausgelaufen: false, ausgelaufen_von_hand: false });
  });

  it('wieder aufnehmen: angeboten wie zuvor', async () => {
    const a = await anlegen('Zurück', 0, 'Stk');
    await material.artikelAuslaufen(a.id, true);
    await material.artikelAuslaufen(a.id, false);
    expect(await stand(a.id)).toMatchObject({ ausgelaufen: false, ausgelaufen_von_hand: false });
    expect((await material.katalogSeite(BETRIEB, a.name, 20, { nurAnforderbar: true })).zeilen.map((m) => m.id)).toEqual([a.id]);
  });

  it('eine direkte Änderung an der Tabelle holt einen von Hand ausgelaufenen Artikel nicht zurück', async () => {
    const a = await anlegen('Direkt', 0, 'Stk');
    await material.artikelAuslaufen(a.id, true);
    const { error } = await verwaltung.client.from('materials')
      .update({ ausgelaufen: false, ausgelaufen_von_hand: false }).eq('id', a.id);
    expect(error).toBeNull();
    expect(await stand(a.id)).toMatchObject({ ausgelaufen: true, ausgelaufen_von_hand: true });
  });

  it('der Katalog des Großhändlers nimmt die Entscheidung nicht zurück', async () => {
    const lieferant = await dn.lieferantAnlegen(BETRIEB, 'Alpha Großhandel', chefin.client);
    const nummer = `AUS-${lfd}`;
    const einspielen = async (verarbeitung: 'neu' | 'aenderung', zeile: number) => {
      const z: dn.DatanormZeile = {
        zeile, artikelnummer: nummer, name: 'Thermostatkopf', einheit: 'Stk', preis: 10, preisArt: 'netto', verarbeitung,
      };
      const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'katalog.001', 'cp850', { artikel: 1 }, chefin.client);
      await dn.zeilenSchicken(BETRIEB, lauf, [z], undefined, chefin.client);
      await dn.uebernehmen(lauf, chefin.client);
    };
    await einspielen('neu', 1);
    const { data } = await admin.from('materials').select('id').eq('company_id', BETRIEB).eq('article_number', nummer).single();
    const id = (data as { id: string }).id;

    await material.artikelAuslaufen(id, true);
    await einspielen('aenderung', 2);
    expect(await stand(id)).toMatchObject({ ausgelaufen: true, ausgelaufen_von_hand: true });

    // Gegenprobe: wieder aufgenommen, bleibt er es auch nach dem nächsten Katalog.
    await material.artikelAuslaufen(id, false);
    await einspielen('aenderung', 3);
    expect(await stand(id)).toMatchObject({ ausgelaufen: false, ausgelaufen_von_hand: false });
  });
});
