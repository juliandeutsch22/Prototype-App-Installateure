/**
 * ENTWÜRFE LASSEN SICH LÖSCHEN, BELEGE NICHT (Auftrag 04.11.2026: „man kann
 * Entwürfe bzw. verworfene Entwürfe nicht löschen“).
 *
 * Gegen die echte Datenbank und den echten Speicher:
 * - ein Entwurf und ein verworfener Entwurf gehen weg — samt Zeiten,
 *   Material, Fotozeilen und den Dateien im Eimer, auch einer Datei, die nie
 *   am Entwurf gespeichert wurde;
 * - wer darf: der Monteur seinen eigenen, die Führung jeden; ein Kollege und
 *   ein fremder Betrieb nicht;
 * - ein unterschriebener und ein stornierter Schein bleiben stehen, auch für
 *   die Führung, und mit ihnen ihre Fotos.
 *
 * Gegenprobe: ohne `20261104100000_schein_entwurf_loeschen.sql` lässt sich
 * nichts löschen (keine Löschregel), und die Fotos eines verworfenen
 * Entwurfs bleiben im Eimer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { fotoHochladen } from '@/lib/db/pg/scheinFotos';
import { deleteWorkSheetDraft } from '@/lib/db/pg/workSheets';

const BETRIEB = 'entwurf-weg';
const FREMD = 'entwurf-fremd';
let monteur: Konto;
let kollege: Konto;
let chefin: Konto;
let fremder: Konto;

const bild = (inhalt: string) => new Blob([`${inhalt}-${crypto.randomUUID()}`], { type: 'image/jpeg' });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ew-monteur');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'ew-kollege');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'ew-chefin');
  fremder = await konto(FREMD, 'Geschäftsführung', 'ew-fremd');
}, 180_000);

afterAll(() => clientEinreichen(null));

/** Ein Entwurf des Monteurs mit einer Zeit, einem Material und einem Foto (Datei und Zeile). */
async function entwurf(): Promise<{ id: string; pfad: string }> {
  const id = crypto.randomUUID();
  const { error } = await monteur.client.from('work_sheets').insert({
    id, company_id: BETRIEB, project_number: 'EW-1', customer_name: 'Familie Weg', datum: '2026-11-03',
    status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
  });
  if (error) throw error;
  await monteur.client.from('work_sheet_hours').insert({
    company_id: BETRIEB, work_sheet_id: id, position: 1, datum: '2026-11-03',
    mitarbeiter: 'Anton', von: '07:00', bis: '09:00', pause_min: 0, minuten: 120,
  });
  await monteur.client.from('work_sheet_material').insert({
    company_id: BETRIEB, work_sheet_id: id, position: 1, name: 'Dichtung', menge: 2,
  });
  clientEinreichen(monteur.client);
  const foto = await fotoHochladen(BETRIEB, id, bild('foto'), 1_700_000_000_000);
  const z = await monteur.client.from('work_sheet_photos').insert({
    company_id: BETRIEB, work_sheet_id: id, pfad: foto.pfad, hash: foto.hash, bytes: foto.bytes,
    geraet_zeit: new Date(foto.geraetZeit).toISOString(), position: 0,
  });
  if (z.error) throw z.error;
  return { id, pfad: foto.pfad };
}

async function unterschreiben(id: string) {
  const u = { name: 'Unterschrift', bild: 'data:image/png;base64,AAA', geraetZeit: 1776000000000 };
  const { error } = await monteur.client.from('work_sheets').update({
    status: 'Unterschrieben', unterschrieben_am: new Date().toISOString(),
    unterschrift_monteur: u, unterschrift_kunde: u,
  }).eq('id', id);
  if (error) throw error;
}

/** Was vom Schein noch da ist — gelesen mit dem Dienstschlüssel, an jeder Regel vorbei. */
async function rest(id: string) {
  const zahl = async (tabelle: string, spalte: string) =>
    (await admin.from(tabelle).select('id', { count: 'exact', head: true }).eq(spalte, id)).count ?? 0;
  const { data: dateien } = await admin.storage.from('scheinfotos').list(`scheine/${BETRIEB}/${id}`);
  return {
    schein: await zahl('work_sheets', 'id'),
    zeiten: await zahl('work_sheet_hours', 'work_sheet_id'),
    material: await zahl('work_sheet_material', 'work_sheet_id'),
    fotozeilen: await zahl('work_sheet_photos', 'work_sheet_id'),
    dateien: (dateien ?? []).length,
  };
}

const NICHTS = { schein: 0, zeiten: 0, material: 0, fotozeilen: 0, dateien: 0 };

describe('Einen Entwurf löschen', () => {
  it('der Monteur löscht seinen Entwurf — mit Zeiten, Material, Fotozeilen und Dateien', async () => {
    const { id, pfad } = await entwurf();
    expect(await rest(id)).toEqual({ schein: 1, zeiten: 1, material: 1, fotozeilen: 1, dateien: 1 });
    clientEinreichen(monteur.client);
    await deleteWorkSheetDraft(BETRIEB, id, [pfad]);
    expect(await rest(id)).toEqual(NICHTS);
  }, 60_000);

  it('auch einen verworfenen — und eine Datei, die nie am Entwurf gespeichert wurde', async () => {
    const { id, pfad } = await entwurf();
    clientEinreichen(monteur.client);
    await fotoHochladen(BETRIEB, id, bild('nie gespeichert'), 1);
    expect((await rest(id)).dateien).toBe(2);
    const v = await monteur.client.from('work_sheets').update({ status: 'Verworfen', verworfen_von_name: 'Monteur' }).eq('id', id);
    expect(v.error).toBeNull();
    await deleteWorkSheetDraft(BETRIEB, id, [pfad]);
    expect(await rest(id)).toEqual(NICHTS);
  }, 60_000);

  it('die Führung löscht jeden Entwurf des Betriebs', async () => {
    const { id, pfad } = await entwurf();
    clientEinreichen(chefin.client);
    await deleteWorkSheetDraft(BETRIEB, id, [pfad]);
    expect(await rest(id)).toEqual(NICHTS);
  }, 60_000);

  it('ein Kollege nicht — und auch kein fremder Betrieb; der Entwurf bleibt ganz', async () => {
    const { id, pfad } = await entwurf();
    clientEinreichen(kollege.client);
    await expect(deleteWorkSheetDraft(BETRIEB, id, [pfad])).rejects.toThrow(/ließ sich nicht löschen/);
    clientEinreichen(fremder.client);
    await expect(deleteWorkSheetDraft(BETRIEB, id, [pfad])).rejects.toThrow();
    // Gefragt wird vor den Fotos: der Entwurf bleibt ganz, auch seine Datei.
    expect(await rest(id)).toEqual({ schein: 1, zeiten: 1, material: 1, fotozeilen: 1, dateien: 1 });
  }, 60_000);
});

describe('Die Frage vorher', () => {
  it('„löschbar“ nur für den eigenen Entwurf, für die Führung jeden — nie für einen Beleg', async () => {
    const { id } = await entwurf();
    const frage = async (k: Konto) => (await k.client.rpc('schein_loeschbar', { p_id: id })).data;
    expect(await frage(monteur)).toBe(true);
    expect(await frage(chefin)).toBe(true);
    expect(await frage(kollege)).toBe(false);
    expect(await frage(fremder)).toBe(false);
    await unterschreiben(id);
    expect(await frage(monteur)).toBe(false);
    expect(await frage(chefin)).toBe(false);
  }, 60_000);

  it('ohne Anmeldung gibt es keine Antwort', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { API, ANON } = await import('./helfer');
    const anonym = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anonym.rpc('schein_loeschbar', { p_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
  });
});

describe('Einen Beleg löschen — nie', () => {
  it('ein unterschriebener Schein bleibt, auch für die Führung, samt Foto', async () => {
    const { id, pfad } = await entwurf();
    await unterschreiben(id);
    for (const wer of [monteur, chefin]) {
      clientEinreichen(wer.client);
      await expect(deleteWorkSheetDraft(BETRIEB, id, [pfad])).rejects.toThrow(/ließ sich nicht löschen/);
    }
    expect(await rest(id)).toEqual({ schein: 1, zeiten: 1, material: 1, fotozeilen: 1, dateien: 1 });
  }, 60_000);

  it('ein stornierter Schein bleibt ebenso', async () => {
    const { id, pfad } = await entwurf();
    await unterschreiben(id);
    const s = await chefin.client.from('work_sheets').update({ status: 'Storniert', storno_grund: 'Irrtum' }).eq('id', id);
    expect(s.error).toBeNull();
    clientEinreichen(chefin.client);
    await expect(deleteWorkSheetDraft(BETRIEB, id, [pfad])).rejects.toThrow(/ließ sich nicht löschen/);
    expect(await rest(id)).toEqual({ schein: 1, zeiten: 1, material: 1, fotozeilen: 1, dateien: 1 });
  }, 60_000);

  it('auch der direkte Weg an der App vorbei trifft keinen Beleg', async () => {
    const { id } = await entwurf();
    await unterschreiben(id);
    const weg = await chefin.client.from('work_sheets').delete().eq('id', id).select('id');
    expect(weg.error).toBeNull();
    expect(weg.data).toEqual([]);
    expect((await rest(id)).schein).toBe(1);
  }, 60_000);
});
