/**
 * ANNAHME ZURÜCKNEHMEN (Durchsicht 15.11.2026, A1 / F7).
 *
 * Ein angenommenes Angebot hatte keinen Rückweg: die Baustelle liess sich
 * nicht löschen (das Angebot zeigt auf sie), die andere Fassung blieb für
 * immer „Ersetzt“. Ohne die Migration `20261116040000` gibt es
 * `angebot_annahme_zuruecknehmen` und `baustelle_verwendung` nicht — jede
 * Prüfung hier ist dann rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a1-ruecknahme';
const B = 'a1-ruecknahme-b';
let db: Client;
let chefin: Konto;
let monteur: Konto;
let fremd: Konto;
let kunde = '';
let lauf = 0;

const ZEILE = [{ label: 'Montage', qty: 6, unit: 'h', unit_price: 70, netto: 420, ist_arbeitszeit: true }];
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function angebot(extra: Record<string, unknown> = {}, wer: Konto = chefin): Promise<string> {
  lauf += 1;
  const { data, error } = await wer.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-A1-${Date.now()}-${lauf}`, customer_id: kunde, customer_name: 'Familie Rück',
      quote_date: '2026-11-10', valid_until: '2099-12-31', vat_rate: 0.2, status: 'Entwurf',
      kalkulierte_stunden: 6, ...extra,
    },
    p_positionen: ZEILE,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Über den gewöhnlichen Weg versenden — die Auslöser setzen Tag und Firmendaten. */
async function versenden(id: string) {
  const { error } = await chefin.client.rpc('angebot_speichern', { p_id: id, p_kopf: { status: 'Versendet' }, p_positionen: null });
  if (error) throw new Error(error.message);
}

const annehmen = (id: string, wer: Konto = chefin) =>
  wer.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'RN', p_abrechnung: 'Pauschal' });
const zuruecknehmen = (id: string, grund: string | null = 'Kunde ist zurückgetreten', wer: Konto = chefin) =>
  wer.client.rpc('angebot_annahme_zuruecknehmen', { p_angebot: id, p_grund: grund });

async function zeile(id: string) {
  return (await admin.from('quotes').select('*').eq('id', id).single()).data as Record<string, unknown>;
}
async function baustelle(nummer: string) {
  return (await admin.from('projects').select('*').eq('company_id', A).eq('project_number', nummer).maybeSingle()).data as
    Record<string, unknown> | null;
}

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(A, 'Rücknahme Installationen');
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'a1-chefin');
  monteur = await konto(A, 'Mitarbeiter', 'a1-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'a1-fremd');
  const { data } = await admin.from('customers').insert({ company_id: A, name: 'Familie Rück' }).select('id').single();
  kunde = (data as { id: string }).id;
}, 60_000);
afterAll(async () => { await db?.end(); });

describe('Annahme zurücknehmen', () => {
  it('Fehlklick: die leere Baustelle geht, das Angebot und die ersetzte Fassung sind wieder offen', async () => {
    const alt = await angebot();
    await versenden(alt);
    const neu = await angebot({ vorgaenger_id: alt });
    const vorher = await zeile(alt);
    const { data: nummer, error } = await annehmen(alt);
    expect(error).toBeNull();
    expect((await zeile(neu)).status).toBe('Ersetzt');
    expect(await baustelle(String(nummer))).not.toBeNull();

    const r = await zuruecknehmen(alt, '  Falsche Zeile angetippt  ');
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ status: 'Versendet', ergebnis: 'geloescht', baustelle: nummer, baustelle_id: null });
    expect((r.data as { wieder_offen: string[] }).wieder_offen).toEqual([(await zeile(neu)).quote_number]);

    const jetzt = await zeile(alt);
    expect(jetzt).toMatchObject({
      status: 'Versendet', project_number: null, project_id: null, angenommen_am: null,
      annahme_zurueckgenommen_grund: 'Falsche Zeile angetippt',
      // Derselbe Versand: Tag und Firmendaten wie vor der Annahme.
      versendet_am: vorher.versendet_am, aussteller_stand: vorher.aussteller_stand,
    });
    expect(jetzt.annahme_zurueckgenommen_am).not.toBeNull();
    // Die ersetzte Fassung war nie versendet: wieder ein Entwurf, mit den heutigen Firmendaten.
    expect(await zeile(neu)).toMatchObject({ status: 'Entwurf', aussteller_stand: null, versendet_am: null });
    expect(await baustelle(String(nummer))).toBeNull();

    // Danach geht es weiter wie mit jedem offenen Angebot — auch die andere Fassung lässt sich annehmen.
    const zweit = await annehmen(neu);
    expect(zweit.error).toBeNull();
    expect((await zeile(alt)).status).toBe('Ersetzt');
  });

  it('hängt etwas an der Baustelle, wird sie abgeschlossen statt gelöscht — nichts geht verloren', async () => {
    const id = await angebot();
    const { data: nummer } = await annehmen(id);
    const b = (await baustelle(String(nummer)))!;
    const { error: te } = await admin.from('termine').insert({
      company_id: A, project_id: b.id, project_number: nummer, datum: '2026-11-20', art: 'Besichtigung',
    });
    expect(te).toBeNull();

    const r = await zuruecknehmen(id, 'Kunde hat storniert');
    expect(r.error).toBeNull();
    // Nie versendet: wieder ein Entwurf.
    expect(r.data).toMatchObject({ status: 'Entwurf', ergebnis: 'abgeschlossen', baustelle_id: b.id });
    expect(await baustelle(String(nummer))).toMatchObject({ status: 'Abgeschlossen' });
    expect((await admin.from('termine').select('id').eq('project_id', b.id)).data).toHaveLength(1);
    expect(await zeile(id)).toMatchObject({ status: 'Entwurf', project_id: null, aussteller_stand: null });
  });

  it('ohne Grund, ohne Annahme, ohne Recht oder im fremden Betrieb geschieht nichts', async () => {
    const id = await angebot();
    expect((await zuruecknehmen(id)).error?.message).toMatch(/nur eine Annahme — .* „Entwurf“/);
    const { data: nummer } = await annehmen(id);
    for (const grund of [null, '', '  x ']) {
      expect((await zuruecknehmen(id, grund)).error?.message).toMatch(/Bitte einen Grund angeben/);
    }
    expect((await zuruecknehmen(id, 'Monteur', monteur)).error).not.toBeNull();
    expect((await zuruecknehmen(id, 'Fremd', fremd)).error?.message).toMatch(/nicht gefunden/);
    expect((await zeile(id)).status).toBe('Angenommen');
    expect(await baustelle(String(nummer))).not.toBeNull();
  });

  it('das Journal hält fest, wer es war — mit dem Grund', async () => {
    const id = await angebot();
    await annehmen(id);
    await zuruecknehmen(id, 'Rücktritt nach Fernabsatz');
    const { data } = await admin.from('aenderungsjournal').select('aenderungen, von_uid')
      .eq('objektart', 'angebot').eq('objekt_id', id).order('am', { ascending: false }).limit(1);
    const j = (data ?? [])[0] as { aenderungen: Record<string, { neu: unknown }>; von_uid: string };
    expect(j.von_uid).toBe(chefin.uid);
    expect(j.aenderungen.status.neu).toBe('Entwurf');
    expect(j.aenderungen.annahme_zurueckgenommen_grund.neu).toBe('Rücktritt nach Fernabsatz');
  });

  it('über den Link angenommen: Name, Unterschrift und Prüfsumme bleiben — ein neuer Link geht wieder', async () => {
    const id = await angebot();
    const { data: link, error } = await chefin.client.rpc('angebot_link_erzeugen', {
      p_angebot: id, p_abrechnung: 'Regie', p_praefix: 'RN', p_gueltig_bis: null,
    });
    expect(error).toBeNull();
    const schluessel = (link as { schluessel: string }).schluessel;
    expect((await admin.rpc('angebot_link_annehmen', {
      p_hash: sha(schluessel), p_name: 'Rita Rück', p_unterschrift: BILD, p_bestaetigt: true,
    })).error).toBeNull();
    const vorher = (await admin.from('angebot_links').select('*').eq('quote_id', id).single()).data as Record<string, unknown>;

    expect((await zuruecknehmen(id, 'Rücktritt innerhalb der Frist')).error).toBeNull();
    const nachher = (await admin.from('angebot_links').select('*').eq('quote_id', id).single()).data as Record<string, unknown>;
    expect(nachher).toMatchObject({
      angenommen_am: vorher.angenommen_am, angenommen_name: 'Rita Rück', angenommen_unterschrift: BILD,
      schnappschuss_hash: vorher.schnappschuss_hash,
    });
    expect((await zeile(id)).status).toBe('Versendet');
    expect((await chefin.client.rpc('angebot_link_erzeugen', {
      p_angebot: id, p_abrechnung: 'Regie', p_praefix: 'RN', p_gueltig_bis: null,
    })).error).toBeNull();
  });

  it('bleibt gleich: „Ersetzt“ wird auf jedem anderen Weg nicht wieder offen, der Versand setzt weiter den Tag', async () => {
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    await annehmen(neu);
    const { error } = await chefin.client.from('quotes').update({ status: 'Versendet' }).eq('id', alt);
    expect(error?.message).toMatch(/ersetzt und wird nicht wieder offen/);
    // Die Einstellung der Rücknahme lässt sich von aussen nicht setzen: ein gewöhnlicher Versand stempelt.
    const frisch = await angebot();
    await versenden(frisch);
    expect((await zeile(frisch)).versendet_am).not.toBeNull();
    expect((await zeile(frisch)).aussteller_stand).not.toBeNull();
  });
});

describe('Was an einer Baustelle hängt (baustelle_verwendung)', () => {
  it('zählt je Art und nennt die Angebote — nur für die Führung des eigenen Betriebs', async () => {
    const id = await angebot();
    const { data: nummer } = await annehmen(id);
    const b = (await baustelle(String(nummer)))!;
    const { data, error } = await chefin.client.rpc('baustelle_verwendung', { p_projekt: b.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      zeitbuchungen: 0, einsaetze: 0, scheine: 0, rechnungen: 0, anforderungen: 0, ruestlisten: 0,
      dokumente: 0, termine: 0, nachrichten: 0,
    });
    expect((data as { angebote: { id: string; status: string }[] }).angebote).toEqual([
      expect.objectContaining({ id, status: 'Angenommen' }),
    ]);
    expect((await monteur.client.rpc('baustelle_verwendung', { p_projekt: b.id })).error).not.toBeNull();
    expect((await fremd.client.rpc('baustelle_verwendung', { p_projekt: b.id })).error?.message).toMatch(/nicht gefunden/);
  });
});
