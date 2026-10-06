/**
 * Sonderurlaub über dem Kontingent (Testbericht Runde 3, G17) — gegen den
 * laufenden Stapel.
 *
 * Gesehen: „3 Arbeitstage — vorgesehen sind 2“ ließ sich ohne Begründung
 * bestätigen. Jetzt verlangt die Datenbank eine Wahl: die Tage darüber als
 * Urlaub buchen (ein genehmigter Urlaubsantrag, der im Resturlaub zählt)
 * oder mit Grund als Sonderurlaub bestätigen. Zurücknehmen nimmt den Urlaub
 * mit. Jede Grenze mit Gegenprobe.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'frei-kontingent';

let chefin: Konto;
let buch: Konto;
let pl: Konto;
let anna: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'kchefin');
  buch = await konto(BETRIEB, 'Buchhaltung', 'kbuch');
  pl = await konto(BETRIEB, 'Projektleiter', 'kpl');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'kanna');
  await admin.from('users').update({ weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5], eintritt: '2020-01-15' })
    .eq('id', anna.uid);
}, 120_000);

afterEach(async () => {
  await admin.from('companies').update({ vacation_approvers: [] }).eq('id', BETRIEB);
});

/** Tod der Eltern: zwei Arbeitstage vorgesehen. Mo–Mi sind drei. */
async function antrag(von: string, bis: string, ereignis: string): Promise<string> {
  const { data, error } = await anna.client.rpc('freistellung_beantragen', {
    p_art: 'dienstverhinderung', p_anlass: 'tod_eltern', p_ereignis: ereignis, p_von: von, p_bis: bis,
    p_zeit_von: null, p_zeit_bis: null, p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

const entscheiden = (
  k: Konto, id: string, entscheidung: string,
  rest: { grund?: string; ueber?: 'urlaub' | 'sonderurlaub' | null; ueberGrund?: string | null } = {},
) => k.client.rpc('freistellung_entscheiden', {
  p_id: id, p_entscheidung: entscheidung, p_grund: rest.grund ?? '', p_nachweis_geprueft: false,
  p_kuerzung: null, p_ueber_kontingent: rest.ueber ?? null, p_ueber_grund: rest.ueberGrund ?? null,
});

async function tage(id: string) {
  const { data } = await admin.from('time_entries').select('date, status, vacation_id')
    .eq('freistellung_id', id).order('date');
  return data ?? [];
}

describe('Über dem Kontingent bestätigen', () => {
  it('ohne Wahl nicht — und es entsteht nichts', async () => {
    const id = await antrag('2027-09-06', '2027-09-08', '2027-09-03');
    const { error } = await entscheiden(buch, id, 'Bestätigt');
    expect(error?.code).toBe('22023');
    expect(error?.message).toMatch(/Mehr Tage als vorgesehen \(1 darüber\)/);
    expect(await tage(id)).toEqual([]);
    await entscheiden(buch, id, 'Abgelehnt', { grund: 'Aufräumen' });
  });

  it('als Sonderurlaub nur mit Grund; dann alle Tage Sonderurlaub, Wahl und Grund am Antrag', async () => {
    const id = await antrag('2027-09-13', '2027-09-15', '2027-09-10');
    expect((await entscheiden(buch, id, 'Bestätigt', { ueber: 'sonderurlaub' })).error?.code).toBe('22023');
    const { data, error } = await entscheiden(buch, id, 'Bestätigt', { ueber: 'sonderurlaub', ueberGrund: 'Beisetzung im Ausland' });
    expect(error).toBeNull();
    expect(data).toMatchObject({ angelegt: 3, ueber: 1, alsUrlaub: 0 });
    expect((await tage(id)).map((t) => t.status)).toEqual(['Dienstverhinderung', 'Dienstverhinderung', 'Dienstverhinderung']);
    const { data: f } = await admin.from('freistellungen')
      .select('ueber_kontingent, ueber_tage, ueber_grund, ueber_urlaub_id, minuten').eq('id', id).single();
    expect(f).toMatchObject({ ueber_kontingent: 'sonderurlaub', ueber_grund: 'Beisetzung im Ausland', ueber_urlaub_id: null });
    expect(Number(f?.ueber_tage)).toBe(1);
    expect(Number(f?.minuten)).toBe(3 * 480);
    await entscheiden(buch, id, 'Storniert', { grund: 'Aufräumen' });
  });

  it('als Urlaub: der letzte Tag wird genehmigter Urlaub — mit Antrag, im Zeitkonto, im Wochenplan', async () => {
    const id = await antrag('2027-09-20', '2027-09-22', '2027-09-17');
    const { data, error } = await entscheiden(buch, id, 'Bestätigt', { ueber: 'urlaub' });
    expect(error).toBeNull();
    expect(data).toMatchObject({ angelegt: 3, ueber: 1, alsUrlaub: 1 });

    const t = await tage(id);
    expect(t.map((x) => [x.date, x.status])).toEqual([
      ['2027-09-20', 'Dienstverhinderung'], ['2027-09-21', 'Dienstverhinderung'], ['2027-09-22', 'Urlaub'],
    ]);
    const { data: f } = await admin.from('freistellungen')
      .select('ueber_kontingent, ueber_tage, ueber_urlaub_id, minuten').eq('id', id).single();
    expect(f?.ueber_kontingent).toBe('urlaub');
    expect(Number(f?.ueber_tage)).toBe(1);
    // Gutgeschrieben als Sonderurlaub sind nur die zwei Tage im Kontingent.
    expect(Number(f?.minuten)).toBe(2 * 480);
    expect(t[2].vacation_id).toBe(f?.ueber_urlaub_id);

    // Der Urlaub ist ein genehmigter Antrag — so zählt er im Resturlaub.
    const { data: v } = await admin.from('vacations').select('user_id, von, bis, tage, status, art')
      .eq('id', f!.ueber_urlaub_id).single();
    expect(v).toMatchObject({ user_id: anna.uid, von: '2027-09-22', bis: '2027-09-22', status: 'Genehmigt', art: 'Urlaub' });
    expect(Number(v?.tage)).toBe(1);

    // Im Wochenplan kein Tag doppelt: zwei Tage Sonderurlaub, einer Urlaub.
    const { data: plan } = await pl.client.rpc('wochenplan_abwesend', { p_von: '2027-09-20', p_bis: '2027-09-24' });
    const zeilen = (plan as Array<{ user_id: string; von: string; bis: string; grund: string }>)
      .filter((z) => z.user_id === anna.uid)
      .map((z) => [z.von, z.bis, z.grund])
      .sort();
    expect(zeilen).toEqual([['2027-09-20', '2027-09-21', 'Sonderurlaub'], ['2027-09-22', '2027-09-22', 'Urlaub']]);

    // Zurücknehmen nimmt den Urlaub mit.
    const storno = await entscheiden(buch, id, 'Storniert', { grund: 'Termin verschoben' });
    expect(storno.error).toBeNull();
    expect(await tage(id)).toEqual([]);
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true })
      .eq('vacation_id', f!.ueber_urlaub_id);
    expect(count).toBe(0);
    const { data: weg } = await admin.from('vacations').select('status').eq('id', f!.ueber_urlaub_id).single();
    expect(weg?.status).toBe('Storniert');
  });

  it('als Urlaub nur, wer über Urlaub entscheidet — und zurücknehmen ebenso', async () => {
    await admin.from('companies').update({ vacation_approvers: [chefin.uid] }).eq('id', BETRIEB);
    const id = await antrag('2027-09-27', '2027-09-29', '2027-09-24');
    expect((await entscheiden(buch, id, 'Bestätigt', { ueber: 'urlaub' })).error?.code).toBe('42501');
    expect(await tage(id)).toEqual([]);
    expect((await entscheiden(chefin, id, 'Bestätigt', { ueber: 'urlaub' })).error).toBeNull();
    // Das Büro bestätigt Sonderurlaub, über Urlaub entscheidet hier nur die Chefin.
    expect((await entscheiden(buch, id, 'Storniert', { grund: 'Termin verschoben' })).error?.code).toBe('42501');
    expect(await tage(id)).toHaveLength(3);
    expect((await entscheiden(chefin, id, 'Storniert', { grund: 'Termin verschoben' })).error).toBeNull();
    expect(await tage(id)).toEqual([]);
  });

  it('Gegenprobe: im Kontingent geht es ohne Wahl, und es bleibt nichts am Antrag', async () => {
    const id = await antrag('2027-10-04', '2027-10-05', '2027-10-01');
    const { data, error } = await entscheiden(buch, id, 'Bestätigt');
    expect(error).toBeNull();
    expect(data).toMatchObject({ angelegt: 2, ueber: 0, alsUrlaub: 0 });
    const { data: f } = await admin.from('freistellungen')
      .select('ueber_kontingent, ueber_tage, ueber_urlaub_id').eq('id', id).single();
    expect(f).toEqual({ ueber_kontingent: null, ueber_tage: null, ueber_urlaub_id: null });
    // Eine Wahl ohne Darüber ändert nichts.
    await entscheiden(buch, id, 'Storniert', { grund: 'Aufräumen' });
  });

  it('ein bestätigter erster Teil desselben Falls zählt mit', async () => {
    const erster = await antrag('2027-10-11', '2027-10-11', '2027-10-08');
    expect((await entscheiden(buch, erster, 'Bestätigt')).error).toBeNull();
    // Todesfall: ein zweiter Teil (Beisetzung) ist ohne Begründung erlaubt.
    // Mo–Di ohne Feiertag (nicht der 26.10., Nationalfeiertag — der zählte nicht als Arbeitstag).
    const zweiter = await antrag('2027-10-18', '2027-10-19', '2027-10-08');
    const ohne = await entscheiden(buch, zweiter, 'Bestätigt');
    expect(ohne.error?.message).toMatch(/1 darüber/);
    const mit = await entscheiden(buch, zweiter, 'Bestätigt', { ueber: 'urlaub' });
    expect(mit.error).toBeNull();
    expect((await tage(zweiter)).map((t) => t.status)).toEqual(['Dienstverhinderung', 'Urlaub']);
  });

  it('die Kontingente des Betriebs gelten', async () => {
    await admin.from('companies').update({ freistellung_anlaesse: { tod_eltern: 3 } }).eq('id', BETRIEB);
    try {
      const id = await antrag('2027-11-08', '2027-11-10', '2027-11-05');
      const { data, error } = await entscheiden(buch, id, 'Bestätigt');
      expect(error).toBeNull();
      expect(data).toMatchObject({ ueber: 0 });
    } finally {
      await admin.from('companies').update({ freistellung_anlaesse: null }).eq('id', BETRIEB);
    }
  });

  it('eine unbekannte Wahl wird abgewiesen', async () => {
    const id = await antrag('2027-11-15', '2027-11-17', '2027-11-12');
    const { error } = await buch.client.rpc('freistellung_entscheiden', {
      p_id: id, p_entscheidung: 'Bestätigt', p_ueber_kontingent: 'frei',
    });
    expect(error?.code).toBe('22023');
  });
});
