import type { AppUser, TimeEntry } from '@/types';
import { calcWorkMin, tagesAnteil, tagessollStunden } from '@/lib/time';
import { isAustrianHoliday } from '@shared/feiertage';
import {
  arbeitMinImFenster, fensterSchnitt, NACHTZEIT_VORGABE, type Nachtzeit, type UeberstundenRegel,
} from '@/lib/lohnregeln';
import { dezemberNachmittagMin } from './zuschlaege';
import { montagVon } from './arbeitszeitGrenzen';

/**
 * ÜBERSTUNDEN NACH TAGESGRENZE (Testbericht 30.09.2026, Paket 2c).
 *
 * Nur, wenn der Betrieb das Modell „Tagesgrenze“ gewählt hat; die Vorgabe
 * bleibt das Zeitkonto (Gleitzeit mit Saldo), und dort gibt es diese Zahl
 * nicht. Ausgewiesen werden STUNDEN, in Lohn-CSV und Stundennachweis — nie
 * Geld; die Bewertung macht die Lohnverrechnung.
 *
 * DIE REGEL, je Tag und Person:
 *  - Grenze ist das Tagessoll der Person (24./31.12. anteilig) oder, bei
 *    Gleitzeit, zehn Stunden.
 *  - An einem Tag ohne Soll (freier Wochentag, Feiertag) ist jede Stunde
 *    eine Überstunde.
 *  - Was über der Grenze liegt, ist eine Überstunde mit 50 %.
 *  - Ist „100 % an Sonn- und Feiertagen“ eingeschaltet, zählt dort jede
 *    Stunde mit 100 % statt mit 50 %.
 *
 * NACH DEM KOLLEKTIVVERTRAG METALLGEWERBE (seit 18.10.2026, ab Werk an,
 * `docs/recherche-fragenkataloge.md`) — für Personen mit Einstufung, also
 * Arbeiter und Lehrlinge; für Angestellte gilt ein anderer KV, dort bleibt
 * die Regel oben. Mit 100 % statt 50 % (Abschnitt XIV Pkt 8–11):
 *  - ab der dritten Überstunde am Tag (Mehrarbeit zählt mit — sie steckt
 *    hier in den Stunden über dem Tagessoll);
 *  - Überstunden zwischen 20 und 6 Uhr;
 *  - ab der 51. Arbeitsstunde der Woche, ausser bei Gleitzeit;
 *  - am sonst arbeitsfreien Tag erst ab der 11. Arbeitsstunde (statt ab der
 *    dritten Überstunde);
 *  - an Sonn- und Feiertagen jede Stunde (Pkt 9 und 8);
 *  - am 24./31.12. jede Überstunde; was dort nach 12 Uhr liegt, steht schon
 *    mit 100 % in „24./31.12. ab 12 Uhr“ und zählt hier nicht noch einmal —
 *    beim Zusammentreffen gilt nur der höchste Zuschlag (Pkt 11).
 *
 * WANN AM TAG DIE ÜBERSTUNDEN LAGEN, steht in keiner Buchung — die App kennt
 * keine vereinbarte Lage der Arbeitszeit. Gerechnet wird wie bei den
 * Nachtstunden zugunsten des Arbeitnehmers: Stunden zwischen 20 und 6 Uhr
 * gelten zuerst als Überstunden, und die Zählregeln (dritte Überstunde,
 * 51. Wochenstunde, 11. Stunde) treffen die übrigen.
 *
 * NACHTSTUNDEN, DIE ÜBERSTUNDEN SIND (seit 18.10.2026): die Nachtarbeitszulage
 * gilt nach dem KV nur für Stunden, die keine Überstunden sind (Abschnitt XIV
 * Pkt 5). „Nacht(Std)“ zählt weiter jede Stunde in der Nachtzeit des
 * Betriebs; `nachtAlsUeberstundeMin` sagt, wie viele davon Überstunden sind —
 * für sie zahlt die Lohnverrechnung den Zuschlag statt der Zulage. Auch hier
 * zugunsten des Arbeitnehmers: die Überstunden zwischen 20 und 6 Uhr liegen
 * zuerst ausserhalb der Nachtzeit des Betriebs (20–22 Uhr bei der Vorgabe),
 * erst der Rest nimmt Nachtstunden die Zulage.
 *
 * Gezählt wird nur `Anwesend`; Wegzeit zählt nicht (wie im Zeitkonto).
 */
export interface Ueberstunden {
  /** Überstunden mit 50 % Zuschlag, in Minuten. */
  fuenfzigMin: number;
  /** Überstunden mit 100 % Zuschlag, in Minuten. */
  hundertMin: number;
  /**
   * Nur nach dem KV: Minuten in der Nachtzeit des Betriebs, die Überstunden
   * sind — sie tragen keine Nachtarbeitszulage (Abschnitt XIV Pkt 5).
   */
  nachtAlsUeberstundeMin?: number;
}

export const KEINE_UEBERSTUNDEN: Ueberstunden = { fuenfzigMin: 0, hundertMin: 0 };

/** Überstunden in diesem Fenster tragen nach dem KV jedenfalls 100 %. */
const UEBERSTUNDEN_NACHT: Nachtzeit = { von: 20 * 60, bis: 6 * 60 };
/** Ab der dritten Überstunde am Tag 100 %. */
const ZWEI_STUNDEN = 2 * 60;
/** Am sonst arbeitsfreien Tag 100 % erst ab der 11. Arbeitsstunde. */
const ZEHN_STUNDEN = 10 * 60;
/** Ab der 51. Arbeitsstunde der Woche 100 %. */
const FUENFZIG_STUNDEN = 50 * 60;

type Person = Pick<AppUser, 'weeklyTargetHours' | 'workDays' | 'tagessoll'> & Partial<Pick<AppUser, 'einstufung'>>;

/**
 * `eintraege` sind die Buchungen des ausgewiesenen Zeitraums. `vorlauf` sind
 * Buchungen derselben Person an den Tagen davor in derselben Kalenderwoche:
 * sie zählen nur für die 51. Wochenstunde mit — ohne sie begänne jede Woche,
 * die in den Vormonat reicht, für diese Regel bei null.
 */
export function ueberstundenNachTagesgrenze(
  user: Person,
  eintraege: TimeEntry[],
  regel: UeberstundenRegel,
  halbeTage: boolean,
  vorlauf: TimeEntry[] = [],
  /** Die Nachtzeit des Betriebs — für die Nachtstunden, die Überstunden sind. */
  nacht: Nachtzeit = NACHTZEIT_VORGABE,
): Ueberstunden {
  if (regel.modell !== 'tagesgrenze') return KEINE_UEBERSTUNDEN;
  const kv = regel.kvMetall && !!user.einstufung;
  const nachtImUeberstundenFenster = fensterSchnitt(nacht, UEBERSTUNDEN_NACHT);

  const jeTag = new Map<string, number>();
  const nachtJeTag = new Map<string, number>();
  /** Davon in der Nachtzeit des Betriebs. */
  const betriebsNachtJeTag = new Map<string, number>();
  const mittagJeTag = new Map<string, number>();
  for (const e of eintraege) {
    if (e.status !== 'Anwesend') continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    jeTag.set(e.date, (jeTag.get(e.date) ?? 0) + min);
    if (kv) {
      nachtJeTag.set(e.date, (nachtJeTag.get(e.date) ?? 0) + arbeitMinImFenster(e, UEBERSTUNDEN_NACHT));
      const imBetrieb = nachtImUeberstundenFenster.reduce((sum, f) => sum + arbeitMinImFenster(e, f), 0);
      betriebsNachtJeTag.set(e.date, (betriebsNachtJeTag.get(e.date) ?? 0) + imBetrieb);
      mittagJeTag.set(e.date, (mittagJeTag.get(e.date) ?? 0) + dezemberNachmittagMin(e, halbeTage));
    }
  }

  // Die Arbeit je Tag für die Wochensumme — der Zeitraum samt Vorlauf.
  const wocheJeTag = new Map(jeTag);
  if (kv) {
    for (const e of vorlauf) {
      if (e.status !== 'Anwesend' || jeTag.has(e.date)) continue;
      const min = calcWorkMin(e);
      if (min > 0) wocheJeTag.set(e.date, (wocheJeTag.get(e.date) ?? 0) + min);
    }
  }
  const vorherInDerWoche = (iso: string) => {
    const montag = montagVon(iso);
    let summe = 0;
    for (const [tag, min] of wocheJeTag) if (tag >= montag && tag < iso) summe += min;
    return summe;
  };

  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  let fuenfzigMin = 0;
  let hundertMin = 0;
  let nachtAlsUeberstundeMin = 0;
  for (const [iso, min] of jeTag) {
    const tag = new Date(`${iso}T00:00:00`);
    const feiertag = isAustrianHoliday(tag);
    const sonnFeiertag = tag.getDay() === 0 || feiertag;
    const arbeitstag = workDays.includes(tag.getDay()) && !feiertag;
    const grenze = !arbeitstag
      ? 0
      : regel.grenze === 'zehn'
        ? 10 * 60
        : Math.round(tagessollStunden(user, iso) * tagesAnteil(iso, halbeTage) * 60);
    const ueber = Math.max(0, min - grenze);
    if (kv) {
      const nacht2006 = nachtJeTag.get(iso) ?? 0;
      const ausserhalbBetriebsNacht = nacht2006 - (betriebsNachtJeTag.get(iso) ?? 0);
      nachtAlsUeberstundeMin += Math.max(0, Math.min(ueber, nacht2006) - ausserhalbBetriebsNacht);
    }
    if (sonnFeiertag && (kv || regel.hundertSonnFeiertag)) {
      hundertMin += min;
      continue;
    }
    if (!kv) {
      fuenfzigMin += ueber;
      continue;
    }
    if (tagesAnteil(iso, halbeTage) < 1) {
      // 24./31.12.: jede Überstunde 100 %, ohne den Nachmittag, der schon zählt.
      hundertMin += Math.max(0, ueber - Math.min(ueber, mittagJeTag.get(iso) ?? 0));
      continue;
    }
    // Zählregeln treffen die letzten Minuten des Tages; die längste gilt.
    const abStunde = arbeitstag ? Math.max(0, ueber - ZWEI_STUNDEN) : Math.max(0, min - ZEHN_STUNDEN);
    let abWoche = 0;
    if (regel.grenze !== 'zehn') {
      const vorher = vorherInDerWoche(iso);
      abWoche = Math.min(ueber, Math.max(0, vorher + min - FUENFZIG_STUNDEN) - Math.max(0, vorher - FUENFZIG_STUNDEN));
    }
    const hundert = Math.min(ueber, Math.max(abStunde, abWoche) + (nachtJeTag.get(iso) ?? 0));
    hundertMin += hundert;
    fuenfzigMin += ueber - hundert;
  }
  return kv ? { fuenfzigMin, hundertMin, nachtAlsUeberstundeMin } : { fuenfzigMin, hundertMin };
}
