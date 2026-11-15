/**
 * „NICHT VERRECHNET“ IN EINER ANTWORT (L22, Messung gegen den gewachsenen
 * Bestand) — `scheine_unverrechnet_stand` und `scheine_unverrechnet_baustellen`
 * aus `supabase/migrations/20261117050000_scheine_unverrechnet_kompakt.sql`.
 *
 * Gegenprobe: ohne die Migration gibt es beide Funktionen nicht, und jede
 * Prüfung hier ist rot. Die App holte bis dahin für Startseite und Rechnungen
 * ALLE unverrechneten Scheine aus `scheine_unverrechnet`, Seite für Seite.
 *
 * BLEIBT GLEICH: was die Ansichten aus den knappen Antworten machen, ist
 * dasselbe, was sie aus der ganzen Liste gemacht haben — Zahl, Alte, je
 * Baustelle Nummer, Kunde, Zahl, ältester Tag und Abrechnung. Verglichen wird
 * mit derselben Rechnung der App (`unverrechnetZeilen`,
 * `nichtVerrechnetJeBaustelle`) über `scheine_unverrechnet`, dessen Regeln
 * `scheineUnverrechnet.test.ts` prüft.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { nichtVerrechnetJeBaustelle, unverrechnetZeilen } from '@/features/worksheets/unverrechnet';

const B = 'scheine-kompakt-a';
const FREMD = 'scheine-kompakt-b';
const HEUTE = '2026-11-15';
const ALT_BIS = '2026-10-18';
let buch: Konto;
let chef: Konto;
let leitung: Konto;
let monteur: Konto;
let laufend = 9700;

type Kopf = { id: string; project_number: string; customer_name: string; datum: string; abrechnung: string };

async function schein(datum: string, p: { status?: string; nummer?: string; kunde?: string; abrechnung?: string; betrieb?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: p.betrieb ?? B, project_number: p.nummer ?? 'SK-REGIE',
    customer_name: p.kunde ?? 'Familie Huber',
    datum, status: p.status ?? 'Unterschrieben', abrechnung: p.abrechnung ?? 'Regie',
    erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
  });
  if (error) throw new Error(error.message);
  return id;
}

async function rechnung(nummer: string, scheine: string[], status = 'Offen'): Promise<void> {
  const id = crypto.randomUUID();
  laufend += 1;
  const { error } = await admin.from('invoices').insert({
    id, company_id: B, invoice_number: `RE-2026-${laufend}`, project_number: nummer, customer_name: 'Familie Huber',
    invoice_date: '2026-10-15', due_date: '2026-10-29', total_netto: 100, total_vat: 20, total_brutto: 120,
    payment_status: status, art: 'einzel', leistung_von: '2026-10-15', leistung_bis: '2026-10-15',
    ...(status === 'Storniert' ? { cancellation_note: 'Prüfung' } : {}),
  });
  if (error) throw new Error(error.message);
  const { error: f } = await admin.from('invoice_coverage').insert(
    scheine.map((ziel_id) => ({ company_id: B, invoice_id: id, art: 'work_sheet', ziel_id })),
  );
  if (f) throw new Error(f.message);
}

const liste = async (k: Konto = buch) => {
  const { data, error } = await k.client.rpc('scheine_unverrechnet');
  if (error) throw error;
  return (data ?? []) as Kopf[];
};
const stand = async (k: Konto = buch) => {
  const { data, error } = await k.client.rpc('scheine_unverrechnet_stand', { p_alt_bis: ALT_BIS });
  if (error) throw error;
  return data as { anzahl: number; alt: number; aeltester: string | null }[];
};
const baustellen = async (k: Konto = buch) => {
  const { data, error } = await k.client.rpc('scheine_unverrechnet_baustellen');
  if (error) throw error;
  return data as (Kopf & { anzahl: number })[];
};

/** Was die Rechnungen daraus zeigen — dieselbe Rechnung wie in der Ansicht. */
const alsAnsicht = (zeilen: (Kopf & { anzahl?: number })[]) =>
  nichtVerrechnetJeBaustelle(
    unverrechnetZeilen(zeilen.map((z) => ({
      id: z.id, projectNumber: z.project_number, customerName: z.customer_name, datum: z.datum,
      abrechnung: z.abrechnung, anzahl: z.anzahl,
    })), HEUTE),
    [],
  ).map((b) => ({
    projectNumber: b.projectNumber, kunde: b.kunde, anzahl: b.anzahlScheine,
    aeltester: b.aeltesterSchein, tage: b.tage, abrechnung: b.scheine[0]?.abrechnung,
  }));

async function aufraeumen() {
  await admin.from('invoice_coverage').delete().eq('company_id', B);
  await admin.from('invoices').delete().eq('company_id', B);
  await admin.from('work_sheets').delete().in('company_id', [B, FREMD]);
}

beforeAll(async () => {
  await betriebAnlegen(B);
  await betriebAnlegen(FREMD);
  buch = await konto(B, 'Buchhaltung', 'sk-buch');
  chef = await konto(B, 'Geschäftsführung', 'sk-chef');
  leitung = await konto(B, 'Projektleiter', 'sk-pl');
  monteur = await konto(B, 'Mitarbeiter', 'sk-mon');
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

/*
  Ein Bestand mit allem, was die Regeln und die Zusammenfassung unterscheiden:
  verrechnet, Storno gibt frei, Entwurf, fremder Betrieb, drei Schreibweisen
  derselben Baustelle, ein ältester Schein ohne Kundennamen, zwei Scheine am
  selben Tag mit verschiedener Abrechnung.
*/
async function bestand() {
  await schein('2026-08-01', { nummer: 'SK-A', kunde: '', abrechnung: 'Pauschal' });
  await schein('2026-08-01', { nummer: 'SK-A', kunde: 'Familie Gruber', abrechnung: 'Regie' });
  await schein('2026-08-05', { nummer: 'PR-sk-a', kunde: 'Familie Huber' });
  await schein('2026-09-01', { nummer: ' sk-a ', kunde: '' });
  const verrechnet = await schein('2026-07-01', { nummer: 'SK-A' });
  const freigegeben = await schein('2026-10-20', { nummer: 'SK-C', kunde: 'Familie Maier' });
  await schein('2026-11-10', { nummer: 'SK-B', kunde: 'Familie Berger' });
  await schein('2026-06-01', { nummer: 'SK-A', status: 'Entwurf' });
  await schein('2026-05-01', { nummer: 'SK-A', betrieb: FREMD });
  await rechnung('SK-A', [verrechnet]);
  await rechnung('SK-C', [freigegeben], 'Storniert');
}

describe('der Stand: eine Zeile statt aller Scheine', () => {
  it('Zahl, Zahl bis zum Stichtag und ältester Tag — wie aus der ganzen Liste', async () => {
    await bestand();
    const l = await liste();
    expect(l).toHaveLength(6);
    expect(await stand()).toEqual([{
      anzahl: l.length,
      alt: l.filter((z) => z.datum <= ALT_BIS).length,
      aeltester: l[0].datum,
    }]);
    expect((await stand())[0]).toEqual({ anzahl: 6, alt: 4, aeltester: '2026-08-01' });
  });

  it('der Stichtag zählt mit (bis einschließlich)', async () => {
    await schein(ALT_BIS);
    await schein('2026-10-19');
    expect((await stand())[0]).toMatchObject({ anzahl: 2, alt: 1 });
  });

  it('nichts offen: eine Zeile mit null, nicht keine', async () => {
    expect(await stand()).toEqual([{ anzahl: 0, alt: 0, aeltester: null }]);
  });
});

describe('je Baustelle: dieselbe Karte wie aus der ganzen Liste', () => {
  it('Nummer, Kunde, Zahl, ältester Tag und Abrechnung je Baustelle wie bisher', async () => {
    await bestand();
    const je = await baustellen();
    expect(alsAnsicht(je)).toEqual(alsAnsicht(await liste()));
    // Ausdrücklich: drei Schreibweisen sind eine Baustelle, der Kunde der erste genannte, die Abrechnung des ältesten.
    const a = alsAnsicht(je).find((b) => b.projectNumber === 'SK-A');
    expect(a).toEqual({ projectNumber: 'SK-A', kunde: 'Familie Gruber', anzahl: 4, aeltester: '2026-08-01', tage: 106, abrechnung: expect.any(String) });
    expect(je).toHaveLength(3);
    expect(je.reduce((n, b) => n + b.anzahl, 0)).toBe((await liste()).length);
  });

  it('der älteste Schein vertritt die Baustelle — älteste Baustelle zuerst', async () => {
    const erst = await schein('2026-09-02', { nummer: 'SK-X' });
    await schein('2026-09-03', { nummer: 'SK-X' });
    await schein('2026-09-01', { nummer: 'SK-Y', abrechnung: 'Einheitspreis' });
    const je = await baustellen();
    expect(je.map((b) => [b.project_number, b.datum, b.anzahl])).toEqual([['SK-Y', '2026-09-01', 1], ['SK-X', '2026-09-02', 2]]);
    expect(je[1].id).toBe(erst);
    expect(je[0].abrechnung).toBe('Einheitspreis');
  });

  /*
    Gegenprobe zur Form: eine Antwort aus Zeilen endet bei 1.000 (PostgREST
    `max_rows`) — 1.050 Baustellen kämen nicht vollständig an. Als ein Wert
    kommen alle.
  */
  it('über 1.000 Baustellen in einer Antwort', async () => {
    const zeilen = Array.from({ length: 1050 }, (_, i) => ({
      id: crypto.randomUUID(), company_id: B, project_number: `SK-${String(i).padStart(4, '0')}`, customer_name: 'Familie Huber',
      datum: '2026-09-01', status: 'Unterschrieben', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
    }));
    const { error } = await admin.from('work_sheets').insert(zeilen);
    if (error) throw new Error(error.message);
    expect(await baustellen()).toHaveLength(1050);
    expect((await liste())).toHaveLength(1000);
  }, 60_000);

  it('nichts offen: eine leere Liste', async () => {
    expect(await baustellen()).toEqual([]);
  });
});

describe('wer fragen darf — wie bei `scheine_unverrechnet`', () => {
  it('Buchhaltung und Geschäftsführung: dieselbe Antwort, nur der eigene Betrieb', async () => {
    await schein('2026-09-01');
    await schein('2026-09-01', { betrieb: FREMD });
    expect(await stand(chef)).toEqual(await stand(buch));
    expect((await stand(buch))[0].anzahl).toBe(1);
    expect(await baustellen(chef)).toEqual(await baustellen(buch));
    expect(await baustellen(buch)).toHaveLength(1);
  });

  it('ohne Rechnungsrecht ein Fehler statt „nichts offen“', async () => {
    await schein('2026-09-01');
    for (const k of [leitung, monteur]) {
      expect((await k.client.rpc('scheine_unverrechnet_stand', { p_alt_bis: ALT_BIS })).error?.code).toBe('42501');
      expect((await k.client.rpc('scheine_unverrechnet_baustellen')).error?.code).toBe('42501');
    }
  });
});
