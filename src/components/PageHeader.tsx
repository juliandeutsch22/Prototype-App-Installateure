import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { Link, useInRouterContext, useLocation } from 'react-router-dom';
import { SeitenHilfeKnopf } from './SeitenHilfe';
import { Modulskizze, Stempel, type SkizzenMotiv } from './Planlinie';
import { UnterreiterAnmeldung, UnterreiterLeiste } from './unterreiterLeiste';
import { gruppeVon } from '@/app/navigation';

/*
  DIE SKIZZE JE BEREICH (Planlinie, Seitenplan). Zentral nach der Adresse der
  Listenseite, damit jede Hauptseite ihren Akzent ohne eigene Zeile bekommt —
  und keine Akte, kein Unterreiter: dort ist die Adresse eine andere, und die
  Seite hat ihren eigenen Akzent (Eckmarken) oder keinen. Die Einsatzplanung
  fehlt mit Absicht: ihr Akzent ist das Raster der Planungsfläche.
*/
const SKIZZE_JE_SEITE: Record<string, SkizzenMotiv> = {
  '/': 'bau',
  '/admin-projects': 'baustelle',
  '/my-projects': 'baustelle',
  '/worksheets': 'schein',
  '/quotes': 'angebot',
  '/customers': 'kunde',
  '/wartungen': 'wartung',
  '/invoices': 'rechnung',
  '/costing': 'waage',
  '/time': 'zeit',
  '/vacations': 'zeit',
  '/sonderurlaub': 'zeit',
  '/accounting': 'team',
  '/user-mgmt': 'team',
  '/material': 'lager',
  '/anforderungen': 'lager',
  '/lager': 'lager',
  '/settings': 'einstellungen',
};

/**
 * DER SEITENKOPF DER LINIE „LOT“ (Regel 2): überall gleich gebaut.
 *
 *   Ortszeile   klein und grau über dem Titel (wo bin ich, welcher Tag);
 *               ohne Angabe die Gruppe aus dem Menü („Aufträge“, „Geld“ …)
 *   Titel       30 px am Tablet und Schreibtisch, 24 px am Handy, halbfett
 *   Meta        eine Zeile darunter
 *   Stand       die Kennzahlen der Seite als ruhige Zeile (E24)
 *   rechts      „Hilfe zu dieser Seite“, das ⋯ der Seite, die Hauptaktion
 *
 * AM HANDY GEHT DIE HAUPTAKTION IN DEN DAUMENBEREICH: eine feste Leiste über
 * der unteren Navigation (`.daumen`). Oben rechts wäre sie mit einer Hand
 * nicht zu erreichen. Der Inhalt bekommt dafür unten Platz (`.inhalt:has(.daumen)`),
 * damit die Leiste kein Feld verdeckt.
 *
 * DER STAND GEHÖRT ZUM KOPF (E24, 25.10.2026). Als eigener Streifen zwischen
 * zwei Linien stand er zwischen Kopf und Arbeit und machte aus einem Block
 * drei. Im Kopf liest er sich wie der Kopf eines Dokuments: was die Seite
 * ist, und wie sie gerade steht.
 *
 * SEIT DER PLANLINIE (E30, 30.10.2026) IST ER EIN PLANKOPF: der Stand steht
 * als Schriftfeld über die ganze Breite — gleich breite Felder wie im
 * Schriftfeld einer Zeichnung, rechts die Skizze des Bereichs, darunter das
 * Lineal. Ohne Kennzahlen gibt es kein Schriftfeld (und keine Skizze): es
 * wird keine Zahl erfunden, um ein Feld zu füllen.
 *
 * DREI FESTE ZEILEN (E31, 31.10.2026): Ortszeile, Titelzeile, Meta. Die
 * Knöpfe rechts gehören zur Titelzeile und stehen mittig zu ihrer ersten
 * Zeile — vorher hingen sie oben an der Ortszeile und saßen 15 px über der
 * Mitte der Überschrift. Ein Rückweg (Akte, Angebot) steht IN der
 * Ortszeile statt darüber; so beginnt jede Seite auf derselben Höhe.
 */
export default function PageHeader({
  title,
  subtitle,
  ort,
  action,
  mehr,
  hilfe,
  stand,
  stempel,
  skizze,
  nebenAktion,
  zurueck,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Ortszeile über dem Titel. */
  ort?: ReactNode;
  /** Die Hauptaktion der Seite — am Handy im Daumenbereich. */
  action?: ReactNode;
  /** Das ⋯-Menü der Seite (ein `RowMenu`); das einzige ⋯ im Seitenkopf. */
  mehr?: ReactNode;
  /** Einleitung für „Hilfe zu dieser Seite“, vor den gesammelten Erklärungen. */
  hilfe?: ReactNode;
  /** Der Stand der Seite — eine `MetricRow` (oder ihr Platzhalter); wird zum Schriftfeld. */
  stand?: ReactNode;
  /** Nummernstempel neben dem Titel — bei Akten (PR-, AN-, RE-Nummer). */
  stempel?: ReactNode;
  /**
   * Die Skizze im Schriftfeld. Ohne Angabe die des Bereichs nach der Adresse
   * (`SKIZZE_JE_SEITE`); `false`, wo die Seite einen anderen Akzent trägt.
   */
  skizze?: SkizzenMotiv | false;
  /**
   * Ein Weg, der nur ab dem Tablet im Kopf steht und am Handy NICHT in den
   * Daumenbereich rückt (Start: „Einsatzplanung“ — dort ist die untere Leiste
   * schon der Weg).
   */
  nebenAktion?: ReactNode;
  /** Der Weg zurück (Akte, Angebot) — steht als Ortszeile, nicht darüber. */
  zurueck?: { to: string; text: string };
}) {
  const imRouter = useInRouterContext();
  const leiste = useContext(UnterreiterLeiste);
  const anmelden = useContext(UnterreiterAnmeldung);
  // Vor dem Zeichnen: sonst stünde die Leiste einen Augenblick doppelt.
  useLayoutEffect(() => anmelden?.(), [anmelden]);
  return (
    <div className="plankopf">
      <div className="seitenkopf">
        {zurueck ? (
          <p className="seitenkopf-ort"><Link to={zurueck.to} className="seitenkopf-zurueck">← {zurueck.text}</Link></p>
        ) : ort ? <p className="seitenkopf-ort">{ort}</p> : imRouter ? <OrtAusDemMenue /> : null}
        <div className="seitenkopf-zeile">
          <div className="plankopf-titel">
            <h1>{title}</h1>
            {stempel && <Stempel gross>{stempel}</Stempel>}
          </div>
          <div className="seitenkopf-rechts">
            <SeitenHilfeKnopf seite={title} einleitung={hilfe} />
            {mehr}
            {nebenAktion}
            {action && <div className="daumen">{action}</div>}
          </div>
        </div>
        {subtitle && <div className="seitenkopf-meta">{subtitle}</div>}
      </div>
      {stand && (
        <>
          <div className="schriftfeld seitenkopf-stand">
            {stand}
            {imRouter && skizze !== false && <SkizzeDerSeite skizze={skizze} />}
          </div>
          <div className="lineal" aria-hidden="true" />
        </>
      )}
      {leiste}
    </div>
  );
}

/*
  Die Skizze im Endfeld des Schriftfelds, ab dem Tablet. Am Handy keine:
  neben dem Titel schob sie die Überschrift um 26 px nach unten, und die
  Seiten begannen je nach Bereich auf verschiedener Höhe (E31).
*/
function SkizzeDerSeite({ skizze }: { skizze?: SkizzenMotiv }) {
  const pfad = useLocation().pathname;
  const motiv = skizze ?? SKIZZE_JE_SEITE[pfad];
  if (!motiv) return null;
  return <div className="schriftfeld-skizze"><Modulskizze motiv={motiv} /></div>;
}

/*
  DIESELBE ORTSZEILE AUF JEDER SEITE (Design-Entwurf, Punkt 1). Vorher
  trugen manche Seiten sie („Geld“, „Team“), andere nicht — der Kopf sah
  von Seite zu Seite anders aus. Wo eine Seite nichts Eigenes sagt (eine
  Akte ihren Typ, ein Rückweg), steht die Gruppe aus dem Menü.
*/
function OrtAusDemMenue() {
  const gruppe = gruppeVon(useLocation().pathname);
  return gruppe ? <p className="seitenkopf-ort">{gruppe}</p> : null;
}
