/**
 * EINE FARBROLLE, DIE AUCH MIT DECKKRAFT FUNKTIONIERT.
 *
 * DER FEHLER, DEN DAS BEHEBT. Die Farben stehen als Design-Tokens in
 * `index.css`, und zwar als Hex (`--brand: #003366`). Schreibt man dann
 * irgendwo `bg-ink/40` oder `text-brand-fg/85`, kann Tailwind die Deckkraft
 * NICHT anwenden: es müsste dafür an die einzelnen Farbkanäle heran, und aus
 * einem Hex in einer CSS-Variablen kommt es nicht heran. Heraus kommt eine
 * ungültige Farbangabe — und der Browser nimmt dann, was er sonst genommen
 * hätte.
 *
 * Das war KEIN Schönheitsfehler. Nachgemessen im Browser:
 *
 *   text-brand-fg/85   sollte weiss sein  →  rgb(15, 23, 42), also fast schwarz
 *   bg-ink/40          sollte abdunkeln   →  vollständig durchsichtig
 *   border-warning/30  sollte zart sein   →  die Standard-Rahmenfarbe
 *
 * Genau so ist es aufgefallen: „Mitarbeiter-Portal" stand dunkel auf dem
 * blauen Band statt weiss. Und der Abdunkler hinter jedem Bestätigungsdialog
 * fehlte ersatzlos.
 *
 * WARUM `color-mix` UND NICHT KANALWERTE. Der übliche Weg wäre, die Tokens
 * als „0 51 102" abzulegen und hier `rgb(var(--brand) / <alpha-value>)` zu
 * schreiben. Das hätte aber `applyBranding` mitgerissen: die Funktion setzt
 * die Firmenfarben zur Laufzeit als HEX in dieselben Variablen — jedes
 * gebrandete Konto hätte danach gar keine Farben mehr. `color-mix` rechnet
 * direkt auf der Hex-Farbe und lässt Tokens wie Branding unberührt.
 *
 * WAS PASSIERT, WENN EIN BROWSER `color-mix` NICHT KENNT (vor Safari 16.2):
 * die Angabe ist ungültig und wird verworfen — also genau der Zustand von
 * heute. Schlimmer kann es dadurch nicht werden.
 */
function token(name) {
  return ({ opacityValue }) => {
    /*
     * OHNE DECKKRAFT BLEIBT ALLES, WIE ES WAR — und das ist wichtig.
     *
     * Tailwind ruft diese Funktion AUCH fuer die gewoehnliche Farbklasse auf
     * und reicht dabei `var(--tw-bg-opacity, 1)` durch. Gaebe man das an
     * `color-mix` weiter, liefe plötzlich JEDE Farbe der App darüber — und
     * auf einem Browser ohne `color-mix` (vor Safari 16.2) waeren dann auch
     * die Farben kaputt, die heute stimmen. Genau das darf eine Reparatur
     * nicht tun.
     *
     * So beruehrt die Aenderung nur die rund sechzig Stellen mit einem
     * Deckkraft-Zusatz — also genau die, die ohnehin nicht funktionieren.
     * Auf einem alten Browser bleiben sie, was sie heute sind.
     *
     * Die alten Utilities `bg-opacity-50` und Geschwister kommen im Quelltext
     * nicht vor (nachgesehen); sie waeren der einzige Fall, den diese
     * Verkuerzung kosten wuerde.
     */
    if (opacityValue === undefined || String(opacityValue).includes('var(--tw-')) {
      return `var(${name})`;
    }
    return `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;
  };
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Gatet alle hover:-Utilities hinter @media (hover: hover), damit Touch
  // (Baustelle) keine klebrigen Hover-Zustände auslöst.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // Alle Farbrollen lesen Design-Tokens (siehe index.css / applyBranding).
        brand: { DEFAULT: token('--brand'), fg: token('--brand-fg') },
        accent: { DEFAULT: token('--accent'), fg: token('--accent-fg') },
        bg: token('--bg'),
        surface: { DEFAULT: token('--surface'), 2: token('--surface-2') },
        ink: { DEFAULT: token('--text'), muted: token('--text-muted') },
        line: token('--border'),
        success: { DEFAULT: token('--success'), bg: token('--success-bg') },
        warning: { DEFAULT: token('--warning'), bg: token('--warning-bg') },
        danger: { DEFAULT: token('--danger'), bg: token('--danger-bg') },
        info: { DEFAULT: token('--info'), bg: token('--info-bg') },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
      fontSize: {
        // Feste Typo-Skala
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.6rem' }],
        xl: ['1.375rem', { lineHeight: '1.8rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.1rem' }],
      },
      fontFamily: {
        // Poppins self-gehostet (siehe main.tsx), System-Schriften als Fallback.
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
    },
  },
  plugins: [],
};
