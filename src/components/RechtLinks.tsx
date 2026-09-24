import { Link } from 'react-router-dom';

/**
 * Datenschutz und Impressum — klein, aber von jeder Seite aus erreichbar.
 *
 * Das Impressum muss nach § 5 ECG „leicht und unmittelbar" zu finden sein,
 * auch VOR der Anmeldung. Deshalb steht derselbe Baustein an der Anmeldung,
 * in der Seitenleiste und im Profilblatt, und die Seiten selbst liegen
 * ausserhalb der Anmeldung.
 */
export default function RechtLinks({ className = '' }: { className?: string }) {
  return (
    <p className={className}>
      <Link to="/datenschutz" className="underline underline-offset-2">
        Datenschutz
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/impressum" className="underline underline-offset-2">
        Impressum
      </Link>
    </p>
  );
}
