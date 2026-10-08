/**
 * Bildschirmfotos je Seite (Umbau „Lot“, Phase A, A3; Entscheidung E6).
 *
 * Je Seite EINE Rolle — die, die sie am vollständigsten sieht —, in drei
 * Breiten, ganzseitig als JPEG (Qualität 60). Alle Rollen mal alle Seiten
 * mal drei Breiten wären über tausend Bilder im Repository.
 *
 * WELCHE ROLLE, entscheidet die Bestandsaufnahme selbst: die Variante mit
 * den meisten sichtbaren Elementen auf dieser Seite bei 1440 px. Bei
 * Gleichstand gewinnt die Reihenfolge Administrator, Geschäftsführung, dann
 * die übrigen; der Supportmodus nur, wo er allein hinkommt. Monteurseiten
 * fallen so von selbst an Mitarbeiter bzw. Lehrling.
 *
 *   BESTAND_QUELLE=vorher npx playwright test -c playwright.bestand.config.ts --project=fotos
 *
 * Liest `docs/ui-umbau/bestand-<quelle>.json` und schreibt nach
 * `docs/ui-umbau/<quelle>/<seite>-<breite>.jpg`.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { BASIS, BREITEN, QUELLE, UHR, VARIANTEN } from './bestand/varianten';
import { seitenKuerzel, type Element } from './bestand/sammler';

const DATEI = path.resolve('docs/ui-umbau', `bestand-${QUELLE}.json`);
const ZIEL = path.resolve('docs/ui-umbau', QUELLE);
const VORZUG = ['administrator', 'geschaeftsfuehrung', ...VARIANTEN.map((v) => v.schluessel)];

interface Bestand {
  kopf: { aufnahmen: Array<{ variante: string; breite: number; seiten: Array<{ seite: string; pfad: string }> }> };
  elemente: Element[];
}

/** Seite → (Variante, Pfad), gewählt nach der Zahl sichtbarer Elemente bei 1440 px. */
function auswahl(b: Bestand): Array<{ seite: string; pfad: string; variante: string }> {
  const zahl = new Map<string, number>();
  for (const e of b.elemente) {
    if (e.breite !== 1440 || e.zustand === 'ausgeblendet' || e.seite === '(huelle)') continue;
    const k = `${e.seite}|${e.variante}`;
    zahl.set(k, (zahl.get(k) ?? 0) + 1);
  }
  const pfade = new Map<string, string>();
  for (const a of b.kopf.aufnahmen) for (const s of a.seiten) pfade.set(`${s.seite}|${a.variante}`, s.pfad);
  const seiten = [...new Set([...zahl.keys()].map((k) => k.split('|')[0]))].sort();
  return seiten.map((seite) => {
    const kandidaten = VARIANTEN.map((v) => v.schluessel).filter((v) => zahl.has(`${seite}|${v}`));
    const ohneSupport = kandidaten.filter((v) => !v.startsWith('support-'));
    const pool = ohneSupport.length ? ohneSupport : kandidaten;
    pool.sort((a, c) => (zahl.get(`${seite}|${c}`)! - zahl.get(`${seite}|${a}`)!) || VORZUG.indexOf(a) - VORZUG.indexOf(c));
    const variante = pool[0];
    return { seite, variante, pfad: pfade.get(`${seite}|${variante}`) ?? seite };
  });
}

const bestand: Bestand | null = fs.existsSync(DATEI) ? JSON.parse(fs.readFileSync(DATEI, 'utf8')) : null;

for (const { breite, hoehe } of BREITEN) {
  test(`Fotos ${QUELLE} ${breite}`, async ({ browser }) => {
    test.skip(!bestand, `${DATEI} fehlt — zuerst --project=bestand laufen lassen`);
    test.setTimeout(60 * 60 * 1000);
    fs.mkdirSync(ZIEL, { recursive: true });
    const liste = auswahl(bestand!);
    fs.writeFileSync(path.join(ZIEL, 'auswahl.json'), `${JSON.stringify(liste, null, 1)}\n`);
    for (const { seite, pfad, variante } of liste) {
      const v = VARIANTEN.find((x) => x.schluessel === variante)!;
      const kontext = await browser.newContext({
        viewport: { width: breite, height: hoehe }, locale: 'de-AT', timezoneId: 'Europe/Vienna',
      });
      const page = await kontext.newPage();
      await page.clock.setFixedTime(new Date(UHR));
      await page.goto(`${BASIS}?pfad=${encodeURIComponent(pfad)}&${v.parameter}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(ZIEL, `${seitenKuerzel(seite)}-${breite}.jpg`),
        fullPage: true, type: 'jpeg', quality: 60, animations: 'disabled', caret: 'hide',
      });
      await kontext.close();
    }
  });
}
