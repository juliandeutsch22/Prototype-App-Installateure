/**
 * Zeiterfassung auf Postgres — der Pfad des Monteurs.
 *
 * Der letzte Block prüft die Doppelbuchungsregel durch die WEICHE hindurch,
 * mit umgelegtem Schalter. Die Regel steht nur einmal im Code; dass sie auch
 * auf dem neuen Weg greift, ist damit nicht selbstverständlich, sondern
 * geprüft.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as zeiten from '@/lib/db/pg/timeEntries';
import { clientEinreichen } from '@/lib/db/pg/kern';

let monteur: Konto;
let kollege: Konto;
let buch: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

const buchung = (k: Konto, datum: string, rest: Record<string, unknown> = {}) => ({
  userId: k.uid,
  date: datum,
  status: 'Anwesend' as const,
  startTime: '07:00',
  endTime: '16:00',
  breakDuration: 30,
  ...rest,
});

beforeAll(async () => {
  await betriebAnlegen('zeit-a');
  monteur = await konto('zeit-a', 'Mitarbeiter', 'monteur');
  kollege = await konto('zeit-a', 'Mitarbeiter', 'kollege');
  buch = await konto('zeit-a', 'Buchhaltung', 'buch');
  clientEinreichen(monteur.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Zeiterfassung auf Postgres', () => {
  it('legt an und liest die eigenen Einträge ab einem Datum', async () => {
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-01-05'));
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-02-05'));

    const ab = await zeiten.listOwnEntriesSince('zeit-a', monteur.uid, '2026-02-01');
    expect(ab.map((z) => z.date)).toEqual(['2026-02-05']);
  });

  it('gibt Uhrzeiten so zurück, wie das Formular sie erwartet', async () => {
    const [z] = await zeiten.listOwnEntriesSince('zeit-a', monteur.uid, '2026-02-01');
    // Nicht "07:00:00" — ein <input type="time"> nimmt das nicht an.
    expect(z.startTime).toBe('07:00');
    expect(z.endTime).toBe('16:00');
    expect(z.breakDuration).toBe(30);
  });

  it('holt auch für ein Konto mit weiter Sicht nur die EIGENEN Einträge', async () => {
    /*
     * Bei einem Monteur verdeckt der Zeilenschutz einen fehlenden
     * Personenfilter: er sieht die Kollegen ohnehin nicht. Die Buchhaltung
     * sieht sie — und genau dort muss „meine Einträge" auch meine bleiben.
     * Sonst meldete die Startseite der Buchhaltung, sie habe gebucht, weil
     * irgendjemand gebucht hat.
     */
    await admin.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: 'zeit-a', user_id: kollege.uid,
      date: '2026-02-20', status: 'Anwesend', start_time: '07:00', end_time: '16:00',
      break_duration: 30,
    });
    await admin.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: 'zeit-a', user_id: buch.uid,
      date: '2026-02-21', status: 'Anwesend', start_time: '08:00', end_time: '17:00',
      break_duration: 30,
    });

    clientEinreichen(buch.client);
    try {
      const eigene = await zeiten.listOwnEntriesSince('zeit-a', buch.uid, '2026-02-01');
      expect(eigene.map((z) => z.date)).toEqual(['2026-02-21']);
    } finally {
      clientEinreichen(monteur.client);
    }
  });

  it('holt einen Zeitraum', async () => {
    const drin = await zeiten.listEntriesInRange('zeit-a', '2026-01-01', '2026-01-31');
    expect(drin.map((z) => z.date)).toEqual(['2026-01-05']);
  });

  it('findet alle Einträge einer Person an einem Tag — ausser dem bearbeiteten', async () => {
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-03-10', { projectNumber: '2026-001' }));
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-03-10', { projectNumber: '2026-002' }));

    const alle = await zeiten.eintraegeAmTag('zeit-a', monteur.uid, '2026-03-10');
    expect(alle).toHaveLength(2);

    const ohne = await zeiten.eintraegeAmTag('zeit-a', monteur.uid, '2026-03-10', alle[0].id);
    expect(ohne.map((z) => z.id)).toEqual([alle[1].id]);
  });

  it('findet Einträge einer Baustelle in beiden Schreibweisen — in EINER Abfrage', async () => {
    /*
     * Firestore brauchte je Baustelle eine eigene Abfrage (zwei `in` in einer
     * Abfrage waren nicht erlaubt). Das Ergebnis muss dasselbe sein: eine
     * Buchung auf „PR-2026-050" zählt zur Baustelle „2026-050", sonst zeigt
     * das Projekt-Radar eine grüne Ampel auf einer gerissenen Baustelle.
     */
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-04-01', { projectNumber: '2026-050' }));
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-04-02', { projectNumber: 'PR-2026-050' }));
    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-04-03', { projectNumber: '2026-051' }));

    const radar = await zeiten.listEntriesForProjects('zeit-a', ['2026-050']);
    expect(radar.map((z) => z.date).sort()).toEqual(['2026-04-01', '2026-04-02']);
  });

  it('fragt gar nicht, wenn keine Baustelle übrig bleibt', async () => {
    let gefragt = 0;
    const beobachtet = {
      ...monteur.client,
      from: (t: string) => { gefragt += 1; return monteur.client.from(t); },
    } as unknown as typeof monteur.client;
    clientEinreichen(beobachtet);
    try {
      expect(await zeiten.listEntriesForProjects('zeit-a', [])).toEqual([]);
      expect(await zeiten.listEntriesForProjects('zeit-a', ['', '  ', 'PR-'])).toEqual([]);
      expect(gefragt).toBe(0);
    } finally {
      clientEinreichen(monteur.client);
    }
  });

  it('ändert und löscht', async () => {
    const eigene = await zeiten.eintraegeAmTag('zeit-a', monteur.uid, '2026-01-05');
    await zeiten.aendern(eigene[0].id, { comment: 'Pause war länger', breakDuration: 45 });
    const [nachher] = await zeiten.eintraegeAmTag('zeit-a', monteur.uid, '2026-01-05');
    expect(nachher).toMatchObject({ comment: 'Pause war länger', breakDuration: 45 });

    await zeiten.loeschen(nachher.id);
    expect(await zeiten.eintraegeAmTag('zeit-a', monteur.uid, '2026-01-05')).toEqual([]);
  });

  it('sieht die Einträge der Kollegen nicht, die Buchhaltung schon', async () => {
    await admin.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: 'zeit-a', user_id: kollege.uid,
      date: '2026-05-04', status: 'Anwesend', start_time: '07:00', end_time: '16:00',
      break_duration: 30,
    });
    const seine = await zeiten.listEntriesInRange('zeit-a', '2026-05-01', '2026-05-31');
    expect(seine).toEqual([]);

    clientEinreichen(buch.client);
    try {
      const alle = await zeiten.listEntriesInRange('zeit-a', '2026-05-01', '2026-05-31');
      expect(alle).toHaveLength(1);
    } finally {
      clientEinreichen(monteur.client);
    }
  });

  it('meldet eine neue eigene Buchung live', async () => {
    const stände: Array<Array<{ date: string }>> = [];
    const ab = zeiten.subscribeOwnEntriesInRange('zeit-a', monteur.uid, '2026-06-01', '2026-06-30',
      (z) => stände.push(z), (e) => { throw e; });

    for (let i = 0; i < 80 && stände.length === 0; i += 1) await warte(50);
    expect(stände[0]).toEqual([]);

    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-06-15'));
    for (let i = 0; i < 100; i += 1) {
      if ((stände[stände.length - 1] ?? []).some((z) => z.date === '2026-06-15')) break;
      await warte(50);
    }
    expect(stände[stände.length - 1].map((z) => z.date)).toEqual(['2026-06-15']);
    ab();
  });

  it('meldet keine Buchung ausserhalb des Zeitraums', async () => {
    const stände: Array<Array<{ date: string }>> = [];
    const ab = zeiten.subscribeOwnEntriesInRange('zeit-a', monteur.uid, '2026-07-01', '2026-07-31',
      (z) => stände.push(z), (e) => { throw e; });
    for (let i = 0; i < 80 && stände.length === 0; i += 1) await warte(50);

    await zeiten.anlegen('zeit-a', buchung(monteur, '2026-08-15'));
    await warte(1200);

    expect(stände[stände.length - 1].some((z) => z.date === '2026-08-15')).toBe(false);
    ab();
  });
});

describe('Die Doppelbuchungsregel greift durch die Weiche', () => {
  /*
   * Geprüft wird über `@/lib/db/timeEntries` und nicht über `pg/timeEntries`.
   * Die Regel steht nur einmal im Code, und der Weg dorthin führt über die
   * Weiche — wer sie dort herausnimmt, muss hier rot werden.
   */
  it('blockt eine zweite Buchung auf dieselbe Baustelle am selben Tag', async () => {
    const { createTimeEntry, DuplicateEntryError } = await import('@/lib/db/timeEntries');
    await createTimeEntry('zeit-a', buchung(monteur, '2026-09-07', { projectNumber: '2026-070' }));
    await expect(
      createTimeEntry('zeit-a', buchung(monteur, '2026-09-07', { projectNumber: '2026-070' })),
    ).rejects.toBeInstanceOf(DuplicateEntryError);
  });

  it('lässt eine zweite Baustelle am selben Tag zu', async () => {
    const { createTimeEntry } = await import('@/lib/db/timeEntries');
    const id = await createTimeEntry('zeit-a',
      buchung(monteur, '2026-09-07', { projectNumber: '2026-071' }));
    expect(id).toBeTruthy();
  });
});

describe('Das Büro bucht für einen Monteur', () => {
  /*
   * GEFUNDEN IM BETRIEB: in der Mitarbeiterübersicht erfasste die Buchhaltung
   * Zeit für einen Monteur, die App meldete „gespeichert", und nichts kam an.
   * Der Vermerk trug `lastEditedAt`, und eine solche Spalte gibt es nicht —
   * PostgREST wies jede Fremdbuchung mit PGRST204 ab. Keine Prüfung hatte je
   * FÜR JEMAND ANDEREN gebucht.
   *
   * Geschrieben wird durch die Weiche und mit genau dem Vermerk, den die Maske
   * schreibt (`bearbeitungsvermerk`) — ein Feld, das dort dazukommt und keine
   * Spalte hat, macht diese Prüfung rot.
   */
  it('legt den Eintrag beim Monteur an, mit Vermerk, wer gebucht hat', async () => {
    const { createTimeEntry } = await import('@/lib/db/timeEntries');
    const { bearbeitungsvermerk } = await import('@/features/time/bearbeitungsvermerk');
    clientEinreichen(buch.client);
    try {
      const id = await createTimeEntry('zeit-a', {
        ...buchung(monteur, '2026-10-05'),
        userName: 'Max Monteur',
        source: 'manual',
        ...bearbeitungsvermerk({ uid: buch.uid, name: 'Brigitte Büro' }),
      });
      const { data } = await admin
        .from('time_entries').select('user_id, last_edited_by, last_edited_by_uid').eq('id', id).single();
      expect(data).toEqual({
        user_id: monteur.uid,
        last_edited_by: 'Brigitte Büro',
        last_edited_by_uid: buch.uid,
      });
    } finally {
      clientEinreichen(monteur.client);
    }
  });

  it('korrigiert einen Eintrag des Monteurs mit demselben Vermerk', async () => {
    const { bearbeitungsvermerk } = await import('@/features/time/bearbeitungsvermerk');
    const [eintrag] = await zeiten.listOwnEntriesSince('zeit-a', monteur.uid, '2026-10-05');
    clientEinreichen(buch.client);
    try {
      await zeiten.aendern(eintrag.id, {
        comment: 'Pause nachgetragen',
        ...bearbeitungsvermerk({ uid: buch.uid, name: 'Brigitte Büro' }),
      });
      const { data } = await admin
        .from('time_entries').select('comment, last_edited_by').eq('id', eintrag.id).single();
      expect(data).toEqual({ comment: 'Pause nachgetragen', last_edited_by: 'Brigitte Büro' });
    } finally {
      clientEinreichen(monteur.client);
    }
  });
});
