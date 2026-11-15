import type { Invoice, InvoiceRates, Mahnung, MahnungInhalt } from '@/types';
import { mahnbar, offenerRest, ruecklassFaelligAm } from './zahlstand';
import { zahlOder } from '@/lib/zahl';
import { aufStellen, cent, euroBetrag } from '@/lib/betrag';

/** TT.MM.JJJJ — hier ohne die Datumsbibliothek, die Datei bleibt ohne Oberflächen-Importe. */
const datumKurzAT = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');

/**
 * Mahnwesen — was mit einer Rechnung geschieht, die nicht bezahlt wird.
 *
 * WAS ES VORHER GAB: den Status „Überfällig". Er wurde beim Öffnen der
 * Ansicht automatisch gesetzt und dann angezeigt. Mehr nicht — kein
 * Mahndatum, keine Stufe, kein Schreiben an den Kunden. Der Betrieb sah, dass
 * Geld aussteht, und musste das Mahnen selbst im Kopf führen.
 *
 * DREI STUFEN, weil im Handwerk drei üblich sind und weil sie verschiedene
 * Dinge sagen:
 *
 *   1  ZAHLUNGSERINNERUNG — geht davon aus, dass es übersehen wurde. Das ist
 *      in den meisten Fällen die Wahrheit, und ein scharfer Ton bei der
 *      ersten Nachfrage kostet Kunden, die einfach nur im Urlaub waren.
 *   2  MAHNUNG — benennt den Verzug.
 *   3  LETZTE MAHNUNG — kündigt an, dass es aus der Hand gegeben wird.
 *
 * VERZUGSZINSEN stehen seit 29.09.2026 ab der zweiten Stufe auf dem Beleg
 * (offene Punkte B7) — siehe {@link verzugszinsen}. Die Mahnspesen legt der
 * Betrieb selbst fest; sie stehen in den Einstellungen und sind je Stufe eine
 * schlichte Zahl.
 */

export const MAHNSTUFEN = [1, 2, 3] as const;
export type Mahnstufe = (typeof MAHNSTUFEN)[number];

export interface StufenText {
  /** Die Überschrift auf dem Beleg. */
  titel: string;
  /** Der Absatz darüber, wie der Betrieb die Sache sieht. */
  anrede: string;
  /** Der Satz, der die neue Frist nennt. */
  frist: (bis: string) => string;
}

export const TEXTE: Record<Mahnstufe, StufenText> = {
  1: {
    titel: 'Zahlungserinnerung',
    anrede:
      'vermutlich ist unsere Rechnung untergegangen — das kommt vor. Wir dürfen Sie an den ' +
      'offenen Betrag erinnern.',
    frist: (bis) => `Wir bitten um Überweisung bis ${bis}.`,
  },
  2: {
    titel: 'Mahnung',
    anrede:
      'unsere Rechnung ist trotz Erinnerung offen. Wir müssen Sie daher mahnen und ersuchen ' +
      'um Begleichung.',
    frist: (bis) => `Wir setzen eine Frist bis ${bis}.`,
  },
  3: {
    titel: 'Letzte Mahnung',
    anrede:
      'unsere Rechnung ist trotz zweimaliger Aufforderung weiterhin offen. Dies ist unsere ' +
      'letzte Mahnung.',
    frist: (bis) =>
      `Wir setzen eine letzte Frist bis ${bis}. Danach geben wir die Forderung aus der Hand.`,
  },
};

/**
 * Welche Stufe kommt als Nächstes?
 *
 * `null` heisst: es geht nicht weiter. Nach der dritten ist Schluss — was
 * dann folgt, entscheidet nicht diese App, sondern ein Mensch mit einem
 * Anwalt oder einem Inkassobüro. Eine vierte Mahnung wäre ein Schreiben, das
 * seine eigene Ankündigung widerruft.
 */
export function naechsteStufe(inv: Pick<Invoice, 'mahnstufe'>): Mahnstufe | null {
  const jetzt = inv.mahnstufe ?? 0;
  return jetzt >= 3 ? null : ((jetzt + 1) as Mahnstufe);
}

export interface MahnPruefung {
  /** Darf gemahnt werden? */
  moeglich: boolean;
  /** Warum nicht — für die Oberfläche. */
  grund?: string;
}

/**
 * Darf diese Rechnung gemahnt werden?
 *
 * DIE FÄLLIGKEIT ENTSCHEIDET, nicht der Status. „Überfällig" wird beim Öffnen
 * der Liste gesetzt; wer die Liste heute noch nicht geöffnet hat, hätte sonst
 * eine fällige Rechnung, die sich nicht mahnen lässt. Der Status ist eine
 * Anzeige, das Datum ist die Tatsache.
 */
export function darfMahnen(
  inv: Pick<
    Invoice,
    'paymentStatus' | 'dueDate' | 'mahnstufe' | 'gemahntAm' | 'mahnfrist'
    | 'totalBrutto' | 'bezahltBetrag' | 'ruecklassBetrag' | 'ruecklassBis' | 'ruecklassGarantieAm'
  >,
  heute: string,
): MahnPruefung {
  if (inv.paymentStatus === 'Storniert') {
    return { moeglich: false, grund: 'Die Rechnung ist storniert.' };
  }
  /*
    BEIDE MÜSSEN „OFFEN" SAGEN — der Status UND die Zahl.

    „Teilbezahlt" ist mahnbar, der Kunde schuldet ja noch etwas; das ist der
    Grund für Stufe 10.1, denn vorher wurde eine Rechnung über 1.000 €, auf
    die 400 gekommen sind, über den vollen Betrag gemahnt.

    WARUM NICHT ALLEIN DIE ZAHL, obwohl sie die genauere wäre: Rechnungen aus
    der Zeit vor den Zahlungseingängen tragen „Bezahlt" und einen bezahlten
    Betrag von null — den Betrag hat damals niemand erfasst, weil es das Feld
    nicht gab. Wer hier nur rechnet, mahnt beim ersten Lauf den gesamten
    Altbestand. Die Migration trägt den Betrag zwar nach (siehe
    `20260919120000_zahlungseingaenge.sql`), aber eine Regel, die nur mit
    geglückter Migration richtig ist, ist keine Regel, sondern eine Annahme.
  */
  if (inv.paymentStatus === 'Bezahlt' || inv.paymentStatus === 'Überzahlt') {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  if (offenerRest(inv) <= 0) {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  // Offen ist nur noch ein Rücklass, der nicht fällig ist (seit 05.10.2026).
  const m = mahnbar(inv, heute);
  if (m.rest <= 0) {
    return { moeglich: false, grund: `Offen ist nur der Rücklass, fällig am ${datumKurzAT(ruecklassFaelligAm(inv))}.` };
  }
  if (!m.faellig || m.faellig >= heute) {
    return { moeglich: false, grund: 'Das Zahlungsziel ist noch nicht abgelaufen.' };
  }
  if (naechsteStufe(inv) === null) {
    return {
      moeglich: false,
      grund: 'Die dritte Mahnung ist verschickt. Was jetzt folgt, entscheidet der Betrieb.',
    };
  }
  const laeuft = laufendeFrist(inv);
  if (laeuft && laeuft >= heute) {
    return {
      moeglich: false,
      grund: `Die Frist aus der letzten Mahnung läuft noch bis ${laeuft}.`,
    };
  }
  return { moeglich: true };
}

/**
 * Bis wann die Frist aus der LETZTEN Mahnung läuft — oder `null`, wenn keine
 * läuft.
 *
 * DER FEHLER, DEN DAS BEHEBT. Geprüft wurde bisher nur das ursprüngliche
 * Zahlungsziel. Wer gestern eine Zahlungserinnerung mit einer Woche Frist
 * verschickt hat, bekam die Rechnung heute wieder im Mahnlauf angeboten — für
 * Stufe 2, sechs Tage vor Ablauf der Frist, die er selbst gesetzt hat. Das sah
 * nach Arbeit aus und war eine Aufforderung, dem Kunden die zugesagte Frist
 * wieder zu nehmen.
 *
 * Aufgefallen ist es erst durch das Abzeichen im Menü: eine Zahl, die jede
 * überfällige Rechnung jeden Tag mitzählt, leuchtet dauerhaft — und eine
 * Meldung, die immer an ist, ist keine.
 *
 * DER RÜCKFALL, wenn `mahnfrist` fehlt: das Mahndatum plus {@link FRIST_TAGE},
 * also die Frist, die der Beleg vorschlägt. Fehlt auch das, ist die Rechnung
 * fällig — die andere Wahl wäre „nie wieder fällig", und das versteckte eine
 * offene Forderung für immer.
 *
 * Dieselbe Regel steht in `app.mahnung_faellig` (Migration
 * `20260916140000_offene_posten.sql`), weil das Abzeichen zählen muss, was
 * diese Liste zeigt.
 */
export function laufendeFrist(
  inv: Pick<Invoice, 'mahnstufe' | 'gemahntAm' | 'mahnfrist'>,
): string | null {
  if (!inv.mahnstufe) return null;
  if (inv.mahnfrist) return inv.mahnfrist;
  if (!inv.gemahntAm) return null;
  return tagePlus(inv.gemahntAm, FRIST_TAGE);
}

/** `n` Tage auf einen ISO-Tag, in UTC gerechnet — ohne Sommerzeitfallen. */
function tagePlus(isoTag: string, n: number): string | null {
  const t = Date.parse(`${isoTag}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Die Mahnspesen einer Stufe.
 *
 * Der Betrieb legt sie fest; ohne Festlegung sind sie null. KEINE VORGABE mit
 * einer erfundenen Zahl: was ein Betrieb verrechnen darf, hängt am Aufwand
 * und am Vertrag, und ein voreingestellter Betrag sähe aus wie eine Auskunft
 * darüber.
 */
export function spesenFuer(stufe: Mahnstufe, spesen: number[] | undefined): number {
  const wert = spesen?.[stufe - 1];
  return typeof wert === 'number' && wert > 0 ? wert : 0;
}

/** Die Einstellungen, aus denen die Mahnkosten einer Rechnung kommen. */
export type MahnkostenSaetze = Pick<InvoiceRates, 'mahnspesen' | 'mahnspesenVerbraucher' | 'pauschale458'>;

/** Pauschale für Betreibungskosten zwischen Unternehmern (§ 458 UGB). */
export const PAUSCHALE_458 = 40;

/**
 * Die Summe der Mahnspesen über alle Stufen — so viel verlangt eine Rechnung
 * höchstens, wenn sie alle drei durchläuft (Testbericht 30.09.2026, M22).
 */
export function spesenSumme(spesen: number[] | undefined): number {
  return cent((spesen ?? []).reduce((s, w) => s + (typeof w === 'number' && w > 0 ? w : 0), 0));
}

/**
 * Was die Maske zu den Mahnspesen sagt (M22): an Firmenkunden höchstens 40 €
 * je Rechnung — die Datenbank weist mehr ab (`companies_mahnspesen_grenze`);
 * an Privatkunden nur eine Warnung über 40 €, denn das Gesetz verlangt
 * „angemessen“ und nennt keinen Betrag.
 */
export function mahnspesenBefund(
  saetze: Pick<InvoiceRates, 'mahnspesen' | 'mahnspesenVerbraucher' | 'pauschale458'>,
): { firmaZuViel: number | null; privatHoch: number | null } {
  // Dieselbe Rechnung wie die Schreiben (G3); die Pauschale steht für sich.
  const firma = saetze.pauschale458 ? 0 : hoechsteMahnkosten(saetze, true);
  const privat = hoechsteMahnkosten(saetze, false);
  return {
    firmaZuViel: firma > PAUSCHALE_458 ? firma : null,
    privatHoch: privat > PAUSCHALE_458 ? privat : null,
  };
}

/**
 * Was eine Mahnung an Kosten verlangt — je nachdem, an wen sie geht.
 *
 * FIRMEN- UND PRIVATKUNDEN GETRENNT, weil das Gesetz sie trennt. Gegenüber
 * einem Verbraucher sind Mahnkosten nur zu ersetzen, soweit sie angemessen
 * und zweckmässig sind (§ 1333 Abs 2 ABGB); eine hohe Pauschale je Brief hält
 * dort oft nicht. Zwischen Unternehmern steht dem Betrieb ab dem Verzug eine
 * Pauschale von 40 € zu (§ 458 UGB), die die Mahnkosten bis zu dieser Höhe
 * abdeckt — deshalb ENTWEDER die Pauschale ODER die Spesen je Stufe, nicht
 * beides. Unternehmer ist, wie bei den Verzugszinsen, wer eine UID hat.
 *
 * OHNE EIGENE SÄTZE FÜR PRIVATKUNDEN gelten die bisherigen: ein Betrieb, der
 * seine Spesen vor der Trennung eingetragen hat, verrechnet unverändert
 * weiter, bis er etwas anderes einträgt.
 *
 * Die Pauschale steht ab der Mahnung, nicht auf der Zahlungserinnerung — aus
 * demselben Grund wie die Zinsen.
 */
export function mahnkosten(
  stufe: Mahnstufe,
  saetze: MahnkostenSaetze | undefined,
  unternehmer: boolean,
): { spesen: number; pauschale: number } {
  if (unternehmer && saetze?.pauschale458) {
    /*
      EINMAL JE RECHNUNG (G3): die Pauschale steht auf der Mahnung (Stufe 2).
      Die letzte Mahnung forderte sie bisher ein zweites Mal — seit die
      Schreiben frühere Kosten mitführen, stünde sie sonst doppelt da.
    */
    return { spesen: 0, pauschale: stufe === 2 ? PAUSCHALE_458 : 0 };
  }
  const liste = unternehmer ? saetze?.mahnspesen : (saetze?.mahnspesenVerbraucher ?? saetze?.mahnspesen);
  return { spesen: spesenFuer(stufe, liste), pauschale: 0 };
}

/**
 * Was eine Rechnung höchstens an Mahnkosten fordert, wenn sie alle drei
 * Stufen durchläuft — dieselbe Rechnung wie die Schreiben (G3). Die
 * Einstellung prüft daran ihre Grenze.
 */
export function hoechsteMahnkosten(saetze: MahnkostenSaetze | undefined, unternehmer: boolean): number {
  return cent(MAHNSTUFEN.reduce((s, stufe) => {
    const k = mahnkosten(stufe, saetze, unternehmer);
    return s + k.spesen + k.pauschale;
  }, 0));
}

/**
 * DIE MAHNFORDERUNG — EIN MODELL für Einstellung, Schreiben und Verbuchung
 * (Durchsicht 15.11.2026, G3).
 *
 * WAS VORHER WAR: drei Modelle. Die Einstellung zählte die Spesen aller
 * Stufen zusammen („je Rechnung“), das Schreiben forderte nur die seiner
 * Stufe, und die Verbuchung ließ „letzte Mahnung minus alle bisherigen
 * Mahnkosten-Eingänge“ zu. Zahlte der Kunde nach einer Teilzahlung genau den
 * Betrag aus Mahnung 3, wurde ein Teil davon Guthaben — und die Spesen der
 * Stufen 1 und 2 forderte niemand mehr.
 *
 * JETZT: Jedes Schreiben fordert die Mahnkosten der Rechnung bis zu seinem
 * Tag — die Kosten aller bisherigen Stufen, wie ihre Schreiben sie nannten,
 * dazu die eigenen und die Verzugszinsen bis zum Mahntag — und zieht ab, was
 * davon schon bezahlt ist. Diese `forderung` steht im Inhalt der Mahnung;
 * die Verbuchung (`app.mahnforderung`, `letzteMahnforderung`) nimmt genau
 * sie. Was der Brief verlangt, lässt sich also immer ganz verbuchen.
 */
export interface Mahnforderung {
  /** Kosten dieser Stufe — Spesen oder Pauschale. */
  kosten: number;
  /** Kosten der früheren Schreiben, wie sie dort standen. */
  kostenFrueher: number;
  /** Verzugszinsen bis zum Mahntag, über die ganze Zeit des Verzugs. */
  zinsen: number;
  /** Alles zusammen — was die Rechnung an Mahnkosten bis heute schuldet. */
  forderung: number;
  /** Was davon schon eingegangen ist (Eingänge der Art „Mahnkosten“). */
  bezahlt: number;
  /** Was das Schreiben noch fordert. */
  offen: number;
}

export function mahnforderungRechnen(o: {
  kosten: number;
  /** Die früheren Mahnungen dieser Rechnung — ihre Kosten zählen mit. */
  frueher: Pick<Mahnung, 'spesen' | 'inhalt'>[];
  zinsen: number;
  bezahlt: number;
}): Mahnforderung {
  const kostenFrueher = cent(o.frueher.reduce((s, m) => s + (m.inhalt?.kosten ?? m.spesen ?? 0), 0));
  const forderung = cent(kostenFrueher + o.kosten + o.zinsen);
  const bezahlt = cent(Math.max(o.bezahlt, 0));
  return {
    kosten: cent(o.kosten), kostenFrueher, zinsen: cent(o.zinsen), forderung, bezahlt,
    offen: cent(Math.max(forderung - bezahlt, 0)),
  };
}

/** Vorschlag für die neue Frist: eine Woche. Änderbar in der Oberfläche. */
export const FRIST_TAGE = 7;

/** Verzugszinsen gegenüber Verbrauchern, % im Jahr (§ 1000 Abs 1 ABGB). */
export const ZINS_VERBRAUCHER = 4;
/** Zwischen Unternehmern: Prozentpunkte über dem Basiszinssatz (§ 456 UGB). */
export const ZINS_AUFSCHLAG_UNTERNEHMER = 9.2;

/** Der 1. Jänner oder 1. Juli, mit dem das Halbjahr eines Tages beginnt. */
export function halbjahresbeginn(isoTag: string): string {
  return `${isoTag.slice(0, 4)}-${Number(isoTag.slice(5, 7)) <= 6 ? '01' : '07'}-01`;
}

/** Ein Basiszinssatz mit dem Halbjahr, für das er gilt (Testbericht 30.09.2026, G30). */
export interface Basiszinssatz {
  /** 1. Jänner oder 1. Juli. */
  ab: string;
  /** % — darf negativ sein. */
  satz: number;
}

/** Ein gültiger Eintrag: ein Halbjahresbeginn und eine endliche Zahl. */
function gueltig(b: Basiszinssatz | null | undefined): b is Basiszinssatz {
  return !!b && typeof b.satz === 'number' && Number.isFinite(b.satz) && /^\d{4}-(01|07)-01$/.test(b.ab);
}

/**
 * Der Verlauf der Basiszinssätze eines Betriebs — die Liste und, wo es sie
 * noch gibt, der einzelne Satz aus der Zeit davor. Je Halbjahr einer; die
 * Liste gewinnt.
 *
 * DER ZENTRALE SATZ GEWINNT ÜBER BEIDE (seit 05.10.2026). Der Basiszinssatz
 * gilt für ganz Österreich; der Betreiber pflegt ihn an einer Stelle
 * (`public.basiszinssaetze`). Was ein Betrieb selbst eingetragen hat, gilt nur
 * noch für Halbjahre, zu denen zentral nichts steht — so ändert sich bei
 * keinem Betrieb etwas, solange die zentrale Liste leer ist.
 */
export function basiszinsVerlauf(rates?: {
  basiszinssaetze?: Basiszinssatz[] | null;
  basiszinssatz?: number | null;
  basiszinssatzAb?: string | null;
} | null, zentral?: Basiszinssatz[] | null): Basiszinssatz[] {
  const je = new Map<string, number>();
  const alt = { ab: rates?.basiszinssatzAb ?? '', satz: rates?.basiszinssatz as number };
  if (gueltig(alt)) je.set(alt.ab, alt.satz);
  for (const b of rates?.basiszinssaetze ?? []) {
    if (gueltig(b)) je.set(b.ab, b.satz);
  }
  for (const b of zentral ?? []) {
    if (gueltig(b)) je.set(b.ab, b.satz);
  }
  return [...je.entries()].map(([ab, satz]) => ({ ab, satz })).sort((a, b) => a.ab.localeCompare(b.ab));
}

/** Halbjahre zur Wahl: vom nächsten bis fünfzehn Jahre zurück, das jüngste zuerst (G30). */
export function halbjahreZurWahl(heute: string): string[] {
  const jetzt = halbjahresbeginn(heute);
  const jahr = Number(jetzt.slice(0, 4));
  const raus: string[] = [];
  for (let j = jahr + 1; j >= jahr - 15; j -= 1) {
    for (const hj of [`${j}-07-01`, `${j}-01-01`]) raus.push(hj);
  }
  const naechstes = jetzt.endsWith('-01-01') ? `${jahr}-07-01` : `${jahr + 1}-01-01`;
  return raus.filter((hj) => hj <= naechstes);
}

export type Verzugszinsen =
  | { art: 'keine' }
  /** Ein Unternehmer, aber kein Basiszinssatz für das laufende Halbjahr. */
  | { art: 'fehlt' }
  | {
      art: 'berechnet';
      /** % im Jahr — bei mehreren Halbjahren der des letzten. */
      satz: number;
      tage: number;
      betrag: number;
      grundlage: '§ 1000 ABGB' | '§ 456 UGB';
      /** Gesetzt, wenn erst ab diesem Tag gerechnet wird (siehe unten). */
      ab?: string;
      /**
       * Nur wenn der Verzug über mehrere Halbjahre mit verschiedenen Sätzen
       * reicht (G30) — oder wenn zwischendurch gezahlt wurde (G3): dann trägt
       * jeder Abschnitt seinen Betrag (`rest`).
       */
      abschnitte?: { von: string; bis: string; satz: number; tage: number; rest?: number }[];
    };

/**
 * Die gesetzlichen Verzugszinsen einer Mahnung (offene Punkte B7).
 *
 * AB DER ZWEITEN STUFE. Die Zahlungserinnerung geht davon aus, dass die
 * Rechnung übersehen wurde — eine Zinsforderung darin widerspräche ihrem
 * eigenen Ton. Geschuldet sind die Zinsen trotzdem ab dem ersten Tag nach
 * dem Zahlungsziel; die Mahnung rechnet deshalb vom Ziel bis zu ihrem Datum.
 *
 * UNTERNEHMER IST, wer als Unternehmen im Kundenstamm steht oder eine UID
 * hat (Testbericht 30.09.2026, M10). Sonst gilt der Verbrauchersatz — der
 * niedrigere; zu wenig zu fordern schadet dem Betrieb weniger als zu viel.
 *
 * DER BASISZINSSATZ GILT JE HALBJAHR. Er ändert sich zum 1.1. und 1.7.
 * (maßgebend ist der am letzten Tag des Vorhalbjahres, § 456 UGB). Seit dem
 * Testbericht vom 30.09.2026 (G30) führt der Betrieb einen VERLAUF: jeder
 * Tag des Verzugs wird mit dem Satz seines Halbjahres gerechnet. Fehlt der
 * Satz für das Halbjahr der Mahnung, rechnet sie nichts — `fehlt`, und die
 * Oberfläche sagt es; eine falsche Zinsforderung ist schlechter als keine.
 * Fehlt ein früherer, wird erst ab dem ältesten lückenlos bekannten Halbjahr
 * gerechnet (`ab`), und der Beleg sagt es. Weniger zu fordern ist zulässig,
 * mehr nicht.
 *
 * NICHT GESPEICHERT. Die Zinsen stehen auf dem Beleg und in der Summe, die er
 * fordert, aber nicht im Zahlungsstand der Rechnung: sie sind keine Leistung,
 * und eine Zahlung darauf ist eine Zahlung über den Rechnungsbetrag hinaus.
 */
export function verzugszinsen(o: {
  stufe: Mahnstufe;
  rest: number;
  faellig?: string;
  bis: string;
  unternehmer: boolean;
  basiszinssatz?: number | null;
  basiszinssatzAb?: string | null;
  basiszinssaetze?: Basiszinssatz[] | null;
  /** Die zentral gepflegten Sätze; sie gewinnen je Halbjahr. */
  zentral?: Basiszinssatz[] | null;
  /**
   * Die Eingänge auf die Rechnung (ohne Mahnkosten), mit Tag (G3). Mit ihnen
   * rechnet jeder Tag des Verzugs auf den Betrag, der an ihm offen war —
   * vorher rechnete jede Mahnung den heutigen Rest über die ganze Zeit, auch
   * über die Tage, für die nach einer Teilzahlung schon Zinsen bezahlt
   * waren. Ohne sie: der heutige Rest, wie bisher.
   */
  zahlungen?: { datum: string; betrag: number }[];
}): Verzugszinsen {
  if (o.stufe < 2 || !(o.rest >= 0.01) || !o.faellig) return { art: 'keine' };
  const von = Date.parse(`${o.faellig}T00:00:00Z`);
  const bis = Date.parse(`${o.bis}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return { art: 'keine' };
  if (Math.round((bis - von) / 86_400_000) <= 0) return { art: 'keine' };

  const erster = tagNach(o.faellig);
  /*
    WAS AN EINEM TAG OFFEN WAR: der heutige Rest und alles, was erst danach
    einging. Ein Eingang zählt ab seinem Tag — an ihm selbst läuft für den
    bezahlten Teil kein Zins mehr.
  */
  const zahlungen = (o.zahlungen ?? []).filter((z) => Number.isFinite(z.betrag) && z.betrag !== 0);
  const offenAm = (tag: string) =>
    cent(Math.max(o.rest + zahlungen.filter((z) => z.datum > tag).reduce((s, z) => s + z.betrag, 0), 0));

  /*
    DER SATZ JE TAG. Verbraucher: 4 %. Unternehmer: Basiszinssatz des
    Halbjahres + 9,2 — vom Mahntag rückwärts nur, solange jedes Halbjahr
    einen Satz hat; davor wird nicht gerechnet (`ab`), fehlt er schon für das
    Halbjahr des Mahntags, gar nicht (`fehlt`).
  */
  let beginn = erster;
  let satzFuer: (tag: string) => number = () => ZINS_VERBRAUCHER;
  const grenzen = new Set<string>();
  if (o.unternehmer) {
    const saetze = new Map(basiszinsVerlauf(o, o.zentral).map((b) => [b.ab, b.satz]));
    let hj = halbjahresbeginn(o.bis);
    if (!saetze.has(hj)) return { art: 'fehlt' };
    while (hj > erster) {
      grenzen.add(hj);
      const davor = halbjahresbeginn(tagVor(hj));
      if (!saetze.has(davor)) {
        beginn = hj;
        break;
      }
      hj = davor;
    }
    satzFuer = (tag) => aufStellen(saetze.get(halbjahresbeginn(tag))! + ZINS_AUFSCHLAG_UNTERNEHMER, 2);
  }
  for (const z of zahlungen) grenzen.add(z.datum);
  const anfaenge = [beginn, ...[...grenzen].filter((t) => t > beginn && t <= o.bis)]
    .filter((t, i, a) => a.indexOf(t) === i)
    .sort();

  const abschnitte = anfaenge.map((a, i) => {
    const ende = i + 1 < anfaenge.length ? tagVor(anfaenge[i + 1]) : o.bis;
    return { von: a, bis: ende, satz: satzFuer(a), tage: tageZwischen(a, ende) + 1, rest: offenAm(a) };
  });

  const gezaehlt = abschnitte.reduce((n, a) => n + a.tage, 0);
  const betrag = cent(abschnitte.reduce((s, a) => s + a.rest * (a.satz / 100) * (a.tage / 365), 0));
  if (betrag <= 0) return { art: 'keine' };
  const ergebnis: Verzugszinsen = {
    art: 'berechnet',
    satz: abschnitte[abschnitte.length - 1].satz,
    tage: gezaehlt,
    betrag,
    grundlage: o.unternehmer ? '§ 456 UGB' : '§ 1000 ABGB',
  };
  if (beginn > erster) ergebnis.ab = beginn;
  const restWechselt = new Set(abschnitte.map((a) => a.rest)).size > 1;
  if (restWechselt) {
    ergebnis.abschnitte = zusammenlegen(abschnitte);
  } else if (new Set(abschnitte.map((a) => a.satz)).size > 1) {
    // Wie bisher (G30): je Halbjahr ein Abschnitt, ohne Betrag — er ist überall derselbe.
    ergebnis.abschnitte = abschnitte.map((a) => ({ von: a.von, bis: a.bis, satz: a.satz, tage: a.tage }));
  }
  return ergebnis;
}

/** Nebeneinanderliegende Abschnitte mit gleichem Satz und Betrag sind einer. */
function zusammenlegen<T extends { von: string; bis: string; satz: number; tage: number; rest: number }>(liste: T[]): T[] {
  const raus: T[] = [];
  for (const a of liste) {
    const vor = raus[raus.length - 1];
    if (vor && vor.satz === a.satz && vor.rest === a.rest) {
      raus[raus.length - 1] = { ...vor, bis: a.bis, tage: vor.tage + a.tage };
    } else {
      raus.push({ ...a });
    }
  }
  return raus;
}

/**
 * Der Satz, wie Beleg und Dialog ihn nennen: einer, oder je Halbjahr einer.
 * Ohne Bindestrich zwischen den Daten — das Briefpapier druckt ihn nicht.
 */
export function zinssatzText(
  z: Extract<Verzugszinsen, { art: 'berechnet' }>,
  datum: (iso: string) => string,
): string {
  const pz = (n: number) => `${n.toLocaleString('de-AT', { maximumFractionDigits: 2 })} %`;
  if (!z.abschnitte) return `${pz(z.satz)} p. a.`;
  // Seit G3 mit dem Betrag je Abschnitt, wenn zwischendurch gezahlt wurde.
  const auf = (rest?: number) => (rest !== undefined ? ` auf ${euroBetrag(rest)} €` : '');
  return `${z.abschnitte.map((a) => `${pz(a.satz)}${auf(a.rest)} vom ${datum(a.von)} bis ${datum(a.bis)}`).join(', ')} p. a.`;
}

function tagNach(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
function tagVor(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);
}


/**
 * Was eine Mahnung an Mahnspesen und Verzugszinsen gefordert hat — das
 * Gegenstück zu `app.mahnforderung` in der Datenbank (Durchsicht 09.11.2026).
 *
 * Die Kosten stehen als Zahl im Inhalt, die Zinsen seit 09.11.2026 ebenso.
 * Ältere Mahnungen tragen die Zinsen nur als Zeile des Zahlenblocks
 * („Verzugszinsen …“ / „3,16 €“), so, wie `mahnungInhalt` sie schrieb: gelesen
 * werden Ziffern und Komma, der Tausenderpunkt fällt weg.
 */
export function mahnforderungAus(inhalt: Pick<MahnungInhalt, 'kosten' | 'zinsen' | 'zeilen' | 'forderung'>): number {
  // Seit G3 steht die ganze Forderung im Inhalt — sie gilt, wie gedruckt.
  if (typeof inhalt.forderung === 'number' && Number.isFinite(inhalt.forderung)) return cent(inhalt.forderung);
  const zinsen = inhalt.zinsen ?? (inhalt.zeilen ?? [])
    .filter(([bezeichnung, wert]) => bezeichnung.startsWith('Verzugszinsen') && /[0-9]/.test(wert))
    .reduce((s, [, wert]) => s + zahlOder(wert.replace(/[^0-9,]/g, ''), 0), 0);
  return cent((inhalt.kosten ?? 0) + (Number.isFinite(zinsen) ? zinsen : 0));
}

/**
 * Was die LETZTE Mahnung einer Rechnung an Spesen und Zinsen gefordert hat.
 * Vor dem 10.10.2026 gab es kein gespeichertes Schreiben, nur den Mahnstand an
 * der Rechnung — dann gelten dessen Mahnspesen (wie in der Datenbank).
 */
export function letzteMahnforderung(
  mahnungen: Pick<Mahnung, 'datum' | 'angelegtAm' | 'inhalt'>[],
  inv: Pick<Invoice, 'mahnstufe' | 'mahnspesen'>,
): number {
  const letzte = [...mahnungen].sort((a, b) =>
    b.datum.localeCompare(a.datum) || (b.angelegtAm ?? 0) - (a.angelegtAm ?? 0))[0];
  if (letzte) return mahnforderungAus(letzte.inhalt);
  return (inv.mahnstufe ?? 0) > 0 ? cent(inv.mahnspesen ?? 0) : 0;
}

/**
 * Wie viel eines Eingangs auf die Mahnkosten fällt, als Vorschlag: zuerst
 * der Rest der Rechnung, was darüber hinausgeht, bis zur offenen
 * Mahnforderung; erst was dann noch bleibt, ist ein Guthaben. Ein negativer
 * Eingang (Rücklastschrift) teilt nichts auf.
 */
export function mahnkostenVorschlag(betrag: number, rest: number, mahnkostenOffen: number): number {
  if (!(betrag > 0) || !(mahnkostenOffen > 0)) return 0;
  return cent(Math.min(Math.max(betrag - Math.max(rest, 0), 0), mahnkostenOffen));
}
