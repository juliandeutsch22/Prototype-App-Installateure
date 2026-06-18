import { useState, useEffect } from 'react';
import { useVoiceRecorder } from './useVoiceRecorder';
import { callVoiceExtract } from '@/lib/functions';
import ConfirmationPanel from './ConfirmationPanel';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import type { VoiceExtractResponse } from './types';

/**
 * KI-Magic-Moment (Spec §9): Mikro tippen -> 15 s sprechen -> serverseitige
 * Transkription + Extraktion -> editierbare Bestätigungskarten.
 */
export default function VoiceView() {
  const { state, error: recError, start, stop, reset } = useVoiceRecorder();
  const [result, setResult] = useState<VoiceExtractResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nur-Dev-Demo (?demo): zeigt die Bestätigungs-UI ohne echte Aufnahme/API.
  // Wird im Produktions-Build wegoptimiert (import.meta.env.DEV).
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
      setResult({
        transcript:
          'fertig bei Müller, vier Stunden, zwei Flachdichtungen verbaut, Therme nächste Woche nochmal',
        extraction: {
          summary: 'Arbeiten bei Familie Müller abgeschlossen.',
          time: { hours: 4, needsReview: false },
          projectSpokenName: 'Müller',
          materials: [{ name: 'Flachdichtung', qty: 2, needsReview: false }],
          followUp: { title: 'Therme prüfen', dueWeek: 'nächste Woche' },
        },
        projectMatches: [{ projectNumber: '2026-001', customerName: 'Familie Müller' }],
      });
    }
  }, []);

  async function handleStop() {
    setError(null);
    setBusy(true);
    try {
      const { audioBase64, mimeType } = await stop();
      const res = await callVoiceExtract({ audioBase64, mimeType });
      setResult(res.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.',
      );
    } finally {
      setBusy(false);
      reset();
    }
  }

  function restart() {
    setResult(null);
    setError(null);
    reset();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="KI-Erfassung"
        subtitle={'Sprich frei, z. B.: „fertig bei Müller, vier Stunden, zwei Flachdichtungen verbaut, Therme nächste Woche nochmal".'}
      />

      {!result && (
        <Card>
          <div className="flex flex-col items-center gap-4 py-6">
            <button
              onClick={state === 'recording' ? handleStop : start}
              disabled={busy}
              aria-label={state === 'recording' ? 'Aufnahme stoppen' : 'Aufnahme starten'}
              className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl text-white shadow-lg transition active:scale-95 disabled:opacity-50 ${
                state === 'recording' ? 'animate-pulse bg-accent' : 'bg-brand'
              }`}
            >
              {state === 'recording' ? '■' : '🎤'}
            </button>
            <p className="text-ink-muted" role="status">
              {busy
                ? 'Wird verarbeitet …'
                : state === 'recording'
                  ? 'Aufnahme läuft — zum Stoppen tippen'
                  : 'Zum Aufnehmen tippen'}
            </p>
            <p className="max-w-md text-center text-xs text-ink-muted">
              Hinweis: Deine Sprache wird zur Verarbeitung an einen Dienst übertragen und
              nach der Auswertung nicht dauerhaft gespeichert (DSGVO).
            </p>
          </div>

          {(error || recError) && <ErrorState message={error ?? recError ?? ''} onRetry={restart} />}
        </Card>
      )}

      {result && <ConfirmationPanel result={result} onDone={restart} />}
    </div>
  );
}
