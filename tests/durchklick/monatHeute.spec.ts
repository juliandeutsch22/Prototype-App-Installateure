import { test, expect, type Page } from '@playwright/test';
import { CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/*
  HEUTE IM MONAT (E77, 11.11.2026; seit V10, 13.11.2026): gemessen, was man
  sieht — der Kopf von heute ist dunkel mit heller Zahl (ohne eigenes
  Kästchen), die Spalte darunter warm vertieft bis in die letzte Zeile,
  keine Linie links, und Darüberfahren rahmt die Zelle fein, statt sie zu
  tönen.

  Gegenprobe: mit dem Stand vor V10 (Petrol-hell, Zahl im Petrol-Kästchen,
  Rahmen in Petrol) ist jede Messung rot.
*/
async function farbe(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const p = document.createElement('i'); p.style.color = `var(${t})`; document.body.append(p);
    const f = getComputedStyle(p).color; p.remove(); return f;
  }, token);
}

for (const breite of [834, 1440]) {
  test(`Heute ist im Monat die ganze Spalte unter dem dunklen Kopf — ${breite} px`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await anmelden(page, CHEFIN.email);
    await page.goto('/assignments/woche');
    await page.getByRole('button', { name: 'Monat', exact: true }).first().click();
    const kopf = page.locator('[data-heute]');
    await expect(kopf).toBeVisible({ timeout: 15_000 });
    const dunkel = await farbe(page, '--dunkel-flaeche');
    const aufDunkel = await farbe(page, '--auf-dunkel');
    const spalte = await farbe(page, '--heute');
    const kontur = await farbe(page, '--auswahl-kontur');

    const m = await kopf.evaluate((k) => {
      const nr = k.querySelector('.mo-nr')!;
      const a = k.getBoundingClientRect(), r = nr.getBoundingClientRect();
      const zellen = [...document.querySelectorAll('.mo-hg-heute')];
      return {
        kopf: getComputedStyle(k).backgroundColor,
        kasten: getComputedStyle(nr).backgroundColor,
        zahl: getComputedStyle(nr).color,
        drin: r.left >= a.left - 0.5 && r.right <= a.right + 0.5,
        lot: !!k.querySelector('.spalten-lot'),
        zellen: zellen.length,
        flaechen: [...new Set(zellen.map((z) => getComputedStyle(z).backgroundColor))],
        linien: zellen.concat(k).filter((z) => getComputedStyle(z, '::before').content !== 'none').length,
      };
    });
    expect(m).toEqual({ kopf: dunkel, kasten: 'rgba(0, 0, 0, 0)', zahl: aufDunkel, drin: true, lot: true, zellen: m.zellen, flaechen: [spalte], linien: 0 });
    expect(m.zellen).toBeGreaterThan(0);

    // Darüberfahren über einen anderen Tag: ein Rahmen, die Fläche bleibt.
    const zelle = page.locator('.mo-hg').first();
    const vorher = await zelle.evaluate((z) => getComputedStyle(z).backgroundColor);
    await zelle.hover();
    await expect(zelle).toHaveCSS('box-shadow', new RegExp(`^${kontur.replace(/[()]/g, '\\$&')} 0px 0px 0px 1px inset$`));
    await expect(zelle).toHaveCSS('background-color', vorher);
  });
}
