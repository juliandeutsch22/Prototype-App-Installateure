import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listApprovedVacationsInRange } from '@/lib/db/vacations';
import { subscribeAssignmentsInRange } from '@/lib/db/assignments';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment, Vacation } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { montagDer, wocheAb, wocheVerschoben } from './wochenplan';

/**
 * Das Wochenbrett: wer ist diese Woche wo — und wer ist frei.
 *
 * WELCHE FRAGE ES BEANTWORTET, und warum die Tagesplanung sie nicht kann.
 * Dort steht ein Tag und eine Baustelle. Wer wissen will, ob Donnerstag noch
 * jemand frei ist, muss sich durch sieben Tage klicken und sich die Namen
 * merken. Bei zwanzig Mitarbeitern behält das niemand im Kopf — und genau
 * daran scheitert die Planung, nicht am Eintragen.
 *
 * ES WIRD HIER NICHTS GESCHRIEBEN, und das ist eine Entscheidung, keine
 * Auslassung. Das Speichern der Einteilung ist ein „alles weg, dann alles
 * neu" für das Paar aus Tag und Baustelle; ein zweiter Schreibweg daneben
 * hieße, denselben gefährlichen Vorgang zweimal richtig hinzubekommen und
 * zweimal richtig zu halten. Ein Tipp auf eine Zelle führt deshalb in die
 * Tagesplanung — mit Tag und Baustelle schon eingestellt.
 *
 * Die Ansicht ersetzt die Tagesplanung also NICHT, sie beantwortet die
 * Frage davor.
 */

function tagKurz(iso: string): { wochentag: string; datum: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    wochentag: d.toLocaleDateString('de-AT', { weekday: 'short' }),
    datum: d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }),
  };
}

/** Was in einer Zelle steht. */
interface Zelle {
  /** Kundennamen der Baustellen, auf denen diese Person an dem Tag steht. */
  baustellen: { nummer: string; name: string; helfer: boolean }[];
  imUrlaub: boolean;
}

export default function WochenplanView() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [montag, setMontag] = useState(() => montagDer(todayStr()));
  const [users, setUsers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [einsaetze, setEinsaetze] = useState<WithId<Assignment>[]>([]);
  const [urlaube, setUrlaube] = useState<WithId<Vacation>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);

  const tage = useMemo(() => wocheAb(montag), [montag]);
  const bis = tage[6];

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch(() => setNebenFehler('Die Belegschaft'));
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeAssignmentsInRange(user.companyId, montag, bis, setEinsaetze, (e) =>
      setError(e.message),
    );
  }, [user, montag, bis]);

  /**
   * Der genehmigte Urlaub der Woche.
   *
   * Nur der GENEHMIGTE: ein beantragter ist noch keiner, und ihn hier als
   * Abwesenheit zu zeigen hieße, die Entscheidung vorwegzunehmen.
   */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listApprovedVacationsInRange(user.companyId, montag, bis)
      .then((r) => {
        if (!verworfen) setUrlaube(r);
      })
      .catch(() => {
        if (!verworfen) setUrlaube([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, montag, bis]);

  // Nur Außendienst wird eingeplant — dieselbe Auswahl wie in der Tagesplanung.
  const staff = useMemo(
    () =>
      users
        .filter((u) => u.role === 'Mitarbeiter' && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );

  /** uid -> Tag -> was dort steht. */
  const brett = useMemo(() => {
    const m = new Map<string, Map<string, Zelle>>();
    const hole = (uid: string, tag: string): Zelle => {
      const proTag = m.get(uid) ?? new Map<string, Zelle>();
      m.set(uid, proTag);
      const z = proTag.get(tag) ?? { baustellen: [], imUrlaub: false };
      proTag.set(tag, z);
      return z;
    };
    for (const a of einsaetze) {
      const proj = projects.find((p) => p.projectNumber === a.projectNumber);
      hole(a.userId, a.date).baustellen.push({
        nummer: a.projectNumber,
        name: proj?.customerName ?? a.projectNumber,
        helfer: !!a.asHelper,
      });
    }
    for (const v of urlaube) {
      for (const tag of tage) {
        if (v.von <= tag && v.bis >= tag) hole(v.userId, tag).imUrlaub = true;
      }
    }
    return m;
  }, [einsaetze, urlaube, projects, tage]);

  /** Wie viele sind an diesem Tag frei — die Zahl, um die es geht. */
  const freiJeTag = useMemo(() => {
    const m = new Map<string, number>();
    for (const tag of tage) {
      let frei = 0;
      for (const u of staff) {
        const z = brett.get(u.uid)?.get(tag);
        if (!z || (z.baustellen.length === 0 && !z.imUrlaub)) frei += 1;
      }
      m.set(tag, frei);
    }
    return m;
  }, [tage, staff, brett]);

  function wocheVerschieben(wochen: number) {
    setMontag(wocheVerschoben(montag, wochen));
  }

  /**
   * Von der Zelle in die Tagesplanung — mit Tag und Baustelle eingestellt.
   *
   * Bei mehreren Baustellen wird nur der Tag mitgegeben: welche gemeint ist,
   * kann das Brett nicht wissen, und eine geratene Vorauswahl wäre schlimmer
   * als keine — sie führte zum Speichern auf der falschen Baustelle.
   */
  function zurTagesplanung(tag: string, nummer?: string) {
    navigate('/assignments/tag', { state: { datum: tag, projectNumber: nummer } });
  }

  if (!user) return null;

  const heute = todayStr();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wochenplan"
        subtitle="Wer ist diese Woche wo — und wer ist noch frei"
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}
      {error && <ErrorState message={error} />}

      <Card
        title={`${tagKurz(montag).datum} – ${tagKurz(bis).datum}`}
        hint={
          <>
            Der Wochenplan zeigt, was geplant IST. Geändert wird in der Tagesplanung — ein Tipp
            auf einen Tag oder eine Baustelle führt dorthin, mit beidem schon eingestellt.
            <br />
            <br />
            Gezählt als frei ist, wer an diesem Tag auf keiner Baustelle steht und keinen
            genehmigten Urlaub hat. Wochenende und Feiertage sind hinterlegt, aber nicht
            ausgenommen — an einem Notdienst wird auch sonntags gearbeitet.
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => wocheVerschieben(-1)}>
              ‹ Woche
            </Button>
            <Button variant="ghost" onClick={() => setMontag(montagDer(todayStr()))}>
              Diese Woche
            </Button>
            <Button variant="ghost" onClick={() => wocheVerschieben(1)}>
              Woche ›
            </Button>
          </div>
        }
      >
        {staff.length === 0 ? (
          <EmptyState>
            Keine aktiven Mitarbeiter im Außendienst. Ohne sie gibt es nichts einzuteilen.
          </EmptyState>
        ) : (
          /*
            WAAGRECHT ROLLBAR, mit stehender Namensspalte. Sieben Tage passen
            auf 390 px nicht nebeneinander; ohne die stehende Spalte wüsste
            beim Rollen niemand mehr, wessen Zeile er liest.
          */
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface p-2 text-left align-bottom">
                    <span className="section-label">Mitarbeiter</span>
                  </th>
                  {tage.map((tag) => {
                    const { wochentag, datum } = tagKurz(tag);
                    const feiertag = getAustrianHolidayName(new Date(`${tag}T00:00:00`));
                    const wochenende = isWeekend(new Date(`${tag}T00:00:00`));
                    const frei = freiJeTag.get(tag) ?? 0;
                    return (
                      <th
                        key={tag}
                        className={`border-b border-line p-2 text-center font-normal ${
                          feiertag ? 'bg-warning-bg' : wochenende ? 'bg-surface-2' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => zurTagesplanung(tag)}
                          className="w-full rounded px-1 py-1"
                          aria-label={`${wochentag} ${datum} in der Tagesplanung öffnen`}
                        >
                          <span
                            className={`block font-semibold ${
                              tag === heute ? 'text-brand underline' : 'text-ink'
                            }`}
                          >
                            {wochentag}
                          </span>
                          <span className="tnum block text-xs text-ink-muted">{datum}</span>
                          {/* Die Zahl, wegen der es dieses Brett gibt. */}
                          <span className="mt-1 block text-xs text-ink-muted">
                            {frei} frei
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.uid}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[9rem] truncate border-b border-line bg-surface p-2 text-left font-medium text-ink"
                    >
                      {u.name}
                    </th>
                    {tage.map((tag) => {
                      const z = brett.get(u.uid)?.get(tag);
                      const feiertag = !!getAustrianHolidayName(new Date(`${tag}T00:00:00`));
                      const wochenende = isWeekend(new Date(`${tag}T00:00:00`));
                      const leer = !z || (z.baustellen.length === 0 && !z.imUrlaub);
                      return (
                        <td
                          key={tag}
                          className={`border-b border-line p-1 align-top ${
                            feiertag ? 'bg-warning-bg' : wochenende ? 'bg-surface-2' : ''
                          }`}
                        >
                          {z?.imUrlaub ? (
                            <span className="block rounded-sm bg-info-bg px-2 py-1 text-center text-xs text-info">
                              Urlaub
                            </span>
                          ) : leer ? (
                            /*
                              Eine leere Zelle ist die WICHTIGSTE Information
                              dieses Bretts. Sie bleibt trotzdem antippbar —
                              genau von hier aus teilt man jemanden ein.
                            */
                            <button
                              type="button"
                              onClick={() => zurTagesplanung(tag)}
                              aria-label={`${u.name} am ${tagKurz(tag).datum} einteilen`}
                              className="min-h-touch w-full rounded-sm border border-dashed border-line text-xs text-ink-muted"
                            >
                              frei
                            </button>
                          ) : (
                            <span className="flex flex-col gap-1">
                              {z!.baustellen.map((b) => (
                                <button
                                  key={b.nummer}
                                  type="button"
                                  onClick={() => zurTagesplanung(tag, b.nummer)}
                                  aria-label={`${b.name} am ${tagKurz(tag).datum} bearbeiten`}
                                  className={`min-h-touch w-full rounded-sm px-2 py-1 text-left text-xs ${
                                    b.helfer
                                      ? 'bg-warning-bg text-warning'
                                      : 'bg-info-bg text-info'
                                  }`}
                                >
                                  <span className="block truncate font-medium">{b.name}</span>
                                  {b.helfer && <span className="block">als Helfer</span>}
                                </button>
                              ))}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
