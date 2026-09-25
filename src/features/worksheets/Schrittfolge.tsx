import type { ReactNode } from 'react';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { SCHRITTE, type Schritt } from './schritte';

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
 * Gezeichnet wie die Reiter der App (Unterreiter, Material, Lager): Kante
 * unten und Schrift im festen Türkis der Oberfläche, nicht in `--accent` —
 * das ist die Farbe des Mandanten, und eine Markierung ist Oberfläche, keine
 * Handlung. Dazu die Nummer im Kreis: gefüllt, wo man steht, umrandet in
 * Türkis, was schon hinter einem liegt, grau, was noch kommt.
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
      {/* Vier gleich breite Spalten: auf 390 px passt „Unterschrift" unter
          seine Nummer, ab dem Tablet stehen Nummer und Name nebeneinander. */}
      <ol className="grid grid-cols-4 border-b border-line">
        {SCHRITTE.map((s) => {
          const aktiv = s.nr === schritt;
          const davor = s.nr < schritt;
          return (
            <li key={s.nr} className="min-w-0">
              <button
                type="button"
                aria-current={aktiv ? 'step' : undefined}
                onClick={() => onWahl(s.nr)}
                className={`-mb-px flex min-h-touch w-full flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 text-xs transition sm:flex-row sm:gap-2 sm:text-sm ${
                  aktiv
                    ? 'border-b-accent-deep font-bold text-accent-deep'
                    : `border-b-transparent font-medium hover:text-ink ${
                        davor ? 'text-ink' : 'text-ink-muted'
                      }`
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                    aktiv
                      ? 'border-accent-deep bg-accent-deep text-white'
                      : davor
                        ? 'border-accent-deep bg-surface text-accent-deep'
                        : 'border-line bg-surface text-ink-muted'
                  }`}
                >
                  {s.nr}
                </span>{' '}
                <span className="max-w-full whitespace-nowrap">{s.name}</span>
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
  onAendern: (nr: Schritt) => void;
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
          {z.wert && <span className="font-medium text-ink">{z.wert}</span>}
          <Button
            variant="secondary"
            groesse="klein"
            aria-label={`${z.name} ändern`}
            onClick={() => onAendern(z.schritt)}
          >
            Ändern
          </Button>
        </ListRow>
      ))}
    </List>
  );
}
