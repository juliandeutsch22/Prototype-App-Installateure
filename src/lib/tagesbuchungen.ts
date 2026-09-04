import type { TimeEntry } from '@/types';
import { normProjectNumber } from './time';

/**
 * Darf an einem Tag noch eine weitere Zeit gebucht werden?
 *
 * WARUM ES DIESE REGEL GIBT. Bis hierher war je Mitarbeiter und Tag genau
 * EIN Eintrag erlaubt — geprüft über `(userId, date)`, ohne die Baustelle.
 * Das stand im Widerspruch zum Rest der App: die Einsatzplanung teilt einen
 * Monteur ausdrücklich auf mehrere Baustellen am selben Tag ein, die
 * Startseite zeigt sie ihm auch alle, und ein Monteur klappert an einem Tag
 * durchaus drei kleine Baustellen ab. Buchen konnte er davon genau eine.
 *
 * Die Folgen trafen die Stellen, an denen es Geld kostet: die übrigen
 * Baustellen bekamen keine Stunden — kein Budgetverbrauch, ein leerer
 * Handwerksschein, eine fehlende Rechnungsposition. Und der Monteur hatte
 * keinen Ausweg.
 *
 * WAS DIE ALTE SPERRE RICHTIG MACHTE und was hier erhalten bleibt: zwei
 * Buchungen für DENSELBEN Einsatz zählen doppelt in den Stundensaldo und
 * wandern von dort auf den Lohnzettel. Falsch war nur die Reichweite. Die
 * Regel geht deshalb jetzt über das Tripel aus Mitarbeiter, Tag und
 * BAUSTELLE.
 *
 * WIE SICH DIE STUNDEN DANACH SUMMIEREN — nachgesehen, nicht angenommen:
 *
 *   `calcOverallSaldo`      addiert `calcWorkMin` je Eintrag und merkt sich
 *                           die gebuchten TAGE in einem Set. Drei Einträge
 *                           an einem Tag ergeben also die Summe der drei
 *                           Zeiten und EINEN gebuchten Tag. Richtig.
 *   `calcMonthStats`        ebenso; das Soll kommt aus `pflichtTage` und
 *                           hängt nicht an der Zahl der Einträge.
 *   `bilanzAusEintraegen`   ebenso, mit `tage` als Set.
 *
 * GENAU DESHALB BLEIBEN KRANK UND URLAUB EINZELN. Diese drei Stellen zählen
 * sie als GANZE TAGE, je Eintrag einen. Ein zweiter Urlaubseintrag am selben
 * Tag wäre damit ein zweiter Urlaubstag — im Saldo, im Monatsbericht und im
 * Resturlaub. Das ist der Fehler, den die alte Sperre eigentlich verhindern
 * sollte, und er bleibt verhindert.
 */

/** Was von einem Eintrag für die Prüfung zählt. */
export interface Tagesbuchung {
  status: TimeEntry['status'];
  projectNumber?: string;
}

/** Ganztägige Status: davon gibt es je Tag genau einen oder keinen. */
function istGanztags(status: TimeEntry['status']): boolean {
  return status === 'Krank' || status === 'Urlaub';
}

/**
 * Der Grund, warum diese Buchung nicht dazu darf — oder `null`, wenn sie darf.
 *
 * Ein TEXT statt eines Wahrheitswerts, weil die vier Fälle verschiedene
 * Handlungen verlangen: einmal den bestehenden Eintrag bearbeiten, einmal
 * eine Baustelle wählen, einmal den ganzen Tag anders erfassen. Ein
 * gemeinsames „geht nicht" ließe den Monteur raten.
 */
export function buchungKonflikt(
  neu: Tagesbuchung,
  vorhandene: Tagesbuchung[],
): string | null {
  if (vorhandene.length === 0) return null;

  const ganztags = vorhandene.find((v) => istGanztags(v.status));
  if (ganztags) {
    return `Für diesen Tag ist bereits „${ganztags.status}" eingetragen. ${ganztags.status} gilt für den ganzen Tag — zum Ändern bitte den bestehenden Eintrag bearbeiten.`;
  }

  if (istGanztags(neu.status)) {
    return `Für diesen Tag sind bereits Arbeitszeiten gebucht. „${neu.status}" gilt für den ganzen Tag — dafür müssen die gebuchten Zeiten zuerst gelöscht werden.`;
  }

  /*
    OHNE BAUSTELLE KEINE ZWEITE BUCHUNG. Zwei Einträge ohne Baustelle sind
    nicht auseinanderzuhalten — weder für den Monteur noch für die
    Buchhaltung. Es ist der Fall, in dem eine Doppelbuchung am ehesten
    unbemerkt bliebe, und genau ihn hat die alte Sperre verhindert.
  */
  const nummer = normProjectNumber(neu.projectNumber);
  if (!nummer) {
    return 'Für diesen Tag ist bereits gebucht. Eine weitere Buchung braucht eine Baustelle — sonst lassen sich die beiden Einträge nicht auseinanderhalten.';
  }

  const gleiche = vorhandene.some((v) => normProjectNumber(v.projectNumber) === nummer);
  if (gleiche) {
    return 'Für diese Baustelle ist an diesem Tag bereits gebucht. Bitte den bestehenden Eintrag bearbeiten, statt ihn ein zweites Mal anzulegen.';
  }

  return null;
}

/**
 * An welchen Tagen steht DIESELBE Baustelle mehrfach — der Fall, der den
 * Saldo verfälscht.
 *
 * Die Zeitübersicht warnte bisher bei JEDEM Tag mit mehr als einem Eintrag.
 * Ab jetzt wäre das die Mehrzahl der normalen Tage eines Monteurs, der
 * mehrere Baustellen abklappert — eine Warnung, die täglich grundlos
 * erscheint, wird nach einer Woche nicht mehr gelesen, auch dann nicht,
 * wenn sie einmal recht hat.
 */
export function tageMitEchterDoppelung(
  entries: Array<{ date: string; status: TimeEntry['status']; projectNumber?: string }>,
): Set<string> {
  const gesehen = new Map<string, Set<string>>();
  const doppelt = new Set<string>();
  for (const e of entries) {
    // Ganztägige Status haben keine Baustelle; für sie ist jeder zweite
    // Eintrag am selben Tag eine Doppelung, egal was daneben steht.
    const schluessel = istGanztags(e.status) ? ' ganztags' : normProjectNumber(e.projectNumber);
    const proTag = gesehen.get(e.date) ?? new Set<string>();
    if (proTag.has(schluessel)) doppelt.add(e.date);
    proTag.add(schluessel);
    gesehen.set(e.date, proTag);
  }
  return doppelt;
}
