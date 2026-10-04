import type { Termin, TerminArt } from '@/types';
import { terminArtName } from '@shared/kalenderIcs';

/** „Lieferung" heißt am Telefon „Aviso" — beides steht da, damit es jeder findet. */
export function artName(art: TerminArt): string {
  return terminArtName(art);
}

/** „08:00–10:00", „ab 08:00", „bis 10:00" — oder leer, wenn der Tag reicht. */
export function terminZeit(t: Pick<Termin, 'zeitVon' | 'zeitBis'>): string {
  if (t.zeitVon && t.zeitBis) return `${t.zeitVon}–${t.zeitBis}`;
  if (t.zeitVon) return `ab ${t.zeitVon}`;
  if (t.zeitBis) return `bis ${t.zeitBis}`;
  return '';
}

/**
 * Woran ein Termin hängt: „Familie Huber · 2026-014" oder, bei der
 * Besichtigung vor der Baustelle, „Familie Huber (ohne Baustelle)". Der Name
 * steht am Termin selbst — auch für den Monteur, der Kunden nicht liest.
 */
export function bezugText(t: Pick<Termin, 'projectNumber' | 'ortName'>): string {
  if (t.projectNumber) return t.ortName ? `${t.ortName} · ${t.projectNumber}` : t.projectNumber;
  return t.ortName ? `${t.ortName} (ohne Baustelle)` : 'beim Kunden';
}

/** Die Kopfzeile eines Termins: Art und Uhrzeit. */
export function terminKopf(t: Pick<Termin, 'art' | 'zeitVon' | 'zeitBis'>): string {
  return [artName(t.art), terminZeit(t)].filter(Boolean).join(' · ');
}

/**
 * Was ein Monteur in „Mein Einsatzplan" sieht: die Termine, an denen er
 * teilnimmt, und die auf einer Baustelle, auf der er an diesem Tag
 * eingeteilt ist — auch ohne Teilnehmer zu sein, er nimmt die Lieferung an.
 *
 * Gefiltert wird hier und nicht nur im Zeilenschutz: eine Projektleitung im
 * Einsatzplan bekäme von der Datenbank ALLE Termine des Betriebs.
 */
export function betrifftMich(
  t: Pick<Termin, 'teilnehmer' | 'projectNumber' | 'datum'>,
  uid: string,
  einsaetze: { date: string; projectNumber: string }[],
): boolean {
  if (t.teilnehmer.includes(uid)) return true;
  return !!t.projectNumber && einsaetze.some((e) => e.date === t.datum && e.projectNumber === t.projectNumber);
}

/** „Di, 06.10." */
export function datumKurz(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString('de-AT', { weekday: 'short' })}, ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
}
