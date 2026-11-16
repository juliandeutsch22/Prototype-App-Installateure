import { hexZuRgb, kontrast } from '@/lib/kontrast';

/**
 * VORSCHLAG: GEFAHR DEUTLICH VOM TERRAKOTTA ABSETZEN (U5, Entscheidung E4
 * vom 15.11.2026) — NUR ZUM ANSEHEN, NICHT EINGEBAUT.
 *
 * Heute liegen Aktion (`--brand` #a85439), Gefahr (`--danger` #a5483b) und
 * Warnung (`--warning` #8f5d20) im Ton fast aufeinander: zwischen Terrakotta
 * und Gefahr liegen im hellen Satz ΔE 7,6 — knapp über dem, was ein Auge
 * nebeneinander noch sicher unterscheidet, und nicht genug, um aus der
 * Ferne „das ist Gefahr, nicht der nächste Schritt“ zu sagen. Der Vorschlag
 * dreht die Gefahr vom Rotbraun ins Karmin (kühler, Richtung Rot-Violett),
 * bleibt dabei dunkel genug für Text auf Papier und Blatt — und ändert an
 * Terrakotta und Warnung nichts. Der Auftraggeber sieht ihn sich auf der
 * Musterseite an (E4); erst danach geht er in `src/index.css`.
 *
 * Gemessen wie in `lotGrundwerte.test.ts` (WCAG 2.1, `kontrast`), dazu der
 * Abstand im Farbraum (CIE-Lab, ΔE 1976): ab etwa 20 sind zwei Farben auch
 * klein und nebeneinander eindeutig verschieden.
 */
export const GEFAHR = {
  hell: { text: '#25221f', knopf: '#a85439', knopfText: '#fff8ee', alt: '#a5483b', neu: '#9e1c3a', terrakotta: '#a85439', warnung: '#8f5d20', blatt: '#fffdf8', papier: '#f4f0e8', flaeche3: '#eee6db', heute: '#efe6da' },
  dunkel: { text: '#f3eee6', knopf: '#a85439', knopfText: '#fff8ee', alt: '#e08a7c', neu: '#f28aa0', terrakotta: '#d08a68', warnung: '#d9a45f', blatt: '#25221f', papier: '#211f1c', flaeche3: '#302c27', heute: '#2b2723' },
} as const;

/** sRGB → CIE-Lab (D65). */
function lab(hex: string): [number, number, number] {
  const rgb = hexZuRgb(hex);
  if (!rgb) throw new Error(`keine Farbe: ${hex}`);
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Abstand zweier Farben (ΔE 1976). */
export function farbabstand(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export type Messung = { name: string; alt: number; neu: number; art: 'kontrast' | 'abstand' };

/** Die Messungen eines Satzes: Text auf den Flächen, Abstand zu Terrakotta und Warnung. */
export function messungen(satz: 'hell' | 'dunkel'): Messung[] {
  const s = GEFAHR[satz];
  const k = (farbe: string, flaeche: string) => kontrast(farbe, flaeche) ?? 0;
  return [
    { name: 'Text auf Blatt', alt: k(s.alt, s.blatt), neu: k(s.neu, s.blatt), art: 'kontrast' },
    { name: 'Text auf Papier', alt: k(s.alt, s.papier), neu: k(s.neu, s.papier), art: 'kontrast' },
    { name: 'Text auf Fläche 3', alt: k(s.alt, s.flaeche3), neu: k(s.neu, s.flaeche3), art: 'kontrast' },
    { name: 'Text in der Spalte „heute“', alt: k(s.alt, s.heute), neu: k(s.neu, s.heute), art: 'kontrast' },
    { name: 'Abstand zu Terrakotta', alt: farbabstand(s.alt, s.terrakotta), neu: farbabstand(s.neu, s.terrakotta), art: 'abstand' },
    { name: 'Abstand zur Warnung', alt: farbabstand(s.alt, s.warnung), neu: farbabstand(s.neu, s.warnung), art: 'abstand' },
  ];
}
