import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — reines ESM-Skript ohne Typen
import { inventar } from '../../scripts/funktionsinventar.mjs';

/*
  KEINE FUNKTION GEHT VERLOREN (V10, 13.11.2026).

  Der Umbau auf die Designlinie V10 ändert Gestalt, nicht Umfang. Vor dem
  Umbau wurde jede Bedienstelle aus dem Quelltext erfasst
  (`docs/ui-umbau/v10-funktionsinventar-vorher.json`): Knöpfe, Verweise mit
  Ziel, Menüeinträge, Feldbeschriftungen, zugängliche Namen, Seiten- und
  Blatttitel, Routen und Weiterleitungen. Jeder dieser Einträge muss
  danach noch da sein — in derselben Datei oder an einem anderen Ort —, oder
  mit Begründung in `docs/ui-umbau/v10-entfernt.json` stehen.
*/

type Eintrag = { datei: string; art: string; text: string; ziel?: string };
type Entfernt = Eintrag & { grund: string };

const VORHER: Eintrag[] = JSON.parse(readFileSync('docs/ui-umbau/v10-funktionsinventar-vorher.json', 'utf8'));
const ENTFERNT: Entfernt[] = JSON.parse(readFileSync('docs/ui-umbau/v10-entfernt.json', 'utf8'));

/** Ohne Datei: eine Bedienstelle darf beim Umbau in einen anderen Baustein wandern. */
const kern = (e: Eintrag) => `${e.art}\u0000${e.text}\u0000${e.ziel ?? ''}`;

describe('Funktionsinventar V10', () => {
  const jetzt = new Set((inventar() as Eintrag[]).map(kern));
  const begruendet = new Set(ENTFERNT.map(kern));

  it('der Stand vor dem Umbau ist erfasst — die Prüfung hat etwas zu prüfen', () => {
    expect(VORHER.length).toBeGreaterThan(1500);
  });

  it('jede Bedienstelle von vorher ist noch da oder begründet entfernt', () => {
    const fehlt = VORHER.filter((e) => !jetzt.has(kern(e)) && !begruendet.has(kern(e)))
      .map((e) => `${e.datei}: ${e.art} „${e.text}“${e.ziel ? ` → ${e.ziel}` : ''}`);
    expect(fehlt).toEqual([]);
  });

  it('jede Entfernung nennt ihren Grund', () => {
    expect(ENTFERNT.filter((e) => !e.grund || e.grund.trim().length < 15)).toEqual([]);
  });

  it('Gegenprobe: eine fehlende Bedienstelle fiele auf', () => {
    const erfunden: Eintrag = { datei: 'x', art: 'knopf', text: 'Diesen Knopf gibt es nicht' };
    expect(jetzt.has(kern(erfunden))).toBe(false);
  });
});
