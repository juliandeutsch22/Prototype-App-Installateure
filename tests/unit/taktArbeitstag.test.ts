// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ausrichten } from '@/lib/takt';

/*
  DER ARBEITSTAG UND DIE TIMER-LEISTE IM TAKT (E72, 09.11.2026). Die Karte
  „Arbeitstag“ ist keine `.karte`, lag also neben dem Taktgeber und mit
  krummer Höhe zwischen den Blättern. Die Timer-Leiste steht neben `.inhalt`
  und braucht dessen Spaltenbreite an der Fläche. Gegenprobe: mit dem Stand
  vor E72 bleibt die Karte unberührt und die Fläche ohne `--takt-breite`.
*/
function seite() {
  document.body.innerHTML = `
    <main class="hauptflaeche" style="background-position: 40px 24px">
      <div class="inhalt" style="padding-left: 40px; padding-right: 40px">
        <section class="arbeitstag" id="arbeitstag"><p>Läuft seit 07:00</p></section>
      </div>
      <div class="timer-leiste-halter timer-leiste-breit"></div>
    </main>`;
  const flaeche = document.querySelector<HTMLElement>('.hauptflaeche')!;
  const inhalt = document.querySelector<HTMLElement>('.inhalt')!;
  const karte = document.getElementById('arbeitstag')!;
  flaeche.getBoundingClientRect = () => ({ top: 0, left: 232 }) as DOMRect;
  Object.defineProperty(inhalt, 'clientWidth', { value: 1208, configurable: true });
  karte.getBoundingClientRect = () =>
    ({ top: 250 + Number(karte.dataset.taktOben ?? 0), height: 260 + Number(karte.dataset.taktUnten ?? 0), left: 272 }) as DOMRect;
  return { flaeche, inhalt, karte };
}

describe('Arbeitstag und Timer-Leiste im Takt (E72, M8)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('die Karte „Arbeitstag“ liegt mit Oberkante und Höhe auf Rasterlinien', () => {
    const { flaeche, karte } = seite();
    ausrichten(flaeche);
    // Oberkante 250 → 264 (Linie bei 24 + 10 × 24), Höhe 260 → 264 (11 Zellen).
    expect(karte.style.marginTop).toBe('14px');
    expect(karte.style.paddingBottom).toBe('4px');
  });

  it('die Spaltenbreite steht auch an der Fläche, für die Leiste neben `.inhalt`', () => {
    const { flaeche, inhalt } = seite();
    ausrichten(flaeche);
    expect(flaeche.style.getPropertyValue('--takt-breite')).toBe('1128px');
    expect(inhalt.style.getPropertyValue('--takt-breite')).toBe('1128px');
  });
});
