import type { Company, TimeEntry } from '@/types';
import { calcWorkMin } from '@shared/arbeitszeit';

/**
 * DIE LOHNREGELN EINES BETRIEBS — Nachtzeit und Überstundenmodell
 * (Testbericht 30.09.2026, M35 und Paket 2c).
 *
 * Nur Einstellungen und Uhrzeitrechnung; ausgewiesen werden Stunden, nie
 * Geld. Die Bewertung macht die Lohnverrechnung, die den Vertrag kennt.
 * Nach der Lesart des Kollektivvertrags Metallgewerbe, später mit der WKO
 * abzugleichen.
 */

/** Die Nachtzeit in Minuten ab Mitternacht; `von > bis` heisst: über Mitternacht. */
export interface Nachtzeit {
  von: number;
  bis: number;
}

export const NACHTZEIT_VORGABE: Nachtzeit = { von: 22 * 60, bis: 6 * 60 };

function minuten(t: string | undefined | null): number | null {
  const x = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!x) return null;
  const h = Number(x[1]);
  const m = Number(x[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** Die Nachtzeit des Betriebs; ohne gültige Angabe 22–6 Uhr. */
export function nachtzeitVon(company: Pick<Company, 'nachtVon' | 'nachtBis'> | null | undefined): Nachtzeit {
  const von = minuten(company?.nachtVon);
  const bis = minuten(company?.nachtBis);
  if (von === null || bis === null || von === bis) return NACHTZEIT_VORGABE;
  return { von, bis };
}

/**
 * „22–6 Uhr“, „23:30–5 Uhr“ — für Hinweise. Im PDF „22 bis 6 Uhr“: die
 * Standardschrift von jsPDF verschluckt den Halbgeviertstrich.
 */
export function nachtzeitText(n: Nachtzeit, trenner = '–'): string {
  const t = (m: number) => (m % 60 === 0 ? String(m / 60) : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
  return `${t(n.von)}${trenner}${t(n.bis)} Uhr`;
}

/**
 * Wie viele Minuten der Spanne `startTime`–`endTime` in die Nachtzeit fallen.
 * Endet die Spanne vor ihrem Beginn, läuft sie über Mitternacht.
 */
export function nachtMinutenIn(startTime: string | undefined, endTime: string | undefined, nacht: Nachtzeit = NACHTZEIT_VORGABE): number {
  const von = minuten(startTime);
  const bis0 = minuten(endTime);
  if (von === null || bis0 === null || von === bis0) return 0;
  const bis = bis0 > von ? bis0 : bis0 + 24 * 60;
  const tag = 24 * 60;
  let summe = 0;
  // Die Nächte des Vortags, des Tags und des Folgetags — mehr kann eine
  // Spanne von höchstens 24 Stunden nicht berühren.
  for (const k of [-1, 0, 1]) {
    const a = k * tag + nacht.von;
    const b = nacht.von < nacht.bis ? k * tag + nacht.bis : (k + 1) * tag + nacht.bis;
    summe += Math.max(0, Math.min(bis, b) - Math.max(von, a));
  }
  return summe;
}

export interface UeberstundenRegel {
  modell: 'zeitkonto' | 'tagesgrenze';
  grenze: 'tagessoll' | 'zehn';
  hundertSonnFeiertag: boolean;
}

export function ueberstundenRegelVon(
  company: Pick<Company, 'ueberstundenModell' | 'ueberstundenGrenze' | 'ueberstundenHundertSonnFeiertag'> | null | undefined,
): UeberstundenRegel {
  return {
    modell: company?.ueberstundenModell === 'tagesgrenze' ? 'tagesgrenze' : 'zeitkonto',
    grenze: company?.ueberstundenGrenze === 'zehn' ? 'zehn' : 'tagessoll',
    hundertSonnFeiertag: company?.ueberstundenHundertSonnFeiertag === true,
  };
}

/**
 * DIE NACHTSTUNDEN EINES EINTRAGS MIT KENNZEICHEN „NACHT“ (Testbericht
 * 30.09.2026, M35).
 *
 * Nur die Arbeitsminuten in der Nachtzeit des Betriebs (Vorgabe 22–6 Uhr).
 * Vorher trug das Kennzeichen die ganze Buchung: 20:00–23:30 ergab
 * dreieinhalb Nachtstunden statt anderthalb.
 *
 * DIE PAUSE GEHT ZUERST VON DER ZEIT AUSSERHALB DER NACHT AB — wo sie lag,
 * steht in keinem Eintrag, und so bleibt dem Arbeitnehmer im Zweifel die
 * Nachtstunde. Ohne Von/Bis ist nicht bekannt, wann gearbeitet wurde: dann
 * zählt wie bisher der ganze Eintrag.
 */
export function nachtArbeitMin(e: TimeEntry, nacht: Nachtzeit = NACHTZEIT_VORGABE): number {
  if (!e.isNightWork || e.status !== 'Anwesend') return 0;
  const gesamt = calcWorkMin(e);
  if (gesamt <= 0) return 0;
  if (!e.startTime || !e.endTime) return gesamt;
  const imNacht = nachtMinutenIn(e.startTime, e.endTime, nacht);
  const spanne = spanneMin(e.startTime, e.endTime);
  const pause = Number(e.breakDuration ?? 0) || 0;
  const ausserhalb = Math.max(0, spanne - imNacht);
  const pauseInDerNacht = Math.max(0, pause - ausserhalb);
  return Math.max(0, Math.min(gesamt, imNacht - pauseInDerNacht));
}

function spanneMin(startTime: string, endTime: string): number {
  const m = (t: string) => {
    const [h, mi] = t.split(':').map(Number);
    return h * 60 + mi;
  };
  const von = m(startTime);
  const bis = m(endTime);
  return bis > von ? bis - von : bis + 24 * 60 - von;
}
