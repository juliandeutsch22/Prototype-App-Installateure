import { Children, isValidElement, useEffect, type ReactNode, type RefObject } from 'react';

/**
 * DIE SCHWEBENDE HAUPTAKTION ZIEHT SICH BEIM ROLLEN ZUSAMMEN (Plan 15.11.2026, B9).
 *
 * Am Handy schwebt die Hauptaktion rechts unten über dem Inhalt (`.daumen`).
 * Beim Lesen einer langen Liste deckte „Neue Rechnung“ mit 146 × 48 px die
 * Zeilen darunter ab. Rollt man nach unten, zieht sie sich zum runden
 * Symbol zusammen (48 px); rollt man zurück, geht sie wieder auf. Sie
 * bleibt die ganze Zeit dieselbe Schaltfläche mit demselben Namen — nur die
 * sichtbare Fläche ändert sich (`clip-path`, keine Layoutänderung).
 *
 * Nur dort, wo sie wirklich schwebt (`position: fixed`, Handy) und wo es
 * ein Symbol gibt, das für sie stehen kann (`einziehbar`). Steht sie im
 * Seitenkopf (Tablet, Schreibtisch, oder am Handy neben Timer und Korb),
 * bleibt alles, wie es war.
 */
export function useEinziehen(ref: RefObject<HTMLElement>, einziehbar: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !einziehbar || typeof window === 'undefined') return;
    let letzte = window.scrollY;
    let bild = 0;
    const pruefen = () => {
      bild = 0;
      const y = window.scrollY;
      if (getComputedStyle(el).position !== 'fixed' || y < 64) {
        el.removeAttribute('data-eingezogen');
        letzte = y;
        return;
      }
      // Erst ab einer kleinen Strecke: ein Zittern des Fingers ist keine Richtung.
      if (y > letzte + 8) {
        // Wie viel links abfällt, damit rechts der 48-px-Kreis bleibt (ohne calc() im Stil, Linie 0.2).
        const knopf = el.querySelector<HTMLElement>(':scope > :not(.daumen-symbol)');
        if (knopf) el.style.setProperty('--daumen-einzug', `${Math.max(0, knopf.offsetWidth - 48)}px`);
        el.setAttribute('data-eingezogen', '');
      }
      else if (y < letzte - 8) el.removeAttribute('data-eingezogen');
      else return;
      letzte = y;
    };
    const rollen = () => { if (!bild) bild = requestAnimationFrame(pruefen); };
    window.addEventListener('scroll', rollen, { passive: true });
    return () => {
      window.removeEventListener('scroll', rollen);
      if (bild) cancelAnimationFrame(bild);
      el.removeAttribute('data-eingezogen');
    };
  }, [ref, einziehbar]);
}

/** Der sichtbare Text eines Bausteins (Knopf mit Beschriftung) — ohne ihn zu zeichnen. */
function textVon(knoten: ReactNode): string {
  if (typeof knoten === 'string' || typeof knoten === 'number') return String(knoten);
  if (Array.isArray(knoten)) return knoten.map(textVon).join('');
  if (isValidElement<{ children?: ReactNode }>(knoten)) return Children.toArray(knoten.props.children).map(textVon).join('');
  return '';
}

/**
 * Welches Symbol für die Hauptaktion stehen kann, aus ihrer Beschriftung:
 * „Neu …“ (Neue Rechnung, Neuer Kunde, Neues Angebot) ist das Plus. Andere
 * Aktionen („Wareneingang“, „Abweichungen buchen“) haben kein Zeichen, das
 * sie ohne Wort trüge — sie ziehen sich nicht zusammen.
 */
export function aktionSymbol(aktion: ReactNode): 'plus' | null {
  return /^Neu(e|er|es)\s\S/.test(textVon(aktion).trim()) ? 'plus' : null;
}
