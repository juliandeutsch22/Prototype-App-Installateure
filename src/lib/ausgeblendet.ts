/**
 * AUSGEBLENDETE EINTRÄGE EINER LISTE, AUF DIESEM GERÄT (14.11.2026).
 *
 * Für Listen, die wie Mitteilungen gelesen werden (das Änderungsprotokoll der
 * eigenen Buchungen): ein Eintrag lässt sich wegklicken und wieder zeigen.
 * Ausblenden ist kein Löschen — die Aufzeichnung bleibt vollständig.
 *
 * NUR AUF DEM GERÄT, NICHT AUF DEM SERVER — dieselbe Abwägung wie beim
 * Datenschutz-Hinweis (`RechtstextHinweis`): wer welchen Eintrag gesehen hat,
 * wäre ein neues Datum über jede Person, das der Betrieb auswerten könnte und
 * das niemand braucht. Auf einem zweiten Gerät steht der Eintrag deshalb noch.
 *
 * MIT VIELEN EINTRÄGEN KLEIN: „alle ausblenden“ merkt sich nur einen Zeitpunkt
 * (`bis`), nicht jede Kennung. Einzeln Ausgeblendetes, das älter ist, fällt
 * dabei weg. Bleiben trotzdem sehr viele Einzelne, zählen die neuesten
 * `HOECHSTENS` — ein älterer Eintrag erschiene dann wieder, nichts ginge verloren.
 */

export interface Ausgeblendet {
  /** Alles bis zu diesem Zeitpunkt (ms) ist ausgeblendet; 0 = nichts. */
  bis: number;
  /** Einzeln ausgeblendet: Kennung → Zeitpunkt des Eintrags (ms). */
  einzeln: Record<string, number>;
}

export const HOECHSTENS = 1000;

const LEER: Ausgeblendet = { bis: 0, einzeln: {} };

function schluessel(liste: string, uid: string): string {
  return `senklot.ausgeblendet:${liste}:${uid}`;
}

export function lesen(liste: string, uid: string): Ausgeblendet {
  try {
    const roh = window.localStorage.getItem(schluessel(liste, uid));
    if (!roh) return LEER;
    const wert = JSON.parse(roh) as Partial<Ausgeblendet>;
    const bis = typeof wert.bis === 'number' && Number.isFinite(wert.bis) ? wert.bis : 0;
    const einzeln: Record<string, number> = {};
    if (wert.einzeln && typeof wert.einzeln === 'object') {
      for (const [id, am] of Object.entries(wert.einzeln)) if (typeof am === 'number' && Number.isFinite(am)) einzeln[id] = am;
    }
    return { bis, einzeln };
  } catch {
    // Kaputter oder gesperrter Speicher: dann ist eben nichts ausgeblendet — kein Schaden.
    return LEER;
  }
}

/** Räumt auf: Einzelne bis `bis` sind überflüssig, und mehr als `HOECHSTENS` werden es nie. */
export function aufgeraeumt(stand: Ausgeblendet): Ausgeblendet {
  const rest = Object.entries(stand.einzeln)
    .filter(([, am]) => am > stand.bis)
    .sort((a, b) => b[1] - a[1])
    .slice(0, HOECHSTENS);
  return { bis: stand.bis, einzeln: Object.fromEntries(rest) };
}

function schreiben(liste: string, uid: string, stand: Ausgeblendet): Ausgeblendet {
  const sauber = aufgeraeumt(stand);
  try {
    if (sauber.bis === 0 && Object.keys(sauber.einzeln).length === 0) window.localStorage.removeItem(schluessel(liste, uid));
    else window.localStorage.setItem(schluessel(liste, uid), JSON.stringify(sauber));
  } catch {
    // Ohne Speicher (privates Fenster) gilt das Ausblenden nur bis zum Neuladen.
  }
  return sauber;
}

export function istAusgeblendet(stand: Ausgeblendet, id: string, am: number): boolean {
  return am <= stand.bis || id in stand.einzeln;
}

export function einenAusblenden(liste: string, uid: string, id: string, am: number): Ausgeblendet {
  const stand = lesen(liste, uid);
  return schreiben(liste, uid, { bis: stand.bis, einzeln: { ...stand.einzeln, [id]: am } });
}

/** Alles bis einschließlich `am` ausblenden — der neueste Eintrag, den man gerade sieht. */
export function alleAusblenden(liste: string, uid: string, am: number): Ausgeblendet {
  const stand = lesen(liste, uid);
  return schreiben(liste, uid, { bis: Math.max(stand.bis, am), einzeln: stand.einzeln });
}

export function alleZeigen(liste: string, uid: string): Ausgeblendet {
  return schreiben(liste, uid, LEER);
}
