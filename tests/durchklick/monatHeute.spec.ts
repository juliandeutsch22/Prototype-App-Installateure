import { test, expect, type Page } from '@playwright/test';
import { CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/*
  HEUTE IM MONAT (E77, 11.11.2026): „die Markierung für den aktuellen Tag
  ist noch nicht gut gelöst“. Gemessen, was man sieht: die Spalte von heute
  ist Petrol-hell bis in die letzte Zeile, die Zahl im Kopf steht in einem
  Petrol-Kästchen innerhalb ihrer Spalte, keine Linie mehr links, und
  Darüberfahren rahmt die Zelle, statt sie zu tönen.

  Gegenprobe: mit dem Stand vor E77 (Fläche wie jeder Tag, Linie `::before`,
  Darüberfahren als Fläche) ist jede Messung rot.
*/
async function farbe(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const p = document.createElement('i'); p.style.color = `var(${t})`; document.body.append(p);
    const f = getComputedStyle(p).color; p.remove(); return f;
  }, token);
}

for (const breite of [834, 1440]) {
  test(`Heute ist im Monat die ganze Spalte, die Zahl im Kästchen — ${breite} px`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await anmelden(page, CHEFIN.email);
    await page.goto('/assignments/woche');
    await page.getByRole('button', { name: 'Monat', exact: true }).first().click();
    const kopf = page.locator('[data-heute]');
    await expect(kopf).toBeVisible({ timeout: 15_000 });
    const hell = await farbe(page, '--petrol-hell');
    const petrol = await farbe(page, '--petrol');
    const weiss = await farbe(page, '--auf-petrol');

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
    expect(m).toEqual({ kopf: hell, kasten: petrol, zahl: weiss, drin: true, lot: true, zellen: m.zellen, flaechen: [hell], linien: 0 });
    expect(m.zellen).toBeGreaterThan(0);

    // Darüberfahren über einen anderen Tag: ein Rahmen, die Fläche bleibt.
    const zelle = page.locator('.mo-hg').first();
    const vorher = await zelle.evaluate((z) => getComputedStyle(z).backgroundColor);
    await zelle.hover();
    await expect(zelle).toHaveCSS('box-shadow', new RegExp(`^${petrol.replace(/[()]/g, '\\$&')} 0px 0px 0px 1px inset$`));
    await expect(zelle).toHaveCSS('background-color', vorher);
  });
}
