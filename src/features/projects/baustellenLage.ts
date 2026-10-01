import type { Project, TimeEntry } from '@/types';
import { calcBudgetState, groupProjectHours, localDateStr, normProjectNumber } from '@/lib/time';
import { baustellenTitel } from '@/lib/baustellenTitel';

/**
 * Wie es um eine Baustelle steht — für die Startseite und die Filter der
 * Baustellenliste (Nachtest 01.10.2026, Paket B), an einer Stelle, damit
 * beide dieselben Baustellen meinen.
 */

/** Ab wann eine Baustelle „am Budgetlimit“ steht — die Auswertung warnt schon ab 80 %. */
export const BUDGET_AB_PROZENT = 90;

export interface BudgetZeile {
  projectNumber: string;
  titel: string;
  pct: number;
  usedMin: number;
  estimatedHours: number;
}

/** Verbrauch je Baustelle mit Budget — Fachstunden wie in der Auswertung. */
export function budgetStand(
  projekte: Pick<Project, 'projectNumber' | 'estimatedHours' | 'customerName' | 'bezeichnung'>[],
  eintraege: TimeEntry[],
): BudgetZeile[] {
  const stunden = groupProjectHours(eintraege);
  return projekte
    .filter((pr) => (pr.estimatedHours ?? 0) > 0)
    .map((pr) => {
      const h = stunden.find((x) => x.projectNumber === normProjectNumber(pr.projectNumber));
      const fachMin = h?.fachMin ?? 0;
      return {
        projectNumber: pr.projectNumber,
        titel: baustellenTitel(pr),
        pct: calcBudgetState(fachMin, pr.estimatedHours).pct ?? 0,
        usedMin: fachMin,
        estimatedHours: pr.estimatedHours ?? 0,
      };
    });
}

export const OHNE_EINSATZ_TAGE = 14;

/** Wie weit für „zuletzt eingeplant“ zurückgeschaut wird. */
export const ZULETZT_TAGE = 90;

export function planFenster(heute: string): { von: string; bis: string } {
  const d = (n: number) => {
    const t = new Date(`${heute}T00:00:00`);
    t.setDate(t.getDate() + n);
    return localDateStr(t);
  };
  return { von: d(-ZULETZT_TAGE), bis: d(OHNE_EINSATZ_TAGE) };
}

/**
 * Aktive Baustellen ohne Einsatz in den nächsten 14 Tagen.
 *
 * Nicht dabei: pausierte, solche, deren Beginn erst danach liegt, und
 * solche, deren Ende schon vorbei ist (die stehen unter „Ende überschritten“).
 */
export function ohneEinsatzListe(
  projekte: Pick<Project, 'projectNumber' | 'status' | 'startDate' | 'endDate'>[],
  einsaetze: { projectNumber: string; date: string }[],
  heute: string,
): { projectNumber: string; zuletzt?: string }[] {
  const { bis } = planFenster(heute);
  const kommend = new Set(einsaetze.filter((e) => e.date >= heute && e.date <= bis).map((e) => e.projectNumber));
  const zuletzt = new Map<string, string>();
  for (const e of einsaetze) {
    if (e.date >= heute) continue;
    const alt = zuletzt.get(e.projectNumber);
    if (!alt || e.date > alt) zuletzt.set(e.projectNumber, e.date);
  }
  return projekte
    .filter((p) => p.status === 'Aktiv'
      && !kommend.has(p.projectNumber)
      && !(p.startDate && p.startDate > bis)
      && !(p.endDate && p.endDate < heute))
    .map((p) => ({ projectNumber: p.projectNumber, zuletzt: zuletzt.get(p.projectNumber) }));
}

export function ohneProjektleiter(p: Pick<Project, 'status' | 'projectManagers'>): boolean {
  return p.status === 'Aktiv' && !(p.projectManagers?.length);
}

export function endeVorbei(p: Pick<Project, 'status' | 'endDate'>, heute: string): boolean {
  return p.status === 'Aktiv' && !!p.endDate && p.endDate < heute;
}
