/**
 * Die elf Abonnements gegen den echten Stack.
 *
 * WARUM EIN EIGENES PRÜFNETZ. Ein Abonnement ist die einzige Stelle, an der
 * ein Fehler nicht zu einer Fehlermeldung führt, sondern zu STILLE. Die
 * Ansicht steht da und zeigt einen Stand von vor zehn Minuten; niemand sieht
 * einen Fehler, weil keiner passiert ist. Genau deshalb wird hier für JEDES
 * Abonnement dasselbe geprüft:
 *
 *   1. Eine Änderung, die dazugehört, KOMMT AN.
 *   2. Eine Änderung, die nicht dazugehört, kommt NICHT an.
 *   3. Ein fremder Betrieb kommt nie an.
 *
 * Und zwar mit einer Änderung NACH dem Anmelden — nicht mit dem ersten
 * Bestand. Der erste Bestand kommt aus einer gewöhnlichen Abfrage und sagt
 * über den Meldeweg nichts aus.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen, NACHFASSEN_MS, type WithId } from '@/lib/db/pg/kern';
import * as zeiten from '@/lib/db/pg/timeEntries';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import * as material from '@/lib/db/pg/materials';
import * as baustellen from '@/lib/db/pg/projects';
import * as einsaetze from '@/lib/db/pg/assignments';
import * as ruest from '@/lib/db/pg/einsatzMaterial';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as einstellungen from '@/lib/db/pg/prefs';

const BETRIEB = 'abo-a';
const FREMD = 'abo-b';

let chef: Konto;
let anton: Konto;
let berta: Konto;
let fremdChef: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wie lange nach dem Anmelden gewartet wird, bevor geschrieben wird.
 *
 * `SUBSCRIBED` sagt, dass der KANAL steht — nicht, dass die Datenbank schon
 * meldet. Dazwischen liegen einige hundert Millisekunden, und von aussen ist
 * dieser Zustand nicht zu beobachten. Wer früher schreibt, prüft die
 * Anlaufzeit und nicht den Meldeweg; das Ergebnis flattert und sagt nichts.
 */
const ANLAUF_MS = NACHFASSEN_MS + 1800;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  berta = await konto(BETRIEB, 'Mitarbeiter', 'berta');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'fremd');
  clientEinreichen(chef.client);
}, 180_000);

afterAll(() => clientEinreichen(null));

/**
 * Der gemeinsame Ablauf: anmelden, abwarten, auslösen, auf den INHALT warten.
 *
 * Gewartet wird auf den Inhalt und nicht auf die ZAHL der Meldungen: das
 * Nachfassen meldet ohnehin einen zweiten Stand, und wer bis „zwei Meldungen"
 * zählt, prüft womöglich den Stand von vor dem Schreiben.
 */
async function meldetDurch<T>(
  anmelden: (melde: (rows: T) => void, fehler: (e: Error) => void) => () => void,
  ausloesen: () => Promise<void>,
  angekommen: (letzter: T) => boolean,
): Promise<{ ok: boolean; staende: number }> {
  const staende: T[] = [];
  let fehler: Error | null = null;
  const stopp = anmelden((rows) => staende.push(rows), (e) => { fehler = e; });
  try {
    await warte(ANLAUF_MS);
    await ausloesen();
    const da = () => staende.length > 0 && angekommen(staende[staende.length - 1]);
    for (let i = 0; i < 50 && !da(); i += 1) await warte(100);
    if (fehler) throw fehler;
    return { ok: da(), staende: staende.length };
  } finally {
    stopp();
  }
}

/**
 * Für die Negativprüfungen: dass etwas NICHT ankommt, sagt für sich genommen
 * nichts.
 *
 * Ein totes Abonnement meldet auch nichts — und eine Prüfung, die das nicht
 * unterscheidet, ist grün, gerade wenn der Meldeweg kaputt ist. Also wird
 * danach am SELBEN Abonnement etwas ausgelöst, das ankommen MUSS. Kommt das
 * an und das andere nicht, ist die Grenze bewiesen; kommt gar nichts an, war
 * die Prüfung nichts wert und fällt.
 */
async function bleibtDraussen<T>(
  anmelden: (melde: (rows: T) => void, fehler: (e: Error) => void) => () => void,
  falsch: { ausloesen: () => Promise<void>; erkennen: (letzter: T) => boolean },
  richtig: { ausloesen: () => Promise<void>; erkennen: (letzter: T) => boolean },
): Promise<{ falschDa: boolean; richtigDa: boolean }> {
  const staende: T[] = [];
  let fehler: Error | null = null;
  const stopp = anmelden((rows) => staende.push(rows), (e) => { fehler = e; });
  const letzter = () => staende[staende.length - 1];
  try {
    await warte(ANLAUF_MS);

    await falsch.ausloesen();
    // Lange genug, dass eine Meldung sicher durch wäre, wenn sie käme.
    await warte(2500);
    const falschDa = staende.length > 0 && falsch.erkennen(letzter());

    await richtig.ausloesen();
    const da = () => staende.length > 0 && richtig.erkennen(letzter());
    for (let i = 0; i < 50 && !da(); i += 1) await warte(100);
    if (fehler) throw fehler;
    return { falschDa, richtigDa: da() };
  } finally {
    stopp();
  }
}

const MONAT = { jahr: 2026, monat: 4 }; // Mai — `month` ist nullbasiert
const IM_MONAT = '2026-05-04';
const AUSSERHALB = '2026-08-03';

describe('Jede Änderung, die dazugehört, kommt an', () => {
  it('Zeiten des eigenen Kontos', async () => {
    clientEinreichen(anton.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => zeiten.subscribeOwnEntriesInRange(
        BETRIEB, anton.uid, '2026-05-01', '2026-05-31', melde, fehler),
      async () => { await admin.from('time_entries').insert(buchung(
        { ...anton, betrieb: BETRIEB } as Konto, IM_MONAT, { travel_time: 42 })); },
      (rows) => rows.some((r) => (r as { travelTime?: number }).travelTime === 42),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('Zeiten des ganzen Betriebs', async () => {
    const buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
    clientEinreichen(buch.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => zeiten.subscribeEntriesInRange(
        BETRIEB, '2026-06-01', '2026-06-30', melde, fehler),
      async () => { await admin.from('time_entries').insert(buchung(
        { ...berta, betrieb: BETRIEB } as Konto, '2026-06-08', { travel_time: 43 })); },
      (rows) => rows.some((r) => (r as { travelTime?: number }).travelTime === 43),
    );
    expect(ergebnis.ok).toBe(true);
  }, 60_000);

  it('eigene Materialanforderungen', async () => {
    clientEinreichen(anton.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => anforderungen.subscribeOwnOrders(BETRIEB, anton.uid, 50, melde, fehler),
      async () => { await anforderungen.createMaterialOrder(BETRIEB, {
        materialName: 'Rohr 22mm', quantity: 3, status: 'Offen',
        transactionType: 'order', userId: anton.uid, userName: 'Anton',
      } as Parameters<typeof anforderungen.createMaterialOrder>[1]); },
      (rows) => rows.some((r) => (r as { materialName?: string }).materialName === 'Rohr 22mm'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('alle Materialanforderungen', async () => {
    clientEinreichen(chef.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => anforderungen.subscribeAllOrders(BETRIEB, 50, melde, fehler),
      async () => {
        clientEinreichen(berta.client);
        await anforderungen.createMaterialOrder(BETRIEB, {
          materialName: 'Dichtung 3/4', quantity: 1, status: 'Offen',
          transactionType: 'order', userId: berta.uid, userName: 'Berta',
        } as Parameters<typeof anforderungen.createMaterialOrder>[1]);
        clientEinreichen(chef.client);
      },
      (rows) => rows.some((r) => (r as { materialName?: string }).materialName === 'Dichtung 3/4'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('der Materialstamm', async () => {
    clientEinreichen(chef.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => material.subscribeMaterials(BETRIEB, melde, fehler),
      async () => { await material.createMaterial(BETRIEB, { name: 'Kessel 24kW', stock: 2 }); },
      (rows) => rows.some((r) => (r as { name?: string }).name === 'Kessel 24kW'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('die jüngsten Baustellen', async () => {
    clientEinreichen(chef.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => baustellen.subscribeRecentProjects(BETRIEB, 50, melde, fehler),
      async () => { await baustellen.createProject(BETRIEB, {
        projectNumber: 'B-901', customerName: 'Huber', status: 'Aktiv',
      } as Parameters<typeof baustellen.createProject>[1]); },
      (rows) => rows.some((r) => (r as { projectNumber?: string }).projectNumber === 'B-901'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('die Einteilung eines Monats', async () => {
    clientEinreichen(chef.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => einsaetze.subscribeAssignmentsForMonth(
        BETRIEB, MONAT.jahr, MONAT.monat, melde, fehler),
      async () => { await einsaetze.saveAssignments(BETRIEB, IM_MONAT, 'B-700', [{
        date: IM_MONAT, projectNumber: 'B-700', userId: anton.uid, userName: 'Anton',
      }]); },
      (rows) => rows.some((r) => (r as { projectNumber?: string }).projectNumber === 'B-700'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('die Einteilung eines Zeitraums', async () => {
    clientEinreichen(chef.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => einsaetze.subscribeAssignmentsInRange(
        BETRIEB, '2026-07-06', '2026-07-12', melde, fehler),
      async () => { await einsaetze.saveAssignments(BETRIEB, '2026-07-08', 'B-702', [{
        date: '2026-07-08', projectNumber: 'B-702', userId: anton.uid, userName: 'Anton',
      }]); },
      (rows) => rows.some((r) => (r as { projectNumber?: string }).projectNumber === 'B-702'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('die Rüstlisten eines Tages', async () => {
    clientEinreichen(chef.client);
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => ruest.subscribeEinsatzMaterialForDate(BETRIEB, IM_MONAT, melde, fehler),
      async () => { await ruest.saveEinsatzMaterial(
        BETRIEB, IM_MONAT, 'B-700', [{ id: 'pa', name: 'Rohr', menge: 1 }], [anton.uid], 'Chef'); },
      (rows) => rows.some((r) => (r as { projectNumber?: string }).projectNumber === 'B-700'),
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);

  it('die jüngsten Rechnungen', async () => {
    const buch = await konto(BETRIEB, 'Buchhaltung', 'buch2');
    clientEinreichen(buch.client);
    const jahr = new Date().getFullYear();
    const ergebnis = await meldetDurch<WithId<unknown>[]>(
      (melde, fehler) => rechnungen.subscribeRecentInvoices(BETRIEB, 50, melde, fehler),
      async () => { await rechnungen.createInvoice(BETRIEB, {
        invoiceNumber: `RE-${jahr}-7777`, projectNumber: 'B-700', customerName: 'Huber',
        invoiceDate: '2026-05-31', dueDate: '2026-06-14',
        totalNetto: 100, totalVat: 20, totalBrutto: 120, paymentStatus: 'Offen',
        positions: [{ label: 'Arbeit', qty: 1, unit: 'h', unitPrice: 100, netto: 100 }],
      }); },
      (rows) => rows.some((r) => (r as { invoiceNumber?: string }).invoiceNumber === `RE-${jahr}-7777`),
    );
    expect(ergebnis.ok).toBe(true);
  }, 60_000);

  it('die eigenen Einstellungen', async () => {
    clientEinreichen(berta.client);
    const ergebnis = await meldetDurch<unknown>(
      (melde, fehler) => einstellungen.subscribePrefs(berta.uid, melde, fehler),
      async () => { await einstellungen.savePrefs(BETRIEB, berta.uid, {
        notifyNewOrder: false, notifyOrderReady: false, notifyUrgentDelivery: false,
      }); },
      (p) => (p as { notifyNewOrder?: boolean } | null)?.notifyNewOrder === false,
    );
    expect(ergebnis.ok).toBe(true);
  }, 30_000);
});

describe('Was nicht dazugehört, kommt nicht an', () => {
  it('eine Buchung ausserhalb des Zeitraums bleibt draussen', async () => {
    /*
      Der Kanal filtert nur nach dem Betrieb — Supabase kann je Kanal genau
      EINEN Filter. Alles Weitere prüft der Client an der eingehenden Zeile.
      Diese Prüfung hält fest, dass er es auch tut: sonst wüchse die
      Monatsansicht still um Zeilen aus anderen Monaten.
    */
    clientEinreichen(anton.client);
    const e = await bleibtDraussen<WithId<unknown>[]>(
      (melde, fehler) => zeiten.subscribeOwnEntriesInRange(
        BETRIEB, anton.uid, '2026-10-01', '2026-10-31', melde, fehler),
      {
        ausloesen: async () => { await admin.from('time_entries').insert(buchung(
          { ...anton, betrieb: BETRIEB } as Konto, AUSSERHALB, { travel_time: 99 })); },
        erkennen: (rows) => rows.some((r) => (r as { travelTime?: number }).travelTime === 99),
      },
      {
        ausloesen: async () => { await admin.from('time_entries').insert(buchung(
          { ...anton, betrieb: BETRIEB } as Konto, '2026-10-05', { travel_time: 98 })); },
        erkennen: (rows) => rows.some((r) => (r as { travelTime?: number }).travelTime === 98),
      },
    );
    expect(e).toEqual({ falschDa: false, richtigDa: true });
  }, 40_000);

  it('ein Monteur bekommt die Buchung eines Kollegen nicht', async () => {
    /*
      DIE WICHTIGSTE DIESER PRÜFUNGEN. Zeiteinträge tragen Kranken- und
      Urlaubstage und damit Gesundheitsdaten nach Art. 9 DSGVO. Der Kanal
      filtert nach dem BETRIEB, also läge die Zeile des Kollegen im Strom —
      abgewiesen wird sie erst vom Zeilenschutz, den der Meldeweg je Zeile und
      Empfänger auswertet.

      Dass er das tut, ist eine Zusage von Supabase. Eine Zusage, an der
      Gesundheitsdaten hängen, wird gemessen und nicht geglaubt.

      Abonniert wird OHNE Personenfilter (`subscribeEntriesInRange`), damit
      wirklich der Zeilenschutz die Grenze zieht und nicht der Filter im
      Client. Sonst bewiese die Prüfung nur, dass der Client sieben kann.
    */
    clientEinreichen(anton.client);
    const e = await bleibtDraussen<WithId<unknown>[]>(
      (melde, fehler) => zeiten.subscribeEntriesInRange(
        BETRIEB, '2026-09-01', '2026-09-30', melde, fehler),
      {
        ausloesen: async () => { await admin.from('time_entries').insert(buchung(
          { ...berta, betrieb: BETRIEB } as Konto, '2026-09-07', { status: 'Krank' })); },
        erkennen: (rows) => rows.some((r) => (r as { userId?: string }).userId === berta.uid),
      },
      {
        ausloesen: async () => { await admin.from('time_entries').insert(buchung(
          { ...anton, betrieb: BETRIEB } as Konto, '2026-09-08', { travel_time: 97 })); },
        erkennen: (rows) => rows.some((r) => (r as { travelTime?: number }).travelTime === 97),
      },
    );
    expect(e).toEqual({ falschDa: false, richtigDa: true });
  }, 40_000);

  it('ein fremder Betrieb kommt nie an', async () => {
    clientEinreichen(chef.client);
    const e = await bleibtDraussen<WithId<unknown>[]>(
      (melde, fehler) => material.subscribeMaterials(BETRIEB, melde, fehler),
      {
        ausloesen: async () => {
          clientEinreichen(fremdChef.client);
          await material.createMaterial(FREMD, { name: 'Fremdes Rohr', stock: 1 });
          clientEinreichen(chef.client);
        },
        erkennen: (rows) => rows.some((r) => (r as { name?: string }).name === 'Fremdes Rohr'),
      },
      {
        ausloesen: async () => { await material.createMaterial(BETRIEB, { name: 'Eigenes Rohr', stock: 1 }); },
        erkennen: (rows) => rows.some((r) => (r as { name?: string }).name === 'Eigenes Rohr'),
      },
    );
    expect(e).toEqual({ falschDa: false, richtigDa: true });
  }, 40_000);
});

describe('Wer die Mandantengrenze wirklich hält', () => {
  it('der Zeilenschutz, nicht der Kanalfilter', async () => {
    /*
      GEMESSEN, WEIL EINE MUTATION DURCHKAM.

      `abonnieren` meldet den Kanal mit `filter: company_id=eq.…` an. Nimmt
      man diesen Filter weg, bleibt die Prüfung „ein fremder Betrieb kommt nie
      an" trotzdem grün — und das ist die richtige Antwort: der Meldeweg wertet
      den Zeilenschutz je Zeile UND je Empfänger aus. Der Filter spart
      Meldungen, er zieht keine Grenze.

      Warum das hier steht und nicht in einem Kommentar: davon hängt ab, wie
      gefährlich eine Änderung am Kanal ist. Wäre der Filter die Grenze, wäre
      jede Änderung daran eine Sicherheitsänderung. Er ist es nicht — und
      diese Prüfung hält fest, dass es so bleibt.

      Der Kanal wird deshalb VON HAND angemeldet, ohne Filter, genau wie die
      Mutation es tat.
    */
    const gesehen: Array<Record<string, unknown>> = [];
    const kanal = anton.client
      .channel(`grenze-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        (n) => gesehen.push(n.new as Record<string, unknown>),
      )
      .subscribe();
    try {
      await warte(ANLAUF_MS);

      clientEinreichen(fremdChef.client);
      await material.createMaterial(FREMD, { name: 'Grenzfall fremd', stock: 1 });
      clientEinreichen(chef.client);
      await material.createMaterial(BETRIEB, { name: 'Grenzfall eigen', stock: 1 });

      const eigenDa = () => gesehen.some((g) => g.name === 'Grenzfall eigen');
      for (let i = 0; i < 50 && !eigenDa(); i += 1) await warte(100);

      // Die eigene Zeile kommt an — der Kanal lebt und filtert nichts weg.
      expect(eigenDa()).toBe(true);
      // Die fremde nie, obwohl kein Filter sie fernhält.
      expect(gesehen.some((g) => g.name === 'Grenzfall fremd')).toBe(false);
    } finally {
      await anton.client.removeChannel(kanal);
      clientEinreichen(chef.client);
    }
  }, 40_000);
});

describe('Unter Last', () => {
  it('ein Schwung von zwanzig Buchungen kommt vollständig an', async () => {
    /*
      DIE FRAGE AUS DEM FAHRPLAN: trägt der unmittelbare Meldeweg auch für die
      langen Abonnements, oder braucht es eine Meldung aus dem Trigger?

      Was zählt, ist nicht die Geschwindigkeit, sondern die VOLLSTÄNDIGKEIT.
      Ein Meldeweg, der unter einem Schwung Meldungen verliert, zeigt eine
      Liste, der eine Zeile fehlt — und niemand sieht es. Hier werden zwanzig
      Buchungen auf einmal geschrieben; am Ende müssen zwanzig dastehen.

      Das Nachfassen hilft dabei NICHT: es läuft 1,2 Sekunden nach dem
      Anmelden und ist längst vorbei, wenn geschrieben wird.
    */
    clientEinreichen(anton.client);
    const staende: Array<WithId<unknown>[]> = [];
    const stopp = zeiten.subscribeOwnEntriesInRange(
      BETRIEB, anton.uid, '2026-11-01', '2026-11-30',
      (rows) => staende.push(rows), (e) => { throw e; },
    );
    try {
      await warte(ANLAUF_MS);
      const zeilen = Array.from({ length: 20 }, (_, i) =>
        buchung({ ...anton, betrieb: BETRIEB } as Konto,
          `2026-11-${String(i + 1).padStart(2, '0')}`));
      await admin.from('time_entries').insert(zeilen);

      const letzte = () => staende[staende.length - 1] ?? [];
      for (let i = 0; i < 60 && letzte().length < 20; i += 1) await warte(100);
      expect(letzte()).toHaveLength(20);
    } finally {
      stopp();
    }
  }, 45_000);

  it('ein zusammengesetztes Abonnement fasst den Schwung zusammen', async () => {
    /*
      Die Rüstliste und die Rechnungsliste holen bei JEDER Meldung den ganzen
      Stand neu — sie bestehen aus mehreren Tabellen und lassen sich nicht aus
      einer einzelnen Zeile fortschreiben. Ohne Zusammenfassen wäre ein
      Schwung von zehn Änderungen zehn volle Nachladungen, jede mit zwei
      Abfragen.

      Geprüft wird beides: dass am Ende der richtige Stand dasteht, UND dass
      es deutlich weniger Meldungen waren als Änderungen.
    */
    clientEinreichen(chef.client);
    const staende: Array<WithId<unknown>[]> = [];
    const stopp = ruest.subscribeEinsatzMaterialForDate(
      BETRIEB, '2026-12-07', (rows) => staende.push(rows), (e) => { throw e; },
    );
    try {
      await warte(ANLAUF_MS);
      const vorher = staende.length;

      for (let i = 1; i <= 10; i += 1) {
        await ruest.saveEinsatzMaterial(
          BETRIEB, '2026-12-07', 'B-800',
          [{ id: 'pa', name: 'Rohr', menge: i }], [anton.uid], 'Chef',
        );
      }

      const menge = () => {
        const letzte = staende[staende.length - 1] ?? [];
        const l = letzte[0] as { positionen?: Array<{ menge: number }> } | undefined;
        return l?.positionen?.[0]?.menge;
      };
      for (let i = 0; i < 60 && menge() !== 10; i += 1) await warte(100);

      expect(menge()).toBe(10);
      const meldungen = staende.length - vorher;
      /*
        Zehn Speichervorgänge lösen je drei Änderungen am Kopf aus — dreissig
        Meldungen. Ohne Zusammenfassen wären das dreissig Nachladungen mit je
        zwei Abfragen. Die Zahl darf schwanken; dass sie DEUTLICH kleiner ist
        als die Zahl der Änderungen, ist die Zusage.
      */
      expect(meldungen).toBeLessThan(30);
      expect(meldungen).toBeGreaterThan(0);
    } finally {
      stopp();
    }
  }, 60_000);
});

describe('Der Wächter über dieses Prüfnetz', () => {
  it('jedes Abonnement der Postgres-Schicht ist hier geprüft', () => {
    /*
      Ohne diesen Wächter wäre ein zwölftes Abonnement einfach ungeprüft — und
      das fiele erst auf, wenn eine Ansicht draussen stehenbleibt. Ein
      Abonnement ohne Zustellprüfung ist kein halb geprüftes, es ist ein
      ungeprüftes.
    */
    const PG = resolve(process.cwd(), 'src/lib/db/pg');
    const namen: string[] = [];
    for (const d of readdirSync(PG).filter((f) => f.endsWith('.ts'))) {
      const muster = /export function (subscribe\w+)/g;
      let t: RegExpExecArray | null;
      const text = readFileSync(resolve(PG, d), 'utf8');
      while ((t = muster.exec(text))) namen.push(t[1]);
    }
    const hier = readFileSync(resolve(process.cwd(), 'tests/supabase/abonnements.test.ts'), 'utf8');
    const ungeprueft = namen.filter((n) => !hier.includes(`${n}(`));

    expect(ungeprueft).toEqual([]);
    // Und findet er die Abonnements überhaupt?
    expect(namen.length).toBeGreaterThanOrEqual(11);
  });
});
