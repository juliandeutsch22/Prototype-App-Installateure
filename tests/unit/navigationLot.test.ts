/**
 * Die Navigation der Linie „Lot“ (Protokoll Abschnitt 5): neue Gruppen,
 * aber JE ROLLE EXAKT DIESELBEN MENÜPUNKTE wie vor dem Umbau.
 *
 * Die Listen unten sind der Stand vor dem Umbau (Commit 4abb9ca), von Hand
 * festgehalten. Eine Rolle, die einen Punkt verliert oder dazugewinnt, fällt
 * hier auf — auch wenn die Umgruppierung sonst alles richtig macht.
 */
import { describe, it, expect } from 'vitest';
import type { Role } from '@/types';
import { navForRole, navGroupsForRole, tabBarForRole, NAV_GROUPS } from '@/app/navigation';

const VORHER: Record<Role, string[]> = {
  Mitarbeiter: ['/', '/time', '/material', '/my-schedule', '/my-projects', '/vacations', '/worksheets', '/settings'],
  Verwaltung: ['/', '/time', '/material', '/vacations', '/worksheets', '/customers', '/wartungen', '/anforderungen', '/lager', '/settings'],
  Buchhaltung: ['/', '/time', '/vacations', '/worksheets', '/quotes', '/customers', '/settings', '/invoices', '/accounting'],
  Projektleiter: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/settings'],
  Geschäftsführung: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/user-mgmt', '/settings', '/costing', '/invoices', '/accounting'],
  Administrator: ['/', '/time', '/material', '/vacations', '/worksheets', '/quotes', '/customers', '/wartungen', '/anforderungen', '/lager', '/admin-projects', '/assignments', '/user-mgmt', '/settings', '/costing', '/invoices', '/accounting'],
};

const ROLLEN = Object.keys(VORHER) as Role[];
const sortiert = (a: string[]) => [...a].sort();

describe('Je Rolle exakt die bisherigen Menüpunkte', () => {
  it.each(ROLLEN)('%s', (rolle) => {
    expect(sortiert(navForRole(rolle).map((i) => i.path))).toEqual(sortiert(VORHER[rolle]));
    // Die Gruppen verteilen dieselben Punkte — keiner doppelt, keiner verloren.
    const gruppiert = navGroupsForRole(rolle).flatMap((g) => g.items.map((i) => i.path));
    expect(sortiert(gruppiert)).toEqual(sortiert(VORHER[rolle]));
  });

  it('die Zusatzrechte wirken wie vorher', () => {
    const pl = navForRole('Projektleiter', undefined, { rechnungenLesen: true, projektleitungImEinsatzplan: true });
    expect(pl.map((i) => i.path)).toEqual(expect.arrayContaining(['/invoices', '/my-schedule']));
    // Gegenprobe: ohne sie nicht.
    const ohne = navForRole('Projektleiter').map((i) => i.path);
    expect(ohne).not.toContain('/invoices');
    expect(ohne).not.toContain('/my-schedule');
  });

  it('abgeschaltete Module bleiben abgeschaltet', () => {
    const ohneMaterial = navForRole('Geschäftsführung', { material: false }).map((i) => i.path);
    expect(ohneMaterial).not.toContain('/anforderungen');
    expect(ohneMaterial).not.toContain('/lager');
  });
});

describe('Die Gruppen der Linie', () => {
  it('stehen in der Reihenfolge des Entwurfs, Einstellungen am Ende', () => {
    expect([...NAV_GROUPS]).toEqual(['Start', 'Aufträge', 'Geld', 'Team', 'Material', 'Einstellungen']);
    const gf = navGroupsForRole('Geschäftsführung');
    expect(gf.map((g) => g.group)).toEqual(['Start', 'Aufträge', 'Geld', 'Team', 'Material', 'Einstellungen']);
  });

  it('ordnen das Häufige nach oben: Baustellen und Planung zuerst', () => {
    const auftraege = navGroupsForRole('Geschäftsführung').find((g) => g.group === 'Aufträge')!;
    expect(auftraege.items.slice(0, 2).map((i) => i.path)).toEqual(['/admin-projects', '/assignments']);
  });

  it('der Monteur findet seine Arbeit unter „Aufträge“, Zeit und Urlaub unter „Team“', () => {
    const m = navGroupsForRole('Mitarbeiter');
    const von = (g: string) => m.find((x) => x.group === g)?.items.map((i) => i.path);
    expect(von('Aufträge')).toEqual(['/my-schedule', '/my-projects', '/worksheets']);
    expect(von('Team')).toEqual(['/time', '/vacations']);
    expect(von('Material')).toEqual(['/material']);
  });
});

describe('Untere Leiste am Handy', () => {
  it.each(ROLLEN)('%s: vier Ziele und „Mehr“ mit dem Rest — zusammen alles', (rolle) => {
    const { unten, mehr } = tabBarForRole(rolle);
    expect(unten.length).toBeLessThanOrEqual(4);
    expect(sortiert([...unten, ...mehr].map((i) => i.path))).toEqual(sortiert(VORHER[rolle]));
  });
});
