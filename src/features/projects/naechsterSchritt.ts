import type { Role } from '@/types';
import type { MeldungAktion } from '@/components/Toast';
import { canAccess } from '@/app/navigation';
import { todayStr } from '@/lib/time';
import { ZIEL } from '@/features/dashboard/start/ziele';

/**
 * DER NÄCHSTE SCHRITT IN DER MELDUNG (Durchsicht 15.11.2026, V4).
 *
 * Nach der Annahme meldete die Liste „Baustelle … angelegt“ ohne Sprung;
 * nach „Baustelle anlegen“ aus der Wartung hieß es „Jetzt im Einsatzplan
 * einteilen“, ohne hinzuführen. Jetzt trägt die Meldung den Weg: „Einsatz
 * planen“ öffnet die Tagesplanung mit dieser Baustelle — wie die Hauptaktion
 * der Baustellenakte. Ohne Einsatzplanung (Modul oder Rolle) führt sie zur
 * Baustelle.
 */
export function naechsterSchritt(
  rolle: Role,
  module: Record<string, boolean> | undefined,
  projectNumber: string,
  navigate: (ziel: string, optionen?: { state?: unknown }) => void,
): MeldungAktion | undefined {
  if (canAccess(rolle, '/assignments', module)) {
    return {
      label: 'Einsatz planen',
      onClick: () => navigate('/assignments/tag', { state: { datum: todayStr(), projectNumber } }),
    };
  }
  if (canAccess(rolle, '/admin-projects', module)) {
    return { label: 'Zur Baustelle', onClick: () => navigate(ZIEL.baustelle(projectNumber)) };
  }
  return undefined;
}
