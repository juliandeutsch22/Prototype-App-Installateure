import type { Freistellung, TimeEntry } from '@/types';

/** Ein Eintrag, der zur selben Uhrzeit wie der Termin gebucht ist. */
export interface Ueberschneidung {
  status: TimeEntry['status'];
  von: string;
  bis: string;
}

type Antrag = Pick<Freistellung, 'id' | 'von' | 'zeitVon' | 'zeitBis'>;
type Eintrag = Pick<TimeEntry, 'date' | 'status' | 'startTime' | 'endTime' | 'freistellungId'>;

const TEILFREI: readonly TimeEntry['status'][] = ['Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung'];

function minuten(hhmm?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);
}

/**
 * Was am Tag eines stundenweisen Antrags zur selben Uhrzeit gebucht ist —
 * dieselbe Auswahl wie `freistellung_entscheiden` beim Bestätigen: Arbeitszeit
 * (auch die Nachtschicht vom Vortag, die in den Termin reicht) und andere
 * stundenweise freie Zeit desselben Tages. Steht hier etwas, lehnt die
 * Datenbank das Bestätigen ab; die Karte sagt es vorher.
 *
 * Ganztägiges zählt nicht hierher: das nennt die Karte eigens.
 */
export function ueberschneidungen(f: Antrag, eintraege: readonly Eintrag[]): Ueberschneidung[] {
  const anfang = minuten(f.zeitVon);
  const ende = minuten(f.zeitBis);
  if (anfang === null || ende === null || ende <= anfang) return [];
  const treffer: Ueberschneidung[] = [];
  for (const e of eintraege) {
    if (e.freistellungId === f.id) continue;
    const abstand = tageZwischen(f.von, e.date);
    const arbeit = e.status === 'Anwesend';
    // Arbeit am Vortag kann über Mitternacht in den Termin reichen; freie Zeit nur am Tag selbst.
    if (!(abstand === 0 || (arbeit && abstand === -1))) continue;
    if (!arbeit && !TEILFREI.includes(e.status)) continue;
    const von = minuten(e.startTime);
    const bis = minuten(e.endTime);
    if (von === null || bis === null || von === bis) continue;
    const s = von + abstand * 1440;
    const z = (bis > von ? bis : bis + 1440) + abstand * 1440;
    if (s < ende && anfang < z) {
      treffer.push({ status: e.status, von: e.startTime!.slice(0, 5), bis: e.endTime!.slice(0, 5) });
    }
  }
  return treffer.sort((a, b) => a.von.localeCompare(b.von));
}
