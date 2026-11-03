import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * ZEICHEN MITTIG ZUM TEXT (Auftrag 03.11.2026, mit Bildschirmfoto: „die Icons
 * z. B. auf der Startseite sind nicht mit dem Text zentriert“).
 *
 * Gemessen wird gegen die Mitte der Versalhöhe (Grundlinie − 0,35 em), also
 * dort, wo Ziffern und Großbuchstaben ihre Mitte haben:
 * - das Zustandszeichen vor dem Wort (Dreieck, Kreis …): es lag mittig in der
 *   22 px hohen Box, 2,5 px unter der Schriftmitte;
 * - rechts in der Zeile Statuswort und „›“: das Wort stand oben in seiner Box,
 *   1,2 px über dem Pfeil.
 * Gleich geblieben: vorn in der Detailzeile (Handy) steht das Wort auf der
 * Grundlinie des Details (Rückmeldung 31.10.2026).
 */
const TOLERANZ = 0.75;

async function messen(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('.start-zeile')].flatMap((z) => {
    const st = [...z.querySelectorAll<HTMLElement>('.stand')].find((e) => e.offsetParent !== null);
    if (!st) return [];
    const fs = parseFloat(getComputedStyle(st).fontSize);
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0';
    st.appendChild(probe);
    const grund = probe.getBoundingClientRect().bottom;
    probe.remove();
    const versal = grund - 0.35 * fs;
    // Das Zeichen ist ein ::before ohne eigene Box im DOM: es sitzt auf der Grundlinie (14 px hoch) plus seinem Versatz.
    const vor = getComputedStyle(st, '::before');
    const zeichen = grund - parseFloat(vor.height) / 2 + (parseFloat(vor.top) || 0);
    const pfeil = z.querySelector('.zeile-pfeil')?.getBoundingClientRect();
    // Vorn steht das Wort im Fließtext des Details: gemessen wird die Grundlinie direkt dahinter, in derselben Zeile.
    const vorn = st.closest('.start-status-vorn');
    let detailGrund: number | null = null;
    if (vorn) {
      const p = document.createElement('span');
      p.style.cssText = 'display:inline-block;width:0;height:0';
      vorn.after(p);
      detailGrund = p.getBoundingClientRect().bottom;
      p.remove();
    }
    return [{
      wort: st.textContent ?? '',
      zeichen: zeichen - versal,
      pfeil: pfeil && st.closest('.start-status-rechts') ? (pfeil.top + pfeil.bottom) / 2 - versal : null,
      grundZumDetail: detailGrund === null ? null : grund - detailGrund,
    }];
  }));
}

test('Zustandszeichen und „›“ stehen mittig zur Schrift — am Schreibtisch und am Handy', async ({ page }) => {
  test.setTimeout(120_000);
  // Eine überschrittene Baustelle: dann steht auf der Startseite ein Dreieck in „Dringend“.
  const { data: b } = await admin.from('projects').select('id, end_date, status').eq('company_id', BETRIEB).eq('project_number', BAUSTELLE.nummer).single();
  await admin.from('projects').update({ end_date: '2026-10-01', status: 'Aktiv' }).eq('id', b!.id);
  try {
    await anmelden(page, CHEFIN.email);
    for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width: breite, height: hoehe });
      await page.goto('/');
      await expect(page.locator('.stand:visible', { hasText: 'Ende überschritten' })).toBeVisible({ timeout: 15_000 });
      const werte = await messen(page);
      expect(werte.length, `${breite}: Zeilen mit Zustand`).toBeGreaterThan(1);
      for (const w of werte) {
        expect(Math.abs(w.zeichen), `${breite} ${w.wort}: Zeichen zur Schriftmitte`).toBeLessThan(TOLERANZ);
        if (w.pfeil !== null) expect(Math.abs(w.pfeil), `${breite} ${w.wort}: „›“ zur Schriftmitte`).toBeLessThan(TOLERANZ);
        if (w.grundZumDetail !== null) expect(Math.abs(w.grundZumDetail), `${breite} ${w.wort}: Grundlinie wie das Detail`).toBeLessThan(0.5);
      }
      // Am Schreibtisch rechts mit Pfeil, am Handy vorn im Detail — sonst prüft dieser Weg zu wenig.
      if (breite === 1440) expect(werte.some((w) => w.pfeil !== null)).toBe(true);
      else expect(werte.some((w) => w.grundZumDetail !== null)).toBe(true);
    }
    /*
      Der Versatz hängt an der Schriftgröße (7 px − 0,35 em). In den Listen hat
      das Wort 13 px statt 12 — auch dort muss das Zeichen mittig stehen.
    */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin-projects');
    await expect(page.locator('.stand:visible').first()).toBeVisible({ timeout: 15_000 });
    const liste = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.inhalt .stand')].filter((e) => e.offsetParent !== null).map((st) => {
      const fs = parseFloat(getComputedStyle(st).fontSize);
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0';
      st.appendChild(probe);
      const grund = probe.getBoundingClientRect().bottom;
      probe.remove();
      const vor = getComputedStyle(st, '::before');
      return { wort: st.textContent ?? '', fs, abstand: grund - parseFloat(vor.height) / 2 + (parseFloat(vor.top) || 0) - (grund - 0.35 * fs) };
    }));
    expect(liste.length).toBeGreaterThan(0);
    expect(liste.some((w) => w.fs === 13)).toBe(true);
    for (const w of liste) expect(Math.abs(w.abstand), `Baustellen ${w.wort} (${w.fs} px): Zeichen zur Schriftmitte`).toBeLessThan(TOLERANZ);
    await keineFehlermeldung(page);
  } finally {
    await admin.from('projects').update({ end_date: b!.end_date, status: b!.status }).eq('id', b!.id);
  }
});
