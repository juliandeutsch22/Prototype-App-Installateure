/**
 * Die Marke des PRODUKTS — nicht die des Betriebs.
 *
 * WARUM DAS ZWEI VERSCHIEDENE DINGE SIND. `BrandLogo` zeigt das Logo des
 * Mandanten: in der Kopfleiste, auf Rechnung und Schein steht der Betrieb,
 * und das gehört dorthin. Vor der Anmeldung gibt es aber noch keinen
 * Mandanten — und dort stand bis hierher trotzdem ein Kundenlogo als
 * Vorgabe, also das Zeichen des ERSTEN Betriebs vor den Augen jedes
 * zweiten. Das ist kein Schönheitsfehler, sondern eine falsche Aussage:
 * die Anmeldemaske gehört dem Produkt, nicht einem seiner Kunden.
 *
 * WARUM DAS WORT ALS TEXT UND NICHT ALS BILD. `marke/logo.svg` trägt die
 * Wortmarke als `<text>`. Eine SVG-Datei, die über `<img>` geladen wird,
 * kommt an die Schriften der Seite jedoch nicht heran — sie fiele auf Arial
 * zurück und sähe auf jedem Gerät anders aus. Als echter Text nimmt sie
 * Poppins, die die App ohnehin lädt; sie lässt sich markieren, vorlesen und
 * wächst mit der Schriftgrösse mit. Nur das Zeichen ist ein Bild, und das
 * braucht keine Schrift.
 *
 * FARBE ÜBER `currentColor`. Das Zeichen ist einfarbig und nimmt die Farbe
 * seiner Umgebung — weiss auf der dunklen Fläche, petrol auf heller. So
 * gibt es EINE Zeichnung und nicht zwei, die auseinanderlaufen.
 */

interface Props {
  /** Höhe des Zeichens in px. Die Wortmarke richtet sich danach. */
  hoehe?: number;
  className?: string;
}

export default function ProduktMarke({ hoehe = 40, className = '' }: Props) {
  /*
    Das Sichtfeld ist enger als beim App-Zeichen: dort steht das Senklot in
    einer Platte, hier steht es frei. Schnur und Körper reichen von y=6 bis
    y=58 und von x=23 bis x=41 — plus etwas Luft ergibt das 22 × 56.
  */
  const breite = Math.round((hoehe * 22) / 56);

  return (
    <span
      className={`inline-flex items-center gap-[0.38em] ${className}`}
      style={{ fontSize: hoehe * 0.62 }}
    >
      <svg
        viewBox="21 4 22 56"
        width={breite}
        height={hoehe}
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Stumpfe Enden: ein runder Abschluss macht die Schnur weich, und
            weich ist das Gegenteil von genau. */}
        <path d="M32 6 V17" stroke="currentColor" strokeWidth="1.8" />
        <path d="M32 17 L41 30 L32 58 L23 30 Z" fill="currentColor" />
      </svg>
      {/*
        Mittlere Stärke, offene Laufweite — fett und eng gesetzt wirkt laut
        und altert schnell. `leading-none`, damit die Wortmarke auf der Höhe
        des Zeichens sitzt und nicht auf der Zeilenhöhe.
      */}
      <span className="font-medium leading-none tracking-[0.02em]">Senklot</span>
    </span>
  );
}
