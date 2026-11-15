import type { Invoice } from '@/types';
import { cent, euro } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';
import { offenerRuecklass, zahlstand } from './zahlstand';
import { skontoZumAusgleich, zugesagterSkonto } from './skonto';
import { mahnkostenVorschlag } from './mahnung';
import type { BankBuchung } from './kontoauszugLesen';

/**
 * DIE EINGÄNGE DES KONTOAUSZUGS DEN RECHNUNGEN ZUORDNEN (F13) — als
 * Vorschlag. Verbucht wird erst, was jemand bestätigt.
 *
 * WORAN ZUGEORDNET WIRD, in dieser Reihenfolge:
 *   1. die Rechnungsnummer im Verwendungszweck — sie steht auf jedem Beleg
 *      („Verwendungszweck: RE-2026-1001 / B-2026-0007“), auch mit Leerzeichen
 *      statt Bindestrich oder ohne Vorsatz;
 *   2. ohne Nummer: Betrag und Name des Kunden — nur als „bitte prüfen“;
 *   3. sonst bleibt der Eingang nicht zugeordnet und sichtbar.
 *
 * WIE AUFGETEILT WIRD — mit denselben Regeln wie der Zahlungsdialog, damit
 * hier nichts angeboten wird, was die Datenbank abweist:
 *   - genau der offene Betrag, oder der Zahlbetrag ohne Rücklass;
 *   - weniger, aber innerhalb der Skontofrist und der Rest nicht mehr als der
 *     zugesagte Skonto: Zahlung und Skonto (`skontoZumAusgleich`);
 *   - weniger sonst: Teilzahlung, der Rest bleibt offen;
 *   - mehr: zuerst die Rechnung, dann bis zur offenen Mahnforderung
 *     Mahnspesen und Zinsen (`mahnkostenVorschlag`); was dann noch bleibt,
 *     wäre Guthaben — das wird nicht vorgewählt.
 *   - mehrere Nummern in einem Zweck (Sammelüberweisung): passt die Summe,
 *     wird jede Rechnung voll ausgeglichen; sonst „bitte prüfen“.
 *
 * DIE EINGÄNGE GREIFEN INEINANDER: zwei Teilzahlungen auf dieselbe Rechnung
 * in derselben Datei sehen den Rest nach der ersten. Gerechnet wird in der
 * Reihenfolge der Buchungstage auf einer Abschrift der Rechnungen.
 */

/** Eine Rechnung mit dem, was der Abgleich zusätzlich wissen muss. */
export type AbgleichRechnung = Pick<Invoice,
  | 'invoiceNumber' | 'customerName' | 'invoiceDate' | 'totalBrutto' | 'bezahltBetrag'
  | 'paymentStatus' | 'skontoProzent' | 'skontoBis' | 'skontoBetrag' | 'ruecklassBetrag' | 'mahnkostenBetrag'
  | 'mahnstufe' | 'mahnspesen'> & {
  id: string;
  /** Was die letzte Mahnung an Spesen und Zinsen fordert (`letzteMahnforderung`) — 0 ohne Mahnung. */
  mahnforderung?: number;
};

/** Ein schon erfasster Eingang — um einen doppelt erfassten zu erkennen. */
export interface ErfassterEingang {
  invoiceId: string;
  datum: string;
  betrag: number;
}

/** Ein Teil der Zuordnung: was auf eine Rechnung geht. */
export interface Teil {
  rechnungId: string;
  /** Auf die Rechnung (Überweisung). */
  betrag: number;
  /** Ausgeglichener Rest als Skonto — kein Geld, nur Ausgleich. */
  skonto: number;
  /** Mahnspesen und Verzugszinsen der letzten Mahnung. */
  mahnkosten: number;
}

/**
 * - `passt`: eindeutig über die Rechnungsnummer — vorgewählt;
 * - `pruefen`: ein Vorschlag, der einen Blick braucht — nicht vorgewählt;
 * - `offen`: nichts gefunden — von Hand zuordnen oder liegen lassen;
 * - `erledigt`: schon verbucht (dieselbe Bewegung) oder schon von Hand erfasst.
 */
export type Stufe = 'passt' | 'pruefen' | 'offen' | 'erledigt';

export interface Vorschlag {
  buchung: BankBuchung;
  /** Prüfsumme der Bewegung (`kontoauszugKennung`). */
  kennung: string;
  stufe: Stufe;
  teile: Teil[];
  /** Ein Satz: warum so zugeordnet. */
  grund: string;
  /** Was zusätzlich zu wissen ist (Rest bleibt offen, würde Guthaben …). */
  hinweise: string[];
}

/** Was von einem Eingang keiner Rechnung zugeordnet ist. */
export function nichtZugeordnet(buchung: Pick<BankBuchung, 'betrag'>, teile: Teil[]): number {
  return cent(buchung.betrag - teile.reduce((s, t) => s + t.betrag + t.mahnkosten, 0));
}

/** Prüft eine Zuordnung, wie die Datenbank sie prüfen wird — `null`, wenn sie so hinaus darf. */
export function zuordnungFehler(buchung: Pick<BankBuchung, 'betrag'>, teile: Teil[]): string | null {
  if (teile.length === 0) return 'Keine Rechnung gewählt.';
  const ids = new Set<string>();
  for (const t of teile) {
    if (!t.rechnungId) return 'Bitte zu jedem Teil eine Rechnung wählen.';
    if (ids.has(t.rechnungId)) return 'Jede Rechnung nur einmal je Eingang.';
    ids.add(t.rechnungId);
    if (t.betrag < 0 || t.skonto < 0 || t.mahnkosten < 0) return 'Beträge sind nicht negativ.';
    if (!(t.betrag > 0 || t.skonto > 0 || t.mahnkosten > 0)) return 'Ein Teil ohne Betrag verbucht nichts.';
  }
  if (nichtZugeordnet(buchung, teile) < 0) {
    return `Zugeordnet ist mehr als eingegangen (${euro(buchung.betrag)}).`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Die Rechnungsnummer im Text finden
// ---------------------------------------------------------------------------

const TRENNER = '[\\s\\-_/.:]*';

function regexSicher(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Buchstaben- und Zifferngruppen einer Nummer: „RE-2026-1001“ → RE, 2026, 1001. */
function gruppen(nummer: string): string[] {
  return nummer.toUpperCase().match(/[A-Z]+|\d+/g) ?? [];
}

/**
 * Wie sicher die Nummer im Text steht: 2 = ganz (mit Vorsatz), 1 = nur Jahr
 * und laufende Nummer, 0 = gar nicht. Zwischen den Gruppen darf stehen, was
 * Banken und Kunden daraus machen: Leerzeichen, Bindestrich, Schrägstrich,
 * Punkt oder nichts. Davor kein Buchstabe oder Ziffer, danach keine Ziffer —
 * „RE-2026-10012“ ist nicht „RE-2026-1001“. Ohne Lookbehind: die App läuft
 * auch auf älteren iPhones (`vite.config.ts`, safari14).
 */
export function nummerImText(nummer: string, text: string): 0 | 1 | 2 {
  const g = gruppen(nummer);
  if (g.length === 0) return 0;
  const t = text.toUpperCase();
  const ganz = new RegExp(`(?:^|[^A-Z0-9])${g.map(regexSicher).join(TRENNER)}(?![0-9])`);
  if (ganz.test(t)) return 2;
  // Ohne Vorsatz: nur, wenn mindestens Jahr und Nummer bleiben.
  const ziffern = g.slice(g.findIndex((x) => /^\d/.test(x)));
  if (ziffern.length >= 2 && ziffern.length < g.length) {
    const kurz = new RegExp(`(?:^|[^A-Z0-9])${ziffern.map(regexSicher).join(TRENNER)}(?![0-9])`);
    if (kurz.test(t)) return 1;
  }
  return 0;
}

/**
 * Kandidaten für Rechnungsnummern im Text, die nicht unter den offenen
 * Rechnungen sind — damit der Abgleich auch eine schon bezahlte oder
 * stornierte Rechnung erkennt, auf die jemand (noch einmal) zahlt.
 * Jahr und laufende Nummer, mit dem Vorsatz des Betriebs davor und ohne.
 */
export function nummernImText(text: string, praefix: string): string[] {
  const t = text.toUpperCase();
  const funde = new Set<string>();
  for (const m of t.matchAll(/(?:^|[^0-9])(20\d{2})[\s\-_/.]*(\d{3,6})(?![0-9])/g)) {
    funde.add(praefix ? `${praefix}-${m[1]}-${m[2]}` : `${m[1]}-${m[2]}`);
    funde.add(`${m[1]}-${m[2]}`);
  }
  return [...funde];
}

// ---------------------------------------------------------------------------
// Der Name des Kunden
// ---------------------------------------------------------------------------

const FUELLWOERTER = new Set([
  'gmbh', 'gesmbh', 'mbh', 'kg', 'og', 'ag', 'eu', 'ges', 'co', 'und', 'der', 'die', 'das', 'fam', 'familie',
  'herr', 'frau', 'dr', 'mag', 'ing', 'dipl', 'di', 'bsc', 'msc', 'mba', 'prof', 'von', 'van', 'bau', 'haus',
]);

function namensteile(s: string | undefined): string[] {
  return (s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !FUELLWOERTER.has(w));
}

/** Steht der Kunde im Auftraggeber oder im Text? Mindestens ein kennzeichnender Namensteil. */
export function namePasstZu(kunde: string, b: Pick<BankBuchung, 'name' | 'zweck'>): boolean {
  const teile = namensteile(kunde);
  if (teile.length === 0) return false;
  const bei = new Set(namensteile(`${b.name ?? ''} ${b.zweck}`));
  return teile.some((t) => bei.has(t));
}

// ---------------------------------------------------------------------------
// Der Vorschlag
// ---------------------------------------------------------------------------

/** Eine Rechnung mit dem, was der Abgleich bis hierher schon verteilt hat. */
type Stand = AbgleichRechnung;

/** Wie ein Eingang auf EINE Rechnung passt. */
function aufEine(r: Stand, b: BankBuchung): { stufe: 'passt' | 'pruefen'; teil: Teil; grund: string; hinweise: string[] } {
  const leerTeil = (betrag: number, skonto = 0, mahnkosten = 0): Teil => ({ rechnungId: r.id, betrag, skonto, mahnkosten });
  const { rest } = zahlstand(r);
  const mahnOffen = r.paymentStatus === 'Storniert' ? 0 : Math.max(cent((r.mahnforderung ?? 0) - (r.mahnkostenBetrag ?? 0)), 0);
  const nr = r.invoiceNumber;

  if (r.paymentStatus === 'Storniert') {
    return {
      stufe: 'pruefen', teil: leerTeil(b.betrag),
      grund: `${nr} ist storniert — der Eingang würde Guthaben des Kunden.`, hinweise: [],
    };
  }
  if (!(rest > 0)) {
    if (mahnOffen > 0 && b.betrag <= mahnOffen) {
      return { stufe: 'passt', teil: leerTeil(0, 0, b.betrag), grund: `Mahnspesen und Zinsen zu ${nr} (die Rechnung ist bezahlt).`, hinweise: [] };
    }
    return {
      stufe: 'pruefen', teil: leerTeil(b.betrag),
      grund: `${nr} ist schon bezahlt — der Eingang würde Guthaben des Kunden.`, hinweise: [],
    };
  }
  if (cent(b.betrag) === rest) {
    return { stufe: 'passt', teil: leerTeil(b.betrag), grund: `Gleicht ${nr} aus.`, hinweise: [] };
  }
  const ruecklass = offenerRuecklass(r);
  if (ruecklass > 0 && cent(b.betrag) === cent(rest - ruecklass)) {
    return {
      stufe: 'passt', teil: leerTeil(b.betrag), grund: `Zahlbetrag von ${nr} ohne Rücklass.`,
      hinweise: [`Der Rücklass von ${euro(ruecklass)} bleibt offen.`],
    };
  }
  if (b.betrag < rest) {
    const skonto = skontoZumAusgleich(r, b.buchungstag, b.betrag);
    if (skonto) {
      return {
        stufe: 'passt', teil: leerTeil(b.betrag, skonto),
        grund: `${nr} mit Skonto ${euro(skonto)} ausgeglichen.`,
        hinweise: ruecklass > 0 && cent(rest - b.betrag - skonto) > 0 ? [`Der Rücklass von ${euro(ruecklass)} bleibt offen.`] : [],
      };
    }
    const hinweise = [`Teilzahlung — offen bleiben ${euro(cent(rest - b.betrag))}.`];
    // Fast der Skonto, aber nach der Frist: sagen, statt still Teilzahlung zu buchen.
    if (r.skontoProzent && r.skontoBis && b.buchungstag > r.skontoBis
        && cent(rest - b.betrag) <= cent(zugesagterSkonto(r) - (r.skontoBetrag ?? 0))) {
      hinweise.push(`Skonto wäre bis ${datumAT(r.skontoBis)} möglich gewesen — gezahlt am ${datumAT(b.buchungstag)}.`);
    }
    return { stufe: 'passt', teil: leerTeil(b.betrag), grund: `Teilzahlung auf ${nr}.`, hinweise };
  }
  // Mehr als offen: zuerst die Rechnung, dann Mahnkosten, der Rest wäre Guthaben.
  const mahnkosten = mahnkostenVorschlag(b.betrag, rest, mahnOffen);
  const ueber = cent(b.betrag - rest - mahnkosten);
  if (mahnkosten > 0 && !(ueber > 0)) {
    return {
      stufe: 'passt', teil: leerTeil(rest, 0, mahnkosten),
      grund: `${nr} samt Mahnspesen und Zinsen ${euro(mahnkosten)}.`, hinweise: [],
    };
  }
  return {
    stufe: 'pruefen', teil: leerTeil(cent(b.betrag - mahnkosten), 0, mahnkosten),
    grund: `${euro(ueber)} mehr als auf ${nr} offen${mahnkosten > 0 ? ' samt Mahnkosten' : ''} — würde Guthaben des Kunden.`,
    hinweise: [],
  };
}

/** Wie viel ein Teil an einer Rechnung bewegt — für den Stand der nächsten Eingänge. */
function anrechnen(stand: Map<string, Stand>, teile: Teil[]): void {
  for (const t of teile) {
    const r = stand.get(t.rechnungId);
    if (!r) continue;
    stand.set(r.id, {
      ...r,
      bezahltBetrag: cent((r.bezahltBetrag ?? 0) + t.betrag + t.skonto),
      skontoBetrag: cent((r.skontoBetrag ?? 0) + t.skonto),
      mahnkostenBetrag: cent((r.mahnkostenBetrag ?? 0) + t.mahnkosten),
    });
  }
}

/**
 * Die Vorschläge für alle Eingänge.
 *
 * @param rechnungen offene Rechnungen und die, deren Nummer im Text steht
 * @param erfasst die schon erfassten Eingänge im Zeitraum (doppelte erkennen)
 * @param verbucht Kennungen, die schon verbucht sind (dieselbe Bewegung)
 */
export function abgleichen(
  eingaenge: { buchung: BankBuchung; kennung: string }[],
  rechnungen: AbgleichRechnung[],
  erfasst: ErfassterEingang[] = [],
  verbucht: ReadonlySet<string> = new Set(),
): Vorschlag[] {
  const stand = new Map(rechnungen.map((r) => [r.id, { ...r }]));
  const reihenfolge = eingaenge
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.buchung.buchungstag.localeCompare(b.buchung.buchungstag) || a.i - b.i);
  const ergebnis = new Array<Vorschlag>(eingaenge.length);

  for (const { buchung: b, kennung, i } of reihenfolge) {
    const fertig = (v: Omit<Vorschlag, 'buchung' | 'kennung'>) => {
      ergebnis[i] = { buchung: b, kennung, ...v };
      if (v.stufe !== 'erledigt') anrechnen(stand, v.teile);
    };

    if (verbucht.has(kennung)) {
      fertig({ stufe: 'erledigt', teile: [], grund: 'Diese Bewegung ist schon verbucht.', hinweise: [] });
      continue;
    }

    const text = `${b.zweck} ${b.name ?? ''}`;
    const alle = [...stand.values()];
    let treffer = alle.filter((r) => nummerImText(r.invoiceNumber, text) === 2);
    if (treffer.length === 0) treffer = alle.filter((r) => nummerImText(r.invoiceNumber, text) === 1);
    treffer.sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate) || x.invoiceNumber.localeCompare(y.invoiceNumber));

    // Schon von Hand erfasst? Gleiche Rechnung, gleicher Tag, gleicher Betrag.
    const doppelt = treffer.find((r) => erfasst.some((z) =>
      z.invoiceId === r.id && z.datum === b.buchungstag && cent(z.betrag) === cent(b.betrag)));
    if (doppelt) {
      fertig({
        stufe: 'erledigt', teile: [],
        grund: `Auf ${doppelt.invoiceNumber} ist am ${datumAT(b.buchungstag)} schon ein Eingang über ${euro(b.betrag)} erfasst.`,
        hinweise: [],
      });
      continue;
    }

    if (treffer.length === 1) {
      const a = aufEine(treffer[0], b);
      fertig({ stufe: a.stufe, teile: [a.teil], grund: a.grund, hinweise: a.hinweise });
      continue;
    }

    if (treffer.length > 1) {
      fertig(sammel(treffer, b));
      continue;
    }

    // Ohne Nummer: Betrag (offen, ohne Rücklass oder mit Skonto) und Name.
    const passend = alle.filter((r) => {
      if (r.paymentStatus === 'Storniert') return false;
      const { rest } = zahlstand(r);
      if (!(rest > 0)) return false;
      return cent(b.betrag) === rest
        || cent(b.betrag) === cent(rest - offenerRuecklass(r))
        || (b.betrag < rest && skontoZumAusgleich(r, b.buchungstag, b.betrag) !== null);
    });
    const mitName = passend.filter((r) => namePasstZu(r.customerName, b));
    const einer = mitName.length === 1 ? mitName[0] : passend.length === 1 ? passend[0] : null;
    if (einer) {
      const a = aufEine(einer, b);
      fertig({
        stufe: 'pruefen', teile: [a.teil],
        grund: `Ohne Rechnungsnummer im Zweck — ${mitName.length === 1 ? 'Betrag und Name passen' : 'nur der Betrag passt'} zu ${einer.invoiceNumber} (${einer.customerName}).`,
        hinweise: a.hinweise,
      });
      continue;
    }
    fertig({
      stufe: 'offen', teile: [],
      grund: passend.length > 1
        ? `Ohne Rechnungsnummer im Zweck; der Betrag passt zu ${passend.length} offenen Rechnungen.`
        : 'Keine Rechnungsnummer im Zweck und keine offene Rechnung über diesen Betrag.',
      hinweise: [],
    });
  }
  return ergebnis;
}

/** Mehrere Nummern in einem Zweck — eine Sammelüberweisung. */
function sammel(treffer: Stand[], b: BankBuchung): Omit<Vorschlag, 'buchung' | 'kennung'> {
  const offen = treffer.filter((r) => r.paymentStatus !== 'Storniert' && zahlstand(r).rest > 0);
  const nummern = treffer.map((r) => r.invoiceNumber).join(', ');
  const summe = cent(offen.reduce((s, r) => s + zahlstand(r).rest, 0));
  if (offen.length > 0 && cent(b.betrag) === summe) {
    return {
      stufe: 'passt',
      teile: offen.map((r) => ({ rechnungId: r.id, betrag: zahlstand(r).rest, skonto: 0, mahnkosten: 0 })),
      grund: `Sammelüberweisung — gleicht ${offen.map((r) => r.invoiceNumber).join(', ')} aus.`,
      hinweise: offen.length < treffer.length ? ['Nicht mehr offene Rechnungen im Zweck sind übergangen.'] : [],
    };
  }
  // Jede mit dem Skonto, den sie an diesem Tag zulässt — passt die Summe dann?
  const mitSkonto = offen.map((r) => {
    const rest = zahlstand(r).rest;
    const frei = r.skontoProzent && r.skontoBis && b.buchungstag <= r.skontoBis
      ? Math.max(cent(zugesagterSkonto(r) - (r.skontoBetrag ?? 0)), 0) : 0;
    return { r, rest, skonto: Math.min(frei, rest) };
  });
  if (offen.length > 0 && mitSkonto.some((x) => x.skonto > 0)
      && cent(b.betrag) === cent(mitSkonto.reduce((s, x) => s + x.rest - x.skonto, 0))) {
    return {
      stufe: 'passt',
      teile: mitSkonto.map((x) => ({ rechnungId: x.r.id, betrag: cent(x.rest - x.skonto), skonto: x.skonto, mahnkosten: 0 })),
      grund: `Sammelüberweisung mit Skonto — gleicht ${offen.map((r) => r.invoiceNumber).join(', ')} aus.`,
      hinweise: [],
    };
  }
  // Sonst der Reihe nach, älteste zuerst — als Vorschlag zum Prüfen.
  let bleibt = b.betrag;
  const teile: Teil[] = [];
  for (const r of offen) {
    if (!(bleibt > 0)) break;
    const anteil = Math.min(zahlstand(r).rest, bleibt);
    teile.push({ rechnungId: r.id, betrag: cent(anteil), skonto: 0, mahnkosten: 0 });
    bleibt = cent(bleibt - anteil);
  }
  return {
    stufe: teile.length > 0 ? 'pruefen' : 'offen',
    teile,
    grund: `Mehrere Rechnungen im Zweck (${nummern}); der Betrag passt nicht zu ihrer Summe von ${euro(summe)}.`,
    hinweise: bleibt > 0 ? [`${euro(bleibt)} bleiben ohne Zuordnung.`] : [],
  };
}
