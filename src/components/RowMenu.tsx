import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  /** Destruktiv oder sperrend — wird rot gesetzt. */
  danger?: boolean;
}

interface RowMenuProps {
  /** Wessen Aktionen — für die Vorlesehilfe, z. B. „Max Mustermann". */
  about: string;
  items: RowMenuItem[];
}

/** Wie viel Luft das Menü zum Fensterrand hält. */
const RAND = 8;

/**
 * Weitere Aktionen einer Listenzeile hinter einem „⋯".
 *
 * Vorher standen alle drei Aktionen als Textknöpfe nebeneinander. Gemessen
 * brauchen sie 343 px, in der Zeile stehen auf einem 390-px-Schirm aber nur
 * 324 px zur Verfügung — sie brachen also um, und „Deaktivieren" landete
 * allein in einer zweiten Reihe. Knöpfe zu verkleinern, bis es gerade so
 * passt, verschiebt das Problem nur auf das nächste längere Wort oder das
 * nächste schmalere Gerät.
 *
 * Ein Menü löst es der Art nach: die Zeile ist ab jetzt unabhängig davon,
 * wie viele Aktionen es gibt und wie lang deren Namen sind. Sichtbar bleibt
 * die eine Aktion, die man täglich braucht; alles Seltene und alles
 * Gefährliche liegt eine Ebene tiefer — was auch verhindert, dass man
 * „Deaktivieren" im Vorbeiwischen trifft.
 *
 * Über ein Portal, weil Karten `overflow-hidden` tragen: als Kind der Zeile
 * wäre die Liste an der Kartenkante abgeschnitten — genau der Fehler, den
 * wir hier schon einmal hatten.
 */
export default function RowMenu({ about, items }: RowMenuProps) {
  const [offen, setOffen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Position VOR dem Zeichnen bestimmen, sonst blitzt das Menü einmal an
  // der falschen Stelle auf.
  //
  // Gerechnet wird in SEITEN-Koordinaten (Rechteck + Scrollstand), das Menü
  // steht `absolute` am Dokument. Erste Fassung war `fixed` und schloss bei
  // jedem Scroll-Ereignis — was am Telefon bedeutet hätte: wer am Ende eines
  // Wischers auf „⋯" tippt, sieht das Menü aufblitzen und sofort wieder
  // verschwinden, weil der Schwung noch nachläuft. Im Test war genau das
  // reproduzierbar. Am Dokument verankert wandert es einfach mit.
  useLayoutEffect(() => {
    if (!offen || !knopf.current) return;
    const k = knopf.current.getBoundingClientRect();
    const breite = menu.current?.offsetWidth ?? 200;
    const hoehe = menu.current?.offsetHeight ?? 0;
    // Rechtsbündig unter dem Knopf; kippt nach oben, wenn unten kein Platz
    // mehr ist — sonst steht das Menü der letzten Zeile halb im Nirgendwo.
    const untenPlatz = window.innerHeight - k.bottom;
    const nachOben = hoehe > 0 && untenPlatz < hoehe + RAND;
    setPos({
      top: (nachOben ? k.top - hoehe - 4 : k.bottom + 4) + window.scrollY,
      left:
        Math.min(Math.max(RAND, k.right - breite), window.innerWidth - breite - RAND) +
        window.scrollX,
    });
  }, [offen, items.length]);

  useEffect(() => {
    if (!offen) return;
    const schliessen = () => setOffen(false);
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOffen(false);
      // Fokus zurück auf den Auslöser — sonst steht die Tastatur nach dem
      // Schließen am Seitenanfang.
      knopf.current?.focus();
    };
    const beiKlick = (e: MouseEvent) => {
      const z = e.target as Node;
      if (!menu.current?.contains(z) && !knopf.current?.contains(z)) setOffen(false);
    };
    window.addEventListener('keydown', beiTaste);
    document.addEventListener('mousedown', beiKlick);
    // Beim Drehen des Geräts ändert sich die Breite und damit die berechnete
    // Position; neu zu rechnen lohnt für den seltenen Fall nicht.
    window.addEventListener('resize', schliessen);
    return () => {
      window.removeEventListener('keydown', beiTaste);
      document.removeEventListener('mousedown', beiKlick);
      window.removeEventListener('resize', schliessen);
    };
  }, [offen]);

  /*
    DIE TASTATUR KOMMT INS MENÜ. Es hängt über das Portal am Ende von
    `body` — per Tab war es damit praktisch nicht zu erreichen, und die
    Pfeiltasten taten nichts (Prüflauf 25.09.2026, P4-06). Wie im Muster
    „Menü-Knopf": beim Öffnen steht der Fokus auf dem ersten Eintrag, Pfeil
    hoch/runter, Pos1/Ende wandern, Escape und Tab schliessen und geben den
    Fokus dem „⋯" zurück.

    Erst NACH dem Platzieren und ohne Rollen der Seite: vorher steht das Menü
    bei −9999 px, und `focus()` zöge die Seite dorthin.
  */
  const hineinGeholt = useRef(false);
  useEffect(() => {
    if (!offen) {
      hineinGeholt.current = false;
      return;
    }
    if (!pos || hineinGeholt.current) return;
    hineinGeholt.current = true;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [offen, pos]);

  function zurueckZumKnopf() {
    setOffen(false);
    knopf.current?.focus();
  }

  function imMenue(e: React.KeyboardEvent<HTMLDivElement>) {
    const eintraege = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (eintraege.length === 0) return;
    const jetzt = eintraege.indexOf(document.activeElement as HTMLElement);
    let ziel: number | null = null;
    if (e.key === 'ArrowDown') ziel = (jetzt + 1) % eintraege.length;
    else if (e.key === 'ArrowUp') ziel = (jetzt - 1 + eintraege.length) % eintraege.length;
    else if (e.key === 'Home') ziel = 0;
    else if (e.key === 'End') ziel = eintraege.length - 1;
    else if (e.key === 'Tab') {
      e.preventDefault();
      zurueckZumKnopf();
      return;
    }
    if (ziel === null) return;
    e.preventDefault();
    eintraege[ziel].focus({ preventScroll: true });
  }

  return (
    <>
      <button
        ref={knopf}
        type="button"
        data-icon=""
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-label={`Weitere Aktionen für ${about}`}
        title="Weitere Aktionen"
        onClick={() => setOffen((o) => !o)}
        className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded text-lg leading-none transition active:scale-95 ${
          offen ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
        }`}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {offen &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Aktionen für ${about}`}
            className="absolute z-50 min-w-[11rem] overflow-hidden rounded border border-line bg-surface py-1 shadow-lg"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            onKeyDown={imMenue}
          >
            {items.map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                // Kein eigener Tab-Stopp: im Menü wandern die Pfeiltasten.
                tabIndex={-1}
                onClick={() => {
                  // Der Fokus geht vorher an „⋯" zurück — der Eintrag
                  // verschwindet gleich, und sonst stünde er an `body`.
                  // Öffnet die Aktion einen Dialog, holt der ihn sich.
                  zurueckZumKnopf();
                  i.onSelect();
                }}
                className={`block min-h-touch w-full whitespace-nowrap px-4 text-left text-sm font-medium hover:bg-surface-2 ${
                  i.danger ? 'text-danger' : 'text-ink'
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
