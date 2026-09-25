import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-dark';

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

/*
 * Alle Knöpfe sind EINFARBIG: die Rangordnung steht in der Füllung — gefüllt
 * in der Marke gegen weiß mit Rahmen —, nicht in einem Verlauf.
 *
 * DAS AUSSEHEN STEHT IN `index.css` („Knopf“), je Rolle und Größe genau eine
 * Klasse: `knopf-primaer`, `knopf-sekundaer`, `knopf-gefahr`, `knopf-leise`,
 * `knopf-leise-dunkel`, jeweils auch mit `-klein`.
 *
 * „accent" GIBT ES NICHT MEHR. Anmelden, Passwort setzen, Betrieb anlegen und
 * die Berichte trugen die Hauptaktion in Türkis, „Zeit buchen" in Petrol —
 * zwei Farben für dieselbe Rolle (Prüflauf 24.09.2026, C11). Eine
 * Hauptaktion ist `primary`, überall.
 */
/* Wörtlich ausgeschrieben — Tailwind behält aus `@layer components` nur
   Klassen, die im Quelltext als ganzes Wort stehen. */
const KLASSE: Record<Groesse, Record<Variant, string>> = {
  normal: {
    primary: 'knopf-primaer',
    secondary: 'knopf-sekundaer',
    danger: 'knopf-gefahr',
    ghost: 'knopf-leise',
    'ghost-dark': 'knopf-leise-dunkel',
  },
  klein: {
    primary: 'knopf-primaer-klein',
    secondary: 'knopf-sekundaer-klein',
    danger: 'knopf-gefahr-klein',
    ghost: 'knopf-leise-klein',
    'ghost-dark': 'knopf-leise-dunkel-klein',
  },
};

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
      className={className ? `${KLASSE[groesse][variant]} ${className}` : KLASSE[groesse][variant]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="knopf-laeuft" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
