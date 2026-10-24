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
 * MEHRARBEIT IN TEILZEIT (§ 19d AZG, seit 19.10.2026). Wer weniger als die
 * Vollzeit des Betriebs vereinbart hat (Einstellung, ab Werk 38,5 Std. wie im
 * KV Metallgewerbe), leistet über dem eigenen Soll zuerst Mehrarbeit, keine
 * Überstunden: bis die Vollzeit eines Tages (Vollzeit durch fünf) und der
 * Woche erreicht ist. Sie trägt 25 % — oder nichts, wenn sie im Quartal 1:1
 * ausgeglichen wird (Abs 3b); das weiss erst die Lohnverrechnung, darum steht
 * sie als eigene Zahl und nicht bei den 50 %. Erst darüber beginnen die
 * Überstunden, und an ihnen zählen die Regeln des KV (dritte Überstunde und
 * so fort). Sonn- und Feiertage mit 100 % bleiben ganz bei 100 % — beim
 * Zusammentreffen gilt der höchste Zuschlag (Abs 3d). Nur bei der Grenze
 * „Tagessoll“: bei „über 10 Stunden“ liegt die Grenze ohnehin über jeder
 * Vollzeit eines Tages.
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
  /**
   * Nur bei Teilzeit: Mehrarbeit nach § 19d AZG, in Minuten — weder bei den
   * 50 noch bei den 100 % mitgezählt.
   */
  mehrarbeitTeilzeitMin?: number;
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

/** Die vereinbarte Woche in Minuten — mit eigenem Tagessoll dessen Summe über die Arbeitstage. */
function vereinbarteWocheMin(user: Person, workDays: readonly number[]): number {
  return Math.round(
    workDays.reduce((summe, wt) => {
      const eigen = user.tagessoll?.[String(wt)];
      if (typeof eigen === 'number' && Number.isFinite(eigen)) return summe + eigen;
      return summe + (Number(user.weeklyTargetHours ?? 40) || 40) / workDays.length;
    }, 0) * 60,
  );
}

interface Tag {
  min: number;
  /** Davon zwischen 20 und 6 Uhr. */
  nacht2006: number;
  /** Davon in der Nachtzeit des Betriebs (und zwischen 20 und 6 Uhr). */
  betriebsNacht: number;
  /** Am 24./31.12. die Minuten nach 12 Uhr. */
  mittag: number;
}

/**
 * `eintraege` sind die Buchungen des ausgewiesenen Zeitraums. `vorlauf` sind
 * Buchungen derselben Person an den Tagen davor in derselben Kalenderwoche:
 * sie zählen nur für die 51. Wochenstunde und die Mehrarbeit der Woche mit —
 * ohne sie begänne jede Woche, die in den Vormonat reicht, dafür bei null.
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
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const vollzeitWocheMin = Math.round(regel.vollzeitStunden * 60);
  const mehrarbeitWocheMin = vollzeitWocheMin - vereinbarteWocheMin(user, workDays);
  const teilzeit = regel.grenze === 'tagessoll' && mehrarbeitWocheMin > 0;
  const nachtImUeberstundenFenster = fensterSchnitt(nacht, UEBERSTUNDEN_NACHT);

  const tageAus = (liste: TimeEntry[], ohne?: Map<string, Tag>) => {
    const tage = new Map<string, Tag>();
    for (const e of liste) {
      if (e.status !== 'Anwesend' || ohne?.has(e.date)) continue;
      const min = calcWorkMin(e);
      if (min <= 0) continue;
      const t = tage.get(e.date) ?? { min: 0, nacht2006: 0, betriebsNacht: 0, mittag: 0 };
      t.min += min;
      if (kv) {
        t.nacht2006 += arbeitMinImFenster(e, UEBERSTUNDEN_NACHT);
        t.betriebsNacht += nachtImUeberstundenFenster.reduce((sum, f) => sum + arbeitMinImFenster(e, f), 0);
        t.mittag += dezemberNachmittagMin(e, halbeTage);
      }
      tage.set(e.date, t);
    }
    return tage;
  };
  const jeTag = tageAus(eintraege);
  // Die Tage der Woche vor dem Zeitraum — nur, wo eine Wochenregel sie braucht.
  const vorTage = kv || teilzeit ? tageAus(vorlauf, jeTag) : new Map<string, Tag>();

  const vorherInDerWoche = (iso: string) => {
    const montag = montagVon(iso);
    let summe = 0;
    for (const tage of [jeTag, vorTage]) for (const [tag, t] of tage) if (tag >= montag && tag < iso) summe += t.min;
    return summe;
  };

  const lage = (iso: string, min: number) => {
    const tag = new Date(`${iso}T00:00:00`);
    const feiertag = isAustrianHoliday(tag);
    const arbeitstag = workDays.includes(tag.getDay()) && !feiertag;
    const grenze = !arbeitstag
      ? 0
      : regel.grenze === 'zehn'
        ? 10 * 60
        : Math.round(tagessollStunden(user, iso) * tagesAnteil(iso, halbeTage) * 60);
    return {
      arbeitstag,
      grenze,
      ueber: Math.max(0, min - grenze),
      ganzHundert: (tag.getDay() === 0 || feiertag) && (kv || regel.hundertSonnFeiertag),
    };
  };

  /*
    DIE MEHRARBEIT JE TAG, der Reihe nach durch jede Woche: was ein früherer
    Tag der Woche schon an Mehrarbeit trug, fehlt den späteren. Sonst wäre an
    einem freien Samstag wieder ein ganzer Vollzeittag Mehrarbeit, obwohl die
    Woche die Vollzeit längst überschritten hat — und Überstunden mit 50 %
    stünden als Mehrarbeit mit 25 % da.
  */
  const mehrJeTag = new Map<string, number>();
  if (teilzeit) {
    const verbraucht = new Map<string, number>();
    const alle = [...jeTag, ...vorTage].sort(([a], [b]) => a.localeCompare(b));
    for (const [iso, t] of alle) {
      const l = lage(iso, t.min);
      if (l.ganzHundert) continue;
      const montag = montagVon(iso);
      // Am 24./31.12. ist der Nachmittag schon mit 100 % ausgewiesen; Mehrarbeit ist nur der Rest.
      const rest = l.ueber - (kv && tagesAnteil(iso, halbeTage) < 1 ? Math.min(l.ueber, t.mittag) : 0);
      /*
        DIE VOLLZEIT DIESES TAGS: nach der Verteilung des Betriebs, wenn er
        eine eingestellt hat (A6, 24.10.2026) — bei vier langen Tagen und
        einem kurzen Freitag ist sie am Montag länger als ein Fünftel der
        Woche, am Freitag kürzer, und an einem Tag ohne Vollzeit null. Ohne
        Verteilung wie bisher ein Fünftel.
      */
      const vollTag = regel.vollzeitVerteilung
        ? Math.round((regel.vollzeitVerteilung[String(new Date(`${iso}T00:00:00`).getDay())] ?? 0) * 60 * tagesAnteil(iso, halbeTage))
        : Math.round((vollzeitWocheMin / 5) * tagesAnteil(iso, halbeTage));
      const wocheRest = Math.max(0, mehrarbeitWocheMin - (verbraucht.get(montag) ?? 0));
      const mehr = Math.max(0, Math.min(rest, vollTag - l.grenze, wocheRest));
      verbraucht.set(montag, (verbraucht.get(montag) ?? 0) + mehr);
      mehrJeTag.set(iso, mehr);
    }
  }

  let fuenfzigMin = 0;
  let hundertMin = 0;
  let nachtAlsUeberstundeMin = 0;
  let mehrarbeitTeilzeitMin = 0;
  for (const [iso, t] of jeTag) {
    const { min } = t;
    const { arbeitstag, ueber, ganzHundert } = lage(iso, min);
    const mehr = mehrJeTag.get(iso) ?? 0;
    mehrarbeitTeilzeitMin += mehr;
    // Was über der Mehrarbeit liegt, sind die Überstunden.
    const ueberstunden = ueber - mehr;
    if (kv) {
      const ausserhalbBetriebsNacht = t.nacht2006 - t.betriebsNacht;
      nachtAlsUeberstundeMin += Math.max(0, Math.min(ueberstunden, t.nacht2006) - ausserhalbBetriebsNacht);
    }
    if (ganzHundert) {
      hundertMin += min;
      continue;
    }
    if (!kv) {
      fuenfzigMin += ueberstunden;
      continue;
    }
    if (tagesAnteil(iso, halbeTage) < 1) {
      // 24./31.12.: jede Überstunde 100 %, ohne den Nachmittag, der schon zählt.
      hundertMin += Math.max(0, ueber - Math.min(ueber, t.mittag) - mehr);
      continue;
    }
    // Zählregeln treffen die letzten Minuten des Tages; die längste gilt.
    const abStunde = arbeitstag ? Math.max(0, ueberstunden - ZWEI_STUNDEN) : Math.max(0, min - ZEHN_STUNDEN);
    let abWoche = 0;
    if (regel.grenze !== 'zehn') {
      const vorher = vorherInDerWoche(iso);
      abWoche = Math.min(ueberstunden, Math.max(0, vorher + min - FUENFZIG_STUNDEN) - Math.max(0, vorher - FUENFZIG_STUNDEN));
    }
    const hundert = Math.min(ueberstunden, Math.max(abStunde, abWoche) + t.nacht2006);
    hundertMin += hundert;
    fuenfzigMin += ueberstunden - hundert;
  }
  return {
    fuenfzigMin,
    hundertMin,
    ...(kv ? { nachtAlsUeberstundeMin } : {}),
    ...(teilzeit ? { mehrarbeitTeilzeitMin } : {}),
  };
}
