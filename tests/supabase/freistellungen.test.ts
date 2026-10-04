/**
 * Sonderurlaub, Pflegefreistellung, unbezahlter Urlaub (Plan 10.3) — gegen
 * den laufenden Stapel. Jede Grenze mit ihrer Gegenprobe:
 *   - wer liest (die Person, das Büro; nie Kollegen oder Projektleitung),
 *   - wer beantragt (nur für sich) und was abgewiesen wird,
 *   - wer bestätigt (Büro; unbezahlt nur die Spitze; nie über sich selbst,
 *     solange es jemand anderen gibt),
 *   - was im Zeitkonto entsteht und beim Storno wieder geht,
 *   - der Nachweis: ohne Haken kein Bestätigen, danach kein Pfad mehr,
 *   - Zusatzwoche, Teilung, Ganztags-Sperre, Monatssicht, Wochenplan,
 *     Datenauskunft.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'frei-a';

let chefin: Konto;
let buch: Konto;
let buch2: Konto;
let pl: Konto;
let anna: Konto;
let bert: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  buch2 = await konto(BETRIEB, 'Buchhaltung', 'buch2');
  pl = await konto(BETRIEB, 'Projektleiter', 'pl');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'anna');
  bert = await konto(BETRIEB, 'Mitarbeiter', 'bert');
  await admin.from('users').update({ weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5], eintritt: '2020-01-15' })
    .in('id', [anna.uid, bert.uid]);
}, 120_000);

type Antrag = {
  art: 'dienstverhinderung' | 'pflegefreistellung' | 'unbezahlt';
  anlass?: string | null; ereignis?: string | null; von: string; bis: string;
  zeitVon?: string | null; zeitBis?: string | null; kind?: boolean; zusatz?: boolean; notiz?: string | null;
};

const beantragen = (k: Konto, a: Antrag) =>
  k.client.rpc('freistellung_beantragen', {
    p_art: a.art, p_anlass: a.anlass ?? null, p_ereignis: a.ereignis ?? null, p_von: a.von, p_bis: a.bis,
    p_zeit_von: a.zeitVon ?? null, p_zeit_bis: a.zeitBis ?? null, p_kind_unter_12: a.kind ?? false,
    p_zusatzwoche: a.zusatz ?? false, p_notiz: a.notiz ?? null,
  });

const entscheiden = (k: Konto, id: string, entscheidung: string, rest: { grund?: string; geprueft?: boolean; kuerzung?: unknown } = {}) =>
  k.client.rpc('freistellung_entscheiden', {
    p_id: id, p_entscheidung: entscheidung, p_grund: rest.grund ?? '', p_nachweis_geprueft: rest.geprueft ?? false,
    p_kuerzung: rest.kuerzung ?? null,
  });

async function tage(id: string) {
  const { data } = await admin.from('time_entries').select('date, status, start_time, end_time')
    .eq('freistellung_id', id).order('date');
  return data ?? [];
}

/** Gearbeitete Zeit über den Dienst — mit Kennung, sonst scheitert es still. */
async function zeitEintragen(zeile: Record<string, unknown>) {
  const { error } = await admin.from('time_entries').insert({ id: crypto.randomUUID(), ...zeile });
  if (error) throw new Error(error.message);
}

async function neu(k: Konto, a: Antrag): Promise<string> {
  const { data, error } = await beantragen(k, a);
  if (error) throw new Error(error.message);
  return data as string;
}

describe('Beantragen', () => {
  it('Sonderurlaub zur Hochzeit: angelegt mit Namen aus der Tabelle', async () => {
    const id = await neu(anna, { art: 'dienstverhinderung', anlass: 'hochzeit', ereignis: '2026-11-13', von: '2026-11-11', bis: '2026-11-13' });
    const { data } = await admin.from('freistellungen').select('*').eq('id', id).single();
    expect(data).toMatchObject({ status: 'Beantragt', user_id: anna.uid, art: 'dienstverhinderung', anlass: 'hochzeit' });
    const { data: u } = await admin.from('users').select('name').eq('id', anna.uid).single();
    expect(data?.user_name).toBe(u?.name);
  });

  it('weist ab: ohne Anlass, Uhrzeit außer bei Vorladung, unbezahlt stundenweise, Kind außerhalb der Pflege', async () => {
    expect((await beantragen(anna, { art: 'dienstverhinderung', von: '2026-12-01', bis: '2026-12-01' })).error?.code).toBe('22023');
    expect((await beantragen(anna, { art: 'dienstverhinderung', anlass: 'hochzeit', ereignis: '2026-12-01', von: '2026-12-01', bis: '2026-12-01', zeitVon: '08:00', zeitBis: '10:00' })).error?.code).toBe('22023');
    expect((await beantragen(anna, { art: 'unbezahlt', von: '2026-12-02', bis: '2026-12-02', zeitVon: '08:00', zeitBis: '10:00' })).error?.code).toBe('22023');
    expect((await beantragen(anna, { art: 'unbezahlt', von: '2026-12-02', bis: '2026-12-02', kind: true })).error?.code).toBe('22023');
    // Gegenprobe: die Vorladung darf stundenweise.
    const { error } = await beantragen(anna, { art: 'dienstverhinderung', anlass: 'vorladung', ereignis: '2026-12-03', von: '2026-12-03', bis: '2026-12-03', zeitVon: '08:00', zeitBis: '10:30' });
    expect(error).toBeNull();
  });

  it('ein Zeitraum ohne Arbeitstag und eine Überschneidung werden abgewiesen', async () => {
    expect((await beantragen(anna, { art: 'unbezahlt', von: '2026-12-05', bis: '2026-12-06' })).error?.code).toBe('55000');
    expect((await beantragen(anna, { art: 'unbezahlt', von: '2026-11-12', bis: '2026-11-12' })).error?.code).toBe('23P01');
  });

  it('nicht direkt in die Tabelle', async () => {
    const { error } = await anna.client.from('freistellungen').insert({
      company_id: BETRIEB, user_id: anna.uid, user_name: 'x', art: 'unbezahlt', von: '2027-01-04', bis: '2027-01-04',
    });
    expect(error).not.toBeNull();
  });
});

describe('Lesen', () => {
  let id: string;
  beforeAll(async () => {
    id = await neu(bert, { art: 'dienstverhinderung', anlass: 'tod_eltern', ereignis: '2026-11-16', von: '2026-11-17', bis: '2026-11-18' });
  });
  const sieht = async (k: Konto) => {
    const { data } = await k.client.from('freistellungen').select('id').eq('id', id);
    return (data ?? []).length === 1;
  };
  it('die Person, das Büro und die Spitze', async () => {
    for (const k of [bert, buch, chefin]) expect(await sieht(k)).toBe(true);
  });
  it('nicht die Projektleitung und nicht Kollegen', async () => {
    for (const k of [pl, anna]) expect(await sieht(k)).toBe(false);
  });
});

describe('Bestätigen und Storno', () => {
  it('das Büro bestätigt; die Tage entstehen, belegte werden übersprungen, Storno räumt genau sie weg', async () => {
    // Am Mittwoch ist schon gearbeitet.
    await zeitEintragen({
      company_id: BETRIEB, user_id: anna.uid, user_name: 'Anna', date: '2026-11-25', status: 'Anwesend',
      start_time: '07:00', end_time: '15:00', break_duration: 30,
    });
    const id = await neu(anna, { art: 'dienstverhinderung', anlass: 'wohnungswechsel', ereignis: '2026-11-24', von: '2026-11-24', bis: '2026-11-26' });
    const { data, error } = await entscheiden(buch, id, 'Bestätigt');
    expect(error).toBeNull();
    expect(data).toMatchObject({ angelegt: 2, uebersprungen: 1 });
    expect((await tage(id)).map((t) => [t.date, t.status])).toEqual([
      ['2026-11-24', 'Dienstverhinderung'], ['2026-11-26', 'Dienstverhinderung'],
    ]);
    const { data: zeile } = await admin.from('freistellungen').select('minuten, status').eq('id', id).single();
    expect(zeile).toMatchObject({ status: 'Bestätigt', minuten: 960 });

    expect((await entscheiden(buch, id, 'Storniert')).error?.code).toBe('22023'); // ohne Grund
    const storno = await entscheiden(buch, id, 'Storniert', { grund: 'Termin verschoben' });
    expect(storno.error).toBeNull();
    expect(await tage(id)).toEqual([]);
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true })
      .eq('user_id', anna.uid).eq('date', '2026-11-25');
    expect(count).toBe(1); // die gearbeitete Zeit bleibt
  });

  it('stundenweise: Arbeit daneben bleibt, die Minuten zählen', async () => {
    const id = await neu(bert, { art: 'pflegefreistellung', von: '2026-12-09', bis: '2026-12-09', zeitVon: '12:00', zeitBis: '16:00' });
    await zeitEintragen({
      company_id: BETRIEB, user_id: bert.uid, user_name: 'Bert', date: '2026-12-09', status: 'Anwesend',
      start_time: '07:00', end_time: '11:30', break_duration: 0,
    });
    expect((await entscheiden(chefin, id, 'Bestätigt')).error).toBeNull();
    const t = await tage(id);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ status: 'Pflegefreistellung', start_time: '12:00:00', end_time: '16:00:00' });
    const { data: zeile } = await admin.from('freistellungen').select('minuten').eq('id', id).single();
    expect(Number(zeile?.minuten)).toBe(240);
  });

  it('Ablehnen nur mit Grund und ohne Tage', async () => {
    const id = await neu(bert, { art: 'dienstverhinderung', anlass: 'geburt', ereignis: '2026-12-14', von: '2026-12-14', bis: '2026-12-15' });
    expect((await entscheiden(buch, id, 'Abgelehnt')).error?.code).toBe('22023');
    expect((await entscheiden(buch, id, 'Abgelehnt', { grund: 'Doppelt beantragt' })).error).toBeNull();
    expect(await tage(id)).toEqual([]);
  });

  it('Projektleitung und Mitarbeiter bestätigen nicht', async () => {
    const id = await neu(bert, { art: 'dienstverhinderung', anlass: 'musterung', ereignis: '2027-01-11', von: '2027-01-11', bis: '2027-01-11' });
    for (const k of [pl, anna]) expect((await entscheiden(k, id, 'Bestätigt')).error?.code).toBe('42501');
  });

  it('über den eigenen Antrag entscheidet jemand anderer', async () => {
    const id = await neu(buch, { art: 'dienstverhinderung', anlass: 'musterung', ereignis: '2027-01-12', von: '2027-01-12', bis: '2027-01-12' });
    expect((await entscheiden(buch, id, 'Bestätigt')).error?.code).toBe('42501');
    expect((await entscheiden(buch2, id, 'Bestätigt')).error).toBeNull();
  });
});

describe('Unbezahlter Urlaub und Kürzung', () => {
  it('nur die Spitze entscheidet; die Kürzung entsteht mit dem Bestätigen und geht mit dem Storno', async () => {
    const id = await neu(anna, { art: 'unbezahlt', von: '2027-03-01', bis: '2027-05-31' });
    expect((await entscheiden(buch, id, 'Bestätigt')).error?.code).toBe('42501');
    const { error } = await entscheiden(chefin, id, 'Bestätigt', { kuerzung: [{ urlaubsjahr: 2027, tage: 6.3 }] });
    expect(error).toBeNull();
    const { data: k } = await admin.from('urlaubsanspruch_anpassungen').select('*').eq('freistellung_id', id);
    expect(k).toHaveLength(1);
    expect(k![0]).toMatchObject({ urlaubsjahr: 2027, tage: -6.3, user_id: anna.uid });
    expect((await tage(id)).every((t) => t.status === 'Unbezahlt')).toBe(true);

    await entscheiden(chefin, id, 'Storniert', { grund: 'Doch nicht' });
    const { data: nachher } = await admin.from('urlaubsanspruch_anpassungen').select('id').eq('freistellung_id', id);
    expect(nachher).toEqual([]);
    expect(await tage(id)).toEqual([]);
  });

  it('eine Kürzung gibt es nur beim unbezahlten Urlaub und nur beim Bestätigen', async () => {
    const a = await neu(bert, { art: 'dienstverhinderung', anlass: 'musterung', ereignis: '2027-02-01', von: '2027-02-01', bis: '2027-02-01' });
    expect((await entscheiden(chefin, a, 'Bestätigt', { kuerzung: [{ urlaubsjahr: 2027, tage: 1 }] })).error?.code).toBe('22023');
    const b = await neu(bert, { art: 'unbezahlt', von: '2027-06-07', bis: '2027-06-08' });
    expect((await entscheiden(chefin, b, 'Abgelehnt', { grund: 'Nein', kuerzung: [{ urlaubsjahr: 2027, tage: 1 }] })).error?.code).toBe('22023');
  });
});

describe('Nachweis', () => {
  const EIMER = 'freistellungsnachweise';
  it('ohne Haken kein Bestätigen; danach kein Pfad, aber der Vermerk', async () => {
    const id = await neu(anna, { art: 'dienstverhinderung', anlass: 'tod_geschwister', ereignis: '2027-01-18', von: '2027-01-19', bis: '2027-01-19' });
    const pfad = `${BETRIEB}/${anna.uid}/${id}/parte.pdf`;
    const hoch = await anna.client.storage.from(EIMER).upload(pfad, new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    expect(hoch.error).toBeNull();
    expect((await anna.client.rpc('freistellung_nachweis_setzen', { p_id: id, p_pfad: pfad })).error).toBeNull();

    // Wer sieht die Datei?
    expect((await buch.client.storage.from(EIMER).download(pfad)).error).toBeNull();
    expect((await bert.client.storage.from(EIMER).download(pfad)).error).not.toBeNull();
    expect((await pl.client.storage.from(EIMER).download(pfad)).error).not.toBeNull();

    expect((await entscheiden(buch, id, 'Bestätigt')).error?.code).toBe('22023');
    const { data, error } = await entscheiden(buch, id, 'Bestätigt', { geprueft: true });
    expect(error).toBeNull();
    expect((data as { nachweis: string }).nachweis).toBe(pfad);
    const { data: zeile } = await admin.from('freistellungen').select('nachweis_pfad, nachweis_geprueft_von_name, nachweis_geprueft_am').eq('id', id).single();
    expect(zeile?.nachweis_pfad).toBeNull();
    expect(zeile?.nachweis_geprueft_von_name).toBeTruthy();
    expect(zeile?.nachweis_geprueft_am).toBeTruthy();
    // Das Büro löscht die Datei danach.
    expect((await buch.client.storage.from(EIMER).remove([pfad])).error).toBeNull();
  });

  it('hochladen nur in den Ordner des eigenen, offenen Antrags', async () => {
    const id = await neu(anna, { art: 'dienstverhinderung', anlass: 'musterung', ereignis: '2027-02-08', von: '2027-02-08', bis: '2027-02-08' });
    const fremd = await bert.client.storage.from(EIMER).upload(`${BETRIEB}/${bert.uid}/${id}/x.pdf`, new Blob(['x'], { type: 'application/pdf' }));
    expect(fremd.error).not.toBeNull();
    expect((await anna.client.rpc('freistellung_nachweis_setzen', { p_id: id, p_pfad: `${BETRIEB}/${anna.uid}/anderer/x.pdf` })).error?.code).toBe('22023');
  });

  it('auch Ablehnen leert den Pfad', async () => {
    const id = await neu(bert, { art: 'dienstverhinderung', anlass: 'musterung', ereignis: '2027-02-09', von: '2027-02-09', bis: '2027-02-09' });
    const pfad = `${BETRIEB}/${bert.uid}/${id}/a.pdf`;
    await bert.client.storage.from(EIMER).upload(pfad, new Blob(['%PDF'], { type: 'application/pdf' }));
    await bert.client.rpc('freistellung_nachweis_setzen', { p_id: id, p_pfad: pfad });
    await entscheiden(buch, id, 'Abgelehnt', { grund: 'Kein Anlass' });
    const { data } = await admin.from('freistellungen').select('nachweis_pfad').eq('id', id).single();
    expect(data?.nachweis_pfad).toBeNull();
  });
});

describe('Pflegefreistellung: die Zusatzwoche', () => {
  it('gibt es erst, wenn die erste Woche verbraucht ist — und nur fürs Kind unter 12', async () => {
    expect((await beantragen(bert, { art: 'pflegefreistellung', von: '2027-03-01', bis: '2027-03-01', kind: true, zusatz: true })).error?.code).toBe('22023');
    expect((await beantragen(bert, { art: 'pflegefreistellung', von: '2027-03-01', bis: '2027-03-01', zusatz: true })).error?.code).toBe('22023');
    // Die 4 Stunden vom Dezember zählen nicht: das Arbeitsjahr beginnt am 15.01. neu.
    const woche = await neu(bert, { art: 'pflegefreistellung', von: '2027-03-08', bis: '2027-03-12' });
    await entscheiden(buch, woche, 'Bestätigt');
    const { error } = await beantragen(bert, { art: 'pflegefreistellung', von: '2027-03-15', bis: '2027-03-15', kind: true, zusatz: true });
    expect(error).toBeNull();
  });
});

describe('Geteilt', () => {
  it('außer beim Todesfall nur mit Begründung, und bestätigen kann es nur die Spitze', async () => {
    await neu(anna, { art: 'dienstverhinderung', anlass: 'hochzeit', ereignis: '2027-04-09', von: '2027-04-08', bis: '2027-04-08' });
    expect((await beantragen(anna, { art: 'dienstverhinderung', anlass: 'hochzeit', ereignis: '2027-04-09', von: '2027-04-12', bis: '2027-04-12' })).error?.code).toBe('22023');
    const zweiter = await neu(anna, { art: 'dienstverhinderung', anlass: 'hochzeit', ereignis: '2027-04-09', von: '2027-04-12', bis: '2027-04-12', notiz: 'Standesamt und Kirche an zwei Tagen' });
    expect((await entscheiden(buch, zweiter, 'Bestätigt')).error?.code).toBe('42501');
    expect((await entscheiden(chefin, zweiter, 'Bestätigt')).error).toBeNull();
    const { data } = await admin.from('freistellungen').select('teilung_freigegeben').eq('id', zweiter).single();
    expect(data?.teilung_freigegeben).toBe(true);
  });

  it('beim Todesfall ohne Begründung, und das Büro bestätigt', async () => {
    await neu(bert, { art: 'dienstverhinderung', anlass: 'tod_partner', ereignis: '2027-05-03', von: '2027-05-04', bis: '2027-05-05' });
    const beisetzung = await neu(bert, { art: 'dienstverhinderung', anlass: 'tod_partner', ereignis: '2027-05-03', von: '2027-05-25', bis: '2027-05-25' });
    expect((await entscheiden(buch, beisetzung, 'Bestätigt')).error).toBeNull();
  });
});

describe('Zeitkonto: Sperren, Monatssicht, Wochenplan', () => {
  let id: string;
  beforeAll(async () => {
    id = await neu(anna, { art: 'dienstverhinderung', anlass: 'geburt', ereignis: '2027-06-14', von: '2027-06-14', bis: '2027-06-15' });
    await entscheiden(buch, id, 'Bestätigt');
  });

  it('an einem ganzen Sonderurlaubstag lässt sich keine Arbeit buchen', async () => {
    const { error } = await anna.client.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, user_id: anna.uid, user_name: 'Anna', date: '2027-06-14',
      status: 'Anwesend', start_time: '07:00', end_time: '12:00', break_duration: 0,
    });
    expect(error?.code).toBe('23P01');
  });

  it('die Tage ändern sich nur über den Antrag — auch nicht durchs Büro', async () => {
    const { data: t } = await admin.from('time_entries').select('id').eq('freistellung_id', id).limit(1).single();
    await buch.client.from('time_entries').delete().eq('id', t!.id);
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true }).eq('freistellung_id', id);
    expect(count).toBe(2);
    const direkt = await buch.client.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, user_id: bert.uid, user_name: 'Bert', date: '2027-06-21',
      status: 'Dienstverhinderung', break_duration: 0,
    });
    expect(direkt.error?.code).toBe('42501');
  });

  it('die Monatssicht zählt ganze Tage und stundenweise Minuten', async () => {
    const { data } = await admin.from('monthly_stats').select('freistellung_tage, freigestellt_min, anwesend_min')
      .eq('user_id', bert.uid).eq('monat', '2026-12').single();
    expect(Number(data?.freigestellt_min)).toBe(240);
    const { data: juni } = await admin.from('monthly_stats').select('freistellung_tage').eq('user_id', anna.uid).eq('monat', '2027-06').single();
    expect(Number(juni?.freistellung_tage)).toBe(2);
  });

  it('im Wochenplan: die Leitung sieht die Art, Kollegen „abwesend" — den Anlass niemand', async () => {
    const { data: leitung } = await pl.client.rpc('wochenplan_abwesend', { p_von: '2027-06-14', p_bis: '2027-06-18' });
    const z = (leitung as Array<{ user_id: string; grund: string | null }>).find((r) => r.user_id === anna.uid);
    expect(z?.grund).toBe('Sonderurlaub');
    const { data: kollege } = await bert.client.rpc('wochenplan_abwesend', { p_von: '2027-06-14', p_bis: '2027-06-18' });
    const k = (kollege as Array<{ user_id: string; grund: string | null }>).find((r) => r.user_id === anna.uid);
    expect(k).toBeTruthy();
    expect(k?.grund).toBeNull();
  });

  it('die Datenauskunft enthält die Anträge, ohne Dateipfad', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: anna.uid });
    expect(error).toBeNull();
    const liste = (data as { daten: { sonderurlaub_und_freistellungen: Array<Record<string, unknown>> } }).daten.sonderurlaub_und_freistellungen;
    expect(liste.length).toBeGreaterThan(0);
    expect(liste.every((f) => !('nachweis_pfad' in f))).toBe(true);
  });
});

describe('Einstellungen des Betriebs', () => {
  it('die Spitze stellt Tage je Anlass und die Kürzungsschwelle ein — gültig, sonst abgewiesen', async () => {
    const gut = await chefin.client.from('companies')
      .update({ freistellung_anlaesse: { wohnungswechsel: 3 }, kuerzung_ab_tagen: 21 }, { count: 'exact' }).eq('id', BETRIEB);
    expect(gut.error).toBeNull();
    expect(gut.count).toBe(1);
    expect((await chefin.client.from('companies').update({ freistellung_anlaesse: { erfunden: 2 } }).eq('id', BETRIEB)).error).not.toBeNull();
    expect((await chefin.client.from('companies').update({ freistellung_anlaesse: { hochzeit: 0 } }).eq('id', BETRIEB)).error).not.toBeNull();
    expect((await chefin.client.from('companies').update({ kuerzung_ab_tagen: 0 }).eq('id', BETRIEB)).error).not.toBeNull();
    await admin.from('companies').update({ freistellung_anlaesse: null, kuerzung_ab_tagen: 14 }).eq('id', BETRIEB);
  });

  it('Gegenprobe: die Buchhaltung ändert sie nicht', async () => {
    const { count } = await buch.client.from('companies').update({ kuerzung_ab_tagen: 30 }, { count: 'exact' }).eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    const { data } = await admin.from('companies').select('kuerzung_ab_tagen').eq('id', BETRIEB).single();
    expect(data?.kuerzung_ab_tagen).toBe(14);
  });
});
