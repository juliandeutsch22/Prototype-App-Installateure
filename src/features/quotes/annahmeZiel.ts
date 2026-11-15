import type { Project, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * Wohin ein angenommenes Angebot geht (A3, F6) — der Wert hinter dem
 * Baustein `AnnahmeZiel`.
 */
export interface AnnahmeZielWert {
  art: 'neu' | 'nachtrag';
  /** Die Baustelle des Nachtrags — leer bei „neu“. */
  baustelleId: string;
  projekt: WithId<Project> | null;
}

/** Was vorgewählt ist: die Baustelle, zu der das Angebot schon gehört — sonst eine neue. */
export function zielVorgabe(q: Pick<Quote, 'projectId'>): AnnahmeZielWert {
  return q.projectId ? { art: 'nachtrag', baustelleId: q.projectId, projekt: null } : { art: 'neu', baustelleId: '', projekt: null };
}

/** Lässt sich so annehmen? Ein Nachtrag braucht seine Baustelle. */
export function zielBereit(z: AnnahmeZielWert): boolean {
  return z.art === 'neu' || !!z.baustelleId;
}

