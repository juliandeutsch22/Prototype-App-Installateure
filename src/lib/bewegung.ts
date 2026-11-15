import { TAKT_SELEKTOR } from './takt';

/**
 * Bewegung, die erklärt, was gerade passiert ist (Plan 15.11.2026, Abschnitt 4).
 *
 * DREI REGELN, AUS DENEN JEDE BEWEGUNG HIER GEBAUT IST:
 *
 * 1. NUR `transform` UND DECKKRAFT. Der Taktgeber (`takt.ts`) schreibt Abstand
 *    und Polster jedes Blatts und liest sie im nächsten Bild zurück; ein
 *    Übergang auf Abstand, Polster oder Höhe lieferte ihm einen Zwischenwert
 *    (S2). Eine Höhe, die gleitet, maß er obendrein jedes Bild neu — die
 *    Unterkante des Blatts spränge Zelle für Zelle mit. Deshalb ändert sich
 *    das Layout hier immer in EINEM Schritt, und gezeigt wird der Weg dorthin
 *    nur mit `transform` (die Nachbarn rücken „von der alten Stelle“ nach).
 *
 * 2. KEIN BLATT WIRD SENKRECHT VERSCHOBEN. `getBoundingClientRect` zählt
 *    `transform` mit; der Taktgeber misst die Oberkante der Blätter genau so.
 *    Ein Blatt mitten in einer Verschiebung bekäme einen falschen Abstand.
 *    Bewegt wird nur, was IN einem Blatt liegt (Zeilen, Felder, Abschnitte).
 *
 * 3. „BEWEGUNG REDUZIEREN“ HEISST: KEINE. Dann stehen alle Zustände sofort am
 *    Ziel — dasselbe Endbild, nur ohne Weg. Und keine Bewegung hält eine
 *    Eingabe auf: Animationen laufen auf der Darstellung, die Elemente sind
 *    die ganze Zeit bedienbar, und nichts wartet auf ihr Ende.
 */

/** Die Stufen der Linie (`lot-feinschliff.css`) — in Millisekunden für die Web Animations API. */
export const DAUER = {
  druck: 100,
  zustand: 160,
  bestaetigt: 180,
  fenster: 220,
  weg: 140,
  meldung: 240,
} as const;

/** `--ease-response`: schnell los, weich ans Ziel, ohne Überschwingen. */
export const EASE = 'cubic-bezier(.22, 1, .36, 1)';

export function bewegungReduziert(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? false
    : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Darf und kann hier etwas laufen? Ohne Web Animations (Tests, alte Browser) nicht — der Zustand stimmt trotzdem. */
export function kannBewegen(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === 'function' && !bewegungReduziert();
}

/** Eine Bewegung abspielen — oder nichts tun, wo sie nicht laufen darf. */
export function bewegen(
  el: Element | null | undefined,
  bilder: Keyframe[] | PropertyIndexedKeyframes,
  optionen: KeyframeAnimationOptions,
): Animation | null {
  if (!kannBewegen(el)) return null;
  return el.animate(bilder, { easing: EASE, ...optionen });
}

/** Liegt das Element auf dem Takt — ist es ein Blatt oder trägt eines? Dann wird es nicht verschoben (Regel 2). */
export function traegtTakt(el: Element): boolean {
  return el.matches(TAKT_SELEKTOR) || !!el.querySelector(TAKT_SELEKTOR);
}

/**
 * Die Elemente, die nachrücken, wenn sich `el` in der Höhe ändert: seine
 * folgenden Geschwister und die seiner Vorfahren bis zur Grenze (dem Blatt,
 * dem Fenster). Nichts, was selbst ein Blatt ist oder eines trägt.
 */
export function nachfolger(el: Element, grenze: Element | null): HTMLElement[] {
  const funde: HTMLElement[] = [];
  let ebene: Element | null = el;
  while (ebene && ebene !== grenze && ebene.parentElement) {
    for (let n = ebene.nextElementSibling; n; n = n.nextElementSibling) {
      if (!(n instanceof HTMLElement) || traegtTakt(n)) continue;
      const lage = getComputedStyle(n).position;
      if (lage !== 'absolute' && lage !== 'fixed') funde.push(n);
    }
    ebene = ebene.parentElement;
    // Am Blatt endet es: das Blatt selbst und alles neben ihm liegt auf dem Takt.
    if (ebene?.matches(TAKT_SELEKTOR)) break;
  }
  return funde;
}

/** Wo die Elemente gerade stehen (nur die Oberkante zählt). */
export function lagen(els: HTMLElement[]): Map<HTMLElement, number> {
  const m = new Map<HTMLElement, number>();
  for (const el of els) m.set(el, el.getBoundingClientRect().top);
  return m;
}

/**
 * FLIP: das Layout steht schon am Ziel; jedes Element startet optisch an
 * seiner alten Stelle und gleitet in `dauer` an die neue. Nur `transform`.
 */
export function nachruecken(vorher: Map<HTMLElement, number>, dauer: number = DAUER.zustand): void {
  for (const [el, alt] of vorher) {
    if (!el.isConnected || !kannBewegen(el)) continue;
    const d = alt - el.getBoundingClientRect().top;
    if (Math.abs(d) < 0.5) continue;
    el.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: dauer, easing: EASE });
  }
}
