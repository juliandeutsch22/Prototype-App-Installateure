import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * EIN EINZEILIGER TEXT, DER SICH GANZ LESEN LÄSST (Testbericht Runde 6, G2).
 *
 * In der Rechnungsvorschau stand die Bezeichnung einer Position in einem
 * Eingabefeld: „Facharbeiterstunden (Notdienst +100 %, Nachtc…“ — der Rest
 * war abgeschnitten, und wer prüfen wollte, was auf die Rechnung kommt,
 * musste ins Feld tippen und scrollen. Ein Textfeld bricht um und wächst mit
 * dem Inhalt; die Zeile wird höher statt den Text zu verstecken.
 *
 * Es bleibt EIN Text ohne Zeilenwechsel: die Bezeichnung steht so auf PDF und
 * E-Rechnung, und ein Zeilenwechsel darin wäre dort ein Zufall. Enter fügt
 * deshalb nichts ein, und ein eingefügter Zeilenwechsel wird zum Leerzeichen.
 *
 * Die Höhe folgt dem Inhalt und der Breite: ändert sich die Breite (Handy
 * gedreht, Fenster schmaler), bricht der Text anders um.
 */
export default function WachsendesTextfeld({
  value,
  onWert,
  className,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> & {
  value: string;
  onWert: (text: string) => void;
}) {
  const feld = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = feld.current;
    if (!el) return;
    const anpassen = () => {
      el.style.height = 'auto';
      // Ohne Layout (Vorschau ohne Darstellung) ist scrollHeight 0 — dann bleibt die Höhe des Stils.
      if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    anpassen();
    if (typeof ResizeObserver === 'undefined') return;
    let breite = el.clientWidth;
    const beobachter = new ResizeObserver(() => {
      // Nur auf die Breite: die eigene Höhenänderung löste sonst die nächste aus.
      if (el.clientWidth === breite) return;
      breite = el.clientWidth;
      anpassen();
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={feld}
      rows={1}
      className={className}
      value={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
        rest.onKeyDown?.(e);
      }}
      onChange={(e) => onWert(e.target.value.replace(/\r?\n/g, ' '))}
    />
  );
}
