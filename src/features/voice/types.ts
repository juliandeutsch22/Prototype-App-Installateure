/** Antwortform der Cloud Function `voiceExtract` (siehe functions/src/extract.ts). */
export interface VoiceExtraction {
  summary: string;
  time: { hours: number; needsReview: boolean };
  projectSpokenName: string;
  materials: Array<{ name: string; qty: number; needsReview: boolean }>;
  followUp: { title: string; dueWeek: string };
}

export interface ProjectCandidate {
  projectNumber: string;
  customerName: string;
}

export interface VoiceExtractResponse {
  transcript: string;
  extraction: VoiceExtraction;
  projectMatches: ProjectCandidate[];
}
