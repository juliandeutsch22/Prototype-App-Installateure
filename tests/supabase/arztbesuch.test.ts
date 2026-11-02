/**
 * DER ARZTBESUCH (Auftrag 02.11.2026, E35) — gegen den laufenden Stapel.
 * Jede Grenze mit ihrer Gegenprobe:
 *   - beantragen nur mit Uhrzeit; der Tag des Termins ist das Ereignis;
 *     zwei Termine an einem Tag gehen, wenn sie sich nicht überschneiden;
 *   - der Vorschlag: höchstens der Rest zur Sollzeit des Tages — nur fürs Büro;
 *   - bestätigen: mit Nachweis, wenn der Betrieb ihn verlangt; der Tag trägt
 *     genau die angerechnete Zeit; eine Abweichung braucht einen Grund;
 *   - ablehnen mit Folge: als Zeitausgleich gebucht oder ohne Buchung;
 *   - der Wochenplan zeigt ihn ab dem Antrag, den Anlass nur dem Büro;
 *   - Monatssicht und Zurücknehmen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'arzt-a';

let chefin: Konto;
let buch: Konto;
let pl: Konto;
let anna: Konto;
let bert: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  pl = await konto(BETRIEB, 'Projektleiter', 'pl');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'anna');
  bert = await konto(BETRIEB, 'Mitarbeiter', 'bert');
  await admin.from('users').update({ weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5], eintritt: '2020-01-15' })
    .in('id', [anna.uid, bert.uid]);
  await admin.from('companies').update({ wochenplan_fuer_alle: true }).eq('id', BETRIEB);
}, 120_000);

const arzt = (k: Konto, tag: string, von: string | null, bis: string | null, ereignis: string | null = null) =>
  k.client.rpc('freistellung_beantragen', {
    p_art: 'dienstverhinderung', p_anlass: 'arztbesuch', p_ereignis: ereignis, p_von: tag, p_bis: tag,
    p_zeit_von: von, p_zeit_bis: bis, p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
  });

async function neu(k: Konto, tag: string, von: string, bis: string): Promise<string> {
  const { data, error } = await arzt(k, tag, von, bis);
  if (error) throw new Error(error.message);
  return data as string;
}

const entscheiden = (k: Konto, id: string, entscheidung: string, rest: {
  grund?: string; geprueft?: boolean; angerechnet?: number | null; anrechnungGrund?: string | null; folge?: string | null;
} = {}) =>
  k.client.rpc('freistellung_entscheiden', {
    p_id: id, p_entscheidung: entscheidung, p_grund: rest.grund ?? '', p_nachweis_geprueft: rest.geprueft ?? false,
    p_angerechnet_min: rest.angerechnet ?? null, p_anrechnung_grund: rest.anrechnungGrund ?? null,
    p_ablehnung_folge: rest.folge ?? null,
  });

/** Gearbeitete Zeit über den Dienst — mit Kennung, sonst scheitert es still. */
async function arbeit(k: Konto, tag: string, von: string, bis: string) {
  const { error } = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: k.uid, user_name: 'x', date: tag,
    status: 'Anwesend', start_time: von, end_time: bis, break_duration: 0,
  });
  if (error) throw new Error(error.message);
}

async function eintraege(id: string) {
  const { data } = await admin.from('time_entries').select('date, status, start_time, end_time, comment')
    .eq('freistellung_id', id).order('date');
  return data ?? [];
}

describe('Beantragen', () => {
  it('nur mit Uhrzeit — ganztägig arbeitsunfähig ist eine Krankmeldung', async () => {
    const ohne = await arzt(anna, '2026-11-09', null, null);
    expect(ohne.error?.code).toBe('22023');
    expect(ohne.error?.message).toMatch(/krank/);
    // Gegenprobe: mit Uhrzeit geht es, und der Tag des Termins ist das Ereignis.
    const id = await neu(anna, '2026-11-09', '09:00', '10:30');
    const { data } = await admin.from('freistellungen').select('anlass, ereignis_datum, zeit_von, zeit_bis, status').eq('id', id).single();
    expect(data).toMatchObject({ anlass: 'arztbesuch', ereignis_datum: '2026-11-09', zeit_von: '09:00:00', zeit_bis: '10:30:00', status: 'Beantragt' });
  });

  it('ein anderer Tag als Ereignis wird abgewiesen', async () => {
    const { error } = await arzt(anna, '2026-11-10', '09:00', '10:00', '2026-11-03');
    expect(error?.code).toBe('22023');
  });

  it('zwei Termine an einem Tag, wenn sie sich nicht überschneiden — sonst abgewiesen', async () => {
    await neu(bert, '2026-11-11', '08:00', '09:00');
    expect((await arzt(bert, '2026-11-11', '10:00', '11:00')).error).toBeNull();
    const zugleich = await arzt(bert, '2026-11-11', '08:30', '09:30');
    expect(zugleich.error?.code).toBe('23P01');
    expect(zugleich.error?.message).toMatch(/08:00 bis 09:00/);
  });

  it('gleich geblieben: ein ganztägiger Antrag sperrt den Tag für einen Termin', async () => {
    const { error } = await bert.client.rpc('freistellung_beantragen', {
      p_art: 'unbezahlt', p_anlass: null, p_ereignis: null, p_von: '2026-11-13', p_bis: '2026-11-13',
      p_zeit_von: null, p_zeit_bis: null, p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    expect(error).toBeNull();
    expect((await arzt(bert, '2026-11-13', '08:00', '09:00')).error?.code).toBe('23P01');
  });

  it('nicht an einem freien Tag', async () => {
    expect((await arzt(anna, '2026-11-14', '09:00', '10:00')).error?.code).toBe('55000');
  });
});

describe('Der Vorschlag', () => {
  let id: string;
  beforeAll(async () => {
    // 8 Std. Soll (40 Std., fünf Tage), 6 Std. gearbeitet, Termin drei Stunden.
    await arbeit(anna, '2026-11-16', '07:00', '13:00');
    id = await neu(anna, '2026-11-16', '13:00', '16:00');
  });

  it('höchstens der Rest zur Sollzeit des Tages', async () => {
    const { data, error } = await buch.client.rpc('arztbesuch_vorschlag', { p_id: id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ termin: 180, soll: 480, gearbeitet: 360, vorschlag: 120, arbeitstag: true, ganztags: null });
  });

  it('nennt, was sich zeitlich überschneidet', async () => {
    await arbeit(anna, '2026-11-17', '07:00', '12:00');
    const zweiter = await neu(anna, '2026-11-17', '11:00', '12:30');
    const { data } = await buch.client.rpc('arztbesuch_vorschlag', { p_id: zweiter });
    expect((data as { ueberschneidung: unknown[] }).ueberschneidung).toEqual([{ status: 'Anwesend', von: '07:00', bis: '12:00' }]);
  });

  it('nur fürs Büro — nicht die Person, nicht die Projektleitung', async () => {
    for (const k of [anna, pl]) {
      const { error } = await k.client.rpc('arztbesuch_vorschlag', { p_id: id });
      expect(error?.code).toBe('42501');
    }
  });
});

describe('Bestätigen', () => {
  it('verlangt der Betrieb den Nachweis, geht es nur mit „Nachweis geprüft“', async () => {
    await arbeit(bert, '2026-11-18', '07:00', '13:00');
    const id = await neu(bert, '2026-11-18', '13:00', '16:00');
    const ohne = await entscheiden(buch, id, 'Bestätigt');
    expect(ohne.error?.code).toBe('22023');
    expect(ohne.error?.message).toMatch(/Bestätigung/);
    // Gegenprobe: geprüft (auf Papier gezeigt) — der Tag trägt die angerechnete Zeit ab Beginn.
    const { data, error } = await entscheiden(buch, id, 'Bestätigt', { geprueft: true });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'Bestätigt', angerechnet: 120 });
    expect(await eintraege(id)).toEqual([
      { date: '2026-11-18', status: 'Dienstverhinderung', start_time: '13:00:00', end_time: '15:00:00', comment: 'Arztbesuch' },
    ]);
    const { data: f } = await admin.from('freistellungen').select('minuten, zeit_von, zeit_bis, nachweis_geprueft_von_name, anrechnung_grund').eq('id', id).single();
    // Der Antrag behält den Termin; angerechnet sind 120 Minuten, ohne Abweichung kein Grund.
    expect(f).toMatchObject({ minuten: 120, zeit_von: '13:00:00', zeit_bis: '16:00:00', anrechnung_grund: null });
    expect(f?.nachweis_geprueft_von_name).toBeTruthy();
  });

  it('ohne Pflicht im Betrieb geht es auch ohne Haken', async () => {
    await admin.from('companies').update({ arztbesuch_nachweis: false }).eq('id', BETRIEB);
    try {
      const id = await neu(bert, '2026-11-19', '08:00', '09:00');
      expect((await entscheiden(buch, id, 'Bestätigt')).error).toBeNull();
      expect((await eintraege(id))[0]).toMatchObject({ start_time: '08:00:00', end_time: '09:00:00' });
    } finally {
      await admin.from('companies').update({ arztbesuch_nachweis: true }).eq('id', BETRIEB);
    }
  });

  it('eine Abweichung vom Vorschlag braucht einen Grund, höchstens den Termin', async () => {
    await arbeit(bert, '2026-11-20', '07:00', '13:00');
    const id = await neu(bert, '2026-11-20', '13:00', '16:00');
    expect((await entscheiden(buch, id, 'Bestätigt', { geprueft: true, angerechnet: 180 })).error?.code).toBe('22023');
    expect((await entscheiden(buch, id, 'Bestätigt', { geprueft: true, angerechnet: 200, anrechnungGrund: 'Facharzt, länger' })).error?.code).toBe('22023');
    const { error } = await entscheiden(buch, id, 'Bestätigt', { geprueft: true, angerechnet: 180, anrechnungGrund: 'Gleitzeit: Normalarbeitszeit bis 16 Uhr' });
    expect(error).toBeNull();
    expect((await eintraege(id))[0]).toMatchObject({ start_time: '13:00:00', end_time: '16:00:00' });
    const { data: f } = await admin.from('freistellungen').select('minuten, anrechnung_grund').eq('id', id).single();
    expect(f).toMatchObject({ minuten: 180, anrechnung_grund: 'Gleitzeit: Normalarbeitszeit bis 16 Uhr' });
  });

  it('ist die Sollzeit schon gearbeitet, bleibt nichts anzurechnen', async () => {
    await arbeit(bert, '2026-11-23', '07:00', '15:00');
    const id = await neu(bert, '2026-11-23', '16:00', '17:00');
    const { error } = await entscheiden(buch, id, 'Bestätigt', { geprueft: true });
    expect(error?.code).toBe('22023');
    expect(error?.message).toMatch(/nichts anzurechnen/);
  });

  it('zwei Termine an einem Tag lassen sich beide bestätigen — der zweite bekommt den Rest', async () => {
    const a = await neu(anna, '2026-11-24', '08:00', '12:00');
    const b = await neu(anna, '2026-11-24', '13:00', '18:00');
    expect((await entscheiden(buch, a, 'Bestätigt', { geprueft: true })).data).toMatchObject({ angerechnet: 240 });
    expect((await entscheiden(buch, b, 'Bestätigt', { geprueft: true })).data).toMatchObject({ angerechnet: 240 });
  });

  it('die Monatssicht zählt die angerechnete Zeit, nicht den Termin', async () => {
    const { data } = await admin.from('monthly_stats').select('freigestellt_min')
      .eq('company_id', BETRIEB).eq('user_id', bert.uid).eq('monat', '2026-11').single();
    // 18.11.: 120, 19.11.: 60, 20.11.: 180.
    expect(Number(data?.freigestellt_min)).toBe(360);
  });

  it('Zurücknehmen nimmt den Tag wieder heraus', async () => {
    const id = await neu(bert, '2026-11-25', '08:00', '09:00');
    await entscheiden(buch, id, 'Bestätigt', { geprueft: true });
    expect(await eintraege(id)).toHaveLength(1);
    expect((await entscheiden(buch, id, 'Storniert', { grund: 'doch nicht' })).error).toBeNull();
    expect(await eintraege(id)).toHaveLength(0);
  });

  it('der Tag lässt sich nicht von Hand ändern', async () => {
    const { data: e } = await admin.from('time_entries').select('id').eq('user_id', bert.uid).eq('comment', 'Arztbesuch').limit(1).single();
    const { error } = await bert.client.from('time_entries').update({ end_time: '18:00' }).eq('id', e!.id);
    expect(error).not.toBeNull();
  });
});

describe('Ablehnen mit Folge', () => {
  it('als Zeitausgleich: genehmigter Zeitausgleich mit der Uhrzeit des Termins', async () => {
    const id = await neu(anna, '2026-11-26', '10:00', '12:00');
    const { data, error } = await entscheiden(buch, id, 'Abgelehnt', { grund: 'hätte am Nachmittag gehen können', folge: 'zeitausgleich' });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'Abgelehnt', alsZeitausgleich: true });
    const { data: f } = await admin.from('freistellungen').select('ablehnung_folge, ablehnung_za_id').eq('id', id).single();
    expect(f?.ablehnung_folge).toBe('zeitausgleich');
    const { data: v } = await admin.from('vacations').select('art, status, za_von, za_bis, za_stunden, von, bis').eq('id', f!.ablehnung_za_id).single();
    expect(v).toMatchObject({ art: 'Zeitausgleich', status: 'Genehmigt', za_von: '10:00:00', za_bis: '12:00:00', von: '2026-11-26', bis: '2026-11-26' });
    expect(Number(v?.za_stunden)).toBe(2);
    const { data: t } = await admin.from('time_entries').select('status, start_time, end_time').eq('vacation_id', f!.ablehnung_za_id);
    expect(t).toEqual([{ status: 'Zeitausgleich', start_time: '10:00:00', end_time: '12:00:00' }]);
  });

  it('ohne Buchung: nichts entsteht', async () => {
    const id = await neu(anna, '2026-11-27', '10:00', '11:00');
    expect((await entscheiden(buch, id, 'Abgelehnt', { grund: 'kein Nachweis', folge: 'keine' })).error).toBeNull();
    const { data: f } = await admin.from('freistellungen').select('ablehnung_folge, ablehnung_za_id').eq('id', id).single();
    expect(f).toMatchObject({ ablehnung_folge: 'keine', ablehnung_za_id: null });
    expect(await eintraege(id)).toHaveLength(0);
  });

  it('Folge und angerechnete Zeit gibt es nur beim Arztbesuch', async () => {
    const { data: s } = await bert.client.rpc('freistellung_beantragen', {
      p_art: 'dienstverhinderung', p_anlass: 'vorladung', p_ereignis: '2026-11-30', p_von: '2026-11-30', p_bis: '2026-11-30',
      p_zeit_von: '08:00', p_zeit_bis: '09:00', p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    expect((await entscheiden(buch, s as string, 'Abgelehnt', { grund: 'xyz', folge: 'keine' })).error?.code).toBe('22023');
    expect((await entscheiden(buch, s as string, 'Bestätigt', { geprueft: true, angerechnet: 30, anrechnungGrund: 'xyz' })).error?.code).toBe('22023');
    // Gegenprobe: ohne die beiden geht die Vorladung wie bisher.
    expect((await entscheiden(buch, s as string, 'Bestätigt', { geprueft: true })).error).toBeNull();
  });
});

describe('Wochenplan', () => {
  let id: string;
  beforeAll(async () => {
    id = await neu(anna, '2026-12-01', '09:00', '11:00');
  });
  const zeile = async (k: Konto) => {
    const { data } = await k.client.rpc('wochenplan_abwesend', { p_von: '2026-11-30', p_bis: '2026-12-06' });
    return ((data ?? []) as Array<{ user_id: string; von: string; grund: string | null; zeiten: string | null }>)
      .find((z) => z.user_id === anna.uid && z.von === '2026-12-01');
  };

  it('schon als Antrag — der Termin steht fest', async () => {
    expect(await zeile(pl)).toMatchObject({ zeiten: '09:00–11:00' });
    expect(id).toBeTruthy();
  });

  it('den Anlass sieht nur das Büro; Projektleitung und Kollegen „abwesend“', async () => {
    expect((await zeile(buch))?.grund).toBe('Arztbesuch');
    expect((await zeile(chefin))?.grund).toBe('Arztbesuch');
    expect((await zeile(pl))?.grund).toBeNull();
    expect((await zeile(bert))?.grund).toBeNull();
  });

  it('gleich geblieben: ein anderer Sonderurlaub erscheint erst bestätigt', async () => {
    await bert.client.rpc('freistellung_beantragen', {
      p_art: 'dienstverhinderung', p_anlass: 'vorladung', p_ereignis: '2026-12-02', p_von: '2026-12-02', p_bis: '2026-12-02',
      p_zeit_von: '08:00', p_zeit_bis: '09:00', p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    const { data } = await pl.client.rpc('wochenplan_abwesend', { p_von: '2026-11-30', p_bis: '2026-12-06' });
    expect(((data ?? []) as Array<{ user_id: string; von: string }>).some((z) => z.user_id === bert.uid && z.von === '2026-12-02')).toBe(false);
  });
});
