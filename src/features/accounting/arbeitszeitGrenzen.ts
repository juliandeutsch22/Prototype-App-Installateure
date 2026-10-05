import { calcWorkMin, wienVersatzMin, type Zeitangaben } from '@shared/arbeitszeit';

/**
 * Die gesetzlichen Grenzen der Arbeitszeit — geprüft an dem, was gebucht ist
 * (Stand-Datei 11.1, Punkt 4).
 *
 * WARUM IM BÜRO. Das Arbeitsinspektorat fragt den Arbeitgeber, nicht den
 * Monteur. Eine Warnung nur in der Maske des Monteurs sähe im Betrieb
 * niemand, der dafür geradesteht. Die Zeiterfassung warnt weiter bei mehr als
 * zwölf Stunden am Tag; hier steht, was über den Tag hinausgeht.
 *
 * GEPRÜFT WIRD, NICHT GESPERRT. Notdienst und Gefahr in Verzug sind zulässige
 * Ausnahmen — aber nur begründet. Deshalb gibt es je Fall eine Begründung,
 * keine Sperre beim Buchen.
 *
 * DIE GRENZEN:
 *   Erwachsene  — 12 Std. am Tag und 60 Std. in der Woche (§ 9 AZG),
 *                 11 Std. Ruhezeit zwischen zwei Arbeitstagen (§ 12 AZG),
 *                 36 Std. ununterbrochene Ruhe je Kalenderwoche (§§ 3, 4 ARG).
 *   Jugendliche — 8 Std. am Tag und 40 Std. in der Woche (§ 11 KJBG),
 *   (unter 18)    12 Std. Ruhezeit (§ 16 KJBG), keine Arbeit zwischen 20 und
 *                 6 Uhr (§ 17 KJBG), zwei freie Kalendertage am Stück mit dem
 *                 Sonntag (§ 19 KJBG). Die Berufsschule zählt zur
 *                 Wochenarbeitszeit (§ 11 Abs 6 KJBG).
 *
 * NICHT GEPRÜFT: die Ruhepausen, der Durchschnitt von 48 Std. über 17 Wochen
 * (§ 9 Abs 4 AZG), Gleitzeit- und Durchrechnungsmodelle (Stand-Datei 11.2)
 * und die Ausnahmen der Kollektivverträge. Gebucht ohne Uhrzeit (alte
 * Einträge mit Stundenzahl) zählt ein Tag voll für die Wochenruhe, aber nicht
 * für Ruhezeit und Nachtarbeit — dafür fehlt die Uhrzeit.
 */

export type GrenzArt = 'tag' | 'woche' | 'ruhezeit' | 'wochenruhe' | 'nacht' | 'wochenfrei';

export interface Grenzfall {
  art: GrenzArt;
  /** Der Tag (bei Ruhezeit: der Tag nach der zu kurzen Ruhe) oder der Montag der Woche. */
  bezug: string;
  jugendlich: boolean;
  /** Gemessener Wert in Minuten (bei Wochenfreizeit: 0). */
  ist: number;
  /** Die Grenze in Minuten (bei Nachtarbeit und Wochenfreizeit: 0). */
  grenze: number;
}

export const GRENZEN = {
  erwachsen: { tag: 12 * 60, woche: 60 * 60, ruhezeit: 11 * 60, wochenruhe: 36 * 60 },
  jugendlich: { tag: 8 * 60, woche: 40 * 60, ruhezeit: 12 * 60 },
} as const;

/** Ein Eintrag, soweit er hier zählt. */
export type GrenzEintrag = Zeitangaben & { date: string };

const TAG = 24 * 60;

/** Tage seit 1970 — für Abstände ohne Zeitzonen-Überraschung. */
function tagNr(iso: string): number {
  const [j, m, t] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, t) / 86_400_000;
}

function isoVon(nr: number): string {
  return new Date(nr * 86_400_000).toISOString().slice(0, 10);
}

function minutenAus(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Ein Zeitpunkt als Minuten in UTC — damit die Nacht der Zeitumstellung stimmt. */
function zeitpunkt(datum: string, hhmm: string, tagVersatz = 0): number {
  const d = isoVon(tagNr(datum) + tagVersatz);
  return (tagNr(datum) + tagVersatz) * TAG + minutenAus(hhmm) - wienVersatzMin(d, hhmm);
}

/** Der Montag der Woche eines Tages. */
export function montagVon(iso: string): string {
  const nr = tagNr(iso);
  // 1970-01-01 war ein Donnerstag.
  const wochentag = (nr + 3) % 7; // 0 = Montag
  return isoVon(nr - wochentag);
}

/** Unter 18 an diesem Tag? Ohne Geburtsdatum: nein. */
export function istJugendlich(geburtsdatum: string | null | undefined, tag: string): boolean {
  if (!geburtsdatum || !/^\d{4}-\d{2}-\d{2}$/.test(geburtsdatum)) return false;
  const achtzehn = `${Number(geburtsdatum.slice(0, 4)) + 18}${geburtsdatum.slice(4)}`;
  return tag < achtzehn;
}

interface Intervall { von: number; bis: number; tag: string }

/**
 * Die Grenzfälle einer Person in einem Zeitraum.
 *
 * `eintraege` sind die Einträge DIESER Person; sie sollen eine Woche vor und
 * nach dem Zeitraum mit umfassen — sonst fehlen der Woche am Rand Tage, der
 * Ruhezeit am Ersten der Vortag und der Wochenfreizeit der Montag danach.
 * `schultagMin` ist das Tagessoll, mit dem ein Berufsschultag in die Woche
 * eines Jugendlichen zählt.
 */
export function grenzfaelle(
  eintraege: GrenzEintrag[],
  zeitraum: { von: string; bis: string },
  person: { geburtsdatum?: string | null; schultagMin?: (tag: string) => number },
): Grenzfall[] {
  const faelle: Grenzfall[] = [];
  const jugendlich = (tag: string) => istJugendlich(person.geburtsdatum, tag);
  const imZeitraum = (tag: string) => tag >= zeitraum.von && tag <= zeitraum.bis;

  // Minuten je Tag, belegte Tage, Intervalle mit Uhrzeit.
  const minutenJeTag = new Map<string, number>();
  const belegt = new Set<string>();
  const intervalle: Intervall[] = [];
  for (const e of eintraege) {
    if (e.status === 'Berufsschule') {
      belegt.add(e.date);
      if (jugendlich(e.date)) {
        minutenJeTag.set(e.date, (minutenJeTag.get(e.date) ?? 0) + (person.schultagMin?.(e.date) ?? 0));
      }
      continue;
    }
    if (e.status !== 'Anwesend') continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    belegt.add(e.date);
    minutenJeTag.set(e.date, (minutenJeTag.get(e.date) ?? 0) + min);
    if (e.startTime && e.endTime) {
      const von = zeitpunkt(e.date, e.startTime);
      const bis = zeitpunkt(e.date, e.endTime, e.endTime < e.startTime ? 1 : 0);
      if (bis > von) intervalle.push({ von, bis, tag: e.date });
    }
  }
  intervalle.sort((a, b) => a.von - b.von);

  // 1. Tag
  for (const [tag, min] of minutenJeTag) {
    if (!imZeitraum(tag)) continue;
    const jung = jugendlich(tag);
    const grenze = jung ? GRENZEN.jugendlich.tag : GRENZEN.erwachsen.tag;
    if (min > grenze) faelle.push({ art: 'tag', bezug: tag, jugendlich: jung, ist: min, grenze });
  }

  // Die Wochen, die den Zeitraum berühren.
  const wochen: string[] = [];
  for (let m = tagNr(montagVon(zeitraum.von)); m <= tagNr(zeitraum.bis); m += 7) wochen.push(isoVon(m));

  for (const montag of wochen) {
    const tage = Array.from({ length: 7 }, (_, i) => isoVon(tagNr(montag) + i));
    const jung = jugendlich(montag);

    // 2. Woche
    const summe = tage.reduce((s, t) => s + (minutenJeTag.get(t) ?? 0), 0);
    const wochenGrenze = jung ? GRENZEN.jugendlich.woche : GRENZEN.erwachsen.woche;
    if (summe > wochenGrenze) {
      faelle.push({ art: 'woche', bezug: montag, jugendlich: jung, ist: summe, grenze: wochenGrenze });
    }

    if (jung) {
      // 6. Wochenfreizeit: der Sonntag frei, und der Samstag davor oder der Montag danach.
      const samstag = tage[5];
      const sonntag = tage[6];
      const montagDanach = isoVon(tagNr(montag) + 7);
      const frei = (t: string) => !belegt.has(t);
      if (!(frei(sonntag) && (frei(samstag) || frei(montagDanach)))) {
        faelle.push({ art: 'wochenfrei', bezug: montag, jugendlich: true, ist: 0, grenze: 0 });
      }
    } else {
      // 4. Wochenruhe: die längste Lücke in der Kalenderwoche.
      const anfang = tagNr(montag) * TAG;
      const ende = anfang + 7 * TAG;
      const besetzt: [number, number][] = [];
      for (const t of tage) {
        if (!belegt.has(t)) continue;
        const mitUhrzeit = intervalle.filter((i) => i.tag === t);
        // Ohne Uhrzeit zählt der Tag ganz — die sichere Seite.
        if (mitUhrzeit.length === 0) besetzt.push([tagNr(t) * TAG, (tagNr(t) + 1) * TAG]);
      }
      for (const i of intervalle) {
        if (i.bis > anfang && i.von < ende) besetzt.push([Math.max(i.von, anfang), Math.min(i.bis, ende)]);
      }
      if (besetzt.length > 0) {
        besetzt.sort((a, b) => a[0] - b[0]);
        let laengste = 0;
        let frei = anfang;
        for (const [v, b] of besetzt) {
          laengste = Math.max(laengste, v - frei);
          frei = Math.max(frei, b);
        }
        laengste = Math.max(laengste, ende - frei);
        if (laengste < GRENZEN.erwachsen.wochenruhe) {
          faelle.push({ art: 'wochenruhe', bezug: montag, jugendlich: false, ist: laengste, grenze: GRENZEN.erwachsen.wochenruhe });
        }
      }
    }
  }

  // 3. Ruhezeit zwischen zwei Arbeitstagen (nur mit Uhrzeit).
  const jeTag = new Map<string, { von: number; bis: number }>();
  for (const i of intervalle) {
    const t = jeTag.get(i.tag);
    jeTag.set(i.tag, t ? { von: Math.min(t.von, i.von), bis: Math.max(t.bis, i.bis) } : { von: i.von, bis: i.bis });
  }
  const arbeitstage = [...jeTag.keys()].sort();
  for (let k = 1; k < arbeitstage.length; k += 1) {
    const tag = arbeitstage[k];
    if (!imZeitraum(tag)) continue;
    const ruhe = Math.max(0, jeTag.get(tag)!.von - jeTag.get(arbeitstage[k - 1])!.bis);
    const jung = jugendlich(tag);
    const grenze = jung ? GRENZEN.jugendlich.ruhezeit : GRENZEN.erwachsen.ruhezeit;
    if (ruhe < grenze) faelle.push({ art: 'ruhezeit', bezug: tag, jugendlich: jung, ist: ruhe, grenze });
  }

  // 5. Nachtarbeit bei Jugendlichen: 20 bis 6 Uhr.
  const nachtJeTag = new Map<string, number>();
  for (const i of intervalle) {
    if (!jugendlich(i.tag)) continue;
    let summe = 0;
    // Die Nächte rund um den Einsatz: vom Vortag bis zum Folgetag.
    for (let d = tagNr(i.tag) - 1; d <= tagNr(i.tag) + 1; d += 1) {
      const nachtVon = zeitpunkt(isoVon(d), '20:00');
      const nachtBis = zeitpunkt(isoVon(d + 1), '06:00');
      summe += Math.max(0, Math.min(i.bis, nachtBis) - Math.max(i.von, nachtVon));
    }
    if (summe > 0) nachtJeTag.set(i.tag, (nachtJeTag.get(i.tag) ?? 0) + summe);
  }
  for (const [tag, min] of nachtJeTag) {
    if (imZeitraum(tag)) faelle.push({ art: 'nacht', bezug: tag, jugendlich: true, ist: min, grenze: 0 });
  }

  const reihenfolge: GrenzArt[] = ['tag', 'nacht', 'ruhezeit', 'woche', 'wochenruhe', 'wochenfrei'];
  return faelle.sort((a, b) => a.bezug.localeCompare(b.bezug) || reihenfolge.indexOf(a.art) - reihenfolge.indexOf(b.art));
}

/** „8:30“ — Stunden und Minuten. */
export function stdMin(min: number): string {
  const h = Math.floor(min / 60);
  return `${h}:${String(Math.round(min - h * 60)).padStart(2, '0')}`;
}

/** Die ISO-Kalenderwoche eines Montags. */
export function kalenderwoche(montag: string): number {
  const donnerstag = tagNr(montag) + 3;
  const jahr = isoVon(donnerstag).slice(0, 4);
  return Math.floor((donnerstag - tagNr(`${jahr}-01-01`)) / 7) + 1;
}

const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Was in der Liste steht: was, wann, wie viel — und wogegen. */
export function grenzText(f: Grenzfall): { titel: string; gesetz: string } {
  switch (f.art) {
    case 'tag':
      return {
        titel: `${stdMin(f.ist)} Std. am ${kurz(f.bezug)} — höchstens ${f.grenze / 60} Std.`,
        gesetz: f.jugendlich ? '§ 11 KJBG' : '§ 9 AZG',
      };
    case 'woche':
      return {
        titel: `${stdMin(f.ist)} Std. in KW ${kalenderwoche(f.bezug)} — höchstens ${f.grenze / 60} Std.`,
        gesetz: f.jugendlich ? '§ 11 KJBG' : '§ 9 AZG',
      };
    case 'ruhezeit':
      return {
        titel: `Ruhezeit vor dem ${kurz(f.bezug)}: ${stdMin(f.ist)} Std. — mindestens ${f.grenze / 60} Std.`,
        gesetz: f.jugendlich ? '§ 16 KJBG' : '§ 12 AZG',
      };
    case 'wochenruhe':
      return {
        titel: `Längste Ruhe in KW ${kalenderwoche(f.bezug)}: ${stdMin(f.ist)} Std. — mindestens 36 Std.`,
        gesetz: '§§ 3, 4 ARG',
      };
    case 'nacht':
      return {
        titel: `Arbeit zwischen 20 und 6 Uhr am ${kurz(f.bezug)}: ${stdMin(f.ist)} Std.`,
        gesetz: '§ 17 KJBG',
      };
    case 'wochenfrei':
      return {
        titel: `KW ${kalenderwoche(f.bezug)}: keine zwei freien Tage am Stück mit dem Sonntag`,
        gesetz: '§ 19 KJBG',
      };
  }
}

/** Der Schlüssel eines Falls — an ihm hängt die Begründung. */
export function fallSchluessel(userId: string, f: { art: string; bezug: string }): string {
  return `${userId}|${f.art}|${f.bezug}`;
}
