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
        brand: { DEFAULT: 'var(--brand)', fg: 'var(--brand-fg)' },
        accent: { DEFAULT: 'var(--accent)', fg: 'var(--accent-fg)' },
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        ink: { DEFAULT: 'var(--text)', muted: 'var(--text-muted)' },
        line: 'var(--border)',
        success: { DEFAULT: 'var(--success)', bg: 'var(--success-bg)' },
        warning: { DEFAULT: 'var(--warning)', bg: 'var(--warning-bg)' },
        danger: { DEFAULT: 'var(--danger)', bg: 'var(--danger-bg)' },
        info: { DEFAULT: 'var(--info)', bg: 'var(--info-bg)' },
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
