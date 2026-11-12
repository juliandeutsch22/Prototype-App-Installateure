/**
 * WELCHE BAUSTELLE EIN FORMULAR DES MONTEURS SCHON KENNT (B3, E83, 12.11.2026).
 *
 * Der Timer lief auf B-2026-0002, der Einsatz heute war dort — und „Material
 * anfordern“ begann trotzdem mit „Für welche Baustelle? — wählen —“. Jedes
 * Formular fragte für sich, oder gar nicht. Hier steht die eine Regel, die
 * alle fragen:
 *
 *   1. Läuft der Arbeitstag, seine Baustelle — dort wird gerade gearbeitet.
 *   2. Sonst der Einsatz des Tages: bei genau einem dieser; bei mehreren der
 *      zuletzt benutzte unter ihnen. Ist keiner davon zuletzt benutzt, bleibt
 *      das Feld leer — „eine falsche Vorauswahl wäre schlimmer als gar keine“
 *      (Schein, Prüflauf 25.09.2026); die Formulare zeigen die Einsätze dann
 *      oben in der Auswahl.
 *   3. Ohne Einsatz an dem Tag: die zuletzt benutzte Baustelle, solange sie
 *      noch wählbar ist.
 *
 * Vorbelegt heißt nie versteckt: das Feld zeigt den Wert, darunter steht,
 * woher er kommt, und jeder kann ihn ändern. Ein Wert aus der Adresse, aus
 * einem Entwurf oder von Hand gewählt geht immer vor; die Formulare belegen
 * nur ein leeres, unberührtes Feld.
 */
export type VorbelegGrund = 'timer' | 'einsatz' | 'zuletzt';

export interface Vorbelegung {
  nr: string;
  grund: VorbelegGrund;
}

export function baustelleVorbelegen(q: {
  /** Baustelle des laufenden Arbeitstags — nur für den heutigen Tag. */
  timer?: string | null;
  /** Baustellennummern der eigenen Einsätze des Tages, in zeitlicher Folge. */
  einsaetze: readonly string[];
  /** Zuletzt in einem Formular benutzte Baustelle. */
  zuletzt?: string | null;
  /** Ist die Nummer im Formular wählbar? Eine abgeschlossene Baustelle wird nicht vorbelegt. */
  waehlbar?: (nr: string) => boolean;
  /**
   * Mehrere Einsätze, keiner zuletzt benutzt: der erste. Nur für den Start
   * des Arbeitstags — morgens beginnt man mit dem ersten Einsatz; ein Schein
   * am Abend gehört eher zum letzten, dort bleibt das Feld dann leer.
   */
  mehrdeutigErster?: boolean;
}): Vorbelegung | null {
  const ok = (nr: string | null | undefined): nr is string => !!nr?.trim() && (q.waehlbar ? q.waehlbar(nr) : true);
  if (ok(q.timer)) return { nr: q.timer, grund: 'timer' };
  const einsaetze = [...new Set(q.einsaetze.filter((nr) => ok(nr)))];
  if (einsaetze.length === 1) return { nr: einsaetze[0], grund: 'einsatz' };
  if (einsaetze.length > 1) {
    if (q.zuletzt && einsaetze.includes(q.zuletzt)) return { nr: q.zuletzt, grund: 'einsatz' };
    return q.mehrdeutigErster ? { nr: einsaetze[0], grund: 'einsatz' } : null;
  }
  if (ok(q.zuletzt)) return { nr: q.zuletzt, grund: 'zuletzt' };
  return null;
}

/** Der Satz unter dem Feld: woher der Wert kommt. */
export const VORBELEG_TEXT: Record<VorbelegGrund, string> = {
  timer: 'Vorbelegt vom laufenden Arbeitstag.',
  einsatz: 'Vorbelegt nach deinem Einsatz.',
  zuletzt: 'Vorbelegt: zuletzt benutzt.',
};

/*
  ZULETZT BENUTZT LIEGT AUF DEM GERÄT. Es ist eine Bequemlichkeit, keine
  Angabe, die irgendwo stimmen muss: fehlt sie (anderes Telefon, privates
  Fenster), bleibt das Feld eben leer — wie vorher. Je Betrieb und Person,
  damit ein geteiltes Tablet niemandem die Baustelle eines anderen vorlegt.
*/
const schluessel = (betrieb: string, uid: string) => `senklot:zuletzt-baustelle:${betrieb}:${uid}`;

export function zuletztLesen(betrieb: string, uid: string): string | null {
  try {
    return localStorage.getItem(schluessel(betrieb, uid)) || null;
  } catch {
    return null;
  }
}

export function zuletztMerken(betrieb: string, uid: string, nr: string | null | undefined): void {
  if (!nr?.trim()) return;
  try {
    localStorage.setItem(schluessel(betrieb, uid), nr);
  } catch {
    // Kein Speicher (privates Fenster): dann gibt es eben kein „zuletzt“.
  }
}
