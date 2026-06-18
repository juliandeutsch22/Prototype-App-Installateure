import { useCallback, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'processing';

/** Kapselt MediaRecorder: Aufnahme -> Base64 für die Cloud Function. */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setState('recording');
    } catch {
      setError('Mikrofonzugriff nicht möglich. Bitte Berechtigung erteilen.');
      setState('idle');
    }
  }, []);

  /** Stoppt die Aufnahme und liefert { audioBase64, mimeType }. */
  const stop = useCallback((): Promise<{ audioBase64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        reject(new Error('Keine aktive Aufnahme.'));
        return;
      }
      setState('processing');
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recorder.stream.getTracks().forEach((t) => t.stop());
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] ?? '';
          resolve({ audioBase64: base64, mimeType });
        };
        reader.onerror = () => reject(new Error('Audio konnte nicht gelesen werden.'));
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  return { state, error, start, stop, reset };
}
