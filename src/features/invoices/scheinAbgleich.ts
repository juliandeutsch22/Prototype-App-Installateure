import type { TimeEntry, WorkSheet } from '@/types';
import { calcWorkMin, normProjectNumber } from '@/lib/time';
import { normName } from './materialPositionen';

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
  /**
   * Um wie viel die Rechnung UNTER den noch nicht verrechneten Scheinen liegt
   * — 0, wenn sie es nicht tut oder keine offenen Scheine bekannt sind.
   */
  wenigerMin: number;
  /** Ob das gross genug ist, um zu warnen. */
  zuWenig: boolean;
  /**
   * Unterschriebene Stunden, die auf dieser Rechnung fehlen — je Person, Tag
   * und Satz. Leer, wenn alles da ist oder keine offenen Scheine bekannt sind.
   */
  fehlend: FehlendeStunden[];
}

export interface FehlendeStunden {
  datum: string;
  /** So, wie er auf dem Schein steht. */
  name: string;
  helfer: boolean;
  bestaetigtMin: number;
  /** Was diese Rechnung für Person, Tag und Satz verrechnet. */
  verrechnetMin: number;
  /** Was sie für dieselbe Person am selben Tag zum ANDEREN Satz verrechnet. */
  andererSatzMin: number;
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
/*
 * DIE GEGENRICHTUNG — WENIGER VERRECHNET, ALS UNTERSCHRIEBEN IST.
 *
 * Gefunden beim Probelauf: Schein über acht Stunden unterschrieben, die Zeit
 * aber noch nicht gebucht (der Nachtrag lag beim Monteur). Die Rechnung nahm
 * null Stunden, der Abgleich stand in unauffälligem Grau darüber, und die
 * Rechnung ging mit Material und ohne Arbeit hinaus. Verloren ist die Zeit
 * nicht — gebucht kommt sie auf die nächste Rechnung —, aber der Kunde
 * bekommt zwei Rechnungen für einen Einsatz, und die zweite erklärt sich
 * nicht von selbst.
 *
 * HIER ZÄHLEN NUR SCHEINE, DIE NOCH AUF KEINER RECHNUNG STEHEN (`offen`).
 * Mit allen Scheinen der Baustelle schlüge jede Folgerechnung Alarm: die
 * Stunden der ersten sind verrechnet, ihr Schein zählte aber weiter mit. Für
 * die Richtung „mehr" bleibt es bei allen — das ist die ältere, vorsichtige
 * Zusage, und sie wird hier nicht angefasst.
 *
 * Dieselben Schwellen wie oben, aus demselben Grund.
 */
export function scheinAbgleich(
  projectNumber: string,
  /** Die Einträge, die in diese Rechnung eingehen — aus `assembleInvoice`. */
  eintraege: TimeEntry[],
  scheine: Array<WorkSheet & { id: string }>,
  /** Kennungen der unterschriebenen Scheine, die auf keiner Rechnung stehen. */
  offen?: ReadonlySet<string>,
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

  const offenBestaetigtMin = offen
    ? eigene
        .filter((schein) => offen.has(schein.id))
        .reduce(
          (s, schein) => s + (schein.zeiten ?? []).reduce((z, zeile) => z + Math.max(zeile.minuten, 0), 0),
          0,
        )
    : 0;
  const wenigerMin = Math.max(offenBestaetigtMin - verrechnetMin, 0);

  /*
    JE PERSON, TAG UND SATZ — NICHT NUR DIE SUMME.

    Die Summe allein deckte im Prüflauf vom 24.09.2026 einen echten Verlust
    zu: acht unterschriebene Facharbeiterstunden vom 24. standen nicht auf der
    Rechnung, acht gebuchte Helferstunden vom 21. aber schon — „Ein Schein
    bestätigt 08:00, verrechnet werden 08:00", und 128 € netto fehlten. Der
    Schein ist die Unterschrift des Kunden für genau diese Person an genau
    diesem Tag; daran wird jetzt gemessen.

    Verglichen wird nur gegen OFFENE Scheine, aus demselben Grund wie oben:
    was schon auf einer Rechnung steht, fehlt auf dieser nicht. Die Namen
    werden so angeglichen wie beim Nachtrag (`normName`) — der Schein trägt
    den Namen, die Buchung den Namen des Kontos.
  */
  const schluessel = (datum: string, name: string, helfer: boolean) =>
    `${datum}|${normName(name)}|${helfer ? 'h' : 'f'}`;
  const verrechnetJe = new Map<string, number>();
  for (const e of eintraege) {
    const k = schluessel(e.date, e.userName ?? '', !!e.isHelper);
    verrechnetJe.set(k, (verrechnetJe.get(k) ?? 0) + Math.max(calcWorkMin(e), 0));
  }
  const bestaetigtJe = new Map<string, { datum: string; name: string; helfer: boolean; min: number }>();
  for (const schein of eigene) {
    if (!offen?.has(schein.id)) continue;
    for (const z of schein.zeiten ?? []) {
      if (z.minuten <= 0 || !normName(z.mitarbeiter)) continue;
      const datum = z.datum || schein.datum;
      const k = schluessel(datum, z.mitarbeiter, !!z.helfer);
      const bisher = bestaetigtJe.get(k);
      if (bisher) bisher.min += z.minuten;
      else bestaetigtJe.set(k, { datum, name: z.mitarbeiter.trim(), helfer: !!z.helfer, min: z.minuten });
    }
  }
  const fehlend: FehlendeStunden[] = [];
  for (const [k, b] of bestaetigtJe) {
    const verrechnet = verrechnetJe.get(k) ?? 0;
    const fehlt = b.min - verrechnet;
    if (fehlt < AUFFAELLIG_AB_MINUTEN || fehlt < b.min * AUFFAELLIG_AB_ANTEIL) continue;
    fehlend.push({
      datum: b.datum,
      name: b.name,
      helfer: b.helfer,
      bestaetigtMin: b.min,
      verrechnetMin: verrechnet,
      andererSatzMin: verrechnetJe.get(schluessel(b.datum, b.name, !b.helfer)) ?? 0,
    });
  }
  fehlend.sort((a, b) => a.datum.localeCompare(b.datum) || a.name.localeCompare(b.name, 'de'));

  return {
    fehlend,
    verrechnetMin,
    bestaetigtMin,
    scheine: eigene.length,
    mehrMin,
    auffaellig:
      bestaetigtMin > 0 &&
      mehrMin >= AUFFAELLIG_AB_MINUTEN &&
      mehrMin >= bestaetigtMin * AUFFAELLIG_AB_ANTEIL,
    wenigerMin,
    zuWenig:
      wenigerMin >= AUFFAELLIG_AB_MINUTEN && wenigerMin >= offenBestaetigtMin * AUFFAELLIG_AB_ANTEIL,
  };
}
