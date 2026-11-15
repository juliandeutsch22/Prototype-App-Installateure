/**
 * MONATSABSCHLUSS DER ZEITEN (Durchsicht 15.11.2026, Z6 + F3, E1) gegen die
 * Datenbank. Nachgestellt: ein Monteur ändert und löscht eine Buchung eines
 * alten Monats, auch nach dem Lohnexport. Mit Abschluss geht das nicht mehr
 * — von niemandem; der Korrekturantrag setzt weiter um, das Büro öffnet mit
 * Grund wieder. Aus = wie bisher.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = `abschluss-${randomUUID().slice(0, 6)}`;
let buero: Konto;
let chefin: Konto;
let monteur: Konto;
const OKTOBER = '2026-10-14';
let eintragId: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buero = await konto(BETRIEB, 'Buchhaltung', 'ma-buero');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'ma-chefin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ma-monteur');
  await admin.from('users').update({ app_start_date: '2026-01-01', eintritt: '2026-01-01' }).eq('id', monteur.uid);
  eintragId = randomUUID();
  const { error } = await admin.from('time_entries').insert({
    id: eintragId, company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', date: OKTOBER,
    status: 'Anwesend', start_time: '07:00', end_time: '15:30', break_duration: 30,
  });
  if (error) throw new Error(error.message);
  await admin.from('companies').update({ modules: { 'zeiterfassung.korrekturantraege': true } }).eq('id', BETRIEB);
}, 60_000);

const aendern = (k: Konto, ende: string) => k.client.from('time_entries').update({ end_time: ende }).eq('id', eintragId).select('id');

describe('Monatsabschluss', () => {
  it('bleibt gleich: ausgeschaltet ändert der Monteur seinen Oktober wie bisher', async () => {
    const { data, error } = await aendern(monteur, '16:00');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('ausgeschaltet lässt sich kein Monat abschließen', async () => {
    const { error } = await buero.client.rpc('zeit_monat_abschliessen', { p_monat: '2026-10-01' });
    expect(error?.code).toBe('22023');
  });

  it('der Monteur schließt nicht ab', async () => {
    await admin.from('companies').update({ zeit_monatsabschluss: true }).eq('id', BETRIEB);
    const { error } = await monteur.client.rpc('zeit_monat_abschliessen', { p_monat: '2026-10-01' });
    expect(error?.code).toBe('42501');
  });

  it('abgeschlossen: weder Monteur noch Büro ändern, löschen oder buchen im Oktober', async () => {
    const { error } = await buero.client.rpc('zeit_monat_abschliessen', { p_monat: '2026-10-01' });
    expect(error).toBeNull();
    expect((await aendern(monteur, '17:00')).error?.code).toBe('23514');
    expect((await aendern(buero, '17:00')).error?.code).toBe('23514');
    const loeschen = await monteur.client.from('time_entries').delete().eq('id', eintragId);
    expect(loeschen.error?.code).toBe('23514');
    const neu = await monteur.client.from('time_entries').insert({
      id: randomUUID(), company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', date: '2026-10-15',
      status: 'Anwesend', start_time: '07:00', end_time: '12:00', break_duration: 0,
    });
    expect(neu.error?.code).toBe('23514');
    expect(neu.error?.message).toMatch(/abgeschlossen — Änderungen nur über einen Korrekturantrag/);
  });

  it('der Korrekturantrag setzt im abgeschlossenen Monat um', async () => {
    const antrag = randomUUID();
    const { error: f1 } = await monteur.client.rpc('zeit_korrektur_beantragen', { p_id: antrag, p_eintrag: eintragId, p_wunsch: 'Ende 15:00' });
    expect(f1).toBeNull();
    const { error: f2 } = await buero.client.rpc('zeit_korrektur_entscheiden', {
      p_id: antrag, p_stand: 'umgesetzt', p_grund: 'passt', p_eintrag: { end_time: '15:00' },
    });
    expect(f2).toBeNull();
    const { data } = await admin.from('time_entries').select('end_time').eq('id', eintragId).single();
    expect(data!.end_time).toBe('15:00:00');
  });

  it('eine Arbeitszeit ab einem Tag im abgeschlossenen Monat wird abgewiesen', async () => {
    const { error } = await chefin.client.rpc('arbeitszeit_aendern', {
      p_user: monteur.uid, p_ab: '2026-10-20', p_wochenstunden: 30, p_arbeitstage: [1, 2, 3, 4, 5],
    });
    expect(error?.code).toBe('23514');
  });

  it('wieder öffnen nur mit Grund — danach geht es wieder, und der Verlauf hält beides fest', async () => {
    expect((await buero.client.rpc('zeit_monat_oeffnen', { p_monat: '2026-10-01', p_grund: '' })).error?.code).toBe('22023');
    expect((await buero.client.rpc('zeit_monat_oeffnen', { p_monat: '2026-10-01', p_grund: 'Nachtrag Krankenstand' })).error).toBeNull();
    expect((await aendern(monteur, '15:30')).error).toBeNull();
    const { data } = await monteur.client.from('zeit_monatsabschluesse').select('aktion, grund').eq('company_id', BETRIEB).order('am');
    expect(data).toEqual([{ aktion: 'abgeschlossen', grund: null }, { aktion: 'geoeffnet', grund: 'Nachtrag Krankenstand' }]);
  });

  it('der laufende Monat lässt sich nicht abschließen', async () => {
    const heute = new Date();
    const erster = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-01`;
    const { error } = await buero.client.rpc('zeit_monat_abschliessen', { p_monat: erster });
    expect(error?.code).toBe('22023');
  });

  it('die Datenauskunft des Büros nennt, welche Monate es abgeschlossen und geöffnet hat', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buero.uid });
    expect(error).toBeNull();
    const d = (data as { daten: Record<string, Array<{ aktion: string }>> }).daten;
    expect(d.zeit_monatsabschluesse.map((z) => z.aktion)).toEqual(['abgeschlossen', 'geoeffnet']);
  });
});
