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
      expect(gefragt).toBe(0);
    } finally {
      clientEinreichen(leitung.client);
    }
  });

  it('holt eine Baustelle über ihre Kennung — und findet sie auch nach einer Umnummerierung', async () => {
    /*
      DIE AKTE LÄDT ÜBER DIE KENNUNG, NICHT ÜBER DIE NUMMER.

      Ich hatte das zuerst mit „zwei Baustellen mit derselben Nummer"
      begründen wollen — die Datenbank lässt das gar nicht zu
      (`projects_nummer_je_betrieb`). Der Grund ist ein anderer und lässt
      sich hier auch zeigen: die Nummer ist ÄNDERBAR, die Kennung nicht. Wer
      eine Akte als Lesezeichen ablegt oder ihren Link weitergibt, und im
      Büro wird danach ein Zahlendreher in der Projektnummer korrigiert,
      landet über die Nummer im Nichts.
    */
    const id = await baustellen.createProject('bau-a', {
      projectNumber: '2026-810', customerName: 'Mit Zahlendreher', status: 'Aktiv',
    });
    expect((await baustellen.listProjectsByIds('bau-a', [id]))[0].projectNumber).toBe('2026-810');

    await baustellen.updateProject(id, { projectNumber: '2026-801' });

    const nachher = await baustellen.listProjectsByIds('bau-a', [id]);
    expect(nachher.map((b) => b.projectNumber)).toEqual(['2026-801']);
    // Die Gegenprobe: über die alte Nummer ist sie weg.
    expect(await baustellen.listProjectsByNumbers('bau-a', ['2026-810'])).toEqual([]);
  });

  it('legt eine Baustelle OHNE Datumsangaben an', async () => {
    /*
      DER FEHLER, DEN DER DURCHKLICK IM BROWSER GEFUNDEN HAT — und er war
      schon im Betrieb. Ein Datumsfeld, das niemand ausfüllt, liefert `''`.
      Postgres nimmt das für eine `date`-Spalte nicht an, und die Maske
      meldete „Die Baustelle konnte nicht gespeichert werden." Eine
      Baustelle ohne Beginn und Ende liess sich gar nicht anlegen.

      Die Umwandlung steht in `pg/projects` — dort, wo ihr Grund liegt:
      Firestore nahm `''` klaglos an, Postgres nicht.
    */
    const id = await baustellen.createProject('bau-a', {
      projectNumber: '2026-820', customerName: 'Ohne Termin', status: 'Aktiv',
      startDate: '', endDate: '',
    });
    const [b] = await baustellen.listProjectsByIds('bau-a', [id]);
    expect(b.startDate ?? null).toBeNull();
    expect(b.endDate ?? null).toBeNull();
  });

  it('nimmt ein eingetragenes Datum mit — und lässt es wieder leeren', async () => {
    /*
      Die Gegenprobe in beide Richtungen. Wäre die Umwandlung zu grob, käme
      gar kein Datum mehr durch; würde beim Ändern nur WEGGELASSEN statt
      geleert, behielte die Baustelle ein Enddatum, das gerade gelöscht
      wurde — der stillere der beiden Fehler.
    */
    const id = await baustellen.createProject('bau-a', {
      projectNumber: '2026-821', customerName: 'Mit Termin', status: 'Aktiv',
      startDate: '2026-03-02', endDate: '2026-04-30',
    });
    expect((await baustellen.listProjectsByIds('bau-a', [id]))[0].startDate).toBe('2026-03-02');

    await baustellen.updateProject(id, { endDate: '' });
    const [b] = await baustellen.listProjectsByIds('bau-a', [id]);
    expect(b.startDate).toBe('2026-03-02');
    expect(b.endDate ?? null).toBeNull();
  });

  it('fragt nicht nach einer leeren Kennungsliste', async () => {
    let gefragt = 0;
    const beobachtet = {
      ...leitung.client,
      from: (tabelle: string) => { gefragt += 1; return leitung.client.from(tabelle); },
    } as unknown as typeof leitung.client;
    clientEinreichen(beobachtet);
    try {
      expect(await baustellen.listProjectsByIds('bau-a', [])).toEqual([]);
      expect(await baustellen.listProjectsByIds('bau-a', ['', ''])).toEqual([]);
      expect(gefragt).toBe(0);
    } finally {
      clientEinreichen(leitung.client);
    }
  });

  it('gibt zu einer erfundenen Kennung nichts zurück', async () => {
    // Nicht „irgendeine Baustelle": eine Akte unter einer falschen Adresse
    // muss leer bleiben und darf nicht die erstbeste zeigen.
    const erfunden = '00000000-0000-4000-8000-000000000000';
    expect(await baustellen.listProjectsByIds('bau-a', [erfunden])).toEqual([]);
  });

  it('findet eine alte Baustelle über ihre Nummer, in beiden Schreibweisen', async () => {
    /*
      DIESE ZUSICHERUNG HING BIS ZUM 19.09. AN `findProjectsByNumber`, einer
      zweiten Suche neben dieser. Sie gab es nur, weil Firestore Zeichenketten
      GENAU verglich: eine Baustelle „PR-2022-007" war über „2022-007" nicht
      auffindbar, also musste die Abfrage beide Schreibweisen aufzählen.

      `searchProjects` vergleicht mit `ilike %begriff%` und trifft die lange
      Form über die kurze von selbst. Die zweite Suche ist damit überflüssig
      geworden und entfernt — die Zusicherung nicht: sie steht hier, auf dem
      Weg, den die App wirklich geht.
    */
    await baustellen.createProject('bau-a', {
      projectNumber: 'PR-2022-007', customerName: 'Von früher', status: 'Abgeschlossen',
    });
    for (const eingabe of ['2022-007', 'PR-2022-007', 'pr-2022-007']) {
      const treffer = await baustellen.searchProjects('bau-a', eingabe);
      expect(treffer.map((b) => b.customerName), `Eingabe „${eingabe}"`).toEqual(['Von früher']);
    }
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
    // Eine ECHTE Kennung aus `bau-a` — eine erfundene wäre auch ohne
    // Zeilenschutz leer und bewiese nichts.
    const fremdeKennung = await baustellen.createProject('bau-a', {
      projectNumber: '2026-900', customerName: 'Nicht für bau-b', status: 'Aktiv',
    });
    clientEinreichen(fremd.client);
    try {
      expect(await baustellen.listActiveProjects('bau-a')).toEqual([]);
      expect(await baustellen.searchProjects('bau-a', '2022-007')).toEqual([]);
      // Auch nicht über die Kennung: der neue Leseweg muss dieselbe Grenze
      // tragen wie die alten, sonst ist die Akte das Loch in der Wand.
      expect(await baustellen.listProjectsByIds('bau-a', [fremdeKennung])).toEqual([]);
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
