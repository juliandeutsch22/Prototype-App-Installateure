/**
 * UNVERRECHNETE STUNDEN DER REGIEBAUSTELLEN (23.10.2026).
 *
 * „Nicht verrechnet“ kannte nur Scheine. `unverrechnete_stunden` gibt je
 * Regiebaustelle die Summe und den Zeitraum der gebuchten, noch nicht
 * verrechneten Arbeitsminuten — keine Personen, kein Zeitkonto.
 *
 * Gegenprobe: dieselbe Baustelle als Pauschale und eine verrechnete Buchung
 * zählen nicht; wer keine Rechnungen schreibt, bekommt einen Fehler.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as zeiten from '@/lib/db/pg/timeEntries';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'ustd-a';
const B = 'ustd-b';

let buch: Konto;
let gf: Konto;
let pl: Konto;
let max: Konto;
let fremd: Konto;

async function buche(betrieb: string, k: Konto, datum: string, rest: Record<string, unknown>) {
  const { error } = await admin.from('time_entries').insert({
    id: crypto.randomUUID(), company_id: betrieb, user_id: k.uid, user_name: 'Max',
    date: datum, status: 'Anwesend', start_time: '07:00', end_time: '16:00', break_duration: 30,
    ...rest,
  });
  if (error) throw new Error(error.message);
}

async function baustelle(betrieb: string, nummer: string, kunde: string, billing_mode: string | null) {
  const { error } = await admin.from('projects').insert({
    company_id: betrieb, project_number: nummer, customer_name: kunde, status: 'Aktiv', billing_mode,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  buch = await konto(A, 'Buchhaltung', 'ustdbuch');
  gf = await konto(A, 'Geschäftsführung', 'ustdgf');
  pl = await konto(A, 'Projektleiter', 'ustdpl');
  max = await konto(A, 'Mitarbeiter', 'ustdmax');
  fremd = await konto(B, 'Mitarbeiter', 'ustdfremd');

  await baustelle(A, 'PR-2026-060', 'Familie Huber', 'Regie');
  await baustelle(A, '2026-061', 'Ohne Modus', null);
  await baustelle(A, '2026-062', 'Pauschal GmbH', 'Pauschal');
  await baustelle(A, '2026-063', 'Einheit KG', 'Einheitspreis');
  await baustelle(B, '2026-060', 'Fremder Kunde', 'Regie');

  // 2026-060, in beiden Schreibweisen gebucht: 510 + 270 offen, 510 verrechnet.
  await buche(A, max, '2026-04-01', { project_number: 'PR-2026-060' });
  await buche(A, max, '2026-04-08', { project_number: '2026-060', end_time: '12:00' });
  await buche(A, max, '2026-03-20', { project_number: '2026-060', is_billed: true, invoice_number: 'RE-1' });
  // Zählt nicht: Urlaub, Buchung ohne Arbeitszeit.
  await buche(A, max, '2026-03-01', { project_number: '2026-060', status: 'Urlaub' });
  await buche(A, max, '2026-03-02', { project_number: '2026-060', start_time: null, end_time: null, break_duration: 0 });
  // Ohne Abrechnungsart gilt Regie (wie in der App).
  await buche(A, max, '2026-05-04', { project_number: '2026-061', end_time: '08:00', break_duration: 0 });
  // Pauschale und Einheitspreis rechnen nach dem Angebot ab.
  await buche(A, max, '2026-02-02', { project_number: '2026-062' });
  await buche(A, max, '2026-02-03', { project_number: '2026-063' });
  // Eine Buchung ohne Baustelle in der Kartei lässt sich nicht verrechnen.
  await buche(A, max, '2026-02-04', { project_number: '2026-999' });
  // Fremder Betrieb.
  await buche(B, fremd, '2026-01-05', { project_number: '2026-060' });
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('unverrechnete_stunden', () => {
  it('gibt je Regiebaustelle Summe und Zeitraum des Offenen — älteste zuerst', async () => {
    clientEinreichen(buch.client);
    expect(await zeiten.unverrechneteStunden()).toEqual([
      { projectNumber: 'PR-2026-060', kunde: 'Familie Huber', minuten: 780, aeltester: '2026-04-01', juengster: '2026-04-08' },
      { projectNumber: '2026-061', kunde: 'Ohne Modus', minuten: 60, aeltester: '2026-05-04', juengster: '2026-05-04' },
    ]);
  });

  it('auch die Geschäftsführung bekommt sie, seitenweise dasselbe', async () => {
    clientEinreichen(gf.client);
    const ganz = await zeiten.unverrechneteStunden();
    expect(await zeiten.unverrechneteStunden(1)).toEqual(ganz);
    expect(ganz).toHaveLength(2);
  });

  it('nach dem Verrechnen fällt die Baustelle heraus', async () => {
    await admin.from('time_entries').update({ is_billed: true, invoice_number: 'RE-2' })
      .eq('company_id', A).eq('project_number', '2026-061');
    clientEinreichen(buch.client);
    expect((await zeiten.unverrechneteStunden()).map((z) => z.projectNumber)).toEqual(['PR-2026-060']);
  });

  it('Projektleitung und Monteur bekommen einen Fehler, keine leere Liste', async () => {
    for (const k of [pl, max]) {
      clientEinreichen(k.client);
      await expect(zeiten.unverrechneteStunden()).rejects.toThrow(/nur, wer Rechnungen schreibt/);
    }
  });
});

/*
  LEHRLINGSSTUNDEN ZUM SATZ 0 (24.10.2026). Die Rechnung lässt sie ohne
  Zeile aus; „Nicht verrechnet“ zählte sie trotzdem, und eine Baustelle mit
  nur solchen Stunden stand dort für immer. Geprüft wird gegen die Regel der
  App selbst (`satzklasse`, `verrechnungssatz`), nicht gegen eine Abschrift.
*/
describe('unverrechnete_stunden — Lehrlingsstunden zum Satz 0', () => {
  const FAELLE: Array<{ satz: string | null; helfer: boolean }> = [
    { satz: 'lj1', helfer: false }, { satz: 'lj2', helfer: false }, { satz: 'lj3', helfer: false },
    { satz: 'lj4', helfer: false }, { satz: 'lj1', helfer: true }, { satz: 'facharbeiter', helfer: false },
    { satz: 'obermonteur', helfer: false }, { satz: 'helfer', helfer: false }, { satz: null, helfer: false },
  ];
  const SAETZE: Array<Record<string, unknown> | null> = [
    { fach: 70, helper: 40, stufen: { lj1: 0, lj2: 30 } },
    { fach: 70, helper: 0 },
    { fach: 70, helper: 0, stufen: { lj3: 25 } },
    null,
  ];

  it('lässt genau die Stunden weg, die auch die Rechnung auslässt — bei jedem Satz und jeder Satzklasse', async () => {
    const { INVOICE_DEFAULTS } = await import('@/features/invoices/assemble');
    const { satzklasse, verrechnungssatz, istLehrlingssatz } = await import('@/lib/einstufung');
    for (const [i, rates] of SAETZE.entries()) {
      const C = `ustd-satz-${i}`;
      await betriebAnlegen(C);
      await admin.from('companies').update({ rates }).eq('id', C);
      const chef = await konto(C, 'Buchhaltung', `ustdsatz${i}`);
      const monteur = await konto(C, 'Mitarbeiter', `ustdsatzm${i}`);
      for (const [j, f] of FAELLE.entries()) {
        const nr = `S-${i}-${j}`;
        await admin.from('projects').insert({ company_id: C, project_number: nr, customer_name: nr, status: 'Aktiv' });
        const { error } = await admin.from('time_entries').insert({
          id: crypto.randomUUID(), company_id: C, user_id: monteur.uid, user_name: 'Lehrling',
          date: '2026-04-01', status: 'Anwesend', start_time: '07:00', end_time: '08:00', break_duration: 0,
          project_number: nr, satz: f.satz, is_helper: f.helfer,
        });
        if (error) throw new Error(error.message);
      }
      clientEinreichen(chef.client);
      const da = new Set((await zeiten.unverrechneteStunden()).map((z) => z.projectNumber));
      for (const [j, f] of FAELLE.entries()) {
        const k = satzklasse({ satz: f.satz as never, isHelper: f.helfer });
        const auslassen = istLehrlingssatz(k)
          && verrechnungssatz(k, { ...INVOICE_DEFAULTS, ...(rates ?? {}) } as never) === 0;
        expect([i, j, da.has(`S-${i}-${j}`)]).toEqual([i, j, !auslassen]);
      }
    }
  });
});
