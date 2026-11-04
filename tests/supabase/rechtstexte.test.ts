/**
 * RECHTSTEXTE IM GLOBALEN ADMIN (Auftrag 04.11.2026, E45).
 *
 * Gegen die echte Datenbank:
 * - Lesen: die geltenden Fassungen für jeden, auch ohne Anmeldung — nie ein
 *   Entwurf; die Tabelle selbst nur für die Plattform.
 * - Schreiben: nur das Plattformkonto mit zweitem Faktor, nur über die
 *   Funktionen; ein Betrieb und ein Konto ohne zweiten Faktor nicht.
 * - Fassungen: nummeriert, unveränderlich, nicht löschbar; ein Entwurf je
 *   Art, verwerfbar.
 * - Die Form wird geprüft; „geprüft“ nur mit Namen und ohne offene Angaben.
 * - Neue Unterauftragsverarbeiter: die Leitung jedes Betriebs sieht sie, bis
 *   sie sie zur Kenntnis nimmt; ein Monteur nicht; ein danach angelegter
 *   Betrieb nicht.
 * - Fassung 1 ist der Text, der bis 04.11.2026 im Quelltext stand.
 *
 * Gegenprobe: ohne `20261104130000_rechtstexte.sql` gibt es weder die
 * Funktionen noch die Tabelle — jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { admin, ANON, API, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';
import { fassungEinsAnlegen } from '../rechtstexteFassungEins';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'rechtstexte-a';
const ANDERER = 'rechtstexte-b';
let db: Client;
let plattform: Konto;
let ohneFaktor: Konto;
let chefin: Konto;
let admina: Konto;
let monteur: Konto;
let andereChefin: Konto;

/** Zurück auf Fassung 1 — an der Unveränderlichkeit vorbei, wie es nur ein Test darf. */
async function zuruecksetzen() {
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  await db.query('delete from public.rechtstexte where nummer is null or nummer > 1');
  await db.query('commit');
  // Vor jedem Lauf leert `aufraeumen.ts` alle Tabellen — auch Fassung 1.
  await fassungEinsAnlegen(db);
}

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await zuruecksetzen();
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(ANDERER);
  // Beide Betriebe gab es schon, bevor etwas geändert wurde.
  await admin.from('companies').update({ created_at: '2026-01-01T00:00:00Z', verarbeiter_kenntnis_am: null }).in('id', [BETRIEB, ANDERER]);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'rt-chefin');
  admina = await konto(BETRIEB, 'Administrator', 'rt-admin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'rt-monteur');
  andereChefin = await konto(ANDERER, 'Geschäftsführung', 'rt-andere');
  plattform = await plattformkonto('rt');
  ohneFaktor = await plattformkonto('rt-ohne', { zweiterFaktor: false });
}, 180_000);

afterAll(async () => {
  await zuruecksetzen();
  await db.end();
});

const anonym = () => createClient(API, ANON, { auth: { persistSession: false } });
const aktuell = async (k?: Konto) => {
  const { data, error } = await (k ? k.client : anonym()).rpc('rechtstexte_aktuell');
  expect(error).toBeNull();
  return data as Record<string, { nummer: number; inhalt: Record<string, unknown>; geprueft: boolean; neueVerarbeiter: string[]; hinweisen: boolean }>;
};
const BETREIBER = { name: 'Senklot Prüf GmbH', anschrift: 'Lotgasse 1\n1010 Wien', email: 'office@senklot.test', telefon: '+43 1 234', uid: 'ATU12345678', firmenbuch: 'FN 1a, HG Wien', gewerbe: 'Dienstleistungen in der automatischen Datenverarbeitung, MBA 1' };
const speichern = (k: Konto, art: string, inhalt: unknown) => k.client.rpc('rechtstext_entwurf_speichern', { p_art: art, p_inhalt: inhalt });
const veroeffentlichen = (k: Konto, art: string, geprueft = false, von = '', hinweisen = false) =>
  k.client.rpc('rechtstext_veroeffentlichen', { p_art: art, p_geprueft: geprueft, p_geprueft_von: von, p_hinweisen: hinweisen });

describe('Fassung 1 — der Text aus dem Quelltext', () => {
  it('steht für alle drei Arten da, ohne Anmeldung lesbar, nicht geprüft, mit leeren Betreiberangaben', async () => {
    const t = await aktuell();
    expect(Object.keys(t).sort()).toEqual(['betreiber', 'datenschutz', 'impressum']);
    for (const art of ['betreiber', 'datenschutz', 'impressum']) {
      expect(t[art].nummer).toBe(1);
      expect(t[art].geprueft).toBe(false);
    }
    expect(Object.values(t.betreiber.inhalt).every((v) => v === '')).toBe(true);
    const abschnitte = (t.datenschutz.inhalt.abschnitte as Array<{ titel: string }>).map((a) => a.titel);
    expect(abschnitte).toEqual(['Wer verantwortlich ist', 'Welche Daten die App verarbeitet', 'Wozu', 'Auf deinem Gerät',
      'Wer die Daten technisch verarbeitet', 'Wie lange', 'Deine Rechte']);
    expect((t.datenschutz.inhalt.verarbeiter as unknown[]).length).toBe(5);
    expect((t.impressum.inhalt.abschnitte as unknown[]).length).toBe(4);
    // Was die Komponentenprüfung bis E45 am Quelltext hielt, steht jetzt hier.
    const text = JSON.stringify(t.datenschutz.inhalt);
    expect(text).toContain('Österreichischen Datenschutzbehörde');
    expect(text).toContain('das Fehlerprotokoll nach 90 Tagen');
    expect(text).toContain('geht mit deinem Namen und deiner E-Mail-Adresse an den Senklot-Support');
    expect(text).toContain('{Unterauftragsverarbeiter}');
  });
});

describe('Wer schreibt', () => {
  it('ohne Anmeldung, ein Betrieb und ein Plattformkonto ohne zweiten Faktor nicht — weder über die Funktionen noch direkt', async () => {
    const anon = anonym();
    expect((await anon.rpc('rechtstext_entwurf_speichern', { p_art: 'betreiber', p_inhalt: BETREIBER })).error).not.toBeNull();
    for (const k of [chefin, admina, ohneFaktor]) {
      expect((await speichern(k, 'betreiber', BETREIBER)).error?.code).toBe('42501');
      expect((await veroeffentlichen(k, 'betreiber')).error?.code).toBe('42501');
      expect((await k.client.rpc('rechtstext_entwurf_verwerfen', { p_art: 'betreiber' })).error?.code).toBe('42501');
      const direkt = await k.client.from('rechtstexte').insert({ art: 'betreiber', inhalt: BETREIBER });
      expect(direkt.error).not.toBeNull();
    }
    expect((await aktuell()).betreiber.nummer).toBe(1);
  });

  it('die Tabelle mit Entwürfen liest nur die Plattform — ein Betrieb sieht keine Zeile, ohne Anmeldung gibt es kein Recht', async () => {
    expect((await plattform.client.from('rechtstexte').select('id')).data!.length).toBeGreaterThanOrEqual(3);
    expect((await chefin.client.from('rechtstexte').select('id')).data).toEqual([]);
    expect((await ohneFaktor.client.from('rechtstexte').select('id')).data).toEqual([]);
    expect((await anonym().from('rechtstexte').select('id')).error).not.toBeNull();
  });
});

describe('Entwurf und Fassung', () => {
  it('ein Entwurf ist nur für die Plattform da; veröffentlicht wird er Fassung 2 und gilt sofort', async () => {
    expect((await speichern(plattform, 'betreiber', BETREIBER)).error).toBeNull();
    // Ein zweites Speichern ersetzt den Entwurf — es bleibt einer.
    expect((await speichern(plattform, 'betreiber', BETREIBER)).error).toBeNull();
    const { data: entwuerfe } = await plattform.client.from('rechtstexte').select('id').eq('art', 'betreiber').is('nummer', null);
    expect(entwuerfe).toHaveLength(1);
    expect((await aktuell()).betreiber.nummer).toBe(1);

    const { data: nummer, error } = await veroeffentlichen(plattform, 'betreiber');
    expect(error).toBeNull();
    expect(nummer).toBe(2);
    const t = await aktuell(monteur);
    expect(t.betreiber.nummer).toBe(2);
    expect(t.betreiber.inhalt).toEqual(BETREIBER);
  });

  it('eine veröffentlichte Fassung ändert sich nicht und verschwindet nicht — auch nicht mit allen Rechten', async () => {
    await expect(db.query(`update public.rechtstexte set inhalt = '{}' where art = 'betreiber' and nummer = 2`)).rejects.toThrow(/bleibt, wie sie ist/);
    await expect(db.query(`delete from public.rechtstexte where art = 'betreiber' and nummer = 1`)).rejects.toThrow(/bleibt, wie sie ist/);
    // Und die Plattform kann über ihre Wege nur Entwürfe verwerfen.
    expect((await plattform.client.rpc('rechtstext_entwurf_verwerfen', { p_art: 'betreiber' })).error).toBeNull();
    expect((await aktuell()).betreiber.nummer).toBe(2);
  });

  it('ein Entwurf lässt sich verwerfen; ohne Entwurf gibt es nichts zu veröffentlichen', async () => {
    const t = await aktuell();
    expect((await speichern(plattform, 'impressum', t.impressum.inhalt)).error).toBeNull();
    expect((await plattform.client.rpc('rechtstext_entwurf_verwerfen', { p_art: 'impressum' })).error).toBeNull();
    const { data } = await plattform.client.from('rechtstexte').select('id').eq('art', 'impressum').is('nummer', null);
    expect(data).toEqual([]);
    expect((await veroeffentlichen(plattform, 'impressum')).error?.message).toMatch(/keinen Entwurf/);
  });
});

describe('Die Form', () => {
  it('weist Unvollständiges und Fremdes ab, mit Grund', async () => {
    const fall = async (art: string, inhalt: unknown) => (await speichern(plattform, art, inhalt)).error?.message ?? 'angenommen';
    expect(await fall('betreiber', { name: 'x' })).toMatch(/vorgesehenen Felder/);
    expect(await fall('betreiber', { ...BETREIBER, name: 'x'.repeat(501) })).toMatch(/500 Zeichen/);
    expect(await fall('impressum', { abschnitte: [] })).toMatch(/einen bis fünfzig/);
    expect(await fall('impressum', { abschnitte: [{ titel: ' ', text: 'x' }] })).toMatch(/Überschrift/);
    expect(await fall('impressum', { abschnitte: [{ titel: 'A', text: 'x' }], verarbeiter: [] })).toMatch(/Impressum besteht aus Abschnitten/);
    expect(await fall('datenschutz', { abschnitte: [{ titel: 'A', text: 'x' }] })).toMatch(/Unterauftragsverarbeiter/);
    expect(await fall('datenschutz', { abschnitte: [{ titel: 'A', text: 'x' }], verarbeiter: [{ wer: 'X', wofuer: 'y', wo: 'z' }, { wer: 'X', wofuer: 'y', wo: 'z' }] })).toMatch(/nur einmal/);
    expect(await fall('datenschutz', { abschnitte: [{ titel: 'A', text: 'x' }], verarbeiter: [{ wer: 'X', wofuer: '', wo: 'z' }] })).toMatch(/nicht leer/);
    expect(await fall('agb', { abschnitte: [{ titel: 'A', text: 'x' }] })).toMatch(/Unbekannte Art/);
    // Gegenprobe: dasselbe in richtiger Form geht.
    expect(await fall('impressum', { abschnitte: [{ titel: 'A', text: 'x' }] })).toBe('angenommen');
    expect((await plattform.client.rpc('rechtstext_entwurf_verwerfen', { p_art: 'impressum' })).error).toBeNull();
  });

  it('„geprüft“ nur mit Namen, nur ohne offene Angaben, nie für die Betreiberangaben', async () => {
    const t = await aktuell();
    expect((await speichern(plattform, 'impressum', t.impressum.inhalt)).error).toBeNull();
    expect((await veroeffentlichen(plattform, 'impressum', true, '  ')).error?.message).toMatch(/Wer hat/);
    const offen = { abschnitte: [{ titel: 'A', text: 'UID: [UID — wird ergänzt]' }] };
    expect((await speichern(plattform, 'impressum', offen)).error).toBeNull();
    expect((await veroeffentlichen(plattform, 'impressum', true, 'Kanzlei Muster')).error?.message).toMatch(/offene Angaben/);
    expect((await speichern(plattform, 'betreiber', BETREIBER)).error).toBeNull();
    expect((await veroeffentlichen(plattform, 'betreiber', true, 'Kanzlei Muster')).error?.message).toMatch(/nicht rechtlich freigegeben/);
    await plattform.client.rpc('rechtstext_entwurf_verwerfen', { p_art: 'betreiber' });

    expect((await speichern(plattform, 'impressum', t.impressum.inhalt)).error).toBeNull();
    const { data, error } = await veroeffentlichen(plattform, 'impressum', true, ' Kanzlei Muster ');
    expect(error).toBeNull();
    expect(data).toBe(2);
    const { data: zeile } = await plattform.client.from('rechtstexte').select('geprueft, geprueft_von, hinweisen').eq('art', 'impressum').eq('nummer', 2).single();
    // Beim Impressum gibt es keinen Hinweis an alle, auch wenn er verlangt würde.
    expect(zeile).toEqual({ geprueft: true, geprueft_von: 'Kanzlei Muster', hinweisen: false });
  });
});

describe('Neue Unterauftragsverarbeiter', () => {
  it('die Fassung hält fest, wer neu ist; die Leitung jedes Betriebs sieht es, ein Monteur nicht', async () => {
    const t = await aktuell();
    const vorher = t.datenschutz.inhalt as { abschnitte: unknown[]; verarbeiter: Array<{ wer: string; wofuer: string; wo: string }> };
    const neu = { ...vorher, verarbeiter: [...vorher.verarbeiter.slice(1), { wer: 'Prüfpost GmbH', wofuer: 'Anmeldemails', wo: 'Wien' }] };
    expect((await speichern(plattform, 'datenschutz', neu)).error).toBeNull();
    expect((await veroeffentlichen(plattform, 'datenschutz', false, '', true)).error).toBeNull();
    const jetzt = await aktuell();
    expect(jetzt.datenschutz.neueVerarbeiter).toEqual(['Prüfpost GmbH']);
    expect(jetzt.datenschutz.hinweisen).toBe(true);

    const sieht = async (k: Konto) => ((await k.client.rpc('verarbeiter_aenderungen')).data as Array<{ neueVerarbeiter: string[] }>).flatMap((a) => a.neueVerarbeiter);
    expect(await sieht(chefin)).toEqual(['Prüfpost GmbH']);
    expect(await sieht(admina)).toEqual(['Prüfpost GmbH']);
    expect(await sieht(andereChefin)).toEqual(['Prüfpost GmbH']);
    expect(await sieht(monteur)).toEqual([]);
    expect(await sieht(plattform)).toEqual([]);
  });

  it('zur Kenntnis nimmt die Leitung für ihren Betrieb — der andere Betrieb sieht es weiter; ein Monteur darf es nicht', async () => {
    expect((await monteur.client.rpc('verarbeiter_zur_kenntnis_nehmen')).error?.code).toBe('42501');
    expect((await chefin.client.rpc('verarbeiter_zur_kenntnis_nehmen')).error).toBeNull();
    expect((await admina.client.rpc('verarbeiter_aenderungen')).data).toEqual([]);
    expect(((await andereChefin.client.rpc('verarbeiter_aenderungen')).data as unknown[]).length).toBe(1);
    const { data } = await admin.from('companies').select('verarbeiter_kenntnis_am').eq('id', BETRIEB).single();
    expect(data!.verarbeiter_kenntnis_am).not.toBeNull();
  });

  it('ein Betrieb, der erst danach angelegt wird, hat die Liste mit dem Vertrag übernommen und sieht nichts', async () => {
    await betriebAnlegen('rechtstexte-neu');
    const neu = await konto('rechtstexte-neu', 'Geschäftsführung', 'rt-neu');
    expect((await neu.client.rpc('verarbeiter_aenderungen')).data).toEqual([]);
  });
});
