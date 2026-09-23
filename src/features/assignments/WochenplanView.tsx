import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAbwesendInRange, type Abwesenheit } from '@/lib/db/vacations';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { subscribeAssignmentsInRange } from '@/lib/db/assignments';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment, Betriebsurlaub } from '@/types';
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
  /** Den ganzen Tag weg — Urlaub, ganztägiger ZA, krank. */
  imUrlaub: boolean;
  /** Was in der Zelle steht: „Urlaub", „ZA", „Krank" — oder „abwesend". */
  abwesendText: string | null;
}

/**
 * „Urlaub", „ZA 13:00–17:00", „abwesend".
 *
 * Den GRUND liefert die Datenbank nur dem, der ihn sehen darf; allen anderen
 * `null` — dann heisst es „abwesend". Die Uhrzeit bekommt jeder: „ab 13 Uhr
 * weg" ist eine Auskunft über die Verfügbarkeit, kein Grund.
 */
function abwesendText(a: Pick<Abwesenheit, 'grund' | 'zeiten'>): string {
  return [a.grund ?? 'abwesend', a.zeiten].filter(Boolean).join(' ');
}

/**
 * `nurLesen`: die Team-Woche für alle Mitarbeiter (Betriebseinstellung
 * „Wochenplan für alle"). Dieselbe Rechnung, dieselben Daten — aber nichts zum
 * Antippen und kein „frei" (das ist eine Frage der Planung, nicht des Teams).
 * Die Abwesenheiten kommen in beiden Fassungen aus `wochenplan_abwesend`; den
 * Grund gibt die Datenbank nur dem heraus, der ihn sehen darf — dem Monteur
 * nie, dort steht „abwesend".
 */
export default function WochenplanView({ nurLesen = false }: { nurLesen?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [montag, setMontag] = useState(() => montagDer(todayStr()));
  const [users, setUsers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [einsaetze, setEinsaetze] = useState<WithId<Assignment>[]>([]);
  const [urlaube, setUrlaube] = useState<Abwesenheit[]>([]);
  const [betriebsurlaube, setBetriebsurlaube] = useState<Betriebsurlaub[]>([]);
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
   * Wer in der Woche fehlt: genehmigter Urlaub und Zeitausgleich,
   * Krankmeldungen.
   *
   * Nur GENEHMIGTES: ein beantragter Urlaub ist noch keiner, und ihn hier als
   * Abwesenheit zu zeigen hieße, die Entscheidung vorwegzunehmen.
   *
   * FÜR BEIDE FASSUNGEN DIESELBE ABFRAGE. Sie gibt den Grund nur heraus, wo er
   * gesehen werden darf: der Projektleitung Urlaub und ZA, einen
   * Krankenstand nur dem Büro — sonst „abwesend".
   */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listAbwesendInRange(montag, bis)
      .then((r) => {
        if (!verworfen) setUrlaube(r);
      })
      .catch(() => {
        if (!verworfen) setUrlaube([]);
        // Ohne Hinweis sähe „niemand abwesend" aus wie eine Auskunft.
        if (!verworfen) setNebenFehler('Die Abwesenheiten');
      });
    return () => {
      verworfen = true;
    };
  }, [user, montag, bis]);

  /** Der Betrieb hat zu — an diesen Tagen ist niemand „frei". */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listBetriebsurlaubeImZeitraum(user.companyId, montag, bis)
      .then((r) => {
        if (!verworfen) setBetriebsurlaube(r);
      })
      .catch(() => {
        if (!verworfen) setBetriebsurlaube([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, montag, bis]);

  /** Tag -> Bezeichnung des Betriebsurlaubs, falls einer ist. */
  const zuAm = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of betriebsurlaube) {
      for (const tag of tage) if (b.von <= tag && b.bis >= tag) m.set(tag, b.bezeichnung);
    }
    return m;
  }, [betriebsurlaube, tage]);

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
      const z = proTag.get(tag) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
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
        if (v.von <= tag && v.bis >= tag) {
          const z = hole(v.userId, tag);
          // Stundenweise (mit Uhrzeit) ist man nur teilweise weg: die Zelle
          // nennt es, eingeteilt werden kann trotzdem.
          if (!v.zeiten) z.imUrlaub = true;
          z.abwesendText = abwesendText(v);
        }
      }
    }
    return m;
  }, [einsaetze, urlaube, projects, tage]);

  /**
   * Je Tag zusammengefasst: welche Baustelle mit wem, wer frei, wer im Urlaub.
   *
   * BEIDE DARSTELLUNGEN RECHNEN DAMIT — die Tabelle am Schreibtisch und die
   * Tagesliste auf dem Telefon. Zwei getrennte Rechnungen hiessen zwei Orte,
   * an denen „frei" etwas anderes heissen kann.
   */
  const proTag = useMemo(() => {
    const m = new Map<
      string,
      {
        baustellen: { nummer: string; name: string; namen: string[]; helfer: string[] }[];
        frei: string[];
        urlaub: string[];
      }
    >();
    for (const tag of tage) {
      const nachNummer = new Map<
        string,
        { nummer: string; name: string; namen: string[]; helfer: string[] }
      >();
      const frei: string[] = [];
      const urlaub: string[] = [];
      const zu = zuAm.has(tag);
      for (const u of staff) {
        const z = brett.get(u.uid)?.get(tag);
        // Ohne Grund steht nur der Name da — „Erna (abwesend)" hinter
        // „Abwesend:" wäre doppelt.
        if (z?.abwesendText) {
          urlaub.push(z.abwesendText === 'abwesend' ? u.name : `${u.name} (${z.abwesendText})`);
        }
        if (z?.imUrlaub) continue;
        if (!z || z.baustellen.length === 0) {
          // Am Betriebsurlaub ist niemand „frei" — der Betrieb hat zu.
          if (!zu) frei.push(u.name);
          continue;
        }
        for (const b of z.baustellen) {
          const e = nachNummer.get(b.nummer) ?? {
            nummer: b.nummer,
            name: b.name,
            namen: [],
            helfer: [],
          };
          e.namen.push(u.name);
          if (b.helfer) e.helfer.push(u.name);
          nachNummer.set(b.nummer, e);
        }
      }
      m.set(tag, {
        baustellen: [...nachNummer.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
        frei,
        urlaub,
      });
    }
    return m;
  }, [tage, staff, brett, zuAm]);

  /** Wie viele sind an diesem Tag frei — die Zahl, um die es geht. */
  const freiJeTag = useMemo(() => {
    const m = new Map<string, number>();
    for (const tag of tage) m.set(tag, proTag.get(tag)?.frei.length ?? 0);
    return m;
  }, [tage, proTag]);

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
        title={nurLesen ? 'Team-Woche' : 'Wochenplan'}
        subtitle={
          nurLesen
            ? 'Wer ist diese Woche wo'
            : 'Wer ist diese Woche wo — und wer ist noch frei'
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}
      {error && <ErrorState message={error} />}

      <Card
        title={`${tagKurz(montag).datum} – ${tagKurz(bis).datum}`}
        hint={
          nurLesen ? (
            <>
              Zeigt, wer an welchem Tag auf welcher Baustelle eingeteilt ist. Geplant wird im
              Büro; bei Fragen zur Einteilung bitte dort melden. Wer abwesend ist, steht ohne
              Grund da.
            </>
          ) : (
          <>
            Der Wochenplan zeigt, was geplant IST. Geändert wird in der Tagesplanung — ein Tipp
            auf einen Tag oder eine Baustelle führt dorthin, mit beidem schon eingestellt.
            <br />
            <br />
            Gezählt als frei ist, wer an diesem Tag auf keiner Baustelle steht und keinen
            genehmigten Urlaub hat. Wochenende und Feiertage sind hinterlegt, aber nicht
            ausgenommen — an einem Notdienst wird auch sonntags gearbeitet.
          </>
          )
        }
        action={
          /*
            EINE ZEILE, AUCH AUF 390 px. Mit „‹ Woche / Diese Woche / Woche ›"
            brach die Leiste auf dem Telefon auf zwei Zeilen um und schob das
            Brett noch weiter nach unten. Die Pfeile brauchen kein Wort — was
            sie tun, sagt die Zeitspanne im Kartentitel daneben.
          */
          <div className="flex items-center gap-1">
            <Button variant="ghost" aria-label="Woche zurück" onClick={() => wocheVerschieben(-1)}>
              ‹
            </Button>
            <Button variant="ghost" onClick={() => setMontag(montagDer(todayStr()))}>
              Diese Woche
            </Button>
            <Button variant="ghost" aria-label="Woche vor" onClick={() => wocheVerschieben(1)}>
              ›
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
          <>
          {/*
            DIE TABELLE ERST AB TABLET. Sieben Spalten auf 390 px sind keine
            Tabelle mehr, sondern ein Guckloch: zwei Tage sichtbar, der Rest
            hinter einem waagrechten Bildlauf. Auf dem Telefon steht deshalb
            eine Tagesliste (weiter unten) — dieselben Daten, senkrecht.

            Die negativen Raender (`-mx-4 px-4`) sind bewusst WEG: zusammen
            mit `sticky left-0` schob sich der Inhalt der gerollten Spalten
            in die 16 px Polsterung links neben die Namensspalte. Aus dem
            Betrieb gemeldet, und im Bildschirmfoto gut zu sehen.
          */}
          <div className="hidden overflow-x-auto md:block">
            <table
              aria-label="Wochenplan als Tabelle"
              className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm"
            >
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
                    const zu = zuAm.get(tag);
                    return (
                      <th
                        key={tag}
                        className={`border-b border-line p-2 text-center font-normal ${
                          feiertag ? 'bg-warning-bg' : wochenende || zu ? 'bg-surface-2' : ''
                        }`}
                      >
                        {nurLesen ? (
                          <span className="block px-1 py-1">
                            <span
                              className={`block font-semibold ${
                                tag === heute ? 'text-brand underline' : 'text-ink'
                              }`}
                            >
                              {wochentag}
                            </span>
                            <span className="tnum block text-xs text-ink-muted">{datum}</span>
                            {zu && <span className="mt-1 block text-xs text-ink-muted">{zu}</span>}
                          </span>
                        ) : (
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
                            {zu ?? `${frei} frei`}
                          </span>
                        </button>
                        )}
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
                      const zu = zuAm.get(tag);
                      return (
                        <td
                          key={tag}
                          className={`border-b border-line p-1 align-top ${
                            feiertag ? 'bg-warning-bg' : wochenende || zu ? 'bg-surface-2' : ''
                          }`}
                        >
                          {/*
                            STUNDENWEISE WEG steht über dem, was sonst in der
                            Zelle steht: vormittags eingeteilt, nachmittags ZA.
                          */}
                          {z?.abwesendText && !z.imUrlaub && (
                            <span className="mb-1 block text-center text-xs text-info">{z.abwesendText}</span>
                          )}
                          {zu && (!z || z.baustellen.length === 0) ? (
                            /*
                              DER BETRIEB HAT ZU — für alle derselbe graue
                              Block, auch für den, der dabei persönlich Urlaub
                              gebucht bekam. Wer trotzdem eingeteilt ist (etwa
                              ein Notdienst), steht mit seiner Baustelle da.
                            */
                            <span className="block rounded-sm bg-surface-2 px-2 py-1 text-center text-xs text-ink-muted">
                              Betriebsurlaub
                            </span>
                          ) : z?.imUrlaub ? (
                            <span className="block rounded-sm border border-line bg-surface-2 px-2 py-1 text-center text-xs text-info">
                              {z.abwesendText}
                            </span>
                          ) : leer && nurLesen ? (
                            <span className="block text-center text-xs text-ink-muted" aria-label="nicht eingeteilt">
                              –
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
                              {z!.baustellen.map((b) =>
                                nurLesen ? (
                                  <span
                                    key={b.nummer}
                                    className={`block rounded-sm px-2 py-1 text-left text-xs ${
                                      b.helfer ? 'bg-warning-bg text-warning' : 'bg-info-bg text-info'
                                    }`}
                                  >
                                    <span className="block truncate font-medium">{b.name}</span>
                                    {b.helfer && <span className="block">als Helfer</span>}
                                  </span>
                                ) : (
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
                                ),
                              )}
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

          {/*
            DIE TAGESLISTE — die Telefonansicht.
            
            Sie beantwortet dieselbe Frage in der Reihenfolge, in der man sie
            auf dem Telefon stellt: erst der Tag, dann wer dort ist, dann wer
            noch frei wäre. Kein waagrechter Bildlauf, keine stehende Spalte,
            nichts, was sich überlagern kann.

            Die freien Namen stehen AUSGESCHRIEBEN, nicht nur als Zahl. Am
            Schreibtisch liest man sie aus der Spalte ab; hier gäbe es dafür
            keine Spalte, und „2 frei" ohne Namen zwingt zurück in die
            Tagesplanung, nur um nachzusehen.
          */}
          <section aria-label="Wochenplan als Liste" className="space-y-3 md:hidden">
            {tage.map((tag) => {
              const { wochentag, datum } = tagKurz(tag);
              const t = proTag.get(tag);
              const feiertag = getAustrianHolidayName(new Date(`${tag}T00:00:00`));
              const wochenende = isWeekend(new Date(`${tag}T00:00:00`));
              return (
                <div
                  key={tag}
                  className={`rounded-sm border ${
                    tag === heute ? 'border-brand' : 'border-line'
                  } ${feiertag ? 'bg-warning-bg' : wochenende || zuAm.has(tag) ? 'bg-surface-2' : ''}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                    <span className="font-semibold text-ink">
                      {wochentag}, {datum}
                      {tag === heute && <span className="ml-2 text-sm text-brand">heute</span>}
                    </span>
                    {zuAm.has(tag) ? (
                      <span className="text-sm text-ink-muted">Betriebsurlaub</span>
                    ) : !nurLesen && (
                      <span className="text-sm text-ink-muted">
                        {(t?.frei.length ?? 0)} frei
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 p-3">
                    {t && t.baustellen.length > 0 ? (
                      t.baustellen.map((b) =>
                        nurLesen ? (
                          <div
                            key={b.nummer}
                            className="rounded-sm border border-line bg-surface-2 px-3 py-2"
                          >
                            <span className="block font-medium text-info">{b.name}</span>
                            <span className="block text-sm text-info">
                              {b.namen
                                .map((n) => (b.helfer.includes(n) ? `${n} (Helfer)` : n))
                                .join(', ')}
                            </span>
                          </div>
                        ) : (
                        <button
                          key={b.nummer}
                          type="button"
                          onClick={() => zurTagesplanung(tag, b.nummer)}
                          aria-label={`${b.name} am ${datum} bearbeiten`}
                          className="min-h-touch w-full rounded-sm border border-line bg-surface-2 px-3 py-2 text-left"
                        >
                          <span className="block font-medium text-info">{b.name}</span>
                          <span className="block text-sm text-info">
                            {b.namen
                              .map((n) => (b.helfer.includes(n) ? `${n} (Helfer)` : n))
                              .join(', ')}
                          </span>
                        </button>
                        ),
                      )
                    ) : zuAm.has(tag) ? (
                      <p className="text-sm text-ink-muted">Betriebsurlaub — {zuAm.get(tag)}.</p>
                    ) : (
                      <p className="text-sm text-ink-muted">Nichts geplant.</p>
                    )}

                    {!nurLesen && t && t.frei.length > 0 && (
                      <p className="text-sm text-ink-muted">
                        <span className="font-medium text-ink">Frei:</span> {t.frei.join(', ')}
                      </p>
                    )}
                    {t && t.urlaub.length > 0 && (
                      <p className="text-sm text-ink-muted">
                        <span className="font-medium text-ink">Abwesend:</span>{' '}
                        {t.urlaub.join(', ')}
                      </p>
                    )}

                    {!nurLesen && (
                      <button
                        type="button"
                        onClick={() => zurTagesplanung(tag)}
                        aria-label={`Am ${datum} einteilen`}
                        className="min-h-touch w-full rounded-sm border border-dashed border-line text-sm text-ink-muted"
                      >
                        Einteilen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          </>
        )}
      </Card>
    </div>
  );
}
