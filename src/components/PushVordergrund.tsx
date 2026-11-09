import { useEffect } from 'react';
import { useAuth } from '@/app/AuthContext';

/**
 * Meldungen bei offener App (09.11.2026) — siehe `pushImVordergrund` in
 * `lib/push.ts`. Firebase wird nur nachgeladen, wo Meldungen erlaubt sind:
 * für alle anderen bleibt der Start so schlank wie bisher.
 */
export default function PushVordergrund() {
  const { user } = useAuth();
  const uid = user?.uid;
  const firma = user?.companyId;
  useEffect(() => {
    if (!uid || !firma) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let vorbei = false;
    let abmelden: () => void = () => undefined;
    void import('@/lib/push')
      .then(({ pushImVordergrund }) => pushImVordergrund(firma, uid, () => window.location.pathname))
      .then((ab) => {
        if (vorbei) ab();
        else abmelden = ab;
      })
      .catch(() => undefined);
    return () => {
      vorbei = true;
      abmelden();
    };
  }, [uid, firma]);
  return null;
}
