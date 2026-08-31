import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_SCHEMA, matchProjects, type ProjectCandidate } from './extractLogic.js';

/**
 * KI-Magic-Moment (Spec §9): Audio -> Transkription -> strukturierte Extraktion.
 *
 * - Transkription UND Extraktion laufen serverseitig. API-Schlüssel nie im
 *   Frontend (Spec §9, §11).
 * - Gibt strukturiertes JSON gegen ein festes Schema zurück; unsichere Felder
 *   sind als `needsReview` markiert (nicht still geraten).
 * - Schreibt NICHTS nach Firestore — die Bestätigung erfolgt im Client.
 * - Audio wird NICHT dauerhaft gespeichert (DSGVO, Spec §10).
 */

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const TRANSCRIPTION_API_KEY = defineSecret('TRANSCRIPTION_API_KEY');

const TRANSCRIPTION_URL =
  process.env.TRANSCRIPTION_URL ?? 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL ?? 'whisper-1';

interface ExtractRequest {
  audioBase64: string;
  mimeType: string;
}

async function transcribe(audioBase64: string, mimeType: string): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64');
  const blob = new Blob([buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `audio.${mimeType.split('/')[1] ?? 'webm'}`);
  form.append('model', TRANSCRIPTION_MODEL);
  form.append('language', 'de');

  const res = await fetch(TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TRANSCRIPTION_API_KEY.value()}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error('Transkription fehlgeschlagen', { status: res.status, text });
    throw new HttpsError('internal', 'Transkription fehlgeschlagen.');
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? '';
}

/** Lädt aktive Projekte des Mandanten für das Namens-Matching. */
async function loadProjects(companyId: string): Promise<ProjectCandidate[]> {
  const snap = await getFirestore()
    .collection('projects')
    .where('companyId', '==', companyId)
    .get();
  return snap.docs
    .map((d) => d.data() as { projectNumber?: string; customerName?: string; status?: string })
    .filter((p) => p.status === 'Aktiv' || p.status === 'Pausiert')
    .map((p) => ({ projectNumber: p.projectNumber ?? '', customerName: p.customerName ?? '' }));
}

export const voiceExtract = onCall(
  {
    region: 'europe-west3',
    secrets: [ANTHROPIC_API_KEY, TRANSCRIPTION_API_KEY],
    memory: '512MiB',
    timeoutSeconds: 120,
    // Härteste Kostenbremse der App: jeder Aufruf kostet Geld bei einem
    // externen Anbieter. Fünf gleichzeitige Aufnahmen decken einen Betrieb
    // dieser Größe ab; alles darüber wartet, statt die Rechnung zu treiben.
    maxInstances: 5,
  },
  async (request) => {
    // Auth + Mandant aus dem Token (nie aus Client-Eingabe).
    if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.');
    const companyId = request.auth.token.companyId as string | undefined;
    if (!companyId) throw new HttpsError('permission-denied', 'Kein Mandantenkontext.');

    const { audioBase64, mimeType } = (request.data ?? {}) as Partial<ExtractRequest>;
    if (!audioBase64 || !mimeType) {
      throw new HttpsError('invalid-argument', 'audioBase64 und mimeType erforderlich.');
    }

    // 1) Transkription (serverseitig)
    const transcript = await transcribe(audioBase64, mimeType);
    if (!transcript.trim()) {
      throw new HttpsError('internal', 'Keine Sprache erkannt. Bitte erneut versuchen.');
    }

    // 2) Strukturierte Extraktion via Claude (striktes JSON-Schema)
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const projects = await loadProjects(companyId);
    const projectList = projects.map((p) => `- ${p.customerName} (${p.projectNumber})`).join('\n');

    const system = [
      'Du extrahierst aus dem Werkstatt-/Baustellen-Sprachprotokoll eines österreichischen',
      'Installateurs strukturierte Felder. Sprache: deutsch, oft steirischer Dialekt,',
      'Fachjargon (Flachdichtung, Therme, Etagenheizung). Rate NICHTS: wenn ein Wert',
      'unsicher ist, setze needsReview=true. Wenn keine Stunden genannt sind, hours=0 und',
      'needsReview=true. Gib ausschließlich strukturierte Daten gemäß Schema zurück.',
    ].join(' ');

    const userText = projectList
      ? `Bekannte Baustellen der Firma:\n${projectList}\n\nGesprochenes Protokoll:\n"${transcript}"`
      : `Gesprochenes Protokoll:\n"${transcript}"`;

    // Erzwungener Tool-Use als Mechanismus für striktes, schema-validiertes JSON
    // (versionsunabhängig, ohne output_config). Das Tool-Input IST die Extraktion.
    let extraction: unknown;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        system,
        tools: [
          {
            name: 'record_extraction',
            description: 'Erfasst die strukturierten Felder aus dem Protokoll.',
            input_schema: EXTRACTION_SCHEMA as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'record_extraction' },
        messages: [{ role: 'user', content: userText }],
      });
      const toolBlock = msg.content.find((b) => b.type === 'tool_use');
      extraction = toolBlock && toolBlock.type === 'tool_use' ? toolBlock.input : null;
    } catch (err) {
      logger.error('KI-Extraktion fehlgeschlagen', { err });
      throw new HttpsError('internal', 'KI-Extraktion fehlgeschlagen.');
    }

    const ext = extraction as { projectSpokenName?: string } | null;
    const projectMatches = matchProjects(ext?.projectSpokenName ?? '', projects);

    // 3) Rückgabe an den Client (kein Firestore-Schreiben, kein Audio-Speichern).
    return { transcript, extraction, projectMatches };
  },
);
