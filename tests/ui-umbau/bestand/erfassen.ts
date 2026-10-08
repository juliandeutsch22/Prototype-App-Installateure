/**
 * Was die Bestandsaufnahme auf einer Seite als „Element“ zählt (Umbau
 * „Lot“, Phase A, Anhang 12.1) — der Teil, der im Browser läuft.
 *
 * DIE ERKENNUNG STÜTZT SICH AUF ROLLEN UND ARIA, NICHT AUF KLASSEN. Der Umbau
 * tauscht die Klassen aus; eine Erkennung über sie fände nachher nichts mehr
 * und meldete alles als verloren. Nur drei Arten haben kein semantisches
 * Merkmal und hängen deshalb an Klassen: Hinweiszeile, Status/Marke und
 * Kennzahl. Ihre Selektoren stehen gesammelt in `KLASSEN` — wer nach dem
 * Umbau „nachher“ aufnimmt, ergänzt dort die neuen Namen, statt die
 * Erkennung umzubauen.
 */

/** Ein Element, so wie es im Browser gefunden wurde — noch ohne Seite, Rolle und Weg. */
export interface Roh {
  art: string;
  text: string;
  aria: string;
  ziel: string;
  zustand: 'aktiv' | 'gesperrt' | 'ausgeblendet';
  /** `inhalt` (in `main`), `huelle` (Navigation, Kopf) oder `ebene` (Dialog, Blatt, Menü). */
  bereich: 'inhalt' | 'huelle' | 'ebene';
  /** Name der Ebene (Dialog, Blatt, Menü), sonst leer. */
  ebene: string;
  /** Bei Auswahlfeldern: die Einträge. */
  optionen?: string[];
  /** Bei „i“, Kennzahl und Hinweis: der ganze Text, den das Element trägt. */
  inhalt?: string;
}

export interface Schnappschuss {
  elemente: Roh[];
  /** Überschrift der Seite — ändert sie sich nach einem Klick, wurde navigiert. */
  titel: string;
}

/**
 * Klassen der Bausteine OHNE semantisches Merkmal. Stand vor dem Umbau:
 * `Hinweiszeile`, `Zustand`/`Warnung`/`Marke` (Badge.tsx), `Metric`.
 * Nach dem Umbau um die neuen Namen ERGÄNZEN, nicht ersetzen — dann zählt
 * die alte Fassung weiter, wo sie noch steht.
 */
export const KLASSEN = {
  hinweis: ['.hinweiszeile'],
  abzeichen: ['.stand', '.section-label'],
  kennzahl: ['.kennzahl'],
};

/**
 * Läuft im Browser (`page.evaluate`). Muss deshalb in sich geschlossen sein:
 * keine Importe, keine Hilfsfunktionen von aussen.
 */
export function schnappschuss({ klassen, nur }: { klassen: typeof KLASSEN; nur?: string }): Schnappschuss {
  const EBENE = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog[open],[aria-modal="true"]';
  const SEL = [
    'a[href]', 'button', '[role="button"]', '[role="menuitem"]', '[role="tab"]', '[role="switch"]',
    '[role="checkbox"]', '[role="radio"]', 'input', 'select', 'textarea', 'summary',
    'h1', 'h2', 'h3', 'h4', '[role="status"]', '[role="alert"]', '[role="note"]',
    ...klassen.hinweis, ...klassen.abzeichen, ...klassen.kennzahl,
  ].join(',');

  const main = document.querySelector('main');
  const sauber = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const kurz = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const passt = (el: Element, sel: string[]) => sel.some((s) => el.matches(s));

  function ariaName(el: Element): string {
    const label = el.getAttribute('aria-label');
    if (label) return sauber(label);
    const von = el.getAttribute('aria-labelledby');
    if (von) {
      return sauber(von.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      const l = el.labels?.[0];
      if (l) return sauber(l.innerText || l.textContent);
    }
    return sauber(el.getAttribute('title'));
  }

  function sichtbar(el: Element): boolean {
    const h = el as HTMLElement & { checkVisibility?: (o: object) => boolean };
    if (typeof h.checkVisibility === 'function') return h.checkVisibility({ checkVisibilityCSS: true });
    return h.offsetParent !== null;
  }

  function ebeneVon(el: Element): Element | null {
    return el.closest(EBENE);
  }

  function ebenenName(e: Element): string {
    const n = ariaName(e);
    if (n) return n;
    const h = e.querySelector('h1,h2,h3,h4');
    return sauber(h?.textContent) || e.getAttribute('role') || 'dialog';
  }

  /*
    Der Text, den man sieht — ohne `aria-hidden` (das „i“ in einer Überschrift,
    das „⋯“, die Ziffer eines Zählers) und ohne, was bei dieser Breite
    ausgeblendet ist. Ist das Element selbst verborgen, zählt sein ganzer
    Text: sonst hiesse es in jeder Breite anders.
  */
  function sichtbarerText(el: Element): string {
    const ganz = !sichtbar(el);
    const teile: string[] = [];
    const gehen = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) {
        teile.push(n.nodeValue ?? '');
        return;
      }
      if (!(n instanceof Element)) return;
      if (n.getAttribute('aria-hidden') === 'true') return;
      if (n !== el && n.matches('button[aria-controls][aria-expanded]')) return;
      if (!ganz && n !== el && !sichtbar(n)) return;
      n.childNodes.forEach(gehen);
      teile.push(' ');
    };
    gehen(el);
    return sauber(teile.join(''));
  }

  /** Text, wenn er etwas sagt; ein Zeichen wie „⋯“ oder „+“ allein sagt nichts — dann der Name. */
  function textOderName(el: Element, name: string): string {
    const t = sichtbarerText(el);
    return /[\p{L}\p{N}]/u.test(t) ? t : name || t;
  }

  const raus: Roh[] = [];
  const gesehen = new Set<Element>();

  for (const el of Array.from(document.querySelectorAll(SEL))) {
    if (gesehen.has(el)) continue;
    if (nur && !el.matches(nur)) continue;
    gesehen.add(el);
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') ?? '';
    let art = '';
    let text = '';
    let ziel = '';
    let optionen: string[] | undefined;
    let inhalt: string | undefined;
    const aria = ariaName(el);

    if (passt(el, klassen.kennzahl)) {
      const zeilen = ((el as HTMLElement).innerText || el.textContent || '').split('\n').map(sauber).filter(Boolean);
      art = 'kennzahl';
      text = zeilen[0] ?? '';
      inhalt = zeilen.join(' · ');
    } else if (passt(el, klassen.abzeichen)) {
      art = 'abzeichen';
      text = sichtbarerText(el);
    } else if (passt(el, klassen.hinweis) || role === 'status' || role === 'alert' || role === 'note') {
      art = 'hinweis';
      text = sichtbarerText(el);
      inhalt = text;
    } else if (/^h[1-4]$/.test(tag)) {
      art = 'ueberschrift';
      text = sichtbarerText(el);
    } else if (tag === 'summary') {
      art = 'aufklapper';
      text = sichtbarerText(el);
    } else if (tag === 'select') {
      art = 'auswahl';
      text = aria;
      optionen = Array.from((el as HTMLSelectElement).options).map((o) => sauber(o.textContent));
    } else if (tag === 'textarea') {
      art = 'feld';
      text = aria || sauber(el.getAttribute('placeholder'));
    } else if (tag === 'input') {
      const typ = (el as HTMLInputElement).type;
      if (typ === 'checkbox') art = role === 'switch' ? 'schalter' : 'checkbox';
      else if (typ === 'radio') art = 'radio';
      else if (typ === 'submit' || typ === 'button' || typ === 'reset') art = 'knopf';
      else if (typ === 'file') art = 'datei';
      else art = 'feld';
      text = aria || sauber(el.getAttribute('placeholder')) || sauber((el as HTMLInputElement).value)
        || sauber(el.getAttribute('name'));
      ziel = typ === 'submit' ? 'absenden' : `typ:${typ}`;
    } else if (role === 'switch') {
      art = 'schalter';
      text = aria || sichtbarerText(el);
    } else if (role === 'checkbox') {
      art = 'checkbox';
      text = aria || sichtbarerText(el);
    } else if (role === 'radio') {
      art = 'radio';
      text = aria || sichtbarerText(el);
    } else if (role === 'tab') {
      art = 'reiter';
      text = textOderName(el, aria);
    } else if (role === 'menuitem') {
      art = 'menueeintrag';
      text = textOderName(el, aria);
    } else if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      const nav = el.closest('nav');
      const navName = nav ? ariaName(nav) : '';
      art = navName === 'Bereiche' ? 'reiter' : /navigation|bereiche/i.test(navName) ? 'menuepunkt' : 'link';
      text = textOderName(el, aria);
      ziel = href;
    } else {
      // button oder role=button
      const steuert = el.getAttribute('aria-controls');
      const info = /^Was bedeutet (.*)\?$/.exec(aria) ?? /^Erklärung zu (.*) schließen$/.exec(aria);
      if (steuert && info) {
        // Das „i“: sein Name wechselt mit dem Zustand — der stabile Teil ist, WAS es erklärt.
        art = 'info';
        text = info[1];
        inhalt = sauber(document.getElementById(steuert)?.textContent) || undefined;
        ziel = 'erklaerung';
      } else {
        art = el.hasAttribute('aria-pressed') ? 'segment' : 'knopf';
        text = textOderName(el, aria);
        if (el.getAttribute('aria-haspopup')) ziel = 'menue';
        else if ((el as HTMLButtonElement).type === 'submit' && el.closest('form')) ziel = 'absenden';
        else if (el.hasAttribute('aria-expanded')) ziel = 'aufklappen';
      }
    }
    if (!text && !aria) {
      if (art === 'ueberschrift' || art === 'hinweis' || art === 'abzeichen') continue;
    }

    const e = ebeneVon(el);
    const bereich: Roh['bereich'] = e ? 'ebene' : !main || main.contains(el) ? 'inhalt' : 'huelle';
    const gesperrt = (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
    raus.push({
      art,
      text: kurz(text),
      aria: kurz(aria),
      ziel,
      zustand: !sichtbar(el) ? 'ausgeblendet' : gesperrt ? 'gesperrt' : 'aktiv',
      bereich,
      ebene: e ? kurz(ebenenName(e), 80) : '',
      ...(optionen ? { optionen } : {}),
      ...(inhalt ? { inhalt: kurz(inhalt, 400) } : {}),
    });
  }

  /*
    ZÄHLER (Badge.tsx, `Zaehler`): die Ziffer ist `aria-hidden`, daneben steht
    der ausgeschriebene Satz für den Vorleser. Erkannt an genau diesem Paar —
    eine Ziffer, die sich versteckt, und ein Satz daneben.
  */
  for (const z of Array.from(document.querySelectorAll(nur ? ':not(*)' : 'span[aria-hidden="true"]'))) {
    const ziffer = sauber(z.textContent);
    if (!/^\d+\+?$/.test(ziffer)) continue;
    const traeger = z.parentElement;
    if (!traeger) continue;
    const satz = sauber(Array.from(traeger.childNodes).filter((n) => n !== z).map((n) => n.textContent).join(' '))
      .replace(/^,\s*/, '');
    if (!satz) continue;
    const e = ebeneVon(traeger);
    raus.push({
      art: 'zaehler',
      text: kurz(satz),
      aria: kurz(satz),
      ziel: '',
      zustand: sichtbar(traeger) ? 'aktiv' : 'ausgeblendet',
      bereich: e ? 'ebene' : !main || main.contains(traeger) ? 'inhalt' : 'huelle',
      ebene: e ? kurz(ebenenName(e), 80) : '',
    });
  }

  const h1 = document.querySelector('main h1') ?? document.querySelector('h1');
  return { elemente: raus, titel: sauber(h1?.textContent) };
}
