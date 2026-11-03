/** Die gemeinsame, in Pfade umgewandelte Senklot-Vorlage aus marke/logo.svg. */
interface Props {
  /** Höhe der gesamten Marke in px; das Seitenverhältnis bleibt erhalten. */
  hoehe?: number;
  /** Weißes Logo auf dunkler Fläche. Standard: Petrol auf heller Fläche. */
  hell?: boolean;
  className?: string;
}

export default function ProduktMarke({ hoehe = 40, hell = false, className = '' }: Props) {
  return (
    <img
      src={hell ? '/marke/logo-weiss.svg' : '/marke/logo.svg'}
      alt="Senklot"
      width={Math.round(hoehe * 165.12288 / 56)}
      height={hoehe}
      style={{ height: hoehe, width: 'auto' }}
      className={`produkt-marke ${hell ? 'produkt-marke--weiss' : 'produkt-marke--flaeche'} inline-block shrink-0 object-contain ${className}`}
    />
  );
}
