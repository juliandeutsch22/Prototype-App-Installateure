import { test, expect, type Page } from '@playwright/test';

/*
  E99 (18.11.2026) — DIE BESCHRIFTUNG DER MASSLINIE BLEIBT IM BLATT. Gemeldet
  am iPhone mit einem Bildschirmfoto der Baustellenakte: „…antes Ende 01.10.“
  — der Leistungszeitraum war um 48 Tage überschritten, die Soll-Marke stand
  bei 30 %, und ihre rechtsbündige Beschriftung lief links aus der Karte.

  Geprüft wird an jeder Maßlinie der Musterseite, in drei Breiten: jede
  Beschriftung liegt ganz innerhalb ihrer Linie, und zwei Beschriftungen auf
  derselben Höhe überdecken sich nicht. Die Musterseite trägt dafür den Fall
  aus dem Foto („Weit überschritten“) und einen, in dem der Überhang weder
  oben noch unten Platz hat („Eng, Überhang darunter“).

  Gegenprobe: mit `Planlinie.tsx` vor E99 beginnt „geplantes Ende 31.08.“
  bei 390 und 834 px links außerhalb der Linie (rot); bei 1440 px reicht der
  Platz vor der Marke. Die Wahl der Zeile für den Überhang prüft
  `Planlinie.test.tsx` mit vorgegebenen Breiten.
*/
async function messen(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('.masslinie')].map((linie) => {
    const r = linie.getBoundingClientRect();
    const teile = [...linie.querySelectorAll('.masslinie-soll, .masslinie-plus, .masslinie-ist')].map((t) => {
      const b = t.getBoundingClientRect();
      return { text: t.textContent ?? '', links: b.left - r.left, rechts: b.right - r.left, oben: Math.round(b.top - r.top), unten: Math.round(b.bottom - r.top) };
    });
    return { name: linie.getAttribute('aria-label') ?? '', breite: r.width, teile };
  }));
}

/*
  Dazu die Baustellenakte selbst: dort steht die Linie in der Spalte neben
  dem Aktenkontext. Am Tablet blieb ihr neben dem Namen zu wenig Platz, und
  „Budget 240 h · 240,0 h verbleibend“ lief rechts hinaus (Gegenprobe: mit
  dem Namen links daneben bis 1.199 px rot bei 834).
*/
const SEITEN = [
  { name: 'Musterseite', pfad: '%2F_muster', bereit: /Ende seit 79 Tagen überschritten/ },
  { name: 'Baustellenakte', pfad: '%2Fadmin-projects%2Fp1', bereit: /h gebucht von 240 h Budget/ },
];

for (const seite of SEITEN) for (const breite of [390, 834, 1440]) {
  test(`Maßlinien (${seite.name}) bei ${breite} px: jede Beschriftung im Blatt, keine über der anderen`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`./?pfad=${seite.pfad}&rolle=Administrator`);
    await expect(page.getByRole('img', { name: seite.bereit })).toBeVisible({ timeout: 20_000 });
    // Die Lage folgt den gemessenen Breiten; erst stehen lassen, dann messen.
    await expect(async () => {
      const linien = await messen(page);
      expect(linien.length).toBeGreaterThan(0);
      for (const l of linien) {
        for (const t of l.teile) {
          expect(t.links, `${l.name}: „${t.text}“ beginnt links außerhalb`).toBeGreaterThanOrEqual(-0.5);
          expect(t.rechts, `${l.name}: „${t.text}“ endet rechts außerhalb`).toBeLessThanOrEqual(l.breite + 0.5);
        }
        for (const a of l.teile) for (const b of l.teile) {
          if (a === b || a.oben !== b.oben) continue;
          const ueber = Math.min(a.rechts, b.rechts) - Math.max(a.links, b.links);
          expect(ueber, `${l.name}: „${a.text}“ und „${b.text}“ überdecken sich`).toBeLessThanOrEqual(0);
        }
      }
    }).toPass({ timeout: 10_000 });
  });
}
