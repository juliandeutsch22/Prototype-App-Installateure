import type { Invoice, Quote, TimeEntry } from '@/types';
import { calcWorkMin, normProjectNumber } from '@/lib/time';
import { KEINE_MATERIALKOSTEN, type Materialkosten } from './materialkosten';
import type { Stand } from '@/components/Badge';
import { istLehrlingssatz, kostensatz, satzklasse, type Satzklasse, type Stufensaetze } from '@/lib/einstufung';

/**
 * Nachkalkulation: hat die Baustelle Geld verdient?
 *
 * Die Budget-Ampel vergleicht Stunden gegen Stundenbudget. Sie sagt, ob mehr
 * gearbeitet wurde als geplant — nicht, ob dabei etwas übrig geblieben ist.
 * Das ist ein Unterschied: eine Baustelle kann im Stundenbudget bleiben und
 * trotzdem Verlust machen, wenn der Preis zu niedrig kalkuliert war.
 *
 * DIE ENTSCHEIDENDE UNTERSCHEIDUNG: `rates.fach` ist der VERRECHNUNGSSATZ,
 * also der Erlös. Was die Stunde den Betrieb KOSTET — Lohn, Lohnnebenkosten,
 * anteilige Gemeinkosten — ist eine andere Zahl und liegt darunter. Wer beide
 * verwechselt, bekommt eine Marge von null und hält sie für ein Ergebnis.
 *
 * MATERIAL ZÄHLT SEIT DEM 07.09.2026 MIT — soweit ein Einkaufspreis
 * hinterlegt ist. Es fehlte vorher ganz, und bei einem Installateur ist es
 * schnell die Hälfte der Rechnungssumme: der ausgewiesene Deckungsbeitrag war
 * damit systematisch zu hoch, und zwar in der teuersten Richtung — eine
 * Baustelle sah tragfähig aus, die es nicht war.
 *
 * Artikel OHNE hinterlegten Einkaufspreis werden nicht geschätzt, sondern
 * beim Namen genannt (`materialLuecken`). Ein zu hoher Deckungsbeitrag, der
 * SAGT, dass ihm etwas fehlt, ist besser als ein falscher, der schweigt.
 *
 * WAS AUCH JETZT NICHT DRIN IST: Gemeinkosten, soweit sie nicht schon im
 * Stundenkostensatz stecken. Das Ergebnis bleibt ein DECKUNGSBEITRAG, kein
 * Gewinn — ihn als Gewinn auszuweisen wäre eine Zahl, die zu gut aussieht und
 * auf der jemand Entscheidungen trifft.
 */

/** Stunden sind keine Ware — eine Anfahrt „1 h" hat keinen Einkaufspreis. */
function istStundenEinheit(einheit: string | undefined): boolean {
  return /^(h|std\.?|stunden?)$/i.test((einheit ?? '').trim());
}

export interface KostenSaetze {
  /** Kosten je Facharbeiterstunde — NICHT der Verrechnungssatz. */
  fach: number;
  /** Kosten je Helferstunde. */
  helper: number;
  /** Kosten je Stufe (4.1); leer: Obermonteur wie Facharbeiter, Lehrling wie Helfer. */
  stufen?: Stufensaetze;
}

export interface Nachkalkulation {
  projectNumber: string;
  customerName: string;
  /** Geleistete Facharbeiterstunden, Obermonteure eingeschlossen. */
  fachStunden: number;
  /** Geleistete Helferstunden. */
  helferStunden: number;
  /** Geleistete Lehrlingsstunden, alle Lehrjahre (seit 30.09.2026, 4.1). */
  lehrlingStunden: number;
  /** Personalkosten aus den geleisteten Stunden. */
  personalkosten: number;
  /** Materialkosten aus den unterschriebenen Scheinen — 0, wenn keine bekannt. */
  materialkosten: number;
  /**
   * Artikel ohne hinterlegten Einkaufspreis.
   *
   * Steht in der Ansicht: solange hier etwas steht, ist der Deckungsbeitrag
   * zu hoch, und zwar um einen Betrag, den niemand kennt.
   */
  materialLuecken: string[];
  /** Erlös netto — aus Rechnungen, sonst aus dem Angebot. */
  erloes: number;
  /** Woher der Erlös stammt: verrechnet oder erst kalkuliert. */
  erloesQuelle: 'Rechnungen' | 'Angebot' | 'unbekannt';
  /** Erlös minus Personal- und Materialkosten. VOR Gemeinkosten. */
  deckungsbeitrag: number;
  /** Anteil am Erlös, oder null wenn kein Erlös bekannt ist. */
  margeProzent: number | null;
}

/**
 * Rechnet eine Baustelle durch.
 *
 * Der Erlös kommt bevorzugt aus den RECHNUNGEN: was tatsächlich verrechnet
 * wurde, ist die belastbare Zahl. Erst wenn noch nicht abgerechnet ist, tritt
 * das Angebot an seine Stelle — dann steht in der Ansicht aber auch, dass es
 * eine Erwartung ist und kein Ergebnis.
 *
 * Stornierte Rechnungen zählen nicht: sie sind kein Erlös.
 */
export function rechneBaustelle(
  projectNumber: string,
  customerName: string,
  entries: TimeEntry[],
  invoices: Invoice[],
  quote: Quote | undefined,
  kosten: KostenSaetze,
  /*
    Vorbelegt, damit jeder Aufrufer, der noch kein Material kennt, dieselbe
    Rechnung bekommt wie vorher — nur eben mit einer Null, die als Null
    gemeint ist. Die Ansicht reicht die echten Werte durch.
  */
  material: Materialkosten = KEINE_MATERIALKOSTEN,
): Nachkalkulation {
  const pn = normProjectNumber(projectNumber);

  /*
    JE SATZ, NICHT NUR FACHARBEITER UND HELFER (seit 30.09.2026, 4.1). Die
    Stunde eines Lehrlings im 1. Lehrjahr kostet den Betrieb etwas anderes
    als die eines Obermonteurs; der Satz kommt aus der Buchung.
  */
  const minJe = new Map<Satzklasse, number>();
  for (const e of entries) {
    if (e.status !== 'Anwesend') continue;
    if (normProjectNumber(e.projectNumber ?? '') !== pn) continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    const k = satzklasse(e);
    minJe.set(k, (minJe.get(k) ?? 0) + min);
  }

  const stunden = (min: number) => Math.round((min / 60) * 100) / 100;
  let fachMin = 0;
  let helferMin = 0;
  let lehrlingMin = 0;
  let kostenSumme = 0;
  for (const [k, min] of minJe) {
    if (k === 'helfer') helferMin += min;
    else if (istLehrlingssatz(k)) lehrlingMin += min;
    else fachMin += min;
    kostenSumme += stunden(min) * kostensatz(k, kosten);
  }
  const fachStunden = stunden(fachMin);
  const helferStunden = stunden(helferMin);
  const lehrlingStunden = stunden(lehrlingMin);
  const personalkosten = Math.round(kostenSumme * 100) / 100;

  const eigene = invoices.filter(
    (i) => normProjectNumber(i.projectNumber) === pn && i.paymentStatus !== 'Storniert',
  );
  /*
    ANZAHLUNG UND SCHLUSSRECHNUNG WERDEN SCHLICHT ADDIERT — und das ist kein
    Versehen, sondern der Grund, warum `total_netto` seit Stufe 10.2 die
    RESTFORDERUNG ist und nicht die Gesamtleistung.

    Eine Anzahlung über 1.000 € und eine Schlussrechnung über 3.000 €
    Gesamtleistung ergeben zusammen 3.000 €: die Schlussrechnung trägt in
    `totalNetto` nur die 2.000 €, die sie noch fordert. Stünde dort die volle
    Leistung, zählte diese Summe 4.000 € — die Baustelle sähe um ein Drittel
    einträglicher aus, als sie ist, und zwar in der teuersten Richtung.

    `gesamtNetto` wird hier deshalb bewusst NICHT gelesen. Es steht auf dem
    Beleg und gehört in keine Summe.

    WAS DIESE ZAHL MITTEN IM PROJEKT TROTZDEM NICHT SAGT: eine Anzahlung ist
    verrechnet, aber noch nicht verdient. Solange die Baustelle läuft, steht
    ihr Betrag hier als Erlös, während die Kosten dafür erst entstehen — der
    Deckungsbeitrag sieht dann besser aus, als er ist. Am Ende stimmt er; bis
    dahin ist er eine Momentaufnahme und keine Bilanz. Das war schon bei
    Teilrechnungen so und ist mit der Anzahlung deutlicher geworden.
  */
  let erloes = 0;
  let erloesQuelle: Nachkalkulation['erloesQuelle'] = 'unbekannt';
  if (eigene.length > 0) {
    erloes = Math.round(eigene.reduce((s, i) => s + (i.totalNetto ?? 0), 0) * 100) / 100;
    erloesQuelle = 'Rechnungen';
  } else if (quote && quote.status === 'Angenommen') {
    erloes = quote.totalNetto;
    erloesQuelle = 'Angebot';
  }

  const deckungsbeitrag =
    Math.round((erloes - personalkosten - material.kosten) * 100) / 100;

  /*
    MATERIAL AUS DEM ANGEBOT, DAS AUF KEINEM SCHEIN STEHT (Launch-Check
    25.09.2026, M9). Einkaufspreise kennt die Rechnung nur aus den Scheinen.
    Ist dort gar kein Material erfasst, das angenommene Angebot aber verkauft
    einen Heizkörper um 250 €, stand der Deckungsbeitrag bei 100 % — ohne ein
    Wort. Jetzt steht der Heizkörper bei den Lücken. Sobald ein Schein
    Material trägt, gilt der Schein: sonst wäre derselbe Heizkörper doppelt
    gemeldet.
  */
  const ausAngebot =
    quote && quote.status === 'Angenommen' && material.scheine === 0
      ? (quote.positions ?? [])
          .filter((p) => !(p.istArbeitszeit ?? false) && !istStundenEinheit(p.unit))
          .map((p) => `${p.label} (aus dem Angebot)`)
      : [];

  return {
    projectNumber,
    customerName,
    fachStunden,
    helferStunden,
    lehrlingStunden,
    personalkosten,
    materialkosten: material.kosten,
    materialLuecken: [...material.ohnePreis, ...ausAngebot],
    erloes,
    erloesQuelle,
    deckungsbeitrag,
    // Ohne bekannten Erlös gibt es keine Marge — nicht null Prozent, sondern
    // keine Aussage. Eine Null hier läse sich wie „nichts verdient".
    margeProzent: erloes > 0 ? Math.round((deckungsbeitrag / erloes) * 1000) / 10 : null,
  };
}

/**
 * Ampel für den Deckungsbeitrag.
 *
 * GIBT EINEN ZUSTAND ZURÜCK, KEINE FARBE. Vorher standen hier die Tonnamen
 * der alten Pille; wer sie las, sah „danger" und nicht „hier wird Geld
 * verloren". Der Zustand sagt die Sache, die Anzeige entscheidet über die
 * Form.
 */
export function margenTon(k: Nachkalkulation): Stand {
  if (k.erloesQuelle === 'unbekannt') return 'ruht';
  if (k.deckungsbeitrag < 0) return 'schlecht';
  /*
    Unter zwanzig Prozent bleibt nach Gemeinkosten erfahrungsgemäß nichts
    übrig — das ist eine Warnung wert, auch wenn die Zahl formal positiv ist.

    Ebenso, wenn Material ohne Einkaufspreis mitgelaufen ist: dann ist der
    Deckungsbeitrag um einen unbekannten Betrag zu hoch, und Grün wäre eine
    Zusage, die die Zahlen nicht decken.
  */
  if (k.materialLuecken.length > 0) return 'achtung';
  if ((k.margeProzent ?? 0) < 20) return 'achtung';
  return 'gut';
}
