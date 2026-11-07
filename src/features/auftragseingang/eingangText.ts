/**
 * Der Auftragseingang in Worten (M02b) — Quelle, Dringlichkeit, Stand und
 * die Pflichtangaben. Ohne Oberfläche, damit es sich prüfen lässt.
 */
import type { Auftragseingang, EingangDringlichkeit, EingangQuelle, EingangStand } from '@/types';
import type { Stand } from '@/components/Badge';

export const QUELLE_TEXT: Record<EingangQuelle, string> = {
  telefon: 'Telefon',
  email: 'E-Mail',
  hausverwaltung: 'Hausverwaltung',
  versicherung: 'Versicherung',
  persoenlich: 'Persönlich',
  sonstige: 'Sonstige',
};

export const DRINGLICHKEIT_TEXT: Record<EingangDringlichkeit, string> = {
  normal: 'Normal',
  dringend: 'Dringend',
  notfall: 'Notfall',
};

export const STAND_TEXT: Record<EingangStand, string> = {
  offen: 'Offen',
  uebernommen: 'Übernommen',
  abgelehnt: 'Abgelehnt',
};

/** Die Reiter der Liste — auch in der Adresse (`?stand=`). */
export const STAENDE: readonly EingangStand[] = ['offen', 'uebernommen', 'abgelehnt'];

/**
 * Wie ein Eingang in der Liste dasteht: ein Notfall ist „Fehler“-rot, ein
 * dringender „Achtung“ — so sticht hervor, was zuerst dran ist. Übernommen
 * ist erledigt, abgelehnt gilt nicht mehr.
 */
export function zustandVon(e: Pick<Auftragseingang, 'stand' | 'dringlichkeit'>): { stand: Stand; text: string } {
  if (e.stand === 'uebernommen') return { stand: 'erledigt', text: STAND_TEXT.uebernommen };
  if (e.stand === 'abgelehnt') return { stand: 'storniert', text: STAND_TEXT.abgelehnt };
  if (e.dringlichkeit === 'notfall') return { stand: 'schlecht', text: DRINGLICHKEIT_TEXT.notfall };
  if (e.dringlichkeit === 'dringend') return { stand: 'achtung', text: DRINGLICHKEIT_TEXT.dringend };
  return { stand: 'offen', text: STAND_TEXT.offen };
}

/** Für wen: der Kunde bzw. der neue Kunde — oder dass noch keiner gewählt ist. */
export function kundeText(e: Pick<Auftragseingang, 'kundeName' | 'customerId'>): string {
  return e.kundeName?.trim() || 'Ohne Kunde';
}

/** Was das Formular hält — als Text, wie es aus den Feldern kommt. */
export interface EingangFormularStand {
  quelle: EingangQuelle | '';
  auftraggeberNummer: string;
  kundeArt: 'vorhanden' | 'neu';
  customerId: string;
  neukundeName: string;
  neukundeStrasse: string;
  neukundePlz: string;
  neukundeOrt: string;
  neukundeTelefon: string;
  neukundeEmail: string;
  ort: string;
  ansprechpartnerName: string;
  ansprechpartnerTelefon: string;
  anliegen: string;
  dringlichkeit: EingangDringlichkeit;
  wunschtermin: string;
  /** `JJJJ-MM-TTTHH:MM`, Ortszeit — wie ein `datetime-local`-Feld. */
  eingegangenAm: string;
}

/**
 * Was fehlt — `null`, wenn alles da ist. Dieselben Pflichtangaben prüft die
 * Datenbank (Quelle und Anliegen als Spalten, Kunde oder neuer Kunde im
 * Auslöser); hier steht es, bevor jemand auf „Speichern“ wartet.
 */
export function eingangFehler(f: EingangFormularStand): string | null {
  if (!f.quelle) return 'Bitte angeben, woher der Eingang kam.';
  if (f.kundeArt === 'vorhanden' && !f.customerId) return 'Bitte einen Kunden wählen — oder „Neuer Kunde“.';
  if (f.kundeArt === 'neu' && !f.neukundeName.trim()) return 'Bitte den Namen des neuen Kunden angeben.';
  if (!f.anliegen.trim()) return 'Bitte das Anliegen beschreiben.';
  if (f.anliegen.length > 4000) return 'Das Anliegen ist zu lang (höchstens 4000 Zeichen).';
  if (f.neukundeEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.neukundeEmail.trim())) {
    return 'Die E-Mail-Adresse des neuen Kunden sieht nicht vollständig aus.';
  }
  if (!f.eingegangenAm) return 'Bitte angeben, wann der Eingang kam.';
  return null;
}

/** Millisekunden → `JJJJ-MM-TTTHH:MM` in Ortszeit (für ein `datetime-local`-Feld). */
export function alsFeldzeit(ms: number): string {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** `JJJJ-MM-TTTHH:MM` (Ortszeit) → Millisekunden. */
export function ausFeldzeit(wert: string): number {
  return new Date(wert).getTime();
}

/** Wann, für die Liste und die Akte: „07.11.2026, 09:14“. */
export function wannText(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Die Notiz einer Besichtigung aus dem Eingang — Ort, Ansprechpartner, Anliegen. */
export function besichtigungNotiz(e: Pick<Auftragseingang, 'nummer' | 'ort' | 'ansprechpartnerName' | 'ansprechpartnerTelefon' | 'anliegen'>): string {
  const vorOrt = [e.ansprechpartnerName?.trim(), e.ansprechpartnerTelefon?.trim()].filter(Boolean).join(', ');
  return [
    e.ort?.trim() ? `Ort: ${e.ort.trim()}` : '',
    vorOrt ? `Vor Ort: ${vorOrt}` : '',
    e.anliegen.trim(),
    `Eingang ${e.nummer}`,
  ].filter(Boolean).join('\n');
}
