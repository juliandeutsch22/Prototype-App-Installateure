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
  /** Nur für Zeitausgleich und Anwesenheit von Belang: stundenweise oder ganztags. */
  startTime?: string;
  endTime?: string;
}

/**
 * Ganztägige Einträge: davon gibt es je Tag genau einen oder keinen.
 *
 * Zeitausgleich OHNE Uhrzeit ist ganztägig wie Urlaub. MIT Uhrzeit ist er
 * ein Teil des Tages — vormittags gearbeitet, nachmittags frei — und darf
 * neben gearbeiteter Zeit stehen. Er zählt null Stunden Ist; doppelt zählen
 * kann er also nicht, und das ist der Grund, warum er hier anders behandelt
 * wird als Urlaub.
 */
function istGanztags(e: Tagesbuchung): boolean {
  return (
    e.status === 'Krank' ||
    e.status === 'Urlaub' ||
    (e.status === 'Zeitausgleich' && !(e.startTime && e.endTime))
  );
}

function minuten(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Überschneiden sich zwei Zeitspannen am selben Tag? Über Mitternacht zählt nicht. */
function ueberschneiden(a: Tagesbuchung, b: Tagesbuchung): boolean {
  const [a1, a2, b1, b2] = [minuten(a.startTime), minuten(a.endTime), minuten(b.startTime), minuten(b.endTime)];
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  if (a2 <= a1 || b2 <= b1) return false;
  return a1 < b2 && b1 < a2;
}

/**
 * Der Grund, warum diese Buchung nicht dazu darf — oder `null`, wenn sie darf.
 *
 * Ein TEXT statt eines Wahrheitswerts, weil die Fälle verschiedene
 * Handlungen verlangen: einmal den bestehenden Eintrag bearbeiten, einmal
 * eine Baustelle wählen, einmal den ganzen Tag anders erfassen. Ein
 * gemeinsames „geht nicht" ließe den Monteur raten.
 */
export function buchungKonflikt(
  neu: Tagesbuchung,
  vorhandene: Tagesbuchung[],
): string | null {
  if (vorhandene.length === 0) return null;

  const ganztags = vorhandene.find(istGanztags);
  if (ganztags) {
    return `Für diesen Tag ist bereits „${ganztags.status}" eingetragen. ${ganztags.status} gilt für den ganzen Tag — zum Ändern bitte den bestehenden Eintrag bearbeiten.`;
  }

  if (istGanztags(neu)) {
    return `Für diesen Tag sind bereits Zeiten gebucht. „${neu.status}" gilt für den ganzen Tag — dafür müssen die gebuchten Zeiten zuerst gelöscht werden.`;
  }

  /*
    STUNDENWEISER ZEITAUSGLEICH: einer je Tag, und nicht über gearbeiteter
    Zeit. „07:00–16:00 gearbeitet, 13:00–17:00 Zeitausgleich" ist ein
    Widerspruch, den später niemand mehr auflöst.
  */
  const za = vorhandene.find((v) => v.status === 'Zeitausgleich');
  if (neu.status === 'Zeitausgleich' && za) {
    return 'Für diesen Tag ist bereits Zeitausgleich eingetragen — bitte den bestehenden Eintrag bearbeiten.';
  }
  // Alles, was hier noch übrig ist und kein Zeitausgleich ist, ist Arbeit —
  // auch ein Eintrag ohne erkennbaren Status. Im Zweifel wie bisher prüfen.
  const arbeit = vorhandene.filter((v) => v.status !== 'Zeitausgleich');
  const gegen = neu.status === 'Zeitausgleich' ? arbeit : za ? [za] : [];
  if (gegen.some((v) => ueberschneiden(neu, v))) {
    return 'Die Zeiten überschneiden sich mit dem Zeitausgleich an diesem Tag.';
  }
  if (neu.status === 'Zeitausgleich') return null;

  // Ab hier zählt nur gearbeitete Zeit: ein Zeitausgleich daneben ist keine
  // zweite Buchung, die man mit dieser verwechseln könnte.
  if (arbeit.length === 0) return null;

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

  const gleiche = arbeit.some((v) => normProjectNumber(v.projectNumber) === nummer);
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
  entries: Array<{ date: string } & Tagesbuchung>,
): Set<string> {
  const gesehen = new Map<string, Set<string>>();
  const doppelt = new Set<string>();
  for (const e of entries) {
    // Ganztägige Status haben keine Baustelle; für sie ist jeder zweite
    // Eintrag am selben Tag eine Doppelung, egal was daneben steht. Ein
    // stundenweiser Zeitausgleich hat seine eigene Stelle: einer je Tag.
    const schluessel = istGanztags(e)
      ? ' ganztags'
      : e.status === 'Zeitausgleich'
        ? ' zeitausgleich'
        : normProjectNumber(e.projectNumber);
    const proTag = gesehen.get(e.date) ?? new Set<string>();
    if (proTag.has(schluessel)) doppelt.add(e.date);
    proTag.add(schluessel);
    gesehen.set(e.date, proTag);
  }
  return doppelt;
}
