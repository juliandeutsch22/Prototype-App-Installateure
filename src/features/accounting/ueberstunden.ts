import type { AppUser, TimeEntry } from '@/types';
import { calcWorkMin, tagesAnteil, tagessollStunden } from '@/lib/time';
import { isAustrianHoliday } from '@shared/feiertage';
import type { UeberstundenRegel } from '@/lib/lohnregeln';

/**
 * ÜBERSTUNDEN NACH TAGESGRENZE (Testbericht 30.09.2026, Paket 2c).
 *
 * Nur, wenn der Betrieb das Modell „Tagesgrenze“ gewählt hat; die Vorgabe
 * bleibt das Zeitkonto (Gleitzeit mit Saldo), und dort gibt es diese Zahl
 * nicht. Ausgewiesen werden STUNDEN, in Lohn-CSV und Stundennachweis — nie
 * Geld; die Bewertung macht die Lohnverrechnung.
 *
 * DIE REGEL, je Tag und Person:
 *  - Grenze ist das Tagessoll der Person (24./31.12. anteilig) oder, bei
 *    Gleitzeit, zehn Stunden.
 *  - An einem Tag ohne Soll (freier Wochentag, Feiertag) ist jede Stunde
 *    eine Überstunde.
 *  - Was über der Grenze liegt, ist eine Überstunde mit 50 %.
 *  - Ist „100 % an Sonn- und Feiertagen“ eingeschaltet, zählt dort jede
 *    Stunde mit 100 % statt mit 50 %.
 *
 * Gezählt wird nur `Anwesend`; Wegzeit zählt nicht (wie im Zeitkonto).
 */
export interface Ueberstunden {
  /** Überstunden mit 50 % Zuschlag, in Minuten. */
  fuenfzigMin: number;
  /** Überstunden mit 100 % Zuschlag (Sonn- und Feiertag), in Minuten. */
  hundertMin: number;
}

export const KEINE_UEBERSTUNDEN: Ueberstunden = { fuenfzigMin: 0, hundertMin: 0 };

export function ueberstundenNachTagesgrenze(
  user: Pick<AppUser, 'weeklyTargetHours' | 'workDays' | 'tagessoll'>,
  eintraege: TimeEntry[],
  regel: UeberstundenRegel,
  halbeTage: boolean,
): Ueberstunden {
  if (regel.modell !== 'tagesgrenze') return KEINE_UEBERSTUNDEN;

  const jeTag = new Map<string, number>();
  for (const e of eintraege) {
    if (e.status !== 'Anwesend') continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    jeTag.set(e.date, (jeTag.get(e.date) ?? 0) + min);
  }

  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  let fuenfzigMin = 0;
  let hundertMin = 0;
  for (const [iso, min] of jeTag) {
    const tag = new Date(`${iso}T00:00:00`);
    const feiertag = isAustrianHoliday(tag);
    if (regel.hundertSonnFeiertag && (tag.getDay() === 0 || feiertag)) {
      hundertMin += min;
      continue;
    }
    const arbeitstag = workDays.includes(tag.getDay()) && !feiertag;
    const grenze = !arbeitstag
      ? 0
      : regel.grenze === 'zehn'
        ? 10 * 60
        : Math.round(tagessollStunden(user, iso) * tagesAnteil(iso, halbeTage) * 60);
    fuenfzigMin += Math.max(0, min - grenze);
  }
  return { fuenfzigMin, hundertMin };
}
