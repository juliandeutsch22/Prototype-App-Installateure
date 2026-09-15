import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kontrast, AA_NORMAL } from '@/lib/kontrast';

/**
 * DIE DUNKLE TRÄGERFLÄCHE — Seitenleiste, Kopfleiste, Tableiste, Anmeldekopf.
 *
 * WARUM DAS EINE PRÜFUNG BRAUCHT UND KEIN KOMMENTAR. Auf dieser Fläche steht
 * die gesamte Navigation, und zwar in Weiß. Wird `--brand-fixed` irgendwann
 * aufgehellt — weil jemand die Leiste „freundlicher" haben will —, verliert
 * jeder Eintrag darauf Lesbarkeit, und zwar überall gleichzeitig. Auffallen
 * würde es nicht am Schreibtisch, sondern draussen bei Sonne.
 *
 * Bis zur Marke Senklot trug die Fläche einen Verlauf von `#0a2030` über
 * `#0f4552` nach `#107a8c`. Ein Verlauf ist nur so lesbar wie seine hellste
 * Stelle, und die erreichte 5,0:1 — gerade über AA, und genau dort stand in
 * der Seitenleiste der Benutzername. Flach sind es über 10:1 auf der ganzen
 * Fläche. Diese Prüfung hält das fest, damit der Gewinn nicht unbemerkt
 * wieder abfliesst.
 */

/** Der Wert, wie er wirklich in den Tokens steht — nicht abgeschrieben. */
function token(name: string): string {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const treffer = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!treffer) throw new Error(`${name} steht nicht mehr in src/index.css`);
  return treffer[1];
}

/**
 * Weiß mit Deckkraft auf einem Grund — was das Auge am Ende sieht.
 *
 * Die Gruppenüberschriften der Seitenleiste stehen auf `text-white/60`. Eine
 * Kontrastrechnung gegen volles Weiß ginge daran vorbei: gerechnet werden
 * muss die Farbe, die nach dem Übereinanderlegen übrig bleibt.
 */
function weissMit(deckkraft: number, grund: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(grund.slice(i, i + 2), 16));
  const misch = (kanal: number) => Math.round(deckkraft * 255 + (1 - deckkraft) * kanal);
  return `#${[misch(r), misch(g), misch(b)].map((k) => k.toString(16).padStart(2, '0')).join('')}`;
}

describe('Die dunkle Trägerfläche', () => {
  it('trägt weissen Text weit über AA', () => {
    const flaeche = token('--brand-fixed');
    // AAA für Fließtext ist 7:1. Die Navigation steht draussen in der Sonne;
    // hier ist AA die Untergrenze und nicht das Ziel.
    expect(kontrast(flaeche, '#ffffff')!).toBeGreaterThanOrEqual(7);
  });

  it('trägt auch die abgedunkelten Gruppenüberschriften noch', () => {
    /*
      `text-white/60` — der schwächste Text auf dieser Fläche. Auf dem alten
      Verlauf erreichte er an dessen hellster Stelle nur rund 3,3:1 und war
      damit unter AA; aufgefallen ist das nie, weil an der Stelle, an der man
      hinsah, der Grund noch dunkel war.
    */
    const flaeche = token('--brand-fixed');
    expect(kontrast(flaeche, weissMit(0.6, flaeche))!).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('ist dieselbe Farbe wie der Statusbalken des Telefons', () => {
    /*
      Sie stehen aneinander: der Balken oben, direkt darunter die Kopfleiste.
      Zwei Werte, die dasselbe meinen, laufen beim ersten Nachbessern
      auseinander — und dann sitzt ein dunkler Riegel über einer helleren
      Leiste. Genau das war vor der flachen Fläche der Fall.
    */
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const balken = html.match(/name="theme-color" content="(#[0-9a-fA-F]{6})"/);
    expect(balken?.[1]?.toLowerCase()).toBe(token('--brand-fixed').toLowerCase());
  });

  it('steht auch im Manifest, damit die Startbildschirm-App nicht abweicht', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8'),
    ) as { theme_color: string };
    expect(manifest.theme_color.toLowerCase()).toBe(token('--brand-fixed').toLowerCase());
  });
});
