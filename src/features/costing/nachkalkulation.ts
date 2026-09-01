import type { Invoice, Quote, TimeEntry } from '@/types';
import { calcWorkMin, normProjectNumber } from '@/lib/time';

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
 * WAS DIESE RECHNUNG NICHT KANN, und das gehört gesagt: Materialkosten fehlen.
 * Die Materialanforderung trägt in dieser App bewusst keinen Preis — sie ist
 * eine Anforderung, keine Bestellung. Das Ergebnis ist deshalb ein
 * DECKUNGSBEITRAG vor Material und Gemeinkosten, kein Gewinn. Ihn als Gewinn
 * auszuweisen wäre eine Zahl, die zu gut aussieht und auf der jemand
 * Entscheidungen trifft.
 */

export interface KostenSaetze {
  /** Kosten je Facharbeiterstunde — NICHT der Verrechnungssatz. */
  fach: number;
  /** Kosten je Helferstunde. */
  helper: number;
}

export interface Nachkalkulation {
  projectNumber: string;
  customerName: string;
  /** Geleistete Facharbeiterstunden. */
  fachStunden: number;
  /** Geleistete Helferstunden. */
  helferStunden: number;
  /** Personalkosten aus den geleisteten Stunden. */
  personalkosten: number;
  /** Erlös netto — aus Rechnungen, sonst aus dem Angebot. */
  erloes: number;
  /** Woher der Erlös stammt: verrechnet oder erst kalkuliert. */
  erloesQuelle: 'Rechnungen' | 'Angebot' | 'unbekannt';
  /** Erlös minus Personalkosten. VOR Material und Gemeinkosten. */
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
): Nachkalkulation {
  const pn = normProjectNumber(projectNumber);

  let fachMin = 0;
  let helferMin = 0;
  for (const e of entries) {
    if (e.status !== 'Anwesend') continue;
    if (normProjectNumber(e.projectNumber ?? '') !== pn) continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    if (e.isHelper) helferMin += min;
    else fachMin += min;
  }

  const fachStunden = Math.round((fachMin / 60) * 100) / 100;
  const helferStunden = Math.round((helferMin / 60) * 100) / 100;
  const personalkosten =
    Math.round((fachStunden * kosten.fach + helferStunden * kosten.helper) * 100) / 100;

  const eigene = invoices.filter(
    (i) => normProjectNumber(i.projectNumber) === pn && i.paymentStatus !== 'Storniert',
  );
  let erloes = 0;
  let erloesQuelle: Nachkalkulation['erloesQuelle'] = 'unbekannt';
  if (eigene.length > 0) {
    erloes = Math.round(eigene.reduce((s, i) => s + (i.totalNetto ?? 0), 0) * 100) / 100;
    erloesQuelle = 'Rechnungen';
  } else if (quote && quote.status === 'Angenommen') {
    erloes = quote.totalNetto;
    erloesQuelle = 'Angebot';
  }

  const deckungsbeitrag = Math.round((erloes - personalkosten) * 100) / 100;

  return {
    projectNumber,
    customerName,
    fachStunden,
    helferStunden,
    personalkosten,
    erloes,
    erloesQuelle,
    deckungsbeitrag,
    // Ohne bekannten Erlös gibt es keine Marge — nicht null Prozent, sondern
    // keine Aussage. Eine Null hier läse sich wie „nichts verdient".
    margeProzent: erloes > 0 ? Math.round((deckungsbeitrag / erloes) * 1000) / 10 : null,
  };
}

/** Ampel für den Deckungsbeitrag. */
export function margenTon(k: Nachkalkulation): 'success' | 'warning' | 'danger' | 'gray' {
  if (k.erloesQuelle === 'unbekannt') return 'gray';
  if (k.deckungsbeitrag < 0) return 'danger';
  // Unter zwanzig Prozent bleibt nach Material und Gemeinkosten
  // erfahrungsgemäß nichts übrig — das ist eine Warnung wert, auch wenn die
  // Zahl formal positiv ist.
  if ((k.margeProzent ?? 0) < 20) return 'warning';
  return 'success';
}
