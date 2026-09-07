import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VoiceExtractResponse } from '@/features/voice/types';

/**
 * Die KI-Erfassung — abgeschaltet, aber gebaut.
 *
 * SIE WIRD TROTZDEM GEPRÜFT, und zwar aus einem bestimmten Grund: sie ist der
 * einzige Bereich der App, der eine Sprachaufnahme eines Mitarbeiters an einen
 * fremden Dienst überträgt. Wird sie eines Tages eingeschaltet — nach den
 * nötigen Auftragsverarbeitungsverträgen —, dann geschieht das ohne
 * Umbauarbeit, und niemand sieht sich den Code davor noch einmal an.
 *
 * Geprüft wird deshalb genau das, was dann zählt: dass der Hinweis auf die
 * Übertragung dasteht, dass ein Aufnahmefehler nicht als Ergebnis
 * durchgeht, und dass der Zustand des Knopfes auch OHNE Farbe erkennbar ist —
 * die Aufnahme läuft auf einem Telefon in einer hellen Werkstatt.
 */

const start = vi.fn(async () => undefined);
const stop = vi.fn(async () => ({ audioBase64: 'AAA', mimeType: 'audio/webm' }));
const reset = vi.fn();
let zustand: 'idle' | 'recording' | 'processing' = 'idle';
let aufnahmeFehler: string | null = null;

vi.mock('@/features/voice/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({ state: zustand, error: aufnahmeFehler, start, stop, reset }),
}));

let antwort: VoiceExtractResponse | null = null;
let fehlerText: string | null = null;
/** Signatur am Doppelgänger: der Test liest, WAS zum Dienst geschickt wird. */
const callVoiceExtract = vi.fn<
  [{ audioBase64: string; mimeType: string }],
  Promise<{ data: VoiceExtractResponse }>
>(async () => {
  if (fehlerText) throw new Error(fehlerText);
  return { data: antwort as VoiceExtractResponse };
});
vi.mock('@/lib/functions', () => ({
  callVoiceExtract: (a: { audioBase64: string; mimeType: string }) => callVoiceExtract(a),
}));

/** Das Bestätigungspanel ist eine eigene Ansicht — hier nur als Marke. */
vi.mock('@/features/voice/ConfirmationPanel', () => ({
  default: ({ result }: { result: VoiceExtractResponse }) => (
    <div data-testid="panel">{result.transcript}</div>
  ),
}));

const { default: VoiceView } = await import('@/features/voice/VoiceView');

beforeEach(() => {
  zustand = 'idle';
  aufnahmeFehler = null;
  fehlerText = null;
  antwort = {
    transcript: 'fertig bei Müller, vier Stunden',
    extraction: { summary: 'Arbeiten abgeschlossen.', time: { hours: 4, needsReview: false } },
    projectMatches: [],
  } as unknown as VoiceExtractResponse;
  start.mockClear();
  stop.mockClear();
  reset.mockClear();
  callVoiceExtract.mockClear();
});

describe('Bevor aufgenommen wird', () => {
  it('steht der Hinweis auf die Übertragung da', () => {
    /*
      Der wichtigste Satz dieser Ansicht. Die Stimme eines Mitarbeiters geht an
      einen fremden Dienst; das ist nichts, was man erst im Kleingedruckten
      erfährt.
    */
    render(<VoiceView />);
    expect(screen.getByText(/an einen Dienst übertragen/)).toBeInTheDocument();
    expect(screen.getByText(/DSGVO/)).toBeInTheDocument();
  });

  it('lädt der Knopf zum Aufnehmen ein', async () => {
    const nutzer = userEvent.setup();
    render(<VoiceView />);
    await nutzer.click(screen.getByRole('button', { name: 'Aufnahme starten' }));
    expect(start).toHaveBeenCalled();
  });
});

describe('Während der Aufnahme', () => {
  it('ist der Zustand auch ohne Farbe erkennbar', () => {
    /*
      Der laufende Zustand war vorher nur an der Farbe zu sehen. Auf einem
      Telefon in einer hellen Werkstatt ist das keine Auskunft — deshalb
      wechselt das Symbol zum Stopp-Quadrat, und die Beschriftung sagt es
      ebenfalls.
    */
    zustand = 'recording';
    render(<VoiceView />);
    expect(screen.getByRole('button', { name: 'Aufnahme stoppen' })).toBeInTheDocument();
    expect(screen.getByText(/Aufnahme läuft — zum Stoppen tippen/)).toBeInTheDocument();
  });

  it('schickt beim Stoppen die Aufnahme zur Auswertung', async () => {
    const nutzer = userEvent.setup();
    zustand = 'recording';
    render(<VoiceView />);
    await nutzer.click(screen.getByRole('button', { name: 'Aufnahme stoppen' }));

    expect(callVoiceExtract).toHaveBeenCalledWith({
      audioBase64: 'AAA',
      mimeType: 'audio/webm',
    });
    expect(await screen.findByTestId('panel')).toHaveTextContent('fertig bei Müller');
  });
});

describe('Wenn etwas schiefgeht', () => {
  it('meldet einen fehlgeschlagenen Dienst, statt ein leeres Ergebnis zu zeigen', async () => {
    /*
      DER TEURE FALL. Ginge der Fehler still durch, stünde eine leere
      Bestätigungskarte da — und wer sie abnickt, bucht null Stunden auf eine
      Baustelle, auf der vier gearbeitet wurden.
    */
    const nutzer = userEvent.setup();
    zustand = 'recording';
    fehlerText = 'Der Dienst antwortet nicht.';
    render(<VoiceView />);
    await nutzer.click(screen.getByRole('button', { name: 'Aufnahme stoppen' }));

    expect(await screen.findByText('Der Dienst antwortet nicht.')).toBeInTheDocument();
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('zeigt einen Aufnahmefehler mit dem Weg zurück', () => {
    // Ohne Mikrofonfreigabe passiert sonst gar nichts, und niemand weiss warum.
    aufnahmeFehler = 'Mikrofonzugriff nicht möglich. Bitte Berechtigung erteilen.';
    render(<VoiceView />);
    expect(screen.getByText(/Mikrofonzugriff nicht möglich/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Erneut/i })).toBeInTheDocument();
  });
});
