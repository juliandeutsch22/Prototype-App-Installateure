import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { freigaben, istOffen } from '@/lib/db/support';

/**
 * Ein Band über dem Inhalt, solange der Support Einblick hat.
 *
 * WARUM ES JEDER SIEHT UND NICHT NUR DIE CHEFIN. Gewährt hat den Zugang die
 * Führung; betroffen ist der ganze Betrieb. Ein Monteur, dessen Schein
 * gerade jemand von aussen ansieht, soll das wissen können, ohne jemanden zu
 * fragen. Genau das ist der Unterschied zwischen einem Supportzugang und
 * einem Generalschlüssel: der eine ist sichtbar.
 *
 * NACHGESEHEN WIRD IM TAKT UND NICHT ÜBER EIN ABONNEMENT. Ein Supportfenster
 * dauert Stunden; eine Minute Verzug ist bedeutungslos, und ein weiteres
 * Live-Abonnement wäre eine Verbindung mehr, die im Funkloch wieder aufgebaut
 * werden will. Beim Öffnen der App wird sofort gefragt, danach jede Minute.
 *
 * SCHEITERT DIE ABFRAGE, ERSCHEINT NICHTS. Ein Band, das bei jedem Wackler
 * „Support sieht mit" behauptete, wäre schlimmer als keines.
 *
 * AUF DEM EIGENEN GERÄT GILT DER TAKT NICHT. Wer gerade selbst „Zugang
 * sofort beenden" gedrückt hat, darf nicht bis zu einer Minute lang weiter
 * lesen, der Support sehe mit — das ist genau der Moment, in dem jemand
 * Gewissheit braucht. Die Supportseite meldet ihre Änderung deshalb sofort
 * über ein Fensterereignis; die anderen Geräte im Betrieb erfahren es beim
 * nächsten Takt, und dort ist eine Minute wirklich bedeutungslos.
 */
const TAKT_MS = 60_000;

/** Gewährt oder beendet — bitte sofort nachsehen. */
export const SUPPORT_GEAENDERT = 'senklot:supportzugang';

export default function Supportband() {
  const { user } = useAuth();
  const [grund, setGrund] = useState<string | null>(null);
  const [notzugang, setNotzugang] = useState(false);

  useEffect(() => {
    if (!user?.companyId) return undefined;
    let wach = true;

    async function nachsehen() {
      try {
        const offen = (await freigaben(user!.companyId, 10)).find((f) => istOffen(f));
        if (!wach) return;
        setGrund(offen ? offen.grund : null);
        setNotzugang(!!offen?.notzugang);
      } catch {
        // Siehe oben: lieber kein Band als ein erfundenes.
      }
    }

    void nachsehen();
    const uhr = window.setInterval(() => void nachsehen(), TAKT_MS);
    const sofort = () => void nachsehen();
    window.addEventListener(SUPPORT_GEAENDERT, sofort);
    return () => {
      wach = false;
      window.clearInterval(uhr);
      window.removeEventListener(SUPPORT_GEAENDERT, sofort);
    };
  }, [user]);

  if (!grund) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warning-bg px-4 py-2 text-center text-sm font-medium text-warning"
    >
      <span>
        {notzugang ? 'Notzugang: ' : ''}Der Support hat gerade Einblick in Ihren Betrieb —
        lesend. Grund: {grund}
      </span>
    </div>
  );
}
