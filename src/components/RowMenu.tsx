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
        className={offen ? 'zeilenmenue-knopf-offen' : 'zeilenmenue-knopf'}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {offen &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Aktionen für ${about}`}
            className="zeilenmenue"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          >
            {items.map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOffen(false);
                  i.onSelect();
                }}
                className={i.danger ? 'zeilenmenue-eintrag-gefahr' : 'zeilenmenue-eintrag'}
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
