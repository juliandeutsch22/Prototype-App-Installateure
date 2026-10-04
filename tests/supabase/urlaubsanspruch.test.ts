/**
 * Anpassungen des Urlaubsanspruchs (Plan 10.3, Entscheidung 6 vom 03.10.2026).
 *
 * Jede Grenze mit ihrer Gegenprobe:
 *   - anlegen und entfernen nur Geschäftsführung und Administration, nur
 *     über die Funktionen, nie direkt,
 *   - lesen die Person, das Büro und wer über Urlaub entscheidet — sonst
 *     niemand, auch nicht im Nachbarbetrieb,
 *   - entfernt wird mit Grund, die Zeile bleibt (Datenauskunft),
 *   - die Löschung je Person bewahrt sie auf wie die Urlaube.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'anspruch-a';
const FREMD = 'anspruch-b';

let chefin: Konto;
let admina: Konto;
let buch: Konto;
let pl: Konto;
let genehmiger: Konto;
let anna: Konto;
let bert: Konto;
let fremdeChefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  admina = await konto(BETRIEB, 'Administrator', 'admina');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  pl = await konto(BETRIEB, 'Projektleiter', 'pl');
  genehmiger = await konto(BETRIEB, 'Projektleiter', 'genehmiger');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'anna');
  bert = await konto(BETRIEB, 'Mitarbeiter', 'bert');
  fremdeChefin = await konto(FREMD, 'Geschäftsführung', 'fremd');
  // Festgelegte Genehmigende: die Chefin und eine Projektleitung.
  await admin.from('companies').update({ vacation_approvers: [chefin.uid, genehmiger.uid] }).eq('id', BETRIEB);
}, 120_000);

const anpassen = (k: Konto, user: string, jahr = 2026, tage = -6.25, grund = 'Unbezahlter Urlaub 01.03.–31.05.') =>
  k.client.rpc('urlaubsanspruch_anpassen', { p_user: user, p_urlaubsjahr: jahr, p_tage: tage, p_grund: grund });

describe('Anlegen', () => {
  it('Geschäftsführung und Administration legen an — mit ihrem Namen aus der Tabelle', async () => {
    for (const k of [chefin, admina]) {
      const { data, error } = await anpassen(k, anna.uid);
      expect(error).toBeNull();
      const { data: zeile } = await admin.from('urlaubsanspruch_anpassungen').select('*').eq('id', data).single();
      expect(zeile).toMatchObject({ user_id: anna.uid, urlaubsjahr: 2026, tage: -6.25, angelegt_von_uid: k.uid });
      const { data: u } = await admin.from('users').select('name').eq('id', k.uid).single();
      expect(zeile?.angelegt_von_name).toBe(u?.name);
    }
  });

  it('Büro, Projektleitung und die Person selbst nicht', async () => {
    for (const k of [buch, pl, anna]) {
      const { error } = await anpassen(k, anna.uid);
      expect(error?.code).toBe('42501');
    }
  });

  it('nicht für jemanden aus einem anderen Betrieb', async () => {
    const { error } = await anpassen(fremdeChefin, anna.uid);
    expect(error?.code).toBe('P0002');
  });

  it('nicht direkt in die Tabelle', async () => {
    const { error } = await chefin.client.from('urlaubsanspruch_anpassungen').insert({
      company_id: BETRIEB, user_id: anna.uid, urlaubsjahr: 2026, tage: -1, grund: 'direkt',
    });
    expect(error).not.toBeNull();
  });

  it('ohne Grund, mit null Tagen oder ohne Jahr nicht', async () => {
    expect((await anpassen(chefin, anna.uid, 2026, -2, 'x')).error?.code).toBe('22023');
    expect((await anpassen(chefin, anna.uid, 2026, 0)).error?.code).toBe('22023');
    expect((await anpassen(chefin, anna.uid, 1999)).error?.code).toBe('22023');
  });
});

describe('Lesen', () => {
  let kennung: string;
  beforeAll(async () => {
    const { data } = await anpassen(chefin, bert.uid, 2026, -3, 'Präsenzdienst');
    kennung = data as string;
  });

  const sieht = async (k: Konto) => {
    const { data } = await k.client.from('urlaubsanspruch_anpassungen').select('id').eq('id', kennung);
    return (data ?? []).length === 1;
  };

  it('die Person, das Büro, die Spitze und wer über Urlaub entscheidet', async () => {
    for (const k of [bert, buch, chefin, admina, genehmiger]) expect(await sieht(k)).toBe(true);
  });

  it('Kollegen, eine Projektleitung ohne Genehmigungsrecht und der Nachbarbetrieb nicht', async () => {
    for (const k of [anna, pl, fremdeChefin]) expect(await sieht(k)).toBe(false);
  });
});

describe('Entfernen', () => {
  it('nur mit Grund und nur durch die Spitze — die Zeile bleibt mit dem Grund', async () => {
    const { data: id } = await anpassen(chefin, anna.uid, 2027, -2, 'Irrtum');
    expect((await buch.client.rpc('urlaubsanspruch_anpassung_entfernen', { p_id: id, p_grund: 'weg damit' })).error?.code)
      .toBe('42501');
    expect((await chefin.client.rpc('urlaubsanspruch_anpassung_entfernen', { p_id: id, p_grund: '' })).error?.code)
      .toBe('22023');
    const { error } = await chefin.client.rpc('urlaubsanspruch_anpassung_entfernen', { p_id: id, p_grund: 'Doppelt eingetragen' });
    expect(error).toBeNull();
    const { data: zeile } = await admin.from('urlaubsanspruch_anpassungen').select('*').eq('id', id).single();
    expect(zeile?.entfernt_grund).toBe('Doppelt eingetragen');
    expect(zeile?.entfernt_am).not.toBeNull();
    // Zweimal entfernen geht nicht.
    expect((await chefin.client.rpc('urlaubsanspruch_anpassung_entfernen', { p_id: id, p_grund: 'nochmal' })).error?.code)
      .toBe('55000');
  });

  it('nicht direkt löschen oder ändern', async () => {
    const { data: id } = await anpassen(chefin, anna.uid, 2028, -1, 'Probe');
    await chefin.client.from('urlaubsanspruch_anpassungen').delete().eq('id', id);
    await chefin.client.from('urlaubsanspruch_anpassungen').update({ tage: 5 }).eq('id', id);
    const { data: zeile } = await admin.from('urlaubsanspruch_anpassungen').select('tage').eq('id', id).single();
    expect(zeile?.tage).toBe(-1);
  });
});

describe('Datenauskunft und Löschung', () => {
  it('die Auskunft enthält die Anpassungen samt entfernten', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: anna.uid });
    expect(error).toBeNull();
    const liste = (data as { daten: { urlaubsanspruch_anpassungen: Array<{ grund: string; entfernt_grund: string | null }> } })
      .daten.urlaubsanspruch_anpassungen;
    expect(liste.some((a) => a.grund === 'Irrtum' && a.entfernt_grund === 'Doppelt eingetragen')).toBe(true);
    // Bei der Chefin zählt, was sie für andere angepasst hat.
    const { data: ihre } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chefin.uid });
    expect((ihre as { als_bearbeiter: { urlaubsansprueche_angepasst: number } }).als_bearbeiter.urlaubsansprueche_angepasst)
      .toBeGreaterThan(0);
  });

  it('die Löschung je Person bewahrt sie auf', async () => {
    await admin.from('users').update({ active: false }).eq('id', bert.uid);
    const { data, error } = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: bert.uid, p_nur_pruefen: true });
    expect(error).toBeNull();
    const aufbewahren = (data as { aufbewahren: Array<{ was: string; anzahl: number }> }).aufbewahren;
    expect(aufbewahren.find((z) => z.was === 'Anpassungen des Urlaubsanspruchs')?.anzahl).toBe(1);
  });
});
