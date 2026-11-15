import { useEffect, useRef, useState } from 'react';

/**
 * „JETZT AKTUALISIEREN“ FÜR DIE GANZE APP (Plan 15.11.2026, F15: Ziehen zum
 * Aktualisieren).
 *
 * Die Listen halten sich selbst aktuell (Live-Abo, `kanalHalten`); nach einem
 * Funkloch oder im Hintergrund holen sie nach, sobald die App wieder sichtbar
 * ist. Wer trotzdem „jetzt“ will — am iPhone durch Ziehen von oben —, löst
 * dieses eine Ereignis aus. Darauf hören: jedes Live-Abo (es baut seinen
 * Kanal neu auf und gleicht ab, wie nach `visibilitychange`), der
 * Abfragespeicher (holt, was gerade zu sehen ist) und die Zähler der
 * Navigation. Listen, die selbst laden, melden sich mit `beiAktualisieren` an.
 */
export const AKTUALISIEREN = 'senklot:aktualisieren';

export function aktualisierenAusloesen(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AKTUALISIEREN));
}

/** Auf „jetzt aktualisieren“ hören; die Rückgabe meldet ab. */
export function beiAktualisieren(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(AKTUALISIEREN, fn);
  return () => window.removeEventListener(AKTUALISIEREN, fn);
}

/**
 * Für Listen, die selbst laden: bei „jetzt aktualisieren“ `laden` rufen
 * (immer die neueste Fassung). Scheitert es, bleibt der Stand stehen — wie
 * bei einem Abgleich der Live-Listen ohne Netz (Z10); die Seite meldet ihre
 * Ladefehler selbst, wo sie es ohnehin tut.
 */
export function useBeiAktualisieren(laden: () => unknown): void {
  const aktuell = useRef(laden);
  aktuell.current = laden;
  useEffect(() => beiAktualisieren(() => {
    void Promise.resolve().then(() => aktuell.current()).catch(() => undefined);
  }), []);
}

/**
 * Für Listen, die in einem Effekt laden: eine Zahl, die bei „jetzt
 * aktualisieren“ wächst — in die Abhängigkeiten des Ladeeffekts gesetzt,
 * lädt er neu, ohne dass sonst etwas an der Seite zurückgesetzt wird.
 */
export function useAktualisierungsRunde(): number {
  const [runde, setRunde] = useState(0);
  useEffect(() => beiAktualisieren(() => setRunde((r) => r + 1)), []);
  return runde;
}
