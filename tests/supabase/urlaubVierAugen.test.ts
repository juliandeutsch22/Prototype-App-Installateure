/**
 * Über den eigenen Urlaubsantrag entscheidet jemand anderer — gegen die
 * echte Datenbank.
 *
 * LAUNCH-CHECK 25.09.2026, K4: „Genehmigt von Julian Deutsch" auf seinem
 * eigenen Antrag. Geschäftsführung und Administration durften immer
 * entscheiden, also auch über sich selbst.
 *
 * Die Tage liegen im Februar 2027.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const ZWEI = 'vier-augen';
const ALLEIN = 'vier-augen-allein';

let chef: Konto;
let verwalterin: Konto;
let buch: Konto;
let alleinChef: Konto;

async function antrag(k: Konto, von: string, bis: string): Promise<string> {
  const { data, error } = await admin.from('vacations').insert({
    company_id: k.betrieb, user_id: k.uid, user_name: 'Antrag', von, bis, tage: 1, status: 'Beantragt',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

const entscheiden = (k: Konto, id: string, entscheidung = 'Genehmigt') =>
  k.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: entscheidung, p_grund: 'Grund' });

beforeAll(async () => {
  await betriebAnlegen(ZWEI);
  await betriebAnlegen(ALLEIN);
  chef = await konto(ZWEI, 'Geschäftsführung', 'vachef');
  verwalterin = await konto(ZWEI, 'Administrator', 'vaadm');
  buch = await konto(ZWEI, 'Buchhaltung', 'vabuch');
  alleinChef = await konto(ALLEIN, 'Geschäftsführung', 'vaallein');
}, 180_000);

describe('Vier Augen beim Urlaub', () => {
  it('die Geschäftsführung genehmigt sich nicht selbst — die Administration schon', async () => {
    const id = await antrag(chef, '2027-02-01', '2027-02-01');
    const selbst = await entscheiden(chef, id);
    expect(selbst.error?.message).toMatch(/entscheidet jemand anderer — hier gilt das Vier-Augen-Prinzip/);
    const { data } = await admin.from('vacations').select('status').eq('id', id).single();
    expect(data!.status).toBe('Beantragt');

    const andere = await entscheiden(verwalterin, id);
    expect(andere.error).toBeNull();
  });

  it('auch nicht ablehnen, und nicht am Antrag vorbei eintragen', async () => {
    const id = await antrag(chef, '2027-02-02', '2027-02-02');
    expect((await entscheiden(chef, id, 'Abgelehnt')).error?.message).toMatch(/Vier-Augen/);
    const eingetragen = await buch.client.rpc('urlaub_eintragen', {
      p_user: buch.uid, p_von: '2027-02-03', p_bis: '2027-02-03', p_notiz: null, p_name: 'Selbst',
    });
    expect(eingetragen.error?.message).toMatch(/Vier-Augen/);
  });

  it('wer allein entscheiden kann, entscheidet auch über sich', async () => {
    // Sonst bliebe der Antrag der einzigen Geschäftsführerin für immer offen.
    const id = await antrag(alleinChef, '2027-02-04', '2027-02-04');
    expect((await entscheiden(alleinChef, id)).error).toBeNull();
  });

  it('der Betriebsurlaub bucht auch der Person, die ihn anlegt', async () => {
    const { error } = await chef.client.rpc('betriebsurlaub_anlegen', {
      p_von: '2027-02-08', p_bis: '2027-02-09', p_bezeichnung: 'Semesterferien',
      p_abbuchen: true, p_name: 'Chef', p_ausgenommen: [],
    });
    expect(error).toBeNull();
    const { data } = await admin.from('vacations').select('status').eq('user_id', chef.uid).gte('von', '2027-02-08');
    expect(data?.map((z) => z.status)).toContain('Genehmigt');
  });
});
