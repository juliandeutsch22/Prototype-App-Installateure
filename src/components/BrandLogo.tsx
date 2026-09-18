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

  /*
    ZWEI ZEILEN STATT EINES SCHNITTS.

    Vorher stand der Name einzeilig mit `truncate` in halber Logohöhe — in der
    Seitenleiste also 20 px auf 216 px Platz. „Perl Installationen GmbH"
    braucht dort rund 250 px und wurde damit zu „Perl Installationen …". Ein
    abgeschnittener Firmenname ist schlimmer als ein kleiner: er behauptet,
    der Betrieb heisse so.

    DIE LOGOHÖHE IST DIE MINDESTHÖHE, NICHT DIE HÖHE. Das war die Bedingung,
    unter der hier ursprünglich `truncate` stand: sonst springt die Kopfzeile,
    je nachdem ob ein Logo hinterlegt ist. Als FESTE Höhe war sie aber zu
    streng — „Installationen Mustermann Gesellschaft m.b.H." passt auch in
    zwei Zeilen nicht und wurde dann eben zweizeilig abgeschnitten. Als
    Mindesthöhe erfüllt sie ihren Zweck und kostet nichts: bis zu zwei Zeilen
    (Schriftgrad 0,4 × Höhe, Zeilenabstand 0,5 × Höhe) ergeben genau die
    Logohöhe, und erst ein Name, der mehr braucht, macht die Leiste um eine
    Zeile höher. Das ist der Fall, in dem Wachsen richtig ist.

    `line-clamp-3` ist die Grenze nach unten: ein Name, der auch in drei
    Zeilen nicht fertig wird, drückt die Navigation nicht weg, sondern endet
    mit Auslassungspunkten — und steht vollständig im `title`.

    `hyphens: auto` trennt deutsche Zusammensetzungen an der richtigen Stelle
    (das Dokument ist `lang="de"`), `overflow-wrap: anywhere` fängt den Fall
    ab, dass ein EINZELNES Wort breiter ist als die Leiste. Ohne das Zweite
    liefe so ein Wort seitlich heraus, statt umzubrechen.
  */
  return (
    <span
      className={`flex items-center font-semibold ${className}`}
      style={{
        minHeight: height,
        fontSize: Math.round(height * 0.4),
        lineHeight: `${Math.round(height * 0.5)}px`,
        hyphens: 'auto',
        overflowWrap: 'anywhere',
      }}
      title={company.name}
    >
      <span className="line-clamp-3">{company.name}</span>
    </span>
  );
}
