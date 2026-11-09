import { useEffect } from 'react';
import { useAuth } from '@/app/AuthContext';

/**
 * Beim Start das Gerät für die angemeldete Person anmelden, falls nötig
 * (E69) — siehe `pushAbgleichen` in `lib/push.ts`. Angezeigt werden die
 * Meldungen vom Service Worker, auch bei offener App (`public/sw.js`).
 * Firebase wird nur nachgeladen, wo Meldungen erlaubt sind: für alle anderen
 * bleibt der Start so schlank wie bisher.
 */
export default function PushAnmeldung() {
  const { user, einblick } = useAuth();
  const uid = user?.uid;
  const firma = user?.companyId;
  const imEinblick = !!einblick;
  useEffect(() => {
    // Im Einblick des Supports gehört das Gerät nicht dem angezeigten Konto.
    if (!uid || !firma || imEinblick) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void import('@/lib/push')
      .then(({ pushAbgleichen }) => pushAbgleichen(firma, uid))
      .catch(() => undefined);
  }, [uid, firma, imEinblick]);

  /*
    WO DIESES FENSTER STEHT — der Worker fragt, bevor er eine Meldung zeigt:
    im Gespräch, in dem die Nachricht gerade erscheint, braucht es keine. Die
    Adresse, die er selbst kennt, ist die vom Laden der Seite; die App wechselt
    Seiten aber ohne Neuladen.
  */
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const antworten = (e: MessageEvent) => {
      if (e.data === 'ortGefragt') e.ports[0]?.postMessage(window.location.pathname);
    };
    sw.addEventListener('message', antworten);
    sw.startMessages?.();
    return () => sw.removeEventListener('message', antworten);
  }, []);
  return null;
}
