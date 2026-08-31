import { useEffect, useState } from 'react';

/**
 * Hinweisband, solange der Browser keine Verbindung meldet.
 *
 * Die App arbeitet offline weiter — Firestore hält einen lokalen
 * Zwischenspeicher und sendet Geschriebenes nach. Genau das weiß aber niemand,
 * und ohne Hinweis wirkt eine Liste, die sich nicht aktualisiert, wie ein
 * Fehler. Für Monteure im Keller oder in der Tiefgarage ist fehlender Empfang
 * kein Randfall, sondern Alltag.
 *
 * `navigator.onLine` ist bewusst die einzige Quelle: es meldet zuverlässig
 * „gar keine Netzwerkverbindung". Dass eine bestehende Verbindung trotzdem
 * nichts durchlässt, kann es nicht wissen — dafür sorgt die Rückmeldung beim
 * Speichern (lib/offlineWrite).
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  );

  useEffect(() => {
    const an = () => setOffline(false);
    const aus = () => setOffline(true);
    window.addEventListener('online', an);
    window.addEventListener('offline', aus);
    return () => {
      window.removeEventListener('online', an);
      window.removeEventListener('offline', aus);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-bg px-4 py-2 text-center text-sm font-medium text-warning"
    >
      Keine Verbindung — Erfasstes wird gespeichert und automatisch gesendet,
      sobald wieder Netz da ist.
    </div>
  );
}
