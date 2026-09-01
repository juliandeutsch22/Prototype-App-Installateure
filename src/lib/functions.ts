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
