/**
 * Personen nur aus dem eigenen Betrieb (offene Punkte C2).
 *
 * Die Fremdschlüssel prüfen nur, ob es eine Person gibt. Wer die Kennung
 * eines fremden Monteurs kennt, konnte ihn einteilen, einer Baustelle
 * zuordnen oder für ihn buchen. Jetzt prüft ein Auslöser an der Tabelle —
 * geprüft wird hier jeder Weg, und zu jedem die Gegenprobe mit einer
 * eigenen Person.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { saveAssignments } from '@/lib/db/pg/assignments';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'personen-a';
const B = 'personen-b';
const TAG = '2026-06-03';

let planer: Konto;
let chef: Konto;
let anton: Konto;
let fremder: Konto;

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  planer = await konto(A, 'Projektleiter', 'planer');
  chef = await konto(A, 'Geschäftsführung', 'chef');
  anton = await konto(A, 'Mitarbeiter', 'anton');
  fremder = await konto(B, 'Mitarbeiter', 'fremder');
  clientEinreichen(planer.client);
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('assignments').delete().eq('company_id', A);
  await admin.from('time_entries').delete().eq('company_id', A);
  await admin.from('projects').delete().eq('company_id', A);
});

const einsatz = (k: Konto) => ({
  date: TAG, projectNumber: 'B-1', userId: k.uid, userName: 'x', asHelper: false, createdBy: planer.uid,
});

describe('Einteilen', () => {
  it('lehnt einen Monteur aus einem fremden Betrieb ab — und schreibt nichts', async () => {
    await expect(saveAssignments(A, TAG, 'B-1', [einsatz(anton), einsatz(fremder)])).rejects.toThrow(
      /gehört nicht zu diesem Betrieb/,
    );
    const { data } = await admin.from('assignments').select('id').eq('company_id', A).eq('date', TAG);
    // Ganz oder gar nicht: auch der eigene Monteur steht nicht da.
    expect(data).toEqual([]);
  });

  it('Gegenprobe: der eigene Monteur lässt sich einteilen', async () => {
    await saveAssignments(A, TAG, 'B-1', [einsatz(anton)]);
    const { data } = await admin.from('assignments').select('user_id').eq('company_id', A).eq('date', TAG);
    expect(data).toEqual([{ user_id: anton.uid }]);
  });
});

describe('Baustelle', () => {
  it('lehnt eine fremde Person als Projektleitung ab', async () => {
    const { error } = await chef.client.from('projects').insert({
      company_id: A, project_number: 'B-900', customer_name: 'X', status: 'Aktiv',
      project_managers: [fremder.uid],
    });
    expect(error?.code).toBe('42501');
    expect(error?.message).toMatch(/gehört nicht zu diesem Betrieb/);
  });

  it('lehnt eine fremde Person beim Nachtragen ab, lässt eigene zu', async () => {
    const { data, error } = await chef.client.from('projects').insert({
      company_id: A, project_number: 'B-901', customer_name: 'X', status: 'Aktiv',
      assigned_employees: [anton.uid],
    }).select('id').single();
    expect(error).toBeNull();

    const fremd = await chef.client.from('projects')
      .update({ assigned_employees: [anton.uid, fremder.uid] }).eq('id', data!.id);
    expect(fremd.error?.code).toBe('42501');

    // Gegenprobe: dieselbe Änderung ohne die fremde Person geht durch.
    const eigen = await chef.client.from('projects')
      .update({ assigned_employees: [anton.uid, chef.uid] }).eq('id', data!.id);
    expect(eigen.error).toBeNull();
  });
});

describe('Eine Kennung, die es nicht (mehr) gibt', () => {
  it('hält eine Baustelle nicht auf — so steht ein gelöschtes Konto in ihrer Liste, und so spielt der Rücklauf sie ein', async () => {
    const { error } = await admin.from('projects').insert({
      company_id: A, project_number: 'B-903', customer_name: 'X', status: 'Aktiv',
      assigned_employees: [crypto.randomUUID(), anton.uid],
    });
    expect(error).toBeNull();
  });
});

describe('Buchen', () => {
  it('lehnt eine Buchung im Betrieb A für eine Person aus B ab — auch über den Dienstzugang', async () => {
    const { error } = await admin.from('time_entries').insert({ ...buchung(anton, TAG), user_id: fremder.uid });
    expect(error?.code).toBe('42501');
  });

  it('Gegenprobe: dieselbe Buchung für die eigene Person geht durch', async () => {
    const { error } = await admin.from('time_entries').insert(buchung(anton, TAG));
    expect(error).toBeNull();
  });
});

describe('Die Zeilenregel antwortet für fremde Betriebe', () => {
  it('verrät an der Meldung nicht, wem eine Kennung gehört', async () => {
    // Eine Zeile für Betrieb B: abgewiesen von der Zeilenregel, nicht vom Auslöser.
    const { error } = await chef.client.from('projects').insert({
      company_id: B, project_number: 'B-902', customer_name: 'X', status: 'Aktiv',
      project_managers: [anton.uid],
    });
    expect(error?.code).toBe('42501');
    expect(error?.message).not.toMatch(/gehört nicht zu diesem Betrieb/);
  });
});
