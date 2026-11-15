import { test, expect, type Page } from '@playwright/test';

/*
  BEWEGUNGEN UND GESTEN (Plan 15.11.2026, Abschnitt 4 B1–B12, F15) im echten
  Browser — gegen die Vorschau, ohne Datenbank. Jsdom rechnet weder Layout
  noch Animationen; ob ein Blatt von unten kommt oder eine Zeile zusammenklappt,
  sieht nur ein Browser.

  JEDE BEWEGUNG ZWEIMAL: einmal mit Bewegung (es gibt einen Weg), einmal mit
  „Bewegung reduzieren“ (derselbe Endzustand, sofort, ohne Weg).

  Gemessen wird je Bild (`requestAnimationFrame`), nicht mit festen Pausen:
  eine Pause trifft je nach Rechner einen anderen Augenblick der Bewegung.
*/

const pfad = (route: string, rolle = 'Administrator') => `./?pfad=${encodeURIComponent(route)}&rolle=${rolle}`;

/**
 * Je Bild einen Wert aufzeichnen — ab dem Bild, in dem das Element (wieder)
 * da ist, `ms` lang; verschwindet es, endet die Spur mit „—“.
 */
async function aufzeichnen(page: Page, sel: string, eigenschaft: 'transform' | 'opacity', ms = 420) {
  await page.evaluate(([sel, eigenschaft, ms]) => {
    const w = window as unknown as { spur: Array<[number, string]>; spurFertig: boolean };
    w.spur = [];
    w.spurFertig = false;
    let t0 = -1;
    const bild = () => {
      const el = document.querySelector(sel as string);
      if (el && t0 < 0) t0 = performance.now();
      if (t0 >= 0) w.spur.push([performance.now() - t0, el ? getComputedStyle(el)[eigenschaft as 'transform'] : '—']);
      if (t0 < 0 || (performance.now() - t0 < (ms as number) && el)) requestAnimationFrame(bild);
      else w.spurFertig = true;
    };
    requestAnimationFrame(bild);
  }, [sel, eigenschaft, ms] as const);
}
async function spur(page: Page): Promise<Array<[number, string]>> {
  await page.waitForFunction(() => (window as unknown as { spurFertig: boolean }).spurFertig);
  return page.evaluate(() => (window as unknown as { spur: Array<[number, string]> }).spur);
}
/** Verschiebung aus einer Matrix: [x, y]. `none` und `—` zählen als 0. */
function versatz(m: string): [number, number] {
  const z = /matrix\(([^)]+)\)/.exec(m)?.[1].split(',').map(Number);
  return z ? [z[4], z[5]] : [0, 0];
}

test.describe('B1 Blatt von unten', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('fährt von unten herein und steht am Ende ohne Versatz', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/'));
    await expect(page.locator('.unten button').filter({ hasText: 'Mehr' })).toBeVisible();
    await aufzeichnen(page, '.blatt', 'transform');
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(Math.max(...s)).toBeGreaterThan(100);
    expect(s[s.length - 1]).toBe(0);
    // Von unten herauf: der Versatz nimmt nur ab.
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThanOrEqual(s[i - 1] + 0.5);
  });

  test('schließt nach unten und gibt erst danach den Platz frei', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/'));
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    const dialog = page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);
    await aufzeichnen(page, '.blatt', 'transform', 300);
    await page.keyboard.press('Escape');
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(Math.max(...s)).toBeGreaterThan(100);
    await expect(dialog).toHaveCount(0);
  });

  test('weggezogen fährt es aus der Lage des Fingers weiter, ohne zurückzuspringen', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/'));
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    await page.waitForTimeout(400);
    const griff = (await page.locator('.blatt-griff').boundingBox())!;
    await page.mouse.move(griff.x + griff.width / 2, griff.y + 8);
    await page.mouse.down();
    await page.mouse.move(griff.x + griff.width / 2, griff.y + 168, { steps: 10 });
    await aufzeichnen(page, '.blatt', 'transform', 300);
    await page.mouse.up();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(s[0]).toBeGreaterThan(140);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 0.5);
    await expect(page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true })).toHaveCount(0);
  });

  test('mit reduzierter Bewegung steht es sofort da — dasselbe Endbild', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(pfad('/'));
    await expect(page.locator('.unten button').filter({ hasText: 'Mehr' })).toBeVisible();
    await aufzeichnen(page, '.blatt', 'transform');
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(s.length).toBeGreaterThan(0);
    expect(Math.max(...s)).toBe(0);
  });
});

test.describe('B1 Seitenfenster ab dem Tablet', () => {
  test.use({ viewport: { width: 834, height: 1112 }, hasTouch: true });
  test('kommt von rechts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/invoices'));
    await expect(page.getByRole('button', { name: 'Hilfe zu dieser Seite' }).first()).toBeVisible();
    await aufzeichnen(page, '.fenster', 'transform');
    await page.getByRole('button', { name: 'Hilfe zu dieser Seite' }).first().click();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m));
    expect(Math.max(...s.map(([x]) => x))).toBeGreaterThan(100);
    expect(Math.max(...s.map(([, y]) => Math.abs(y)))).toBe(0);
    expect(s[s.length - 1]).toEqual([0, 0]);
  });
});

/** Eine Liste mit mindestens vier Zeilen auf der Seite: ihre Zeilen in DOM-Reihenfolge. */
async function listeMitZeilen(page: Page) {
  await page.waitForFunction(() => [...document.querySelectorAll('ul')].some((u) => u.querySelectorAll(':scope > li.zeile').length >= 4));
  // Die Ruhe nach dem Seitenwechsel abwarten (`zeilenflussRuhe`).
  await page.waitForTimeout(700);
}

test.describe('B2 Zeile verschwindet', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const reduziert of [false, true]) test(`klappt zusammen, Nachbarn rücken nach${reduziert ? ' — reduziert: sofort, dasselbe Endbild' : ''}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduziert ? 'reduce' : 'no-preference' });
    await page.goto(pfad('/time'));
    await listeMitZeilen(page);
    const ergebnis = await page.evaluate(async () => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelectorAll(':scope > li.zeile').length >= 4)!;
      const zeilen = [...ul.querySelectorAll<HTMLElement>(':scope > li.zeile')];
      const weg = zeilen[1], nachbar = zeilen[2];
      const hoehe = weg.getBoundingClientRect().height;
      const vorher = nachbar.getBoundingClientRect().top;
      // React nimmt eine Zeile heraus — hier von Hand, derselbe Eingriff im DOM.
      weg.remove();
      const bilder: Array<{ geist: boolean; y: number; top: number }> = [];
      const t0 = performance.now();
      await new Promise<void>((fertig) => {
        const bild = () => {
          const t = getComputedStyle(nachbar).transform;
          bilder.push({ geist: !!ul.querySelector('[data-geist]'), y: t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42, top: nachbar.getBoundingClientRect().top });
          if (performance.now() - t0 < 400) requestAnimationFrame(bild); else fertig();
        };
        requestAnimationFrame(bild);
      });
      const geist = ul.querySelector('[data-geist]');
      return { hoehe, vorher, bilder, geistAmEnde: !!geist, endeOben: nachbar.getBoundingClientRect().top };
    });
    // Am Ende: die Lücke ist zu, kein Abbild bleibt — mit und ohne Bewegung gleich.
    expect(ergebnis.geistAmEnde).toBe(false);
    expect(Math.abs(ergebnis.vorher - ergebnis.hoehe - ergebnis.endeOben)).toBeLessThan(1.5);
    if (reduziert) {
      expect(ergebnis.bilder.every((b) => !b.geist && b.y === 0)).toBe(true);
    } else {
      expect(ergebnis.bilder[0].geist).toBe(true);
      // Der Nachbar startet an seiner alten Stelle (sichtbar) und gleitet hinauf.
      expect(ergebnis.bilder[0].y).toBeGreaterThan(ergebnis.hoehe * 0.5);
      for (let i = 1; i < ergebnis.bilder.length; i++) expect(ergebnis.bilder[i].y).toBeLessThanOrEqual(ergebnis.bilder[i - 1].y + 0.5);
      expect(ergebnis.bilder[ergebnis.bilder.length - 1].y).toBe(0);
    }
  });

  test('das Abbild ist stumm und nicht bedienbar; der Fokus geht auf die nächste Zeile', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/time'));
    await listeMitZeilen(page);
    const r = await page.evaluate(() => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelectorAll(':scope > li.zeile').length >= 4)!;
      const zeilen = [...ul.querySelectorAll<HTMLElement>(':scope > li.zeile')];
      const ziel = zeilen[1].querySelector<HTMLElement>('a, button')!;
      ziel.focus();
      const naechstes = zeilen[2].querySelector<HTMLElement>('a, button')!;
      zeilen[1].remove();
      return new Promise<{ aria: string | null; inert: boolean; ids: number; fokusNaechste: boolean }>((fertig) => requestAnimationFrame(() => {
        const g = ul.querySelector<HTMLElement>('[data-geist]');
        fertig({ aria: g?.getAttribute('aria-hidden') ?? null, inert: !!g?.hasAttribute('inert'), ids: g ? g.querySelectorAll('[id]').length + (g.id ? 1 : 0) : -1, fokusNaechste: document.activeElement === naechstes });
      }));
    });
    expect(r).toEqual({ aria: 'true', inert: true, ids: 0, fokusNaechste: true });
  });

  test('ein Austausch vieler Zeilen (Filter) bewegt nichts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/time'));
    await listeMitZeilen(page);
    const geister = await page.evaluate(() => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelectorAll(':scope > li.zeile').length >= 4)!;
      for (const z of [...ul.querySelectorAll(':scope > li.zeile')].slice(0, 4)) z.remove();
      return new Promise<number>((fertig) => requestAnimationFrame(() => fertig(ul.querySelectorAll('[data-geist]').length)));
    });
    expect(geister).toBe(0);
  });
});

test.describe('B3 Zeile kommt dazu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  /** Eine neue Zeile an zweiter Stelle — so, wie React sie einfügt. */
  const einfuegen = (page: Page, art: 'neu' | 'umstellen' | 'leere-liste') => page.evaluate(async (art) => {
    const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelectorAll(':scope > li.zeile').length >= 4)!;
    const zeilen = [...ul.querySelectorAll<HTMLElement>(':scope > li.zeile')];
    const nachbar = zeilen[1];
    let neu: HTMLElement;
    if (art === 'umstellen') {
      neu = zeilen[3];
      ul.insertBefore(neu, nachbar);
    } else if (art === 'leere-liste') {
      const leer = document.createElement('ul');
      ul.after(leer);
      neu = zeilen[0].cloneNode(true) as HTMLElement;
      leer.append(neu, zeilen[1].cloneNode(true));
    } else {
      neu = zeilen[0].cloneNode(true) as HTMLElement;
      ul.insertBefore(neu, nachbar);
    }
    const auswahl = getComputedStyle(document.documentElement).getPropertyValue('--auswahl').trim();
    const probe = document.createElement('i'); probe.style.color = auswahl; document.body.append(probe);
    const auswahlRgb = getComputedStyle(probe).color; probe.remove();
    const bilder: Array<{ deck: number; grund: string; y: number }> = [];
    const t0 = performance.now();
    await new Promise<void>((fertig) => {
      const bild = () => {
        const t = getComputedStyle(nachbar).transform;
        bilder.push({ deck: Number(getComputedStyle(neu).opacity), grund: getComputedStyle(neu).backgroundColor, y: t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42 });
        if (performance.now() - t0 < 300) requestAnimationFrame(bild); else fertig();
      };
      requestAnimationFrame(bild);
    });
    return { bilder, auswahlRgb };
  }, art);

  test('blendet ein, trägt kurz die Auswahlfläche, Nachbarn rücken von oben nach', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/time'));
    await listeMitZeilen(page);
    const { bilder, auswahlRgb } = await einfuegen(page, 'neu');
    expect(bilder[0].deck).toBeLessThan(1);
    expect(bilder[0].grund).toBe(auswahlRgb);
    expect(bilder[0].y).toBeLessThan(-10);
    expect(bilder[bilder.length - 1].y).toBe(0);
    expect(bilder[bilder.length - 1].deck).toBe(1);
  });

  test('mit reduzierter Bewegung steht sie sofort da, ohne Markierung', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(pfad('/time'));
    await listeMitZeilen(page);
    const { bilder, auswahlRgb } = await einfuegen(page, 'neu');
    expect(bilder.every((b) => b.deck === 1 && b.y === 0 && b.grund !== auswahlRgb)).toBe(true);
  });

  test('gleich geblieben: umgestellte Zeilen und das erste Füllen einer Liste werden nicht markiert', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/time'));
    await listeMitZeilen(page);
    for (const art of ['umstellen', 'leere-liste'] as const) {
      const { bilder, auswahlRgb } = await einfuegen(page, art);
      expect(bilder.every((b) => b.deck === 1 && b.grund !== auswahlRgb), art).toBe(true);
    }
  });
});

test.describe('B5 Unterlinie gleitet', () => {
  for (const fall of [
    { route: '/settings/firma', role: 'link' as const, name: 'Personal', breite: 390 },
    { route: '/customers/k1', role: 'tab' as const, name: 'Stammdaten', breite: 390 },
    { route: '/invoices', role: 'button' as const, name: 'Erledigt', breite: 1440 },
  ]) for (const reduziert of [false, true]) test(`${fall.route} → ${fall.name}${reduziert ? ' — reduziert: sofort' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width: fall.breite, height: 900 });
    await page.emulateMedia({ reducedMotion: reduziert ? 'reduce' : 'no-preference' });
    await page.goto(pfad(fall.route));
    const wahl = page.getByRole(fall.role, { name: fall.name, exact: true });
    await expect(wahl).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { striche: number[]; strichFertig: boolean };
      w.striche = []; w.strichFertig = false;
      const t0 = performance.now();
      const bild = () => {
        const s = document.querySelector<HTMLElement>('[data-unterlinie]');
        const t = s ? getComputedStyle(s).transform : null;
        w.striche.push(s ? (t === 'none' ? 0 : new DOMMatrixReadOnly(t!).m41) : NaN);
        if (performance.now() - t0 < 700) requestAnimationFrame(bild); else w.strichFertig = true;
      };
      requestAnimationFrame(bild);
    });
    await wahl.click();
    await page.waitForFunction(() => (window as unknown as { strichFertig: boolean }).strichFertig);
    const striche = await page.evaluate(() => (window as unknown as { striche: number[] }).striche);
    const da = striche.filter((x) => !Number.isNaN(x));
    if (reduziert) expect(da).toEqual([]);
    else {
      expect(Math.max(...da.map(Math.abs))).toBeGreaterThan(8);
      expect(da[da.length - 1]).toBe(0);
    }
    // Am Ende: kein Strich mehr, die Kante gehört wieder dem Reiter — wie vorher.
    expect(Number.isNaN(striche[striche.length - 1])).toBe(true);
    const kante = await wahl.evaluate((el) => getComputedStyle(el).borderBottomColor);
    expect(kante).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('B7 Arbeitstag Start/Pause/Stopp', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  /** Den Tag starten und je Bild aufzeichnen: Fläche, Deckkraft des Inhalts, Lage des neuen Knopfs. */
  async function starten(page: Page) {
    await page.goto(pfad('/', 'Mitarbeiter') + '&module=zeiterfassung.timer');
    const start = page.getByRole('button', { name: 'Arbeitstag starten' });
    await expect(start).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { tag: Array<{ stand?: string; deck: number; knopf: string }>; tagFertig: boolean };
      w.tag = []; w.tagFertig = false;
      let t0 = -1;
      const bild = () => {
        const a = document.querySelector<HTMLElement>('.arbeitstag')!;
        const lauf = a.querySelector('.arbeitstag-lauf');
        if (lauf && t0 < 0) t0 = performance.now();
        if (t0 >= 0) {
          const k = a.querySelector('.arbeitstag-knoepfe .rund-knopf');
          w.tag.push({ stand: a.dataset.stand, deck: Number(getComputedStyle(lauf!).opacity), knopf: k ? getComputedStyle(k).transform : '—' });
        }
        if (t0 < 0 || performance.now() - t0 < 300) requestAnimationFrame(bild); else w.tagFertig = true;
      };
      requestAnimationFrame(bild);
    });
    await start.click();
    await page.waitForFunction(() => (window as unknown as { tagFertig: boolean }).tagFertig);
    return page.evaluate(() => (window as unknown as { tag: Array<{ stand?: string; deck: number; knopf: string }> }).tag);
  }

  test('der Inhalt blendet mit der Fläche ein, der neue Knopf kommt aus der Verkleinerung', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const tag = await starten(page);
    expect(tag[0].stand).toBe('laeuft');
    expect(tag[0].deck).toBeLessThan(0.5);
    expect(tag[0].knopf).not.toBe('none');
    expect(tag[tag.length - 1]).toEqual({ stand: 'laeuft', deck: 1, knopf: 'none' });
    // Die Knöpfe sind währenddessen bedienbar: „Pause“ greift sofort.
    await page.getByRole('button', { name: 'Pause beginnen' }).click();
    await expect(page.locator('.arbeitstag')).toHaveAttribute('data-stand', 'pause');
  });

  test('mit reduzierter Bewegung wechselt alles sofort', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const tag = await starten(page);
    expect(tag.every((b) => b.stand === 'laeuft' && b.deck === 1 && b.knopf === 'none')).toBe(true);
  });
});

test.describe('B4 Speichern bestätigt', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  async function aendernUndSpeichern(page: Page) {
    await page.goto(pfad('/settings/firma'));
    const feld = page.getByLabel('Bank', { exact: true });
    await expect(feld).toBeVisible();
    await feld.fill('Prüfbank Wien');
    const leiste = page.locator('.aktionsleiste').last();
    await expect(leiste).not.toHaveAttribute('data-ruht');
    await page.evaluate(() => {
      const w = window as unknown as { haken: number[]; hakenFertig: boolean };
      w.haken = []; w.hakenFertig = false;
      let t0 = -1;
      const bild = () => {
        const p = document.querySelector('.lot-knopf[data-zustand=gespeichert] svg path');
        if (p && t0 < 0) t0 = performance.now();
        if (p) w.haken.push(parseFloat(getComputedStyle(p).strokeDashoffset) || 0);
        if (t0 < 0 || performance.now() - t0 < 200) requestAnimationFrame(bild); else w.hakenFertig = true;
      };
      requestAnimationFrame(bild);
    });
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gespeichert' })).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { hakenFertig: boolean }).hakenFertig);
    return { leiste, feld, haken: await page.evaluate(() => (window as unknown as { haken: number[] }).haken) };
  }

  test('der Haken zeichnet sich, dann zieht sich die Leiste zurück; eine Änderung holt sie sofort', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const { leiste, feld, haken } = await aendernUndSpeichern(page);
    expect(haken[0]).toBeGreaterThan(5);
    expect(haken[haken.length - 1]).toBe(0);
    await expect(leiste).toHaveAttribute('data-ruht', '');
    // Erst bleibt sie lesbar stehen …
    expect(await leiste.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
    // … dann ist sie weg und nimmt keinen Tipp mehr an.
    await expect.poll(() => leiste.evaluate((el) => getComputedStyle(el).visibility), { timeout: 3000 }).toBe('hidden');
    expect(await leiste.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeGreaterThan(20);
    await feld.fill('Prüfbank Graz');
    await expect(leiste).not.toHaveAttribute('data-ruht');
    expect(await leiste.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
    await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeVisible();
  });

  test('mit reduzierter Bewegung: Haken sofort, nach der Lesezeit ist die Leiste ohne Weg verschwunden', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { leiste, haken } = await aendernUndSpeichern(page);
    expect(Math.max(...haken)).toBe(0);
    const lagen = await leiste.evaluate((el) => new Promise<string[]>((fertig) => {
      const werte: string[] = [];
      const t0 = performance.now();
      const bild = () => {
        const t = getComputedStyle(el).transform;
        werte.push(`${getComputedStyle(el).opacity} ${t === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(t).m42)}`);
        if (performance.now() - t0 < 1700) requestAnimationFrame(bild); else fertig(werte);
      };
      requestAnimationFrame(bild);
    }));
    // Nur zwei Bilder: stehend, dann weg — kein Zwischenstand.
    expect([...new Set(lagen)].length).toBe(2);
    expect(lagen[0]).toBe('1 0');
    expect(lagen[lagen.length - 1]).toMatch(/^0 [1-9]\d+$/);
    await expect.poll(() => leiste.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  });

  test('gleich geblieben: am Schreibtisch bleibt die Leiste stehen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { leiste } = await aendernUndSpeichern(page);
    await page.waitForTimeout(1600);
    expect(await leiste.evaluate((el) => [getComputedStyle(el).visibility, getComputedStyle(el).transform, getComputedStyle(el).opacity])).toEqual(['visible', 'none', '1']);
  });
});
