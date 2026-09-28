import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-dark';

/**
 * `klein` ist für NEBENKNÖPFE IN EINER ZEILE und Reihen von Schaltern, nicht
 * für Hauptaktionen.
 *
 * Drei Zeitraum-Schalter in voller Grösse nebeneinander passen auf einem
 * Telefon nicht in eine Zeile; sie brechen um und stehen dann als drei
 * Blöcke da, die aussehen, als wäre jeder für sich wichtig. Wichtig ist aber
 * die Auswahl, nicht der einzelne Schalter.
 *
 * Bis zur Designlinie „Fassung 3" blieb die Höhe dabei 48 px, wegen der
 * Arbeitshandschuhe. Die Linie setzt kleine Knöpfe auf 36 px (Regel 8) —
 * das liegt weiter deutlich über den 24 px, die WCAG 2.2 als Mindestmass
 * für Ziele nennt, und die Hauptaktionen, die ein Monteur mit Handschuhen
 * trifft, bleiben ausnahmslos `normal`.
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
  /*
    GEWICHT NACH RANG (Designlinie „Fassung 3"): die Hauptaktion halbfett,
    alles Übrige mittel. Vorher standen alle Knöpfe halbfett, und fünf davon
    nebeneinander riefen gleich laut.
  */
  primary: 'bg-brand font-semibold text-brand-fg shadow-sm hover:opacity-95',
  secondary: 'border border-line bg-surface font-medium text-ink-deep shadow-sm hover:bg-surface-2',
  /*
    „accent" GIBT ES NICHT MEHR. Anmelden, Passwort setzen, Betrieb anlegen
    und die Berichte trugen die Hauptaktion in Türkis, „Zeit buchen" in
    Petrol — zwei Farben für dieselbe Rolle (Prüflauf 24.09.2026, C11). Eine
    Hauptaktion ist `primary`, überall.
  */
  danger: 'bg-danger font-semibold text-white shadow-sm hover:opacity-90',
  ghost: 'bg-transparent font-medium text-ink-muted hover:bg-surface-2',
  // Derselbe zurückhaltende Knopf, aber auf einer dunklen Trägerfläche
  // (Seitenleiste). Eine eigene Spielart statt einer mitgegebenen Klasse:
  // zwei Textfarben in einem class-Attribut entscheidet nicht die
  // Reihenfolge im Attribut, sondern die im erzeugten Stylesheet — das
  // wäre stiller Zufall.
  'ghost-dark': 'bg-transparent font-medium text-white/80 hover:bg-ink-deep hover:text-white',
};

/**
 * `normal`: 48 px hoch (`min-h-touch`), Schrift 15 px — die Grösse der
 * Linie für jeden Knopf, am Telefon wie am Schreibtisch.
 *
 * `klein`: 36 px hoch, kleinere Rundung. Seit der Designlinie „Fassung 3"
 * (docs/design/linie.md § 7, Regel 8) ist das die eine erlaubte Ausnahme
 * von 44 px — für Nebenknöpfe IN einer Zeile („Hinzufügen" neben einem
 * Artikel) und Reihen von Schaltern, nie für die Hauptaktion einer Seite.
 */
const groessen: Record<Groesse, string> = {
  normal: 'min-h-touch rounded px-4 py-2 text-fliess',
  klein: 'min-h-[2.25rem] rounded-sm px-3 py-1.5 text-sm',
};

/**
 * Knopf mit taktilem Press-Feedback (:active-Scale). Hover-Effekte sind
 * app-weit hinter @media (hover:hover) gegatet (Tailwind
 * hoverOnlyWhenSupported) — Touch löst kein klebriges Hover aus.
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
      className={`inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${groessen[groesse]} ${variants[variant]} ${className}`}
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
