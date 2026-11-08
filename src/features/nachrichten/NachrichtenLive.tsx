import { useEffect } from 'react';
import { useAuth } from '@/app/AuthContext';
import { postenNeuLaden } from '@/app/offenePosten';
import { abonniereNachrichtenStand } from '@/lib/db/nachrichten';
import { useModul } from '@/lib/useModule';

/** Das Ereignis „in diesem Gespräch gibt es Neues“ — `detail` ist die Kennung des Kanals oder `null` (alles nachsehen). */
export const NACHRICHTEN_NEU = 'senklot:nachrichten';

/**
 * EINE LIVE-VERBINDUNG FÜR DIE NACHRICHTEN, für die ganze App (M10/B09).
 *
 * Gehört wird nur auf die eigenen Teilnahmen — die einzige Tabelle, die ein
 * Konto direkt liest, und sie trägt keinen Inhalt. Ändert sich eine, steht
 * die Zahl im Menü neu, und offene Ansichten (Posteingang, Gespräch, Akte)
 * holen über das Ereignis nach, was sie zeigen. So gibt es je Gerät einen
 * Kanal statt einen je Ansicht.
 *
 * Nicht im Einblick des Supports: dort gibt es nichts zu hören.
 */
export default function NachrichtenLive() {
  const { user, einblick } = useAuth();
  const an = useModul('nachrichten');
  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !an || einblick) return;
    return abonniereNachrichtenStand(uid, (kanal) => {
      void postenNeuLaden();
      window.dispatchEvent(new CustomEvent(NACHRICHTEN_NEU, { detail: kanal }));
    });
  }, [uid, an, einblick]);

  return null;
}
