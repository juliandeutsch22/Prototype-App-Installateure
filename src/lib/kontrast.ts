/**
 * Kontrast zweier Farben — nach WCAG 2.1.
 *
 * WOZU DAS HIER STEHT. Die Markenfarben eines Betriebs sind zwei Werte, die
 * über die ganze Oberfläche wirken: `--brand` trägt jeden Hauptknopf,
 * `--accent` jede Hervorhebung. Eine unglücklich gewählte Kombination macht
 * Text unlesbar — und zwar nicht für den, der sie aussucht (der weiss ja, was
 * dort steht), sondern für den Monteur im Keller bei schlechtem Licht.
 *
 * Genau deshalb blieben die Farben aus dem Firmendatenformular zunächst
 * draussen. Ein Formular dafür braucht diese Prüfung, sonst ist es eine
 * geladene Waffe.
 *
 * DIE SCHWELLEN kommen aus WCAG 2.1 (Erfolgskriterium 1.4.3):
 *   4.5:1  normaler Text
 *   3.0:1  grosser Text (ab 18,66 px fett oder 24 px) und Bedienelemente
 *
 * Geprüft wird gegen 4.5 — Knopfbeschriftungen sind hier normaler Text.
 */

/** '#rrggbb' oder '#rgb' zu [r, g, b]; null bei allem anderen. */
export function hexZuRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '');
  const voll = h.length === 3 ? h.split('').map((z) => z + z).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(voll)) return null;
  return [
    parseInt(voll.slice(0, 2), 16),
    parseInt(voll.slice(2, 4), 16),
    parseInt(voll.slice(4, 6), 16),
  ];
}

/**
 * Relative Leuchtdichte.
 *
 * Nicht der Mittelwert der Kanäle: das Auge sieht Grün deutlich heller als
 * Blau, und die Gewichte hier bilden das ab. Die Wurzelfunktion davor macht
 * die Umrechnung von sRGB in physikalische Helligkeit rückgängig — ohne sie
 * käme jede dunkle Farbe zu hell heraus.
 */
function leuchtdichte([r, g, b]: [number, number, number]): number {
  const kanal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

/** Das Kontrastverhältnis, 1 (gleich) bis 21 (Schwarz auf Weiss). */
export function kontrast(a: string, b: string): number | null {
  const x = hexZuRgb(a);
  const y = hexZuRgb(b);
  if (!x || !y) return null;
  const l1 = leuchtdichte(x);
  const l2 = leuchtdichte(y);
  const [hell, dunkel] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Ab hier ist normaler Text lesbar (WCAG AA). */
export const AA_NORMAL = 4.5;

export interface Kontrasturteil {
  verhaeltnis: number | null;
  /** Reicht es für normalen Text? */
  reicht: boolean;
  /** Ein Satz für die Oberfläche. */
  text: string;
}

export function urteil(hintergrund: string, vordergrund: string): Kontrasturteil {
  const v = kontrast(hintergrund, vordergrund);
  if (v === null) {
    return { verhaeltnis: null, reicht: false, text: 'Keine gültige Farbe (#rrggbb).' };
  }
  const gerundet = Math.round(v * 10) / 10;
  return {
    verhaeltnis: gerundet,
    reicht: v >= AA_NORMAL,
    text:
      v >= AA_NORMAL
        ? `Kontrast ${gerundet}:1 — gut lesbar.`
        : `Kontrast ${gerundet}:1 — zu wenig. Für normalen Text braucht es ${AA_NORMAL}:1.`,
  };
}
