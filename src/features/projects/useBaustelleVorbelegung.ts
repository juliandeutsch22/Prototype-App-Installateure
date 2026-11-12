import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUserInRange } from '@/lib/db/assignments';
import { listProjectsByNumbers } from '@/lib/db/projects';
import { letzteEigeneBaustelle } from '@/lib/db/timeEntries';
import { todayStr } from '@/lib/time';
import { timerBaustelle } from '@/lib/zeitsitzung';
import { useZeitsitzung } from '@/features/time/zeitsitzungStand';
import { baustelleVorbelegen, zuletztLesen, type Vorbelegung } from '@/lib/baustelleVorbelegen';

/**
 * Die Vorbelegung nach der einen Regel (`baustelleVorbelegen`) — für den
 * angemeldeten Menschen und einen Tag (ab Werk heute).
 *
 * `undefined`, solange die Einsätze noch kommen: sonst belegte ein Formular
 * mit „zuletzt benutzt“ vor, und eine Augenblick später gefundene Einteilung
 * käme zu spät, weil das Feld nicht mehr leer ist.
 *
 * „ZULETZT BENUTZT“ kommt vom Gerät (das zuletzt Abgeschickte: Material,
 * Schein, Zeit, Start), sonst aus der letzten eigenen Buchung auf dem Server
 * — so steht sie auch auf einem neuen Telefon. Beides wird geprüft: eine
 * inzwischen abgeschlossene Baustelle wird nicht vorbelegt.
 */
export function useBaustelleVorbelegung({
  aktiv = true,
  datum,
  waehlbar,
  mehrdeutigErster = false,
}: {
  aktiv?: boolean;
  datum?: string;
  waehlbar?: (nr: string) => boolean;
  mehrdeutigErster?: boolean;
} = {}): Vorbelegung | null | undefined {
  const { user } = useAuth();
  const z = useZeitsitzung();
  const tag = datum || todayStr();
  const [stand, setStand] = useState<{ tag: string; nummern: string[]; zuletzt: string | null } | null>(null);

  // Nach Betrieb und Person, nicht nach dem Objekt: ein neu gebautes `user` holte sonst bei jedem Zeichnen neu.
  const betrieb = user?.companyId;
  const uid = user?.uid;
  useEffect(() => {
    if (!aktiv || !betrieb || !uid) return;
    let weg = false;
    (async () => {
      const liste = await Promise.resolve().then(() => listAssignmentsForUserInRange(betrieb, uid, tag, tag)).catch(() => []);
      // Ohne Uhrzeit hinten — wie im Einsatzplan.
      const nummern = [...liste]
        .sort((a, b) => (a.zeitVon || '99').localeCompare(b.zeitVon || '99'))
        .map((a) => a.projectNumber)
        .filter(Boolean);
      // Nur gebraucht, wenn die Einsätze nicht eindeutig entscheiden; sonst spart es die Abfrage.
      const zuletzt = zuletztLesen(betrieb, uid)
        ?? (new Set(nummern).size === 1 ? null
          : await Promise.resolve().then(() => letzteEigeneBaustelle(betrieb, uid)).catch(() => null));
      let gueltig: string | null = null;
      if (zuletzt) {
        const treffer = await Promise.resolve().then(() => listProjectsByNumbers(betrieb, [zuletzt])).catch(() => []);
        if (treffer.some((p) => p.projectNumber === zuletzt && p.status !== 'Abgeschlossen')) gueltig = zuletzt;
      }
      if (!weg) setStand({ tag, nummern, zuletzt: gueltig });
    })();
    return () => { weg = true; };
  }, [aktiv, betrieb, uid, tag]);

  if (!aktiv || !user) return null;
  if (!stand || stand.tag !== tag) return undefined;
  // Der Timer gilt nur für heute: ein Schein für gestern gehört nicht auf die Baustelle von jetzt.
  const timer = tag === todayStr() && z.laeuft ? timerBaustelle(z.laeuft) : null;
  return baustelleVorbelegen({
    timer,
    einsaetze: stand.nummern,
    zuletzt: stand.zuletzt,
    waehlbar,
    mehrdeutigErster,
  });
}
