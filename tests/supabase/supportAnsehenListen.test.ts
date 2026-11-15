/**
 * K7 (Durchsicht 15.11.2026): Support „Nur ansehen“ sieht, was ihm zugesagt
 * ist — „wie ein Administrator, ausgenommen Zeitbuchungen, Urlaube,
 * Krankenstände, Angebote und Scheinfotos“.
 *
 * VORHER (gemessen): Einkaufsliste, Sicherungsläufe, Lagerbewegungen,
 * Materialanforderungen, Schreibbefehle, Kontoumstellungen und Termine waren
 * mit „ansehen“ leer — der Support sah „keine Sicherung gelaufen“.
 *
 * GEGENPROBE (Erwartung): ohne `20261116074100_support_ansehen_listen.sql`
 * ist „sieht die Listen“ rot (0 statt 1 je Tabelle); „Ausnahmen bleiben“,
 * „schreibt nicht“ und „ohne Einblick nichts“ sind in beiden Fassungen grün.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, buchung, type Konto } from './helfer';

const BETRIEB = 'sup-ansehen-a';
const LISTEN = [
  'einkauf_posten', 'system_laeufe', 'lagerbewegungen', 'material_orders',
  'befehle_vorgaenge', 'konto_umstellungen', 'termine',
] as const;

let chefin: Konto;
let monteur: Konto;
let plattform: Konto;

async function pflicht(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'sup-ans-chefin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'sup-ans-monteur');
  plattform = await plattformkonto('sup-ans-plattform');

  // Je Liste genau eine Zeile — frisch, damit die Zahl stimmt.
  for (const t of LISTEN) await admin.from(t).delete().eq('company_id', BETRIEB);
  const material = crypto.randomUUID();
  await pflicht(admin.from('materials').insert({ id: material, company_id: BETRIEB, name: 'Kupferrohr 15' }));
  await pflicht(admin.from('einkauf_posten').insert({ company_id: BETRIEB, material_name: 'Kupferrohr 15', menge: 10 }));
  await pflicht(admin.rpc('lauf_festhalten', {
    p_betrieb: BETRIEB, p_art: 'ausleitung', p_erfolg: true, p_meldung: null,
    p_kennzahl: 12, p_kennzahl_einheit: 'Zeilen', p_ziel_extern: false,
  }));
  await pflicht(admin.from('lagerbewegungen').insert({
    company_id: BETRIEB, material_id: material, art: 'eingang', menge: 10, bestand_nachher: 10,
  }));
  await pflicht(admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Kupferrohr 15', quantity: 2,
    user_id: monteur.uid, status: 'Offen', transaction_type: 'order',
  }));
  await pflicht(admin.from('befehle_vorgaenge').insert({
    company_id: BETRIEB, vorgang: crypto.randomUUID(), befehl: 'umlagern', nutzlast_hash: 'x',
  }));
  await pflicht(admin.from('konto_umstellungen').insert({
    company_id: BETRIEB, user_id: monteur.uid, nach: 'benutzername', grund: 'kein Mailkonto', durch: chefin.uid,
  }));
  const kunde = crypto.randomUUID();
  await pflicht(admin.from('customers').insert({ id: kunde, company_id: BETRIEB, name: 'Familie Huber' }));
  await pflicht(admin.from('termine').insert({
    company_id: BETRIEB, datum: '2026-11-20', art: 'Kundentermin', customer_id: kunde, teilnehmer: [monteur.uid],
  }));
  await pflicht(admin.from('time_entries').insert(buchung(monteur, '2026-11-14')));

  await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
}, 240_000);

async function freigeben(stufe: 'ansehen' | 'mitarbeiten') {
  const { data, error } = await chefin.client.from('support_freigaben').insert({
    company_id: BETRIEB, gewaehrt_von: chefin.uid, grund: 'Sicherung läuft nicht', stufe,
    gilt_bis: new Date(Date.now() + 4 * 3600_000).toISOString(),
  }).select('id').single();
  if (error) throw new Error(error.message);
  await einblickBeginnen(plattform, BETRIEB, (data as { id: string }).id);
}

async function zahl(t: string): Promise<number> {
  const { data, error } = await plattform.client.from(t).select('company_id').eq('company_id', BETRIEB);
  if (error) throw new Error(`${t}: ${error.message}`);
  return (data ?? []).length;
}

describe('Support „Nur ansehen“', () => {
  it('ohne Einblick sieht die Plattform nichts davon', async () => {
    for (const t of LISTEN) expect(await zahl(t), t).toBe(0);
  }, 60_000);

  it('sieht Einkaufsliste, Sicherungsläufe und die übrigen Listen wie ein Administrator', async () => {
    await freigeben('ansehen');
    const gesehen = Object.fromEntries(await Promise.all(LISTEN.map(async (t) => [t, await zahl(t)])));
    expect(gesehen).toEqual(Object.fromEntries(LISTEN.map((t) => [t, 1])));
  }, 60_000);

  it('bleibt gleich: die Ausnahmen der Zusage bleiben zu — Zeitbuchungen etwa', async () => {
    expect(await zahl('time_entries')).toBe(0);
  }, 60_000);

  it('bleibt gleich: er schreibt nichts', async () => {
    const { error } = await plattform.client.from('einkauf_posten').insert({
      company_id: BETRIEB, material_name: 'vom Support', menge: 1,
    });
    expect(error).not.toBeNull();
  }, 60_000);

  it('bleibt gleich: der Monteur sieht die Einkaufsliste weiter nicht', async () => {
    const { data } = await monteur.client.from('einkauf_posten').select('id').eq('company_id', BETRIEB);
    expect(data ?? []).toHaveLength(0);
  }, 60_000);
});
