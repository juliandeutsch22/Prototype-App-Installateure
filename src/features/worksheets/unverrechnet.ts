import type { Invoice, WorkSheet } from '@/types';

/**
 * Welche unterschriebenen Scheine noch auf keiner Rechnung stehen.
 *
 * DIE LETZTE OFFENE STELLE IM KREIS. Der Weg vom Einsatz zum Geld war
 * durchgehend gebaut — Zeit buchen, Schein unterschreiben, Rechnung daraus
 * zusammenstellen —, aber niemand konnte sagen, WAS davon noch nicht durch
 * ist. Die Rechnung merkt sich, welche Scheine sie verbraucht hat
 * (`linkedWorkSheets`); gelesen wurde das bisher nur beim Zusammenstellen der
 * nächsten Rechnung, um nichts doppelt zu verrechnen.
 *
 * Die Umkehrung fehlte, und sie ist die betrieblich wichtigere: geleistete,
 * unterschriebene Arbeit, für die nie jemand eine Rechnung geschrieben hat.
 * Das ist kein Buchhaltungsfehler, den man später sieht — es ist Geld, das
 * schlicht nie eingefordert wird, und im Handwerk der klassische Weg, wie ein
 * gut ausgelasteter Betrieb trotzdem knapp bei Kasse ist.
 *
 * WARUM DER STORNO EINER RECHNUNG DIE SCHEINE WIEDER FREIGIBT: er nimmt die
 * Forderung zurück, also ist die Leistung wieder unverrechnet. Ein Feld am
 * Schein müsste dafür jemand zurücksetzen; hier fällt es von selbst an.
 */

export interface UnverrechneterSchein {
  schein: WorkSheet & { id: string };
  /** Wie viele Tage seit dem Leistungsdatum vergangen sind. */
  tage: number;
}

/** Tage zwischen zwei ISO-Tagen, in UTC — ohne Sommerzeitfallen. */
function tageZwischen(vonIso: string, bisIso: string): number {
  const von = Date.parse(`${vonIso}T00:00:00Z`);
  const bis = Date.parse(`${bisIso}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
  return Math.round((bis - von) / 86_400_000);
}

/**
 * Ab wann eine unverrechnete Leistung auffällig ist, in Tagen.
 *
 * Vier Wochen. Kürzer wäre Lärm — zwischen Einsatz und Rechnung liegt im
 * Handwerk regelmässig ein Monatsabschluss. Länger hiesse, dass ein
 * vergessener Schein erst auffällt, wenn der Kunde ihn selbst nicht mehr
 * erinnert.
 */
export const AUFFAELLIG_AB_TAGEN = 28;

/**
 * Die unterschriebenen Scheine, die auf keiner gültigen Rechnung stehen.
 *
 * ÄLTESTE ZUERST — das ist die Aussage. Eine Leistung von vorgestern ist
 * normal, eine von vor drei Monaten ist ein Befund.
 *
 * STORNIERTE RECHNUNGEN ZÄHLEN NICHT als Verrechnung. Wer eine Rechnung
 * storniert, nimmt die Forderung zurück; die Leistung steht dann wieder
 * offen. Zählte der Storno mit, verschwände genau die Arbeit aus der Liste,
 * die am ehesten vergessen wird.
 */
export function unverrechneteScheine(
  scheine: Array<WorkSheet & { id: string }>,
  rechnungen: Array<Pick<Invoice, 'linkedWorkSheets' | 'paymentStatus'>>,
  heute: string,
): UnverrechneterSchein[] {
  const verrechnet = new Set<string>();
  for (const r of rechnungen) {
    if (r.paymentStatus === 'Storniert') continue;
    for (const id of r.linkedWorkSheets ?? []) verrechnet.add(id);
  }

  return scheine
    .filter((s) => s.status === 'Unterschrieben' && !verrechnet.has(s.id))
    .map((schein) => ({ schein, tage: tageZwischen(schein.datum, heute) }))
    .sort((a, b) => b.tage - a.tage);
}

/** Wie viele davon schon auffällig lange offen sind. */
export function auffaellige(zeilen: UnverrechneterSchein[]): UnverrechneterSchein[] {
  return zeilen.filter((z) => z.tage >= AUFFAELLIG_AB_TAGEN);
}
