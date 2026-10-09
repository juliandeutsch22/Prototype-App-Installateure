import { useEffect } from 'react';

/**
 * DIE SEITE HINTER EINEM OVERLAY STEHT STILL.
 *
 * Aus dem Betrieb (09.10.2026, iPhone): im Blatt „Neuen Kunden anlegen“
 * scrollte teils nur die Seite dahinter, die das Blatt eigentlich verdeckt.
 * Gescrollt wird in dieser App das Dokument selbst; Blatt, Seitenfenster,
 * Rückfrage und Suche liegen fest darüber. Ein Wischen auf dem Schleier — oder
 * am Ende der Liste im Blatt, wo das Scrollen an die Seite weitergereicht
 * wird — bewegte deshalb die Seite darunter.
 *
 * `overflow: hidden` an `<html>` hält das Dokument fest; es gilt für das
 * ganze Fenster, und Safari beachtet es seit iOS 16 auch beim Wischen. Die
 * Scrollposition bleibt dabei stehen.
 *
 * NUR AN `<html>`, NICHT AN `<body>`. `body` ist hier `height: 100%` (für
 * die Hülle); mit `overflow: hidden` schnitte es die Seite auf Fensterhöhe
 * ab, und sie spränge nach oben — gemessen: von 300 px auf 0. Genau das tat
 * bisher das große Unterschriftsblatt. Ebenso wenig `body` mit
 * `position: fixed`: das setzt die Position auf null und müsste danach
 * zurückspringen (und verwirrte „Zurück“, `Seitenposition.tsx`).
 *
 * EIN ZÄHLER FÜR ALLE. Ein Seitenfenster mit einer Rückfrage darüber sind
 * zwei Overlays; erst wenn das letzte schliesst, darf die Seite wieder
 * scrollen. Die Werte vor der ersten Sperre werden gemerkt und danach
 * wiederhergestellt, nicht auf leer gesetzt.
 *
 * AM SCHREIBTISCH verschwindet mit `overflow: hidden` die Bildlaufleiste;
 * die Seite rückte dann um ihre Breite nach rechts. Ihre Breite wird deshalb
 * als Abstand rechts am `body` gehalten. Am Handy ist sie null.
 *
 * DAS WISCHEN SELBST WIRD ABGEFANGEN, wo nichts rollen kann (Rückmeldung
 * 09.10.2026, iPhone, Inventur im Lager): `overflow: hidden` allein hielt die
 * Seite hinter einer Rückfrage nicht fest — das Blatt hat einen eigenen
 * Rollbereich, die Rückfrage nicht. Solange ein Overlay offen ist, bricht ein
 * Wischen ab, das nichts unter dem Finger rollen könnte. Was selbst rollt
 * (Inhalt eines Blatts, eine hohe Rückfrage, eine breite Tabelle), Felder
 * (Text markieren) und zwei Finger (zoomen) bleiben, wie sie sind.
 */

let offen = 0;
let vorher: { html: string; abstand: string } | null = null;

const FELD = 'input, textarea, select, [contenteditable="true"]';

/** Kann unter dem Finger etwas selbst rollen — oder ist es ein Feld? */
function darfWischen(ziel: EventTarget | null): boolean {
  let el = ziel instanceof Element ? ziel : null;
  if (el?.closest(FELD)) return true;
  while (el && el !== document.body && el !== document.documentElement) {
    const stil = getComputedStyle(el);
    const senkrecht = /(auto|scroll)/.test(stil.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const waagrecht = /(auto|scroll)/.test(stil.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (senkrecht || waagrecht) return true;
    el = el.parentElement;
  }
  return false;
}

function wischen(e: TouchEvent): void {
  if ((e.touches?.length ?? 1) > 1) return;
  if (!darfWischen(e.target)) e.preventDefault();
}

function sperren(): void {
  offen += 1;
  if (offen > 1) return;
  const html = document.documentElement;
  const body = document.body;
  const leiste = window.innerWidth - html.clientWidth;
  vorher = { html: html.style.overflow, abstand: body.style.paddingRight };
  html.style.overflow = 'hidden';
  // Nicht passiv: nur so lässt sich das Wischen abbrechen.
  document.addEventListener('touchmove', wischen, { passive: false });
  // Ohne Layout (Testumgebung) ist `clientWidth` null — dann gibt es keine Leiste auszugleichen.
  if (html.clientWidth > 0 && leiste > 0) {
    const bisher = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${bisher + leiste}px`;
  }
}

function freigeben(): void {
  if (offen === 0) return;
  offen -= 1;
  if (offen > 0 || !vorher) return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = vorher.html;
  body.style.paddingRight = vorher.abstand;
  document.removeEventListener('touchmove', wischen);
  vorher = null;
}

/** Hält die Seite fest, solange `aktiv` gilt. */
export function useHintergrundSperre(aktiv: boolean): void {
  useEffect(() => {
    if (!aktiv) return;
    sperren();
    return freigeben;
  }, [aktiv]);
}

/** Nur für Tests: wie viele Overlays die Seite gerade festhalten. */
export function offeneSperren(): number {
  return offen;
}
