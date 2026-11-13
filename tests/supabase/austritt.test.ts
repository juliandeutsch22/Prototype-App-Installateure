/**
 * DAS AUSTRITTSDATUM IN DER DATENBANK (E87).
 *
 *   - Der Austritt liegt nie vor dem Eintritt oder dem Saldo-Start.
 *   - Nach ihm nimmt die Datenbank keine Buchung und keinen Einsatz an —
 *     am Austrittstag selbst schon; der Rücklauf (Dienstschlüssel) ist
 *     ausgenommen, und eine alte Zeile bleibt änderbar, solange ihr Tag bleibt.
 *   - Der Wochenplan zeigt die Tage danach als abwesend, „Ausgetreten“ nur
 *     für die Leitung; „mehrere Tage“ (E85) überspringt sie.
 *   - Er steht in der Datenauskunft der Person.
 *
 * Die Tage liegen im Dezember 2027, weit weg von heute und morgen: dort
 * meldete sich sonst die Planänderung (E85).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'austritt-e87';
const BAU = 'B-AUSTRITT-1';
let monteur: Konto;
let kollegin: Konto;
let planer: Konto;
let chefin: Konto;

async function aufraeumen() {
  await admin.from('assignments').delete().eq('company_id', BETRIEB);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'e87mont');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'e87kol');
  planer = await konto(BETRIEB, 'Projektleiter', 'e87plan');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'e87chef');
  const { error } = await admin.from('users')
    .update({ eintritt: '2027-01-01', app_start_date: '2027-01-01', austritt: '2027-12-15' })
    .eq('id', monteur.uid);
  if (error) throw new Error(error.message);
  await aufraeumen();
}, 120_000);
afterAll(aufraeumen);

describe('der Austritt liegt nie davor', () => {
  it('vor dem Eintritt: abgewiesen', async () => {
    const { error } = await admin.from('users').update({ austritt: '2026-12-31' }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_austritt_nach_eintritt/);
  });

  it('Gegenprobe: am Eintritt selbst und leer — angenommen', async () => {
    expect((await admin.from('users').update({ austritt: '2027-01-01' }).eq('id', monteur.uid)).error).toBeNull();
    expect((await admin.from('users').update({ austritt: null }).eq('id', monteur.uid)).error).toBeNull();
    expect((await admin.from('users').update({ austritt: '2027-12-15' }).eq('id', monteur.uid)).error).toBeNull();
  });

  it('die Geschäftsführung trägt ihn selbst ein — wie den Eintritt', async () => {
    const { error } = await chefin.client.from('users').update({ austritt: '2027-12-15' }).eq('id', monteur.uid);
    expect(error).toBeNull();
  });
});

describe('nach dem Austritt keine Buchung', () => {
  it('am Tag nach dem Austritt: abgewiesen', async () => {
    const { error } = await monteur.client.from('time_entries').insert(buchung(monteur, '2027-12-16'));
    expect(error?.message).toMatch(/Nach dem Austritt am 15\.12\.2027 lässt sich nicht buchen/);
  });

  it('Gegenprobe: am Austrittstag selbst angenommen', async () => {
    const { error } = await monteur.client.from('time_entries').insert(buchung(monteur, '2027-12-15'));
    expect(error).toBeNull();
  });

  it('auch nicht, indem man eine Buchung dahinter schiebt', async () => {
    const zeile = buchung(monteur, '2027-12-14');
    expect((await monteur.client.from('time_entries').insert(zeile)).error).toBeNull();
    const { error } = await monteur.client.from('time_entries').update({ date: '2027-12-20' }).eq('id', zeile.id);
    expect(error?.message).toMatch(/Nach dem Austritt/);
  });

  it('der Rücklauf unter dem Dienstschlüssel ist ausgenommen; eine alte Zeile bleibt änderbar', async () => {
    const zeile = buchung(monteur, '2027-12-22');
    expect((await admin.from('time_entries').insert(zeile)).error).toBeNull();
    const { error } = await monteur.client.from('time_entries').update({ comment: 'nachgetragen' }).eq('id', zeile.id);
    expect(error).toBeNull();
  });

  it('Gegenprobe: ohne Austritt bucht die Kollegin an jedem Tag', async () => {
    const { error } = await kollegin.client.from('time_entries').insert(buchung(kollegin, '2027-12-20'));
    expect(error).toBeNull();
  });
});

describe('nach dem Austritt kein Einsatz', () => {
  const einsatz = (uid: string, name: string, datum: string) => ({
    company_id: BETRIEB, date: datum, project_number: BAU, user_id: uid, user_name: name, as_helper: false, created_by: planer.uid,
  });

  it('am Tag danach: abgewiesen; am Austrittstag und für andere angenommen', async () => {
    const danach = await planer.client.from('assignments').insert(einsatz(monteur.uid, 'Max', '2027-12-16'));
    expect(danach.error?.message).toMatch(/Nach dem Austritt am 15\.12\.2027 lässt sich nicht einplanen/);
    expect((await planer.client.from('assignments').insert(einsatz(monteur.uid, 'Max', '2027-12-15'))).error).toBeNull();
    expect((await planer.client.from('assignments').insert(einsatz(kollegin.uid, 'Erna', '2027-12-16'))).error).toBeNull();
  });

  it('der Wochenplan zeigt die Tage danach als abwesend — den Grund nur der Leitung', async () => {
    const leitung = await planer.client.rpc('wochenplan_abwesend', { p_von: '2027-12-13', p_bis: '2027-12-19' });
    expect(leitung.error).toBeNull();
    const zeile = (leitung.data as { user_id: string; von: string; bis: string; grund: string | null }[])
      .find((z) => z.user_id === monteur.uid);
    expect(zeile).toMatchObject({ von: '2027-12-16', bis: '2027-12-19', grund: 'Ausgetreten' });
    // Gegenprobe: eine Woche vor dem Austritt steht nichts.
    const vorher = await planer.client.rpc('wochenplan_abwesend', { p_von: '2027-12-06', p_bis: '2027-12-12' });
    expect((vorher.data as { user_id: string }[]).some((z) => z.user_id === monteur.uid)).toBe(false);
  });

  it('„mehrere Tage“ (E85) überspringt die Tage danach, statt abzubrechen', async () => {
    await aufraeumen();
    const { data, error } = await planer.client.rpc('einsatz_folgetage', {
      p_von: '2027-12-14', p_bis: '2027-12-17', p_baustelle: BAU, p_nur_werktage: true,
      p_zeilen: [{ user_id: monteur.uid, user_name: 'Max Monteur', as_helper: false, comment: '', created_by: planer.uid, zeit_von: '07:00', zeit_bis: '15:30' }],
    });
    expect(error).toBeNull();
    const je = Object.fromEntries((data as { datum: string }[]).map((t) => [t.datum, t]));
    expect(je['2027-12-15']).toMatchObject({ ergebnis: 'geplant', eingeteilt: ['Max Monteur'] });
    expect(je['2027-12-16']).toMatchObject({ abwesend: ['Max Monteur'] });
  });
});

describe('Datenauskunft', () => {
  it('der Austritt steht in der Auskunft der Person', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    expect(error).toBeNull();
    expect(JSON.stringify(data)).toContain('"austritt": "2027-12-15"'.replace(': ', ':'));
  });
});
