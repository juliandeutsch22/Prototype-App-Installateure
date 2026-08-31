import { useAuth } from '@/app/AuthContext';

/**
 * Vom Betrieb mitgeliefertes Logo. Reihenfolge mit Absicht:
 *
 *  1. `companies/{id}.logoUrl` — was der Mandant selbst hinterlegt hat
 *  2. `VITE_PORTAL_LOGO` bzw. die mitgelieferte Datei — gilt auch VOR der
 *     Anmeldung, wo der Mandant noch unbekannt ist
 *
 * Damit trägt ein zweiter Kunde nicht das Logo des ersten: er setzt entweder
 * seine `logoUrl` in den Stammdaten oder baut mit eigener VITE_PORTAL_LOGO.
 */
const FALLBACK_LOGO = import.meta.env.VITE_PORTAL_LOGO || '/perl-logo.png';

interface Props {
  /** Höhe in px. Das Logo ist quer, die Breite ergibt sich aus dem Seitenverhältnis. */
  height?: number;
  className?: string;
  /** Vor der Anmeldung gibt es keinen Mandanten — dann nur die Vorgabe nutzen. */
  ignoreCompany?: boolean;
  /** Alternativtext, wenn der Firmenname noch nicht bekannt ist. */
  alt?: string;
}

export default function BrandLogo({
  height = 28,
  className = '',
  ignoreCompany = false,
  alt,
}: Props) {
  // useAuth ist auch auf dem Anmeldebildschirm verfügbar (Provider umschließt
  // die Routen), company ist dort schlicht null.
  const { company } = useAuth();
  const src = (!ignoreCompany && company?.logoUrl) || FALLBACK_LOGO;
  const name = alt ?? company?.name ?? 'Firmenlogo';

  return (
    <img
      src={src}
      alt={name}
      // Höhe führt, Breite frei: ein anderes Logo darf ein anderes
      // Seitenverhältnis haben, ohne verzerrt zu werden.
      style={{ height }}
      className={`w-auto shrink-0 object-contain ${className}`}
    />
  );
}
