import type { WorkSheet } from '@/types';

/**
 * Trägt der Schein eine Unterschrift ohne Bild? So kommt er aus einer Liste
 * (`LISTENSPALTEN` in `lib/db/pg/workSheets.ts`); für das PDF braucht es den
 * ganzen Schein (`getWorkSheet`).
 *
 * Eigene Datei, nicht im PDF-Modul: die Liste fragt es vor jedem Druck, ohne
 * dafür das PDF-Modul zu brauchen.
 */
export function unterschriftOhneBild(schein: Pick<WorkSheet, 'unterschriften'>): boolean {
  const u = schein.unterschriften;
  return [u?.monteur, u?.kunde].some((sig) => !!sig && !sig.bild);
}
