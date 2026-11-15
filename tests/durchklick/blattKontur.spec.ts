import { test, expect, type Page } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/*
  DIE KONTUR EINES BLATTS LÄUFT NICHT DURCH EINE LEISTE, DIE FREI AUF DER
  SEITE SCHWEBT (S1, 15.11.2026). Gemeldet am iPhone: in der klebenden
  Speicherleiste der Firmendaten standen beim Rollen Rahmenstücke, eine Linie
  lief durch „Speichern“. Die Kontur der Blätter lag auf Ebene 11, die Leiste
  auf 10 — rollte ein Blatt darunter durch, wurde seine Kante über die Leiste
  gezeichnet. Ebenso bei der Sprungleiste der Angebotsakte (Ebene 5).

  Gemessen wird, was man sieht: der Bildpunkt in der Leiste, genau dort, wo
  die Kante eines fremden Blatts darunter liegt, hat die Farbe der Leiste und
  nicht die der Linie. Ein Vergleich mit einem gespeicherten Bild hätte das
  nicht gefunden — der falsche Zustand war stabil und damit „gleich“ (#456).

  Dass die Kontur über der Leiste IM EIGENEN Blatt liegt (E76), prüft
  `blattKanten.spec.ts` weiter.

  Gegenprobe: mit der Kontur auf Ebene 11 ist jede Prüfung hier rot.
*/
const BLATT = ".inhalt .karte:not(.karte .karte):not(:is(.fenster, .fenster-breit, .blatt, [role='dialog'], .akten-kontext, .beleg-kontext) .karte)";

type Kasten = { top: number; bottom: number; left: number; right: number };

/** Die Breiten, an denen die Leisten frei kleben: am Desktop-Chromium Handy und Tablet, sonst die des Geräts. */
function breiten(page: Page): number[] {
  const w = page.viewportSize()!.width;
  return test.info().project.name === 'chromium' ? [390, 834] : [w];
}

/**
 * Die Farben eines senkrechten Streifens (3 CSS-Pixel hoch, um die Zeile
 * `y`) in der Mitte von `x` — aus einem echten Bildschirmfoto, in einer
 * leeren Seite gelesen (die App erlaubt per Inhaltsregel keine data:-Bilder
 * in Leinwänden, die leere Seite schon).
 */
async function farben(page: Page, x: number, y: number): Promise<number[][]> {
  const bild = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y) - 1, width: 1, height: 3 } });
  const leser = await page.context().newPage();
  try {
    await leser.setContent('<body></body>');
    return await leser.evaluate(async (b64) => {
      const i = new Image();
      i.src = `data:image/png;base64,${b64}`;
      await i.decode();
      const c = document.createElement('canvas');
      c.width = i.naturalWidth; c.height = i.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(i, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const mitte = Math.floor(c.width / 2);
      const zeilen: number[][] = [];
      for (let z = 0; z < c.height; z += 1) { const j = (z * c.width + mitte) * 4; zeilen.push([d[j], d[j + 1], d[j + 2]]); }
      return zeilen;
    }, bild.toString('base64'));
  } finally {
    await leser.close();
  }
}

function rgb(farbe: string): number[] {
  return (farbe.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

/**
 * Rollt so, dass eine Kante (oben/unten) eines fremden Blatts `tief` Pixel
 * unter der Oberkante der Leiste liegt, und gibt Leiste und Kante zurück —
 * oder null, wenn kein Blatt so weit rollen kann.
 */
async function kanteInDieLeiste(page: Page, leisteSel: string, kante: 'oben' | 'unten', tief: number) {
  const anzahl = await page.locator(BLATT).count();
  for (let i = 0; i < anzahl; i += 1) {
    await page.evaluate(() => window.scrollTo(0, 0));
    // In Schritten: eine Leiste, die oben klebt, steht erst nach dem Rollen an ihrem Platz.
    let fremd = true;
    for (let schritt = 0; schritt < 4 && fremd; schritt += 1) {
      fremd = await page.evaluate(([sel, blatt, nr, k, t]) => {
        const leiste = document.querySelector(sel as string)!;
        const b = document.querySelectorAll(blatt as string)[nr as number];
        if (b.contains(leiste)) return false;
        const l = leiste.getBoundingClientRect(), q = b.getBoundingClientRect();
        const y = k === 'oben' ? q.top : q.bottom;
        window.scrollBy(0, Math.round(y - (l.top + (t as number))));
        return true;
      }, [leisteSel, BLATT, i, kante, tief] as const);
      await page.evaluate(() => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f))));
    }
    if (!fremd) continue;
    const lage = await page.evaluate(([sel, blatt, nr, k]) => {
      const l = document.querySelector(sel as string)!.getBoundingClientRect();
      const q = document.querySelectorAll(blatt as string)[nr as number].getBoundingClientRect();
      const kasten = (x: DOMRect) => ({ top: x.top, bottom: x.bottom, left: x.left, right: x.right });
      return { leiste: kasten(l), kanteY: k === 'oben' ? q.top + 0.5 : q.bottom - 0.5, blatt: kasten(q) };
    }, [leisteSel, BLATT, i, kante] as const);
    if (Math.abs(lage.kanteY - (lage.leiste.top + tief + (kante === 'oben' ? 0.5 : -0.5))) <= 1.5) return lage as { leiste: Kasten; kanteY: number; blatt: Kasten };
  }
  return null;
}

async function kanteUnsichtbar(page: Page, leisteSel: string, kante: 'oben' | 'unten', tief: number) {
  const lage = await kanteInDieLeiste(page, leisteSel, kante, tief);
  expect(lage, `kein Blatt rollt mit der ${kante === 'oben' ? 'Ober' : 'Unter'}kante durch die Leiste`).not.toBeNull();
  const { leiste, kanteY, blatt } = lage!;
  const grund = rgb(await page.locator(leisteSel).evaluate((l) => getComputedStyle(l).backgroundColor));
  // Mitten in der Leiste und mitten über dem Blatt — dort hat die Kante keinen Radius.
  const x = (Math.max(leiste.left, blatt.left) + Math.min(leiste.right, blatt.right)) / 2;
  for (const f of await farben(page, x, kanteY)) {
    const abstand = Math.max(...f.map((wert, j) => Math.abs(wert - grund[j])));
    expect(abstand, `Linie des Blatts sichtbar in der Leiste (Farbe ${f.join(',')} statt ${grund.join(',')})`).toBeLessThanOrEqual(3);
  }
}

test('Die freie Speicherleiste der Firmendaten bleibt über den Kanten der Blätter, die darunter rollen', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  for (const w of breiten(page)) {
    test.skip(w >= 1200, 'Am Schreibtisch steht die Leiste im Fluss, nicht klebend.');
    if (test.info().project.name === 'chromium') await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/settings/firma');
    const leiste = '.inhalt .aktionsleiste';
    await expect(page.locator(leiste)).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    expect(await page.locator(leiste).evaluate((l, b) => !l.closest(b) && getComputedStyle(l).position === 'sticky', BLATT)).toBe(true);
    // In der oberen Polsterung der Leiste, wo kein Text steht.
    await kanteUnsichtbar(page, leiste, 'oben', 6);
    await kanteUnsichtbar(page, leiste, 'unten', 6);
  }
});

test('Die Sprungleiste der Angebotsakte bleibt über den Kanten der Blätter, die darunter rollen', async ({ page }) => {
  const NR = 'A-KONTUR-0001';
  const raeumen = () => admin.from('quotes').delete().eq('company_id', BETRIEB).eq('quote_number', NR);
  await raeumen();
  try {
    const { data, error } = await admin.from('quotes').insert({
      company_id: BETRIEB, quote_number: NR, customer_name: 'Familie Kontur', address: 'Probegasse 7, 1010 Wien',
      quote_date: '2026-11-15', valid_until: '2099-12-31', status: 'Versendet', vat_rate: 0.2,
      subtotal_netto: 1200, total_netto: 1200, total_vat: 240, total_brutto: 1440,
    }).select('id').single();
    expect(error).toBeNull();
    // Genug Positionen, dass die Akte rollt.
    expect((await admin.from('quote_lines').insert(Array.from({ length: 12 }, (_, i) => ({
      company_id: BETRIEB, quote_id: data!.id, position: i, label: `Position ${i + 1}`, qty: 1, unit: 'Stk', unit_price: 100, netto: 100,
    })))).error).toBeNull();

    await anmelden(page, CHEFIN.email);
    for (const w of breiten(page)) {
      test.skip(w >= 1200, 'Am Schreibtisch steht die Sprungleiste links, nicht über den Blättern.');
      if (test.info().project.name === 'chromium') await page.setViewportSize({ width: w, height: 844 });
      await page.goto(`/quotes/${data!.id}`);
      const leiste = '.sprungleiste';
      await expect(page.locator(leiste)).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');
      // Unter dem Text der Verweise (48 px hoch): dort steht nichts, und der
      // Schatten der Kopfinsel am Handy reicht nicht so weit.
      await kanteUnsichtbar(page, leiste, 'oben', 40);
      await kanteUnsichtbar(page, leiste, 'unten', 40);
    }
  } finally {
    await raeumen();
  }
});
