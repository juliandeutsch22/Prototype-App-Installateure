import { Link } from 'react-router-dom';

/**
 * Datenschutz und Impressum — klein, aber von jeder Seite aus erreichbar.
 *
 * Das Impressum muss nach § 5 ECG „leicht und unmittelbar" zu finden sein,
 * auch VOR der Anmeldung. Deshalb steht derselbe Baustein an der Anmeldung,
 * in der Seitenleiste und im Profilblatt, und die Seiten selbst liegen
 * ausserhalb der Anmeldung.
 */
/*
  TASTFLÄCHE 48 PX, ZEILE UNVERÄNDERT (Prüflauf 25.09.2026, Touch-Ziele). In
  der Seitenleiste waren die beiden Links 17 px hoch. Senkrechtes Polster an
  einem Link im Fliesstext vergrössert die Fläche, ohne die Zeile zu
  verschieben.
*/
const TIPP = 'underline underline-offset-2 py-3.5';

export default function RechtLinks({ className = '' }: { className?: string }) {
  return (
    <p className={className}>
      <Link to="/datenschutz" className={TIPP}>
        Datenschutz
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/impressum" className={TIPP}>
        Impressum
      </Link>
    </p>
  );
}
