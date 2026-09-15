import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'ghost-dark';

/**
 * `klein` ist für REIHEN VON SCHALTERN, nicht für Aktionen.
 *
 * Drei Zeitraum-Schalter in voller Grösse nebeneinander passen auf einem
 * Telefon nicht in eine Zeile; sie brechen um und stehen dann als drei fette
 * Blöcke da, die aussehen, als wäre jeder für sich wichtig. Wichtig ist aber
 * die Auswahl, nicht der einzelne Schalter.
 *
 * DIE HÖHE BLEIBT: schmaler heisst hier weniger Polsterung und kleinere
 * Schrift, nicht ein kleineres Ziel für den Finger. Ein Monteur bedient das
 * mit Arbeitshandschuhen, und ein 32 Pixel hoher Schalter ist damit nicht zu
 * treffen — das ist der Grund, aus dem `min-h-touch` app-weit steht.
 */
type Groesse = 'normal' | 'klein';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  groesse?: Groesse;
  loading?: boolean;
  children: ReactNode;
}

/**
 * Alle Knöpfe sind EINFARBIG.
 *
 * Der erste Entwurf gab den Hauptaktionen einen Verlauf, um die Rangordnung
 * schon vor dem Lesen sichtbar zu machen. Auf einem Formular mit fünf Knöpfen
 * nebeneinander war das aber kein Rang mehr, sondern Unruhe — und die
 * Rangordnung steht ohnehin in der Farbe: gefüllt in der Marke gegen weiss
 * mit Rahmen. Verläufe bleiben den grossen dunklen Trägerflächen vorbehalten
 * (siehe index.css).
 */
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg shadow-sm hover:opacity-95',
  secondary: 'border border-line bg-surface text-ink shadow-sm hover:bg-surface-2',
  accent: 'bg-accent text-accent-fg shadow-sm hover:opacity-95',
  danger: 'bg-danger text-white shadow-sm hover:opacity-90',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2',
  // Derselbe zurückhaltende Knopf, aber auf einer dunklen Trägerfläche
  // (Seitenleiste). Eine eigene Spielart statt einer mitgegebenen Klasse:
  // zwei Textfarben in einem class-Attribut entscheidet nicht die
  // Reihenfolge im Attribut, sondern die im erzeugten Stylesheet — das
  // wäre stiller Zufall.
  'ghost-dark': 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white',
};

const groessen: Record<Groesse, string> = {
  normal: 'px-4 py-2 text-base',
  klein: 'px-3 py-1.5 text-sm',
};

/**
 * Großes Touch-Ziel (min. 48px) mit taktilem Press-Feedback (:active-Scale).
 * Hover-Effekte sind app-weit hinter @media (hover:hover) gegatet (Tailwind
 * hoverOnlyWhenSupported) — Touch löst kein klebriges Hover aus.
 *
 * Die Höhe gilt für BEIDE Grössen: `klein` nimmt Polsterung und Schrift,
 * nicht das Ziel für den Finger.
 */
export default function Button({
  variant = 'primary',
  groesse = 'normal',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-touch items-center justify-center gap-2 rounded font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${groessen[groesse]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
