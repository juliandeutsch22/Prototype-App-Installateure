/**
 * Baustellen auf Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as baustellen from '@/lib/db/pg/projects';
import { clientEinreichen } from '@/lib/db/pg/kern';

let leitung: Konto;
let monteur: Konto;
let fremd: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await betriebAnlegen('bau-a');
  await betriebAnlegen('bau-b');
  leitung = await konto('bau-a', 'Projektleiter', 'leitung');
  monteur = await konto('bau-a', 'Mitarbeiter', 'monteur');
  fremd = await konto('bau-b', 'Projektleiter', 'fremd');
  clientEinreichen(leitung.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Baustellen auf Postgres', () => {
  it('zeigt nur laufende in der Auswahlliste', async () => {
    await baustellen.createProject('bau-a', {
      projectNumber: '2026-401', customerName: 'A', status: 'Aktiv',
    });
    await baustellen.createProject('bau-a', {
      projectNumber: '2026-402', customerName: 'B', status: 'Pausiert',
    });
    await baustellen.createProject('bau-a', {
      projectNumber: '2026-403', customerName: 'C', status: 'Abgeschlossen',
    });

    const laufend = await baustellen.listActiveProjects('bau-a');
    expect(laufend.map((b) => b.projectNumber).sort()).toEqual(['2026-401', '2026-402']);
  });

  it('hält die Obergrenze der Auswahlliste ein', async () => {
    expect(await baustellen.listActiveProjects('bau-a', 1)).toHaveLength(1);
  });

  it('holt viele Nummern in EINER Abfrage — ohne die Dreissigerblöcke', async () => {
    const nummern: string[] = [];
    for (let i = 0; i < 35; i += 1) {
      const nr = `2026-5${String(i).padStart(2, '0')}`;
      nummern.push(nr);
      await baustellen.createProject('bau-a', {
        projectNumber: nr, customerName: 'Viele', status: 'Aktiv',
      });
    }
    const geholt = await baustellen.listProjectsByNumbers('bau-a', nummern);
    expect(geholt).toHaveLength(35);
  });

  it('fragt gar nicht, wenn nichts zu holen ist', async () => {
    /*
     * Das Ergebnis allein beweist hier nichts: eine Abfrage mit leerer Liste
     * gäbe ebenfalls nichts zurück. Geprüft wird deshalb, dass überhaupt
     * keine Anfrage rausgeht — darum geht es bei dieser Abkürzung.
     */
    let gefragt = 0;
    const beobachtet = {
      ...leitung.client,
      from: (tabelle: string) => { gefragt += 1; return leitung.client.from(tabelle); },
    } as unknown as typeof leitung.client;
    clientEinreichen(beobachtet);
    try {
      expect(await baustellen.listProjectsByNumbers('bau-a', [])).toEqual([]);
      expect(await baustellen.listProjectsByNumbers('bau-a', ['', ''])).toEqual([]);
      expect(await baustellen.findProjectsByNumber('bau-a', [])).toEqual([]);
      expect(gefragt).toBe(0);
    } finally {
      clientEinreichen(leitung.client);
    }
  });

  it('findet eine alte Baustelle über ihre Nummer, in beiden Schreibweisen', async () => {
    await baustellen.createProject('bau-a', {
      projectNumber: 'PR-2022-007', customerName: 'Von früher', status: 'Abgeschlossen',
    });
    const treffer = await baustellen.findProjectsByNumber('bau-a', ['2022-007', 'PR-2022-007']);
    expect(treffer.map((b) => b.customerName)).toEqual(['Von früher']);
  });

  it('zeigt die jüngsten zuerst', async () => {
    const jung = await baustellen.listRecentProjects('bau-a', 3);
    expect(jung).toHaveLength(3);
    const zeiten = jung.map((b) => b.createdAt ?? 0);
    expect([...zeiten].sort((a, b) => b - a)).toEqual(zeiten);
    // Und als ZAHL, nicht als Zeichenkette — die Anzeige rechnet damit.
    expect(typeof jung[0].createdAt).toBe('number');
  });

  it('findet die Baustellen eines Mitarbeiters über die Zuordnungsliste', async () => {
    await baustellen.createProject('bau-a', {
      projectNumber: '2026-601', customerName: 'Mit Team', status: 'Aktiv',
      assignedEmployees: [monteur.uid, leitung.uid],
    });
    await baustellen.createProject('bau-a', {
      projectNumber: '2026-602', customerName: 'Ohne ihn', status: 'Aktiv',
      assignedEmployees: [leitung.uid],
    });
    const seine = await baustellen.listProjectsForEmployee('bau-a', monteur.uid);
    expect(seine.map((b) => b.projectNumber)).toEqual(['2026-601']);
  });

  it('lässt einen fremden Betrieb nichts sehen', async () => {
    clientEinreichen(fremd.client);
    try {
      expect(await baustellen.listActiveProjects('bau-a')).toEqual([]);
      expect(await baustellen.findProjectsByNumber('bau-a', ['2022-007'])).toEqual([]);
    } finally {
      clientEinreichen(leitung.client);
    }
  });

  it('ändert und löscht', async () => {
    const id = await baustellen.createProject('bau-a', {
      projectNumber: '2026-700', customerName: 'Wandelbar', status: 'Aktiv',
    });
    await baustellen.updateProject(id, { status: 'Abgeschlossen' });
    const [b] = await baustellen.listProjectsByNumbers('bau-a', ['2026-700']);
    expect(b.status).toBe('Abgeschlossen');

    await baustellen.deleteProject(id);
    expect(await baustellen.listProjectsByNumbers('bau-a', ['2026-700'])).toEqual([]);
  });

  it('meldet neue Baustellen live, neueste zuerst', async () => {
    const stände: Array<Array<{ projectNumber: string }>> = [];
    const ab = baustellen.subscribeRecentProjects('bau-a', 2,
      (z) => stände.push(z), (e) => { throw e; });

    for (let i = 0; i < 80 && stände.length === 0; i += 1) await warte(50);
    expect(stände[0]).toHaveLength(2);

    await admin.from('projects').insert({
      company_id: 'bau-a', project_number: '2026-999', customer_name: 'Ganz neu', status: 'Aktiv',
    });

    for (let i = 0; i < 100; i += 1) {
      const letzter = stände[stände.length - 1] ?? [];
      if (letzter.some((b) => b.projectNumber === '2026-999')) break;
      await warte(50);
    }
    expect(stände[stände.length - 1][0].projectNumber).toBe('2026-999');
    expect(stände[stände.length - 1]).toHaveLength(2);
    ab();
  });
});
