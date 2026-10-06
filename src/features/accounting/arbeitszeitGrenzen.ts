import { calcWorkMin, wienVersatzMin, type Zeitangaben } from '@shared/arbeitszeit';
import { nachtMinutenIn, type Nachtzeit } from '@/lib/lohnregeln';
import { leseZahl } from '@/lib/zahl';

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
 * VORBEHALTLICH DER WKO-KLÄRUNG (Runde 3, M1):
 *   - Ein Berufsschultag zählt mit seiner Unterrichtszeit, wenn sie beim
 *     Eintragen angegeben wurde; sonst mit dem Tagessoll.
 *   - Ist die Wochenarbeitszeit anders verteilt (eigenes Tagessoll mit
 *     kürzeren und längeren Tagen, zusammen höchstens 40 Std.), gilt am Tag
 *     bis 9 Std. (§ 11 Abs 2 KJBG).
 *   - Mit `stichtag` zählt nur, was bis dahin gebucht ist: ein Tag in der
 *     Zukunft ist noch nicht gearbeitet und kein Verstoss.
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
  /** `tagVerteilt`: bei anderer Verteilung der Wochenarbeitszeit (§ 11 Abs 2 KJBG). */
  jugendlich: { tag: 8 * 60, tagVerteilt: 9 * 60, woche: 40 * 60, ruhezeit: 12 * 60 },
} as const;

/** Die Nachtruhe für Jugendliche: 20 bis 6 Uhr (§ 17 KJBG). */
export const NACHTRUHE_JUGENDLICHE: Nachtzeit = { von: 20 * 60, bis: 6 * 60 };

/**
 * Ein Eintrag, soweit er hier zählt. `unterrichtMin` nur am Berufsschultag
 * (Runde 3, M1) — leer heisst: es zählt das Tagessoll.
 */
export type GrenzEintrag = Zeitangaben & { date: string; unterrichtMin?: number | null };

/** Die Person, soweit die Prüfung sie braucht. */
export interface GrenzPerson {
  geburtsdatum?: string | null;
  /** Das Tagessoll in Minuten — so zählt ein Berufsschultag ohne Unterrichtszeit. */
  schultagMin?: (tag: string) => number;
  /** Wochenarbeitszeit anders verteilt: am Tag bis 9 Std. (siehe `andereVerteilung`). */
  andereVerteilung?: boolean;
}

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
 * Ein Berufsschultag zählt in die Woche eines Jugendlichen mit seiner
 * Unterrichtszeit, ohne sie mit `schultagMin` (dem Tagessoll).
 *
 * `stichtag`: was danach liegt, zählt nicht — für die Prüfung des Gebuchten
 * (Mitarbeiterübersicht, Startseite). Die Rückfrage vor dem Buchen lässt ihn
 * weg: wer für nächste Woche bucht, soll den Verstoss vorher sehen.
 */
export function grenzfaelle(
  alleEintraege: GrenzEintrag[],
  gesamterZeitraum: { von: string; bis: string },
  person: GrenzPerson,
  { stichtag }: { stichtag?: string } = {},
): Grenzfall[] {
  const faelle: Grenzfall[] = [];
  const zeitraum = stichtag && stichtag < gesamterZeitraum.bis
    ? { von: gesamterZeitraum.von, bis: stichtag }
    : gesamterZeitraum;
  if (zeitraum.von > zeitraum.bis) return faelle;
  const eintraege = stichtag ? alleEintraege.filter((e) => e.date <= stichtag) : alleEintraege;
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
        const schule = e.unterrichtMin != null && e.unterrichtMin > 0
          ? e.unterrichtMin
          : person.schultagMin?.(e.date) ?? 0;
        minutenJeTag.set(e.date, (minutenJeTag.get(e.date) ?? 0) + schule);
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
    const grenze = !jung
      ? GRENZEN.erwachsen.tag
      : person.andereVerteilung ? GRENZEN.jugendlich.tagVerteilt : GRENZEN.jugendlich.tag;
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
        gesetz: !f.jugendlich ? '§ 9 AZG' : f.grenze > GRENZEN.jugendlich.tag ? '§ 11 Abs 2 KJBG' : '§ 11 KJBG',
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

/**
 * Ist die Wochenarbeitszeit ANDERS VERTEILT? Dann darf ein Jugendlicher am Tag
 * bis 9 Std. arbeiten (§ 11 Abs 2 KJBG; Runde 3, M1, vorbehaltlich der
 * WKO-Klärung). Gelesen aus dem eigenen Tagessoll: kürzere und längere Tage
 * nebeneinander, zusammen höchstens 40 Std. Gleichmässig verteilt — auch
 * ohne eigenes Tagessoll — bleibt es bei 8 Std.
 */
export function andereVerteilung(
  p: { tagessoll?: Record<string, number> | null; workDays?: number[] | null } | null | undefined,
): boolean {
  if (!p?.tagessoll) return false;
  const tage = p.workDays && p.workDays.length ? p.workDays : [1, 2, 3, 4, 5];
  const werte = tage.map((t) => p.tagessoll?.[String(t)]);
  if (werte.some((h) => typeof h !== 'number' || !Number.isFinite(h))) return false;
  const zahlen = werte as number[];
  const summe = zahlen.reduce((a, b) => a + b, 0);
  return Math.min(...zahlen) < Math.max(...zahlen) && summe <= GRENZEN.jugendlich.woche / 60;
}

function plusTage(iso: string, n: number): string {
  return isoVon(tagNr(iso) + n);
}

/**
 * Die Grenzfälle, die eine Buchung an `tag` betrifft — für die Rückfrage vor
 * dem Speichern (Runde 3, M2). Dieselbe Prüfung wie in der
 * Mitarbeiterübersicht, nur auf das eingeschränkt, woran diese Buchung
 * beteiligt ist: der Tag selbst (Tagesgrenze, Nachtruhe), die Ruhezeit davor
 * und danach, die Woche und ihre Wochenfreizeit — am Montag auch die der
 * Woche davor, deren Montag danach er ist.
 *
 * `eintraege` sollen von einer Woche vor dem Montag dieser Woche bis zum
 * Montag danach reichen (`umfeldDerBuchung`).
 */
export function grenzfaelleDerBuchung(eintraege: GrenzEintrag[], tag: string, person: GrenzPerson): Grenzfall[] {
  const { von, bis } = umfeldDerBuchung(tag);
  const montag = montagVon(tag);
  const folgetag = plusTage(tag, 1);
  return grenzfaelle(eintraege, { von, bis }, person).filter((f) => {
    switch (f.art) {
      case 'tag':
      case 'nacht':
        return f.bezug === tag;
      case 'ruhezeit':
        return f.bezug === tag || f.bezug === folgetag;
      case 'woche':
      case 'wochenruhe':
        return f.bezug === montag;
      case 'wochenfrei':
        return f.bezug === montag || (tag === montag && f.bezug === von);
    }
  });
}

/** Welche Tage `grenzfaelleDerBuchung` braucht: Montag der Vorwoche bis Montag danach. */
export function umfeldDerBuchung(tag: string): { von: string; bis: string } {
  const montag = montagVon(tag);
  return { von: plusTage(montag, -7), bis: plusTage(montag, 7) };
}

/**
 * Vom Büro gebucht und über der Grenze für Jugendliche — dann ändert oder
 * löscht die Buchung nur das Büro (Runde 3, M2). DIESELBE REGEL WIE IN DER
 * DATENBANK (`app.jugendschutz_gesperrt`, 20261006300000_jugendschutz.sql):
 * angelegt von jemand anderem, Person am Tag unter 18, und der Tag hat mehr
 * als 8 Std. oder die Buchung liegt zwischen 20 und 6 Uhr. Hier nur, damit
 * die Knöpfe gar nicht erst dastehen; sperren tut die Datenbank.
 *
 * Bewusst ohne die 9 Std. bei anderer Verteilung: die Sperre schützt eine
 * Buchung, sie beurteilt sie nicht.
 */
export function buerobuchungGesperrt(
  e: GrenzEintrag & { userId: string; angelegtVon?: string | null },
  eintraegeDerPerson: GrenzEintrag[],
  geburtsdatum: string | null | undefined,
): 'tag' | 'nacht' | null {
  if (!e.angelegtVon || e.angelegtVon === e.userId) return null;
  if (e.status !== 'Anwesend' || !istJugendlich(geburtsdatum, e.date)) return null;
  const tagMin = eintraegeDerPerson
    .filter((x) => x.date === e.date && x.status === 'Anwesend')
    .reduce((s, x) => s + calcWorkMin(x), 0);
  if (tagMin > GRENZEN.jugendlich.tag) return 'tag';
  if (nachtMinutenIn(e.startTime, e.endTime, NACHTRUHE_JUGENDLICHE) > 0) return 'nacht';
  return null;
}

/**
 * Die Unterrichtszeit aus dem Feld am Berufsschultag (Runde 3, M1): „7,5“,
 * „7.5“ oder „7:30“ in Minuten. Leer heisst Tagessoll (`min: null`). Wie die
 * Datenbank: mehr als null und höchstens 12 Stunden.
 */
export function unterrichtAusEingabe(text: string): { min: number | null; fehler: string | null } {
  const t = text.trim();
  if (t === '') return { min: null, fehler: null };
  const uhr = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  // Dezimal über die eine Zahleneingabe der App (M15): „7,5“ wie „7.5“.
  const dezimal = uhr ? null : leseZahl(t).wert;
  const min = uhr
    ? Number(uhr[1]) * 60 + Number(uhr[2])
    : dezimal !== null ? Math.round(dezimal * 60) : NaN;
  if (!Number.isFinite(min)) return { min: null, fehler: `„${t}“ ist keine Stundenzahl — etwa „7,5“ oder „7:30“.` };
  if (min < 1 || min > 12 * 60) return { min: null, fehler: 'Die Unterrichtszeit liegt zwischen 0 und 12 Stunden.' };
  return { min, fehler: null };
}
