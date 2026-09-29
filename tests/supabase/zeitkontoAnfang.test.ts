/**
 * Die Anfangsstände der Zeitkonten sieht, wer das Konto sieht — gegen die
 * echte Datenbank (offene Punkte B1, Teil 2; Prüflauf P3-12).
 *
 * Vorher standen `initial_overtime` und `initial_vacation_days` an der
 * Zeile in `users`, die jeder im Betrieb liest. Hier: wer liest und wer
 * nicht, der Einlass samt „bewusst leer" und dem Echo beim Anlegen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { getUserByUid, listUsers, updateUserProfile } from '@/lib/db/pg/users';

const BETRIEB = 'zeitkonto-b1';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let kollegin: Konto;

const anfang = async (uid: string) => {
  const { data } = await admin.from('zeitkonto_anfang')
    .select('initial_overtime, initial_vacation_days').eq('user_id', uid).maybeSingle();
  return data as { initial_overtime: number | null; initial_vacation_days: number | null } | null;
};

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Zeitkonto GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'zkchef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'zkbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zkmon');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'zkkol');
  // Wie die alte App es schrieb: über die Spalten.
  const { error } = await admin.from('users')
    .update({ initial_overtime: 12.5, initial_vacation_days: 4 }).eq('id', kollegin.uid);
  if (error) throw new Error(error.message);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Der Einlass', () => {
  it('legt um — die Spalten an der Belegschaft bleiben leer', async () => {
    const { data } = await admin.from('users')
      .select('initial_overtime, initial_vacation_days').eq('id', kollegin.uid).single();
    expect(data).toEqual({ initial_overtime: null, initial_vacation_days: null });
    expect(await anfang(kollegin.uid)).toEqual({ initial_overtime: 12.5, initial_vacation_days: 4 });
  });

  it('ändert eine Spalte, ohne die andere anzufassen — und leert bewusst', async () => {
    clientEinreichen(chef.client);
    await updateUserProfile(kollegin.uid, { initialOvertime: 3 });
    expect(await anfang(kollegin.uid)).toEqual({ initial_overtime: 3, initial_vacation_days: 4 });
    // „Kein Anfangsurlaub" ist eine Aussage, kein Weglassen.
    await updateUserProfile(kollegin.uid, { initialVacationDays: null });
    expect(await anfang(kollegin.uid)).toEqual({ initial_overtime: 3, initial_vacation_days: null });
    await updateUserProfile(kollegin.uid, { initialVacationDays: 4 });
  });

  it('der Name ändert sich, die Stände bleiben', async () => {
    clientEinreichen(chef.client);
    await updateUserProfile(kollegin.uid, { name: 'Kollegin Neu' });
    expect(await anfang(kollegin.uid)).toEqual({ initial_overtime: 3, initial_vacation_days: 4 });
  });
});

describe('Wer liest', () => {
  it('die Kollegin selbst', async () => {
    clientEinreichen(kollegin.client);
    const ich = await getUserByUid(BETRIEB, kollegin.uid);
    expect(ich).toMatchObject({ initialOvertime: 3, initialVacationDays: 4 });
  });

  it('die Buchhaltung und die Geschäftsführung', async () => {
    for (const k of [buch, chef]) {
      clientEinreichen(k.client);
      const alle = await listUsers(BETRIEB);
      expect(alle.find((u) => u.uid === kollegin.uid)).toMatchObject({ initialOvertime: 3, initialVacationDays: 4 });
    }
  });

  it('NICHT der Kollege — er sieht Namen, aber keine Kontostände', async () => {
    clientEinreichen(monteur.client);
    const alle = await listUsers(BETRIEB);
    const sie = alle.find((u) => u.uid === kollegin.uid);
    expect(sie?.name).toBe('Kollegin Neu');
    expect(sie?.initialOvertime).toBeUndefined();
    expect(sie?.initialVacationDays).toBeNull();
    const { data } = await monteur.client.from('zeitkonto_anfang').select('user_id').eq('user_id', kollegin.uid);
    expect(data ?? []).toEqual([]);
  });
});
