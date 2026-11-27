import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { kannZuschneiden, logoOhneRand, logoOhneRandSofort } from '@/lib/logoRand';

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

/**
 * WO DAS ZEICHEN STEHT — UND DAMIT, WIE GROSS (E100, 23.11.2026). Bis hier
 * bekam jede Stelle eine Höhe in Pixeln, und der Name wurde daraus gerechnet
 * (0,4 × Höhe): im Kopf am Handy 28 px Logo und 11 px Name — kleiner als der
 * Seitentitel (16 px), der beim Rollen an dieselbe Stelle tritt. Jetzt nennt
 * jede Stelle ihren Ort; die Maße stehen an einer Stelle im Stil
 * (`--marke-*` in `lot.css`).
 *
 *   - `kopf`: die Kopfzeile am Handy. Name wie der Seitentitel (16 px, 600),
 *     höchstens zwei Zeilen; Logo 36 px hoch.
 *   - `leiste`: die Seitenleiste am Schreibtisch, auf dunklem Grund. Name
 *     16 px, bis drei Zeilen; Logo 40 px hoch.
 */
export type MarkenOrt = 'kopf' | 'leiste';

const ORT_KLASSE: Record<MarkenOrt, string> = { kopf: 'marke-kopf', leiste: 'marke-leiste' };

interface Props {
  ort: MarkenOrt;
  className?: string;
  /** Für die Vorschau in den Firmendaten: was gerade im Formular steht, statt des gespeicherten Betriebs. */
  vorschau?: { name: string; logoUrl?: string | null };
}

export default function BrandLogo({ ort, className = '', vorschau }: Props) {
  const { company } = useAuth();
  const betrieb = vorschau ?? (company ? { name: company.name, logoUrl: company.logoUrl } : null);
  const bild = useLogoOhneRand(betrieb?.logoUrl || null);
  // Ausgeschrieben, nicht zusammengesetzt: Tailwind behält nur Klassen, die wörtlich im Code stehen.
  const klasse = `marke ${ORT_KLASSE[ort]} ${className}`.trim();

  /*
    SOLANGE DER BETRIEB NOCH LÄDT, STEHT HIER NICHTS. Einen Namen zu raten
    oder ein Bild vorzuhalten hiesse, für einen Augenblick etwas zu behaupten
    — und ausgerechnet beim Wechsel zwischen zwei Mandanten wäre es das
    Falsche. Der Platz bleibt, der Inhalt kommt nach. Ebenso, solange das
    Logo zugeschnitten wird: sonst stünde es erst mit Rand, dann ohne da.
  */
  if (!betrieb || (betrieb.logoUrl && !bild)) return <span className={`${klasse} marke-platz`} aria-hidden="true" />;

  if (bild) {
    return (
      <span className={klasse}>
        {/* Höhe führt, Breite frei: ein anderes Logo darf ein anderes Seitenverhältnis haben, ohne verzerrt zu werden. */}
        <img src={bild} alt={betrieb.name} className="marke-bild" />
      </span>
    );
  }

  /*
    DER NAME ALS SCHRIFTZUG, UMBRECHEND STATT ABGESCHNITTEN. Ein
    abgeschnittener Firmenname ist schlimmer als ein kleiner: er behauptet,
    der Betrieb heisse so. Er bricht deshalb um — `hyphens: auto` trennt
    deutsche Zusammensetzungen an der richtigen Stelle, `overflow-wrap:
    anywhere` fängt ein einzelnes Wort ab, das breiter ist als der Platz —
    und endet erst nach der letzten erlaubten Zeile mit Auslassungspunkten;
    vollständig steht er im `title`.
  */
  return (
    <span className={klasse} title={betrieb.name}>
      <span className="marke-name font-firma">{betrieb.name}</span>
    </span>
  );
}

/**
 * Das Logo ohne Rand (`logoRand.ts`). `undefined`, solange zugeschnitten
 * wird; ohne Logo `null`.
 */
function useLogoOhneRand(url: string | null): string | null | undefined {
  const [stand, setStand] = useState<{ fuer: string | null; bild: string | null | undefined }>(() => ({
    fuer: url,
    bild: url ? (logoOhneRandSofort(url) ?? (kannZuschneiden() ? undefined : url)) : null,
  }));
  useEffect(() => {
    if (!url) return;
    if (logoOhneRandSofort(url) || !kannZuschneiden()) return;
    let weg = false;
    void logoOhneRand(url).then((bild) => { if (!weg) setStand({ fuer: url, bild }); });
    return () => { weg = true; };
  }, [url]);
  // Wechselt das Logo, gilt der alte Zuschnitt nicht mehr.
  if (stand.fuer !== url) {
    return url ? (logoOhneRandSofort(url) ?? (kannZuschneiden() ? undefined : url)) : null;
  }
  return stand.bild;
}
