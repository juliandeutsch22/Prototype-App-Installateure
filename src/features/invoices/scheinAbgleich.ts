import type { TimeEntry, WorkSheet } from '@/types';
import { calcWorkMin, normProjectNumber } from '@/lib/time';

/**
 * Was die Rechnung verrechnet, gegen das, was der Kunde unterschrieben hat.
 *
 * DER FALL, UM DEN ES GEHT. Die Rechnung nimmt ALLE noch nicht verrechneten
 * Anwesenheitsstunden der Baustelle. Der Kunde hat aber einen Handwerksschein
 * über die Zeit BEI IHM unterschrieben — ohne Anfahrt, ohne Vorbereitung in
 * der Werkstatt, ohne den zweiten Weg zum Grosshändler. Beides darf
 * auseinandergehen, und zwar völlig zu Recht: vorgefertigt wird auf die
 * Baustelle gebucht, und das ist geleistete Arbeit.
 *
 * NUR SAGTE ES NIEMANDEM, wenn die Rechnung deutlich über dem liegt, was auf
 * dem Papier in der Hand des Kunden steht. Das ist die klassische
 * Reklamation — „ich habe für vier Stunden unterschrieben" —, und sie kommt
 * erst, wenn die Rechnung schon draussen ist.
 *
 * WAS HIER AUSDRÜCKLICH NICHT PASSIERT: gekappt wird nichts. Eine Rechnung
 * auf die Scheinstunden zu begrenzen wäre falsch und würde geleistete Arbeit
 * verschenken. Die Zahl wird gezeigt, entschieden wird im Büro — dieselbe
 * Haltung wie bei jedem anderen Befund in dieser App.
 */

export interface ScheinAbgleich {
  /** Stunden, die diese Rechnung verrechnet, in Minuten. */
  verrechnetMin: number;
  /** Stunden, die unterschriebene Scheine dieser Baustelle bestätigen. */
  bestaetigtMin: number;
  /** Wie viele unterschriebene Scheine es zu dieser Baustelle gibt. */
  scheine: number;
  /** Um wie viel die Rechnung darüber liegt — 0, wenn sie es nicht tut. */
  mehrMin: number;
  /** Ob die Abweichung gross genug ist, um zu warnen. */
  auffaellig: boolean;
}

/**
 * Ab wann die Abweichung gemeldet wird.
 *
 * BEIDE BEDINGUNGEN, und jede allein wäre Lärm: ein Viertel mehr als
 * bestätigt ist bei einem Einstundeneinsatz eine Viertelstunde, und eine
 * Stunde mehr ist auf einer Vierzigstundenbaustelle nichts. Erst zusammen
 * beschreiben sie den Fall, über den ein Kunde tatsächlich diskutiert.
 */
export const AUFFAELLIG_AB_MINUTEN = 60;
export const AUFFAELLIG_AB_ANTEIL = 0.25;

/**
 * Der Abgleich für EINE Baustelle.
 *
 * NUR UNTERSCHRIEBENE SCHEINE ZÄHLEN. Ein Entwurf ist noch in Arbeit, ein
 * stornierter zurückgezogen, ein verworfener nie beim Kunden gewesen — keiner
 * von ihnen liegt unterschrieben in einer Kundenmappe, und nur darum geht es
 * hier.
 *
 * OHNE SCHEIN GIBT ES NICHTS ZU VERGLEICHEN. Dann steht `bestaetigtMin` auf
 * null und `auffaellig` auf false: „Sie verrechnen 40 Stunden, bestätigt sind
 * 0" wäre bei jeder Baustelle ohne Schein zu lesen und nach zwei Tagen
 * weggeklickt.
 */
export function scheinAbgleich(
  projectNumber: string,
  /** Die Einträge, die in diese Rechnung eingehen — aus `assembleInvoice`. */
  eintraege: TimeEntry[],
  scheine: Array<WorkSheet & { id: string }>,
): ScheinAbgleich {
  const pn = normProjectNumber(projectNumber);

  const verrechnetMin = eintraege.reduce((s, e) => s + Math.max(calcWorkMin(e), 0), 0);

  const eigene = scheine.filter(
    (s) => s.status === 'Unterschrieben' && normProjectNumber(s.projectNumber) === pn,
  );
  const bestaetigtMin = eigene.reduce(
    (s, schein) => s + (schein.zeiten ?? []).reduce((z, zeile) => z + Math.max(zeile.minuten, 0), 0),
    0,
  );

  const mehrMin = Math.max(verrechnetMin - bestaetigtMin, 0);

  return {
    verrechnetMin,
    bestaetigtMin,
    scheine: eigene.length,
    mehrMin,
    auffaellig:
      bestaetigtMin > 0 &&
      mehrMin >= AUFFAELLIG_AB_MINUTEN &&
      mehrMin >= bestaetigtMin * AUFFAELLIG_AB_ANTEIL,
  };
}
