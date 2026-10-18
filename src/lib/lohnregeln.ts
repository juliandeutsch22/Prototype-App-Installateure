import type { Company, TimeEntry } from '@/types';
import { calcWorkMin } from '@shared/arbeitszeit';

/**
 * DIE LOHNREGELN EINES BETRIEBS — Nachtzeit und Überstundenmodell
 * (Testbericht 30.09.2026, M35 und Paket 2c).
 *
 * Nur Einstellungen und Uhrzeitrechnung; ausgewiesen werden Stunden, nie
 * Geld. Die Bewertung macht die Lohnverrechnung, die den Vertrag kennt.
 * Nach dem Kollektivvertrag Metallgewerbe, am Text 2026 nachgeprüft
 * (18.10.2026, `docs/recherche-fragenkataloge.md`).
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
 * Deckt die Nachtzeit 22 bis 6 Uhr ganz ab? So weit reicht die
 * Nachtarbeitszulage nach dem Kollektivvertrag Metallgewerbe (Abschnitt XIV
 * Pkt 5); kürzer darf ein Betrieb unter diesem KV nicht gehen, denn
 * abweichen darf er nur zugunsten der Arbeitnehmer (§ 3 Abs 1 ArbVG).
 */
export function decktKvNacht(n: Nachtzeit): boolean {
  return n.von > n.bis && n.von <= 22 * 60 && n.bis >= 6 * 60;
}

/** Die Minuten eines Tages (0–1439), die ein Fenster umfasst. */
function fensterMaske(n: Nachtzeit): boolean[] {
  const maske = new Array<boolean>(24 * 60).fill(false);
  for (let m = 0; m < 24 * 60; m += 1) {
    maske[m] = n.von < n.bis ? m >= n.von && m < n.bis : m >= n.von || m < n.bis;
  }
  return maske;
}

/**
 * Wo zwei Zeitfenster sich überschneiden — als höchstens zwei Fenster, weil
 * zwei Fenster über Mitternacht sich auch in zwei Stücken treffen können.
 */
export function fensterSchnitt(a: Nachtzeit, b: Nachtzeit): Nachtzeit[] {
  const ma = fensterMaske(a);
  const mb = fensterMaske(b);
  const drin = ma.map((x, i) => x && mb[i]);
  if (drin.every(Boolean)) return [{ von: 0, bis: 24 * 60 - 1 }];
  // Von einer Minute ausserhalb aus laufen, damit kein Stück am Tagesrand zerfällt.
  const start = drin.findIndex((x) => !x);
  const stuecke: Nachtzeit[] = [];
  let von: number | null = null;
  for (let k = 1; k <= 24 * 60; k += 1) {
    const m = (start + k) % (24 * 60);
    if (drin[m] && von === null) von = m;
    if (!drin[m] && von !== null) {
      stuecke.push({ von, bis: m });
      von = null;
    }
  }
  return stuecke;
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
  /**
   * Die Zuschläge des Kollektivvertrags Metallgewerbe für Arbeiter
   * (Abschnitt XIV Pkt 8–11) — ab Werk an, wie die Regel für den 24./31.12.
   * Siehe `features/accounting/ueberstunden.ts`.
   */
  kvMetall: boolean;
}

export function ueberstundenRegelVon(
  company: Pick<Company, 'ueberstundenModell' | 'ueberstundenGrenze' | 'ueberstundenHundertSonnFeiertag' | 'ueberstundenKvMetall'> | null | undefined,
): UeberstundenRegel {
  return {
    modell: company?.ueberstundenModell === 'tagesgrenze' ? 'tagesgrenze' : 'zeitkonto',
    grenze: company?.ueberstundenGrenze === 'zehn' ? 'zehn' : 'tagessoll',
    hundertSonnFeiertag: company?.ueberstundenHundertSonnFeiertag === true,
    kvMetall: company?.ueberstundenKvMetall !== false,
  };
}

/**
 * DIE NACHTSTUNDEN EINES EINTRAGS (Testbericht 30.09.2026, M35; Runde 3, M4).
 *
 * Nur die Arbeitsminuten in der Nachtzeit des Betriebs (Vorgabe 22–6 Uhr).
 * Vorher trug das Kennzeichen die ganze Buchung: 20:00–23:30 ergab
 * dreieinhalb Nachtstunden statt anderthalb.
 *
 * SEIT RUNDE 3 OHNE HAKEN: Die Minuten zählen von selbst, sobald Von und Bis
 * in die Nachtzeit fallen. Ausgenommen:
 *   - eine Buchung, die jemand mit Grund abgewählt hat (`nachtAbgewaehlt`);
 *   - eine VERRECHNETE Buchung ohne Kennzeichen — sie ist so verrechnet und
 *     bleibt so (die Datenbank setzt das Kennzeichen ab jetzt spätestens beim
 *     Verrechnen; was davor ohne verrechnet wurde, bleibt ohne).
 *
 * DIE PAUSE GEHT ZUERST VON DER ZEIT AUSSERHALB DER NACHT AB — wo sie lag,
 * steht in keinem Eintrag, und so bleibt dem Arbeitnehmer im Zweifel die
 * Nachtstunde. Ohne Von/Bis ist nicht bekannt, wann gearbeitet wurde: dann
 * zählt wie bisher der ganze Eintrag, wenn der Haken gesetzt ist.
 */
export function nachtArbeitMin(e: TimeEntry, nacht: Nachtzeit = NACHTZEIT_VORGABE): number {
  if (e.status !== 'Anwesend') return 0;
  const gesamt = calcWorkMin(e);
  if (gesamt <= 0) return 0;
  if (!e.startTime || !e.endTime) return e.isNightWork ? gesamt : 0;
  if (e.nachtAbgewaehlt?.trim()) return 0;
  if (e.isBilled && !e.isNightWork) return 0;
  return arbeitMinImFenster(e, nacht);
}

/**
 * Die Arbeitsminuten eines Eintrags mit Von und Bis, die in ein Zeitfenster
 * fallen — die Pause geht zuerst von der Zeit ausserhalb ab, wie bei den
 * Nachtstunden. Ohne Von/Bis null: wann gearbeitet wurde, ist nicht bekannt.
 */
export function arbeitMinImFenster(e: TimeEntry, fenster: Nachtzeit): number {
  if (e.status !== 'Anwesend' || !e.startTime || !e.endTime) return 0;
  const gesamt = calcWorkMin(e);
  if (gesamt <= 0) return 0;
  const imFenster = nachtMinutenIn(e.startTime, e.endTime, fenster);
  const spanne = spanneMin(e.startTime, e.endTime);
  const pause = Number(e.breakDuration ?? 0) || 0;
  const ausserhalb = Math.max(0, spanne - imFenster);
  const pauseImFenster = Math.max(0, pause - ausserhalb);
  return Math.max(0, Math.min(gesamt, imFenster - pauseImFenster));
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
