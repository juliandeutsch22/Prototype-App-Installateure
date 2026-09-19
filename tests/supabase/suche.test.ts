/**
 * Serverseitig suchen — die Narbe, die der Umzug wegnimmt.
 *
 * WAS VORHER WAR. Firestore kennt keine Volltextsuche. Die Ansichten luden
 * die ersten paar hundert Zeilen und filterten im Browser: wer den 301.
 * Kunden suchte, fand ihn nicht — und bekam darüber keine Auskunft, sondern
 * eine leere Liste.
 *
 * WAS HIER GEPRÜFT WIRD, ist deshalb nicht „findet Huber", sondern die drei
 * Stellen, an denen eine Suche still falsch wird: Treffer jenseits der alten
 * Grenze, Sonderzeichen im Suchbegriff, und die Mandantengrenze.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';


const kunden = await import('@/lib/db/customers');
const baustellen = await import('@/lib/db/projects');
const wartungen = await import('@/lib/db/wartungen');

const BETRIEB = 'suche-b';
const FREMD = 'suche-c';

let buero: Konto;
let fremderChef: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buero = await konto(BETRIEB, 'Verwaltung', 'suche-buero');
  fremderChef = await konto(FREMD, 'Geschäftsführung', 'suche-fremd');
  clientEinreichen(buero.client);

  const { error } = await admin.from('customers').insert([
    { id: crypto.randomUUID(), company_id: BETRIEB, name: 'Huber, Franz',
      address: 'Hauptstraße 1', contact_name: 'Franz' },
    { id: crypto.randomUUID(), company_id: BETRIEB, name: 'Rabatt 50% Aktion' },
    { id: crypto.randomUUID(), company_id: BETRIEB, name: 'Meier (GmbH)' },
    { id: crypto.randomUUID(), company_id: BETRIEB, name: 'A_B Technik' },
    { id: crypto.randomUUID(), company_id: BETRIEB, name: "O'Brien & Söhne" },
    { id: crypto.randomUUID(), company_id: FREMD, name: 'Huber Gruber' },
  ]);
  if (error) throw new Error(error.message);
}, 180_000);

const namen = (liste: Array<{ name: string }>) => liste.map((k) => k.name).sort();

describe('Treffer mitten im Wort', () => {
  it('findet „uber" in „Huber" — das konnte Firestore nicht', async () => {
    /*
      DER KERN DER SACHE. Firestore konnte nur Anfänge: `>=` und `<` auf einer
      sortierten Spalte. Wer den Kunden unter „Gruber" suchte und „Huber"
      meinte, bekam nichts.
    */
    expect(namen(await kunden.searchCustomers(BETRIEB, 'uber'))).toEqual(['Huber, Franz']);
  }, 60_000);

  it('und es ist gleich, wie man es schreibt', async () => {
    expect(namen(await kunden.searchCustomers(BETRIEB, 'HUBER')))
      .toEqual(['Huber, Franz']);
  }, 60_000);

  it('sucht auch in Adresse und Ansprechpartner', async () => {
    expect(namen(await kunden.searchCustomers(BETRIEB, 'Hauptstr')))
      .toEqual(['Huber, Franz']);
  }, 60_000);

  it('ohne Begriff kommt die ganze Liste', async () => {
    // „Nichts gesucht" heisst „alles zeigen" — und das ist eine andere
    // Abfrage, keine mit einem Muster, das zufällig auf alles passt.
    expect((await kunden.searchCustomers(BETRIEB, '  ')).length).toBe(5);
  }, 60_000);
});

describe('Sonderzeichen gehören dem Suchenden', () => {
  it('ein Komma zerreisst die Abfrage nicht', async () => {
    /*
      GEMESSEN, NICHT VERMUTET: ohne Anführungszeichen antwortet PostgREST mit
      „failed to parse logic tree". Das ist der gutmütige Ausgang — der andere
      wäre ein Begriff, der den Filterbaum nicht zerreisst, sondern UMBAUT.
    */
    expect(namen(await kunden.searchCustomers(BETRIEB, 'Huber, F')))
      .toEqual(['Huber, Franz']);
  }, 60_000);

  it('ein Prozentzeichen wird gesucht, nicht als „alles" gelesen', async () => {
    const treffer = await kunden.searchCustomers(BETRIEB, '50%');
    expect(namen(treffer)).toEqual(['Rabatt 50% Aktion']);
    // Die Gegenprobe: ohne Entschärfung käme hier die halbe Liste.
    expect(treffer.length).toBeLessThan(5);
  }, 60_000);

  it('ein Unterstrich steht für sich', async () => {
    expect(namen(await kunden.searchCustomers(BETRIEB, 'A_B'))).toEqual(['A_B Technik']);
    // „AxB" gibt es nicht — ein ungeschützter Unterstrich fände es trotzdem.
    expect(await kunden.searchCustomers(BETRIEB, 'A%B')).toEqual([]);
  }, 60_000);

  it('Klammern und Apostroph auch', async () => {
    expect(namen(await kunden.searchCustomers(BETRIEB, '(GmbH)'))).toEqual(['Meier (GmbH)']);
    expect(namen(await kunden.searchCustomers(BETRIEB, "O'Brien")))
      .toEqual(["O'Brien & Söhne"]);
  }, 60_000);

  it('und ein Anführungszeichen beendet den Wert nicht', async () => {
    // Es steht in keinem Namen — entscheidend ist, dass die Abfrage GELINGT
    // und leer zurückkommt, statt mit einem Syntaxfehler zu scheitern.
    await expect(kunden.searchCustomers(BETRIEB, 'a"b')).resolves.toEqual([]);
    await expect(kunden.searchCustomers(BETRIEB, 'a\\b')).resolves.toEqual([]);
  }, 60_000);
});

describe('Die Suche endet am Betrieb', () => {
  it('ein fremder Kunde taucht nicht auf, auch wenn er passt', async () => {
    // „Huber Gruber" liegt im anderen Betrieb und enthält beide Begriffe.
    expect(namen(await kunden.searchCustomers(BETRIEB, 'uber'))).toEqual(['Huber, Franz']);

    clientEinreichen(fremderChef.client);
    try {
      expect(namen(await kunden.searchCustomers(FREMD, 'uber'))).toEqual(['Huber Gruber']);
    } finally {
      clientEinreichen(buero.client);
    }
  }, 60_000);
});

describe('Jenseits der alten Grenze', () => {
  it('findet den Kunden, den Firestore nie gefunden hätte', async () => {
    /*
      DER GRUND FÜR DEN GANZEN UMZUG, in einer Prüfung. Unter Firestore lud
      die Ansicht die ersten 300 Kunden und filterte im Browser — der 301.
      war unauffindbar, ohne dass irgendwo stand, warum.

      Hier liegen 400 Kunden, und gesucht wird nach dem letzten.
    */
    const viele = 'suche-viele';
    await betriebAnlegen(viele);
    const chef = await konto(viele, 'Geschäftsführung', 'suche-viele-chef');
    await admin.from('customers').insert(
      Array.from({ length: 400 }, (_, i) => ({
        id: crypto.randomUUID(), company_id: viele,
        name: `Kunde ${String(i).padStart(3, '0')}`,
      })),
    );

    clientEinreichen(chef.client);
    try {
      expect(namen(await kunden.searchCustomers(viele, 'Kunde 399')))
        .toEqual(['Kunde 399']);
    } finally {
      clientEinreichen(buero.client);
    }
  }, 180_000);
});

describe('Baustellen und Wartungen suchen genauso', () => {
  it('eine Baustelle über Nummer, Kunde und Adresse', async () => {
    await admin.from('projects').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, project_number: 'B-2026-0042',
      customer_name: 'Familie Huber', address: 'Seestraße 9', status: 'Aktiv',
    });
    expect((await baustellen.searchProjects(BETRIEB, '0042')).map((p) => p.projectNumber))
      .toEqual(['B-2026-0042']);
    expect((await baustellen.searchProjects(BETRIEB, 'Seestr')).map((p) => p.projectNumber))
      .toEqual(['B-2026-0042']);
  }, 120_000);

  it('eine Wartung über Kunde, Anlage und Adresse', async () => {
    /*
      Die Wartungen sind das Einzige im Bestand, das in die ZUKUNFT zeigt.
      Eine, die sich nicht finden lässt, ist ein verlorener Auftrag.
    */
    const { data: kunde } = await admin.from('customers')
      .insert({ id: crypto.randomUUID(), company_id: BETRIEB, name: 'Familie Huber' })
      .select('id').single();
    const { error } = await admin.from('wartungen').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, customer_id: kunde!.id,
      customer_name: 'Familie Huber', anlage: 'Gastherme Vaillant',
      address: 'Seestraße 9', intervall_monate: 12, faellig_am: '2027-03-01',
    });
    if (error) throw new Error(error.message);
    expect((await wartungen.searchWartungen(BETRIEB, 'Vaillant')).map((w) => w.anlage))
      .toEqual(['Gastherme Vaillant']);
    expect((await wartungen.searchWartungen(BETRIEB, 'therme')).map((w) => w.anlage))
      .toEqual(['Gastherme Vaillant']);
  }, 120_000);
});
