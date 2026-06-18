/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mandanten-Branding wird zur Laufzeit über CSS-Variablen gesetzt
        // (siehe tenant.ts / applyBranding). Diese Defaults greifen, bis
        // das companies/{companyId}-Dokument geladen ist.
        brand: {
          DEFAULT: 'var(--brand-color, #1d4ed8)',
          fg: 'var(--brand-fg, #ffffff)',
        },
      },
      minHeight: {
        // Große Touch-Ziele für Baustellen-Hände
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
};
