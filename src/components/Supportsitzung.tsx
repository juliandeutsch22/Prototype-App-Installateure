import { useAuth } from '@/app/AuthContext';
import Button from './Button';

/**
 * Das Band, das der SUPPORT sieht, solange er in einem fremden Betrieb ist.
 *
 * NICHT ZU VERWECHSELN MIT `Supportband`: das sieht der Betrieb und sagt ihm,
 * dass jemand hineinsieht. Dieses hier sieht der Support und sagt ihm, WO er
 * ist — und bei der Stufe „mitarbeiten", dass er echte Daten eines fremden
 * Betriebs ändert.
 *
 * WARUM ES NICHT DEZENT IST. Der Support arbeitet abwechselnd in seiner
 * eigenen Oberfläche und in der eines Kunden; die sehen gleich aus, weil es
 * dieselbe ist. Genau daraus entsteht der Fehler, der weh tut: eine Rechnung
 * im falschen Betrieb stornieren. Das Band ist die einzige Stelle, an der der
 * Unterschied sichtbar wird, und deshalb steht es ganz oben, in voller
 * Breite, mit dem Namen des Betriebs in Fettschrift.
 */
export default function Supportsitzung() {
  const { einblick, einblickBeenden } = useAuth();
  if (!einblick) return null;

  const schreibt = einblick.stufe === 'mitarbeiten';

  return (
    <div
      role="status"
      className={[
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm',
        // Rot heisst hier: du änderst fremde Daten. Die Lesestufe bekommt den
        // ruhigeren Ton — sonst stumpft die Warnung ab, die im Ernstfall
        // zählt.
        schreibt
          ? 'bg-danger-bg font-bold text-danger'
          : 'bg-warning-bg font-medium text-warning',
      ].join(' ')}
    >
      <span>
        {schreibt ? 'MITARBEITEN' : 'Einblick'} in{' '}
        <strong>{einblick.name}</strong>
        {schreibt
          ? ' — Ihre Änderungen treffen echte Daten dieses Betriebs.'
          : ' — nur lesend. Änderungen weist die Datenbank ab.'}
      </span>
      <Button variant="secondary" onClick={einblickBeenden}>
        Einblick beenden
      </Button>
    </div>
  );
}
