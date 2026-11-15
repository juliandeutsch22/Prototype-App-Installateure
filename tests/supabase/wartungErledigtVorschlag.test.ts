/**
 * „WARTUNG ERLEDIGT“ HÄNGT NICHT MEHR AN NIEMANDEM (Durchsicht 15.11.2026, A9).
 *
 * Ohne `20261116043000` gibt es `wartung_erledigt_vorschlaege` nicht — die
 * Startseite hatte für eine eingeplante Wartung keinen Anstoß.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a9-wartung';
let chefin: Konto;
let monteur: Konto;
let kunde = '';
let lauf = 0;

async function eingeplant(stand: 'Aktiv' | 'Abgeschlossen' = 'Aktiv', extra: Record<string, unknown> = {}) {
  lauf += 1;
  const nummer = `WA-${Date.now()}-${lauf}`;
  const { data: p } = await admin.from('projects').insert({
    company_id: A, project_number: nummer, customer_id: kunde, customer_name: 'Familie Koller', status: stand,
    end_date: stand === 'Abgeschlossen' ? '2026-11-05' : null,
  }).select('id').single();
  const { data: w } = await admin.from('wartungen').insert({
    company_id: A, customer_id: kunde, customer_name: 'Familie Koller', anlage: `Therme ${lauf}`, intervall_monate: 12,
    faellig_am: '2026-11-01', offene_baustelle: nummer, zuletzt_am: '2025-11-01', ...extra,
  }).select('id').single();
  return { projekt: (p as { id: string }).id, nummer, wartung: (w as { id: string }).id };
}
async function schein(projekt: string, nummer: string, datum: string, status = 'Unterschrieben') {
  const { error } = await admin.from('work_sheets').insert({
    id: crypto.randomUUID(), company_id: A, project_id: projekt, project_number: nummer, customer_name: 'Familie Koller', datum, status,
    abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
  });
  if (error) throw new Error(error.message);
}
const vorschlaege = async (wer: Konto = chefin) =>
  ((await wer.client.rpc('wartung_erledigt_vorschlaege')).data ?? []) as { wartung: string; am: string; grund: string; baustelle: string }[];

beforeAll(async () => {
  await betriebAnlegen(A, 'Wartung Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a9-chefin');
  monteur = await konto(A, 'Mitarbeiter', 'a9-monteur');
  const { data } = await admin.from('customers').insert({ company_id: A, name: 'Familie Koller' }).select('id').single();
  kunde = (data as { id: string }).id;
}, 60_000);

describe('Vorschlag „erledigt am …?“', () => {
  it('ein unterschriebener Schein auf der Baustelle: sein Tag', async () => {
    const x = await eingeplant();
    await schein(x.projekt, x.nummer, '2026-11-10');
    await schein(x.projekt, x.nummer, '2026-11-12', 'Entwurf');
    expect((await vorschlaege()).find((v) => v.wartung === x.wartung)).toMatchObject({ am: '2026-11-10', grund: 'schein', baustelle: x.nummer });
  });

  it('eine abgeschlossene Baustelle ohne Schein: ihr Ende', async () => {
    const x = await eingeplant('Abgeschlossen');
    expect((await vorschlaege()).find((v) => v.wartung === x.wartung)).toMatchObject({ am: '2026-11-05', grund: 'abgeschlossen' });
  });

  it('nichts, solange nichts darauf hindeutet — und ein Schein vor der letzten Ausführung zählt nicht', async () => {
    const x = await eingeplant();
    await schein(x.projekt, x.nummer, '2025-10-01');
    expect((await vorschlaege()).find((v) => v.wartung === x.wartung)).toBeUndefined();
  });

  it('nur für die Führung', async () => {
    const x = await eingeplant('Abgeschlossen');
    expect((await vorschlaege(monteur)).find((v) => v.wartung === x.wartung)).toBeUndefined();
  });
});
