import { useMemo } from 'react';
import { useAuth } from '@/app/AuthContext';
import { istAn, type SchalterId } from './module';

/**
 * Ist dieses Modul für den angemeldeten Betrieb eingeschaltet?
 *
 * WOFÜR ANSICHTEN DAS BRAUCHEN, obwohl Navigation und Routen schon filtern:
 * für die QUERVERWEISE. Der Einsatzplan verlinkt auf den Handwerksschein, die
 * Startseite auf die Materialanforderung, die Baustellenliste auf den Schein.
 * Ein Link auf einen abgeschalteten Bereich führt in die Meldung „ist
 * ausgeschaltet" — technisch sauber und trotzdem eine Sackgasse, die man dem
 * Benutzer erspart, indem der Link gar nicht erst dasteht.
 */
export function useModul(id: SchalterId): boolean {
  const { company } = useAuth();
  // Auch für Unterfähigkeiten (`material.lagerorte`): sie gelten nur mit ihrem Modul.
  return useMemo(() => istAn(company?.modules, id), [company, id]);
}
