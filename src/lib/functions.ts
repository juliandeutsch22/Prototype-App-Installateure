import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { VoiceExtractResponse } from '@/features/voice/types';

/** Ruft die serverseitige KI-Extraktion auf. API-Schlüssel bleiben im Server. */
export const callVoiceExtract = httpsCallable<
  { audioBase64: string; mimeType: string },
  VoiceExtractResponse
>(functions, 'voiceExtract');

/**
 * Baut die Monatsbilanzen eines Mandanten neu auf.
 *
 * Einmalig anzustoßen — danach hält der Trigger sie aktuell und ein
 * nächtlicher Lauf heilt Abweichungen. Erst nach diesem Aufbau benutzt das
 * Zeitkonto die Bilanzen; vorher rechnet es weiter direkt aus den Buchungen.
 */
export const callBilanzenNeuAufbauen = httpsCallable<
  Record<string, never>,
  { mitarbeiter: number; bilanzen: number }
>(functions, 'bilanzenNeuAufbauen');

/**
 * Stellt die Positionen fuer einen Handwerksschein zusammen.
 *
 * Serverseitig, weil der Schein die Stunden der GANZEN Mannschaft eines Tages
 * braucht — ein Monteur darf die Zeiteintraege seiner Kollegen aber nicht
 * lesen (Kranken- und Urlaubstage sind Gesundheitsdaten nach Art. 9 DSGVO).
 * Die Function gibt nur Anwesenheitszeiten EINER Baustelle an EINEM Tag
 * zurueck; die Datenschutzgrenze bleibt, wo sie ist.
 */
export const callScheinVorbereiten = httpsCallable<
  { projectNumber: string; datum: string },
  {
    zeiten: Array<{
      datum: string;
      mitarbeiter: string;
      von?: string;
      bis?: string;
      pauseMin?: number;
      minuten: number;
      taetigkeit?: string;
      helfer?: boolean;
    }>;
    material: Array<{ name: string; menge: number }>;
  }
>(functions, 'scheinVorbereiten');
