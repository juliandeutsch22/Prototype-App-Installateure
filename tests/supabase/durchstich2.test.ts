/**
 * Durchstich 3 und 4 auf Postgres: Angebot → Nachkalkulation, und der Schein,
 * der nach der Unterschrift zu ist.
 *
 * Wie `durchstich1.test.ts` geht auch das hier durch die WEICHE und nicht an
 * ihr vorbei — importiert wird `@/lib/db/…`, `VITE_DATENQUELLE` steht auf
 * `postgres`. Was hier grün ist, hängt nach dem Umschalten tatsächlich
 * zusammen.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { TimeEntry } from '@/types';

vi.stubEnv('VITE_DATENQUELLE', 'postgres');

const zeiten = await import('@/lib/db/timeEntries');
const projekte = await import('@/lib/db/projects');
const angeboteDb = await import('@/lib/db/quotes');
const rechnungenDb = await import('@/lib/db/invoices');
const scheineDb = await import('@/lib/db/workSheets');
const { rechneBaustelle } = await import('@/features/costing/nachkalkulation');

const BETRIEB = 'durchstich2';
const BAUSTELLE = 'B-2026-0001';

let monteur: Konto;
let buch: Konto;
let chef: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'd2-monteur');
  buch = await konto(BETRIEB, 'Buchhaltung', 'd2-buch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'd2-chef');
  clientEinreichen(monteur.client);
}, 180_000);

afterAll(() => {
  clientEinreichen(null);
  vi.unstubAllEnvs();
});

const arbeitstag = (datum: string) => ({
  date: datum,
  status: 'Anwesend' as const,
  startTime: '07:00',
  endTime: '16:00',
  breakDuration: 30,
  projectNumber: BAUSTELLE,
  userId: monteur.uid,
  userName: 'Max Mustermann',
});

describe('Durchstich 3: vom Angebot bis zur Nachkalkulation', () => {
  it('Angebot annehmen, Zeiten buchen, verrechnen, Marge rechnen', async () => {
    // 1. Die Geschäftsführung legt ein Angebot mit kalkulierter Arbeitszeit an.
    clientEinreichen(chef.client);
    await angeboteDb.createQuote(BETRIEB, {
      quoteNumber: 'AN-2026-0001',
      customerName: 'Familie Huber',
      quoteDate: '2026-06-01',
      validUntil: '2026-07-01',
      status: 'Versendet',
      positions: [],
      subtotalNetto: 3000,
      totalNetto: 3000,
      totalVat: 600,
      totalBrutto: 3600,
      vatRate: 0.2,
      kalkulierteStunden: 30,
    });

    // 2. Angenommen — daraus entsteht die Baustelle MIT Stundenbudget.
    const angebot = (await angeboteDb.listRecentQuotes(BETRIEB))[0];
    await projekte.createProject(BETRIEB, {
      projectNumber: BAUSTELLE,
      customerName: angebot.customerName,
      status: 'Aktiv',
      estimatedHours: angebot.kalkulierteStunden,
      billingMode: 'Regie',
    });
    await angeboteDb.updateQuote(angebot.id, {
      status: 'Angenommen',
      projectNumber: BAUSTELLE,
    });

    /*
      Das Stundenbudget stammt aus der Kalkulation und nicht aus einem zweiten
      Mal Abtippen — erst damit misst die Budget-Ampel gegen eine Zahl mit
      Herkunft.
    */
    const baustelle = (await projekte.listActiveProjects(BETRIEB))[0];
    expect(baustelle.estimatedHours).toBe(30);

    // 3. Der Monteur arbeitet vier Tage darauf.
    clientEinreichen(monteur.client);
    for (const tag of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']) {
      await zeiten.createTimeEntry(BETRIEB, arbeitstag(tag));
    }

    // 4. Die Buchhaltung verrechnet.
    clientEinreichen(buch.client);
    await rechnungenDb.createInvoice(BETRIEB, {
      invoiceNumber: 'RE-2026-0001',
      projectNumber: BAUSTELLE,
      customerName: 'Familie Huber',
      invoiceDate: '2026-06-30',
      dueDate: '2026-07-14',
      totalNetto: 3000,
      totalVat: 600,
      totalBrutto: 3600,
      paymentStatus: 'Offen',
    });

    /*
      5. Die Nachkalkulation zieht alles zusammen: Zeiten der Baustelle,
      Rechnungen, Angebot. Vier Tage à 8,5 h = 34 Stunden, bei 42 EUR
      Kostensatz also 1.428 EUR Personalkosten gegen 3.000 EUR Erlös.
    */
    clientEinreichen(chef.client);
    const zeitenDerBaustelle = await zeiten.listEntriesForProjects(BETRIEB, [BAUSTELLE]);
    const rechnungen = await rechnungenDb.listUnpaidInvoices(BETRIEB);
    const ergebnis = rechneBaustelle(
      BAUSTELLE, 'Familie Huber',
      zeitenDerBaustelle as TimeEntry[], rechnungen, undefined,
      { fach: 42, helper: 28 },
    );

    expect(ergebnis.fachStunden).toBe(34);
    expect(ergebnis.erloes).toBe(3000);
    expect(ergebnis.erloesQuelle).toBe('Rechnungen');
    expect(ergebnis.personalkosten).toBe(1428);
    expect(ergebnis.deckungsbeitrag).toBe(1572);

    /*
      Und die Warnung, die den ganzen Weg rechtfertigt: kalkuliert waren 30
      Stunden, geleistet sind 34. Sichtbar nur, weil das Budget aus dem
      Angebot mitgewandert ist.
    */
    expect(ergebnis.fachStunden).toBeGreaterThan(baustelle.estimatedHours ?? 0);
  }, 300_000);
});

describe('Durchstich 4: der Schein ist nach der Unterschrift zu', () => {
  it('Entwurf ändern geht, unterschrieben nicht mehr, Storno mit Grund schon', async () => {
    clientEinreichen(monteur.client);
    const id = await scheineDb.createWorkSheet(BETRIEB, {
      projectNumber: BAUSTELLE,
      customerName: 'Familie Huber',
      datum: '2026-06-18',
      status: 'Entwurf',
      abrechnung: 'Regie',
      zeiten: [{ datum: '2026-06-18', mitarbeiter: 'Max Mustermann', minuten: 510 }],
      material: [],
      erstelltVonUid: monteur.uid,
      erstelltVonName: 'Max Mustermann',
    });

    // Solange Entwurf: änderbar.
    await expect(
      scheineDb.updateWorkSheetDraft(id, { notizen: 'Abfluss zusätzlich gereinigt' }),
    ).resolves.toBeUndefined();

    const jetzt = Date.now();
    await scheineDb.signWorkSheet(
      id,
      { name: 'Max Mustermann', bild: 'data:image/png;base64,AAA', geraetZeit: jetzt },
      { name: 'Herr Huber', bild: 'data:image/png;base64,BBB', geraetZeit: jetzt },
    );

    /*
      DER KERN DES BELEGS. Ein Schein, den der Kunde unterschrieben hat und den
      man danach ändern kann, ist wertlos: der Kunde hat etwas anderes
      unterschrieben, als im System steht, und niemand könnte den Unterschied
      nachweisen. Die Sperre sitzt unter Postgres in einem TRIGGER, nicht mehr
      in einer Zeilenregel — deshalb steht sie hier gegen die echte Datenbank.
    */
    await expect(
      scheineDb.updateWorkSheetDraft(id, { notizen: 'nachträglich geändert' }),
    ).rejects.toThrow();

    /*
      Der Storno ist der einzige Weg — und er ist der LEITUNG vorbehalten.
      Dürfte der Monteur selbst stornieren, könnte er einen unbequemen
      unterschriebenen Beleg allein aus der Welt schaffen.
    */
    await expect(
      scheineDb.cancelWorkSheet(id, 'Falsche Baustelle erfasst', 'Julian Deutsch'),
    ).rejects.toThrow();

    clientEinreichen(chef.client);
    await expect(
      scheineDb.cancelWorkSheet(id, 'Falsche Baustelle erfasst', 'Julian Deutsch'),
    ).resolves.toBeUndefined();

    clientEinreichen(buch.client);
    const nachher = await scheineDb.getWorkSheet(id);
    // Gelöscht wird nie: ein spurlos verschwundener Beleg wäre schlimmer als
    // ein falscher.
    expect(nachher).not.toBeNull();
    expect(nachher!.status).toBe('Storniert');
    expect(nachher!.stornoGrund).toBe('Falsche Baustelle erfasst');
  }, 300_000);

  it('einen Entwurf wieder ÖFFNEN, ändern und dann unterschreiben', async () => {
    /*
      DER WEG, DEN „Als Entwurf speichern" ERST BRAUCHBAR MACHT: vormittags
      vorbereiten, nachmittags unterschreiben lassen. Die Frage hängt an der
      Datenbank und nicht an der Oberfläche — darf derselbe Aufrufer den
      Entwurf lesen, seinen Inhalt ERSETZEN und ihn danach einfrieren?

      Unter Postgres steht dahinter mehr als unter Firestore: der Schein ist
      auf vier Tabellen verteilt, das Ersetzen der Stundenliste ist ein
      Löschen und Neuschreiben von Zeilen, und `schein_speichern` hält das
      zusammen.
    */
    clientEinreichen(monteur.client);
    const id = await scheineDb.createWorkSheet(BETRIEB, {
      projectNumber: BAUSTELLE,
      customerName: 'Familie Huber',
      datum: '2026-06-19',
      status: 'Entwurf',
      abrechnung: 'Regie',
      zeiten: [],
      material: [],
      erstelltVonUid: monteur.uid,
      erstelltVonName: 'Max Mustermann',
    });

    const geholt = await scheineDb.getWorkSheet(id);
    expect(geholt?.status).toBe('Entwurf');
    expect(geholt?.id).toBe(id);

    await scheineDb.updateWorkSheetDraft(id, {
      zeiten: [{ datum: '2026-06-19', mitarbeiter: 'Max Mustermann', minuten: 240 }],
      material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }],
      notizen: 'Absperrventil getauscht',
    });

    const jetzt = Date.now();
    await expect(
      scheineDb.signWorkSheet(
        id,
        { name: 'Max Mustermann', bild: 'data:image/png;base64,AAA', geraetZeit: jetzt },
        { name: 'Herr Huber', bild: 'data:image/png;base64,BBB', geraetZeit: jetzt },
      ),
    ).resolves.toBeUndefined();

    const fertig = await scheineDb.getWorkSheet(id);
    expect(fertig?.status).toBe('Unterschrieben');
    // Der ergänzte Inhalt ist mit eingefroren — nicht der leere vom Anlegen.
    expect(fertig?.zeiten).toHaveLength(1);
    expect(fertig?.material?.[0]?.name).toBe('Eckventil 1/2 Zoll');
  }, 300_000);

  it('ein Schein einer FREMDEN Firma lässt sich nicht über die Kennung holen', async () => {
    /*
      Die Kennung kommt sonst aus einer Liste, die der Aufrufer schon lesen
      durfte. Über die Adresszeile lässt sich aber jede eintippen — und dann
      entscheidet allein die Zeilenregel.
    */
    await betriebAnlegen('durchstich2-fremd');
    const fremd = await konto('durchstich2-fremd', 'Mitarbeiter', 'd2-fremd');
    clientEinreichen(fremd.client);
    const fremdId = await scheineDb.createWorkSheet('durchstich2-fremd', {
      projectNumber: 'X-1', customerName: 'Fremd GmbH', datum: '2026-06-19',
      status: 'Entwurf', abrechnung: 'Regie', zeiten: [], material: [],
      erstelltVonUid: fremd.uid, erstelltVonName: 'Fremd',
    });

    clientEinreichen(monteur.client);
    expect(await scheineDb.getWorkSheet(fremdId)).toBeUndefined();
  }, 180_000);

  it('eine Kennung, die es NICHT gibt, kommt als „nichts" zurück — wie eine fremde', async () => {
    /*
      HIER LAEUFT POSTGRES ANDERS ALS FIRESTORE, und das gehört festgehalten.

      Firestore wies eine unbekannte Kennung als ZUGRIFF ab: die Regel las
      `resource.data.companyId`, und bei einem Dokument, das es nicht gibt,
      ist `resource` null. Ein fehlender Schein kam also als Fehler zurück,
      nicht als „nicht gefunden" — die Oberfläche musste beide Ausgänge gleich
      behandeln.

      Der Zeilenschutz filtert stattdessen: was die Regel nicht durchlässt,
      ist einfach nicht in der Ergebnismenge. Ein fehlender und ein fremder
      Schein sehen damit gleich aus — beide kommen als `undefined` zurück,
      genau das, was die Oberfläche ohnehin annehmen musste. Aus zwei
      Ausgängen ist einer geworden, und der Test darüber ist der Beleg dafür,
      dass es wirklich einer ist.
    */
    clientEinreichen(monteur.client);
    expect(await scheineDb.getWorkSheet(crypto.randomUUID())).toBeUndefined();
  }, 60_000);
});
