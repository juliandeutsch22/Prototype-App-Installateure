/**
 * DIE BAUSTELLENLISTE AUS DER DATENBANK (`baustellen_liste`,
 * `baustellen_budget_lage`; Durchsicht 15.11.2026, Budget B3).
 *
 * Vorher die jüngsten 300 und alle laufenden im Browser, dort gefiltert,
 * gesucht, gruppiert und gezählt; der Budgetstand mit `budgetStand` aus
 * `baustellen_stunden`. Jetzt rechnet die Datenbank und gibt je Gruppe die
 * gezeigte Seite.
 *
 * Geprüft wird „bleibt gleich“: für jede Auswahl, jeden Filter der Startseite,
 * „Nur meine“ und die Suche dieselben Baustellen in derselben Reihenfolge wie
 * die Regeln der App (`ohneProjektleiter`, `endeVorbei`) über alle; der
 * Budgetstand wie `budgetStand`. Dazu Seite, Zahlen und Rechte.
 *
 * Gegenprobe: ohne 20261118033000 fehlen die Funktionen (rot).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { baustellenBudgetLage, baustellenListe, listRecentProjects } from '@/lib/db/pg/projects';
import { stundenDerBaustellen } from '@/lib/db/pg/timeEntries';
import { budgetStand, endeVorbei, ohneProjektleiter } from '@/features/projects/baustellenLage';
import type { Project } from '@/types';

const A = 'bstliste-a';
const B = 'bstliste-b';
const HEUTE = '2026-11-16';
let chef: Konto;
let monteur: Konto;
let fremd: Konto;

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  chef = await konto(A, 'Geschäftsführung', 'bl-chef');
  monteur = await konto(A, 'Mitarbeiter', 'bl-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'bl-fremd');
  const p = (i: number, x: Record<string, unknown> = {}) => ({
    id: randomUUID(), company_id: A, project_number: `2026-${String(i).padStart(3, '0')}`, customer_name: `Kunde ${i}`,
    status: 'Aktiv', created_at: new Date(Date.parse('2026-01-01T08:00:00Z') + i * 3_600_000).toISOString(),
    project_managers: [chef.uid], assigned_employees: [], end_date: null, estimated_hours: null, address: null, bezeichnung: null, ...x,
  });
  const zeilen = [
    ...Array.from({ length: 25 }, (_, i) => p(i)),
    p(30, { status: 'Pausiert' }),
    p(31, { status: 'Abgeschlossen' }),
    p(32, { project_managers: [], customer_name: 'Ohne Leitung' }),
    p(33, { end_date: '2026-10-01', customer_name: 'Zu spät', address: 'Hauptplatz 5' }),
    p(34, { estimated_hours: 8, customer_name: 'Über Budget', assigned_employees: [monteur.uid] }),
    p(35, { estimated_hours: 100, customer_name: 'Im Rahmen' }),
    p(36, { estimated_hours: 10, customer_name: 'Knapp', bezeichnung: 'Badsanierung 50%' }),
  ];
  const { error } = await admin.from('projects').insert(zeilen);
  if (error) throw new Error(error.message);
  const f = await admin.from('projects').insert({ ...p(99), company_id: B, project_managers: [fremd.uid], customer_name: 'Fremd' });
  if (f.error) throw new Error(f.error.message);
  const t = await admin.from('time_entries').insert([
    buchung(chef, '2026-11-02', { project_number: '2026-034', start_time: '07:00', end_time: '17:00', break_duration: 0 }),
    buchung(chef, '2026-11-03', { project_number: 'PR-2026-036', start_time: '07:00', end_time: '16:00', break_duration: 0 }),
  ]);
  if (t.error) throw new Error(t.error.message);
  clientEinreichen(chef.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

const alleZeilen = { Aktiv: 500, Pausiert: 500, Abgeschlossen: 500 };
const ms = (v: unknown) => (typeof v === 'number' ? v : Date.parse(String(v ?? 0)));

/** Die Rechnung der App bis 15.11.2026 über alle Baustellen. */
async function wieBisher(f: { status: 'offen' | 'archiv' | 'alle'; filter?: string; nummern?: string[]; meine?: string; begriff?: string }) {
  const alle = await listRecentProjects(A, 1000);
  const q = (f.begriff ?? '').toLowerCase();
  const treffer = alle.filter((p: Project) =>
    (f.filter === 'aktiv' ? p.status === 'Aktiv'
      : f.filter === 'ohne-leitung' ? ohneProjektleiter(p)
        : f.filter === 'ende-ueberschritten' ? endeVorbei(p, HEUTE)
          : f.filter === 'budget' ? (f.nummern ?? []).includes(p.projectNumber) : true)
    && (!f.meine || (p.projectManagers ?? []).includes(f.meine) || (p.assignedEmployees ?? []).includes(f.meine))
    && (f.status === 'archiv' ? p.status === 'Abgeschlossen' : f.status === 'offen' ? p.status !== 'Abgeschlossen' : true)
    && (!q || [p.customerName, p.bezeichnung, p.projectNumber, p.address].some((v) => v?.toLowerCase().includes(q))));
  return ['Aktiv', 'Pausiert', 'Abgeschlossen']
    .map((st) => treffer.filter((p) => p.status === st).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).map((p) => p.projectNumber))
    .filter((g) => g.length > 0);
}

describe('Baustellenliste aus der Datenbank', () => {
  it.each([
    { status: 'offen' as const },
    { status: 'archiv' as const },
    { status: 'alle' as const },
    { status: 'offen' as const, filter: 'aktiv' },
    { status: 'offen' as const, filter: 'ohne-leitung' },
    { status: 'offen' as const, filter: 'ende-ueberschritten' },
    { status: 'alle' as const, begriff: 'hauptplatz' },
    { status: 'alle' as const, begriff: '50%' },
    { status: 'alle' as const, begriff: '2026-03' },
  ])('bleibt gleich: %o — dieselben Baustellen in derselben Reihenfolge', async (f) => {
    const l = await baustellenListe({ heute: HEUTE, ...f, anzahl: alleZeilen });
    expect(l.gruppen.map((g) => g.zeilen.map((p) => p.projectNumber))).toEqual(await wieBisher(f));
  });

  it('bleibt gleich: „Nur meine“ — Leitung oder Team', async () => {
    clientEinreichen(monteur.client);
    const l = await baustellenListe({ heute: HEUTE, status: 'alle', meine: true, anzahl: alleZeilen });
    expect(l.gruppen.map((g) => g.zeilen.map((p) => p.projectNumber))).toEqual(await wieBisher({ status: 'alle', meine: monteur.uid }));
    clientEinreichen(chef.client);
  });

  it('gibt je Gruppe nur die Seite — Zahl, Schriftfeld und Gesamtzahl über alle', async () => {
    const l = await baustellenListe({ heute: HEUTE, status: 'alle', anzahl: { Aktiv: 20 } });
    const aktiv = l.gruppen.find((g) => g.status === 'Aktiv')!;
    expect(aktiv.zeilen).toHaveLength(20);
    expect(aktiv.anzahl).toBe(30);
    expect(l.aktiv).toBe(30);
    expect(l.ende).toBe(1);
    expect(l.gesamt).toBe(32);
    expect(l.neuesteNummern[0]).toBe('2026-036');
  });

  it('bleibt gleich: der Budgetstand wie `budgetStand` aus den Stunden der Baustellen', async () => {
    const alle = await listRecentProjects(A, 1000);
    const mitBudget = alle.filter((p) => p.status === 'Aktiv' && (p.estimatedHours ?? 0) > 0);
    const b = budgetStand(mitBudget, await stundenDerBaustellen(mitBudget.map((p) => p.projectNumber)));
    const lage = await baustellenBudgetLage(90);
    expect(lage).toEqual({
      ueber: b.filter((x) => x.pct > 100).length,
      nah: b.filter((x) => x.pct >= 90 && x.pct <= 100).length,
      nummern: b.filter((x) => x.pct >= 90).map((x) => x.projectNumber).sort(),
    });
    expect(lage).toEqual({ ueber: 1, nah: 1, nummern: ['2026-034', '2026-036'] });
    // Der Filter „Budget“ nimmt genau diese Nummern.
    const l = await baustellenListe({ heute: HEUTE, status: 'offen', filter: 'budget', nummern: lage.nummern, anzahl: alleZeilen });
    expect(l.gruppen.flatMap((g) => g.zeilen.map((p) => p.projectNumber))).toEqual(['2026-036', '2026-034']);
  });

  it('Rechte: der fremde Betrieb sieht nur seine; den Budgetstand nur die Leitung', async () => {
    clientEinreichen(fremd.client);
    const b = await baustellenListe({ heute: HEUTE, status: 'alle', anzahl: alleZeilen });
    expect(b.gruppen.flatMap((g) => g.zeilen.map((p) => p.customerName))).toEqual(['Fremd']);
    clientEinreichen(monteur.client);
    await expect(baustellenBudgetLage(90)).rejects.toThrow(/nur die Leitung/);
    clientEinreichen(chef.client);
    await expect(baustellenListe({ heute: HEUTE, status: 'irgendwas' as 'alle', anzahl: {} })).rejects.toThrow(/Unbekannte Angabe/);
  });
});
