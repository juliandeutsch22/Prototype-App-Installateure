import { useAuth } from '@/app/AuthContext';

/**
 * Das Zeichen des BETRIEBS — nicht das des Produkts.
 *
 * WAS HIER FALSCH WAR, UND ZWAR NICHT NUR OPTISCH. Der Ersatz war fest auf
 * `/perl-logo.png` verdrahtet: ein zweiter Betrieb, der noch kein Logo
 * hinterlegt hat, sah damit das Zeichen des ERSTEN — das Logo eines fremden
 * Kunden in seiner eigenen App, jeden Tag, in der Seitenleiste. Das ist keine
 * Kleinigkeit: es ist eine falsche Aussage darüber, wessen Betrieb man gerade
 * vor sich hat.
 *
 * Der bisherige Ausweg stand im Kommentar: der zweite Kunde setze eben
 * `VITE_PORTAL_LOGO`. Das ist aber eine BAUZEIT-Variable, also ein eigener
 * Build je Betrieb — genau das, was der Schritt zum echten Mehrmandanten-
 * Betrieb beenden soll.
 *
 * WAS JETZT GILT:
 *
 *  1. `companies/{id}.logoUrl` — was der Betrieb selbst hinterlegt hat.
 *  2. Sonst sein NAME als Schriftzug. Ein sauber gesetzter Name sagt die
 *     Wahrheit; ein fremdes Bild sagt etwas Falsches, und ein
 *     Platzhalterbild sagt gar nichts.
 *
 * Die Produktmarke gehört NICHT hierher, sondern an die Tür (Anmeldung), auf
 * das App-Zeichen und klein an den Fuss der Seitenleiste: wer hier arbeitet,
 * muss sehen, WESSEN Betrieb das ist — in welcher Software er sitzt, weiss er.
 */

interface Props {
  /** Höhe in px. Das Logo ist quer, die Breite ergibt sich aus dem Seitenverhältnis. */
  height?: number;
  className?: string;
}

export default function BrandLogo({ height = 28, className = '' }: Props) {
  const { company } = useAuth();

  /*
    SOLANGE DER BETRIEB NOCH LÄDT, STEHT HIER NICHTS. Einen Namen zu raten
    oder ein Bild vorzuhalten hiesse, für einen Augenblick etwas zu behaupten
    — und ausgerechnet beim Wechsel zwischen zwei Mandanten wäre es das
    Falsche. Der Platz bleibt, der Inhalt kommt nach.
  */
  if (!company) return <span style={{ height }} className={`block ${className}`} aria-hidden="true" />;

  if (company.logoUrl) {
    return (
      <img
        src={company.logoUrl}
        alt={company.name}
        // Höhe führt, Breite frei: ein anderes Logo darf ein anderes
        // Seitenverhältnis haben, ohne verzerrt zu werden.
        style={{ height }}
        className={`w-auto shrink-0 object-contain ${className}`}
      />
    );
  }

  return (
    <span
      /*
        `truncate` und `block`: ein langer Betriebsname („Installationen
        Mustermann Gesellschaft m.b.H.") darf die Seitenleiste nicht
        auseinanderdrücken. Die Höhe folgt der des Logos, damit die Kopfzeile
        nicht springt, je nachdem ob ein Logo hinterlegt ist.
      */
      className={`block truncate font-semibold leading-none ${className}`}
      style={{ fontSize: Math.round(height * 0.5), lineHeight: `${height}px` }}
      title={company.name}
    >
      {company.name}
    </span>
  );
}
