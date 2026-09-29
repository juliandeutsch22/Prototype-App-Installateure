/**
 * Der 24. und 31. Dezember als halbe Tage — gegen die echte Datenbank.
 *
 * Die Datenbank rechnet davon den Urlaubsverbrauch (`vacations.tage`): beim
 * Eintragen, beim Genehmigen, beim Betriebsurlaub — und sie muss ihn
 * nachziehen, wenn der Betrieb die Einstellung umschaltet. Sonst zeigte die
 * Urlaubsseite einen anderen Resturlaub als die Mitarbeiterübersicht, die
 * aus den Buchungen mit der Einstellung von jetzt rechnet.
 *
 * Dezember 2026: der 24. und der 31. sind Donnerstage, der 25. ein Freitag.
 * 21.–31.12. sind damit acht Arbeitstage, als Urlaub sieben.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'dezember-a';
const OHNE = 'dezember-b';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let kollege: Konto;
let fremd: Konto;
let fremdMonteur: Konto;

async function tageVon(id: string): Promise<number> {
  const { data } = await admin.from('vacations').select('tage').eq('id', id).single();
  return Number(data!.tage);
}

const eintragen = (k: Konto, user: string, von: string, bis: string) =>
  k.client.rpc('urlaub_eintragen', { p_user: user, p_von: von, p_bis: bis, p_notiz: null, p_name: 'Büro' });

const umschalten = (k: Konto, an: boolean) =>
  k.client.from('companies').update({ dezember_halbtage: an }, { count: 'exact' }).eq('id', BETRIEB);

let eingetragen: string;
let genehmigt: string;
let beantragt: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Dezember A');
  await betriebAnlegen(OHNE, 'Dezember B');
  await admin.from('companies').update({ dezember_halbtage: false }).eq('id', OHNE);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'dezgf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'dezbu');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'dezmon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'dezkol');
  fremd = await konto(OHNE, 'Buchhaltung', 'dezfremd');
  fremdMonteur = await konto(OHNE, 'Mitarbeiter', 'dezfremdmon');
}, 180_000);

describe('Ab Werk', () => {
  it('steht die Einstellung auf an', async () => {
    const { data } = await admin.from('companies').select('dezember_halbtage').eq('id', BETRIEB).single();
    expect(data!.dezember_halbtage).toBe(true);
  });
});

describe('Urlaub verbraucht am 24. und 31. je einen halben Tag', () => {
  it('beim Eintragen durch das Büro', async () => {
    const { data, error } = await eintragen(buch, monteur.uid, '2026-12-21', '2026-12-31');
    expect(error).toBeNull();
    expect(data).toMatchObject({ tage: 7, uebersprungen: 0 });
    eingetragen = (data as { id: string }).id;
    expect(await tageVon(eingetragen)).toBe(7);
    // Gebucht werden trotzdem alle acht Tage — der Tag ist frei, nur halb teuer.
    const { count } = await admin.from('time_entries')
      .select('*', { count: 'exact', head: true }).eq('vacation_id', eingetragen);
    expect(count).toBe(8);
  });

  it('beim Genehmigen eines Antrags', async () => {
    genehmigt = crypto.randomUUID();
    await kollege.client.from('vacations').insert({
      id: genehmigt, company_id: BETRIEB, user_id: kollege.uid, user_name: 'x',
      von: '2026-12-24', bis: '2026-12-24', tage: 0.5, status: 'Beantragt',
    });
    const { error } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: genehmigt, p_entscheidung: 'Genehmigt', p_grund: '',
    });
    expect(error).toBeNull();
    expect(await tageVon(genehmigt)).toBe(0.5);
  });

  it('die Monatssicht zählt die Tage an beiden Terminen mit', async () => {
    const { data } = await admin.from('monthly_stats')
      .select('urlaub_tage, abwesend_halbtage').eq('user_id', monteur.uid).eq('monat', '2026-12').single();
    expect(data).toMatchObject({ urlaub_tage: 8, abwesend_halbtage: 2 });
  });

  it('Gegenprobe: ein Betrieb ohne die Einstellung zählt ganze Tage', async () => {
    const { data, error } = await eintragen(fremd, fremdMonteur.uid, '2026-12-24', '2026-12-24');
    expect(error).toBeNull();
    expect(data).toMatchObject({ tage: 1 });
  });
});

describe('Umschalten rechnet nach', () => {
  it('ausgeschaltet zählen die Tage wieder ganz — genehmigt und beantragt', async () => {
    beantragt = crypto.randomUUID();
    await kollege.client.from('vacations').insert({
      id: beantragt, company_id: BETRIEB, user_id: kollege.uid, user_name: 'x',
      von: '2026-12-30', bis: '2026-12-31', tage: 1.5, status: 'Beantragt',
    });

    const { error, count } = await umschalten(chef, false);
    expect(error).toBeNull();
    expect(count).toBe(1);
    expect(await tageVon(eingetragen)).toBe(8);
    expect(await tageVon(genehmigt)).toBe(1);
    expect(await tageVon(beantragt)).toBe(2);
  });

  it('und wieder eingeschaltet halb', async () => {
    const { error } = await umschalten(chef, true);
    expect(error).toBeNull();
    expect(await tageVon(eingetragen)).toBe(7);
    expect(await tageVon(genehmigt)).toBe(0.5);
    expect(await tageVon(beantragt)).toBe(1.5);
  });

  it('ein Speichern ohne Änderung rechnet nichts doppelt', async () => {
    await umschalten(chef, true);
    expect(await tageVon(eingetragen)).toBe(7);
  });

  it('umschalten darf nur die Spitze', async () => {
    const { count } = await umschalten(buch, false);
    expect(count ?? 0).toBe(0);
    expect(await tageVon(eingetragen)).toBe(7);
  });
});

describe('Betriebsurlaub', () => {
  it('meldet Urlaubstage, nicht Buchungen — beim Anlegen und beim Löschen', async () => {
    // 24.–31.12.2027: Fr, Mo–Fr — sechs Arbeitstage, als Urlaub fünf; je
    // Person im Betrieb (vier).
    const { data, error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: '2027-12-24', p_bis: '2027-12-31', p_bezeichnung: 'Weihnachten', p_abbuchen: true,
      p_name: 'Büro', p_ausgenommen: [],
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ mitarbeiter: 4, tage: 20 });
    const { data: v } = await admin.from('vacations').select('tage')
      .eq('betriebsurlaub_id', (data as { id: string }).id);
    expect(v!.map((x) => Number(x.tage))).toEqual([5, 5, 5, 5]);

    const weg = await buch.client.rpc('betriebsurlaub_loeschen', { p_id: (data as { id: string }).id });
    expect(weg.error).toBeNull();
    expect(weg.data).toMatchObject({ tage: 20, mitarbeiter: 4 });
  });
});
