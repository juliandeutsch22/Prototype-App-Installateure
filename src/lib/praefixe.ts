/**
 * Die Vorsätze, die ein Betrieb selbst festlegt — und warum es sie gibt.
 *
 * VORGEFUNDEN WURDEN VIER FEST VERDRAHTETE ZEICHENFOLGEN, verstreut über
 * sechs Dateien:
 *
 *   `RE-`  Rechnungen — in `invoiceNumbers.ts` UND in `db/pg/invoices.ts`
 *   `AN-`  Angebote   — in `db/pg/quotes.ts` UND in `db/fs/quotes.ts`
 *   `B-`   Baustellen — nirgends vergeben, nur in `QuotesView` aus `AN-`
 *                       ersetzt; getippt wird sie von Hand
 *   `WZ-`  Kennzeichen — DREIFACH in `TimeForm.tsx`: als Konstante, als
 *                       Regel zum Abziehen (ein Ausdruck, der genau W, Z
 *                       und den Trennstrich sucht) und als sichtbare
 *                       Beschriftung am Feld
 *
 * DAS KENNZEICHEN IST DER SCHLIMMSTE FALL, und er ist derselbe wie beim fest
 * verdrahteten Firmenlogo: `WZ` ist der Bezirkskenner eines bestimmten
 * Bezirks. Ein zweiter Betrieb hätte ihn auf JEDEM Zeiteintrag stehen gehabt,
 * ohne Möglichkeit, ihn loszuwerden — und die Zahl wandert in den Lohnexport.
 *
 * DIE VORSÄTZE GELTEN AB JETZT, NICHT RÜCKWIRKEND. Eine ausgestellte Rechnung
 * behält ihre Nummer; `app.rechnung_eingefroren` lässt sie ohnehin nicht mehr
 * ändern (§ 132 BAO). Deshalb rechnet `belegNummer` nur für NEUE Nummern, und
 * das Auslesen der laufenden Nummer (`invoiceSeqOf`) liest die Ziffern am
 * Ende, nicht den Vorsatz — ein Betrieb, der mitten im Jahr wechselt, hat
 * einen lückenlosen Zahlenkreis in zwei Schreibweisen, und genau der muss
 * weiter durchzählen.
 */
import type { Company } from '@/types';

/**
 * Was ein Vorsatz tragen darf.
 *
 * NUR GROSSBUCHSTABEN, ZIFFERN UND TRENNSTRICH, und das ist keine Ziererei:
 * der Vorsatz landet im Dateinamen des Rechnungs-PDFs, in der CSV für die
 * Buchhaltung und von dort in der Software des Steuerberaters. Ein Leerzeichen
 * oder ein Umlaut fällt erst dort auf, und dann ist der Beleg schon draussen.
 *
 * LEER IST ERLAUBT. Ein Betrieb, der ohne Vorsatz zählt („2026-1001"), soll
 * das können; `belegNummer` lässt den Trennstrich dann weg, statt eine Nummer
 * zu bauen, die mit einem Strich anfängt.
 */
export const PRAEFIX_MUSTER = /^[A-Z0-9-]{0,6}$/;

/** Sechs Zeichen — darüber wird die Nummer auf dem Beleg zur Zeile. */
export const PRAEFIX_MAX = 6;

/** Welche Vorsätze ein Betrieb führt. */
export interface Praefixe {
  rechnung: string;
  angebot: string;
  baustelle: string;
  /** Der Bezirkskenner des Fuhrparks, z. B. `WZ` — ohne Trennstrich. */
  kennzeichen: string;
}

/**
 * Was gilt, solange der Betrieb nichts festgelegt hat.
 *
 * DREI BELEGVORSÄTZE HABEN EINE VORGABE, DAS KENNZEICHEN NICHT. Bei den
 * Belegen ist die Vorgabe die, die bisher fest im Code stand — bestehende
 * Nummernkreise laufen damit unverändert weiter. Beim Kennzeichen wäre eine
 * Vorgabe dagegen genau der Fehler, der hier behoben wird: sie stempelte
 * jedem neuen Betrieb einen fremden Bezirk auf.
 */
export const PRAEFIX_VORGABE: Praefixe = {
  rechnung: 'RE',
  angebot: 'AN',
  baustelle: 'B',
  kennzeichen: '',
};

/**
 * Die Vorsätze eines Betriebs, mit den Vorgaben aufgefüllt.
 *
 * `undefined` heisst „nicht festgelegt" und fällt auf die Vorgabe zurück;
 * eine leere Zeichenfolge heisst „ausdrücklich keiner" und bleibt leer. Der
 * Unterschied zählt: sonst könnte ein Betrieb den Vorsatz nie loswerden.
 */
export function praefixeVon(betrieb: Company | null | undefined): Praefixe {
  return {
    rechnung: betrieb?.praefixRechnung ?? PRAEFIX_VORGABE.rechnung,
    angebot: betrieb?.praefixAngebot ?? PRAEFIX_VORGABE.angebot,
    baustelle: betrieb?.praefixBaustelle ?? PRAEFIX_VORGABE.baustelle,
    kennzeichen: betrieb?.praefixKennzeichen ?? PRAEFIX_VORGABE.kennzeichen,
  };
}

/**
 * Ein getippter Wert, wie er gespeichert wird.
 *
 * GEPUTZT WIRD BEIM TIPPEN, NICHT ERST BEIM PRÜFEN. Wer „re-" eintippt, meint
 * `RE`; wer aus der Zwischenablage „RE-2026-1001" einfügt, meint `RE`. Beides
 * als Fehler abzuweisen wäre formal richtig und im Betrieb lästig.
 */
export function praefixPutzen(roh: string): string {
  return roh
    .toUpperCase()
    // Alles ab der ersten Ziffernfolge mit vier Stellen weg — das ist schon
    // die Jahreszahl einer eingefügten Nummer und nicht mehr der Vorsatz.
    .replace(/-?\d{4}.*$/, '')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, PRAEFIX_MAX);
}

/** Was an diesem Vorsatz nicht geht — `null`, wenn er in Ordnung ist. */
export function praefixFehler(wert: string): string | null {
  if (wert.length > PRAEFIX_MAX) return `Höchstens ${PRAEFIX_MAX} Zeichen.`;
  if (!PRAEFIX_MUSTER.test(wert)) {
    return 'Nur Großbuchstaben, Ziffern und Bindestrich — der Vorsatz steht im Dateinamen des PDFs.';
  }
  return null;
}

/**
 * Eine Belegnummer: `RE-2026-1001`, ohne Vorsatz `2026-1001`.
 *
 * Die Jahreszahl und die vierstellige laufende Nummer sind NICHT einstellbar.
 * Das wäre die nächste Stufe und hat ihren Preis: Lückenprüfung im
 * Buchhaltungsexport, Sortierung und Nummernvergabe müssten dann jede Form
 * beherrschen. Solange niemand danach fragt, ist ein Format, das alle
 * beherrschen, mehr wert als eines, das alles kann.
 */
export function belegNummer(praefix: string, jahr: number, lfd: number): string {
  const zahl = `${jahr}-${String(lfd).padStart(4, '0')}`;
  return praefix ? `${praefix}-${zahl}` : zahl;
}

/**
 * Das Kennzeichen ohne seinen Vorsatz — das, was ins Feld gehört.
 *
 * ZWEI FÄLLE, DIE BEIDE VORKOMMEN: jemand tippt nur den Rest („12345A"), oder
 * er fügt das ganze Kennzeichen ein („WZ-12345A"). Ohne diese Zeile stünde im
 * zweiten Fall „WZ-WZ-12345A" im Zeiteintrag und damit im Lohnexport.
 *
 * OHNE FESTGELEGTEN VORSATZ wird nichts abgezogen: dann trägt das Feld das
 * vollständige Kennzeichen, und jeder Betrieb ohne einheitlichen Fuhrpark
 * kommt damit zurecht.
 */
export function ohneKennzeichenVorsatz(wert: string, praefix: string): string {
  const gross = wert.toUpperCase();
  if (!praefix) return gross.trimStart();
  /*
    Buchstabe für Buchstabe mit erlaubten Leerzeichen dazwischen: getippt wird
    das auf einer Telefontastatur, und dort rutscht ein Leerzeichen leicht
    hinein. Der Vorsatz kommt aus der Datenbank, also werden seine
    Sonderzeichen entschärft — `PRAEFIX_MUSTER` lässt den Bindestrich zu, und
    der ist in einem regulären Ausdruck innerhalb einer Klasse nicht harmlos.
  */
  const muster = new RegExp(
    `^\\s*${[...praefix].map((z) => z.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('\\s*')}\\s*-?\\s*`,
  );
  return gross.replace(muster, '').replace(/^-/, '');
}

/** Das vollständige Kennzeichen, wie es gespeichert wird. */
export function mitKennzeichenVorsatz(rest: string, praefix: string): string {
  const sauber = rest.trim();
  if (!sauber) return '';
  return praefix ? `${praefix}-${sauber}` : sauber;
}

/**
 * Die laufende Nummer am Ende einer Belegnummer — ohne Rücksicht auf den Vorsatz.
 *
 * `RE-2026-1042` → 1042, `2026-1042` → 1042, `B-2026-0007` → 7. Gelesen wird
 * die letzte Ziffernfolge, und genau das trägt über einen Wechsel des
 * Vorsatzes hinweg: ein Betrieb, der mitten im Jahr umstellt, hat einen
 * lückenlosen Zahlenkreis in zwei Schreibweisen.
 */
export function lfdNummerVon(nummer: string): number | null {
  const treffer = /(\d+)$/.exec(nummer.trim());
  return treffer ? Number(treffer[1]) : null;
}

/** Die höchste vergebene laufende Nummer, 0 wenn es keine gibt. */
export function hoechsteLfd(nummern: (string | undefined)[]): number {
  let max = 0;
  for (const n of nummern) {
    const lfd = lfdNummerVon(n ?? '');
    if (lfd != null) max = Math.max(max, lfd);
  }
  return max;
}
