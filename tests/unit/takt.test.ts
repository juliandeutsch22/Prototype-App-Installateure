// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLATT_SELEKTOR, TAKT_SELEKTOR, ZELLE, ausgleichHoehe, ausgleichOben, ausrichten, taktBreite, taktHalten } from '@/lib/takt';

/*
  DER TAKT DES RASTERS (E33, 01.11.2026): jedes Blatt mit Ober- und Unterkante
  auf einer Rasterlinie, die Inhaltsspalte in ganzen Zellen. Hier die Regeln
  und das Ausrichten an einer nachgebildeten Seite; dass es im Browser auf
  jeder Seite stimmt, misst `tests/durchklick/raster.spec.ts`.
*/

describe('die Rechenregeln', () => {
  it('eine Zelle ist so groß wie das Raster der Arbeitsfläche', () => {
    expect(ZELLE).toBe(24);
    expect(readFileSync('src/styles/lot-planlinie.css', 'utf8')).toContain('background-size: 24px 24px;');
  });

  it('nach unten bis zur nächsten Linie — nie nach oben, nie mehr als 23 px', () => {
    expect(ausgleichOben(24, 24)).toBe(0);
    expect(ausgleichOben(250, 24)).toBe(14);
    expect(ausgleichOben(47, 24)).toBe(1);
    expect(ausgleichOben(25, 24)).toBe(23);
    // Bruchteile eines Pixels zählen nicht.
    expect(ausgleichOben(48.4, 24)).toBe(0);
  });

  it('die Höhe wächst auf ganze Zellen', () => {
    expect(ausgleichHoehe(72)).toBe(0);
    expect(ausgleichHoehe(97)).toBe(23);
    expect(ausgleichHoehe(100)).toBe(20);
  });

  it('die Spalte schrumpft auf ganze Zellen, mindestens eine', () => {
    expect(taktBreite(1128)).toBe(1128);
    expect(taktBreite(694)).toBe(672);
    expect(taktBreite(358)).toBe(336);
    expect(taktBreite(10)).toBe(24);
  });
});

describe('dieselbe Liste der Blätter in CSS und JavaScript', () => {
  const css = readFileSync('src/styles/lot-blatt.css', 'utf8');
  it('jeder Teil des Selektors steht in lot-blatt.css', () => {
    for (const teil of BLATT_SELEKTOR.split(/,\s(?=\.inhalt)/)) expect(css, teil).toContain(teil);
  });
  it('der Taktgeber richtet die Blätter und die Kontextspalten von Akte und Beleg aus', () => {
    expect(TAKT_SELEKTOR.startsWith(BLATT_SELEKTOR)).toBe(true);
    expect(TAKT_SELEKTOR).toContain('.akten-kontext, .beleg-kontext');
  });
  it('das Layout hält den Takt auf der Arbeitsfläche', () => {
    expect(readFileSync('src/app/Layout.tsx', 'utf8')).toMatch(/return main \? taktHalten\(main\) : undefined;/);
  });
});

/** Eine nachgebildete Seite: jsdom rechnet kein Layout, also legt der Test die Lage fest. */
function seite(lage: { oben: number; hoehe: number }) {
  document.body.innerHTML = `
    <main class="hauptflaeche" style="background-position: 40px 24px">
      <div class="inhalt" style="padding-left: 40px; padding-right: 40px">
        <div class="stapel">
          <section class="panel karte" id="blatt"><p>Inhalt</p></section>
        </div>
      </div>
    </main>`;
  const flaeche = document.querySelector<HTMLElement>('.hauptflaeche')!;
  const inhalt = document.querySelector<HTMLElement>('.inhalt')!;
  const blatt = document.getElementById('blatt')!;
  flaeche.getBoundingClientRect = () => ({ top: 0, left: 232 }) as DOMRect;
  Object.defineProperty(inhalt, 'clientWidth', { value: 1208, configurable: true });
  // Wie im Browser: der gesetzte Ausgleich verschiebt das Blatt und macht es höher.
  blatt.getBoundingClientRect = () =>
    ({ top: lage.oben + Number(blatt.dataset.taktOben ?? 0), height: lage.hoehe + Number(blatt.dataset.taktUnten ?? 0), left: 272 }) as DOMRect;
  return { flaeche, inhalt, blatt };
}

describe('ausrichten', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('setzt die Spalte auf ganze Zellen, die Oberkante und die Höhe des Blatts auf Linien', () => {
    const { flaeche, inhalt, blatt } = seite({ oben: 250, hoehe: 100 });
    ausrichten(flaeche);
    expect(inhalt.style.getPropertyValue('--takt-breite')).toBe('1128px');
    expect(blatt.style.marginTop).toBe('14px');
    expect(blatt.style.paddingBottom).toBe('20px');
  });

  it('ein Blatt, das schon auf den Linien liegt, bleibt unberührt', () => {
    const { flaeche, blatt } = seite({ oben: 264, hoehe: 96 });
    ausrichten(flaeche);
    expect(blatt.style.marginTop).toBe('');
    expect(blatt.style.paddingBottom).toBe('');
  });

  it('wiederholt gerechnet bleibt es beim selben Ausgleich — der eigene zählt nicht als Grundwert', () => {
    const { flaeche, blatt } = seite({ oben: 250, hoehe: 100 });
    ausrichten(flaeche);
    ausrichten(flaeche);
    expect(blatt.style.marginTop).toBe('14px');
    expect(blatt.style.paddingBottom).toBe('20px');
  });

  it('eine zweite Runde ohne Änderung schreibt nichts — die Seite springt nicht beim Umschalten eines Filters', () => {
    const { flaeche, blatt } = seite({ oben: 250, hoehe: 100 });
    ausrichten(flaeche);
    const geschrieben: string[] = [];
    for (const name of ['marginTop', 'paddingBottom'] as const) {
      Object.defineProperty(blatt.style, name, {
        configurable: true,
        get: () => blatt.style.getPropertyValue(name === 'marginTop' ? 'margin-top' : 'padding-bottom'),
        set: (w: string) => { geschrieben.push(`${name}=${w}`); },
      });
    }
    ausrichten(flaeche);
    expect(geschrieben).toEqual([]);
  });

  it('nach einer Größenänderung des Fensters wird von vorn gemessen — der Grundwert der Breite gilt', () => {
    const { flaeche, blatt } = seite({ oben: 250, hoehe: 100 });
    ausrichten(flaeche);
    // Ab einer anderen Breite hat das Stylesheet einen anderen Grundabstand; von vorn ist der eigene Ausgleich weg.
    ausrichten(flaeche, true);
    expect(blatt.style.marginTop).toBe('14px');
    expect(blatt.dataset.taktOben).toBe('14');
  });

  it('der Block darüber gibt seinen Rand nicht mehr an das Blatt ab (kein Durchfallen)', () => {
    const { flaeche, blatt } = seite({ oben: 250, hoehe: 100 });
    ausrichten(flaeche);
    expect(blatt.parentElement!.style.display).toBe('flow-root');
  });

  it('gleich geblieben: Karten in Fenstern, Dialogen und in Karten sind keine Blätter', () => {
    document.body.innerHTML = `
      <main class="hauptflaeche"><div class="inhalt">
        <section class="karte" id="a"><section class="karte" id="innen"></section></section>
        <div class="fenster"><section class="karte" id="fenster"></section></div>
        <div role="dialog"><section class="karte" id="dialog"></section></div>
        <aside class="akten-kontext"><section class="karte" id="kontext"></section></aside>
      </div></main>`;
    const blaetter = [...document.querySelectorAll(BLATT_SELEKTOR)].map((e) => e.id);
    expect(blaetter).toEqual(['a']);
  });
});

describe('taktHalten', () => {
  it('ohne ResizeObserver (alte Browser, Testumgebung) tut er nichts und lässt sich trotzdem beenden', () => {
    const { flaeche, blatt } = seite({ oben: 250, hoehe: 100 });
    const vorher = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    try {
      const ende = taktHalten(flaeche);
      expect(blatt.style.marginTop).toBe('');
      expect(() => ende()).not.toThrow();
    } finally {
      if (vorher) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = vorher;
    }
  });
});
