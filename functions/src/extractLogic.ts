/**
 * Reine, Firebase-unabhängige Logik der KI-Extraktion — separat gehalten,
 * damit sie ohne Emulator/Keys unit-testbar ist.
 */

export interface ProjectCandidate {
  projectNumber: string;
  customerName: string;
}

/** Striktes Zielschema der Extraktion (Spec §9), als Tool-Input-Schema genutzt. */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: 'Ein-Satz-Zusammenfassung des Gesagten.' },
    time: {
      type: 'object',
      additionalProperties: false,
      properties: {
        hours: { type: 'number', description: 'Gearbeitete Stunden, 0 wenn unklar.' },
        needsReview: { type: 'boolean', description: 'true, wenn unsicher.' },
      },
      required: ['hours', 'needsReview'],
    },
    projectSpokenName: {
      type: 'string',
      description: 'Genannter Baustellen-/Kundenname, "" wenn keiner genannt.',
    },
    materials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          qty: { type: 'number' },
          needsReview: { type: 'boolean' },
        },
        required: ['name', 'qty', 'needsReview'],
      },
    },
    followUp: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Folgetermin-Titel, "" wenn keiner.' },
        dueWeek: { type: 'string', description: 'z. B. "nächste Woche", "" wenn unklar.' },
      },
      required: ['title', 'dueWeek'],
    },
  },
  required: ['summary', 'time', 'projectSpokenName', 'materials', 'followUp'],
} as const;

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Findet passende Projekte zum gesprochenen Namen. Bei Mehrdeutigkeit werden
 * ALLE Treffer zurückgegeben (der Client lässt den Menschen wählen — nicht raten).
 */
export function matchProjects(spoken: string, projects: ProjectCandidate[]): ProjectCandidate[] {
  const n = norm(spoken);
  if (!n) return [];
  return projects.filter(
    (p) =>
      norm(p.customerName).includes(n) ||
      n.includes(norm(p.customerName)) ||
      norm(p.projectNumber).includes(n),
  );
}
