import type { AppUser, Company, TimeEntry } from '@/types';
import { fuehrtZeitkonto } from './permissions';
/*
  DIE VORGABE FÜR URLAUBSTAGE KOMMT AUS EINER QUELLE, NICHT AUS ZWEIEN.

  In `benutzerVorgaben.ts` stand dazu der Satz, sie MÜSSE mit dem Rückfallwert
  hier übereinstimmen — sonst rechnet ein Nutzer ohne gesetzten Wert anders
  als ein neu angelegter. Ein Satz, den man einhalten muss, ist schwächer als
  ein Import, bei dem man es nicht vergessen kann. Hier stand bis dahin
  zweimal die nackte 25.
*/
import { DEFAULT_VACATION_DAYS as DEFAULT_URLAUBSTAGE } from './db/benutzerVorgaben';
import { calcWorkMin } from '@shared/arbeitszeit';
import {
  getAustrianHolidayName,
  getEasterDate,
  isAustrianHoliday,
  isWeekend,
  localDateStr,
  urlaubsTage as urlaubsTageShared,
  werktageImZeitraum,
} from '@shared/feiertage';

/**
 * Feiertage und Arbeitstage stehen in `shared/feiertage.ts`.
 *
 * Sie werden auf BEIDEN Seiten gebraucht: der Browser zeigt beim
 * Urlaubsantrag die Arbeitstage, die Datenbank schreibt bei der Genehmigung
 * genau diese Tage ins Zeitkonto (`app.ist_feiertag`, `app.urlaubstage`). Hier stehen sie nur noch als
 * Weiterreichung, damit die vorhandenen Importe unveraendert bleiben.
 */
export {
  getAustrianHolidayName,
  getEasterDate,
  isAustrianHoliday,
  isWeekend,
  localDateStr,
  werktageImZeitraum,
};

/** Arbeitstage zwischen zwei ISO-Daten — mit den Arbeitstagen des Nutzers. */
export function urlaubsTage(
  user: Pick<AppUser, 'workDays'>,
  vonIso: string,
  bisIso: string,
): string[] {
  return urlaubsTageShared(user.workDays, vonIso, bisIso);
}

/** Wie ein Betrieb mit nicht verbrauchtem Urlaub zum Jahreswechsel umgeht. */
export type UebertragArt = 'verjaehrung' | 'stichtag';

export interface UebertragRegel {
  art: UebertragArt;
  /**
   * 'MM-DD' — nur bei `stichtag`. An diesem Tag verfällt, was aus früheren
   * Jahren offen ist.
   */
  stichtag?: string | null;
  /**
   * 'MM-DD' — der Tag, an dem das Urlaubsjahr BEGINNT und der neue Anspruch
   * entsteht. Ohne Angabe der 1. Jänner.
   *
   * WARUM DAS HIERHER GEHÖRT UND NICHT NEBEN DIE REGEL. Beginn und Verfall
   * sind zwei Enden derselben Sache: der Stichtag liegt IM Urlaubsjahr, und
   * wo dieses Jahr anfängt, entscheidet, in welchem Kalenderjahr der Stichtag
   * zu suchen ist. Lägen die beiden getrennt, könnte ein Aufrufer den einen
   * mitgeben und den anderen vergessen — und bekäme eine Rechnung, die sich
   * selbst widerspricht.
   *
   * WAS OHNE DIESES FELD PASSIERTE: der neue Anspruch entstand fest am
   * 1. Jänner. Für einen Betrieb, der sein Urlaubsjahr anders führt, kam er
   * damit zu früh und der Übertrag wurde im falschen Moment gemessen — ohne
   * Warnung, ohne Einstellung, ohne dass es jemandem auffallen konnte.
   */
  jahresbeginn?: string;
}

/** Die Vorgabe: das Urlaubsjahr ist das Kalenderjahr. */
export const JAHRESBEGINN_VORGABE = '01-01';

/**
 * In welchem Urlaubsjahr ein Datum liegt — benannt nach dem Kalenderjahr, in
 * dem dieses Urlaubsjahr BEGINNT.
 *
 * Beginnt das Urlaubsjahr am 1. Juli, so gehört der 3. März 2027 in das
 * Urlaubsjahr 2026 (1.7.2026 – 30.6.2027). Beim Kalenderjahr — der Vorgabe —
 * ist die Antwort schlicht die Jahreszahl, und deshalb ändert sich für jeden
 * Betrieb, der nichts einstellt, an keiner einzigen Zahl etwas.
 */
export function urlaubsJahrVon(iso: string, beginn: string = JAHRESBEGINN_VORGABE): number {
  const jahr = Number(iso.slice(0, 4));
  return iso.slice(5, 10) >= beginn ? jahr : jahr - 1;
}

/**
 * Der Tag `mmdd` INNERHALB des Urlaubsjahres `jahr`, als volles Datum.
 *
 * Ein Urlaubsjahr, das nicht am 1. Jänner beginnt, liegt über zwei
 * Kalenderjahren. Der Verfallstag 31. März gehört im Urlaubsjahr 2026
 * (ab 1.7.) damit in den März 2027 — wer hier stur `2026-03-31` bildete,
 * liesse den Stichtag VOR dem Beginn des Jahres liegen, und er träfe nie ein.
 */
function tagImUrlaubsjahr(jahr: number, mmdd: string, beginn: string): string {
  return `${mmdd >= beginn ? jahr : jahr + 1}-${mmdd}`;
}

/**
 * Wie lange ein Urlaubsjahrgang nach seinem Jahr noch lebt.
 *
 * Zwei Jahre, und das ist keine gewählte Zahl: § 4 Abs 5 UrlG lässt den
 * Urlaubsanspruch zwei Jahre nach Ende des Urlaubsjahres verjähren, in dem er
 * entstanden ist. Der Jahrgang 2026 ist also bis Ende 2028 lebendig.
 */
export const VERJAEHRUNG_JAHRE = 2;

/** Die Vorgabe: was kein Betrieb eingestellt hat, richtet sich nach dem Gesetz. */
export const UEBERTRAG_VORGABE: UebertragRegel = { art: 'verjaehrung' };

/**
 * Die Übertragsregel aus den Stammdaten des Betriebs.
 *
 * AN EINER STELLE, damit nicht jede Ansicht ihre eigene Lesart von „nicht
 * eingestellt" erfindet. Ein `stichtag` ohne Datum fiele sonst je nach
 * Aufrufer auf „verfällt nie" oder auf einen Absturz zurück; hier fällt er
 * auf das Gesetz zurück, und das ist die einzige Antwort, die niemandem
 * etwas wegnimmt. Die Datenbank lässt diesen Zustand gar nicht erst zu
 * (siehe `companies_urlaub_stichtag_check`) — aber eine Rechnung, die sich
 * darauf VERLÄSST, ist eine Rechnung mit einer Annahme.
 */
export function uebertragsRegel(
  betrieb: Pick<Company, 'urlaubUebertrag' | 'urlaubStichtag' | 'urlaubJahresbeginn'> | null | undefined,
): UebertragRegel {
  const jahresbeginn = betrieb?.urlaubJahresbeginn || JAHRESBEGINN_VORGABE;
  if (betrieb?.urlaubUebertrag === 'stichtag' && betrieb.urlaubStichtag) {
    return { art: 'stichtag', stichtag: betrieb.urlaubStichtag, jahresbeginn };
  }
  return { ...UEBERTRAG_VORGABE, jahresbeginn };
}

/** Was für ein Jahr zur Verfügung steht, was weg ist, was bleibt. */
export interface UrlaubsStand {
  /** Tage, die in diesem Jahr zur Verfügung stehen — Übertrag eingerechnet. */
  anspruch: number;
  /** Davon schon genommen — nur, was gegen diesen Anspruch zählt. */
  genommen: number;
  /** Was bleibt. Kann negativ sein; das ist eine Aussage, kein Fehler. */
  rest: number;
  /**
   * Kommt der Anspruch aus dem Anfangsbestand statt aus dem Jahresanspruch?
   *
   * Die Ansicht braucht das, um „von 25 Tagen" nicht zu schreiben, wo in
   * Wahrheit „von 7 mitgebrachten" gilt. Eine richtige Zahl mit falscher
   * Beschriftung ist auch eine falsche Auskunft.
   */
  ausAnfangsbestand: boolean;
  /** Wie viele der verfügbaren Tage aus früheren Jahren stammen. */
  uebertrag: number;
  /**
   * Was in diesem Jahr verfallen ist.
   *
   * Steht hier, damit es jemand SAGEN kann. Tage, die lautlos verschwinden,
   * sind die Sorte Befund, die erst auffällt, wenn sich jemand beschwert —
   * und dann ist es ein Streit statt einer Auskunft.
   */
  verfallen: number;
}

/** Ein Urlaub, wie ihn beide Aufrufer liefern können: Beginn und Dauer. */
export interface UrlaubsPosten {
  /** 'YYYY-MM-DD' */
  von: string;
  tage: number;
}

/** Ein Urlaubsjahrgang: was in einem Jahr entstanden und davon noch offen ist. */
interface Jahrgang {
  jahr: number;
  offen: number;
}

/**
 * DER RESTURLAUB — und warum er an EINER Stelle steht.
 *
 * WAS VORHER FALSCH WAR, ZWEIMAL.
 *
 * Erstens: gerechnet wurde „Jahresanspruch minus Urlaubstage in der App".
 * Vor dem Startdatum gibt es dort keine, und im Umstiegsjahr war die Zahl um
 * genau die mitgebrachten Tage zu hoch.
 *
 * Zweitens, und das trifft jeden 1. Jänner: der Rest wurde weggeworfen. In
 * Österreich verfällt nicht verbrauchter Urlaub aber nicht am Jahresende —
 * er verjährt erst zwei Jahre nach dem Jahr, in dem er entstand
 * (§ 4 Abs 5 UrlG). Wer der App glaubte, verkürzte seinen Leuten den
 * Anspruch.
 *
 * WARUM JAHRGÄNGE UND NICHT EIN SALDO. Weil ein blosser Saldo nicht sagen
 * kann, WELCHE Tage alt sind. Verjährung trifft den Jahrgang, nicht die
 * Summe: wer 2026 zehn Tage übrig hatte und 2027 wieder zehn, dem verfallen
 * Ende 2028 die von 2026 und nicht die von 2027. Ohne Jahrgänge liesse sich
 * das nicht unterscheiden, und die Frage „wie viele verfallen mir heuer?"
 * wäre nicht beantwortbar.
 *
 * VERBRAUCHT WIRD DER ÄLTESTE ZUERST. Das ist nicht nur die übliche Lesart,
 * es ist auch die für den Mitarbeiter günstige: so verfällt so wenig wie
 * möglich.
 *
 * WARUM DER GANZE VERLAUF GEBRAUCHT WIRD. Der Anspruch dieses Jahres hängt
 * am Rest des Vorjahres, und der am Rest des Jahres davor. Ein Fenster von
 * zwei oder drei Jahren wäre billiger und an einer Stelle falsch: hätte
 * jemand vor vier Jahren einen alten Jahrgang verbraucht, schriebe ein kurzes
 * Fenster denselben Verbrauch einem jüngeren zu und zeigte zu wenig Rest.
 * Beim Urlaub in die für den Betrieb günstige Richtung zu irren ist keine
 * Näherung, sondern ein Fehler. Begrenzt ist der Verlauf ohnehin: er beginnt
 * am Startdatum des Mitarbeiters.
 *
 * WARUM ES EINE GEMEINSAME FUNKTION IST. Zwei Ansichten beantworten dieselbe
 * Frage aus VERSCHIEDENEN Quellen: die Mitarbeiteransicht zählt genehmigte
 * Anträge, die Buchhaltung zählt Urlaubstage in der Zeiterfassung. Stünde die
 * Regel zweimal, sagten die beiden nach der ersten Änderung verschiedene
 * Zahlen — und dann glaubt niemand mehr einer von beiden. Die QUELLEN bleiben
 * getrennt (sie beantworten „genehmigt" und „gebucht", und das ist nicht
 * dasselbe), die REGEL ist eine.
 *
 * WARUM IM STARTJAHR NUR AB DEM STARTDATUM GEZÄHLT WIRD. Der Anfangsbestand
 * deckt alles davor bereits ab. Ein Urlaubstag, der vor dem Startdatum in der
 * App landet — die Buchhaltung darf fremde Zeiteinträge nachtragen —, wäre
 * sonst zweimal abgezogen.
 *
 * @param posten Der GANZE Verlauf seit dem Startdatum, nicht nur das Jahr.
 */
export function urlaubsStand(
  user: Pick<AppUser, 'yearlyVacationDays' | 'initialVacationDays' | 'appStartDate'>,
  jahr: number,
  posten: readonly UrlaubsPosten[],
  regel: UebertragRegel = UEBERTRAG_VORGABE,
): UrlaubsStand {
  const jahresanspruch = Number(user.yearlyVacationDays ?? DEFAULT_URLAUBSTAGE) || DEFAULT_URLAUBSTAGE;
  const start = user.appStartDate ?? null;
  const bestand = user.initialVacationDays;
  const beginn = regel.jahresbeginn ?? JAHRESBEGINN_VORGABE;

  /*
    „NICHT ANGEGEBEN" UND „NULL TAGE" SIND ZWEI VERSCHIEDENE AUSSAGEN — und
    genau daran ist die erste Fassung dieser Zeile gescheitert.

    Sie prüfte nur `Number.isFinite(Number(bestand))`. `Number(null)` ist
    aber `0`, und `0` ist endlich: aus der Datenbank gelesenes `null` galt
    damit als Angabe „null Tage übrig". Jeder Betrieb, der das Feld nicht
    ausfüllt, hätte im Umstiegsjahr bei allen einen Anspruch von 0 gesehen —
    schlimmer als der Fehler, der hier repariert werden sollte.
    Aufgefallen ist das der Prüfung, nicht dem Kopf.
  */
  const bestandAngegeben =
    bestand !== null && bestand !== undefined && Number.isFinite(Number(bestand));

  const startjahr = start !== null ? urlaubsJahrVon(start, beginn) : jahr;
  const ausAnfangsbestand = startjahr === jahr && bestandAngegeben;

  /*
    OHNE STARTDATUM GIBT ES KEINEN VERLAUF, den man durchrechnen könnte — und
    damit auch keinen Übertrag. Dann bleibt es beim Jahresanspruch, also bei
    dem Verhalten, das jede bestehende Zeile ohne Startdatum schon hatte.
  */
  if (start === null || startjahr > jahr) {
    const genommen = summe(posten.filter((p) => imJahr(p, jahr, beginn)));
    return {
      anspruch: jahresanspruch, genommen, rest: jahresanspruch - genommen,
      ausAnfangsbestand: false, uebertrag: 0, verfallen: 0,
    };
  }

  let jahrgaenge: Jahrgang[] = [];
  let verfallenImJahr = 0;
  let uebertragInsJahr = 0;
  let genommenImJahr = 0;

  for (let j = startjahr; j <= jahr; j += 1) {
    /*
      ZUERST DIE VERJÄHRUNG, DANN DER NEUE JAHRGANG. Ein Jahrgang aus dem Jahr
      v lebt bis Ende v + VERJAEHRUNG_JAHRE; zu Beginn des Jahres j ist alles
      älter als j - VERJAEHRUNG_JAHRE weg. Käme der neue Jahrgang zuerst,
      müsste die Grenze ihn ausdrücklich ausnehmen — eine Bedingung mehr für
      dasselbe Ergebnis.
    */
    let verfallenHier = 0;
    if (regel.art === 'verjaehrung') {
      verfallenHier += weg(jahrgaenge, (g) => g.jahr < j - VERJAEHRUNG_JAHRE);
      jahrgaenge = jahrgaenge.filter((g) => g.jahr >= j - VERJAEHRUNG_JAHRE);
    }

    if (j === startjahr) {
      jahrgaenge.push({ jahr: j, offen: bestandAngegeben ? Number(bestand) : jahresanspruch });
    } else {
      jahrgaenge.push({ jahr: j, offen: jahresanspruch });
    }

    if (j === jahr) uebertragInsJahr = summeOffen(jahrgaenge.filter((g) => g.jahr < j));

    /*
      IM STARTJAHR ZÄHLT NUR, WAS AB DEM STARTDATUM LIEGT — aber NUR, wenn es
      einen Anfangsbestand gibt.

      Der Schnitt hat genau eine Aufgabe: zu verhindern, dass ein Tag zweimal
      abgezogen wird, einmal im mitgebrachten Bestand und einmal als Eintrag.
      Ohne Anfangsbestand gibt es nichts, wogegen doppelt gezählt werden
      könnte — dann wirft der Schnitt nur einen echten Urlaubstag weg. Genau
      das hatte die erste Fassung des Jahrgangsmodells getan, und die Prüfung
      zum bestehenden Verhalten ist darüber gefallen.
    */
    const schnitt = j === startjahr && bestandAngegeben ? start : null;
    const desJahres = posten
      .filter((p) => imJahr(p, j, beginn) && (schnitt === null || p.von >= schnitt))
      .slice()
      .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));

    /*
      DER STICHTAG LIEGT MITTEN IM JAHR, nicht an seinem Rand. Was bis dahin
      verbraucht wird, zehrt noch vom alten Jahrgang; was danach kommt, nicht
      mehr. Die Reihenfolge ist deshalb Teil der Rechnung und kein Detail.
    */
    const stichtag = regel.art === 'stichtag' && regel.stichtag
      ? tagImUrlaubsjahr(j, regel.stichtag, beginn)
      : null;
    let stichtagErledigt = stichtag === null || j === startjahr;

    for (const p of desJahres) {
      if (!stichtagErledigt && p.von > stichtag!) {
        verfallenHier += weg(jahrgaenge, (g) => g.jahr < j);
        jahrgaenge = jahrgaenge.filter((g) => g.jahr >= j);
        stichtagErledigt = true;
      }
      abbuchen(jahrgaenge, p.tage, j);
      if (j === jahr) genommenImJahr += p.tage;
    }

    if (!stichtagErledigt) {
      verfallenHier += weg(jahrgaenge, (g) => g.jahr < j);
      jahrgaenge = jahrgaenge.filter((g) => g.jahr >= j);
    }

    if (j === jahr) verfallenImJahr = verfallenHier;
  }

  const rest = summeOffen(jahrgaenge);
  return {
    anspruch: rest + genommenImJahr,
    genommen: genommenImJahr,
    rest,
    ausAnfangsbestand,
    uebertrag: uebertragInsJahr,
    verfallen: verfallenImJahr,
  };
}

const imJahr = (p: UrlaubsPosten, jahr: number, beginn: string) =>
  urlaubsJahrVon(p.von, beginn) === jahr;
const summe = (p: readonly UrlaubsPosten[]) => p.reduce((s, x) => s + x.tage, 0);
const summeOffen = (g: readonly Jahrgang[]) => g.reduce((s, x) => s + x.offen, 0);

/** Was an verfallenden Jahrgängen noch OFFEN war — nur das geht verloren. */
function weg(jahrgaenge: readonly Jahrgang[], trifft: (g: Jahrgang) => boolean): number {
  return jahrgaenge.filter(trifft).reduce((s, g) => s + Math.max(0, g.offen), 0);
}

/**
 * Tage abbuchen — ältester Jahrgang zuerst.
 *
 * Bleibt etwas übrig, weil mehr genommen wurde als offen war, geht es ins
 * MINUS des laufenden Jahrgangs. Bei null zu stoppen versteckte genau den
 * Fall, wegen dessen jemand hinsieht.
 */
function abbuchen(jahrgaenge: Jahrgang[], tage: number, laufendesJahr: number): void {
  let rest = tage;
  for (const g of jahrgaenge) {
    if (rest <= 0) break;
    const nimmt = Math.min(rest, Math.max(0, g.offen));
    g.offen -= nimmt;
    rest -= nimmt;
  }
  if (rest > 0) {
    const laufend = jahrgaenge.find((g) => g.jahr === laufendesJahr) ?? jahrgaenge[jahrgaenge.length - 1];
    if (laufend) laufend.offen -= rest;
  }
}

/**
 * Zeit-, Feiertags- und Saldo-Logik — 1:1 aus der Legacy-App portiert
 * (docs §4.1 / §4.2). Wichtig: KEIN Wochenend-/Feiertagszuschlag — Feiertage
 * reduzieren nur das Soll, sie multiplizieren keine Stunden.
 */

export function todayStr(): string {
  return localDateStr(new Date());
}

/** Letzter Werktag vor `fromDate` (überspringt Wochenende + Feiertage). */
export function lastWorkday(fromDate: Date): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - 1);
  while (isWeekend(d) || isAustrianHoliday(d)) {
    d.setDate(d.getDate() - 1);
  }
  return localDateStr(d);
}

/** ISO-8601-Kalenderwoche (Donnerstag-Regel). */
export function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** ISO-Wochen-Label, z. B. "2026-W26". */
export function isoWeekLabel(date: Date): string {
  const { week, year } = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Gearbeitete Minuten eines Eintrags.
 * - Nur 'Anwesend' liefert Arbeitszeit. Krank/Urlaub sind IMMER 0 — deren
 *   Gutschrift passiert allein in calcOverallSaldo (voller Solltag), sonst
 *   würde ein Krank-Eintrag mit `hours` doppelt zählen.
 * - start+end hat Vorrang: (end − start) − Pause, min. 0 (wie Legacy:2374).
 * - `hours` greift nur, wenn keine Zeitspanne da ist (Sprach-Einträge). So
 *   überschreibt ein später nachgetragenes Von/Bis den KI-Wert.
 * - Wegzeit (travelTime) wird NICHT zu den Arbeitsminuten addiert (wie Legacy).
 */
/**
 * Die Arbeitszeit eines Eintrags in Minuten.
 *
 * Die Formel steht in `shared/arbeitszeit.ts` und wird von den Cloud
 * Functions genauso verwendet — die Monatsbilanzen rechnen serverseitig, die
 * Anzeige hier. Zwei eigene Fassungen ergäben dieselbe Zahl, bis sie es eines
 * Tages nicht mehr täten, und bemerkt würde es an einem Stundensaldo, der auf
 * den Lohnzettel geht.
 *
 * Hier nur durchgereicht, damit die Aufrufer wie bisher aus `lib/time`
 * importieren.
 */
export { calcWorkMin };

/**
 * „1 Tag" oder „5 Tage" — die Zahl mit der richtigen Form dahinter.
 *
 * WARUM DAS EINE ZEILE WERT IST. „1 Tage fehlen" stand in der
 * Mitarbeiterübersicht, und es ist die Sorte Fehler, die einen Beleg billig
 * aussehen lässt: wer eine Zahl anzeigt, die mit dem Wort daneben nicht
 * zusammenpasst, hat offensichtlich nicht hingesehen — und der Leser fragt
 * sich, wo sonst noch nicht.
 *
 * An drei Stellen gebraucht, und an einer davon war es schon richtig
 * gelöst. Drei Abschriften derselben Fallunterscheidung laufen auseinander;
 * die vierte macht es dann wieder falsch.
 */
export function tageWort(n: number): string {
  return n === 1 ? '1 Tag' : `${n} Tage`;
}

/** Minuten -> 'HH:MM'. */
export function fmtMin(m: number): string {
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(Math.round(m));
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Eine DAUER, wie sie in Sätzen und Listenzeilen steht: „08:30 Std".
 *
 * Nackt sieht „08:30" aus wie eine Uhrzeit — in „25.09.2026 · 08:30 ·
 * Regie" liest man es als Beginn, nicht als Länge. Mit dem Zusatz ist es
 * eindeutig. In Tabellen und Kennzahlen, deren Kopf die Einheit schon nennt,
 * bleibt es bei `fmtMin`.
 */
export function fmtDauer(m: number): string {
  return `${fmtMin(m)} Std`;
}

/**
 * Wie viele Minuten ein Zeitausgleich-Eintrag frei gibt.
 *
 * Mit Von/Bis genau diese Spanne; ohne den ganzen Tag, also das Tagessoll.
 * Alles andere als Zeitausgleich: null.
 */
export function zeitausgleichMin(
  e: Pick<TimeEntry, 'status' | 'startTime' | 'endTime'>,
  tagessollH: number,
): number {
  if (e.status !== 'Zeitausgleich') return 0;
  if (e.startTime && e.endTime) {
    const [h1, m1] = e.startTime.split(':').map(Number);
    const [h2, m2] = e.endTime.split(':').map(Number);
    return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
  }
  return Math.round(tagessollH * 60);
}

export interface SaldoResult {
  saldoH: number;
  hasConfig: boolean;
  /**
   * Werktage seit dem Startdatum, an denen GAR NICHTS erfasst wurde.
   *
   * Jeder dieser Tage geht als volles Soll in den Saldo ein, ohne Ist —
   * er drückt den Saldo also um einen ganzen Arbeitstag. Wer die App im
   * August einführt und als Startdatum den 1. Jänner einträgt, bekommt so
   * auf einen Schlag ein Minus von mehreren hundert Stunden. Rechnerisch
   * richtig, in der Sache Unsinn: es wurde ja gearbeitet, nur eben nicht
   * in dieser App erfasst.
   *
   * Die Zahl wird deshalb mitgegeben, damit die Oberfläche einen solchen
   * Saldo als unvollständig kennzeichnen kann, statt ihn als Tatsache
   * hinzustellen.
   */
  daysWithoutEntry: number;
}

/**
 * Wird ein ganztägiger Krank- oder Urlaubstag als Solltag gutgeschrieben?
 *
 * ERST WENN ER VORBEI IST (Prüflauf 25.09.2026, P1-16). Das Soll zählt bis
 * GESTERN (`pflichtTage`); ein heutiger Krankentag wurde aber schon
 * gutgeschrieben — der Saldo stand den ganzen Tag um ein Tagessoll zu hoch
 * und fiel um Mitternacht zurück. Gearbeitete Zeit von heute zählt weiter
 * sofort: sie IST schon geleistet, und wer gerade gebucht hat, soll sie im
 * Saldo sehen.
 */
function ganztagGutschreiben(e: Pick<TimeEntry, 'status' | 'date'>, heuteIso: string): boolean {
  return (e.status === 'Krank' || e.status === 'Urlaub') && e.date < heuteIso;
}

/**
 * Gesamtsaldo Überstunden (docs §4.2).
 * Soll: jeder Kalendertag von appStartDate bis GESTERN, der Arbeitstag und
 * kein Feiertag ist -> dailyH. Ist: Anwesend = gearbeitet, Krank/Urlaub =
 * voller Solltag. saldoH = initial + (Ist − Soll)/60.
 */
export function calcOverallSaldo(user: AppUser, entries: TimeEntry[]): SaldoResult {
  if (!fuehrtZeitkonto(user)) {
    return { saldoH: 0, hasConfig: false, daysWithoutEntry: 0 };
  }

  const initial = Number(user.initialOvertime ?? 0) || 0;
  if (!user.appStartDate) return { saldoH: initial, hasConfig: false, daysWithoutEntry: 0 };

  const weeklyH = Number(user.weeklyTargetHours ?? 40) || 40;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const dailyH = weeklyH / workDays.length;

  // Ist
  let istMin = 0;
  const bookedDates = new Set<string>();
  /*
    NICHTS AUS DER ZUKUNFT. Eine Krankmeldung oder ein Urlaub über die
    nächsten Wochen steht schon im Zeitkonto; gutgeschrieben würde jeder Tag
    davon, das Soll dafür entsteht aber erst, wenn er vorbei ist. Der Saldo
    sähe bis dahin zu gut aus.
  */
  const heuteIso = todayStr();
  for (const e of entries) {
    if (e.date < user.appStartDate || e.date > heuteIso) continue;
    bookedDates.add(e.date);
    if (e.status === 'Anwesend') istMin += calcWorkMin(e);
    else if (ganztagGutschreiben(e, heuteIso)) istMin += dailyH * 60;
  }

  /**
   * Soll und Lücken aus derselben Quelle wie überall sonst.
   *
   * Diese Schleife war die dritte Fassung derselben Regel. Sie war die
   * richtige — ab Eintritt, höchstens bis gestern —, aber solange sie hier
   * eigenständig stand, konnte eine der anderen beiden davon abweichen.
   * Genau das war passiert.
   */
  const pflicht = pflichtTage(user, new Date(`${user.appStartDate}T00:00:00`), new Date());
  const sollMin = pflicht.length * dailyH * 60;
  const daysWithoutEntry = pflicht.filter((d) => !bookedDates.has(d)).length;

  const saldoH = Math.round((initial + (istMin - sollMin) / 60) * 100) / 100;
  return { saldoH, hasConfig: true, daysWithoutEntry };
}

/**
 * Derselbe Saldo, gerechnet aus MONATSBILANZEN statt aus Einzelbuchungen.
 *
 * Das Ergebnis muss auf die Minute mit `calcOverallSaldo` übereinstimmen —
 * es ist dieselbe Zahl, nur aus verdichteten Daten. Genau das prüft
 * `tests/unit/monatsbilanz.test.ts` gegen zufällig erzeugte Monate: eine
 * Abweichung wäre ein falscher Stundensaldo, und der geht auf den Lohnzettel.
 *
 * WAS AUS DEN BILANZEN KOMMT, ist ausschließlich das IST: gearbeitete
 * Minuten, gezählte Krank- und Urlaubstage, die gebuchten Daten. Das SOLL
 * wird hier abgeleitet — aus `pflichtTage`, derselben Quelle wie überall
 * sonst. Deshalb wirkt eine geänderte Wochenstundenzahl auch rückwirkend
 * richtig, ohne dass eine einzige Bilanz neu geschrieben werden müsste.
 *
 * Der laufende Monat wird NICHT aus der Bilanz gelesen, sondern aus den
 * echten Einträgen: er ändert sich noch, und der Trigger braucht einen
 * Augenblick. Ein Monteur, der gerade gebucht hat und seinen Saldo unverändert
 * sähe, würde zu Recht an der App zweifeln.
 */
export function saldoAusBilanzen(
  user: AppUser,
  bilanzen: Array<{ monat: string; anwesendMin: number; krankTage: number; urlaubTage: number; tage: string[] }>,
  laufenderMonat: TimeEntry[],
): SaldoResult {
  if (!fuehrtZeitkonto(user)) {
    return { saldoH: 0, hasConfig: false, daysWithoutEntry: 0 };
  }
  const initial = Number(user.initialOvertime ?? 0) || 0;
  if (!user.appStartDate) return { saldoH: initial, hasConfig: false, daysWithoutEntry: 0 };

  const weeklyH = Number(user.weeklyTargetHours ?? 40) || 40;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const dailyH = weeklyH / workDays.length;

  const jetzt = new Date();
  const aktuellerMonat = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;

  let istMin = 0;
  const gebucht = new Set<string>();

  for (const b of bilanzen) {
    // Der laufende Monat kommt aus den Einträgen, nicht aus der Bilanz.
    if (b.monat >= aktuellerMonat) continue;
    istMin += b.anwesendMin;
    // Krank und Urlaub zählen als Tagessoll — bewertet ERST hier, mit der
    // aktuellen Konfiguration. Gespeichert ist nur die Anzahl.
    istMin += (b.krankTage + b.urlaubTage) * dailyH * 60;
    for (const t of b.tage) {
      if (t >= user.appStartDate) gebucht.add(t);
    }
  }

  const heuteIso = todayStr();
  for (const e of laufenderMonat) {
    // Nichts aus der Zukunft — siehe `calcOverallSaldo`.
    if (e.date < user.appStartDate || e.date > heuteIso) continue;
    gebucht.add(e.date);
    if (e.status === 'Anwesend') istMin += calcWorkMin(e);
    else if (ganztagGutschreiben(e, heuteIso)) istMin += dailyH * 60;
  }

  const pflicht = pflichtTage(user, new Date(`${user.appStartDate}T00:00:00`), new Date());
  const sollMin = pflicht.length * dailyH * 60;
  const daysWithoutEntry = pflicht.filter((d) => !gebucht.has(d)).length;

  const saldoH = Math.round((initial + (istMin - sollMin) / 60) * 100) / 100;
  return { saldoH, hasConfig: true, daysWithoutEntry };
}

export interface MonthStats {
  /**
   * Ist für diesen Mitarbeiter überhaupt ein Eintritt hinterlegt?
   *
   * Ohne Eintrittsdatum ist kein Soll berechenbar — die Zahlen sind dann
   * nicht „null Stunden Rückstand", sondern GAR KEINE AUSSAGE. Ohne diesen
   * Unterschied zeigte die Ansicht ein sauberes 00:00 und sah damit aus wie
   * ein gepflegter Datensatz.
   */
  hasConfig: boolean;
  /**
   * Läuft dieser Monat noch?
   *
   * Dann ist das Soll ein Zwischenstand, der jeden Tag wächst — und keine
   * Monatsbilanz. Die Ansicht muss das sagen, sonst wird eine Zahl vom 10.
   * für ein Monatsergebnis gehalten.
   */
  istLaufend: boolean;
  weeklyTarget: number;
  yearlyVacation: number;
  dailyTargetH: number;
  workdaysInMonth: number;
  holidaysInMonth: number;
  requiredDays: number;
  istMin: number;
  sollMin: number;
  saldoMin: number;
  krankDays: number;
  urlaubDays: number;
  /**
   * Stunden Zeitausgleich im Monat, in Minuten — ganztags zum Tagessoll,
   * stundenweise wie eingetragen. Nur eine AUSKUNFT: im Saldo stecken sie
   * schon, weil ein ZA-Tag Soll ohne Ist ist.
   */
  zaMin: number;
  yearlyUrlaubDays: number;
  /** Tage, die in diesem Jahr zur Verfügung stehen — siehe `urlaubsStand`. */
  urlaubsAnspruch: number;
  /** Stammt der Anspruch aus dem mitgebrachten Bestand? Für die Beschriftung. */
  urlaubAusAnfangsbestand: boolean;
  urlaubRest: number;
}

/**
 * Monatsauswertung eines Mitarbeiters (Legacy:3061-3111).
 *
 * Das Tagessoll ist `weeklyTarget / workDays.length` — dieselbe Regel wie im
 * Gesamtsaldo (calcOverallSaldo). Der Prototyp teilte hier fest durch 5; bei
 * Teilzeit wichen Mitarbeiter- und Buchhaltungssicht dadurch voneinander ab.
 *
 * Weiterhin legacy-treu: Krank und Urlaub REDUZIEREN hier das Soll, statt zum
 * Ist zu zählen. Das ist die Darstellung, die die Lohnverrechnung erwartet —
 * der Gesamtsaldo schreibt sie stattdessen als vollen Solltag gut. Beide Wege
 * kommen auf dasselbe Ergebnis, zeigen es nur unterschiedlich auf.
 *
 * @param monthEntries Einträge des Nutzers im gewählten Monat
 * @param yearEntries  Einträge des Nutzers im gewählten Jahr (für den Resturlaub)
 * @param month        0-basiert (0 = Jänner)
 */
export function calcMonthStats(
  user: Pick<
    AppUser,
    'weeklyTargetHours' | 'yearlyVacationDays' | 'workDays' | 'appStartDate' | 'initialVacationDays'
  >,
  monthEntries: TimeEntry[],
  yearEntries: TimeEntry[],
  year: number,
  month: number,
  urlaub: UrlaubsQuelle = {},
): MonthStats {
  const weeklyTarget = Number(user.weeklyTargetHours ?? 40) || 40;
  const yearlyVacation = Number(user.yearlyVacationDays ?? DEFAULT_URLAUBSTAGE) || DEFAULT_URLAUBSTAGE;

  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  // Tagessoll über die tatsächlichen Arbeitstage — identisch zu
  // calcOverallSaldo. Der Prototyp teilte hier fest durch 5; bei einer
  // 4-Tage-Woche (32 h) ergab das 6,4 h/Tag statt 8,0 h/Tag, und Mitarbeiter
  // und Buchhaltung sahen für denselben Monat verschiedene Salden.
  const dailyTargetH = weeklyTarget / workDays.length;

  /**
   * Die Solltage kommen jetzt aus `pflichtTage` — derselben Quelle wie im
   * Zeitkonto und in der Lückenprüfung.
   *
   * Hier stand die Rechnung vorher ein zweites Mal, und sie zählte den GANZEN
   * Monat. Für einen abgeschlossenen Monat ist das richtig; für den laufenden
   * stand dadurch „00:00 von 176:00 · −176:00" — das Monatssoll gegen die
   * Stunden von zwei Tagen, als hätte jemand drei Wochen verschlafen, die
   * noch gar nicht stattgefunden haben. Genau so im Betrieb gesehen.
   *
   * `pflichtTage` hört bei gestern auf. Ein vergangener Monat liegt komplett
   * davor und ändert sich damit nicht — das halten die Tests fest.
   */
  const monatsStart = new Date(year, month, 1);
  const monatsEnde = new Date(year, month + 1, 0);
  const pflichtImMonat = pflichtTage(user, monatsStart, monatsEnde);
  const workdaysInMonth = pflichtImMonat.length;
  const holidaysInMonth = feiertageImZeitraum(user, monatsStart, monatsEnde);

  const krankDays = monthEntries.filter((e) => e.status === 'Krank').length;
  const urlaubDays = monthEntries.filter((e) => e.status === 'Urlaub').length;
  /*
    VOM SOLL GEHT NUR AB, WAS AUCH IM SOLL STECKT. Die Pflichttage reichen im
    laufenden Monat bis gestern; die Krank- und Urlaubstage des ganzen Monats
    davon abzuziehen, zog auch die künftigen ab. Gefunden im Prüflauf vom
    24.09.2026: eine Krankmeldung bis Monatsende machte „Soll bisher" um
    15 Stunden zu klein und den Saldo um genauso viel zu gut. Aus demselben
    Grund zählt ein Krank-Tag an einem freien Tag nicht.
  */
  const imSoll = new Set(pflichtImMonat);
  const abwesendImSoll = new Set(
    monthEntries
      .filter((e) => (e.status === 'Krank' || e.status === 'Urlaub') && imSoll.has(e.date))
      .map((e) => e.date),
  ).size;
  const istMin = monthEntries.reduce((s, e) => s + calcWorkMin(e), 0);
  const zaMin = monthEntries.reduce((s, e) => s + zeitausgleichMin(e, dailyTargetH), 0);

  const requiredDays = Math.max(0, workdaysInMonth - abwesendImSoll);
  const sollMin = Math.round(requiredDays * dailyTargetH * 60);

  /*
    DER RESTURLAUB KOMMT AUS `urlaubsStand` UND WIRD HIER NICHT GERECHNET.

    Hier stand `jahresanspruch - urlaubstage`. Das ist im ersten Jahr falsch:
    was jemand VOR der Inbetriebnahme genommen hat, steht in keiner
    Zeiterfassung, und die Zahl war um genau diese Tage zu hoch. Sie geht von
    hier in die Mitarbeiterübersicht, in die Lohn-CSV und in den
    Stundennachweis.

    `yearlyUrlaubDays` bleibt daneben stehen und zählt weiter ALLE Urlaubstage
    des Jahres: es ist eine Beobachtung („so viele Urlaubstage stehen in der
    App"), kein Anspruch. Die beiden Zahlen dürfen sich im Startjahr
    unterscheiden, und genau deshalb sind es zwei.
  */
  const yearlyUrlaubDays = yearEntries.filter((e) => e.status === 'Urlaub').length;
  /*
    DER VERLAUF, NICHT DAS JAHR. Der Anspruch dieses Jahres hängt am Rest des
    Vorjahres; mit nur den Einträgen des angezeigten Jahres wäre der Übertrag
    immer null. Wer `verlauf` weglässt, bekommt die Einträge des Jahres — das
    ist richtig für ein Startjahr und für jeden Aufrufer, der keinen Übertrag
    kennt, und es ist genau das Verhalten von vorher.
  */
  const verlauf = urlaub.verlauf
    ?? yearEntries.filter((e) => e.status === 'Urlaub').map((e) => ({ von: e.date, tage: 1 }));
  /*
    DER URLAUBSSTAND AM MONATSENDE, nicht „im Kalenderjahr".

    Führt ein Betrieb sein Urlaubsjahr nicht nach dem Kalender, liegt ein
    Monat unter Umständen in einem anderen Urlaubsjahr als seine Jahreszahl —
    und ein Monat am Rand sogar in beiden. Gefragt ist hier der Stand, mit dem
    die Lohnverrechnung diesen Monat abschliesst; das ist der am letzten Tag.
    Beim Kalenderjahr — der Vorgabe — ist das schlicht `year`.
  */
  const urlaubsjahr = urlaubsJahrVon(
    localDateStr(monatsEnde),
    urlaub.regel?.jahresbeginn ?? JAHRESBEGINN_VORGABE,
  );
  const stand = urlaubsStand(user, urlaubsjahr, verlauf, urlaub.regel);

  // Laufend heißt: der letzte Tag des Monats liegt noch vor uns.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const istLaufend = monatsEnde >= heute;

  return {
    hasConfig: !!user.appStartDate,
    istLaufend,
    weeklyTarget,
    yearlyVacation,
    dailyTargetH,
    workdaysInMonth,
    holidaysInMonth,
    requiredDays,
    istMin,
    sollMin,
    saldoMin: istMin - sollMin,
    krankDays,
    urlaubDays,
    zaMin,
    yearlyUrlaubDays,
    urlaubRest: stand.rest,
    urlaubsAnspruch: stand.anspruch,
    urlaubAusAnfangsbestand: stand.ausAnfangsbestand,
  };
}

/**
 * Woher `calcMonthStats` seinen Urlaubsstand nimmt.
 *
 * Beides ist freiwillig, und das ist Absicht: ohne Angabe rechnet die
 * Funktion wie vorher — Einträge des Jahres, gesetzliche Vorgabe. Damit
 * bleibt jeder bestehende Aufruf gültig UND richtig; nur wer den Übertrag
 * sehen will, muss den Verlauf mitbringen.
 */
export interface UrlaubsQuelle {
  /** Alle Urlaubstage seit dem Startdatum — nicht nur die des Jahres. */
  verlauf?: readonly UrlaubsPosten[];
  regel?: UebertragRegel;
}

export type CompletenessStatus = 'complete' | 'today_only' | 'missing';

export interface CompletenessResult {
  status: CompletenessStatus;
  missingCount: number;
  missingDates: string[];
}

/**
 * Vollständigkeitskontrolle je Mitarbeiter (Legacy:3139-3197). Da es keinen
 * Freigabe-Workflow gibt, ist das die faktische Kontrollinstanz der
 * Geschäftsführung: welcher Arbeitstag wurde nicht gebucht?
 *
 * Geprüft wird von Monatsanfang (bzw. appStartDate, falls später) bis GESTERN
 * — heute zählt nicht als Versäumnis. Feiertage brauchen keinen Eintrag.
 */
/**
 * Die Tage eines Zeitraums, für die tatsächlich eine ARBEITSPFLICHT besteht.
 *
 * Die eine Stelle, an der diese Frage beantwortet wird. Sie stand vorher
 * dreimal im Code — in `calcOverallSaldo`, in `calcMonthStats` und in der
 * Lückenprüfung — und alle drei antworteten unterschiedlich. Genau daraus
 * entstanden zwei Fehler, die im Betrieb zu sehen waren:
 *
 *   „25 Tage ohne Buchung, Di., 25.08., …" bei einem Nutzer OHNE hinterlegtes
 *   Eintrittsdatum. Ohne Eintritt ist nicht bekannt, ab wann jemand
 *   überhaupt zu buchen hat — jeder gemeldete Tag davor ist eine
 *   Unterstellung. `calcOverallSaldo` wusste das seit jeher und rechnete
 *   ohne Startdatum gar nicht; die Lückenprüfung fing einfach am
 *   Fensteranfang an.
 *
 *   „00:00 von 176:00 · −176:00" für den LAUFENDEN Monat. Das Monatssoll
 *   des ganzen Monats gegen die Stunden von zwei Tagen gerechnet — als
 *   hätte jemand drei Wochen verschlafen, die noch gar nicht stattgefunden
 *   haben.
 *
 * Drei Regeln, ab jetzt an einer Stelle:
 *
 *   1. OHNE EINTRITTSDATUM keine Pflicht. Nicht „ab Fensteranfang", nicht
 *      „ab Monatserstem" — gar keine. Eine Pflicht, deren Beginn niemand
 *      kennt, lässt sich nicht behaupten.
 *   2. NIE ÜBER GESTERN HINAUS. Der heutige Tag ist nicht vorbei, künftige
 *      erst recht nicht. Für einen abgeschlossenen Monat ändert das nichts,
 *      für den laufenden alles.
 *   3. Feiertage und freie Wochentage zählen nicht — Teilzeit über
 *      `workDays`, nicht über eine feste Fünf-Tage-Annahme.
 */
export function pflichtTage(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  von: Date,
  bis: Date,
): string[] {
  // Regel 1: ohne Eintritt keine Aussage.
  if (!user.appStartDate) return [];

  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];

  const start = new Date(von);
  start.setHours(0, 0, 0, 0);
  const eintritt = new Date(`${user.appStartDate}T00:00:00`);
  if (eintritt > start) start.setTime(eintritt.getTime());

  // Regel 2: höchstens bis gestern.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const gestern = new Date(heute);
  gestern.setDate(heute.getDate() - 1);

  const ende = new Date(bis);
  ende.setHours(0, 0, 0, 0);
  const schluss = gestern < ende ? gestern : ende;

  return werktageImZeitraum(workDays, start, schluss);
}

/** Die Feiertage, die in denselben Zeitraum fallen — nur zur Anzeige. */
export function feiertageImZeitraum(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  von: Date,
  bis: Date,
): number {
  if (!user.appStartDate) return 0;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const start = new Date(von);
  start.setHours(0, 0, 0, 0);
  const eintritt = new Date(`${user.appStartDate}T00:00:00`);
  if (eintritt > start) start.setTime(eintritt.getTime());
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const gestern = new Date(heute);
  gestern.setDate(heute.getDate() - 1);
  const ende = new Date(bis);
  ende.setHours(0, 0, 0, 0);
  const schluss = gestern < ende ? gestern : ende;

  let n = 0;
  for (const tag = new Date(start); tag <= schluss; tag.setDate(tag.getDate() + 1)) {
    if (workDays.includes(tag.getDay()) && isAustrianHoliday(tag)) n++;
  }
  return n;
}

/**
 * Welche Pflichttage ohne Buchung geblieben sind.
 *
 * Nur noch die Differenz aus `pflichtTage` und dem Gebuchten — die Regeln
 * darüber, welcher Tag überhaupt zählt, stehen nicht mehr hier.
 */
export function offeneWerktage(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  entries: Pick<TimeEntry, 'date'>[],
  von: Date,
  bis: Date,
): string[] {
  const gebucht = new Set(entries.map((e) => e.date));
  return pflichtTage(user, von, bis).filter((d) => !gebucht.has(d));
}

export function calcCompleteness(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  monthEntries: TimeEntry[],
  year: number,
  month: number,
): CompletenessResult {
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookedDates = new Set(monthEntries.map((e) => e.date));

  // Dieselbe Regel wie ueberall sonst, nur auf den Monat angewandt.
  const missingDates = offeneWerktage(
    user,
    monthEntries,
    new Date(year, month, 1),
    new Date(year, month + 1, 0),
  );

  if (missingDates.length > 0) {
    return { status: 'missing', missingCount: missingDates.length, missingDates };
  }

  // Alles Vergangene gedeckt — steht heute noch aus?
  const todayOpen =
    workDays.includes(today.getDay()) &&
    !bookedDates.has(localDateStr(today)) &&
    !isAustrianHoliday(today) &&
    today.getFullYear() === year &&
    today.getMonth() === month;

  return { status: todayOpen ? 'today_only' : 'complete', missingCount: 0, missingDates: [] };
}

export interface ProjectHours {
  projectNumber: string;
  /** Facharbeiterminuten — nur diese zählen gegen das Budget. */
  fachMin: number;
  /** Helferminuten — kostenneutral für das Budget (Legacy:3684). */
  helperMin: number;
  entries: TimeEntry[];
}

/**
 * Vergleichsschlüssel für Projektnummern: gleicht ein historisch gewachsenes
 * `PR-`-Präfix an, damit `2025-001` und `PR-2025-001` dasselbe Projekt sind.
 */
export function normProjectNumber(nr?: string): string {
  return (nr ?? '').trim().replace(/^PR-/i, '');
}

/**
 * Gruppiert Zeiteinträge nach Baustelle und trennt Fach- von Helferzeit
 * (Legacy:3510-3549). Nur Anwesenheit mit Projektbezug zählt.
 */
export function groupProjectHours(entries: TimeEntry[]): ProjectHours[] {
  const map = new Map<string, ProjectHours>();
  for (const e of entries) {
    if (e.status !== 'Anwesend' || !e.projectNumber) continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    const key = normProjectNumber(e.projectNumber);
    const cur = map.get(key) ?? { projectNumber: key, fachMin: 0, helperMin: 0, entries: [] };
    if (e.isHelper) cur.helperMin += min;
    else cur.fachMin += min;
    cur.entries.push(e);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.projectNumber.localeCompare(b.projectNumber));
}

/**
 * Minuten als Dezimalstunden mit KOMMA — „16,5".
 *
 * WARUM DAS HIER STEHT UND NICHT ZWEIMAL IN DEN ANSICHTEN. Das Dashboard
 * rechnete selbst (`Math.round(min / 60 * 10) / 10`) und gab die Zahl roh
 * aus; JavaScript schreibt sie mit PUNKT. Auf der Startseite stand damit
 * „39.5 von 40 h", in der Projektauswertung „39,5 h" — dieselbe Zahl,
 * zweierlei Schreibweise, in einer deutschsprachigen Oberfläche.
 *
 * Immer EINE Nachkommastelle, auch bei glatten Werten: „40,0" neben „39,5"
 * liest sich als Reihe, „40" neben „39,5" als Bruch in der Darstellung.
 */
/**
 * Eine Stundenzahl, wie sie gespeichert ist — Budget, Kalkulation: „3,5",
 * „40", nie „3.5" (Launch-Check 25.09.2026). Anders als `fmtStd` ohne
 * erzwungene Nachkommastelle: ein Budget von 40 h ist keine Messung.
 */
export function fmtStunden(h: number): string {
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(h);
}

export function fmtStd(min: number): string {
  return (min / 60).toFixed(1).replace('.', ',');
}

/** Die Breite des Budgetbalkens — er endet am Rand, die Zahl daneben nicht. */
export function balkenBreite(pct: number): string {
  return `${Math.min(Math.max(pct, 0), 100)}%`;
}

export interface BudgetState {
  /**
   * Ausschöpfung in Prozent — die ECHTE Zahl, auch über 100; null ohne
   * hinterlegtes Budget. Gedeckelt wird nur der Balken (`balkenBreite`):
   * 6 von 5 h stand als „100 %, über Budget" da statt 120 % (Launch-Check
   * 25.09.2026, M11).
   */
  pct: number | null;
  /** true, sobald die Fachzeit das Budget ECHT überschreitet. */
  over: boolean;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

/**
 * Budget-Ampel einer Baustelle (Legacy:3597-3601).
 * Genau 100 % gilt noch NICHT als Überschreitung — erst darüber wird es rot.
 * Ohne hinterlegtes Budget gibt es bewusst keine Ampel statt einer falschen.
 */
export function calcBudgetState(fachMin: number, estimatedHours?: number): BudgetState {
  if (!estimatedHours || estimatedHours <= 0) {
    return { pct: null, over: false, tone: 'neutral' };
  }
  const usedH = fachMin / 60;
  const raw = (usedH / estimatedHours) * 100;
  const over = usedH > estimatedHours;
  return {
    pct: Math.round(raw),
    over,
    tone: over ? 'danger' : raw >= 80 ? 'warning' : 'success',
  };
}
