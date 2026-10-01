/**
 * Nachtest 01.10.2026 — Rüstliste: Abbuchung beim Einladen.
 *
 * Reservierung → eingeladen → zurückgenommen → wieder eingeladen →
 * Teilretoure → Schein. Bestand und Bewegungen müssen stimmen, und nichts
 * wird doppelt abgezogen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'ruestliste-einladen';
let monteur: Konto;
let kollege: Konto;
let chefin: Konto;
let rohr = '';
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const UNTERSCHRIFT = { name: 'Huber', bild: 'data:image/png;base64,AAA', geraetZeit: 1776000000000 };

async function bestand(): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', rohr).single();
  return Number((data as { stock: number }).stock);
}

async function frei(): Promise<{ geplant: number; frei: number }> {
  const { data, error } = await chefin.client.rpc('lager_frei');
  if (error) throw new Error(error.message);
  const z = (data as { material_id: string; geplant: number; frei: number }[]).find((r) => r.material_id === rohr)!;
  return { geplant: Number(z.geplant), frei: Number(z.frei) };
}

const umschalten = (k: Konto, an: boolean) => k.client.rpc('laden_umschalten', {
  p_datum: heute, p_baustelle: 'PR-7', p_position: 'pos-rohr', p_an: an, p_von: 'Max',
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'rlmont');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'rlkoll');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'rlgf');
  const { data } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Kupferrohr 15', unit: 'm', stock: 20, lagerartikel: true })
    .select('id').single();
  rohr = (data as { id: string }).id;
  const { error } = await chefin.client.rpc('ruestliste_speichern', {
    p_datum: heute,
    p_baustelle: 'PR-7',
    p_positionen: [
      { id: 'pos-rohr', position: 0, material_id: rohr, name: 'Kupferrohr 15', menge: 8, einheit: 'm' },
      { id: 'pos-frei', position: 1, material_id: '', name: 'Leihgerät Kernbohrer', menge: 1, einheit: 'Stk' },
    ],
    p_uids: [monteur.uid],
    p_von: 'Chefin',
  });
  if (error) throw new Error(error.message);
}, 60_000);

describe('Rüstliste: Abbuchung beim Einladen', () => {
  it('bis „eingeladen“ reserviert, nicht gebucht', async () => {
    expect(await bestand()).toBe(20);
    expect(await frei()).toEqual({ geplant: 8, frei: 12 });
  });

  it('nur wer eingeteilt ist, lädt ein', async () => {
    const { error } = await umschalten(kollege, true);
    expect(error?.message).toMatch(/eingeteilt/);
    expect(await bestand()).toBe(20);
  });

  it('„eingeladen“ bucht den Abgang mit der Baustelle als Bezug — und reserviert nicht mehr', async () => {
    expect((await umschalten(monteur, true)).error).toBeNull();
    expect(await bestand()).toBe(12);
    expect(await frei()).toEqual({ geplant: 0, frei: 12 });
    const { data } = await admin.from('lagerbewegungen').select('art, menge, bezug, erfasst_von')
      .eq('material_id', rohr).order('created_at', { ascending: false }).limit(1);
    expect(data?.[0]).toMatchObject({ art: 'entnahme', bezug: 'Baustelle PR-7', erfasst_von: monteur.uid });
    expect(Number(data?.[0].menge)).toBe(-8);
  });

  it('ein zweites „eingeladen“ bucht nicht doppelt', async () => {
    expect((await umschalten(monteur, true)).error).toBeNull();
    expect(await bestand()).toBe(12);
  });

  it('am selben Tag zurückgenommen: zurückgebucht; wieder eingeladen: wieder ab', async () => {
    expect((await umschalten(monteur, false)).error).toBeNull();
    expect(await bestand()).toBe(20);
    expect(await frei()).toEqual({ geplant: 8, frei: 12 });
    const { data } = await admin.from('lagerbewegungen').select('art, menge')
      .eq('material_id', rohr).order('created_at', { ascending: false }).limit(1);
    expect(data?.[0].art).toBe('retoure');
    expect(Number(data?.[0].menge)).toBe(8);

    expect((await umschalten(monteur, true)).error).toBeNull();
    expect(await bestand()).toBe(12);
  });

  it('eine freie Zeile ohne Katalogartikel bucht nichts', async () => {
    const { error } = await monteur.client.rpc('laden_umschalten', {
      p_datum: heute, p_baustelle: 'PR-7', p_position: 'pos-frei', p_an: true, p_von: 'Max',
    });
    expect(error).toBeNull();
    expect(await bestand()).toBe(12);
  });

  it('was übrig bleibt, kommt über die Retoure zurück', async () => {
    const { error } = await monteur.client.rpc('retoure_anlegen', {
      p_beleg: {
        company_id: BETRIEB, material_id: rohr, material_name: 'Kupferrohr 15', quantity: 3,
        project_number: 'PR-7', condition: 'neu', user_id: monteur.uid, user_name: 'Max',
      },
    });
    expect(error).toBeNull();
    expect(await bestand()).toBe(15);
  });

  it('der Schein mit dem verbauten Material mindert den Bestand nicht noch einmal', async () => {
    const schein = crypto.randomUUID();
    expect((await admin.from('work_sheets').insert({
      id: schein, company_id: BETRIEB, project_number: 'PR-7', customer_name: 'Familie Huber',
      datum: heute, status: 'Entwurf', abrechnung: 'Regie',
      erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
    })).error).toBeNull();
    // Positionen gehen nur in einen Entwurf; danach wird unterschrieben.
    expect((await admin.from('work_sheet_material').insert({
      company_id: BETRIEB, work_sheet_id: schein, position: 0, name: 'Kupferrohr 15', menge: 5, einheit: 'm',
    })).error).toBeNull();
    expect(await bestand()).toBe(15);
    expect((await admin.from('work_sheets').update({
      status: 'Unterschrieben', unterschrift_monteur: UNTERSCHRIFT, unterschrift_kunde: UNTERSCHRIFT,
    }).eq('id', schein)).error).toBeNull();
    expect(await bestand()).toBe(15);
  });

  it('von gestern lässt sich nicht mehr zurücknehmen', async () => {
    const { data } = await admin.from('einsatz_material').select('id, geladen')
      .eq('company_id', BETRIEB).eq('project_number', 'PR-7').single();
    const k = data as { id: string; geladen: Record<string, Record<string, unknown>> };
    const gestern = Date.now() - 36 * 3600 * 1000;
    await admin.from('einsatz_material')
      .update({ geladen: { ...k.geladen, 'pos-rohr': { ...k.geladen['pos-rohr'], am: gestern } } }).eq('id', k.id);
    const { error } = await umschalten(monteur, false);
    expect(error?.message).toMatch(/nur am selben Tag/);
    expect(await bestand()).toBe(15);
  });
});
