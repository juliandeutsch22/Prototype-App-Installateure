import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Icon from './Icon';
import { knopfKlassen, type Groesse, type Variant } from './knopf';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  groesse?: Groesse;
  loading?: boolean;
  /** Bestätigtes Ergebnis, nie als zeitgesteuerte Vermutung setzen. */
  gespeichert?: boolean;
  children: ReactNode;
}

/**
 * Knopf mit kurzem Druck-Feedback. Hover-Effekte sind
 * app-weit hinter @media (hover:hover) gegatet (Tailwind
 * hoverOnlyWhenSupported) — Touch löst kein klebriges Hover aus.
 */
export default function Button({
  variant = 'primary',
  groesse = 'normal',
  loading = false,
  gespeichert = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const knopf = useRef<HTMLButtonElement>(null);
  // Den normalen Stand halten, aber langen Ladebeschriftungen weiterhin
  // den nötigen Platz lassen. Sonst schrumpft der neue Spinner zum Oval.
  const breite = useRef(0);
  useLayoutEffect(() => {
    const el = knopf.current;
    if (!el) return;
    if (!loading && !gespeichert) {
      if (el.dataset.lotBreite) {
        el.style.removeProperty('--lot-knopf-breite');
        delete el.dataset.lotBreite;
      }
      breite.current = Math.ceil(el.getBoundingClientRect().width);
    } else if (breite.current) {
      el.style.removeProperty('--lot-knopf-breite');
      delete el.dataset.lotBreite;
      const benoetigt = Math.ceil(el.getBoundingClientRect().width);
      el.style.setProperty('--lot-knopf-breite', `${Math.max(breite.current, benoetigt)}px`);
      el.dataset.lotBreite = 'reserviert';
    }
  }, [loading, gespeichert, children]);
  return (
    <button
      ref={knopf}
      className={`${knopfKlassen(variant, groesse)} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-zustand={gespeichert ? 'gespeichert' : undefined}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {gespeichert && !loading && <Icon name="haken" size={16} />}
      {children}
    </button>
  );
}
