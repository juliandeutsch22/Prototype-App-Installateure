import {
  isValidElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import { ImFensterContext } from './imFenster';

/**
 * „HILFE ZU DIESER SEITE“ (Linie „Lot“, Regel 11).
 *
 * Vorher stand an vielen Überschriften ein eigenes „i“. Jedes für sich war
 * richtig, zusammen machten sie die Seiten unruhig — und wer eine Frage
 * hatte, musste raten, hinter welchem „i“ die Antwort stand. Jetzt sammelt
 * die Seite alle Erklärungen an einer Stelle im Seitenkopf.
 *
 * KEIN TEXT GEHT DABEI VERLOREN. `InfoHint` und der `hint` einer `Card`
 * melden ihren Text hier an, statt ihn selbst zu zeigen; die Hilfe listet
 * ihn unter derselben Überschrift. Nur wo es keine Seite gibt, die sammelt
 * (eine Komponente für sich, ein Dialog über der Seite), bleibt das „i“
 * an seinem Platz: ein Dialog verdeckt den Seitenkopf, die Hilfe wäre dort
 * unerreichbar.
 *
 * Der Text liegt in einem Ref und nicht im Zustand: er ist meist ein neues
 * React-Element bei jedem Zeichnen, und ein Zustand, der sich darauf
 * aktualisiert, zeichnete die Seite endlos neu.
 */

interface Eintrag {
  id: string;
  titel: string;
}

interface SeitenHilfeApi {
  melden: (id: string, titel: string) => void;
  abmelden: (id: string) => void;
  inhalte: React.MutableRefObject<Map<string, ReactNode>>;
  eintraege: Eintrag[];
}

const HilfeContext = createContext<SeitenHilfeApi | null>(null);

export function SeitenHilfeProvider({ children }: { children: ReactNode }) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const inhalte = useRef(new Map<string, ReactNode>());

  const melden = useCallback((id: string, titel: string) => {
    setEintraege((alt) => {
      const da = alt.find((e) => e.id === id);
      if (da?.titel === titel) return alt;
      return da ? alt.map((e) => (e.id === id ? { id, titel } : e)) : [...alt, { id, titel }];
    });
  }, []);

  const abmelden = useCallback((id: string) => {
    inhalte.current.delete(id);
    setEintraege((alt) => alt.filter((e) => e.id !== id));
  }, []);

  const api = useMemo(() => ({ melden, abmelden, inhalte, eintraege }), [melden, abmelden, eintraege]);
  return <HilfeContext.Provider value={api}>{children}</HilfeContext.Provider>;
}

/**
 * Meldet eine Erklärung bei der Seite an. Gibt zurück, ob die Seite sie
 * übernimmt — dann zeigt der Aufrufer kein eigenes „i“.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSeitenHilfe(titel: string, inhalt: ReactNode | undefined): boolean {
  const hilfe = useContext(HilfeContext);
  const imFenster = useContext(ImFensterContext);
  const id = useId();
  const sammelt = !!hilfe && !imFenster && inhalt != null && inhalt !== false && inhalt !== '';

  if (sammelt) hilfe.inhalte.current.set(id, inhalt);

  const melden = hilfe?.melden;
  const abmelden = hilfe?.abmelden;
  useEffect(() => {
    if (!sammelt || !melden || !abmelden) return;
    melden(id, titel);
    return () => abmelden(id);
  }, [sammelt, melden, abmelden, id, titel]);

  return sammelt;
}

/** Der lesbare Text einer Erklärung — um gleiche nur einmal zu zeigen. */
function textVon(knoten: ReactNode): string {
  if (knoten == null || typeof knoten === 'boolean') return '';
  if (typeof knoten === 'string' || typeof knoten === 'number') return String(knoten);
  if (Array.isArray(knoten)) return knoten.map(textVon).join('');
  if (isValidElement(knoten)) return textVon((knoten.props as { children?: ReactNode }).children);
  return '';
}

/** „Offene Anträge (20)“ → „Offene Anträge“: die Zahl gehört zur Karte, nicht zur Erklärung. */
const ohneZaehler = (titel: string) => titel.replace(/\s*\(\d+\)$/, '');

/**
 * Die Einträge, wie die Hilfe sie zeigt (17 J): ohne Zähler im Titel, und
 * dieselbe Erklärung nur einmal — eine gesperrte Zeile der Zeiterfassung
 * meldet ihren Hinweis je Zeile, und er stand so oft da, wie es Zeilen gab.
 * Gleich ist, was gleichen Titel UND gleichen Text hat; ein Text, der sich
 * nicht lesen lässt, bleibt für sich.
 */
function zuZeigen(eintraege: Eintrag[], inhalte: Map<string, ReactNode>): Eintrag[] {
  const gesehen = new Set<string>();
  const raus: Eintrag[] = [];
  for (const e of eintraege) {
    const titel = ohneZaehler(e.titel);
    const text = textVon(inhalte.get(e.id));
    const schluessel = `${titel}\n${text}`;
    if (text && gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push({ id: e.id, titel });
  }
  return raus;
}

/**
 * Der Zugang im Seitenkopf. Zeigt sich nur, wenn die Seite etwas zu erklären
 * hat — ein Knopf, hinter dem nichts steht, wäre schlimmer als keiner.
 */
export function SeitenHilfeKnopf({ seite, einleitung }: { seite: string; einleitung?: ReactNode }) {
  const hilfe = useContext(HilfeContext);
  const [offen, setOffen] = useState(false);
  const eintraege = hilfe?.eintraege ?? [];
  if (!einleitung && eintraege.length === 0) return null;

  return (
    <>
      {/*
        EIN RUHIGES ZEICHEN STATT EINES UNTERSTRICHENEN WORTS (Design-Entwurf,
        Punkt 1): neben dem ⋯ der Seite gleich groß und gleich still, damit
        rechts im Kopf nur die Hauptaktion auffällt. Der Name für Vorlesehilfe
        und Mauszeiger bleibt ausgeschrieben.
      */}
      <button type="button" className="seitenkopf-hilfe" onClick={() => setOffen(true)} aria-label="Hilfe zu dieser Seite" title="Hilfe zu dieser Seite">
        <Icon name="hilfe" size={22} aria-hidden="true" />
      </button>
      <BottomSheet open={offen} onClose={() => setOffen(false)} label={`Hilfe zu ${seite}`} auchBreit titel={`Hilfe: ${seite}`}>
        <div className="hilfe-liste">
          {einleitung && <div className="hilfe-text pb-3">{einleitung}</div>}
          {zuZeigen(eintraege, hilfe?.inhalte.current ?? new Map()).map((e) => (
            <section key={e.id} className="hilfe-eintrag">
              <h3 className="hilfe-titel">{e.titel}</h3>
              <div className="hilfe-text">{hilfe?.inhalte.current.get(e.id)}</div>
            </section>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
