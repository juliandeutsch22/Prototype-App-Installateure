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

/**
 * Das Häkchen: „erledigt“. Ein Zeichen mit Bedeutung, deshalb darf es stehen —
 * aber ohne getönte Kachel dahinter (Linie, 10).
 */
export function Haken() {
  return (
    <svg
      className="schein-haken"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Etwas, das schon erledigt ist, als eine Zeile — „Monteur hat
 * unterschrieben“ (Mockup S. 5). Rechts wahlweise der Weg zurück.
 */
export function ErledigtZeile({
  titel,
  unter,
  children,
}: {
  titel: ReactNode;
  unter?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="schein-erledigt">
      <Haken />
      <div className="schein-erledigt-text">
        <p className="schein-erledigt-titel">{titel}</p>
        {unter && <p className="schein-erledigt-unter">{unter}</p>}
      </div>
      {children}
    </div>
  );
}

export interface PruefPunkt {
  name: string;
  wert: ReactNode;
  /** Erledigt — mit Häkchen. Sonst ein leerer Kreis. */
  ok: boolean;
  /** Etwas, das vor dem Unterschreiben geklärt gehört — in Warnfarbe. */
  warnung?: ReactNode;
}

/**
 * Was gleich unterschrieben wird, am Schreibtisch (Mockup S. 8): Häkchen,
 * Name, Wert. Dieselben Angaben wie die Zusammenfassung am Telefon — nur ohne
 * „Ändern“: am Schreibtisch steht jeder Abschnitt ohnehin daneben.
 */
export function Pruefliste({ punkte }: { punkte: PruefPunkt[] }) {
  return (
    <ul className="pruefliste">
      {punkte.map((p) => (
        <li key={p.name} className="pruefliste-zeile">
          {p.ok ? <Haken /> : <span className="pruefliste-offen" aria-hidden="true" />}
          <span className="pruefliste-name">
            {p.name}
            <span className="sr-only">{p.ok ? ' — erledigt' : ' — offen'}</span>
          </span>
          <span className="pruefliste-wert">{p.wert}</span>
          {p.warnung && <span className="pruefliste-warnung">{p.warnung}</span>}
        </li>
      ))}
    </ul>
  );
}
