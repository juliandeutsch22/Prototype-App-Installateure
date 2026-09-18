import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { ladeLauf } from '@/lib/db/laeufe';
import { pushBeurteilen, type Lauf } from '@shared/laufStatus';

/**
 * Ob die Push-Meldungen ankommen.
 *
 * WARUM DAS EINE EIGENE ZEILE IST UND NICHT `LaufStatus` MIT EINER DRITTEN
 * ART. Die beiden Nachtläufe MÜSSEN laufen; bleiben sie aus, ist genau das
 * der Fehler, und `beurteile` meldet nach fünfzig Stunden „überfällig".
 *
 * Push läuft, WENN etwas passiert. Bestellt drei Tage niemand Material, geht
 * zu Recht keine Meldung hinaus. Dieselbe Frist darübergelegt, stünde am
 * ruhigen Wochenende eine Warnung über etwas, das gar nichts zu tun hatte —
 * und eine Warnung, die grundlos erscheint, wird nach zwei Wochen nicht mehr
 * gelesen. Auch dann nicht, wenn sie einmal recht hat.
 *
 * DER FALL, DER WEHTUT, ist ohnehin ein anderer: nicht die einzelne verlorene
 * Meldung, sondern der systematische Ausfall — ein Schlüssel stimmt nicht
 * mehr, die Adresse zeigt ins Leere, die Function ist nicht ausgeliefert.
 * Dann geht KEINE Meldung mehr hinaus, und niemand merkt es, denn eine
 * Push-Meldung, die nicht kommt, sieht aus wie eine, die es nicht zu senden
 * gab. `app.push_nachsehen()` zählt das stündlich mit.
 */
export default function PushStatus() {
  const { user } = useAuth();
  const [lauf, setLauf] = useState<Lauf<'push'> | undefined>();
  const [geladen, setGeladen] = useState(false);

  // An der Kennung, nicht am `user`-Objekt — wie in `LaufStatus`, und aus
  // demselben Grund: sonst lädt der Effekt in einer Schleife.
  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    void ladeLauf(companyId, 'push').then((l) => {
      if (weg) return;
      setLauf(l);
      setGeladen(true);
    });
    return () => {
      weg = true;
    };
  }, [companyId]);

  if (!geladen) return null;

  const u = pushBeurteilen(lauf);
  const farbe =
    u.stand === 'ueberfaellig'
      ? 'border-l-[3px] border-warning bg-surface-2 text-warning'
      : 'border-line text-ink-muted';

  return (
    <p
      className={`rounded-sm border px-3 py-2 text-sm ${farbe}`}
      // `status`, nicht `alert` — dieselbe Überlegung wie in `LaufStatus`:
      // wer hier steht, sieht ohnehin hin.
      role={u.stand === 'ueberfaellig' ? 'status' : undefined}
    >
      {u.text}
    </p>
  );
}
