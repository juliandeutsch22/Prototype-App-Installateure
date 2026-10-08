/**
 * Bestandsaufnahme der Oberfläche (Umbau „Lot“, Phase A, A1/A2).
 *
 * Je Variante (Rolle mit Freigaben, Lehrling, globaler Admin, Supportmodus)
 * und je Breite (390, 834, 1440) geht das Skript durch die Vorschau mit
 * Beispieldaten, besucht jede erreichbare Seite und hält jedes Element fest:
 * Knöpfe, Links, Menüpunkte, Felder, Auswahlfelder samt Einträgen,
 * Kästchen, Schalter, Reiter, Zähler, Abzeichen, Hinweise und „i“.
 *
 * WIE DIE SEITEN GEFUNDEN WERDEN: die Menüpunkte der Variante und ihre
 * Unterseiten aus `navigation.ts` (`navForRole`, `UNTER`), dann wie in der
 * Linkprüfung jedem Link nach, den die Variante betreten darf. Akten zählen
 * je Art einmal — über den ersten Eintrag ihrer Liste.
 *
 * WAS AUF JEDER SEITE GEÖFFNET WIRD: alle Reiter, jedes `<details>`, jeder
 * aufklappbare Bereich und jedes „i“; dann einzeln jeder Knopf (je
 * Beschriftung einmal), dazu jedes ⋯-Menü und dessen Einträge. Was dabei neu
 * erscheint — ein Dialog, ein Blatt von unten, ein Formular, ein Menü — wird
 * mit dem Klickweg dorthin erfasst. Danach wird die Seite zurückgesetzt.
 *
 * WARUM DAS OHNE SCHREIBEN GEHT: in der Vorschau ist die Datenschicht
 * ersetzt; kein Knopf erreicht eine Datenbank. Ausgelassen werden trotzdem
 * Absende-Knöpfe von Formularen und „Abmelden“ — das Protokoll will öffnen,
 * nicht speichern.
 *
 * Aufruf (vorher bzw. nachher):
 *   BESTAND_QUELLE=vorher CHROMIUM_PFAD=… npx playwright test -c playwright.bestand.config.ts --project=bestand
 * Ergebnis: `docs/ui-umbau/bestand-<quelle>.json` (zusammengeführt im globalTeardown).
 */
import { test, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { NAV, UNTER, bereichVon, canAccess, navForRole, unterseitenFuer } from '@/app/navigation';
import { SCHEIN_ROLLEN } from '@/lib/permissions';
import { aktiveModule } from '@/lib/module';
import { firma } from '../../tools/vorschau/daten';
import { pfadVon } from '../links/linkziel';
import { KLASSEN, schnappschuss, type Roh, type Schnappschuss } from './bestand/erfassen';
import { Sammler, type Element as BestandElement } from './bestand/sammler';
import { BASIS, BREITEN, QUELLE, TEILE, UHR, VARIANTEN, type Variante } from './bestand/varianten';


/** Nur eine Auswahl aufnehmen (zum Ausprobieren): BESTAND_NUR=administrator:1440 */
const NUR = process.env.BESTAND_NUR?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

/** Genug für jede Variante; läuft die Suche im Kreis, endet sie hier und nicht in der Zeitgrenze. */
const HOECHSTENS_SEITEN = 90;
/** Je Seitenzustand — mehr verschiedene Knöpfe hat keine Seite der App. */
const HOECHSTENS_KNOEPFE = 60;
const HOECHSTENS_MENUEEINTRAEGE = 10;
const ZEITGRENZE_SEITE = 10 * 60 * 1000;

/** Was nicht gedrückt wird. Absende-Knöpfe in Formularen fallen schon vorher weg. */
const AUSLASSEN = /^(abmelden|speichern|senden|absenden)$|abmelden/i;

const OEFFENTLICH = new Set(['/impressum', '/datenschutz']);
/** Alte Pfade, die nur weiterleiten (`App.tsx`) — sie sind kein eigener Ort. */
const WEITERLEITUNG = new Set([
  '/order', '/admin-orders', '/stock', '/notifications', '/modules',
  '/material/anfordern', '/material/anforderungen', '/material/lager', '/login',
]);

/** `/customers/k1` → `/customers/:id`. Die Beispieldaten tragen Kennungen wie k1, p1, q1. */
function muster(pfad: string): string {
  return pfad.split('/').map((s, i) => (i > 1 && /^[a-z]{1,2}\d+$|^[0-9a-f-]{20,}$/.test(s) ? ':id' : s)).join('/');
}

function waechter(pfad: string): string | null {
  if (NAV.some((i) => i.path === pfad)) return pfad;
  const eltern = NAV
    .filter((i) => i.path !== '/' && pfad.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length);
  return eltern[0]?.path ?? null;
}

/** Darf die Variante dorthin — und ist es ein eigener Ort? Sonst `null`. */
function erreichbar(v: Variante, href: string): string | null {
  const p = pfadVon(href);
  if (!p.startsWith('/') || WEITERLEITUNG.has(p) || !v.navRolle) return null;
  if (OEFFENTLICH.has(p)) return p;
  // Ein Reiter mit Unterseiten leitet auf die erste weiter; die Unterseiten sind schon in der Liste.
  if (UNTER[p]) return null;
  const module = firma.modules as Record<string, boolean>;
  if (p === '/worksheet') {
    return aktiveModule(module).has('scheine') && SCHEIN_ROLLEN.includes(v.navRolle) ? p : null;
  }
  const w = waechter(p);
  if (!w || !canAccess(v.navRolle, w, module, v.zusatz)) return null;
  const basis = Object.keys(UNTER).find((b) => p.startsWith(`${b}/`));
  if (basis) {
    const erlaubt = unterseitenFuer(basis, v.navRolle, v.schalter).map((s) => `${basis}/${s.pfad}`);
    if (!erlaubt.some((e) => p === e || p.startsWith(`${e}/`))) return null;
  }
  return p;
}

/** Die Menüpunkte der Variante samt Unterseiten — der Anfang der Suche. */
function startseiten(v: Variante): string[] {
  if (!v.navRolle) return ['/'];
  const module = firma.modules as Record<string, boolean>;
  const raus: string[] = [];
  for (const item of navForRole(v.navRolle, module, v.zusatz)) {
    const unter = unterseitenFuer(item.path, v.navRolle, v.schalter);
    if (UNTER[item.path] && unter.length > 0) raus.push(...unter.map((s) => `${item.path}/${s.pfad}`));
    else raus.push(item.path);
  }
  if (erreichbar(v, '/worksheet')) raus.push('/worksheet');
  return raus;
}

/** Der Anfang des Klickwegs: Menüpunkt, Unterseite bzw. „Eintrag“ bei einer Akte. */
function wegAnfang(v: Variante, pfad: string, seite: string): string[] {
  if (!v.navRolle) return ['Plattform'];
  if (seite === '/impressum') return ['Impressum'];
  if (seite === '/datenschutz') return ['Datenschutz'];
  if (seite === '/worksheet') return ['Handwerksscheine', 'Schein schreiben'];
  const bereich = bereichVon(pfad);
  const basis = Object.keys(UNTER).find((b) => pfad.startsWith(`${b}/`));
  if (basis) {
    const unter = UNTER[basis].find((s) => pfad.startsWith(`${basis}/${s.pfad}`));
    if (unter) return [bereich, unter.label];
  }
  if (seite.includes(':id')) return [bereich, 'Eintrag'];
  return [bereich];
}

const schluessel = (r: Roh) => `${r.bereich}|${r.ebene}|${r.art}|${r.text}|${r.aria}`;

interface Ereignisse {
  meldungen: string[];
  downloads: string[];
}

class Aufnahme {
  readonly ereignisse: Ereignisse = { meldungen: [], downloads: [] };
  readonly links = new Set<string>();
  readonly seiten: Array<{ seite: string; pfad: string; elemente: number; befund?: string }> = [];

  page!: Page;

  constructor(
    readonly v: Variante,
    readonly sammler: Sammler,
    /** Fortschritt je Aufnahme — zeigt, wo ein Lauf hängt. */
    readonly protokoll: (zeile: string) => void,
  ) {}

  /**
   * Die Browserseite dieser Aufnahme. Nach einer Zeitgrenze wird nicht sie
   * ersetzt, sondern die ganze Aufnahme (siehe unten): was in der alten
   * noch hängt, läuft dann gegen eine geschlossene Seite ins Leere, statt
   * in der neuen mitzuklicken.
   */
  async neueSeite(kontext: BrowserContext): Promise<void> {
    const page = await kontext.newPage();
    await page.clock.setFixedTime(new Date(UHR));
    // `window.print` öffnet im kopflosen Browser nichts — damit kein Knopf hängen bleibt, sicherheitshalber still.
    await page.addInitScript(() => { window.print = () => {}; });
    page.on('dialog', (d) => {
      // „Ungespeicherte Änderungen verwerfen?“ beim Neuladen: annehmen, sonst bleibt die Seite stehen.
      if (d.type() === 'beforeunload') {
        void d.accept().catch(() => {});
        return;
      }
      // Rückfragen (confirm) werden verneint — so wird nichts ausgelöst, aber ihr Text erfasst.
      this.ereignisse.meldungen.push(d.message());
      void d.dismiss().catch(() => {});
    });
    page.on('download', (d) => {
      this.ereignisse.downloads.push(d.suggestedFilename());
      void d.cancel().catch(() => {});
    });
    page.on('popup', (p) => void p.close().catch(() => {}));
    this.page = page;
  }

  url(pfad: string): string {
    return `${BASIS}?pfad=${encodeURIComponent(pfad)}&${this.v.parameter}`;
  }

  async blick(): Promise<Schnappschuss> {
    return this.page.evaluate(schnappschuss, { klassen: KLASSEN });
  }

  async ruhe(ms = 300): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(ms);
  }

  /** Seite frisch laden, Reiter wählen, wahlweise alles aufklappen. */
  async herstellen(pfad: string, reiter: string | null, aufklappen: boolean): Promise<void> {
    // Ein Knopf davor kann noch eine Navigation angestossen haben (Download, neues Fenster) —
    // dann bricht das Laden ab. Ein zweiter Versuch genügt.
    for (let versuch = 1; ; versuch += 1) {
      try {
        await this.page.goto(this.url(pfad), { waitUntil: 'networkidle', timeout: 30_000 });
        break;
      } catch (e) {
        if (versuch >= 3) throw e;
        await this.page.waitForTimeout(500);
      }
    }
    await this.page.locator('main, body').first().waitFor();
    await this.ruhe(200);
    if (reiter) {
      await this.page.locator('main [role="tab"]').filter({ hasText: reiter }).first().click({ timeout: 3000 }).catch(() => {});
      await this.ruhe(200);
    }
    if (aufklappen) {
      await this.page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      for (let i = 0; i < 30; i += 1) {
        const ok = await this.markieren('aufklapper', null);
        if (!ok) break;
        await this.page.locator('[data-bestand-ziel]').first().click({ timeout: 1500 }).catch(() => {});
        await this.page.evaluate(() => document.querySelector('[data-bestand-ziel]')?.setAttribute('data-bestand-erledigt', ''));
      }
      await this.ruhe(150);
    }
  }

  /**
   * Setzt `data-bestand-ziel` an das nächste Element der Sorte. `aufklapper`:
   * der nächste zugeklappte Knopf (`aria-expanded="false"`, kein Menü), der
   * noch nicht dran war. `knopf`: der Knopf mit dieser Beschriftung und
   * Position — die Kennzeichnung überlebt kein Neuladen, deshalb jedes Mal neu.
   */
  async markieren(sorte: 'aufklapper' | 'knopf', was: { label: string; nth: number } | null): Promise<string | null> {
    return this.page.evaluate(
      ({ sorte, was }) => {
        document.querySelectorAll('[data-bestand-ziel]').forEach((e) => e.removeAttribute('data-bestand-ziel'));
        const sauber = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
        const sichtbar = (el: Element) => (el as HTMLElement & { checkVisibility: () => boolean }).checkVisibility();
        const label = (el: Element) =>
          sauber((el as HTMLElement).innerText || el.textContent) || sauber(el.getAttribute('aria-label')) || sauber(el.getAttribute('title'));
        const main = document.querySelector('main') ?? document.body;
        if (sorte === 'aufklapper') {
          const el = Array.from(main.querySelectorAll('button[aria-expanded="false"]')).find(
            (b) => !b.getAttribute('aria-haspopup') && !b.hasAttribute('data-bestand-erledigt') && sichtbar(b),
          );
          if (!el) return null;
          el.setAttribute('data-bestand-ziel', '');
          return label(el);
        }
        const alle = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b) => label(b) === was!.label);
        const el = alle[was!.nth];
        if (!el) return null;
        el.setAttribute('data-bestand-ziel', '');
        return label(el);
      },
      { sorte, was },
    );
  }

  /** Die Knöpfe, die einzeln gedrückt werden — je Beschriftung einer, ⋯-Menüs je Sorte einer. */
  async kandidaten(bereich: 'inhalt' | 'huelle'): Promise<Array<{ label: string; nth: number; text: string; aria: string; art: string; menue: boolean }>> {
    return this.page.evaluate(
      ({ bereich, auslassen }) => {
        const EBENE = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog[open],[aria-modal="true"]';
        const weg = new RegExp(auslassen, 'i');
        const sauber = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
        const label = (el: Element) =>
          sauber((el as HTMLElement).innerText || el.textContent) || sauber(el.getAttribute('aria-label')) || sauber(el.getAttribute('title'));
        const main = document.querySelector('main');
        const raus: Array<{ label: string; nth: number; text: string; aria: string; art: string; menue: boolean }> = [];
        const schon = new Set<string>();
        const alle = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const el of alle) {
          if (el.closest(EBENE)) continue;
          const drin = !main || main.contains(el);
          if ((bereich === 'inhalt') !== drin) continue;
          if (el.getAttribute('role') === 'tab' || el.getAttribute('aria-hidden') === 'true') continue;
          if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
          if (!(el as HTMLElement & { checkVisibility: () => boolean }).checkVisibility()) continue;
          if ((el as HTMLButtonElement).type === 'submit' && el.closest('form')) continue;
          const menue = !!el.getAttribute('aria-haspopup');
          if (el.hasAttribute('aria-expanded') && !menue) continue;
          const l = label(el);
          if (!l || weg.test(l)) continue;
          const sorte = menue ? `menue|${l.replace(/ für .*$/, '')}` : l;
          if (schon.has(sorte)) continue;
          schon.add(sorte);
          raus.push({
            label: l,
            nth: alle.filter((b) => label(b) === l).indexOf(el),
            text: sauber((el as HTMLElement).innerText || el.textContent) || sauber(el.getAttribute('aria-label')),
            aria: sauber(el.getAttribute('aria-label')) || sauber(el.getAttribute('title')),
            art: el.hasAttribute('aria-pressed') ? 'segment' : 'knopf',
            menue,
          });
        }
        return raus;
      },
      { bereich, auslassen: AUSLASSEN.source },
    );
  }

  merken(seite: string, roh: Roh[], klickweg: string[], bereiche: Array<Roh['bereich']>): void {
    const auswahl = roh.filter((r) => bereiche.includes(r.bereich));
    this.sammler.aufnehmen(seite, auswahl, klickweg);
    for (const r of auswahl) {
      if ((r.art === 'link' || r.art === 'menuepunkt' || r.art === 'reiter') && r.ziel.startsWith('/')) this.links.add(r.ziel);
    }
  }

  /**
   * Ein Knopf: drücken, festhalten, was neu ist, zurücksetzen. Gibt zurück,
   * ob die Seite danach neu geladen werden muss.
   */
  async druecken(
    seite: string, pfad: string, reiter: string | null, klickweg: string[],
    k: { label: string; nth: number; text: string; aria: string; art: string; menue: boolean },
    bereiche: Array<Roh['bereich']>,
  ): Promise<boolean> {
    this.protokoll(`  drücke ${k.label}`);
    const vorher = await this.blick();
    if (!(await this.markieren('knopf', k))) return false;
    // Der Knopf selbst, so wie ihn die Aufnahme kennt — damit sein Ziel an der richtigen Kennung landet.
    const ich = (await this.page.evaluate(schnappschuss, { klassen: KLASSEN, nur: '[data-bestand-ziel]' })).elemente[0]
      ?? { art: k.art, text: k.text, aria: k.aria, ebene: '' };
    this.ereignisse.meldungen.length = 0;
    this.ereignisse.downloads.length = 0;
    try {
      await this.page.locator('[data-bestand-ziel]').first().click({ timeout: 2000 });
    } catch {
      return true;
    }
    await this.ruhe(350);
    const nachher = await this.blick();
    const weg = [...klickweg, ich.text || ich.aria || k.label];

    for (const m of this.ereignisse.meldungen) {
      this.sammler.aufnehmen(seite, [{ art: 'bestaetigung', text: m, aria: m, ziel: '', zustand: 'aktiv', bereich: 'ebene', ebene: 'Browser-Rückfrage' }], weg);
    }
    if (nachher.titel !== vorher.titel) {
      this.sammler.zielSetzen(seite, ich, `navigation:${nachher.titel}`);
      return true;
    }
    const alt = new Set(vorher.elemente.map(schluessel));
    const neu = nachher.elemente.filter((r) => !alt.has(schluessel(r)) && bereiche.concat('ebene').includes(r.bereich));
    const jetzt = new Set(nachher.elemente.map(schluessel));
    const fort = vorher.elemente.some((r) => !jetzt.has(schluessel(r)));
    if (neu.length) this.merken(seite, neu, weg, [...bereiche, 'ebene']);

    const ebene = neu.find((r) => r.bereich === 'ebene')?.ebene;
    const ziel = this.ereignisse.meldungen.length ? 'bestaetigung'
      : this.ereignisse.downloads.length ? `download:${this.ereignisse.downloads[0]}`
      : ebene ? `${k.menue ? 'menue' : 'ebene'}:${ebene}`
      : neu.length ? 'zeigt' : 'aktion';
    this.sammler.zielSetzen(seite, ich, ziel);

    // Die Einträge eines ⋯-Menüs: jeder einzeln, denn viele öffnen erst einen Dialog.
    if (k.menue && ebene) {
      const eintraege = neu.filter((r) => r.art === 'menueeintrag').slice(0, HOECHSTENS_MENUEEINTRAEGE);
      for (const e of eintraege) {
        await this.herstellen(pfad, reiter, true);
        if (!(await this.markieren('knopf', k))) continue;
        await this.page.locator('[data-bestand-ziel]').first().click({ timeout: 2000 }).catch(() => {});
        await this.ruhe(250);
        const offen = await this.blick();
        this.ereignisse.meldungen.length = 0;
        this.ereignisse.downloads.length = 0;
        const ok = await this.page.getByRole('menuitem', { name: e.text, exact: true }).first()
          .click({ timeout: 2000 }).then(() => true, () => false);
        if (!ok) continue;
        await this.ruhe(350);
        const danach = await this.blick();
        const da = new Set(offen.elemente.filter((r) => r.ebene !== ebene).map(schluessel));
        const dazu = danach.elemente.filter((r) => !da.has(schluessel(r)) && r.ebene !== ebene);
        const weg2 = [...weg, e.text];
        for (const m of this.ereignisse.meldungen) {
          this.sammler.aufnehmen(seite, [{ art: 'bestaetigung', text: m, aria: m, ziel: '', zustand: 'aktiv', bereich: 'ebene', ebene: 'Browser-Rückfrage' }], weg2);
        }
        if (danach.titel !== offen.titel) {
          this.sammler.zielSetzen(seite, e, `navigation:${danach.titel}`);
          continue;
        }
        if (dazu.length) this.merken(seite, dazu, weg2, [...bereiche, 'ebene']);
        const eb = dazu.find((r) => r.bereich === 'ebene')?.ebene;
        this.sammler.zielSetzen(seite, e, this.ereignisse.meldungen.length ? 'bestaetigung'
          : this.ereignisse.downloads.length ? `download:${this.ereignisse.downloads[0]}`
          : eb ? `ebene:${eb}` : dazu.length ? 'zeigt' : 'aktion');
      }
      return true;
    }

    /*
      Ein Formular, das der Knopf aufgeklappt hat, trägt oft selbst noch
      Aufklappbares („Zeitkonto-Einstellungen anzeigen“) — eine Ebene tiefer,
      aber ohne Schreiben erreichbar. Nur hier, im Inhalt: Dialoge liegen
      ausserhalb von `main`.
    */
    if (neu.length && !ebene) {
      let bisher = new Set(nachher.elemente.map(schluessel));
      for (let i = 0; i < 10; i += 1) {
        const label = await this.markieren('aufklapper', null);
        if (label === null) break;
        await this.page.locator('[data-bestand-ziel]').first().click({ timeout: 1500 }).catch(() => {});
        await this.page.evaluate(() => document.querySelector('[data-bestand-ziel]')?.setAttribute('data-bestand-erledigt', ''));
        await this.ruhe(120);
        const tiefer = await this.blick();
        const dazu = tiefer.elemente.filter((r) => !bisher.has(schluessel(r)));
        if (dazu.length) this.merken(seite, dazu, [...weg, label || 'Aufklappen'], bereiche);
        bisher = new Set(tiefer.elemente.map(schluessel));
      }
    }

    if (!neu.length && !fort) return false;
    await this.page.keyboard.press('Escape');
    await this.ruhe(150);
    const zurueck = await this.blick();
    const z = new Set(zurueck.elemente.map(schluessel));
    return !(z.size === alt.size && [...alt].every((s) => z.has(s)));
  }

  /** Ein Zustand einer Seite (ohne oder mit gewähltem Reiter) vollständig. */
  async zustand(seite: string, pfad: string, reiter: string | null, klickweg: string[]): Promise<void> {
    await this.herstellen(pfad, reiter, false);
    const grund = await this.blick();
    this.merken(seite, grund.elemente, klickweg, ['inhalt']);

    // `<details>` einzeln öffnen — so bekommt jedes Element den richtigen Weg.
    for (let i = 0; i < 40; i += 1) {
      const summary = await this.page.evaluate(() => {
        const main = document.querySelector('main') ?? document.body;
        const d = Array.from(main.querySelectorAll('details')).find((x) => !x.open && !x.hasAttribute('data-bestand-erledigt'));
        if (!d) return null;
        d.setAttribute('data-bestand-erledigt', '');
        d.open = true;
        return (d.querySelector('summary')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      });
      if (summary === null) break;
      await this.page.waitForTimeout(80);
      this.merken(seite, (await this.blick()).elemente, [...klickweg, summary || 'Aufklappen'], ['inhalt']);
    }
    // Aufklappbare Bereiche und „i“ — ebenfalls einzeln, offen gelassen.
    for (let i = 0; i < 40; i += 1) {
      const label = await this.markieren('aufklapper', null);
      if (label === null) break;
      await this.page.locator('[data-bestand-ziel]').first().click({ timeout: 1500 }).catch(() => {});
      await this.page.evaluate(() => document.querySelector('[data-bestand-ziel]')?.setAttribute('data-bestand-erledigt', ''));
      await this.ruhe(120);
      this.merken(seite, (await this.blick()).elemente, [...klickweg, label || 'Aufklappen'], ['inhalt']);
    }

    const kandidaten = (await this.kandidaten('inhalt')).slice(0, HOECHSTENS_KNOEPFE);
    let schmutzig = false;
    for (const k of kandidaten) {
      if (schmutzig) await this.herstellen(pfad, reiter, true);
      schmutzig = await this.druecken(seite, pfad, reiter, klickweg, k, ['inhalt']).catch(() => true);
    }
  }

  async seiteAufnehmen(pfad: string, seite: string): Promise<void> {
    const weg = wegAnfang(this.v, pfad, seite);
    await this.herstellen(pfad, null, false);
    const vorher = this.sammler.alle().length;
    if (await this.page.getByRole('heading', { name: 'Kein Zugriff' }).count()) {
      this.seiten.push({ seite, pfad, elemente: 0, befund: 'Kein Zugriff' });
      return;
    }
    const reiter = await this.page.locator('main [role="tab"]').evaluateAll((alle) =>
      alle.map((t) => ({ text: (t as HTMLElement).innerText, gewaehlt: t.getAttribute('aria-selected') === 'true' })));
    const gewaehlt = reiter.findIndex((r) => r.gewaehlt);
    await this.zustand(seite, pfad, null, weg);
    // Der gewählte Reiter ist schon erfasst; die übrigen je für sich.
    // Ohne die Zahl dahinter („Laufend 2“): sie hängt an den Daten, der Reiter nicht.
    for (const r of reiter.filter((_, i) => i !== (gewaehlt < 0 ? 0 : gewaehlt))
      .map((t) => t.text.replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, ''))) {
      await this.zustand(seite, pfad, r, [...weg, r]);
    }
    this.seiten.push({ seite, pfad, elemente: this.sammler.alle().length - vorher });
  }

  /** Navigation, Kopf, untere Leiste, „Mehr“ und Profil — einmal je Variante und Breite. */
  async huelleAufnehmen(): Promise<void> {
    if (!this.v.navRolle) return;
    await this.herstellen('/', null, false);
    const grund = await this.blick();
    this.merken('(huelle)', grund.elemente, ['Hülle'], ['huelle']);
    let schmutzig = false;
    for (const k of await this.kandidaten('huelle')) {
      if (schmutzig) await this.herstellen('/', null, false);
      schmutzig = await this.druecken('(huelle)', '/', null, ['Hülle'], k, ['huelle']).catch(() => true);
    }
    this.seiten.push({ seite: '(huelle)', pfad: '/', elemente: this.sammler.alle().length });
  }
}

for (const v of VARIANTEN) {
  for (const { breite, hoehe } of BREITEN) {
    const name = `${v.schluessel}:${breite}`;
    if (NUR.length && !NUR.includes(name) && !NUR.includes(v.schluessel)) continue;

    test(`Bestand ${name}`, async ({ browser }) => {
      test.setTimeout(3 * 60 * 60 * 1000);
      const kontext = await browser.newContext({
        viewport: { width: breite, height: hoehe },
        locale: 'de-AT',
        timezoneId: 'Europe/Vienna',
        acceptDownloads: true,
      });
      fs.mkdirSync(TEILE, { recursive: true });
      const logdatei = path.join(TEILE, `${v.schluessel}-${breite}.log`);
      fs.writeFileSync(logdatei, '');
      const protokoll = (z: string) => fs.appendFileSync(logdatei, `${new Date().toISOString().slice(11, 19)} ${z}\n`);

      const sammler = new Sammler(v, breite, QUELLE);
      let a = new Aufnahme(v, sammler, protokoll);
      await a.neueSeite(kontext);

      await a.huelleAufnehmen();
      const offen = startseiten(v);
      const gesehen = new Set(offen.map(muster));
      for (const l of a.links) {
        const p = erreichbar(v, l);
        if (p && !gesehen.has(muster(p))) { gesehen.add(muster(p)); offen.push(p); }
      }
      let besucht = 0;
      while (offen.length && besucht < HOECHSTENS_SEITEN) {
        const pfad = offen.shift()!;
        besucht += 1;
        a.links.clear();
        const seite = v.navRolle ? muster(pfad) : '/plattform';
        protokoll(`Seite ${pfad}`);
        try {
          /*
            ZEITGRENZE JE SEITE: bleibt ein Klick hängen (ein Knopf, der auf
            etwas wartet, das die Vorschau nie liefert), soll nicht der ganze
            Lauf stehen. Die Seite steht dann mit Befund im Kopf, und es geht
            mit einer frischen Browserseite weiter.
          */
          let uhr: NodeJS.Timeout | undefined;
          await Promise.race([
            a.seiteAufnehmen(pfad, seite),
            new Promise((_, nein) => { uhr = setTimeout(() => nein(new Error(`Zeitgrenze ${ZEITGRENZE_SEITE / 60000} min`)), ZEITGRENZE_SEITE); }),
          ]).finally(() => clearTimeout(uhr));
        } catch (e) {
          protokoll(`  Befund: ${String(e).split('\n')[0]}`);
          // Hängt die Seite oder ist der Renderer abgestürzt, geht es mit einer frischen weiter.
          if (/Zeitgrenze|crashed|closed/i.test(String(e))) {
            const alt = a;
            a = new Aufnahme(v, sammler, protokoll);
            a.seiten.push(...alt.seiten);
            await alt.page.close().catch(() => {});
            await a.neueSeite(kontext);
          }
          // Eine Seite, die nicht durchläuft, soll den Rest nicht mitnehmen — sie steht als Befund im Kopf.
          a.seiten.push({ seite, pfad, elemente: 0, befund: String(e).split('\n')[0].slice(0, 200) });
        }
        for (const l of a.links) {
          const p = erreichbar(v, l);
          if (p && !gesehen.has(muster(p))) { gesehen.add(muster(p)); offen.push(p); }
        }
      }

      const teil: { variante: string; breite: number; seiten: typeof a.seiten; elemente: BestandElement[] } = {
        variante: v.schluessel, breite, seiten: a.seiten, elemente: sammler.alle(),
      };
      fs.writeFileSync(path.join(TEILE, `${v.schluessel}-${breite}.json`), JSON.stringify(teil));
      await kontext.close();
    });
  }
}
