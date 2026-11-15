/**
 * K6 (Durchsicht 15.11.2026): wer vor dem Einschalten der Zwei-Faktor-Pflicht
 * noch keinen Faktor hat — `zwei_faktor_ohne_faktor` gegen die echte
 * Datenbank.
 *
 * GEGENPROBE (Erwartung): ohne die Migration gibt es die Funktion nicht —
 * alle Fälle rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { betriebAnlegen, deaktivieren, konto, zweitenFaktorEinrichten, type Konto } from './helfer';

const BETRIEB = 'zf-ohne-a';
const FREMD = 'zf-ohne-b';

let chefin: Konto;
let buch: Konto;
let admin2: Konto;
let monteur: Konto;
let weg: Konto;
let fremdeBuch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'zf-ohne-chefin');
  await zweitenFaktorEinrichten(chefin.client);
  buch = await konto(BETRIEB, 'Buchhaltung', 'zf-ohne-buch');
  admin2 = await konto(BETRIEB, 'Administrator', 'zf-ohne-admin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zf-ohne-monteur');
  weg = await konto(BETRIEB, 'Buchhaltung', 'zf-ohne-weg');
  await deaktivieren(weg.uid);
  fremdeBuch = await konto(FREMD, 'Buchhaltung', 'zf-ohne-fremd');
}, 180_000);

describe('Wen die Pflicht träfe', () => {
  it('Leitung und Buchhaltung ohne Faktor — nicht wer einen hat, nicht der Monteur, nicht Deaktivierte, nicht Fremde', async () => {
    const { data, error } = await chefin.client.rpc('zwei_faktor_ohne_faktor');
    expect(error).toBeNull();
    const uids = ((data ?? []) as Array<{ uid: string; rolle: string }>).map((z) => z.uid);
    expect(uids).toContain(buch.uid);
    expect(uids).toContain(admin2.uid);
    expect(uids).not.toContain(chefin.uid);
    expect(uids).not.toContain(monteur.uid);
    expect(uids).not.toContain(weg.uid);
    expect(uids).not.toContain(fremdeBuch.uid);
  }, 60_000);

  it('nur die Spitze fragt — Buchhaltung und Monteur nicht', async () => {
    expect((await buch.client.rpc('zwei_faktor_ohne_faktor')).error?.code).toBe('42501');
    expect((await monteur.client.rpc('zwei_faktor_ohne_faktor')).error?.code).toBe('42501');
  }, 60_000);
});
