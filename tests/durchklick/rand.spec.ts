import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * TEXT UND ZEICHEN HALTEN ABSTAND ZUR LINIE (Auftrag 02.11.2026): „auf der
 * Startseite und teilweise auch auf anderen Seiten liegen Text und Symbole
 * zu nah am Rand, ohne Abstand“. Seit E33 trägt jedes Blatt eine Linie rundum
 * und jedes Feld des Schriftfelds seine Feldlinien; was vorher auf offenem
 * Grund bündig stand, lag danach auf der Linie — die Zeilen von „Zu
 * erledigen“, Termine und Mannschaft auf der Startseite, der Vergleich der
 * Mitarbeiterübersicht am Handy, am Tablet Werte und Skizze im Schriftfeld.
 *
 * Gemessen wird im echten Browser, an jedem Textstück und jedem Zeichen
 * (Symbol, Achskreis, Zustand, Eingabefeld): der Abstand zur linken und
 * rechten Innenkante seines Blatts oder Felds, mindestens 8 px. Ohne die
 * Änderung meldete diese Prüfung 69 Stellen.
 *
 * Ausgenommen sind zwei Raster, deren Zellen bis an die Linie reichen und
 * ihren Text mittig tragen: der Monat der Planung (31 schmale Tagesspalten)
 * und die Woche, die in sich waagrecht rollt — dort liegt Text, der über die
 * Kante hinausgeht, im verdeckten Teil.
 */
const MINDESTENS = 8;

async function zuNah(page: Page): Promise<string[]> {
  await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
  return page.evaluate((mindestens) => {
    // Dieselben Blätter wie `TAKT_SELEKTOR` in `src/lib/takt.ts`, dazu die Felder des Schriftfelds.
    const BEHAELTER = [
      ".inhalt .karte:not(.karte .karte):not(:is(.fenster, .fenster-breit, .blatt, [role='dialog'], .akten-kontext, .beleg-kontext) .karte)",
      '.inhalt :is(.ue-liste, .ue-liste-woche, .ue-vergleich, .lot-einrichtung)',
      ".inhalt .monatskalender:not(:is(.karte, .fenster, .fenster-breit, .blatt, [role='dialog']) .monatskalender)",
      '.inhalt .schriftfeld .lage-punkt',
      '.inhalt .schriftfeld-skizze',
    ].join(', ');
    const AUSGENOMMEN = '.mo-raster, .wp-huelle';
    const funde: string[] = [];
    const sichtbar = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return false;
      }
      return true;
    };
    const pruefe = (r: DOMRect, el: Element, was: string) => {
      if (r.width < 1 || r.height < 1 || el.closest(AUSGENOMMEN)) return;
      const blatt = el.closest(BEHAELTER);
      if (!blatt) return;
      const q = blatt.getBoundingClientRect();
      if (r.bottom <= q.top || r.top >= q.bottom) return;
      const name = blatt.className.toString().split(' ').slice(0, 2).join('.');
      if (r.left - q.left < mindestens) funde.push(`links ${Math.round(r.left - q.left)} px in ${name}: ${was}`);
      if (q.right - r.right < mindestens) funde.push(`rechts ${Math.round(q.right - r.right)} px in ${name}: ${was}`);
    };
    const inhalt = document.querySelector('.inhalt');
    if (!inhalt) return ['keine .inhalt'];
    const gang = document.createTreeWalker(inhalt, NodeFilter.SHOW_TEXT);
    for (let n = gang.nextNode(); n; n = gang.nextNode()) {
      const text = n.textContent!.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest('.sr-only') || !sichtbar(el)) continue;
      const bereich = document.createRange();
      bereich.selectNodeContents(n);
      for (const r of bereich.getClientRects()) pruefe(r, el, `„${text.slice(0, 30)}“`);
    }
    for (const el of inhalt.querySelectorAll('svg, img, .achskreis, .stand, input:not([type=hidden]), select, textarea')) {
      if (el.parentElement?.closest('svg') || !sichtbar(el)) continue;
      pruefe(el.getBoundingClientRect(), el, `<${el.tagName.toLowerCase()} ${el.getAttribute('class') ?? ''}>`.slice(0, 50));
    }
    return [...new Set(funde)];
  }, MINDESTENS);
}

const BREITEN = [
  { name: 'Schreibtisch', width: 1440, height: 900 },
  { name: 'Tablet', width: 834, height: 1112 },
  { name: 'Handy', width: 390, height: 844 },
];

test('Text und Zeichen stehen nie auf der Linie eines Blatts oder Felds — in drei Breiten', async ({ page }) => {
  test.setTimeout(300_000);
  // Ein Einsatz und ein Termin heute: erst dann stehen auf der Startseite Mannschaft und Termine.
  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
  const { data: monteur } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
  const { data: chefin } = await admin.from('users').select('id').eq('email', CHEFIN.email).single();
  const { data: baustelle } = await admin.from('projects').select('id').eq('company_id', BETRIEB).limit(1).single();
  const einsatz = await admin.from('assignments').insert({
    company_id: BETRIEB, date: heute, project_number: BAUSTELLE.nummer, user_id: monteur!.id, user_name: MONTEUR.name,
  }).select('id').single();
  const termin = await admin.from('termine').insert({
    company_id: BETRIEB, datum: heute, art: 'Besichtigung', zeit_von: '09:00', zeit_bis: '10:00',
    project_number: BAUSTELLE.nummer, teilnehmer: [monteur!.id, chefin!.id],
  }).select('id').single();
  expect(einsatz.error).toBeNull();
  expect(termin.error).toBeNull();
  try {
    const SEITEN = ['/', '/accounting', '/admin-projects', `/admin-projects/${baustelle!.id}`, '/invoices', '/time', '/lager'];
    await anmelden(page, CHEFIN.email);
    const fehler: string[] = [];
    for (const breite of BREITEN) {
      await page.setViewportSize({ width: breite.width, height: breite.height });
      for (const pfad of SEITEN) {
        await page.goto(pfad);
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
        for (const f of await zuNah(page)) fehler.push(`${breite.name} ${pfad}: ${f}`);
      }
    }
    // Die Startseite muss mit beiden Spalten gemessen sein, sonst prüft dieser Weg zu wenig.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Die Mannschaft heute/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Termine heute/ })).toBeVisible();
    expect(fehler).toEqual([]);
    await keineFehlermeldung(page);
  } finally {
    await admin.from('assignments').delete().eq('id', einsatz.data!.id);
    await admin.from('termine').delete().eq('id', termin.data!.id);
  }
});

test('Das Schriftfeld schließt oben über die ganze Breite und in jeder angebrochenen Reihe', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  for (const breite of BREITEN) {
    await page.setViewportSize({ width: breite.width, height: breite.height });
    // Rechnungen: drei Felder — am Schreibtisch und Tablet mit freiem Stück vor der Skizze, am Handy eine angebrochene zweite Reihe.
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.schriftfeld .lage-punkt')).toHaveCount(3, { timeout: 15_000 });
    const lage = await page.evaluate(() => {
      const feld = document.querySelector<HTMLElement>('.schriftfeld')!;
      const zeile = feld.querySelector<HTMLElement>('.lage-zeile')!;
      const oben = getComputedStyle(feld, '::before');
      const fuell = getComputedStyle(zeile, '::after');
      const felder = [...zeile.querySelectorAll('.lage-punkt')].map((p) => p.getBoundingClientRect());
      const letzte = felder[felder.length - 1];
      return {
        breite: Math.round(feld.getBoundingClientRect().width),
        linieOben: oben.content !== 'none' ? Math.round(parseFloat(oben.width)) : 0,
        linieObenStark: oben.borderTopWidth,
        // Das freie Stück der letzten Reihe, wenn sie nicht bis zum Rand reicht.
        frei: Math.round(zeile.getBoundingClientRect().right - letzte.right),
        angebrochen: letzte.top > felder[0].top,
        fuellBreite: Math.round(parseFloat(fuell.width) || 0),
        fuellStark: fuell.borderTopWidth,
      };
    });
    expect(lage.linieOben, `${breite.name}: obere Linie`).toBe(lage.breite);
    expect(lage.linieObenStark).toBe('1px');
    if (lage.angebrochen) {
      expect(lage.fuellBreite, `${breite.name}: freies Stück der letzten Reihe`).toBe(lage.frei);
      expect(lage.fuellStark).toBe('1px');
    }
    if (breite.name === 'Handy') expect(lage.angebrochen, 'am Handy bricht die dritte Zelle um').toBe(true);
  }
});
