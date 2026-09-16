import { Marke } from '@/components/Badge';
import type { TimeEntry } from '@/types';

/**
 * Die Marker eines Zeiteintrags: Helfer, Notdienst, Nachtarbeit.
 *
 * WARUM SIE EINE GEMEINSAME KOMPONENTE SIND. Sie standen nur in der eigenen
 * Zeitübersicht. Aus dem Betrieb gemeldet: „Notdienst wurde angehakt, aber
 * das scheint beim Eintrag in der Projektauswertung nicht auf und auch nicht
 * in der Mitarbeiterübersicht."
 *
 * Der Haken war dabei korrekt GESPEICHERT — er wurde nur nirgends gezeigt.
 * Das ist die teuerste Sorte Lücke: die Buchhaltung sieht eine gewöhnliche
 * Stunde, wo ein Zuschlag von +100 % dranhängt, und schreibt sie ohne ihn in
 * die Rechnung. Der Zuschlag ist damit verloren, und auffallen würde es
 * niemandem — die Zahl ist ja plausibel.
 *
 * Drei Ansichten, die dieselbe Frage beantworten, brauchen eine Antwort.
 * Kommt ein vierter Marker dazu, erscheint er überall oder nirgends — nicht
 * an zwei von vier Stellen.
 */

/** Nur die Felder, die einen Marker auslösen. */
export type MarkierterEintrag = Pick<TimeEntry, 'isHelper' | 'isEmergency' | 'isNightWork'>;

export default function Zeitmarker({ eintrag }: { eintrag: MarkierterEintrag }) {
  return (
    <>
      {/*
        DREI EIGENSCHAFTEN EINER BUCHUNG, KEIN URTEIL. „Notdienst" stand in
        Rot — der Farbe für „hier ist etwas kaputt" —, dabei ist es eine
        Angabe zur Abrechnung. Wer das Wort liest, weiss mehr als von der
        Farbe.
      */}
      {eintrag.isHelper && <Marke>Helfer</Marke>}
      {eintrag.isEmergency && <Marke>Notdienst</Marke>}
      {eintrag.isNightWork && <Marke>Nacht</Marke>}
    </>
  );
}
