import { urlaubsTage } from '@shared/feiertage';
import type { TimeEntry } from '@/types';

/**
 * DIE RÜCKFRAGE VOR EINEM MEHRTÄGIGEN ZEITRAUM (Testbericht Runde 6, M3 und
 * G12).
 *
 * Wer einen vergangenen Krankheitstag nachtrug, bekam still eine
 * Krankmeldung bis heute: „Krank bis“ blieb beim Ändern des Datums stehen.
 * Das Feld zieht jetzt mit; dazu nennt die Maske vor dem Speichern, welche
 * Tage es werden — „21.10.–27.10.2026: 7 Tage, davon 3 Arbeitstage …“ —,
 * damit ein ungewollter Zeitraum auffällt, bevor er im Zeitkonto steht.
 *
 * DIESELBEN TAGE WIE DIE DATENBANK: Arbeitstage der Person ohne Feiertage
 * (`urlaubsTage` = `app.urlaubstage`), übersprungen wird ein Tag, an dem
 * schon etwas steht — bei der Berufsschule nur, wenn es keine Arbeit ist
 * (seit M1 kommt der Schultag neben gearbeitete Zeit).
 */
export type ZeitraumArt = 'Krank' | 'Urlaub' | 'Berufsschule';

const NAME: Record<ZeitraumArt, string> = {
  Krank: 'Krankmeldung',
  Urlaub: 'Urlaub',
  Berufsschule: 'Berufsschule',
};

/** „21.10.“ */
function tagMonat(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

/** „21.10., 23.10. und 27.10.“ — ab elf Tagen nur die Zahl. */
function liste(tage: string[]): string {
  if (tage.length > 10) return `${tage.length} Tage`;
  const t = tage.map(tagMonat);
  return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} und ${t[t.length - 1]}`;
}

function kalendertage(von: string, bis: string): number {
  const ms = Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10))
    - Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10));
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Titel und Text der Rückfrage. `gebucht`: die Einträge der Person im
 * Zeitraum — `null`, wenn sie nicht geladen werden konnten (dann ohne
 * Aufzählung der gebuchten Tage).
 */
export function zeitraumFrage(
  art: ZeitraumArt,
  von: string,
  bis: string,
  workDays: number[] | undefined,
  gebucht: ReadonlyArray<Pick<TimeEntry, 'date' | 'status'>> | null,
): { titel: string; text: string } {
  const anzahl = kalendertage(von, bis);
  const arbeitstage = urlaubsTage(workDays, von, bis);
  const steht = (tag: string) => (gebucht ?? []).filter((e) => e.date === tag);
  const bleibt = arbeitstage.filter((t) => steht(t).some((e) => art !== 'Berufsschule' || e.status !== 'Anwesend'));
  const neu = arbeitstage.filter((t) => !bleibt.includes(t));
  const mitArbeit = art === 'Berufsschule' ? neu.filter((t) => steht(t).length > 0) : [];

  const kopf = `${tagMonat(von)}–${tagMonat(bis)}${bis.slice(0, 4)}: ${anzahl} Tage`;
  const teile = [
    neu.length === 0
      ? `${kopf}, darin kein freier Arbeitstag — eingetragen wird nichts.`
      : `${kopf}, davon ${neu.length === 1 ? 'ein Arbeitstag' : `${neu.length} Arbeitstage`} als „${art}“ im Zeitkonto (${liste(neu)}).`,
  ];
  if (gebucht === null) {
    teile.push('Schon gebuchte Tage bleiben, wie sie sind.');
  } else if (bleibt.length > 0) {
    teile.push(`${liste(bleibt)} ${bleibt.length === 1 ? 'ist schon gebucht und bleibt' : 'sind schon gebucht und bleiben'}.`);
  }
  if (mitArbeit.length > 0) {
    teile.push(`An ${liste(mitArbeit)} ist schon Arbeit gebucht — sie bleibt, die Berufsschule kommt dazu.`);
  }
  return { titel: `${NAME[art]} über ${anzahl} Tage?`, text: teile.join(' ') };
}
