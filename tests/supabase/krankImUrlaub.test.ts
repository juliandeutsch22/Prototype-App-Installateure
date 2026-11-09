/**
 * KRANK IM URLAUB (§ 5 UrlG; Befund 09.11.2026) — gegen den laufenden Stapel.
 * Jede Grenze mit ihrer Gegenprobe:
 *   - ohne Bestätigung bleibt der Urlaub, wie er war; das Speichern nennt
 *     die genehmigten Urlaubstage im Zeitraum;
 *   - mit Bestätigung und mehr als drei Kalendertagen werden sie
 *     Krankentage, der Antrag zählt sie nicht mehr und hält sie fest;
 *   - kürzer, nicht mehr länger als drei Tage oder gelöscht: der Urlaub
 *     kommt zurück;
 *   - umwandeln darf, wer über Urlaub entscheidet — für sich selbst nur
 *     ohne jemand anderen; die Spalte setzt niemand von Hand.
 *
 * Die Tage liegen im April 2027 (Mo 05.04. bis Mo 12.04.).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'krank-im-urlaub';

let gf: Konto;
let bh: Konto;
let ma: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  gf = await konto(BETRIEB, 'Geschäftsführung', 'kiuchefin');
  bh = await konto(BETRIEB, 'Buchhaltung', 'kiubuch');
  ma = await konto(BETRIEB, 'Mitarbeiter', 'kiuma');
  await admin.from('users').update({ weekly_target_hours: 40, work_days: [1, 2, 3, 4, 5], eintritt: '2020-01-15' })
    .in('id', [gf.uid, bh.uid, ma.uid]);
}, 120_000);

const speichern = (k: Konto, a: { id?: string | null; user?: string | null; von: string; bis: string; anrechnen?: boolean }) =>
  k.client.rpc('krankmeldung_speichern', {
    p_id: a.id ?? null, p_user: a.user ?? null, p_von: a.von, p_bis: a.bis,
    ...(a.anrechnen ? { p_urlaub_anrechnen: true } : {}),
  });

async function tage(k: Konto) {
  const { data } = await admin.from('time_entries').select('date, status, vacation_id, krankmeldung_id')
    .eq('user_id', k.uid).gte('date', '2027-04-01').lte('date', '2027-04-30').order('date');
  return (data ?? []).map((t) => `${t.date} ${t.status}`);
}

async function antrag(id: string) {
  const { data } = await admin.from('vacations').select('tage, krank_tage, status').eq('id', id).single();
  return data!;
}

describe('Krank im Urlaub', () => {
  let urlaub: string;
  let meldung: string;

  it('ohne Bestätigung bleibt der Urlaub — das Speichern nennt die Urlaubstage', async () => {
    const u = await gf.client.rpc('urlaub_eintragen', { p_user: ma.uid, p_von: '2027-04-05', p_bis: '2027-04-09', p_notiz: null, p_name: 'Chefin' });
    expect(u.error).toBeNull();
    urlaub = u.data.id as string;
    expect(Number((await antrag(urlaub)).tage)).toBe(5);

    const r = await speichern(bh, { user: ma.uid, von: '2027-04-06', bis: '2027-04-09' });
    expect(r.error).toBeNull();
    meldung = r.data.id;
    expect(r.data).toMatchObject({ angelegt: 0, uebersprungen: 4, kalendertage: 4, urlaub_im_zeitraum: 4, darf_anrechnen: true, urlaub_angerechnet: 0 });
    expect(await tage(ma)).toEqual(['2027-04-05 Urlaub', '2027-04-06 Urlaub', '2027-04-07 Urlaub', '2027-04-08 Urlaub', '2027-04-09 Urlaub']);
  });

  it('die Person selbst wandelt nicht um; drei Kalendertage oder weniger zählen als Urlaub', async () => {
    expect((await speichern(ma, { id: meldung, von: '2027-04-06', bis: '2027-04-09', anrechnen: true })).error?.code).toBe('42501');
    expect((await speichern(bh, { id: meldung, von: '2027-04-06', bis: '2027-04-08', anrechnen: true })).error?.code).toBe('22023');
    expect(await tage(ma)).toContain('2027-04-09 Urlaub');
  });

  it('mit Bestätigung werden die Tage Krankenstand, der Antrag zählt sie nicht mehr', async () => {
    const r = await speichern(bh, { id: meldung, von: '2027-04-06', bis: '2027-04-09', anrechnen: true });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ urlaub_angerechnet: 4, urlaub_im_zeitraum: 0 });
    expect(await tage(ma)).toEqual(['2027-04-05 Urlaub', '2027-04-06 Krank', '2027-04-07 Krank', '2027-04-08 Krank', '2027-04-09 Krank']);
    const a = await antrag(urlaub);
    expect(Number(a.tage)).toBe(1);
    expect((a.krank_tage as Array<{ tag: string; meldung: string }>).map((x) => x.tag)).toEqual(['2027-04-06', '2027-04-07', '2027-04-08', '2027-04-09']);
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true }).eq('krankmeldung_id', meldung);
    expect(count).toBe(4);
  });

  it('nicht mehr länger als drei Tage: der Urlaub kommt zurück', async () => {
    const r = await speichern(bh, { id: meldung, von: '2027-04-06', bis: '2027-04-08' });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ urlaub_zurueck: 4 });
    expect(await tage(ma)).toEqual(['2027-04-05 Urlaub', '2027-04-06 Urlaub', '2027-04-07 Urlaub', '2027-04-08 Urlaub', '2027-04-09 Urlaub']);
    expect(await antrag(urlaub)).toMatchObject({ krank_tage: [] });
    expect(Number((await antrag(urlaub)).tage)).toBe(5);
  });

  it('länger und wieder umgewandelt, dann gelöscht: der Urlaub kommt zurück', async () => {
    const r = await speichern(bh, { id: meldung, von: '2027-04-06', bis: '2027-04-12', anrechnen: true });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ urlaub_angerechnet: 4, angelegt: 1 });
    expect(Number((await antrag(urlaub)).tage)).toBe(1);
    const weg = await bh.client.rpc('krankmeldung_loeschen', { p_id: meldung });
    expect(weg.error).toBeNull();
    expect(weg.data).toBe(5);
    expect(await tage(ma)).toEqual(['2027-04-05 Urlaub', '2027-04-06 Urlaub', '2027-04-07 Urlaub', '2027-04-08 Urlaub', '2027-04-09 Urlaub']);
    expect(await antrag(urlaub)).toMatchObject({ krank_tage: [], status: 'Genehmigt' });
    expect(Number((await antrag(urlaub)).tage)).toBe(5);
  });

  it('den eigenen Urlaub wandelt jemand anderer um (vier Augen)', async () => {
    const u = await gf.client.rpc('urlaub_eintragen', { p_user: bh.uid, p_von: '2027-04-19', p_bis: '2027-04-23', p_notiz: null, p_name: 'Chefin' });
    expect(u.error).toBeNull();
    const r = await speichern(bh, { von: '2027-04-19', bis: '2027-04-23', anrechnen: true });
    expect(r.error?.code).toBe('42501');
    const ohne = await speichern(bh, { von: '2027-04-19', bis: '2027-04-23' });
    expect(ohne.error).toBeNull();
    expect(ohne.data).toMatchObject({ darf_anrechnen: false, urlaub_im_zeitraum: 5 });
    // Gegenprobe: die Chefin wandelt um.
    expect((await speichern(gf, { id: ohne.data.id, von: '2027-04-19', bis: '2027-04-23', anrechnen: true })).data)
      .toMatchObject({ urlaub_angerechnet: 5 });
  });

  it('die Spalte setzt niemand von Hand', async () => {
    const r = await gf.client.from('vacations').update({ krank_tage: [{ tag: '2027-04-05', anteil: 1 }] }).eq('id', urlaub);
    expect(r.error?.code).toBe('42501');
  });
});
