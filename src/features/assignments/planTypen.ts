import type { AppUser } from '@/types';
import { stufeImEinsatz } from './stufeImEinsatz';

/*
  Was der Wochen- und der Monatsplan je Person, Tag und Baustelle wissen.
  Nur Typen und die Gruppierung — gerechnet wird in `WochenplanView`, an
  einer Stelle für alle Darstellungen.
*/

/** Was in einer Zelle (Person × Tag) steht. */
export interface Zelle {
  /** Baustellen, auf denen diese Person an dem Tag steht. */
  baustellen: { nummer: string; name: string; helfer: boolean; zeit: string | null }[];
  /** Den ganzen Tag weg — Urlaub, ganztägiger ZA, krank. */
  imUrlaub: boolean;
  /** Was in der Zelle steht: „Urlaub", „ZA", „Krank" — oder „abwesend". */
  abwesendText: string | null;
}

/** Eine Baustelle an einem Tag: wer dort ist, wer als Helfer, wer fehlt. */
export interface TagBaustelle {
  nummer: string;
  name: string;
  namen: string[];
  helfer: string[];
  fehlen: string[];
  zeit: string | null;
}

/** Ein Tag zusammengefasst. */
export interface TagStand {
  baustellen: TagBaustelle[];
  frei: string[];
  urlaub: string[];
}

export type Brett = Map<string, Map<string, Zelle>>;

/** Eine Gruppe von Personen im Raster — nach Einstufung, die Projektleitung für sich. */
export interface Gruppe {
  name: string;
  leute: AppUser[];
}

const FOLGE: { stufe: string; mehrzahl: string }[] = [
  { stufe: 'Obermonteur', mehrzahl: 'Obermonteure' },
  { stufe: 'Facharbeiter', mehrzahl: 'Facharbeiter' },
  { stufe: 'Helfer', mehrzahl: 'Helfer' },
  { stufe: 'Lehrling', mehrzahl: 'Lehrlinge' },
  { stufe: 'Projektleitung', mehrzahl: 'Projektleitung' },
];

/**
 * DIE PERSONEN NACH EINSTUFUNG (Linie „Lot“, E2: viele Daten). Bei zwanzig
 * Leuten sucht man nicht „Max“, sondern „welcher Facharbeiter ist frei“.
 * Die Projektleitung, seit 30.09.2026 einplanbar (M38), steht für sich.
 * Innerhalb der Gruppe bleibt die Reihenfolge des Aufrufers (nach Namen).
 */
export function nachEinstufung(staff: AppUser[]): Gruppe[] {
  const gruppeVon = (u: AppUser) => (u.role === 'Projektleiter' ? 'Projektleitung' : stufeImEinsatz(false, u));
  return FOLGE.map((g) => ({ name: g.mehrzahl, leute: staff.filter((u) => gruppeVon(u) === g.stufe) })).filter(
    (g) => g.leute.length > 0,
  );
}

/** „Mi.“ und „02.09.“ — für Spaltenköpfe und Vorlesetexte. */
export function tagKurz(iso: string): { wochentag: string; datum: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    wochentag: d.toLocaleDateString('de-AT', { weekday: 'short' }),
    datum: d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }),
  };
}
