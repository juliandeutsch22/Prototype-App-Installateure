import { kannBewegen } from './bewegung';

/**
 * DIE AUSWAHLFLÄCHE DER UNTEREN LEISTE GLEITET (Auftrag 17.11.2026, E95:
 * „der Fokus des aktiven Menüpunktes soll beim Wechsel der Seite mit einer
 * smoothen Animation wechseln, in etwa so wie in der Instagram-App“).
 *
 * Bis dahin sprang die Fläche hinter dem aktiven Punkt: beim alten aus, beim
 * neuen an. Jetzt fährt sie samt Lot von der alten Stelle zur neuen, schießt
 * ein paar Pixel über das Ziel hinaus und federt zurück — wie eine Feder,
 * nicht wie ein Schlitten.
 *
 * DER ENDZUSTAND BLEIBT DER ALTE, wie bei der Unterlinie (B5,
 * `unterlinie.ts`): Fläche und Lot gehören weiter dem aktiven Punkt (seine
 * `::before`-Fläche und `.unten-lot`). Für die Dauer der Fahrt liegt ein
 * stummes Abbild darüber, der neue Punkt zeigt seine eigene Fläche so lange
 * nicht — es gibt immer genau eine. Danach wird das Abbild entfernt. Bei
 * „Bewegung reduzieren“ entsteht es gar nicht: die Fläche wechselt sofort.
 *
 * Bewegt wird nur mit `transform`. Die Leiste selbst merkt nichts davon: der
 * Beobachter hört auf die Klasse `unten-punkt-aktiv`, die App und Plattform
 * ohnehin setzen.
 */

const AKTIV = 'unten-punkt-aktiv';

/** Die Dauer einer Fahrt nach ihrer Strecke: zum Nachbarn knapp 300 ms, über die ganze Leiste höchstens 420 ms. */
export function gleitDauer(strecke: number): number {
  return Math.round(Math.min(420, Math.max(280, 240 + Math.abs(strecke) * 0.6)));
}

/** Wie weit die Fläche über das Ziel hinausfedert: höchstens 4 px, bei kurzen Wegen weniger. */
export function ueberschwingen(strecke: number): number {
  return Math.min(4, Math.abs(strecke) / 20);
}

/**
 * Der Weg des Abbilds als Keyframes. `versatz` ist die alte Stelle, vom
 * Ziel aus gemessen (negativ: die alte lag links). Zügig los, über das Ziel
 * hinaus, weich zurück; ohne Strecke kein Weg.
 */
export function gleitVerlauf(versatz: number, massstab = 1): Keyframe[] {
  if (Math.abs(versatz) < 0.5) return [];
  const feder = -Math.sign(versatz) * ueberschwingen(versatz);
  return [
    { transform: `translateX(${versatz}px) scaleX(${massstab})`, offset: 0, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
    { transform: `translateX(${feder}px) scaleX(1)`, offset: 0.72, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { transform: 'translateX(0px) scaleX(1)', offset: 1 },
  ];
}

type Lage = { links: number; breite: number };

function lageIn(r: DOMRect, leiste: HTMLElement): Lage {
  const l = leiste.getBoundingClientRect();
  return { links: r.left - l.left - leiste.clientLeft, breite: r.width };
}

/**
 * Den Beobachter über der unteren Leiste `leiste` halten, bis die Rückgabe
 * aufgerufen wird.
 */
export function untenGleitenHalten(leiste: HTMLElement | null): () => void {
  if (!leiste || typeof MutationObserver === 'undefined') return () => undefined;
  let laufend: { abbild: HTMLElement; zu: HTMLElement; fahrt: Animation } | null = null;

  const aufraeumen = () => {
    if (!laufend) return;
    const { abbild, zu } = laufend;
    laufend = null;
    zu.removeAttribute('data-gleitet');
    abbild.remove();
  };

  const gleiten = (von: DOMRect, zu: HTMLElement) => {
    const a = lageIn(von, leiste);
    const b = lageIn(zu.getBoundingClientRect(), leiste);
    if (!a.breite || !b.breite) return;
    const verlauf = gleitVerlauf(a.links - b.links, a.breite / b.breite);
    if (!verlauf.length) return;
    const abbild = document.createElement('span');
    abbild.className = 'unten-gleiter';
    abbild.setAttribute('data-unten-gleiter', '');
    abbild.setAttribute('aria-hidden', 'true');
    // Genau über dem neuen Punkt: am Ende der Fahrt deckt das Abbild seine eigene Fläche Pixel für Pixel.
    Object.assign(abbild.style, { left: `${zu.offsetLeft}px`, top: `${zu.offsetTop}px`, width: `${zu.offsetWidth}px`, height: `${zu.offsetHeight}px` });
    const lot = document.createElement('span');
    lot.className = 'unten-lot';
    abbild.append(lot);
    // Vor die Punkte, damit es hinter ihnen gemalt wird (gleiche Ebene, frühere Stelle).
    leiste.prepend(abbild);
    zu.setAttribute('data-gleitet', '');
    const fahrt = abbild.animate(verlauf, { duration: gleitDauer(a.links - b.links), fill: 'forwards' });
    laufend = { abbild, zu, fahrt };
    const fertig = () => { if (laufend?.fahrt === fahrt) aufraeumen(); };
    fahrt.onfinish = fertig;
    fahrt.oncancel = fertig;
  };

  const beobachter = new MutationObserver((eintraege) => {
    let von: HTMLElement | null = null;
    let zu: HTMLElement | null = null;
    for (const e of eintraege) {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.parentElement !== leiste) continue;
      const vorher = (e.oldValue ?? '').split(/\s+/).includes(AKTIV);
      const jetzt = el.classList.contains(AKTIV);
      if (vorher && !jetzt) von = el;
      if (jetzt && !vorher) zu = el;
    }
    if (!von || !zu || von === zu || !kannBewegen(leiste)) return;
    /*
      MITTEN IN EINER FAHRT ein neuer Wechsel (schnell zweimal getippt): von
      dort weiter, wo das Abbild gerade steht — kein Sprung zurück an den
      alten Punkt.
    */
    const start = laufend ? laufend.abbild.getBoundingClientRect() : von.getBoundingClientRect();
    if (laufend) {
      const alt = laufend.fahrt;
      aufraeumen();
      alt.cancel();
    }
    gleiten(start, zu);
  });
  beobachter.observe(leiste, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  return () => {
    beobachter.disconnect();
    if (laufend) laufend.fahrt.cancel();
    aufraeumen();
  };
}
