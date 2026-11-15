/**
 * Genehmigten Urlaub kürzen (Z1, Durchsicht 15.11.2026).
 *
 * Bisher ließ sich ein genehmigter Urlaub nur ganz zurücknehmen — und mit
 * Modul Urlaub nur am eigenen Antrag. `urlaub_kuerzen` verkleinert den
 * Zeitraum und streicht Tage; ein Tag mitten im Urlaub teilt den Antrag.
 *
 * Gegenprobe: ohne 20261116031000_urlaub_kuerzen.sql gibt es die Funktion
 * nicht — jede Prüfung hier außer „bleibt gleich“ ist rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

const BETRIEB = 'urlaub-kuerzen';

let chefin: Konto;
let buchhaltung: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'buero');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
}, 120_000);

/** Ein Antrag, genehmigt von der Chefin — die Tage stehen danach im Zeitkonto. */
async function genehmigt(fuer: Konto, von: string, bis: string, art: 'Urlaub' | 'Zeitausgleich' = 'Urlaub', extra: Record<string, unknown> = {}) {
  const { data, error } = await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: fuer.uid, user_name: 'Person', von, bis, tage: 10, status: 'Beantragt', art, ...extra,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const entscheider = fuer.uid === chefin.uid ? buchhaltung : chefin;
  const { error: e2 } = await entscheider.client.rpc('urlaub_entscheiden', {
    p_antrag: data!.id, p_entscheidung: 'Genehmigt', p_grund: '', p_entscheider_name: 'Chefin',
  });
  if (e2) throw new Error(e2.message);
  return data!.id as string;
}

const kuerzen = (k: Konto, id: string, von: string, bis: string, streichen: string[] = [], grund = 'Wird gebraucht') =>
  k.client.rpc('urlaub_kuerzen', { p_antrag: id, p_von: von, p_bis: bis, p_streichen: streichen, p_grund: grund, p_name: 'Chefin' });

async function antraegeVon(uid: string, ab: string, bis: string) {
  const { data } = await admin.from('vacations').select('id, von, bis, tage, status, aenderungen, genehmigt_am')
    .eq('user_id', uid).gte('von', ab).lte('von', bis).order('von');
  return data ?? [];
}

async function tageImKonto(id: string) {
  const { data } = await admin.from('time_entries').select('date').eq('vacation_id', id).order('date');
  return (data ?? []).map((z) => z.date as string);
}

describe('Genehmigten Urlaub kürzen (Z1)', () => {
  it('früher zurück: die Tage danach verlassen das Zeitkonto, tage folgt, der Verlauf steht am Antrag', async () => {
    // Mo 2.8. – Fr 6.8.2027, fünf Arbeitstage
    const id = await genehmigt(monteur, '2027-08-02', '2027-08-06');
    const { data, error } = await kuerzen(chefin, id, '2027-08-02', '2027-08-04', [], 'Kommt früher zurück');
    expect(error).toBeNull();
    expect(data).toMatchObject({ entfernt: 2, teile: 1 });
    expect(await tageImKonto(id)).toEqual(['2027-08-02', '2027-08-03', '2027-08-04']);
    const [a] = await antraegeVon(monteur.uid, '2027-08-01', '2027-08-31');
    expect(a).toMatchObject({ von: '2027-08-02', bis: '2027-08-04', tage: 3, status: 'Genehmigt' });
    expect(a.aenderungen).toHaveLength(1);
    expect(a.aenderungen[0]).toMatchObject({
      art: 'gekuerzt', von: 'Chefin', grund: 'Kommt früher zurück', entfernt: 2,
      vorher: { von: '2027-08-02', bis: '2027-08-06' }, nachher: [{ von: '2027-08-02', bis: '2027-08-04' }],
    });
  });

  it('ein Tag mitten im Urlaub: der Antrag teilt sich, die Tage ziehen mit, die Genehmigung bleibt', async () => {
    // Mo 6.9. – Fr 17.9.2027, zehn Arbeitstage; der Mi 8.9. wird gestrichen
    const id = await genehmigt(monteur, '2027-09-06', '2027-09-17');
    const { data, error } = await kuerzen(chefin, id, '2027-09-06', '2027-09-17', ['2027-09-08']);
    expect(error).toBeNull();
    expect(data.teile).toBe(2);
    const [erster, zweiter] = await antraegeVon(monteur.uid, '2027-09-01', '2027-09-30');
    expect(erster).toMatchObject({ id, von: '2027-09-06', bis: '2027-09-07', tage: 2 });
    expect(zweiter).toMatchObject({ von: '2027-09-09', bis: '2027-09-17', tage: 7, status: 'Genehmigt' });
    expect(zweiter.genehmigt_am).not.toBeNull();
    expect(zweiter.aenderungen[0]).toMatchObject({ art: 'gekuerzt', aus: id, gestrichen: ['2027-09-08'] });
    expect(await tageImKonto(zweiter.id)).toHaveLength(7);
    expect(await tageImKonto(id)).toEqual(['2027-09-06', '2027-09-07']);
    // Der Wochenplan liest von–bis: am gestrichenen Tag ist niemand mehr abwesend.
    const { data: frei } = await chefin.client.rpc('wochenplan_abwesend', { p_von: '2027-09-08', p_bis: '2027-09-08' });
    expect((frei ?? []).filter((z: { user_id: string }) => z.user_id === monteur.uid)).toEqual([]);
  });

  it('ganztägiger Zeitausgleich lässt sich ebenso kürzen; tage zählt die Arbeitstage', async () => {
    const id = await genehmigt(monteur, '2027-10-04', '2027-10-08', 'Zeitausgleich');
    const { error } = await kuerzen(chefin, id, '2027-10-05', '2027-10-08');
    expect(error).toBeNull();
    const [a] = await antraegeVon(monteur.uid, '2027-10-01', '2027-10-31');
    expect(a).toMatchObject({ von: '2027-10-05', bis: '2027-10-08', tage: 4 });
    expect(await tageImKonto(id)).toHaveLength(4);
  });

  it('wer nicht entscheidet, kürzt nicht; den eigenen Urlaub kürzt jemand anderer (Vier-Augen)', async () => {
    const id = await genehmigt(monteur, '2027-11-08', '2027-11-12');
    expect((await kuerzen(monteur, id, '2027-11-08', '2027-11-10')).error?.code).toBe('42501');
    const eigener = await genehmigt(chefin, '2027-11-15', '2027-11-19');
    expect((await kuerzen(chefin, eigener, '2027-11-15', '2027-11-17')).error?.code).toBe('42501');
    expect((await kuerzen(buchhaltung, eigener, '2027-11-15', '2027-11-17')).error).toBeNull();
  });

  it('weist ab, was keine Kürzung ist: ohne Grund, außerhalb, unverändert, nichts übrig, Wochenende gestrichen', async () => {
    const id = await genehmigt(monteur, '2027-12-06', '2027-12-10');
    expect((await kuerzen(chefin, id, '2027-12-06', '2027-12-08', [], '')).error?.code).toBe('22023');
    expect((await kuerzen(chefin, id, '2027-12-03', '2027-12-08')).error?.message).toMatch(/innerhalb des genehmigten Zeitraums/);
    expect((await kuerzen(chefin, id, '2027-12-06', '2027-12-10')).error?.message).toMatch(/unverändert/);
    expect((await kuerzen(chefin, id, '2027-12-06', '2027-12-06', ['2027-12-06'])).error?.message).toMatch(/ganz zurücknehmen/);
    expect((await kuerzen(chefin, id, '2027-12-06', '2027-12-10', ['2027-12-11'])).error?.code).toBe('22023');
  });

  it('stundenweiser Zeitausgleich und Betriebsurlaub werden nicht gekürzt', async () => {
    const za = await genehmigt(monteur, '2028-01-10', '2028-01-10', 'Zeitausgleich', { za_von: '13:00', za_bis: '17:00', za_stunden: 4 });
    expect((await kuerzen(chefin, za, '2028-01-10', '2028-01-10')).error?.code).toBe('55000');
  });

  it('den Verlauf schreibt nur die Datenbank', async () => {
    const id = await genehmigt(monteur, '2028-02-07', '2028-02-11');
    const { error } = await chefin.client.from('vacations').update({ aenderungen: [{ art: 'erfunden' }] }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('bleibt gleich: Zurücknehmen nimmt weiter alle Tage aus dem Zeitkonto', async () => {
    const id = await genehmigt(monteur, '2028-03-06', '2028-03-10');
    await admin.from('time_entries').insert(buchung(monteur, '2028-03-13'));
    const { data, error } = await chefin.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Storniert', p_grund: 'Abgesagt', p_entscheider_name: 'Chefin',
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'Storniert', entfernt: 5 });
    expect(await tageImKonto(id)).toEqual([]);
  });
});
