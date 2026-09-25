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
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

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

describe('Vier Augen auch auf den Umwegen', () => {
  /*
    PRÜFLAUF 25.09.2026 (P3-09). Zwei Wege führten am Vier-Augen-Prinzip
    vorbei: ein Betriebsurlaub, der alle ausser der anlegenden Person
    ausnimmt, und der direkt gebuchte Zeitausgleich für sich selbst.
  */
  const za = (k: Konto, datum: string) =>
    buchung(k, datum, { status: 'Zeitausgleich', start_time: null, end_time: null, break_duration: 0 });

  it('ein Betriebsurlaub nur für sich selbst ist ein eigener Urlaub', async () => {
    const { error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: '2027-02-15', p_bis: '2027-02-16', p_bezeichnung: 'Betriebsurlaub',
      p_abbuchen: true, p_name: 'Buchhaltung', p_ausgenommen: [chef.uid, verwalterin.uid],
    });
    expect(error?.message).toMatch(/Vier-Augen/);
    // Nichts davon ist stehen geblieben — weder der Zeitraum noch der Urlaub.
    const { data: zeitraum } = await admin.from('betriebsurlaube')
      .select('id').eq('company_id', ZWEI).eq('von', '2027-02-15');
    expect(zeitraum).toEqual([]);
    const { data: urlaub } = await admin.from('vacations')
      .select('id').eq('user_id', buch.uid).eq('von', '2027-02-15');
    expect(urlaub).toEqual([]);
  });

  it('trifft er auch andere, bucht er der anlegenden Person weiter mit', async () => {
    const { error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: '2027-02-22', p_bis: '2027-02-23', p_bezeichnung: 'Inventur',
      p_abbuchen: true, p_name: 'Buchhaltung', p_ausgenommen: [chef.uid],
    });
    expect(error).toBeNull();
    const { data } = await admin.from('vacations')
      .select('status').eq('user_id', buch.uid).eq('von', '2027-02-22');
    expect(data?.map((z) => z.status)).toEqual(['Genehmigt']);
  });

  it('Zeitausgleich für sich selbst bucht das Büro nicht direkt', async () => {
    const selbst = await buch.client.from('time_entries').insert(za(buch, '2027-02-17'));
    expect(selbst.error?.message).toMatch(/Vier-Augen/);

    // Für jemand anderen weiter — dafür ist der direkte Weg da.
    const fuerChef = await buch.client.from('time_entries').insert(za(chef, '2027-02-17'));
    expect(fuerChef.error).toBeNull();
  });

  it('wer allein entscheidet, bucht auch den eigenen Zeitausgleich', async () => {
    const { error } = await alleinChef.client.from('time_entries').insert(za(alleinChef, '2027-02-17'));
    expect(error).toBeNull();
  });
});
