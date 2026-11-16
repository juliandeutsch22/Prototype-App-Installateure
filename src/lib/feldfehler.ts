import { DAUER, kannBewegen } from './bewegung';

/**
 * FEHLER AM FELD: KURZER RUCK, FOKUS HIN (Plan 15.11.2026, B11).
 *
 * Wies ein Formular beim Speichern ab, wurde das Feld rot umrandet
 * (`aria-invalid`, G14) — wo es klemmt, musste man suchen, und der Fokus
 * blieb auf „Speichern“. Jetzt ruckt das Feld kurz zur Seite, und der Fokus
 * springt auf das erste abgewiesene Feld: man kann sofort korrigieren, und
 * die Vorlesehilfe liest Feld und Fehler vor.
 *
 * NICHT BEIM TIPPEN. Manche Felder prüfen während der Eingabe (IBAN, UID,
 * E-Mail). Wer gerade in einem Feld schreibt, bekommt weder Ruck noch
 * Sprung — das Feld wird nur rot, wie bisher. Gesprungen wird nur, wenn der
 * Fokus nicht in einem Eingabefeld steht (nach „Speichern“, nach Enter in
 * einem anderen Feld als dem fehlerhaften wäre er ja dort).
 *
 * Für alle Formulare an einer Stelle: ein Beobachter über der App
 * (`Layout`) auf `aria-invalid`. Der Ruck ist nur `transform` (ein Hin und
 * Her von 3 px, kein Nachfedern); bei „Bewegung reduzieren“ entfällt er,
 * der Fokus springt trotzdem.
 */

const EINGABE = 'input, textarea, select, [contenteditable="true"]';

function schreibtGerade(): boolean {
  const a = document.activeElement;
  return !!a && a !== document.body && a.matches(EINGABE);
}

function rucken(el: HTMLElement): void {
  if (!kannBewegen(el)) return;
  el.animate(
    [{ transform: 'none' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }],
    { duration: DAUER.bestaetigt, easing: 'ease-in-out' },
  );
}

/** Den Beobachter über `wurzel` halten, bis die Rückgabe aufgerufen wird. */
export function feldfehlerHalten(wurzel: HTMLElement): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const beobachter = new MutationObserver((eintraege) => {
    if (schreibtGerade()) return;
    const neu: HTMLElement[] = [];
    for (const e of eintraege) {
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.isConnected) continue;
      if (el.getAttribute('aria-invalid') !== 'true' || e.oldValue === 'true') continue;
      if (!neu.includes(el)) neu.push(el);
    }
    if (!neu.length) return;
    neu.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const el of neu) rucken(el);
    const ziel = neu.find((el) => el.matches(EINGABE) || el.tabIndex >= 0);
    ziel?.focus({ preventScroll: true });
    ziel?.scrollIntoView?.({ block: 'center' });
  });
  beobachter.observe(wurzel, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-invalid'] });
  return () => beobachter.disconnect();
}
