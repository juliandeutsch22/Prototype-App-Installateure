/**
 * Der Takt des Rasters: Blätter liegen mit jeder Kante auf einer Rasterlinie.
 *
 * WARUM DAS JAVASCRIPT BRAUCHT (E33, 01.11.2026). Das Raster der Arbeitsfläche
 * hat Zellen zu 24 px. Listen, Formulare und Tabellen liegen als Blätter
 * darauf — deckend, mit einer Linie rundum. Die Linie passt nur, wenn sie AUF
 * einer Rasterlinie liegt; 3 px daneben sieht aus wie ein Versehen, genau das
 * war gemeldet („Grenzen unklar, harmoniert nicht mit dem Raster“). Wie hoch
 * ein Blatt ist, bestimmt sein Inhalt: eine Liste mit 7 Zeilen, ein Formular
 * mit eingeblendetem Hinweis, ein umbrechender Name. CSS kann eine Höhe nicht
 * auf ein Vielfaches runden; also tut es dieser Taktgeber, für jede Seite und
 * jede Breite, ohne dass eine Seite davon wissen muss.
 *
 * WAS ER TUT, und nur das:
 *   - die Breite der Inhaltsspalte auf ganze Zellen (`--takt-breite`), damit
 *     auch rechte Kanten und Spalten auf Linien liegen;
 *   - je Blatt den Abstand darüber um höchstens 23 px größer, damit die
 *     Oberkante auf eine Linie fällt;
 *   - je Blatt das Polster unten um höchstens 23 px größer, damit die Höhe
 *     ganze Zellen misst und die Unterkante auf eine Linie fällt.
 * Nichts wird kleiner, nichts verschoben, was nicht ohnehin darunter liegt.
 *
 * Ohne `ResizeObserver` (Testumgebung, sehr alte Browser) tut er nichts; die
 * Seite ist dann wie gebaut, nur nicht auf den Pixel im Raster.
 */

/** Eine Rasterzelle in Pixel — dieselbe Größe wie `background-size` der Arbeitsfläche. */
export const ZELLE = 24;

/**
 * Was ein Blatt ist: deckend, mit Linie rundum. Dieselbe Liste steht in
 * `src/styles/lot-blatt.css`; `tests/unit/takt.test.ts` hält beide gleich.
 *
 * Eine Karte der Seite — nicht eine Karte in einer Karte, nicht in einem
 * Fenster, Dialog oder Blatt am Handy (das sind Überlagerungen, kein
 * Zeichenblatt) und nicht in den Kontextspalten von Akte und Beleg —, die
 * Listen der Mitarbeiterübersicht (sie sind keine
 * Karten), der Einrichtungshinweis und der Monatskalender, wo er frei auf
 * der Seite steht.
 */
export const BLATT_SELEKTOR =
  ".inhalt .karte:not(.karte .karte):not(:is(.fenster, .fenster-breit, .blatt, [role='dialog'], .akten-kontext, .beleg-kontext) .karte), .inhalt :is(.ue-liste, .ue-liste-woche, .ue-vergleich, .lot-einrichtung), .inhalt .monatskalender:not(:is(.karte, .fenster, .fenster-breit, .blatt, [role='dialog']) .monatskalender)";

/**
 * Was der Taktgeber ausrichtet: die Blätter und die Kontextspalten von Akte
 * und Beleg. Die stehen offen auf dem Raster (Eckmarken statt Fläche, E30),
 * ihre Karten sind keine eigenen Blätter; mit ihren Ecken gehören sie
 * genauso auf Linien.
 */
export const TAKT_SELEKTOR = `${BLATT_SELEKTOR}, .inhalt :is(.akten-kontext, .beleg-kontext)`;

/** Um wie viel muss etwas nach unten, damit `oben` auf einer Linie liegt? 0 bis 23. */
export function ausgleichOben(oben: number, ursprung: number): number {
  const rest = (((Math.round(oben) - Math.round(ursprung)) % ZELLE) + ZELLE) % ZELLE;
  return rest === 0 ? 0 : ZELLE - rest;
}

/** Um wie viel muss eine Höhe wachsen, damit sie ganze Zellen misst? 0 bis 23. */
export function ausgleichHoehe(hoehe: number): number {
  const rest = ((Math.round(hoehe) % ZELLE) + ZELLE) % ZELLE;
  return rest === 0 ? 0 : ZELLE - rest;
}

/** Die größte Breite in ganzen Zellen, die in `breite` passt. */
export function taktBreite(breite: number): number {
  return Math.max(ZELLE, Math.floor(Math.round(breite) / ZELLE) * ZELLE);
}

/** Wo die Linien des Rasters liegen: Ecke der Arbeitsfläche plus `background-position`. */
function ursprungVon(flaeche: HTMLElement): { x: number; y: number } {
  const r = flaeche.getBoundingClientRect();
  const [x, y] = getComputedStyle(flaeche).backgroundPosition.split(' ').map((w) => parseFloat(w) || 0);
  return { x: r.left + x, y: r.top + y };
}

/**
 * Einmal ausrichten: Breite der Spalte, dann die Blätter von oben nach unten.
 * Von oben nach unten, weil jedes Blatt die darunter verschiebt.
 *
 * Gemessen wird jedes Blatt OHNE den eigenen Ausgleich: der wird erst
 * entfernt, dann neu gesetzt. So gilt immer der Grundwert, den das Stylesheet
 * für die jeweilige Breite vorsieht (12, 20, 24 px …), auch nach einem
 * Wechsel der Breite.
 */
export function ausrichten(flaeche: HTMLElement): void {
  const inhalt = flaeche.querySelector<HTMLElement>('.inhalt');
  if (!inhalt) return;
  const stil = getComputedStyle(inhalt);
  const innen = inhalt.clientWidth - parseFloat(stil.paddingLeft) - parseFloat(stil.paddingRight);
  const breite = `${taktBreite(innen)}px`;
  if (inhalt.style.getPropertyValue('--takt-breite') !== breite) inhalt.style.setProperty('--takt-breite', breite);

  const ursprung = ursprungVon(flaeche);
  for (const blatt of flaeche.querySelectorAll<HTMLElement>(TAKT_SELEKTOR)) {
    /*
      DER ABSTAND DARÜBER DARF NICHT DURCHFALLEN. Ist das Blatt das erste in
      einem gewöhnlichen Block (ein Formular, ein Stapel), verschmilzt sein
      oberer Rand mit dem des Blocks — der größere gilt, ein Ausgleich bliebe
      ohne Wirkung. Als `flow-root` behält der Block seinen eigenen Rand und
      das Blatt seinen; sonst ändert sich an ihm nichts.
    */
    const eltern = blatt.parentElement;
    if (eltern && eltern !== flaeche && getComputedStyle(eltern).display === 'block') eltern.style.display = 'flow-root';
    const vorher = [blatt.style.marginTop, blatt.style.paddingBottom];
    blatt.style.marginTop = '';
    blatt.style.paddingBottom = '';
    const s = getComputedStyle(blatt);
    // Unsichtbar oder herausgenommen: nicht anfassen.
    if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
    const r = blatt.getBoundingClientRect();
    const vor = ausgleichOben(r.top, ursprung.y);
    const unten = ausgleichHoehe(r.height);
    const neu = [
      vor ? `${(parseFloat(s.marginTop) || 0) + vor}px` : '',
      unten ? `${(parseFloat(s.paddingBottom) || 0) + unten}px` : '',
    ];
    blatt.style.marginTop = neu[0];
    blatt.style.paddingBottom = neu[1];
    if (neu[0] !== vorher[0] || neu[1] !== vorher[1]) blatt.dataset.takt = `${vor}/${unten}`;
  }
}

/**
 * Den Takt auf einer Arbeitsfläche halten, bis die Rückgabe aufgerufen wird.
 *
 * Neu gerechnet wird, wenn sich die Größe der Inhaltsspalte oder eines
 * Blatts ändert oder Inhalt hinzukommt — höchstens einmal je Bild. Die eigenen
 * Änderungen lösen eine zweite Runde aus, die nichts mehr ändert.
 */
export function taktHalten(flaeche: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;
  let geplant = 0;
  // Nur, was gerade auf der Seite ist: ein Seitenwechsel räumt die alten Blätter ab.
  let beobachtet = new Set<Element>();
  const groesse = new ResizeObserver(() => planen());
  const planen = () => {
    if (geplant) return;
    geplant = requestAnimationFrame(() => {
      geplant = 0;
      ausrichten(flaeche);
      const jetzt = new Set<Element>(flaeche.querySelectorAll(`.inhalt, ${TAKT_SELEKTOR}`));
      for (const el of beobachtet) if (!jetzt.has(el)) groesse.unobserve(el);
      for (const el of jetzt) if (!beobachtet.has(el)) groesse.observe(el);
      beobachtet = jetzt;
    });
  };
  const aenderung = new MutationObserver(() => planen());
  aenderung.observe(flaeche, { childList: true, subtree: true });
  window.addEventListener('resize', planen);
  planen();
  return () => {
    if (geplant) cancelAnimationFrame(geplant);
    groesse.disconnect();
    aenderung.disconnect();
    window.removeEventListener('resize', planen);
  };
}
