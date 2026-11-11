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
import { gruppeVon, navForRole, navGroupsForRole, tabBarForRole, NAV_GROUPS } from '@/app/navigation';

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

/*
  SEIT DEM UMBAU DAZUGEKOMMEN, jeder Punkt mit seinem Paket und schaltbar:
  ohne ihn gilt die Liste von damals unverändert. Bewusst nachgezogen —
  was neu ist, steht unten als eigener Fall.
*/
const OHNE_NEUE = { 'baustellen.auftragseingang': false, nachrichten: false };
/**
 * Der Auftragseingang (M02b) — für jede Rolle, die Kunden liest; die
 * Nachrichten (M10/B09) für jede Rolle.
 */
const NEU: Record<Role, string[]> = {
  Mitarbeiter: ['/nachrichten'],
  Verwaltung: ['/eingaenge', '/nachrichten'],
  Buchhaltung: ['/eingaenge', '/nachrichten'],
  Projektleiter: ['/eingaenge', '/nachrichten'],
  Geschäftsführung: ['/eingaenge', '/nachrichten'],
  Administrator: ['/eingaenge', '/nachrichten'],
};

describe('Je Rolle exakt die bisherigen Menüpunkte', () => {
  it.each(ROLLEN)('%s', (rolle) => {
    expect(sortiert(navForRole(rolle, OHNE_NEUE).map((i) => i.path))).toEqual(sortiert(VORHER[rolle]));
    // Die Gruppen verteilen dieselben Punkte — keiner doppelt, keiner verloren.
    const gruppiert = navGroupsForRole(rolle, OHNE_NEUE).flatMap((g) => g.items.map((i) => i.path));
    expect(sortiert(gruppiert)).toEqual(sortiert(VORHER[rolle]));
  });

  it.each(ROLLEN)('%s: mit den Standards kommen genau Auftragseingang (M02b) und Nachrichten (M10) dazu', (rolle) => {
    expect(sortiert(navForRole(rolle).map((i) => i.path))).toEqual(sortiert([...VORHER[rolle], ...NEU[rolle]]));
    const gruppiert = navGroupsForRole(rolle).flatMap((g) => g.items.map((i) => i.path));
    expect(sortiert(gruppiert)).toEqual(sortiert([...VORHER[rolle], ...NEU[rolle]]));
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

  /*
    E78 (11.11.2026): „Menüpunkt Nachrichten direkt unter Start“. Für jede
    Rolle die zweite Zeile der Seitenleiste, ohne Überschrift; ohne das Modul
    steht Start allein. Gegenprobe: mit dem Stand davor stand er unter
    „Team“ — rot.
  */
  it.each(ROLLEN)('%s: Nachrichten direkt unter Start, ohne Modul nur Start', (rolle) => {
    expect(navGroupsForRole(rolle)[0]).toMatchObject({ group: 'Start' });
    expect(navGroupsForRole(rolle)[0].items.map((i) => i.path)).toEqual(['/', '/nachrichten']);
    expect(navGroupsForRole(rolle, { nachrichten: false })[0].items.map((i) => i.path)).toEqual(['/']);
    expect(navGroupsForRole(rolle).flatMap((g) => g.items).filter((i) => i.path === '/nachrichten')).toHaveLength(1);
  });

  it('gleich geblieben: der Kopf der Nachrichten trägt weiter die Ortszeile „Team“, die Startseite keine aus dem Menü', () => {
    expect(gruppeVon('/nachrichten')).toBe('Team');
    expect(gruppeVon('/nachrichten/k1')).toBe('Team');
    expect(gruppeVon('/')).toBeNull();
    expect(gruppeVon('/time')).toBe('Team');
  });

  it('ordnen das Häufige nach oben: Baustellen und Planung zuerst', () => {
    const auftraege = navGroupsForRole('Geschäftsführung').find((g) => g.group === 'Aufträge')!;
    expect(auftraege.items.slice(0, 2).map((i) => i.path)).toEqual(['/admin-projects', '/assignments']);
  });

  it('der Monteur findet seine Arbeit unter „Aufträge“, Zeit und Urlaub unter „Team“', () => {
    const m = navGroupsForRole('Mitarbeiter');
    const von = (g: string) => m.find((x) => x.group === g)?.items.map((i) => i.path);
    expect(von('Aufträge')).toEqual(['/my-schedule', '/my-projects', '/worksheets']);
    // Die Nachrichten (M10/B09) seit E78 direkt unter Start, ohne Überschrift.
    expect(von('Start')).toEqual(['/', '/nachrichten']);
    expect(von('Team')).toEqual(['/time', '/vacations']);
    expect(von('Material')).toEqual(['/material']);
  });
});

describe('Untere Leiste am Handy', () => {
  it.each(ROLLEN)('%s: vier Ziele und „Mehr“ mit dem Rest — zusammen alles', (rolle) => {
    const { unten, mehr } = tabBarForRole(rolle);
    expect(unten.length).toBeLessThanOrEqual(4);
    expect(sortiert([...unten, ...mehr].map((i) => i.path))).toEqual(sortiert([...VORHER[rolle], ...NEU[rolle]]));
    // Die vier unten bleiben dieselben: Auftragseingang und Nachrichten stehen unter „Mehr“.
    expect(tabBarForRole(rolle).unten.map((i) => i.path)).toEqual(tabBarForRole(rolle, OHNE_NEUE).unten.map((i) => i.path));
  });
});

/*
  DIE LIEGENSCHAFTEN (M02c) sind „Optional“ und ab Werk aus: mit den
  Standards bleibt jede Navigation, wie sie oben steht. Eingeschaltet kommt
  ihr Eintrag für jede Rolle dazu, die Kunden liest — unter „Mehr“, die vier
  Ziele unten bleiben.
*/
describe('Liegenschaften eingeschaltet (M02c)', () => {
  const AN = { 'kunden.liegenschaften': true };
  it.each(ROLLEN)('%s', (rolle) => {
    const neu = rolle === 'Mitarbeiter' ? [] : ['/liegenschaften'];
    expect(sortiert(navForRole(rolle, AN).map((i) => i.path))).toEqual(sortiert([...VORHER[rolle], ...NEU[rolle], ...neu]));
    expect(tabBarForRole(rolle, AN).unten.map((i) => i.path)).toEqual(tabBarForRole(rolle).unten.map((i) => i.path));
  });
});
