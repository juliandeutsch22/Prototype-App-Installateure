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

/**
 * Die Spanne in Minuten ab Mitternacht des Buchungstags — oder `null`.
 *
 * Endet sie vor ihrem Beginn, ging sie über Mitternacht und reicht in den
 * nächsten Tag (so rechnet auch `calcWorkMin`). Beginn gleich Ende ist keine
 * Spanne.
 */
function spanne(e: Tagesbuchung): [number, number] | null {
  const von = minuten(e.startTime);
  const bis = minuten(e.endTime);
  if (von === null || bis === null || von === bis) return null;
  return [von, bis > von ? bis : bis + 24 * 60];
}

/** Überschneiden sich zwei Zeitspannen desselben Tages — auch über Mitternacht? */
function ueberschneiden(a: Tagesbuchung, b: Tagesbuchung): boolean {
  const x = spanne(a);
  const y = spanne(b);
  if (!x || !y) return false;
  return x[0] < y[1] && y[0] < x[1];
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
    ZWEI ARBEITSZEITEN ZUR SELBEN STUNDE zählen doppelt, auch auf zwei
    verschiedenen Baustellen (Launch-Check 25.09., K1). Dieselbe Regel steht
    in der Datenbank; dort sieht sie auch den Vortag, dessen Nachtschicht in
    diesen Tag reicht. Hier steht sie, damit die Maske es sagt, bevor
    gespeichert wird.
  */
  const quer = arbeit.find((v) => ueberschneiden(neu, v));
  if (quer) {
    const wo = normProjectNumber(quer.projectNumber);
    return `Die Zeit überschneidet sich mit ${quer.startTime?.slice(0, 5)}–${quer.endTime?.slice(0, 5)}${wo ? ` (${quer.projectNumber})` : ''} an diesem Tag. Zwei Zeiten zur selben Stunde zählen doppelt — bitte eine davon anpassen.`;
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

  /*
    DIESELBE BAUSTELLE ZWEIMAL geht, wenn beide Zeiten eine Uhrzeit tragen und
    sich nicht überschneiden — der geteilte Dienst, vormittags gearbeitet und
    abends zum Notdienst zurück (Launch-Check, M3). Die Überschneidung ist
    oben schon ausgeschlossen. Ohne Uhrzeit bleibt es bei einem Eintrag: dann
    lässt sich eine zweite Buchung von einer doppelten nicht unterscheiden.
  */
  const gleiche = arbeit.some(
    (v) => normProjectNumber(v.projectNumber) === nummer && !(spanne(neu) && spanne(v)),
  );
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
  const proTag = new Map<string, Array<Tagesbuchung>>();
  const doppelt = new Set<string>();
  for (const e of entries) {
    const bisher = proTag.get(e.date) ?? [];
    if (bisher.some((v) => doppeltMit(e, v))) doppelt.add(e.date);
    bisher.push(e);
    proTag.set(e.date, bisher);
  }
  return doppelt;
}

/**
 * Zählen zwei Einträge desselben Tages dieselbe Zeit zweimal?
 *
 * Ganztägige Status: sie stehen allein am Tag — JEDER Eintrag daneben ist
 * eine Doppelung, auch gearbeitete Zeit (ein Krankentag mit acht Stunden
 * Arbeit zählte beides). Bis zum Prüflauf vom 25.09.2026 (P1-17) warnte die
 * Übersicht nur bei zwei ganztägigen; dieselbe Regel wie `buchungKonflikt`
 * steht seitdem auch in der Datenbank. Stundenweiser Zeitausgleich: einer je
 * Tag. Arbeit: zur selben Stunde (seit dem Launch-Check auch über Baustellen
 * hinweg), oder dieselbe Baustelle, ohne dass beide eine Uhrzeit tragen. Der
 * geteilte Dienst — dieselbe Baustelle vormittags und abends — ist keine
 * Doppelung.
 */
function doppeltMit(a: Tagesbuchung, b: Tagesbuchung): boolean {
  if (istGanztags(a) || istGanztags(b)) return true;
  const zaA = a.status === 'Zeitausgleich';
  const zaB = b.status === 'Zeitausgleich';
  if (zaA || zaB) return zaA && zaB;
  if (ueberschneiden(a, b)) return true;
  return (
    normProjectNumber(a.projectNumber) === normProjectNumber(b.projectNumber) &&
    !(spanne(a) && spanne(b))
  );
}
