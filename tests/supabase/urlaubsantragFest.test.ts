/**
 * Ein Urlaubsantrag ist, was beantragt wurde — und was entschieden ist,
 * bleibt. Gegen die echte Datenbank.
 *
 * PRÜFLAUF 25.09.2026:
 *   P1-08  der Antragsteller holte einen entschiedenen Antrag zurück und
 *          änderte ihn;
 *   P3-13  die Projektleitung änderte fremde offene Anträge, ohne über Urlaub
 *          zu entscheiden;
 *   P3-24  zwischen dem Blick des Genehmigenden und seinem Klick konnte sich
 *          der Zeitraum ändern.
 *
 * Die Tage liegen im März 2027.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'urlaub-fest';

let monteur: Konto;
let leitung: Konto;
let buch: Konto;

async function antrag(k: Konto, von: string, bis = von): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await k.client.from('vacations').insert({
    id, company_id: BETRIEB, user_id: k.uid, user_name: 'Antrag', von, bis, tage: 1,
    status: 'Beantragt',
  });
  if (error) throw new Error(error.message);
  return id;
}

async function stand(id: string) {
  const { data } = await admin.from('vacations').select('status, von, bis, tage').eq('id', id).single();
  return data!;
}

const entscheiden = (k: Konto, id: string, entscheidung: string, grund = '') =>
  k.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: entscheidung, p_grund: grund });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Urlaub fest');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'uffmon');
  leitung = await konto(BETRIEB, 'Projektleiter', 'uffpl');
  buch = await konto(BETRIEB, 'Buchhaltung', 'uffbuch');
}, 120_000);

describe('Der Antragsteller', () => {
  it('holt einen stornierten Antrag nicht zurück — und löscht ihn danach nicht', async () => {
    const id = await antrag(monteur, '2027-03-01');
    expect((await entscheiden(buch, id, 'Genehmigt')).error).toBeNull();
    expect((await entscheiden(buch, id, 'Storniert', 'Doch nicht')).error).toBeNull();

    const zurueck = await monteur.client.from('vacations').update({ status: 'Beantragt' }).eq('id', id);
    expect(zurueck.error?.code).toBe('42501');
    await monteur.client.from('vacations').delete().eq('id', id);
    expect(await stand(id)).toMatchObject({ status: 'Storniert' });
  });

  it('ändert an einem genehmigten Antrag nichts — auch nicht die Tage', async () => {
    const id = await antrag(monteur, '2027-03-02');
    await entscheiden(buch, id, 'Genehmigt');
    const tage = await monteur.client.from('vacations').update({ tage: 0 }).eq('id', id);
    expect(tage.error?.code).toBe('42501');
    expect(await stand(id)).toMatchObject({ status: 'Genehmigt', tage: 1 });
  });

  it('verschiebt auch einen offenen Antrag nicht — er zieht zurück und beantragt neu', async () => {
    // Was der Genehmigende sieht, ist, was er genehmigt (P3-24).
    const id = await antrag(monteur, '2027-03-03');
    const verschoben = await monteur.client.from('vacations')
      .update({ von: '2027-03-08', bis: '2027-03-12', tage: 5 }).eq('id', id);
    expect(verschoben.error?.code).toBe('42501');
    expect(await stand(id)).toMatchObject({ von: '2027-03-03', bis: '2027-03-03', tage: 1 });
  });

  it('zieht einen offenen Antrag weiter zurück und ergänzt eine Notiz', async () => {
    const id = await antrag(monteur, '2027-03-04');
    const notiz = await monteur.client.from('vacations').update({ notiz: 'Hochzeit' }).eq('id', id);
    expect(notiz.error).toBeNull();
    const weg = await monteur.client.from('vacations').delete().eq('id', id);
    expect(weg.error).toBeNull();
    expect((await admin.from('vacations').select('id').eq('id', id)).data).toEqual([]);
  });
});

describe('Die Projektleitung', () => {
  it('sieht fremde Anträge, ändert sie aber nicht', async () => {
    const id = await antrag(monteur, '2027-03-05');
    expect((await leitung.client.from('vacations').select('id').eq('id', id)).data).toHaveLength(1);

    const storniert = await leitung.client.from('vacations').update({ status: 'Storniert' }).eq('id', id);
    expect(storniert.error?.code).toBe('42501');
    const notiz = await leitung.client.from('vacations').update({ notiz: 'von der Leitung' }).eq('id', id);
    expect(notiz.error?.code).toBe('42501');
    expect(await stand(id)).toMatchObject({ status: 'Beantragt' });
  });
});

describe('Wer entscheidet', () => {
  it('entscheidet über die App weiter wie bisher', async () => {
    const id = await antrag(monteur, '2027-03-08');
    expect((await entscheiden(buch, id, 'Genehmigt')).error).toBeNull();
    expect(await stand(id)).toMatchObject({ status: 'Genehmigt' });
  });

  it('verschiebt aber auch selbst keinen Zeitraum am Antrag vorbei', async () => {
    const id = await antrag(monteur, '2027-03-09');
    const { error } = await buch.client.from('vacations')
      .update({ von: '2027-03-10', bis: '2027-03-10' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });
});
