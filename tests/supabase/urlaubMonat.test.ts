/**
 * Urlaub im Monat (12.10.2026, Plan 17 H) — gegen die echte Datenbank.
 *
 * Die Monatskarte und „Gleichzeitig im Urlaub“ lesen den genehmigten Urlaub
 * des Betriebs über `listApprovedVacationsInRange`. Das geht nur, weil wer
 * entscheidet, ihn lesen darf (`vacations_lesen` über
 * `app.darf_urlaub_entscheiden`) — auch eine eingetragene Verwaltungskraft.
 * Hier steht fest, dass die Ansicht ihre Daten wirklich bekommt, und dass
 * niemand sonst mehr sieht als vorher.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as urlaub from '@/lib/db/vacations';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'urlaub-monat';

let verwaltung: Konto;
let monteur: Konto;
let kollegin: Konto;

async function genehmigt(k: Konto, von: string, bis: string): Promise<void> {
  const { error } = await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: k.uid, user_name: 'Person', von, bis, tage: 1, status: 'Genehmigt',
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'umverw');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ummont');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'umkoll');
  await genehmigt(monteur, '2026-11-16', '2026-11-20');
  await genehmigt(kollegin, '2026-11-18', '2026-11-19');
  const { error } = await admin.from('companies').update({ vacation_approvers: [verwaltung.uid] }).eq('id', BETRIEB);
  if (error) throw new Error(error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Urlaub im Monat: wer ihn lesen darf', () => {
  it('die eingetragene Verwaltungskraft bekommt den genehmigten Urlaub aller', async () => {
    clientEinreichen(verwaltung.client);
    const liste = await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-11-01', '2026-11-30', 1000);
    expect(liste.map((v) => v.userId).sort()).toEqual([kollegin.uid, monteur.uid].sort());
  });

  it('gleich geblieben: ein Monteur sieht nur seinen eigenen', async () => {
    clientEinreichen(monteur.client);
    const liste = await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-11-01', '2026-11-30', 1000);
    expect(liste.map((v) => v.userId)).toEqual([monteur.uid]);
  });

  it('gleich geblieben: steht die Verwaltungskraft nicht mehr darauf, sieht sie nichts', async () => {
    await admin.from('companies').update({ vacation_approvers: [kollegin.uid] }).eq('id', BETRIEB);
    clientEinreichen(verwaltung.client);
    expect(await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-11-01', '2026-11-30', 1000)).toEqual([]);
    await admin.from('companies').update({ vacation_approvers: [verwaltung.uid] }).eq('id', BETRIEB);
  });
});
