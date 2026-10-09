import type { Termin } from '@/types';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import { terminZeit } from '@/features/termine/terminText';

/*
  WAS DIE EINSATZPLANUNG (Runde 4) ÜBER TERMINE UND TAGE WISSEN MUSS —
  reine Rechnungen auf den Daten, die die Seite ohnehin geladen hat. Keine
  neue Abfrage, nichts gespeichert; getrennt von der Ansicht, weil es für
  sich prüfbar ist.
*/

/** Was die Rechnungen von einem Einsatz brauchen. */
type EinsatzOrt = { date: string; projectNumber: string };

/**
 * LIEFERUNG OHNE ANNAHME (Auftrag 4.4, Regel 3): eine Lieferung (Aviso) an
 * einer Baustelle, auf der an diesem Tag niemand eingeteilt ist.
 *
 * DIESELBE ZUORDNUNG WIE DER HINWEIS IM EINSATZFORMULAR („Am selben Tag auf
 * dieser Baustelle: … Steht jemand zur Annahme da?“, Runde 3, G23): Termin
 * und Einsatz gehören zusammen, wenn Tag und Baustellennummer gleich sind.
 * Der Hinweis fragt beim Einteilen; dieser zeigt die Lücke, bevor jemand das
 * Formular öffnet. Ein Termin ohne Baustelle (Besichtigung beim Kunden) hat
 * keine Annahme zu besetzen.
 */
export function lieferungOhneAnnahme(t: Termin, einsaetze: EinsatzOrt[]): boolean {
  if (t.art !== 'Lieferung' || !t.projectNumber) return false;
  return !einsaetze.some((a) => a.date === t.datum && a.projectNumber === t.projectNumber);
}

/** „14:00–15:00“, „ab 08:00“ — oder „ganzer Tag“, wenn keine Uhrzeit steht. */
export function terminZeitKurz(t: Pick<Termin, 'zeitVon' | 'zeitBis'>): string {
  return terminZeit(t) || 'ganzer Tag';
}

/** Wo ein Termin ist, kurz: Kunde der Baustelle bzw. der Kunde — sonst die Nummer. */
export function terminOrtKurz(t: Pick<Termin, 'ortName' | 'projectNumber'>): string {
  return t.ortName?.trim() || t.projectNumber || 'beim Kunden';
}

/**
 * „Max M.“ — für die Sicht nach Baustellen, wo mehrere Namen in eine Zelle
 * müssen. EINE Regel für Woche und Monat: sie steht in `kurzname.ts`.
 */
export { kurzPerson as personKurz } from './kurzname';

export const feiertagAm = (tag: string) => getAustrianHolidayName(new Date(`${tag}T00:00:00`));
export const wochenendeAm = (tag: string) => isWeekend(new Date(`${tag}T00:00:00`));

/** Ein Tag, an dem niemand im Dienst ist: Samstag, Sonntag, Feiertag. */
export const ruhetag = (tag: string) => wochenendeAm(tag) || !!feiertagAm(tag);

/**
 * SAMSTAG, SONNTAG, FEIERTAG SCHMAL (Auftrag 4.2) — solange an dem Tag weder
 * ein Einsatz noch ein Termin steht. Ein Notdienst am Samstag macht die
 * Spalte wieder breit, sonst stünde er in 56 px.
 */
export function schmalerTag(tag: string, einsaetze: EinsatzOrt[], termine: Pick<Termin, 'datum'>[]): boolean {
  if (!ruhetag(tag)) return false;
  return !einsaetze.some((a) => a.date === tag) && !termine.some((t) => t.datum === tag);
}

/**
 * Der Tag, an dem „Noch einzuplanen“ eine Baustelle einplant: der nächste
 * Arbeitstag der gezeigten Woche ab heute. Liegt die Woche ganz in der
 * Vergangenheit, ihr erster Arbeitstag — und gibt es keinen, ihr erster Tag.
 */
export function naechsterArbeitstag(tage: string[], heute: string): string {
  return tage.find((t) => t >= heute && !ruhetag(t)) ?? tage.find((t) => !ruhetag(t)) ?? tage[0];
}

/** „1 Termin“, „3 Termine“. */
export const termineText = (n: number) => (n === 1 ? '1 Termin' : `${n} Termine`);

/** „Lieferung ohne Annahme“, „2 Lieferungen ohne Annahme“. */
export const ohneAnnahmeText = (n: number) =>
  n === 1 ? 'Lieferung ohne Annahme' : `${n} Lieferungen ohne Annahme`;

/** „Mittwoch 07.10.“ — für die Vorlesehilfe, ausgeschrieben. */
export function tagLang(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString('de-AT', { weekday: 'long' })} ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
}

/**
 * Der Ort einer Baustelle, kurz: der Ort aus der Adresse („2700 Wiener
 * Neustadt“ → „Wiener Neustadt“). Steht keine Uhrzeit am Einsatz, sagt er,
 * wohin es geht.
 */
export function ortAus(adresse: string | undefined | null): string {
  const teil = (adresse ?? '').split(',').pop()?.trim() ?? '';
  return teil.replace(/^\d{4,5}\s+/, '');
}

/** Steht in der Zelle einer Person an einem Tag nichts — kein Einsatz, kein Termin, kein „weg“? */
export function zelleLeer(
  zelle: { baustellen: unknown[]; imUrlaub: boolean; abwesendText: string | null } | undefined,
  zu: boolean,
  termine: Pick<Termin, 'teilnehmer'>[],
  uid: string,
): boolean {
  if (zelle && (zelle.baustellen.length > 0 || zelle.abwesendText)) return false;
  if (zu) return false;
  return !termine.some((t) => t.teilnehmer.includes(uid));
}
