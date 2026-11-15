/**
 * Ein Erstellungsversuch, dessen Antwort nicht angekommen ist (Durchsicht
 * 15.11.2026, G2) — gemerkt im Browser, bis die Datenbank ihn geklärt hat.
 *
 * WARUM ÜBER DAS NEULADEN HINWEG. Vorher war die Ungewissheit nach einem
 * Neuladen einfach vergessen: die Sperre war weg, die Frage, ob die Rechnung
 * entstanden ist, nicht. Mit der gemerkten Kennung klärt die Ansicht auch
 * danach noch von selbst, statt einen zweiten Versuch zuzulassen.
 *
 * NUR EINE BEQUEMLICHKEIT DIESES GERÄTS, keine Wahrheit: verloren geht beim
 * Fehlen des Speichers (privates Fenster, gelöschte Daten) nur die
 * automatische Klärung nach dem Neuladen. Die Datenbank bleibt die Stelle,
 * die weiß, ob es die Rechnung gibt — und ein Versuch ohne Klärung kann nie
 * eine zweite Rechnung derselben Kennung anlegen.
 */

export interface OffenerVersuch {
  /** Die Kennung, die mit `rechnung_ausstellen` geschickt wurde. */
  kennung: string;
  /** Die Baustelle, für die erstellt wurde — für den Text der Ansicht. */
  baustelle: string;
}

const schluessel = (betrieb: string, benutzer: string) => `senklot:rechnungsversuch:${betrieb}:${benutzer}`;

export function offenenVersuchLesen(betrieb: string, benutzer: string): OffenerVersuch | null {
  try {
    const roh = window.localStorage.getItem(schluessel(betrieb, benutzer));
    if (!roh) return null;
    const v = JSON.parse(roh) as Partial<OffenerVersuch>;
    return typeof v.kennung === 'string' && v.kennung
      ? { kennung: v.kennung, baustelle: typeof v.baustelle === 'string' ? v.baustelle : '' }
      : null;
  } catch {
    return null;
  }
}

export function offenenVersuchMerken(betrieb: string, benutzer: string, v: OffenerVersuch): void {
  try {
    window.localStorage.setItem(schluessel(betrieb, benutzer), JSON.stringify(v));
  } catch {
    // Ohne Speicher klärt die Ansicht bis zum Neuladen; siehe oben.
  }
}

export function offenenVersuchVergessen(betrieb: string, benutzer: string): void {
  try {
    window.localStorage.removeItem(schluessel(betrieb, benutzer));
  } catch {
    // Nichts zu tun: was nicht gespeichert werden konnte, muss nicht weg.
  }
}
