
/**
 * Module: welche Teile der App ein Betrieb überhaupt benutzt.
 *
 * WOZU. Die App ist über die Zeit auf siebzehn Bereiche gewachsen. Ein Betrieb
 * braucht selten alle: wer extern fakturiert, will keine Rechnungen sehen; wer
 * kein Lager führt, keine Materialanforderung; wer die Einteilung telefonisch
 * macht, keine Einsatzplanung. Jeder ungenutzte Bereich ist ein Eintrag in der
 * Navigation, eine Frage im Kopf und eine Stelle, an der etwas kaputtgehen
 * kann, ohne dass es jemand merkt.
 *
 * WAS EIN MODUL NICHT IST — und das ist der wichtigste Satz hier:
 *
 *   EIN ABGESCHALTETES MODUL IST KEINE SICHERHEITSGRENZE.
 *
 * Es nimmt den Weg weg, nicht das Recht. Wer als Buchhaltung Rechnungen
 * anlegen darf, darf das weiterhin — die Oberfläche bietet es nur nicht mehr
 * an, und die Route ist zu. Serverseitig durchzusetzen wäre möglich, kostete
 * aber bei JEDEM Schreibvorgang eine zusätzliche Leseoperation auf das
 * Firmendokument, und der Gewinn wäre gering: die Rolle darf es ja ohnehin.
 * Was sehr wohl serverseitig geschützt ist, ist die Modulliste SELBST —
 * sonst schaltete sich ein Monteur frei, was er will (Trigger
 * `companies_einstellungen`).
 *
 * Wer diesen Unterschied nicht kennt, hält Module für Rechteverwaltung. Die
 * steht woanders: in den Rollen und im Zeilenschutz.
 */

export type ModulId =
  | 'einsatzplanung'
  | 'material'
  | 'urlaub'
  | 'scheine'
  | 'angebote'
  | 'rechnungen'
  | 'nachkalkulation'
  | 'wartung'
  | 'zeitkonten';

export interface Modul {
  id: ModulId;
  name: string;
  /** Ein Satz: was der Betrieb damit tut. */
  zweck: string;
  /** An oder aus, solange nichts festgelegt ist. */
  standard: boolean;
  /**
   * Module, ohne die dieses nicht sinnvoll läuft.
   *
   * Die Nachkalkulation braucht einen Erlös, und der kommt aus den
   * Rechnungen. Ohne sie zeigte sie für jede Baustelle „keine Aussage" — eine
   * Ansicht, die nur mitteilt, dass sie nichts mitteilen kann.
   */
  abhaengigVon?: ModulId[];
  /** Was in der Navigation verschwindet — für die Anzeige im Panel. */
  betrifft: string[];
}

/**
 * Der Kern steht bewusst NICHT in dieser Liste.
 *
 * Startseite, Zeiterfassung, Kunden, Baustellen, Benutzer und Einstellungen
 * sind nicht abschaltbar. Eine Handwerker-App ohne Zeiterfassung ist keine
 * App mehr, und ohne Baustellen hätten die übrigen Module nichts, worauf sie
 * sich beziehen. Ein Schalter, mit dem man die Anlage unbenutzbar macht, ist
 * kein Freiheitsgrad, sondern eine Falle.
 */
export const MODULE: Modul[] = [
  {
    id: 'einsatzplanung',
    name: 'Einsatzplanung',
    zweck: 'Wer ist an welchem Tag auf welcher Baustelle.',
    standard: true,
    betrifft: ['Einsatzplanung', 'Wochenplan', 'Mein Einsatzplan'],
  },
  {
    id: 'material',
    name: 'Material und Lager',
    zweck: 'Anforderungen vom Monteur, Bearbeitung im Büro, Lagerstand.',
    standard: true,
    betrifft: ['Material bestellen', 'Anforderungen', 'Lager'],
  },
  {
    id: 'urlaub',
    name: 'Urlaub',
    zweck: 'Antrag, Genehmigung, Eintrag ins Zeitkonto.',
    standard: true,
    betrifft: ['Urlaub'],
  },
  {
    id: 'scheine',
    name: 'Handwerksscheine',
    zweck: 'Leistung vor Ort bestätigen lassen, unterschreiben, einfrieren.',
    standard: true,
    betrifft: ['Handwerksscheine'],
  },
  {
    id: 'angebote',
    name: 'Angebote',
    zweck: 'Kalkulieren und beim Annehmen die Baustelle mit Stundenbudget anlegen.',
    standard: true,
    betrifft: ['Angebote'],
  },
  {
    id: 'rechnungen',
    name: 'Rechnungen',
    zweck: 'Aus der Baustelle verrechnen, Nummernkreis, Buchhaltungs-Export.',
    standard: true,
    betrifft: ['Rechnungen'],
  },
  {
    id: 'nachkalkulation',
    name: 'Nachkalkulation',
    zweck: 'Erlös gegen Personalkosten — hat die Baustelle Geld verdient?',
    standard: true,
    abhaengigVon: ['rechnungen'],
    betrifft: ['Nachkalkulation'],
  },
  {
    id: 'wartung',
    name: 'Wiederkehrende Wartungen',
    zweck: 'Wartungsvereinbarungen führen und sehen, was fällig wird.',
    /*
      EINGESCHALTET, obwohl neu.

      Die jährliche Thermenwartung ist bei einem Installateur kein Zusatz,
      sondern der planbare Teil des Jahres. Ein Bereich, den man erst finden
      muss, um ihn einzuschalten, wird nicht gefunden — und ein Betrieb, der
      keine Wartungen führt, sieht eine leere Liste und schaltet sie in zwei
      Klicks ab. Das ist die billigere der beiden Fehlannahmen.
    */
    standard: true,
    betrifft: ['Wartungen'],
  },
  {
    id: 'zeitkonten',
    name: 'Zeitkonten und Auswertung',
    zweck: 'Salden aller Mitarbeiter, Monatsexport, Stundennachweis.',
    standard: true,
    betrifft: ['Mitarbeiterübersicht'],
  },
];

const NACH_ID = new Map(MODULE.map((m) => [m.id, m]));

/*
  HIER STAND EIN DRITTER ZUSTAND: „technisch nicht eingerichtet".

  Er hatte genau einen Nutzer, die KI-Spracherfassung — sie brauchte
  hinterlegte Zugänge zu zwei fremden Diensten, und ohne sie führte der
  Schalter nur in eine Fehlermeldung. Mit ihr ist er am 19.09. gefallen.

  ERSATZLOS UND NICHT VORSORGLICH STEHENGELASSEN. Ein Mechanismus, den kein
  Modul mehr benutzt, lässt sich nicht prüfen; die Oberfläche dazu („nicht
  eingerichtet", der gesperrte Schalter, der erklärende Satz) wäre eine
  Zusage, für die niemand mehr geradesteht. Braucht ein künftiges Modul eine
  Voraussetzung, sind es fünf Zeilen — und dann wieder mit einer Prüfung.
*/

/**
 * Welche Module gelten tatsächlich?
 *
 * Drei Stufen, in dieser Reihenfolge:
 *
 *   1. der Standard des Moduls
 *   2. die Festlegung des Betriebs (nur die Abweichungen sind gespeichert)
 *   3. die Wirklichkeit: fehlt eine Abhängigkeit, ist es aus — egal was
 *      jemand eingestellt hat
 *
 * Stufe 3 ist der Grund, warum es diese Funktion gibt und nicht nur ein
 * Nachschlagen im Firmendokument. Wer die Rechnungen abschaltet und die
 * Nachkalkulation angeschaltet lässt, bekäme sonst eine Ansicht, die für jede
 * Baustelle „keine Aussage" meldet — technisch fehlerfrei und trotzdem
 * kaputt.
 */
export function aktiveModule(festlegung: Record<string, boolean> | undefined): Set<ModulId> {
  const an = new Set<ModulId>();
  for (const m of MODULE) {
    const gewollt = festlegung?.[m.id] ?? m.standard;
    if (gewollt) an.add(m.id);
  }

  /**
   * Abhängigkeiten so lange nachziehen, bis sich nichts mehr ändert.
   *
   * Eine einzelne Runde genügte für die heutige Kette (Nachkalkulation ->
   * Rechnungen), aber nicht für eine, die später zwei Stufen tief wird. Die
   * Schleife kostet nichts und hält, wenn jemand ein Modul ergänzt.
   */
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const m of MODULE) {
      if (!an.has(m.id)) continue;
      if (m.abhaengigVon?.some((d) => !an.has(d))) {
        an.delete(m.id);
        geaendert = true;
      }
    }
  }
  return an;
}

/**
 * Welche Module gingen mit, wenn man dieses abschaltet?
 *
 * Für die Rückfrage im Panel. Jemandem die Rechnungen abschalten zu lassen
 * und ihm erst hinterher zu zeigen, dass die Nachkalkulation mit verschwunden
 * ist, wäre eine Überraschung — und Überraschungen sind bei Einstellungen das
 * Gegenteil von Kontrolle.
 */
export function zieheMit(id: ModulId, festlegung: Record<string, boolean> | undefined): ModulId[] {
  const vorher = aktiveModule(festlegung);
  if (!vorher.has(id)) return [];
  const nachher = aktiveModule({ ...(festlegung ?? {}), [id]: false });
  return [...vorher].filter((m) => m !== id && !nachher.has(m));
}

/** Ein Modul nachschlagen. */
export function modul(id: ModulId): Modul | undefined {
  return NACH_ID.get(id);
}
