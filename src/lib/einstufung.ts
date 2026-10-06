/**
 * Einstufung an der Person und der Satz, der daraus für eine Stunde folgt
 * (Testbericht 30.09.2026, 4.1 Punkte 1–3).
 *
 * WAS VORHER GALT: Lehrlinge steckten in der Rolle „Mitarbeiter“, und ihre
 * Stunden gingen zum Facharbeitersatz auf die Rechnung — ausser jemand hakte
 * bei JEDER Buchung „als Helfer“ an. Der Haken hing an der Buchung, nicht an
 * der Person, und wurde leicht vergessen: zu hohe Rechnung, falsche
 * Nachkalkulation.
 *
 * JETZT: keine neue Rolle — die Rolle regelt, was jemand sehen und tun darf,
 * und darin unterscheidet sich ein Lehrling nicht vom Monteur. Die
 * EINSTUFUNG regelt den Satz. Beim Lehrling ergibt sich das Lehrjahr aus
 * Lehrbeginn und Lehrzeit, der Satz wechselt damit von selbst.
 *
 * DIE DATENBANK ENTSCHEIDET. Den Satz einer Buchung setzt ein Auslöser an
 * `time_entries` (`app.satzklasse_am`), nicht die Maske; dieses Modul rechnet
 * dasselbe für die Anzeige nach. Beide Fassungen prüft
 * `tests/unit/einstufung.test.ts` gegeneinander.
 */
import type { InvoiceRates } from '@/types';

export type Einstufung = 'facharbeiter' | 'obermonteur' | 'helfer' | 'lehrling';

/** Der Satz einer Stunde — die Einstufung, beim Lehrling mit Lehrjahr. */
export type Satzklasse = 'facharbeiter' | 'obermonteur' | 'helfer' | 'lj1' | 'lj2' | 'lj3' | 'lj4';

/** Die Stufen mit eigenem, frei einstellbarem Satz neben Facharbeiter und Helfer. */
export type Stufe = 'obermonteur' | 'lj1' | 'lj2' | 'lj3' | 'lj4';

/**
 * Sätze je Stufe in €/h. OHNE FESTE VORGABE: ein leeres Feld heisst beim
 * Obermonteur „Facharbeitersatz“, beim Lehrling „Helfersatz“ — viele Betriebe
 * verrechnen das 1. und 2. Lehrjahr gar nicht (dann 0) oder zum Helfersatz.
 */
export type Stufensaetze = Partial<Record<Stufe, number>>;

export const EINSTUFUNGEN: readonly { wert: Einstufung; name: string }[] = [
  { wert: 'facharbeiter', name: 'Facharbeiter' },
  { wert: 'obermonteur', name: 'Obermonteur' },
  { wert: 'helfer', name: 'Helfer' },
  { wert: 'lehrling', name: 'Lehrling' },
];

export const STUFEN: readonly Stufe[] = ['obermonteur', 'lj1', 'lj2', 'lj3', 'lj4'];

/** Feste Reihenfolge auf Rechnung und Auswertung: erst Fachkräfte, dann Helfer, dann Lehrlinge. */
export const SATZKLASSEN: readonly Satzklasse[] = [
  'facharbeiter', 'obermonteur', 'helfer', 'lj1', 'lj2', 'lj3', 'lj4',
];

/** Lehrzeit in Monaten: 2 bis 4 Jahre, halbjährlich (Doppellehre 4 Jahre). */
export const LEHRZEIT_MIN = 24;
export const LEHRZEIT_MAX = 48;
export const LEHRZEIT_VORGABE = 36;

/** Volle Monate zwischen zwei ISO-Daten — wie `age()` in Postgres. */
function volleMonate(von: string, bis: string): number {
  const [y1, m1, d1] = von.split('-').map(Number);
  const [y2, m2, d2] = bis.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/**
 * Das Lehrjahr an einem Tag: im ersten Jahr ab Lehrbeginn das 1., danach je
 * volles Jahr eins mehr — höchstens das letzte der Lehrzeit. Vor dem
 * Lehrbeginn das 1.: eine Buchung davor ist ein Schnuppertag, kein 0. Jahr.
 *
 * Wie `app.lehrjahr` in der Datenbank.
 */
export function lehrjahr(lehrbeginn: string, lehrzeitMonate: number, tag: string): number {
  const jahre = tag < lehrbeginn ? 0 : Math.floor(volleMonate(lehrbeginn, tag) / 12);
  const letztes = Math.min(4, Math.max(1, Math.ceil(lehrzeitMonate / 12)));
  return Math.min(letztes, jahre + 1);
}

/** Der letzte Tag der Lehrzeit (ISO). */
export function lehrzeitEnde(lehrbeginn: string, lehrzeitMonate: number): string {
  const [y, m, d] = lehrbeginn.split('-').map(Number);
  // Mittags gerechnet: kein Sommerzeitwechsel verschiebt den Tag.
  const ende = new Date(Date.UTC(y, m - 1 + lehrzeitMonate, d, 12));
  // Über das Monatsende hinaus (31.01. + 1 Monat) rollt `Date` weiter — zurück auf den Letzten.
  if (ende.getUTCDate() !== d) ende.setUTCDate(0);
  ende.setUTCDate(ende.getUTCDate() - 1);
  return ende.toISOString().slice(0, 10);
}

/**
 * Eine frühere Stufe der Person (Runde 3, M13): sie galt bis VOR `bis`.
 * Die Schlüssel stehen so, wie die Datenbank sie in `einstufung_verlauf`
 * schreibt — die Umwandlung in camelCase reicht nur eine Ebene tief.
 */
export interface FruehereEinstufung {
  einstufung: Einstufung | null;
  lehrbeginn?: string | null;
  lehrzeit_monate?: number | null;
  bis: string;
}

export interface EinstufungDerPerson {
  einstufung?: Einstufung | null;
  lehrbeginn?: string | null;
  lehrzeitMonate?: number | null;
  einstufungVerlauf?: FruehereEinstufung[] | null;
}

/**
 * Der Satz einer Person an einem Tag. Ohne Einstufung: Facharbeiter, wie bisher.
 *
 * JEDE BUCHUNG ZÄHLT ZUM SATZ IHRES TAGES (Runde 3, M13): eine Umstufung gilt
 * ab dem Tag, an dem sie eingetragen wurde. Liegt der Tag vor einer früheren
 * Stufe `bis`, gilt die früheste solche — wie `app.satzklasse_am`.
 */
export function satzklasseAm(p: EinstufungDerPerson, tag: string): Satzklasse {
  const frueher = (p.einstufungVerlauf ?? [])
    .map((v, n) => ({ v, n }))
    .filter(({ v }) => v.bis > tag)
    .sort((a, b) => (a.v.bis < b.v.bis ? -1 : a.v.bis > b.v.bis ? 1 : a.n - b.n))[0]?.v;
  if (frueher) {
    return satzDerStufe(
      { einstufung: frueher.einstufung, lehrbeginn: frueher.lehrbeginn, lehrzeitMonate: frueher.lehrzeit_monate },
      tag,
    );
  }
  return satzDerStufe(p, tag);
}

function satzDerStufe(p: EinstufungDerPerson, tag: string): Satzklasse {
  switch (p.einstufung) {
    case 'obermonteur':
      return 'obermonteur';
    case 'helfer':
      return 'helfer';
    case 'lehrling':
      if (!p.lehrbeginn || !p.lehrzeitMonate) return 'lj1';
      return `lj${lehrjahr(p.lehrbeginn, p.lehrzeitMonate, tag)}` as Satzklasse;
    default:
      return 'facharbeiter';
  }
}

/**
 * Der Satz, zu dem eine Buchung zählt. Der Helfer-Haken bleibt für Ausnahmen
 * und geht vor — etwa ein Facharbeiter, der einen Tag zuarbeitet. Buchungen
 * von vor der Einstufung tragen keinen Satz und zählen wie bisher.
 */
export function satzklasse(e: { satz?: Satzklasse | null; isHelper?: boolean | null }): Satzklasse {
  if (e.isHelper) return 'helfer';
  return e.satz ?? 'facharbeiter';
}

export const istLehrlingssatz = (k: Satzklasse) => k.startsWith('lj');

/**
 * Wohin eine Stunde im Projekt-Budget gehört (Entscheidung 03.10.2026).
 *
 * FACH zählt gegen das Budget. HELFER zählt nicht — dieselbe Regel wie seit
 * jeher. LEHRLING zählt nicht, wenn an der Person „Stunden zählen ins
 * Projekt-Budget“ aus war, als gebucht wurde. Eine eigene Summe statt unter
 * „Helfer“: ein Lehrling ist kein Helfer, und so stünde er dort.
 */
export function budgetArt(e: { isHelper?: boolean | null; insBudget?: boolean | null }): 'fach' | 'helfer' | 'lehrling' {
  if (e.isHelper) return 'helfer';
  if (e.insBudget === false) return 'lehrling';
  return 'fach';
}

/** Wie der Satz heisst — in Rechnung, Nachweis und Auswertung gleich. */
export function satzName(k: Satzklasse): string {
  switch (k) {
    case 'facharbeiter':
      return 'Facharbeiter';
    case 'obermonteur':
      return 'Obermonteur';
    case 'helfer':
      return 'Helfer';
    default:
      return `Lehrling, ${k.slice(2)}. Lehrjahr`;
  }
}

/** Der Name der Einstufung einer Person, beim Lehrling mit Lehrjahr am Tag. */
export function einstufungText(p: EinstufungDerPerson, tag: string): string {
  if (!p.einstufung) return '';
  if (p.einstufung !== 'lehrling') return satzName(p.einstufung);
  return satzName(satzklasseAm(p, tag));
}

interface MitStufen {
  fach: number;
  helper: number;
  stufen?: Stufensaetze | null;
}

/** Leer beim Obermonteur heisst Facharbeitersatz, beim Lehrling Helfersatz. */
function ausStufe(k: Satzklasse, s: MitStufen): number {
  if (k === 'facharbeiter') return s.fach;
  if (k === 'helfer') return s.helper;
  const eigen = s.stufen?.[k];
  if (typeof eigen === 'number' && Number.isFinite(eigen)) return eigen;
  return k === 'obermonteur' ? s.fach : s.helper;
}

/** Verrechnungssatz (€/h) für den Kunden. */
export function verrechnungssatz(k: Satzklasse, rates: Pick<InvoiceRates, 'fach' | 'helper' | 'stufen'>): number {
  return ausStufe(k, rates);
}

/** Kostensatz (€/h) für den Betrieb — NICHT der Verrechnungssatz. */
export function kostensatz(k: Satzklasse, kosten: MitStufen): number {
  return ausStufe(k, kosten);
}

/** Was ein leeres Stufenfeld bedeutet — steht als Platzhalter im Feld. */
export const stufeLeerHeisst = (s: Stufe) => (s === 'obermonteur' ? 'leer = Facharbeitersatz' : 'leer = Helfersatz');
