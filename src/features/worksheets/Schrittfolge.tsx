import type { ReactNode } from 'react';
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
 * AM SCHREIBTISCH (ab `lg`) BLEIBT ES EINE SEITE mit nummerierten Abschnitten:
 * dort ist Platz für alles, und Weiterklicken wäre nur ein Umweg.
 */

/* Wörtlich ausgeschrieben — Tailwind behält aus `@layer components` nur
   Klassen, die als ganzes Wort im Quelltext stehen. */
function klasse(nr: Schritt, aktuell: Schritt): string {
  if (nr === aktuell) return 'schritt-aktiv';
  return nr < aktuell ? 'schritt-davor' : 'schritt-offen';
}

/**
 * Die Leiste oben: wo man steht, und ein Tipp springt zu jedem Schritt.
 *
 * Jeder Schritt ist ein Knopf, kein bloßes Etikett. Wer am Nachmittag nur
 * noch unterschreiben lassen will, braucht dafür einen Tipp statt dreimal
 * „Weiter".
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
      <ol className="schrittleiste-liste">
        {SCHRITTE.map((s) => (
          <li key={s.nr} className="schrittleiste-punkt">
            <button
              type="button"
              aria-current={s.nr === schritt ? 'step' : undefined}
              className={klasse(s.nr, schritt)}
              onClick={() => onWahl(s.nr)}
            >
              {s.nr} {s.name}
            </button>
          </li>
        ))}
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
                {z.warnung && <span className="schein-warnung">{z.warnung}</span>}
              </>
            ) : undefined
          }
          wert={z.wert}
        >
          <button
            type="button"
            className="textlink-allein"
            aria-label={`${z.name} ändern`}
            onClick={() => onAendern(z.schritt)}
          >
            Ändern
          </button>
        </ListRow>
      ))}
    </List>
  );
}
