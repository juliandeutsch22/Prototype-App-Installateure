import type { AppUser, TimeEntry } from '@/types';
import {
  calcWorkMin,
  fmtMin,
  getAustrianHolidayName,
  localDateStr,
  pflichtTage,
  tagesAnteil,
  tagesStatusName,
  tagessollStunden,
} from '@/lib/time';

/**
 * DER MONAT ALS RASTER: Personen × Tage, je Zelle die gebuchte Zeit (Linie
 * „Lot“, Protokoll E9).
 *
 * WOFÜR. Beim Monatsabschluss fragt die Buchhaltung „wo fehlt etwas?“. Die
 * Liste darunter beantwortet das je Person mit einer Zahl („4 Tage fehlen“);
 * welche Tage es sind und ob sie sich etwa um einen Feiertag ballen, sah man
 * erst nach dem Aufklappen, Person für Person. Im Raster steht der ganze
 * Monat auf einen Blick, die fehlenden Tage mit Bernstein-Rand.
 *
 * NUR DARSTELLUNG. Was ein Solltag ist und was fehlt, kommt aus denselben
 * Funktionen wie Saldo und Vollständigkeit (`pflichtTage`, `tagessollStunden`,
 * `calcCompleteness` beim Aufrufer). Gerechnet wird hier nichts Neues; das
 * Soll des Tages steht im Titel der Zelle, damit sich Ist und Soll Tag für
 * Tag vergleichen lassen, ohne die Zelle zu überladen.
 *
 * AM TELEFON GIBT ES DAS RASTER NICHT. 31 Spalten auf 390 px wären
 * unlesbar; dort zeigt jede Zeile der Liste die fehlenden Tage selbst.
 */

export interface RasterZeile {
  user: AppUser;
  monthEntries: TimeEntry[];
  /** Die Tage ohne Buchung, wie die Vollständigkeit sie meldet. */
  fehlend: readonly string[];
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Kurzzeichen ganztägiger Abwesenheiten — die Legende unter dem Raster nennt sie. */
const KURZ: Record<Exclude<TimeEntry['status'], 'Anwesend'>, string> = {
  Krank: 'K',
  Urlaub: 'U',
  Zeitausgleich: 'ZA',
  Berufsschule: 'BS',
  Dienstverhinderung: 'SU',
  Pflegefreistellung: 'PF',
  Unbezahlt: 'UU',
};

/** „8:00“ statt „08:00“: in einer 30 px breiten Zelle zählt jedes Zeichen. */
function kurzeZeit(min: number): string {
  return fmtMin(min).replace(/^0(\d:)/, '$1');
}

function tageDesMonats(jahr: number, monat: number): string[] {
  const letzter = new Date(jahr, monat + 1, 0).getDate();
  return Array.from({ length: letzter }, (_, i) => localDateStr(new Date(jahr, monat, i + 1)));
}

export default function MonatsRaster({
  zeilen,
  jahr,
  monat,
  monatsName,
  halbeTage,
  onOeffnen,
}: {
  zeilen: RasterZeile[];
  jahr: number;
  monat: number;
  monatsName: string;
  halbeTage: boolean;
  /** Öffnet die Einzelheiten der Person in der Liste darunter. */
  onOeffnen: (uid: string) => void;
}) {
  if (zeilen.length === 0) return null;
  const tage = tageDesMonats(jahr, monat);
  const heute = localDateStr(new Date());
  const erster = new Date(jahr, monat, 1);
  const letzter = new Date(jahr, monat + 1, 0);

  return (
    <div className="zeitraster-huelle">
      <div className="zeitraster-rolle">
        <table className="zeitraster" aria-label={`Gebuchte Zeit je Tag, ${monatsName}`}>
          <thead>
            <tr>
              <th scope="col" className="zeitraster-ecke">
                Mitarbeiter
              </th>
              {tage.map((d) => {
                const wt = WOCHENTAGE[new Date(`${d}T00:00:00`).getDay()];
                return (
                  <th
                    key={d}
                    scope="col"
                    abbr={`${wt} ${d.slice(8)}.${d.slice(5, 7)}.`}
                    className={d === heute ? 'zeitraster-tag-heute' : 'zeitraster-tag'}
                  >
                    <span className="zeitraster-wt">{wt}</span>
                    {Number(d.slice(8))}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {zeilen.map(({ user: u, monthEntries, fehlend }) => {
              const workDays = u.workDays && u.workDays.length ? u.workDays : [1, 2, 3, 4, 5];
              const pflicht = new Set(pflichtTage(u, erster, letzter));
              const fehlt = new Set(fehlend);
              return (
                <tr key={u.uid}>
                  <th scope="row" className="zeitraster-name">
                    {/* Ein Sprung in die Liste, kein Knopf: die Einzelheiten
                        stehen weiter unten auf derselben Seite. */}
                    <a
                      href={`#ma-${u.uid}`}
                      className="zeitraster-link"
                      onClick={(e) => {
                        e.preventDefault();
                        onOeffnen(u.uid);
                      }}
                    >
                      {u.name}
                    </a>
                  </th>
                  {tage.map((d) => {
                    const datum = new Date(`${d}T00:00:00`);
                    const feiertag = getAustrianHolidayName(datum);
                    const frei =
                      !workDays.includes(datum.getDay()) || !!feiertag || (!!u.appStartDate && d < u.appStartDate);
                    const amTag = monthEntries.filter((e) => e.date === d);
                    const ist = amTag.reduce((s, e) => s + calcWorkMin(e), 0);
                    const abwesend = amTag.find((e) => e.status !== 'Anwesend');
                    const soll = pflicht.has(d)
                      ? Math.round(tagesAnteil(d, halbeTage) * tagessollStunden(u, d) * 60)
                      : null;
                    const inhalt =
                      ist > 0 ? kurzeZeit(ist) : abwesend ? KURZ[abwesend.status as keyof typeof KURZ] ?? '' : '';
                    const teile = [
                      `${u.name}, ${WOCHENTAGE[datum.getDay()]} ${d.slice(8)}.${d.slice(5, 7)}.`,
                      feiertag ?? '',
                      fehlt.has(d) ? 'keine Buchung' : '',
                      ist > 0 ? `${fmtMin(ist)} gebucht` : '',
                      ...amTag.filter((e) => e.status !== 'Anwesend').map((e) => tagesStatusName(e.status)),
                      soll !== null ? `Soll ${fmtMin(soll)}` : '',
                    ].filter(Boolean);
                    const klasse = fehlt.has(d)
                      ? 'zeitraster-fehlt'
                      : frei
                        ? 'zeitraster-frei'
                        : abwesend && ist === 0
                          ? 'zeitraster-weg'
                          : 'zeitraster-zelle';
                    return (
                      <td key={d} className={klasse} title={teile.join(' · ')} aria-label={teile.join(' · ')}>
                        {inhalt}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="zeitraster-legende">
        Rand in Bernstein: Arbeitstag ohne Buchung · grau: frei oder Feiertag · K Krank · U Urlaub · ZA
        Zeitausgleich · BS Berufsschule · SU Sonderurlaub · PF Pflegefreistellung · UU unbezahlt. Am
        Schreibtisch nennt jede Zelle beim Darüberfahren auch das Soll des Tages.
      </p>
    </div>
  );
}
