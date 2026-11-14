import { useDunkelGezeigt } from '@/lib/darstellung';

/** Die gemeinsame, in Pfade umgewandelte Senklot-Vorlage aus marke/logo.svg. */
interface Props {
  /** Höhe der gesamten Marke in px; das Seitenverhältnis bleibt erhalten. */
  hoehe?: number;
  /** Fassung für dunkle Flächen (heller Schriftzug). Standard: Tinte auf heller Fläche. */
  hell?: boolean;
  className?: string;
}

/*
  V10 (13.11.2026): Zeichen in Terrakotta, Schriftzug in Tinte. Auf dunklem
  Satz zeigt die Marke die Fassung für dunkle Flächen — vorher wurde die
  helle Fassung per Filter weiß gefärbt, das hätte auch das Zeichen weiß
  gemacht.
*/
export default function ProduktMarke({ hoehe = 40, hell = false, className = '' }: Props) {
  const dunkel = useDunkelGezeigt();
  const fuerDunkel = hell || dunkel;
  return (
    <img
      src={fuerDunkel ? '/marke/logo-weiss.svg' : '/marke/logo.svg'}
      alt="Senklot"
      width={Math.round(hoehe * 165.12288 / 56)}
      height={hoehe}
      style={{ height: hoehe, width: 'auto' }}
      className={`produkt-marke ${hell ? 'produkt-marke--weiss' : 'produkt-marke--flaeche'} inline-block shrink-0 object-contain ${className}`}
    />
  );
}
