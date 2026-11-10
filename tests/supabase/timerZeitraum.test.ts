/**
 * ARBEITSTAG PRÜFEN: EIN ZEITRAUM, EINE BUCHUNG (E73) — `zeit_timer_zeitraum_buchen`.
 *
 * Arbeit, Pause, Arbeit an derselben Baustelle wird EINE Buchung mit den
 * Pausenminuten, durch dieselben Trigger wie das Formular. Wiederholbar aus
 * dem Ausgangsfach; nichts wird doppelt gebucht; Verworfenes bleibt draußen.
 *
 * Gegenprobe: ohne die Migration `20261110200000_timer_zeitraum_buchen.sql`
 * gibt es die Funktion nicht — jede Prüfung hier ist rot.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const A = 'timer-zeitraum-a';
let ma: Konto;
let kollege: Konto;

const befehl = (wer: Konto, id: string, art: string, revision: number, zeit: string, baustelle = '') =>
  wer.client.rpc('zeit_timer_befehl', { p_id: id, p_befehl: crypto.randomUUID(), p_revision: revision, p_art: art, p_zeit: zeit, p_baustelle: baustelle });

/** Ein beendeter Tag: Arbeit 07–12, Pause 12–12:30, Arbeit 12:30–16 — und auf Wunsch ein Wechsel bis 17 Uhr. */
async function tag(datum: string, mitWechsel = false): Promise<string> {
  const id = crypto.randomUUID();
  const schritte: [string, string, string][] = [
    ['start', `${datum}T07:00:00+01:00`, 'B-1'],
    ['pause', `${datum}T12:00:00+01:00`, 'B-1'],
    ['weiter', `${datum}T12:30:00+01:00`, 'B-1'],
    ...(mitWechsel ? [['wechsel', `${datum}T16:00:00+01:00`, 'B-2'] as [string, string, string]] : []),
    ['stop', `${datum}T${mitWechsel ? '17' : '16'}:00:00+01:00`, ''],
  ];
  for (const [i, [art, zeit, baustelle]] of schritte.entries()) {
    const r = await befehl(ma, id, art, i, zeit, baustelle);
    if (r.error) throw new Error(r.error.message);
  }
  return id;
}

const eintrag = (datum: string, rest: Record<string, unknown> = {}) => {
  const { id: _id, company_id: _c, user_id: _u, ...e } = buchung(ma, datum, { start_time: '07:00', end_time: '16:00', break_duration: 30, ...rest });
  void _id; void _c; void _u;
  return e;
};

const buchen = (wer: Konto, id: string, von: number, bis: number, e: Record<string, unknown>) =>
  wer.client.rpc('zeit_timer_zeitraum_buchen', { p_id: id, p_von: von, p_bis: bis, p_eintrag: e });

const sitzung = async (id: string) =>
  (await admin.from('zeitsitzungen').select('segmente, abgeschlossen').eq('id', id).single()).data as { segmente: { art: string; id: string; buchung?: string }[]; abgeschlossen: boolean };

beforeAll(async () => {
  await betriebAnlegen(A);
  await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', A);
  ma = await konto(A, 'Mitarbeiter', 'tzma');
  kollege = await konto(A, 'Mitarbeiter', 'tzkollege');
}, 120_000);

describe('zeit_timer_zeitraum_buchen', () => {
  it('Arbeit, Pause, Arbeit wird eine Buchung mit 30 Min. Pause; der Tag ist danach abgeschlossen', async () => {
    const id = await tag('2099-03-02');
    const r = await buchen(ma, id, 0, 2, eintrag('2099-03-02'));
    expect(r.error).toBeNull();
    const vorher = await sitzung(id);
    expect(r.data).toBe(vorher.segmente[0].id);
    expect(vorher.segmente.map((v) => v.buchung ?? null)).toEqual([r.data, null, r.data]);
    expect(vorher.abgeschlossen).toBe(true);
    const { data } = await admin.from('time_entries').select('start_time, end_time, break_duration').eq('user_id', ma.uid).eq('date', '2099-03-02');
    expect(data).toEqual([{ start_time: '07:00:00', end_time: '16:00:00', break_duration: 30 }]);
    // Dieselben Trigger wie das Formular: der Verlauf kennt die Buchung.
    expect((await admin.from('zeitbuchung_verlauf').select('art').eq('eintrag_id', r.data)).data).toEqual([{ art: 'angelegt' }]);
  });

  it('dieselbe Eingabe ist eine Wiederholung, eine andere wird abgewiesen', async () => {
    const id = await tag('2099-03-03');
    const e = eintrag('2099-03-03');
    const erste = await buchen(ma, id, 0, 2, e);
    expect((await buchen(ma, id, 0, 2, e)).data).toBe(erste.data);
    expect((await buchen(ma, id, 0, 2, { ...e, end_time: '15:30' })).error?.message).toMatch(/anderen Angaben/);
    const { count } = await admin.from('time_entries').select('*', { head: true, count: 'exact' }).eq('user_id', ma.uid).eq('date', '2099-03-03');
    expect(count).toBe(1);
  });

  it('ein Wechsel sind zwei Zeiträume; erst beide schließen den Tag ab', async () => {
    const id = await tag('2099-03-04', true);
    expect((await buchen(ma, id, 0, 2, eintrag('2099-03-04', { project_number: '' }))).error).toBeNull();
    expect((await sitzung(id)).abgeschlossen).toBe(false);
    expect((await buchen(ma, id, 3, 3, eintrag('2099-03-04', { start_time: '16:00', end_time: '17:00', break_duration: 0 }))).error).toBeNull();
    expect((await sitzung(id)).abgeschlossen).toBe(true);
  });

  it('beginnt und endet mit Arbeit, im Bereich der Sitzung', async () => {
    const id = await tag('2099-03-05');
    expect((await buchen(ma, id, 1, 2, eintrag('2099-03-05'))).error?.message).toMatch(/beginnt und endet mit Arbeit/);
    expect((await buchen(ma, id, 0, 1, eintrag('2099-03-05'))).error?.message).toMatch(/beginnt und endet mit Arbeit/);
    expect((await buchen(ma, id, 2, 0, eintrag('2099-03-05'))).error?.message).toMatch(/Zeitraum fehlt/);
    expect((await buchen(ma, id, 0, 9, eintrag('2099-03-05'))).error?.message).toMatch(/Zeitraum fehlt/);
  });

  it('nichts doppelt: ein verworfener oder schon einzeln gebuchter Abschnitt sperrt den Zeitraum', async () => {
    const verworfen = await tag('2099-03-06');
    expect((await ma.client.rpc('zeit_timer_abschnitt_verwerfen', { p_id: verworfen, p_segment: 2, p_grund: 'Schulung' })).error).toBeNull();
    expect((await buchen(ma, verworfen, 0, 2, eintrag('2099-03-06'))).error?.message).toMatch(/schon gebucht oder verworfen/);
    // Der übrige Abschnitt allein bleibt buchbar.
    expect((await buchen(ma, verworfen, 0, 0, eintrag('2099-03-06', { end_time: '12:00', break_duration: 0 }))).error).toBeNull();

    const alt = await tag('2099-03-07');
    // Eine ältere Fassung hat den Nachmittag einzeln gebucht.
    expect((await ma.client.rpc('zeit_timer_buchen', { p_id: alt, p_segment: 2, p_eintrag: eintrag('2099-03-07', { start_time: '12:30', break_duration: 0 }) })).error).toBeNull();
    expect((await buchen(ma, alt, 0, 2, eintrag('2099-03-07'))).error?.message).toMatch(/schon gebucht oder verworfen/);
  });

  it('nur die eigene, beendete Sitzung', async () => {
    const id = await tag('2099-03-09');
    expect((await buchen(kollege, id, 0, 2, eintrag('2099-03-09'))).error?.code).toBe('42501');
    const laeuft = crypto.randomUUID();
    expect((await befehl(ma, laeuft, 'start', 0, '2099-03-10T07:00:00+01:00', 'B-1')).error).toBeNull();
    expect((await buchen(ma, laeuft, 0, 0, eintrag('2099-03-10'))).error?.message).toMatch(/zuerst beenden/);
    expect((await befehl(ma, laeuft, 'stop', 1, '2099-03-10T08:00:00+01:00')).error).toBeNull();
  });
});
