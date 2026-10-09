import { listAbwesendInRange } from '@/lib/db/vacations';
import { listAssignmentsForDate } from '@/lib/db/assignments';
import { listTermineImZeitraum } from '@/lib/db/termine';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { listProjectsByNumbers } from '@/lib/db/projects';
import { listEinsatzMaterialForDate } from '@/lib/db/einsatzMaterial';
import { lagerFrei } from '@/lib/db/materials';
import type { RuestPosition } from '@/types';
import type { ProjektKurz, TagesDaten } from './monatsVorschau';

/**
 * WOHER DIE VORSCHAU NACHLÄDT — nur bestehende Abfragen der Datenschicht.
 * Als eigene Quelle, damit die Musterseite ihre Beispieldaten zeigt, statt
 * für einen Tag ausserhalb ihres Beispielmonats den echten Betrieb zu lesen.
 */
export interface MonatsQuelle {
  /** Ein Tag ausserhalb des geladenen Monats: Einsätze, Abwesenheiten, Termine, Betriebsurlaub. */
  tag: (companyId: string, tag: string) => Promise<TagesDaten>;
  /** Baustellen, die die Seite nicht geladen hat (pausiert, abgeschlossen) — für die Adresse. */
  projekte: (companyId: string, nummern: string[]) => Promise<(ProjektKurz & { projectNumber: string })[]>;
  /** Die Rüstlisten eines Tages. */
  ruestlisten: (companyId: string, tag: string) => Promise<{ date: string; projectNumber: string; positionen?: RuestPosition[] }[]>;
  /** Das Freie der genannten Artikel im Lager (`lager_frei`), wie im Formular. */
  lager: (ids: string[]) => Promise<Map<string, { frei: number }>>;
}

export const DB_QUELLE: MonatsQuelle = {
  async tag(companyId, tag) {
    const [einsaetze, urlaube, termine, zuListe] = await Promise.all([
      listAssignmentsForDate(companyId, tag),
      listAbwesendInRange(tag, tag),
      listTermineImZeitraum(companyId, tag, tag),
      listBetriebsurlaubeImZeitraum(companyId, tag, tag),
    ]);
    const zuHeute = zuListe.filter((x) => x.von <= tag && x.bis >= tag);
    return {
      einsaetze,
      urlaube,
      termine,
      zu: zuHeute[0]?.bezeichnung ?? null,
      // Wer beim Betriebsurlaub ausgenommen ist, arbeitet — wie `zuFuer` der Seite.
      zuFuer: (uid) => zuHeute.some((x) => !(x.ausgenommen ?? []).includes(uid)),
    };
  },
  projekte: (companyId, nummern) => listProjectsByNumbers(companyId, nummern),
  ruestlisten: (companyId, tag) => listEinsatzMaterialForDate(companyId, tag),
  lager: (ids) => lagerFrei(ids),
};
