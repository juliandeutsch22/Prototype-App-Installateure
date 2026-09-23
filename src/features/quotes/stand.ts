import type { Stand } from '@/components/Badge';
import type { Quote } from '@/types';

/*
  „Abgelehnt" war rot. Es ist ein ENDZUSTAND und keine Störung: der Kunde hat
  entschieden, zu tun ist nichts mehr. Rot hiesse „hier ist etwas für dich"
  und schickte jemanden auf eine Liste, an der er nichts ändern kann.

  Eigene Datei, weil Liste und Angebotsseite dieselbe Zuordnung brauchen.
*/
export const STAND: Record<Quote['status'], Stand> = {
  Entwurf: 'ruht',
  Versendet: 'laeuft',
  Angenommen: 'gut',
  Abgelehnt: 'ruht',
};
