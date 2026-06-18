import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { VoiceExtractResponse } from '@/features/voice/types';

/** Ruft die serverseitige KI-Extraktion auf. API-Schlüssel bleiben im Server. */
export const callVoiceExtract = httpsCallable<
  { audioBase64: string; mimeType: string },
  VoiceExtractResponse
>(functions, 'voiceExtract');
