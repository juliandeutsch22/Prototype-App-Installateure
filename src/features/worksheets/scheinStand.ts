import type { Stand } from '@/components/Badge';
import type { WorkSheet } from '@/types';

/**
 * Der Zustand eines Handwerksscheins als Punkt und Wort — eine Stelle für die
 * Scheinliste und die Baustellenakte, damit derselbe Schein überall gleich
 * aussieht.
 */
export const SCHEIN_STAND: Record<WorkSheet['status'], Stand> = {
  // Unterschrieben ist der Schein fertig — das Zeichen mit Haken (Planlinie B3).
  Unterschrieben: 'erledigt',
  Entwurf: 'offen',
  // Kein Rot: weder der Storno noch der aufgegebene Entwurf ist ein
  // Zwischenfall. Der eine ist die vorgesehene Korrektur, der andere der
  // Normalfall eines geplatzten Auftrags — beide sind abgeschlossen.
  Storniert: 'storniert',
  Verworfen: 'storniert',
};
