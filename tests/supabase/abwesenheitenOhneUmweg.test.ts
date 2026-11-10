/**
 * ABWESENHEITEN UND KORREKTUREN OHNE UMWEG (Befunde 09.11.2026) — gegen den
 * laufenden Stapel. Jede Grenze mit ihrer Gegenprobe:
 *   1. Ein Korrekturantrag ändert nur Arbeitszeit und stundenweisen
 *      Zeitausgleich: kein neuer Stand, kein Tag aus Antrag oder Meldung,
 *      kein eigener Zeitausgleich ohne zweite Person. Die normale
 *      Korrektur und das Beantragen bleiben.
 *   2. Den eigenen genehmigten Urlaub nimmt jemand anderer zurück — wer
 *      allein entscheidet, weiter selbst; den offenen Antrag zieht man selbst
 *      zurück.
 *   3. Stundenweiser Sonderurlaub nicht über gearbeiteter Zeit; Arbeitszeit
 *      nicht über stundenweiser freier Zeit. Arbeit daneben und der
 *      Arztbesuch bleiben, wie sie waren.
 *
 * Die Tage liegen im März 2027.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'ohne-umweg';
const ALLEIN = 'ohne-umweg-allein';

let gf: Konto;
let bh: Konto;
let ma: Konto;
let bert: Konto;
let alleinChef: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(ALLEIN);
  gf = await konto(BETRIEB, 'Geschäftsführung', 'ouchefin');
  bh = await konto(BETRIEB, 'Buchhaltung', 'oubuch');
  ma = await konto(BETRIEB, 'Mitarbeiter', 'ouma');
  bert = await konto(BETRIEB, 'Mitarbeiter', 'oubert');
  alleinChef = await konto(ALLEIN, 'Geschäftsführung', 'ouallein');
  await admin.from('users').update({ weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5], eintritt: '2020-01-15' })
    .in('id', [ma.uid, bert.uid, bh.uid, gf.uid, alleinChef.uid]);
  await admin.from('companies').update({ modules: { 'zeiterfassung.korrekturantraege': true } }).eq('id', BETRIEB);
}, 180_000);

async function beantragen(k: Konto, eintrag: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await k.client.rpc('zeit_korrektur_beantragen', { p_id: id, p_eintrag: eintrag, p_wunsch: 'Bitte berichtigen' });
  if (error) throw new Error(error.message);
  return id;
}

const korrigieren = (k: Konto, antrag: string, eintrag: Record<string, unknown>) =>
  k.client.rpc('zeit_korrektur_entscheiden', { p_id: antrag, p_stand: 'umgesetzt', p_grund: 'Abgeglichen', p_eintrag: eintrag });

async function zeile(id: string) {
  const { data } = await admin.from('time_entries')
    .select('status, start_time, end_time, vacation_id, krankmeldung_id').eq('id', id).single();
  return data!;
}

async function eintragAm(k: Konto, tag: string) {
  const { data } = await admin.from('time_entries').select('id').eq('user_id', k.uid).eq('date', tag).single();
  return data!.id as string;
}

describe('1. Korrekturantrag nur für Arbeitszeit und stundenweisen Zeitausgleich', () => {
  it('das Büro macht aus dem eigenen Tag keinen Zeitausgleich', async () => {
    const e = buchung(bh, '2027-03-01');
    expect((await bh.client.from('time_entries').insert(e)).error).toBeNull();
    const antrag = await beantragen(bh, e.id);
    const r = await korrigieren(bh, antrag, { status: 'Zeitausgleich' });
    expect(r.error?.code).toBe('22023');
    expect((await zeile(e.id)).status).toBe('Anwesend');
  });

  it('und keinen Urlaub ohne Antrag', async () => {
    const e = buchung(bh, '2027-03-08');
    expect((await bh.client.from('time_entries').insert(e)).error).toBeNull();
    const antrag = await beantragen(bh, e.id);
    expect((await korrigieren(bh, antrag, { status: 'Urlaub' })).error).not.toBeNull();
    expect(await zeile(e.id)).toMatchObject({ status: 'Anwesend', vacation_id: null });
  });

  it('ein Urlaubstag aus einem Antrag wird nicht über die Korrektur zu Arbeit — beantragen geht weiter', async () => {
    const u = await gf.client.rpc('urlaub_eintragen', { p_user: ma.uid, p_von: '2027-03-02', p_bis: '2027-03-02', p_notiz: null, p_name: 'Chefin' });
    expect(u.error).toBeNull();
    const id = await eintragAm(ma, '2027-03-02');
    // Erhaltung: der Antrag selbst bleibt möglich (das Büro berichtigt dann am Urlaubsantrag).
    const antrag = await beantragen(ma, id);
    const r = await korrigieren(bh, antrag, { status: 'Anwesend', start_time: '07:00', end_time: '16:00', break_duration: 30 });
    expect(r.error?.code).toBe('42501');
    expect(await zeile(id)).toMatchObject({ status: 'Urlaub', vacation_id: u.data.id });
    // Auch ohne Standwechsel: die Zeiten eines Urlaubstags bleiben beim Antrag.
    expect((await korrigieren(bh, antrag, { comment: 'Nachgetragen' })).error?.code).toBe('42501');
  });

  it('ein Krankentag bleibt bei seiner Krankmeldung', async () => {
    const k = await ma.client.rpc('krankmeldung_speichern', { p_id: null, p_user: null, p_von: '2027-03-03', p_bis: '2027-03-03' });
    expect(k.error).toBeNull();
    const id = await eintragAm(ma, '2027-03-03');
    const antrag = await beantragen(ma, id);
    expect((await korrigieren(bh, antrag, { status: 'Anwesend', start_time: '07:00', end_time: '16:00' })).error?.code).toBe('42501');
    expect(await zeile(id)).toMatchObject({ status: 'Krank', krankmeldung_id: k.data.id });
  });

  it('den eigenen Zeitausgleich verschiebt jemand anderer — vier Augen wie beim direkten Buchen', async () => {
    const za = buchung(bh, '2027-03-04', { status: 'Zeitausgleich', start_time: '13:00', end_time: '16:00', break_duration: 0 });
    expect((await gf.client.from('time_entries').insert(za)).error).toBeNull();
    const antrag = await beantragen(bh, za.id);
    expect((await korrigieren(bh, antrag, { start_time: '14:00' })).error?.code).toBe('42501');
    expect((await zeile(za.id)).start_time).toBe('13:00:00');
    // Gegenprobe: die Chefin entscheidet.
    expect((await korrigieren(gf, antrag, { start_time: '14:00' })).error).toBeNull();
    expect((await zeile(za.id)).start_time).toBe('14:00:00');
  });

  it('gleich geblieben: die gewöhnliche Korrektur einer Arbeitszeit', async () => {
    const e = buchung(ma, '2027-03-05');
    expect((await ma.client.from('time_entries').insert(e)).error).toBeNull();
    const antrag = await beantragen(ma, e.id);
    expect((await korrigieren(bh, antrag, { end_time: '15:00' })).error).toBeNull();
    expect((await zeile(e.id)).end_time).toBe('15:00:00');
  });
});

describe('2. Den eigenen genehmigten Urlaub nimmt jemand anderer zurück', () => {
  async function antrag(k: Konto, tag: string, status = 'Beantragt'): Promise<string> {
    const { data, error } = await admin.from('vacations').insert({
      company_id: k.betrieb, user_id: k.uid, user_name: 'Antrag', von: tag, bis: tag, tage: 1, status,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }
  const entscheiden = (k: Konto, id: string, entscheidung: string) =>
    k.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: entscheidung, p_grund: 'Grund' });

  it('die Chefin storniert ihren genehmigten Urlaub nicht selbst — die Buchhaltung schon', async () => {
    const id = await antrag(gf, '2027-03-09');
    expect((await entscheiden(bh, id, 'Genehmigt')).error).toBeNull();
    const selbst = await entscheiden(gf, id, 'Storniert');
    expect(selbst.error?.code).toBe('42501');
    expect(selbst.error?.message).toMatch(/Vier-Augen/);
    expect((await admin.from('vacations').select('status').eq('id', id).single()).data!.status).toBe('Genehmigt');
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true }).eq('vacation_id', id);
    expect(count).toBe(1);
    // Gegenprobe.
    expect((await entscheiden(bh, id, 'Storniert')).error).toBeNull();
  });

  it('gleich geblieben: wer allein entscheidet, nimmt den eigenen Urlaub selbst zurück', async () => {
    const id = await antrag(alleinChef, '2027-03-10');
    expect((await entscheiden(alleinChef, id, 'Genehmigt')).error).toBeNull();
    expect((await entscheiden(alleinChef, id, 'Storniert')).error).toBeNull();
  });

  it('gleich geblieben: den offenen eigenen Antrag zieht man selbst zurück', async () => {
    const id = await antrag(gf, '2027-03-11');
    expect((await gf.client.from('vacations').delete().eq('id', id)).error).toBeNull();
    expect((await admin.from('vacations').select('id').eq('id', id)).data).toEqual([]);
  });
});

describe('3. Stundenweise freie Zeit und Arbeit zur selben Stunde', () => {
  const pflege = async (k: Konto, tag: string, von: string, bis: string) => {
    const { data, error } = await k.client.rpc('freistellung_beantragen', {
      p_art: 'pflegefreistellung', p_anlass: null, p_ereignis: null, p_von: tag, p_bis: tag,
      p_zeit_von: von, p_zeit_bis: bis, p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  };
  const bestaetigen = (id: string, geprueft = false) =>
    bh.client.rpc('freistellung_entscheiden', { p_id: id, p_entscheidung: 'Bestätigt', p_grund: '', p_nachweis_geprueft: geprueft });
  async function arbeit(tag: string, von: string, bis: string) {
    const { error } = await admin.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, user_id: bert.uid, user_name: 'Bert', date: tag,
      status: 'Anwesend', start_time: von, end_time: bis, break_duration: 0,
    });
    if (error) throw new Error(error.message);
  }
  const tageDes = async (id: string) =>
    (await admin.from('time_entries').select('date, start_time, end_time').eq('freistellung_id', id)).data ?? [];

  it('Pflegefreistellung über gearbeiteter Zeit wird nicht bestätigt — mit Grund', async () => {
    await arbeit('2027-03-16', '07:00', '14:00');
    const id = await pflege(bert, '2027-03-16', '12:00', '16:00');
    const r = await bestaetigen(id);
    expect(r.error?.code).toBe('55000');
    expect(r.error?.message).toMatch(/selben Uhrzeit/);
    expect(await tageDes(id)).toEqual([]);
  });

  it('auch nicht über der Nachtschicht vom Vortag', async () => {
    await arbeit('2027-03-17', '22:00', '06:00');
    const id = await pflege(bert, '2027-03-18', '05:00', '07:00');
    expect((await bestaetigen(id)).error?.code).toBe('55000');
  });

  it('gleich geblieben: Arbeit daneben, und der Arztbesuch rechnet weiter den Rest an', async () => {
    await arbeit('2027-03-19', '07:00', '11:30');
    const id = await pflege(bert, '2027-03-19', '12:00', '16:00');
    expect((await bestaetigen(id)).error).toBeNull();
    expect(await tageDes(id)).toEqual([{ date: '2027-03-19', start_time: '12:00:00', end_time: '16:00:00' }]);

    await arbeit('2027-03-22', '07:00', '12:00');
    const arzt = await bert.client.rpc('freistellung_beantragen', {
      p_art: 'dienstverhinderung', p_anlass: 'arztbesuch', p_ereignis: null, p_von: '2027-03-22', p_bis: '2027-03-22',
      p_zeit_von: '10:00', p_zeit_bis: '11:00', p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    expect(arzt.error).toBeNull();
    expect((await bestaetigen(arzt.data as string, true)).error).toBeNull();
    // Altdaten wie dieser Tag bleiben änderbar, solange die Zeit gleich bleibt.
    const { data: w } = await admin.from('time_entries').select('id').eq('user_id', bert.uid).eq('date', '2027-03-22').eq('status', 'Anwesend').single();
    expect((await bert.client.from('time_entries').update({ comment: 'Baustelle Nord' }).eq('id', w!.id)).error).toBeNull();
  });

  it('Arbeitszeit nicht über bestätigter Pflegefreistellung — daneben schon', async () => {
    const quer = await bert.client.from('time_entries').insert(buchung(bert, '2027-03-19', { start_time: '15:00', end_time: '17:00', break_duration: 0 }));
    expect(quer.error?.code).toBe('23P01');
    expect(quer.error?.message).toMatch(/Pflegefreistellung/);
    const danach = await bert.client.from('time_entries').insert(buchung(bert, '2027-03-19', { start_time: '16:00', end_time: '18:00', break_duration: 0 }));
    expect(danach.error).toBeNull();
  });

  it('und nicht über einem stundenweisen Zeitausgleich', async () => {
    const za = buchung(bert, '2027-03-23', { status: 'Zeitausgleich', start_time: '13:00', end_time: '17:00', break_duration: 0 });
    expect((await gf.client.from('time_entries').insert(za)).error).toBeNull();
    const quer = await bert.client.from('time_entries').insert(buchung(bert, '2027-03-23', { start_time: '15:00', end_time: '18:00', break_duration: 0 }));
    expect(quer.error?.code).toBe('23P01');
    expect(quer.error?.message).toMatch(/Zeitausgleich/);
    expect((await bert.client.from('time_entries').insert(buchung(bert, '2027-03-23', { start_time: '07:00', end_time: '12:00', break_duration: 0 }))).error).toBeNull();
  });
});
