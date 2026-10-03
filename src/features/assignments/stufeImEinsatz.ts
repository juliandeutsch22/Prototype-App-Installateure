import type { Einstufung } from '@/lib/einstufung';

/**
 * Als was jemand auf einem Einsatz arbeitet — Einstufung der Person und
 * Helfer-Kennzeichen des Einsatzes zusammen (Entscheidung 03.10.2026).
 *
 * WARUM ES DIESE REGEL BRAUCHT. Seit der Einstufung (30.09.2026) bestimmt die
 * Person ihren Satz, das Kennzeichen am Einsatz blieb für die Ausnahme. Die
 * Einsatzplanung kannte die Einstufung aber nicht: ein Lehrling erschien als
 * „Facharbeiter“, ein eingestufter Helfer wurde ohne Kennzeichen vorbelegt.
 *
 * BEI HELFER UND LEHRLING STEHT DAS KENNZEICHEN FEST. Der eingestufte Helfer
 * hat den Helfersatz ohnehin; mit Kennzeichen zählen seine Stunden auch nicht
 * ins Projekt-Budget. Der Satz des Lehrlings folgt dem Lehrjahr; ein
 * Helfer-Haken ginge in seine Buchung und verdrängte dort den Lehrlingssatz
 * (`satzklasse`) — falscher Satz auf Rechnung und Nachkalkulation. Zur Wahl
 * steht der Haken nur bei Facharbeiter und Obermonteur, für die Ausnahme.
 */
export type StufeImEinsatz = 'Facharbeiter' | 'Obermonteur' | 'Helfer' | 'Lehrling';

export const STUFEN_IM_EINSATZ: readonly StufeImEinsatz[] = ['Facharbeiter', 'Obermonteur', 'Helfer', 'Lehrling'];

type MitEinstufung = { einstufung?: Einstufung | null } | null | undefined;

export const istLehrling = (p: MitEinstufung) => p?.einstufung === 'lehrling';

/** Wer als Helfer eingestuft ist, arbeitet immer mit Kennzeichen. */
export const alsHelferEingestuft = (p: MitEinstufung) => p?.einstufung === 'helfer';

export function stufeImEinsatz(asHelper: boolean | null | undefined, p: MitEinstufung): StufeImEinsatz {
  if (istLehrling(p)) return 'Lehrling';
  if (asHelper) return 'Helfer';
  return p?.einstufung === 'obermonteur' ? 'Obermonteur' : p?.einstufung === 'helfer' ? 'Helfer' : 'Facharbeiter';
}

/** „1 Lehrling“, „2 Lehrlinge“ — für die Zählung am Einsatz. */
export function stufeAnzahl(stufe: StufeImEinsatz, n: number): string {
  if (n === 1) return `1 ${stufe}`;
  const mehrzahl = stufe === 'Lehrling' ? 'Lehrlinge' : stufe === 'Obermonteur' ? 'Obermonteure' : stufe;
  return `${n} ${mehrzahl}`;
}
