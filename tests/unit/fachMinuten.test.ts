/**
 * Fachminuten je Baustelle aus den Summen von `baustellen_stunden` — die
 * Grundlage von Budget auf der Startseite, im Filter der Baustellen und
 * seit 10.10.2026 in der Projektauswertung der Mitarbeiterübersicht.
 */
import { describe, it, expect } from 'vitest';
import { fachMinutenJeBaustelle, budgetStand } from '@/features/projects/baustellenLage';

describe('fachMinutenJeBaustelle', () => {
  const stunden = [
    { projectNumber: '2026-050', art: 'fach' as const, minuten: 510 },
    { projectNumber: 'PR-2026-050', art: 'fach' as const, minuten: 270 },
    { projectNumber: '2026-050', art: 'helfer' as const, minuten: 60 },
    { projectNumber: '2026-050', art: 'lehrling' as const, minuten: 120 },
    { projectNumber: '2026-051', art: 'fach' as const, minuten: 30 },
  ];

  it('zählt nur Fachzeit und führt beide Schreibweisen der Nummer zusammen', () => {
    expect([...fachMinutenJeBaustelle(stunden)]).toEqual([['2026-050', 780], ['2026-051', 30]]);
  });

  it('ergibt denselben Budgetstand wie bisher', () => {
    const b = budgetStand([{ projectNumber: 'PR-2026-050', estimatedHours: 26, customerName: 'Huber' }], stunden);
    expect(b.map((z) => [z.usedMin, z.pct])).toEqual([[780, 50]]);
  });
});
