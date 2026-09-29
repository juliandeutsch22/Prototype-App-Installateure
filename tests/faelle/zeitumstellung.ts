/**
 * Arbeitszeiten über die Zeitumstellung — dieselben Fälle für App und
 * Datenbank (offene Punkte B6).
 *
 * Die erwarteten Minuten hat Postgres 16 gerechnet (`… at time zone
 * 'Europe/Vienna'`); `tests/supabase/arbeitszeitUmstellung.test.ts` hält
 * `app.arbeitsminuten` in der CI gegen genau diese Tabelle, der Unit-Test
 * `calcWorkMin`.
 */
export const UMSTELLUNG: Array<{ datum: string; von: string; bis: string; minuten: number; was: string }> = [
  { datum: '2026-03-28', von: '22:00', bis: '06:00', minuten: 420, was: 'Nacht auf die Sommerzeit: sieben Stunden' },
  { datum: '2026-10-24', von: '22:00', bis: '06:00', minuten: 540, was: 'Nacht auf die Winterzeit: neun Stunden' },
  { datum: '2026-03-29', von: '00:00', bis: '08:00', minuten: 420, was: 'am Umstellungstag selbst, März' },
  { datum: '2026-10-25', von: '00:00', bis: '08:00', minuten: 540, was: 'am Umstellungstag selbst, Oktober' },
  { datum: '2026-03-29', von: '01:30', bis: '02:30', minuten: 60, was: 'in die Stunde, die es nicht gibt' },
  { datum: '2026-03-29', von: '02:30', bis: '04:00', minuten: 30, was: 'aus der Stunde, die es nicht gibt' },
  { datum: '2026-03-29', von: '02:00', bis: '03:00', minuten: 0, was: 'genau die Stunde, die es nicht gibt' },
  { datum: '2026-10-25', von: '01:30', bis: '02:30', minuten: 120, was: 'in die doppelte Stunde' },
  { datum: '2026-10-25', von: '02:30', bis: '03:30', minuten: 60, was: 'aus der doppelten Stunde' },
  { datum: '2026-10-25', von: '02:00', bis: '03:00', minuten: 60, was: 'die doppelte Stunde, einmal gezählt' },
  { datum: '2026-10-25', von: '03:00', bis: '02:00', minuten: 1380, was: 'über Mitternacht nach der Umstellung, Oktober' },
  { datum: '2026-03-29', von: '03:00', bis: '02:00', minuten: 1380, was: 'über Mitternacht nach der Umstellung, März' },
  { datum: '2027-03-27', von: '21:00', bis: '05:00', minuten: 420, was: 'ein anderes Jahr, März' },
  { datum: '2027-10-30', von: '21:00', bis: '05:00', minuten: 540, was: 'ein anderes Jahr, Oktober' },
  // Gegenproben: ohne Umstellung ändert sich nichts.
  { datum: '2026-07-10', von: '22:00', bis: '06:00', minuten: 480, was: 'Gegenprobe: eine Sommernacht' },
  { datum: '2026-01-10', von: '07:00', bis: '16:00', minuten: 540, was: 'Gegenprobe: ein Wintertag' },
  { datum: '2026-10-24', von: '07:00', bis: '07:00', minuten: 0, was: 'Gegenprobe: Beginn gleich Ende' },
];
