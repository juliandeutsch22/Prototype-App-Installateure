import { beforeAll, describe, expect, it } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
let ad: Konto, ma: Konto, bh: Konto, fremd: Konto;
const A = 'm06-zeit-a', B = 'm06-zeit-b';
const timer = crypto.randomUUID();
const befehl = (wer: Konto, art: string, revision: number, zeit: string, id = timer, befehlId = crypto.randomUUID()) =>
  wer.client.rpc('zeit_timer_befehl', { p_id: id, p_befehl: befehlId, p_revision: revision, p_art: art, p_zeit: zeit, p_baustelle: '' });
beforeAll(async () => {
  await betriebAnlegen(A); await betriebAnlegen(B);
  await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', A);
  ad = await konto(A, 'Administrator', 'm6ad'); ma = await konto(A, 'Mitarbeiter', 'm6ma');
  bh = await konto(A, 'Buchhaltung', 'm6bh'); fremd = await konto(B, 'Mitarbeiter', 'm6fremd');
});
describe('Standardfelder', () => {
  it('nur Spitze ändert gültige Standardfelder; Grundlagen sind geschützt', async () => {
    expect((await ad.client.from('companies').update({ zeit_standardfelder: { travelTime: false, comment: false } }).eq('id', A)).error).toBeNull();
    expect((await ad.client.from('companies').update({ zeit_standardfelder: { startTime: false } }).eq('id', A)).error?.code).toBe('22023');
    expect((await ma.client.from('companies').update({ zeit_standardfelder: { travelTime: true } }).eq('id', A)).count ?? 0).toBe(0);
  });
  it('alte Buchungswerte bleiben bei einer Änderung anderer Spalten erhalten', async () => {
    const e = { ...buchung(ma, '2099-01-02'), travel_time: 15, comment: 'Tätigkeit' };
    expect((await ma.client.from('time_entries').insert(e)).error).toBeNull();
    expect((await ma.client.from('time_entries').update({ end_time: '15:00' }).eq('id', e.id)).error).toBeNull();
    expect((await ma.client.from('time_entries').select('travel_time,comment').eq('id', e.id).single()).data).toEqual({ travel_time: 15, comment: 'Tätigkeit' });
  });
});
describe('Timer mit unveränderter normaler Zeitprüfung', () => {
  it('Start ist wiederholbar, aber eine zweite Sitzung und fremde Befehle scheitern', async () => {
    const cmd = crypto.randomUUID();
    const r = await befehl(ma, 'start', 0, '2099-02-02T07:00:00+01:00', timer, cmd);
    expect(r.error).toBeNull(); expect(r.data.revision).toBe(1);
    expect((await befehl(ma, 'start', 0, '2099-02-02T07:00:00+01:00', timer, cmd)).data.revision).toBe(1);
    expect((await befehl(ma, 'start', 0, '2099-02-02T07:00:00+01:00', crypto.randomUUID())).error).not.toBeNull();
    expect((await befehl(fremd, 'pause', 1, '2099-02-02T09:00:00+01:00')).error?.code).toBe('42501');
  });
  it('Gerätewechsel erkennt eine alte Revision, Pause und Weiterlaufen bleiben getrennt', async () => {
    expect((await befehl(ma, 'pause', 1, '2099-02-02T09:00:00+01:00')).error).toBeNull();
    expect((await befehl(ma, 'weiter', 1, '2099-02-02T09:30:00+01:00')).error?.code).toBe('22023');
    expect((await befehl(ma, 'weiter', 2, '2099-02-02T09:30:00+01:00')).error).toBeNull();
    const r = await befehl(ma, 'stop', 3, '2099-02-02T12:00:00+01:00');
    expect(r.error).toBeNull(); expect(r.data.stand).toBe('beendet');
    expect(r.data.segmente).toHaveLength(3);
    expect((await admin.from('time_entries').select('id').eq('user_id', ma.uid).eq('date', '2099-02-02')).data).toEqual([]);
  });
  it('erst die bestätigte normale Buchung zählt; Wiederholung erzeugt keine zweite', async () => {
    const e = { ...buchung(ma, '2099-02-02'), start_time: '07:00', end_time: '09:00', break_duration: 0 };
    const r = await ma.client.rpc('zeit_timer_buchen', { p_id: timer, p_segment: 0, p_eintrag: e });
    expect(r.error).toBeNull();
    expect((await ma.client.rpc('zeit_timer_buchen', { p_id: timer, p_segment: 0, p_eintrag: e })).data).toBe(r.data);
    const { count } = await admin.from('time_entries').select('*', { head: true, count: 'exact' }).eq('user_id', ma.uid).eq('date', '2099-02-02');
    expect(count).toBe(1);
    expect((await admin.from('zeitbuchung_verlauf').select('art').eq('eintrag_id', r.data)).data).toEqual([{ art: 'angelegt' }]);
  });
  it('eine Pause ist keine Arbeit; überlappende Bestätigung wird nicht durchgewunken', async () => {
    expect((await ma.client.rpc('zeit_timer_buchen', { p_id: timer, p_segment: 1, p_eintrag: buchung(ma, '2099-02-02') })).error).not.toBeNull();
    const e = { ...buchung(ma, '2099-02-02'), start_time: '08:00', end_time: '10:00', break_duration: 0 };
    expect((await ma.client.rpc('zeit_timer_buchen', { p_id: timer, p_segment: 2, p_eintrag: e })).error).not.toBeNull();
    expect((await ma.client.rpc('zeit_timer_buchen', { p_id: timer, p_segment: 2, p_eintrag: { ...e, start_time: '09:30', end_time: '12:00' } })).error).toBeNull();
  });
  it('ein deaktivierter Timer erlaubt keinen neuen Start; Nachtrag bleibt möglich', async () => {
    await admin.from('companies').update({ modules: { 'zeiterfassung.timer': false } }).eq('id', A);
    expect((await befehl(ma, 'start', 0, '2099-02-03T07:00:00+01:00', crypto.randomUUID())).error).not.toBeNull();
    expect((await ma.client.from('time_entries').insert(buchung(ma, '2099-02-03'))).error).toBeNull();
    await admin.from('companies').update({ modules: {} }).eq('id', A);
  });
});

describe('Korrekturanträge ergänzen vorhandene Rechte', () => {
  const antrag = crypto.randomUUID(); let eintrag: string;
  it('ein eigener Nachtrag bleibt ohne Antrag direkt änderbar', async () => {
    const e = buchung(ma, '2099-04-04'); eintrag = e.id as string;
    expect((await ma.client.from('time_entries').insert(e)).error).toBeNull();
    expect((await ma.client.from('time_entries').update({ comment: 'Selbst geändert' }).eq('id', eintrag)).error).toBeNull();
    await admin.from('companies').update({ modules: { 'zeiterfassung.korrekturantraege': true, 'zeiterfassung.timer': true } }).eq('id', A);
    expect((await ma.client.rpc('zeit_korrektur_beantragen', { p_id: antrag, p_eintrag: eintrag, p_wunsch: 'Tatsächlich bis 15 Uhr gearbeitet' })).error).toBeNull();
  });
  it('weder fremder Betrieb noch die Person selbst entscheidet; ohne Änderung kein Erledigt', async () => {
    for (const wer of [ma, fremd]) expect((await wer.client.rpc('zeit_korrektur_entscheiden', { p_id: antrag, p_stand: 'umgesetzt', p_grund: 'Geprüft' })).error?.code).toBe('42501');
    expect((await bh.client.rpc('zeit_korrektur_entscheiden', { p_id: antrag, p_stand: 'umgesetzt', p_grund: 'Geprüft' })).error?.code).toBe('22023');
  });
  it('die Entscheidung und normale Buchung sind atomar und stehen im vorhandenen Änderungsverlauf', async () => {
    const r = await bh.client.rpc('zeit_korrektur_entscheiden', { p_id: antrag, p_stand: 'umgesetzt', p_grund: 'Mit Mitarbeiter abgeglichen', p_eintrag: { end_time: '15:00', is_billed: false, user_id: fremd.uid } });
    expect(r.error).toBeNull();
    expect((await ma.client.from('time_entries').select('end_time,user_id').eq('id', eintrag).single()).data).toEqual({ end_time: '15:00:00', user_id: ma.uid });
    expect((await ma.client.from('zeitkorrekturen').select('stand').eq('id', antrag).single()).data?.stand).toBe('umgesetzt');
    const verlauf = await ma.client.from('zeitbuchung_verlauf').select('von_uid').eq('eintrag_id', eintrag).eq('art', 'geaendert');
    expect(verlauf.data?.some((v) => v.von_uid === bh.uid)).toBe(true);
  });
  it('verrechnete Buchungen bleiben auch mit Antrag gesperrt', async () => {
    const e = { ...buchung(ma, '2099-04-05'), is_billed: true }; await admin.from('time_entries').insert(e);
    const id = crypto.randomUUID();
    expect((await ma.client.rpc('zeit_korrektur_beantragen', { p_id: id, p_eintrag: e.id, p_wunsch: 'Beginn war 8 Uhr' })).error).toBeNull();
    expect((await bh.client.rpc('zeit_korrektur_entscheiden', { p_id: id, p_stand: 'umgesetzt', p_grund: 'Geprüft', p_eintrag: { start_time: '08:00', is_billed: false } })).error).not.toBeNull();
    expect((await ma.client.from('zeitkorrekturen').select('stand').eq('id', id).single()).data?.stand).toBe('offen');
  });
});

describe('Offene Vorgänge abschließen und Historie bewahren', () => {
  it('ein aktiver Timer bleibt nach Abschalten beendbar und nimmt seine Pflichtangaben mit', async () => {
    await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', A);
    const feld = await ad.client.rpc('zeitfeld_speichern', { p_feld: { name: 'Kostenstelle Abschluss', typ: 'text', pflicht: 'beim_buchen' } });
    expect(feld.error).toBeNull(); const { id, fassung } = feld.data;
    for (const [index, flag] of [undefined, 2, 'aktiv', null, {}, [], false, 0, ''].entries()) {
      await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', A);
      const datum = `2099-05-${10 + index}`;
      const s = crypto.randomUUID();
      expect((await befehl(ma, 'start', 0, `${datum}T07:00:00+02:00`, s)).error).toBeNull();
      await admin.from('companies').update({ modules: { zeiterfassung: false, ...(flag === undefined ? {} : { 'zeiterfassung.freie_zeitfelder': flag }) } }).eq('id', A);
      expect((await befehl(ma, 'stop', 1, `${datum}T08:00:00+02:00`, s)).error).toBeNull();
      const eintrag = { ...buchung(ma, datum), end_time: '08:00', break_duration: 0 };
      const angaben = { fassung, werte: { [id]: 'Werkstatt' } };
      const ergebnis = await ma.client.rpc('zeit_timer_buchen', { p_id: s, p_segment: 0, p_eintrag: { ...eintrag, zeitfelder: angaben } });
      if (flag === null || flag === undefined || Boolean(flag)) expect(ergebnis.error, JSON.stringify(flag)).toBeNull();
      else {
        expect(ergebnis.error?.code, JSON.stringify(flag)).toBe('55000');
        expect((await ma.client.rpc('zeit_timer_buchen', { p_id: s, p_segment: 0, p_eintrag: eintrag })).error).toBeNull();
      }
    }
    expect((await ma.client.from('zeitfeld_definitionen').select('name').eq('id', id)).data).toEqual([{ name: 'Kostenstelle Abschluss' }]);
    // V3: die bestehenden Schreibwege erhalten, auch für ältere Geräte.
    expect((await ma.client.from('time_entries').insert(buchung(ma, '2099-05-07'))).error).toBeNull();
    await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', A);
  });
  it('Fehlstarts werden mit Grund abgeschlossen; verworfene Abschnitte lassen sich nicht nachbuchen', async () => {
    const s = crypto.randomUUID();
    expect((await befehl(ma, 'start', 0, '2099-06-06T07:00:00+02:00', s)).error).toBeNull();
    expect((await befehl(ma, 'stop', 1, '2099-06-06T07:00:10+02:00', s)).error).toBeNull();
    expect((await ma.client.rpc('zeit_timer_abschnitt_verwerfen', { p_id: s, p_segment: 0, p_grund: '' })).error).not.toBeNull();
    expect((await ma.client.rpc('zeit_timer_abschnitt_verwerfen', { p_id: s, p_segment: 0, p_grund: 'Versehentlich gestartet' })).error).toBeNull();
    expect((await ma.client.from('zeitsitzungen').select('abgeschlossen').eq('id', s).single()).data?.abgeschlossen).toBe(true);
    expect((await ma.client.rpc('zeit_timer_buchen', { p_id: s, p_segment: 0, p_eintrag: buchung(ma, '2099-06-06') })).error?.message).toMatch(/verworfen/);
  });
});

describe('Korrektur nach dem ursprünglichen Entsperrablauf', () => {
  it('Entsperren alleine ist keine Korrektur; ein frisch geprüftes Zeitprofil lässt sich danach berichtigen', async () => {
    await admin.from('companies').update({ modules: { 'zeiterfassung.korrekturantraege': true, 'zeiterfassung.freie_zeitfelder': false } }).eq('id', A);
    const e = { ...buchung(ma, '2099-07-07'), is_billed: true };
    expect((await admin.from('time_entries').insert(e)).error).toBeNull();
    const id = crypto.randomUUID();
    expect((await ma.client.rpc('zeit_korrektur_beantragen', { p_id: id, p_eintrag: e.id, p_wunsch: 'Tatsächlicher Beginn war 8 Uhr' })).error).toBeNull();
    await admin.from('time_entries').update({ is_billed: false }).eq('id', e.id);
    expect((await bh.client.rpc('zeit_korrektur_entscheiden', { p_id: id, p_stand: 'umgesetzt', p_grund: 'Nur entsperrt' })).error?.code).toBe('22023');
    const { data: alt } = await admin.from('time_entries').select('updated_at').eq('id', e.id).single();
    expect((await bh.client.rpc('zeit_korrektur_entscheiden', { p_id: id, p_stand: 'umgesetzt', p_grund: 'Abgeglichen', p_eintrag: { start_time: '08:00' }, p_geaendert_am: alt!.updated_at })).error).toBeNull();
  });
});

describe('Nachvollziehbarkeit der M6-Daten', () => {
  it('eine tatsächlich protokollierte Entfernung kann das Büro als Korrektur bestätigen', async () => {
    const e = buchung(ma, '2099-08-08'); expect((await ma.client.from('time_entries').insert(e)).error).toBeNull();
    const id = crypto.randomUUID();
    expect((await ma.client.rpc('zeit_korrektur_beantragen', { p_id: id, p_eintrag: e.id, p_wunsch: 'Versehentlich doppelt gebuchter Tag' })).error).toBeNull();
    expect((await ma.client.from('time_entries').delete().eq('id', e.id)).error).toBeNull();
    expect((await bh.client.rpc('zeit_korrektur_entscheiden', { p_id: id, p_stand: 'umgesetzt', p_grund: 'Entfernung im Verlauf geprüft' })).error).toBeNull();
  });
  it('Sitzungen, Gründe und Korrekturen gehören zur Personenauskunft', async () => {
    const r = await ad.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: ma.uid });
    expect(r.error).toBeNull();
    expect(r.data.daten.zeit_sitzungen.length).toBeGreaterThan(0);
    expect(r.data.daten.zeit_korrekturantraege.length).toBeGreaterThan(0);
    expect(r.data.daten.zeit_korrekturantraege.some((a: { entscheidung: string }) => a.entscheidung === 'Entfernung im Verlauf geprüft')).toBe(true);
  });
});

describe('Gültige Timer-Befehle', () => {
  it('ein fehlender Befehl und unendliche Zeitpunkte werden abgelehnt', async () => {
    for (const [art, zeit] of [[null,'2099-09-09T07:00:00Z'],['start','infinity']] as const) {
      expect((await ma.client.rpc('zeit_timer_befehl', { p_id: crypto.randomUUID(), p_befehl: crypto.randomUUID(), p_revision: 0, p_art: art, p_zeit: zeit, p_baustelle: '' })).error?.code).toBe('22023');
    }
  });
});
