/**
 * Die Wartungen einer Baustelle (Testbericht Runde 6, M9) — gegen eine
 * echte Datenbank, über dieselbe Funktion wie die Rechnungsvorschau.
 *
 * Der Preis je Wartung soll auf die Rechnung der Baustelle, die aus der
 * Wartung entstanden ist. Dafür muss die Baustelle ihre Wartung finden: solange
 * sie eingeplant ist über `offene_baustelle`, nach „Erledigt“ über die
 * Ausführung — auch dann noch, wenn die nächste Wartung auf einer anderen
 * Baustelle stattfand und `letzte_baustelle` weitergewandert ist.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as wartungen from '@/lib/db/pg/wartungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'r6p3-wartung';
const FREMD = 'r6p3-wartung-fremd';
// Je Lauf eigene Nummern: der Betrieb bleibt zwischen zwei Läufen stehen.
const L = crypto.randomUUID().slice(0, 6);

let chef: Konto;
let buch: Konto;
let fremd: Konto;
let kunde: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'r6p3chef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'r6p3wbuch');
  fremd = await konto(FREMD, 'Buchhaltung', 'r6p3fremd');
  const { data, error } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Huber' })
    .select('id').single();
  if (error) throw new Error(error.message);
  kunde = (data as { id: string }).id;
}, 180_000);

afterAll(() => clientEinreichen(null));

const vereinbarung = (anlage: string) => ({
  customerId: kunde, customerName: 'Familie Huber', anlage, intervallMonate: 12,
  faelligAm: '2026-10-01', aktiv: true, preis: 180,
}) as Parameters<typeof wartungen.createWartung>[1];

describe('M9 — die Wartung zur Baustelle', () => {
  it('eingeplant: die Baustelle findet ihre Wartung samt Preis, noch ohne Leistungstag', async () => {
    clientEinreichen(chef.client);
    const id = await wartungen.createWartung(BETRIEB, vereinbarung('Gaskessel Heizraum'));
    await wartungen.wartungEingeplant(id, `PR-2026-0197-${L}`);
    clientEinreichen(buch.client);
    const gefunden = await wartungen.wartungenDerBaustelle(BETRIEB, `PR-2026-0197-${L}`);
    expect(gefunden.map((w) => ({ id: w.id, preis: w.preis, am: w.ausgefuehrtAm }))).toEqual([{ id, preis: 180, am: null }]);
    // Auch in der anderen Schreibweise der Nummer.
    expect((await wartungen.wartungenDerBaustelle(BETRIEB, `2026-0197-${L}`)).map((w) => w.id)).toEqual([id]);
  });

  it('erledigt — und später woanders gewartet: die Ausführung führt zurück, mit ihrem Tag', async () => {
    clientEinreichen(chef.client);
    const id = await wartungen.createWartung(BETRIEB, vereinbarung('Boiler Keller'));
    await wartungen.wartungEingeplant(id, `PR-2026-0300-${L}`);
    await wartungen.wartungErledigt(id, { erledigtAm: '2025-10-20', intervallMonate: 12, projectNumber: `PR-2026-0300-${L}` });
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-10-19', intervallMonate: 12, projectNumber: `PR-2027-0011-${L}` });
    clientEinreichen(buch.client);
    const alt = await wartungen.wartungenDerBaustelle(BETRIEB, `PR-2026-0300-${L}`);
    expect(alt.map((w) => ({ id: w.id, am: w.ausgefuehrtAm }))).toEqual([{ id, am: '2025-10-20' }]);
    const neu = await wartungen.wartungenDerBaustelle(BETRIEB, `PR-2027-0011-${L}`);
    expect(neu.map((w) => ({ id: w.id, am: w.ausgefuehrtAm }))).toEqual([{ id, am: '2026-10-19' }]);
  });

  it('Gegenprobe: eine andere Baustelle findet nichts, ein fremder Betrieb auch nicht', async () => {
    clientEinreichen(buch.client);
    expect(await wartungen.wartungenDerBaustelle(BETRIEB, `PR-2026-0999-${L}`)).toEqual([]);
    clientEinreichen(fremd.client);
    expect(await wartungen.wartungenDerBaustelle(BETRIEB, `PR-2026-0197-${L}`)).toEqual([]);
    expect(await wartungen.wartungenDerBaustelle(FREMD, `PR-2026-0197-${L}`)).toEqual([]);
  });
});
