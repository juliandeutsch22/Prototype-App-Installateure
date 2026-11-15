/**
 * BAUSTELLE GEFÜHRT ABSCHLIESSEN (Durchsicht 15.11.2026, A11 / F1).
 *
 * Ohne `20261116044000` gibt es `baustelle_abschluss_lage` und
 * `baustelle_abschliessen` nicht — „Abgeschlossen“ war ein Auswahlfeld ohne
 * Prüfung.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const A = 'a11-abschluss';
let chefin: Konto;
let pl: Konto;
let monteur: Konto;
let lauf = 0;

async function baustelle(extra: Record<string, unknown> = {}) {
  lauf += 1;
  const nummer = `AB-${Date.now()}-${lauf}`;
  const { data, error } = await admin.from('projects').insert({
    company_id: A, project_number: nummer, customer_name: 'Familie Ende', status: 'Aktiv', billing_mode: 'Regie', ...extra,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id, nummer };
}
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heute()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lage = (id: string, wer: Konto = chefin) => wer.client.rpc('baustelle_abschluss_lage', { p_projekt: id });
const abschliessen = (id: string, wer: Konto = chefin) => wer.client.rpc('baustelle_abschliessen', { p_projekt: id });

beforeAll(async () => {
  await betriebAnlegen(A, 'Abschluss Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a11-chefin');
  pl = await konto(A, 'Projektleiter', 'a11-pl');
  monteur = await konto(A, 'Mitarbeiter', 'a11-monteur');
}, 60_000);

describe('Was vor dem Abschließen offen ist', () => {
  it('zählt Einsätze ab heute, Entwürfe, Anforderungen und unverrechnete Zeit', async () => {
    const b = await baustelle();
    await admin.from('assignments').insert([
      { company_id: A, date: tagPlus(3), project_number: b.nummer, project_id: b.id, user_id: monteur.uid, user_name: 'M' },
      { company_id: A, date: tagPlus(-3), project_number: b.nummer, project_id: b.id, user_id: monteur.uid, user_name: 'M' },
    ]);
    await admin.from('work_sheets').insert({
      id: crypto.randomUUID(), company_id: A, project_id: b.id, project_number: b.nummer, customer_name: 'Familie Ende',
      datum: tagPlus(-3), status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'M',
    });
    await admin.from('material_orders').insert({
      company_id: A, project_id: b.id, project_number: b.nummer, material_name: 'Rohr', quantity: 2, status: 'Offen',
      transaction_type: 'order', user_id: monteur.uid, user_name: 'M',
    });
    const t = await admin.from('time_entries').insert(buchung(monteur, tagPlus(-3), { project_number: b.nummer, project_id: b.id }));
    expect(t.error).toBeNull();
    const { data, error } = await lage(b.id);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      status: 'Aktiv', kommende_einsaetze: 1, naechster_einsatz: tagPlus(3), schein_entwuerfe: 1, offene_anforderungen: 1,
      unverrechnete_scheine: 0, offene_rechnungen: 0,
    });
    expect((data as { unverrechnete_minuten: number }).unverrechnete_minuten).toBeGreaterThan(0);
  });

  it('die Projektleitung einer fremden Baustelle sieht nichts zu Rechnungen — null, nicht 0', async () => {
    const b = await baustelle();
    const { data } = await lage(b.id, pl);
    expect(data).toMatchObject({ unverrechnete_scheine: null, unverrechnete_minuten: null, unverrechnetes_material: null, offene_rechnungen: null });
    const eigene = await baustelle({ project_managers: [pl.uid] });
    expect((await lage(eigene.id, pl)).data).toMatchObject({ offene_rechnungen: 0, unverrechnetes_material: null });
  });

  it('nur die Führung', async () => {
    const b = await baustelle();
    expect((await lage(b.id, monteur)).error).not.toBeNull();
    expect((await abschliessen(b.id, monteur)).error).not.toBeNull();
  });
});

describe('Abschließen', () => {
  it('kommende Einsätze halten es auf — die Meldung nennt den Tag', async () => {
    const b = await baustelle();
    await admin.from('assignments').insert({ company_id: A, date: tagPlus(2), project_number: b.nummer, project_id: b.id, user_id: monteur.uid, user_name: 'M' });
    const { error } = await abschliessen(b.id);
    expect(error?.message).toMatch(/noch ein Einsatz ab dem .* geplant — erst im Einsatzplan umplanen oder entfernen/);
    expect((await admin.from('projects').select('status').eq('id', b.id).single()).data).toEqual({ status: 'Aktiv' });
  });

  it('sonst wird abgeschlossen — auch mit Entwurf (die Oberfläche hat vorher gefragt)', async () => {
    const b = await baustelle();
    await admin.from('assignments').insert({ company_id: A, date: tagPlus(-1), project_number: b.nummer, project_id: b.id, user_id: monteur.uid, user_name: 'M' });
    const { data, error } = await abschliessen(b.id);
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'Abgeschlossen', kommende_einsaetze: 0 });
    expect((await admin.from('projects').select('status').eq('id', b.id).single()).data).toEqual({ status: 'Abgeschlossen' });
  });

  it('bleibt gleich: wieder öffnen geht über den Stand wie bisher', async () => {
    const b = await baustelle({ status: 'Abgeschlossen' });
    expect((await chefin.client.from('projects').update({ status: 'Aktiv' }).eq('id', b.id)).error).toBeNull();
  });
});
