import type { Abwesenheit } from '@/lib/db/vacations';
import type { Assignment } from '@/types';
import { besetzung } from './besetzung';
import { kurzname, kurzPerson } from './kurzname';
import type { Zelle } from './planTypen';

/*
  DIE BALKEN DES MONATS (Runde 4, Auftrag 5.1 und 5.2) — reine Rechnung, ohne
  Darstellung, damit sie für sich prüfbar ist. Sie ordnet nur an, was die
  Seite schon gerechnet hat (`brett` je Person und Tag, `besetzung` je
  Baustelle und Tag); neu gerechnet wird nichts.
*/

/** Eingeplant, eingeteilt aber abwesend, abwesend. */
export type BalkenArt = 'plan' | 'konflikt' | 'weg';

/** Was an EINEM Tag in einer Zeile steht. Gleicher Schlüssel an Folgetagen = ein Balken. */
export interface TagesEintrag {
  schluessel: string;
  art: BalkenArt;
  /** Beschriftung (kurz). */
  text: string;
  /** Voller Text für `title` und Vorlesehilfe. */
  lang: string;
  /** Die Baustelle, wenn es ein Einsatz ist. */
  nummer?: string;
}

/** Ein Balken: von Tag `start` bis Tag `ende` (Indizes in `tage`), in Bahn `bahn` (ab 0). */
export interface Balken extends TagesEintrag {
  start: number;
  ende: number;
  bahn: number;
}

/**
 * Aufeinanderfolgende Tage mit demselben Schlüssel werden EIN Balken; ein
 * Tag ohne diesen Eintrag beendet ihn — auch das Wochenende, denn dort steht
 * kein Einsatz. Die Bahnen werden gierig vergeben: ein Balken nimmt die
 * erste Bahn, in der der vorige schon geendet hat. So bekommt eine Zeile nur
 * dann eine zweite Bahn, wenn an einem Tag wirklich zwei Einträge stehen.
 */
export function balkenBilden(
  anzahlTage: number,
  eintraegeAm: (index: number) => TagesEintrag[],
): { balken: Balken[]; bahnen: number } {
  const balken: Balken[] = [];
  let offen = new Map<string, Balken>();
  for (let i = 0; i < anzahlTage; i++) {
    const neu = new Map<string, Balken>();
    for (const e of eintraegeAm(i)) {
      // Derselbe Schlüssel zweimal am selben Tag (doppelte Zeile) bleibt ein Balken.
      if (neu.has(e.schluessel)) continue;
      const laufend = offen.get(e.schluessel);
      if (laufend && laufend.ende === i - 1) {
        laufend.ende = i;
        neu.set(e.schluessel, laufend);
      } else {
        const b: Balken = { ...e, start: i, ende: i, bahn: 0 };
        balken.push(b);
        neu.set(e.schluessel, b);
      }
    }
    offen = neu;
  }
  const bahnEnde: number[] = [];
  for (const b of [...balken].sort((x, y) => x.start - y.start)) {
    let bahn = bahnEnde.findIndex((ende) => ende < b.start);
    if (bahn < 0) {
      bahn = bahnEnde.length;
      bahnEnde.push(-1);
    }
    bahnEnde[bahn] = b.ende;
    b.bahn = bahn;
  }
  return { balken, bahnen: Math.max(1, bahnEnde.length) };
}

/**
 * Die Art einer Abwesenheit als Wort (Auftrag 5.1). Die Datenbank liefert
 * nur bei Zeitausgleich ein Kürzel („ZA“); alles andere kommt schon als Wort
 * oder als „abwesend“, wo der Grund nicht gesehen werden darf.
 */
export function artWort(text: string | null | undefined): string {
  const t = (text ?? '').trim() || 'abwesend';
  return t.replace(/^ZA(?=$|\s)/, 'Zeitausgleich');
}

/**
 * Was in der Zeile einer Person an einem Tag steht — aus derselben Zelle,
 * aus der die Woche zeichnet (`brett`). Reihenfolge wie bisher im Monat:
 * eingeteilt und ganztags weg (Bernstein), ganztags weg (grau), eingeplant,
 * Betriebsurlaub (grau). Stundenweise weg ist man einplanbar; das steht in
 * der Vorschau, nicht als Balken.
 */
export function personTag(z: Zelle | undefined, betriebsurlaub: boolean): TagesEintrag[] {
  const baustellen = z?.baustellen ?? [];
  if (baustellen.length > 0) {
    const gesehen = new Set<string>();
    const aus: TagesEintrag[] = [];
    for (const b of baustellen) {
      if (gesehen.has(b.nummer)) continue;
      gesehen.add(b.nummer);
      if (z?.imUrlaub) {
        const art = artWort(z.abwesendText);
        aus.push({
          schluessel: `k:${b.nummer}`,
          art: 'konflikt',
          text: `${kurzname(b.name)} – fehlt`,
          lang: `${b.name} (${b.nummer}) – eingeteilt, aber ${art}`,
          nummer: b.nummer,
        });
      } else {
        aus.push({ schluessel: `e:${b.nummer}`, art: 'plan', text: kurzname(b.name), lang: `${b.name} (${b.nummer})`, nummer: b.nummer });
      }
    }
    return aus;
  }
  if (z?.imUrlaub) {
    const art = artWort(z.abwesendText);
    return [{ schluessel: `w:${art}`, art: 'weg', text: art, lang: art }];
  }
  if (betriebsurlaub) return [{ schluessel: 'w:Betriebsurlaub', art: 'weg', text: 'Betriebsurlaub', lang: 'Betriebsurlaub' }];
  return [];
}

/** Eine Baustelle im Monat: wer an welchem Tag dort eingeteilt ist. */
export interface BaustellenMonat {
  nummer: string;
  name: string;
  /** Tag -> Einsätze (eine Zeile je Person). */
  tage: Map<string, Assignment[]>;
  /** Erster und letzter Einsatztag. */
  von: string;
  bis: string;
}

/**
 * Die Baustellen mit Einsatz im Monat, nach erstem Einsatztag und Name —
 * dieselbe Reihenfolge wie die bisherige Liste „Baustellen diesen Monat“.
 */
export function baustellenDesMonats(
  einsaetze: Assignment[],
  nameVon: (nummer: string) => string,
): BaustellenMonat[] {
  const m = new Map<string, BaustellenMonat>();
  for (const a of einsaetze) {
    const e = m.get(a.projectNumber) ?? { nummer: a.projectNumber, name: nameVon(a.projectNumber), tage: new Map(), von: a.date, bis: a.date };
    const liste = e.tage.get(a.date) ?? [];
    liste.push(a);
    e.tage.set(a.date, liste);
    if (a.date < e.von) e.von = a.date;
    if (a.date > e.bis) e.bis = a.date;
    m.set(a.projectNumber, e);
  }
  return [...m.values()].sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, 'de'));
}

/**
 * Was in der Zeile einer Baustelle an einem Tag steht (Auftrag 5.2): EIN
 * Eintrag mit der Besetzung. Wechselt die Besetzung, wechselt der Schlüssel
 * und ein neuer Balken beginnt. Fehlt jemand, ist er Bernstein — mit
 * derselben Rechnung wie in der Woche (`besetzung`).
 */
export function baustelleTag(
  einsaetzeAmTag: Assignment[] | undefined,
  urlaube: Abwesenheit[],
  tag: string,
  nameVon: (a: Assignment) => string,
): TagesEintrag[] {
  if (!einsaetzeAmTag || einsaetzeAmTag.length === 0) return [];
  // Eine Person je Baustelle und Tag, auch wenn eine Zeile doppelt käme.
  const leute = [...new Map(einsaetzeAmTag.map((a) => [a.userId, a])).values()];
  const b = besetzung(leute.map((a) => ({ userId: a.userId, userName: nameVon(a) })), urlaube, tag);
  const konflikt = b.fehlen.length > 0;
  const ids = leute.map((a) => a.userId).sort().join(',');
  const namen = leute.map(nameVon);
  const text = leute.length === 1 ? kurzPerson(namen[0]) : `${leute.length} Pers.`;
  const fehlt = b.fehlen.map((f) => f.name);
  return [
    {
      schluessel: `${konflikt ? 'k' : 'e'}:${ids}`,
      art: konflikt ? 'konflikt' : 'plan',
      text,
      lang: konflikt ? `${namen.join(', ')} – fehlt: ${fehlt.join(', ')}` : namen.join(', '),
      nummer: einsaetzeAmTag[0].projectNumber,
    },
  ];
}

/**
 * LIEFERUNG OHNE ANNAHME (Auftrag 4.4, Regel 3) — EINE Regel für den
 * Tageskopf der Woche, den Punkt im Monat und die Vorschau; sie steht in
 * `wochenTermine.ts`.
 */
export { lieferungOhneAnnahme } from './wochenTermine';

/**
 * Der Tag unter der Klickstelle in einem Balken (Auftrag 5.3):
 * `start + floor((x − links) / breite × span)`, auf den Balken begrenzt.
 * Ohne Klickstelle (Tastatur) der erste Tag.
 */
export function tagImBalken(b: Pick<Balken, 'start' | 'ende'>, klick?: { x: number; links: number; breite: number } | null): number {
  if (!klick || klick.breite <= 0) return b.start;
  const span = b.ende - b.start + 1;
  const k = b.start + Math.floor(((klick.x - klick.links) / klick.breite) * span);
  return Math.max(b.start, Math.min(b.ende, k));
}

/** Ab dieser Breite trägt ein Balken seine Beschriftung (Auftrag 5.1). */
export const BESCHRIFTUNG_AB_PX = 46;

/** Der Rand eines Balkens links und rechts zusammen (`.mo-balken`, höchstens 2 × 2 px). */
const BALKEN_RAND_PX = 4;

/**
 * Ob ein Balken beschriftet wird: gemessen an der gezeichneten Breite eines
 * Tages, weniger dem Rand des Balkens. GEMESSEN, NICHT AUS DER BREITENSTUFE
 * GESCHÄTZT: die Breite eines Tages hängt an Bildschirm, Seitenleiste und
 * Monatslänge (bei 1.440 px rund 30 px, bei 1.920 px rund 45 px) — eine feste
 * Mindestzahl Tage je Stufe läge an den Rändern daneben. Unbekannt (vor der
 * ersten Messung) heißt: ohne Text — lieber einen Augenblick leer als ein
 * abgeschnittenes „W…“.
 */
export function beschriftet(span: number, tagBreite: number): boolean {
  return tagBreite > 0 && span * tagBreite - BALKEN_RAND_PX >= BESCHRIFTUNG_AB_PX;
}
