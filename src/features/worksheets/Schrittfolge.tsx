import type { ReactNode } from 'react';
import { List, ListRow } from '@/components/ListRow';
import { SCHRITTE, type Schritt } from './schritte';
import { BearbeitenKnopf } from '@/components/Symbolknoepfe';

/**
 * Der Handwerksschein als Schrittfolge — Zeiten, Material, Fotos, Unterschrift.
 *
 * NUR DIE ANORDNUNG. Alle Teile des Scheins bleiben die ganze Zeit
 * eingehängt; ein Schritt blendet die übrigen nur aus (`hidden`). Das ist
 * keine Bequemlichkeit, sondern trägt die Prüfungen:
 *
 *   - Eine eingetippte, aber nicht übernommene Zeit oder Materialzeile meldet
 *     sich über `onOffen` beim Schein und sperrt das Unterschreiben. Beim
 *     AUSHÄNGEN meldet das Feld „nichts offen" — ein ausgehängter Schritt
 *     hebelte die Sperre also genau dann aus, wenn man weitergeht.
 *   - Die Unterschriftsfelder halten ihre Striche nur im Speicher. Ausgehängt
 *     wären sie weg, während der Schein sich weiter „unterschrieben" merkt.
 *
 * AM SCHREIBTISCH (ab 1024 px) BLEIBT ES DIE EINE SEITE, wie sie immer war:
 * dort ist Platz für alles, und Weiterklicken wäre nur ein Umweg.
 */

/**
 * Die Leiste oben: wo man steht, und ein Tipp springt zu jedem Schritt.
 *
 * Jeder Schritt ist ein Knopf, kein bloßes Etikett. Wer am Nachmittag nur
 * noch unterschreiben lassen will, braucht dafür einen Tipp statt dreimal
 * „Weiter".
 *
 * Gezeichnet als vier Balken mit dem Namen darunter (Designlinie „Fassung 3",
 * `.schritte`): Petrol, wo man steht, grau-blau, was hinter einem liegt,
 * hell, was noch kommt. Die Nummernkreise sind entfallen — sie wiederholten,
 * was die Reihenfolge schon sagt. Für Vorlesehilfen bleibt die Nummer als
 * Text („1 Zeiten"), und `aria-current` sagt, wo man steht.
 */
export function Schrittleiste({
  schritt,
  onWahl,
}: {
  schritt: Schritt;
  onWahl: (nr: Schritt) => void;
}) {
  return (
    <nav aria-label="Schritte des Scheins">
      <ol className="schritte">
        {SCHRITTE.map((s) => {
          const aktiv = s.nr === schritt;
          const davor = s.nr < schritt;
          return (
            <li key={s.nr} className="min-w-0">
              <button
                type="button"
                aria-current={aktiv ? 'step' : undefined}
                onClick={() => onWahl(s.nr)}
                className={`schritt block min-h-touch w-full pt-2 ${
                  aktiv ? 'schritt-jetzt' : davor ? 'schritt-fertig' : ''
                }`}
              >
                <i aria-hidden="true" />
                <span className="sr-only">{s.nr}</span>{' '}
                <span>{s.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface ZusammenfassungsZeile {
  /** Wofür die Zeile steht — zugleich Teil der Knopfbeschriftung („Zeiten ändern"). */
  name: string;
  unter?: ReactNode;
  wert?: ReactNode;
  /** Etwas, das vor dem Unterschreiben geklärt gehört — in Warnfarbe. */
  warnung?: ReactNode;
  schritt: Schritt;
}

/**
 * Was gleich unterschrieben wird, auf einen Blick — über den Unterschriften.
 *
 * ZUSAMMENGEFASST, NICHT WEGGELASSEN. Die Einzelheiten stehen in ihren
 * Schritten; „Ändern" führt dorthin. Gezeigt wird, was der Kunde vor dem
 * Unterschreiben wissen will: wie viele Stunden, wie viel Material.
 */
export function Zusammenfassung({
  zeilen,
  onAendern,
}: {
  zeilen: ZusammenfassungsZeile[];
  /** Mit dem Namen der Zeile: „Baustelle und Tag“ öffnet am Handy gleich die Auswahl (D8). */
  onAendern: (nr: Schritt, name: string) => void;
}) {
  return (
    <List>
      {zeilen.map((z) => (
        <ListRow
          key={z.name}
          title={z.name}
          subtitle={
            z.unter || z.warnung ? (
              <>
                {z.unter}
                {z.warnung && <span className="mt-1 block text-warning">{z.warnung}</span>}
              </>
            ) : undefined
          }
        >
          {z.wert && <span className="font-normal text-ink">{z.wert}</span>}
          {/* Der Stift wie in jeder Zeile (E74); der Name sagt, welcher Schritt. */}
          <BearbeitenKnopf label={`${z.name} ändern`} onClick={() => onAendern(z.schritt, z.name)} />
        </ListRow>
      ))}
    </List>
  );
}
