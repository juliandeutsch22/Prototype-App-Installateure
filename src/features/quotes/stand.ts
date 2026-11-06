import type { Stand } from '@/components/Badge';
import type { Quote } from '@/types';

/*
  „Abgelehnt" war rot. Es ist ein ENDZUSTAND und keine Störung: der Kunde hat
  entschieden, zu tun ist nichts mehr. Rot hiesse „hier ist etwas für dich"
  und schickte jemanden auf eine Liste, an der er nichts ändern kann.

  Eigene Datei, weil Liste und Angebotsseite dieselbe Zuordnung brauchen.
*/
export const STAND: Record<Quote['status'], Stand> = {
  Entwurf: 'offen',
  Versendet: 'laeuft',
  Angenommen: 'erledigt',
  Abgelehnt: 'storniert',
  // Ein Endzustand wie „Abgelehnt“: eine andere Fassung wurde angenommen (G15).
  Ersetzt: 'storniert',
  // Im Papierkorb (M01d): gilt nicht, bis es wiederhergestellt ist.
  Verworfen: 'storniert',
};

/**
 * Das Wort zum Stand. Nur „Verworfen“ heißt anders: in der Oberfläche liegt
 * ein verworfenes Angebot „im Papierkorb“ — das sagt, wo man es wiederfindet.
 */
export function standWort(status: Quote['status']): string {
  return status === 'Verworfen' ? 'Im Papierkorb' : status;
}
