import { describe, it, expect } from 'vitest';
import { matchProjects, EXTRACTION_SCHEMA } from '../../functions/src/extractLogic';

const projects = [
  { projectNumber: '2026-001', customerName: 'Familie Müller' },
  { projectNumber: '2026-002', customerName: 'Bäckerei Huber' },
  { projectNumber: '2025-014', customerName: 'Hotel Alpenblick' },
];

describe('matchProjects (KI-Projektzuordnung)', () => {
  it('findet ein Projekt über einen Namensteil', () => {
    const m = matchProjects('Müller', projects);
    expect(m).toHaveLength(1);
    expect(m[0].projectNumber).toBe('2026-001');
  });

  it('ist case-insensitive und tolerant gegenüber Zusätzen', () => {
    expect(matchProjects('müller', projects)).toHaveLength(1);
    expect(matchProjects('bei Familie Müller fertig', projects)[0].customerName).toBe('Familie Müller');
  });

  it('matcht auch über die Projektnummer', () => {
    expect(matchProjects('2025-014', projects)[0].customerName).toBe('Hotel Alpenblick');
  });

  it('gibt bei leerer Eingabe nichts zurück (kein Raten)', () => {
    expect(matchProjects('', projects)).toHaveLength(0);
    expect(matchProjects('   ', projects)).toHaveLength(0);
  });

  it('gibt bei unbekanntem Namen nichts zurück', () => {
    expect(matchProjects('Schmidt', projects)).toHaveLength(0);
  });

  it('liefert bei Mehrdeutigkeit alle Treffer (Mensch wählt)', () => {
    const many = [
      { projectNumber: 'A1', customerName: 'Huber Bau' },
      { projectNumber: 'A2', customerName: 'Huber Sanitär' },
    ];
    expect(matchProjects('Huber', many)).toHaveLength(2);
  });
});

describe('EXTRACTION_SCHEMA', () => {
  it('verlangt alle Zielfelder und verbietet Zusatzfelder', () => {
    expect(EXTRACTION_SCHEMA.required).toEqual([
      'summary',
      'time',
      'projectSpokenName',
      'materials',
      'followUp',
    ]);
    expect(EXTRACTION_SCHEMA.additionalProperties).toBe(false);
    expect(EXTRACTION_SCHEMA.properties.time.required).toContain('needsReview');
  });
});
