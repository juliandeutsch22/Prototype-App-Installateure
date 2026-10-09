import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Adressfilter from '@/components/Adressfilter';
import { useAuth } from '@/app/AuthContext';
import { einplanbar } from '@/lib/permissions';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAbwesendInRange, type Abwesenheit } from '@/lib/db/vacations';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { subscribeAssignmentsForMonth, deleteAssignment } from '@/lib/db/assignments';
import TermineKarte from '@/features/termine/TermineKarte';
import { terminKopf } from '@/features/termine/terminText';
import { todayStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment, Betriebsurlaub, Termin } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import MonthCalendar from '@/components/MonthCalendar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { useModul } from '@/lib/useModule';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { einsatzZeit } from './einsatzZeit';
import { STUFEN_IM_EINSATZ, stufeAnzahl, stufeImEinsatz } from './stufeImEinsatz';
import EinsatzFormular from './EinsatzFormular';
import { AnsichtWahl, PlanungsSeitenkopf } from './PlanungsKopf';
import { abwesendAm, fmtDay, useMaterialstamm, useRuestlistenDesTages } from './einsatzDaten';

/**
 * „Tag planen“ (seit Runde 4 die Ansicht „Tag“ der Einsatzplanung):
 * Kalender + Baustelle + Mitarbeiter -> speichern.
 *
 * Der Kalender ersetzt das Datumsfeld aus der ersten Fassung. Wer plant,
 * fragt nicht „welches Datum hat der Dienstag?", sondern „wo ist noch nichts
 * eingeteilt?" — und diese Frage beantwortet nur das Monatsraster.
 *
 * SEIT DER LINIE „LOT“ (E2) steht dasselbe Formular auch im Seitenfenster
 * des Wochenplans (`EinsatzFormular`). Hier bleibt der ganze Tag auf einer
 * Seite: Formular, Termine des Tages und alle Einsätze darunter.
 */
export default function AssignmentsView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  /** Die Termine des gewählten Tages — gemeldet von der Terminkarte (G23). */
  const [termineDesTages, setTermineDesTages] = useState<Termin[]>([]);
  /**
   * Tag und Baustelle koennen vom Wochenplan mitkommen.
   *
   * Dort steht, WER wann frei ist; der ganze Tag steht hier. Ohne diese
   * Uebergabe muesste man nach jedem Tipp im Brett den Tag noch einmal im
   * Kalender suchen — und genau dieser Umweg macht aus zwei Ansichten zwei
   * getrennte Werkzeuge statt eines Ablaufs.
   *
   * Nur beim ERSTEN Zeichnen gelesen: danach gehoert die Auswahl dem
   * Benutzer, und ein spaeteres Zurueckspringen waere ein Formular, das sich
   * unter der Hand aendert.
   */
  const uebergabe = useLocation().state as
    | { datum?: string; projectNumber?: string }
    | null;
  /*
    AUS DER ADRESSE (Startseite, Nachtest 01.10.2026): `?datum=` wählt den
    Tag, `&filter=unbesetzt` zeigt nur die Baustellen, deren Eingeteilte alle
    ganztags fehlen. Die Übergabe aus dem Wochenplan geht vor.
  */
  const [adresse] = useSearchParams();
  const datumAusAdresse = /^\d{4}-\d{2}-\d{2}$/.test(adresse.get('datum') ?? '') ? adresse.get('datum')! : null;
  const nurUnbesetzt = adresse.get('filter') === 'unbesetzt';
  const startDatum = uebergabe?.datum ?? datumAusAdresse ?? todayStr();

  const [date, setDate] = useState(startDatum);
  const [cursor, setCursor] = useState(() => {
    // Lokal rechnen, NICHT über toISOString: das rechnet in UTC und liefert
    // am Monatsersten vor 02:00 Uhr (Sommerzeit) noch den Vormonat.
    const [y, m] = startDatum.split('-');
    return { year: Number(y), month: Number(m) - 1 };
  });
  const [projectNumber, setProjectNumber] = useState(uebergabe?.projectNumber ?? '');
  const [monthAssignments, setMonthAssignments] = useState<WithId<Assignment>[]>([]);
  const [urlaube, setUrlaube] = useState<Abwesenheit[]>([]);
  const [betriebsurlaube, setBetriebsurlaube] = useState<Betriebsurlaub[]>([]);
  /** Der Monat lädt nicht — steht über allem, nicht erst am Speichern-Knopf. */
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Kalender steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Assignment> | null>(null);

  /*
    Die Rüstlisten des Tages: das Formular übernimmt daraus die vorhandene
    Liste, die Übersicht der Einsätze zeigt sie an der Baustelle.
  */
  const materialAn = useModul('material');
  const materials = useMaterialstamm(user?.companyId, materialAn);
  const tagesListen = useRuestlistenDesTages(user?.companyId, date, materialAn);
  /** Das Formular — „Bearbeiten“ in der Tagesübersicht springt dorthin. */
  const formular = useRef<HTMLDivElement>(null);

  /**
   * Baustellen und Belegschaft — beides Auswahlfelder dieser Ansicht.
   *
   * Fielen sie stumm aus, stuende der Kalender da mit zwei leeren Listen: der
   * Planer sieht „keine Baustellen" und „keine Mitarbeiter", wo „nicht
   * geladen" gemeint ist. Beim Einteilen ist das der Unterschied zwischen
   * einer leeren Woche und einem Netzproblem.
   */
  useEffect(() => {
    if (!user) return;
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
    listUsers(user.companyId).then(setUsers).catch(() => setNebenFehler('Die Belegschaft'));
  }, [user]);

  /**
   * Wer im angezeigten Monat fehlt — genehmigter Urlaub und Zeitausgleich,
   * Krankmeldungen — und ob der Betrieb zu hat.
   *
   * ES GEHÖRT HIERHER, nicht in eine eigene Ansicht. Ein Urlaub, der erst am
   * Einsatztag auffällt, ist doppelte Arbeit für alle: die Baustelle steht,
   * jemand muss umplanen, und der Monteur bekommt einen Anruf im Urlaub. Wer
   * einteilt, muss ihn sehen, bevor er den Haken setzt.
   *
   * Nur GENEHMIGTES. Ein beantragter Urlaub ist noch keiner, und ihn hier
   * schon als Abwesenheit zu zeigen hieße, die Entscheidung vorwegzunehmen.
   * Den Grund liefert die Datenbank nur, wo er gesehen werden darf — einen
   * Krankenstand sieht die Projektleitung als „abwesend".
   */
  useEffect(() => {
    if (!user) return;
    const letzter = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
    const von = `${prefix}-01`;
    const bis = `${prefix}-${String(letzter).padStart(2, '0')}`;
    let verworfen = false;
    listAbwesendInRange(von, bis)
      .then((rows) => {
        if (!verworfen) setUrlaube(rows);
      })
      .catch(() => {
        if (!verworfen) setUrlaube([]);
      });
    listBetriebsurlaubeImZeitraum(user.companyId, von, bis)
      .then((rows) => {
        if (!verworfen) setBetriebsurlaube(rows);
      })
      .catch(() => {
        if (!verworfen) setBetriebsurlaube([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, cursor.year, cursor.month]);

  /**
   * Der ganze Monat, live. Live ist hier kein Luxus: nach dem Speichern
   * musste die alte Fassung von Hand nachladen, und plante jemand anderes
   * parallel, sah man es nicht.
   */
  useEffect(() => {
    if (!user) return;
    return subscribeAssignmentsForMonth(
      user.companyId,
      cursor.year,
      cursor.month,
      setMonthAssignments,
      (e) => setError(e.message),
    );
  }, [user, cursor]);

  const dayAssignments = useMemo(
    () => monthAssignments.filter((a) => a.date === date),
    [monthAssignments, date],
  );

  /** Belegte Tage: gezählt wird die Zahl der BAUSTELLEN, nicht der Personen. */
  const marks = useMemo(() => {
    const byDay = new Map<string, Set<string>>();
    for (const a of monthAssignments) {
      const set = byDay.get(a.date) ?? new Set<string>();
      set.add(a.projectNumber);
      byDay.set(a.date, set);
    }
    return new Map([...byDay].map(([d, set]) => [d, set.size]));
  }, [monthAssignments]);

  // Nur Außendienst wird eingeplant — Buchhaltung und Verwaltung fahren nicht raus.
  const staff = useMemo(
    () =>
      users
        // Seit 30.09.2026 auf Wunsch des Betriebs auch die Projektleitung (M38).
        .filter((u) => einplanbar(u, company))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, company],
  );

  /** Wer am gewählten Tag den GANZEN Tag fehlt (für Lücke und Filter „unbesetzt“). */
  const { imUrlaub } = useMemo(() => abwesendAm(urlaube, date), [urlaube, date]);

  /**
   * Wer hat an diesem Tag ueberhaupt keinen Einsatz — auf KEINER Baustelle?
   *
   * Das ist die Frage, die bei zwanzig Mitarbeitern niemand mehr im Kopf
   * behaelt: nicht „wer ist auf dieser Baustelle", sondern „wen habe ich
   * vergessen". Der Urlaub kommt heraus — wer frei hat, ist nicht vergessen,
   * sondern abwesend, und ihn hier aufzulisten machte die Zeile unbrauchbar.
   */
  const nichtEingeteilt = useMemo(() => {
    const verplant = new Set(dayAssignments.map((a) => a.userId));
    return staff.filter((u) => !verplant.has(u.uid) && !imUrlaub.has(u.uid));
  }, [staff, dayAssignments, imUrlaub]);

  if (!user) return null;

  /*
    TERMINE AUF DERSELBEN BAUSTELLE AM SELBEN TAG (Runde 3, G23) — auch an
    der Baustelle in der Liste der Einsätze. Nur Termine des gewählten
    Tages; die Karte lädt je Tag neu.
  */
  const termineAuf = (pn: string) =>
    termineDesTages.filter((t) => t.datum === date && t.projectNumber === pn).map(terminKopf);

  // Tagesübersicht nach Baustelle gruppieren.
  const byProject = new Map<string, WithId<Assignment>[]>();
  for (const a of dayAssignments) {
    const list = byProject.get(a.projectNumber) ?? [];
    list.push(a);
    byProject.set(a.projectNumber, list);
  }
  // „Unbesetzt“: eingeteilt waren welche, und alle fehlen ganztags (M33).
  if (nurUnbesetzt) {
    for (const [pn, rows] of [...byProject.entries()]) {
      if (!rows.every((r) => imUrlaub.has(r.userId))) byProject.delete(pn);
    }
  }

  return (
    <div className="space-y-3 lg:space-y-5">
      {/*
        RUNDE 4 (Auftrag 4.1): „Tag“ ist die dritte Ansicht der
        Einsatzplanung neben Woche und Monat — derselbe Seitenkopf, der
        Umschalter statt der Reiter, darunter die Seite wie bisher.
      */}
      <PlanungsSeitenkopf />
      {/*
        DIESELBE BREITE UND DIESELBE STELLE WIE IN WOCHE UND MONAT (Testbericht
        Runde 5, G9): der Umschalter sprang beim Wechsel nach links, und „Tag“
        endete bei 1.160 px.
      */}
      <div className="planung-steuerung-tag">
        <div className="planung-wahl">
          <AnsichtWahl ansicht="tag" />
        </div>
      </div>

      {nebenFehler && <TeilFehler was={nebenFehler} />}
      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-5">
        {/* Kalender links, Planung rechts — am Telefon untereinander. */}
        <div className="space-y-3 lg:col-span-2">
          <MonthCalendar
            year={cursor.year}
            month={cursor.month}
            selected={date}
            onSelect={setDate}
            onShiftMonth={(delta) =>
              setCursor((c) => {
                const d = new Date(c.year, c.month + delta, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })
            }
            marks={marks}
            markLabel={(n) => `${n} ${n === 1 ? 'Baustelle' : 'Baustellen'} geplant`}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-muted">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              Baustellen geplant
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-info-bg ring-1 ring-info" />
              Heute
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-5 rounded-sm border border-line bg-surface-2 shadow-[inset_0_2px_0_0_var(--warning)]" />
              Feiertag (AT)
            </span>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-3 lg:space-y-5">
          <div ref={formular} className="scroll-mt-4 space-y-3 lg:space-y-5">
            <EinsatzFormular
              date={date}
              projectNumber={projectNumber}
              onProjectNumber={setProjectNumber}
              users={users}
              staff={staff}
              projects={projects}
              onProjekt={(p) =>
                setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]))
              }
              tagesEinsaetze={dayAssignments}
              urlaube={urlaube}
              betriebsurlaube={betriebsurlaube}
              termineDesTages={termineDesTages}
              materials={materials}
              tagesListen={tagesListen}
              karten={{ titel: `Einsatz planen — ${fmtDay(date)}` }}
            />
          </div>

          {/*
            DIE TERMINE DES TAGES ÜBER DEN EINSÄTZEN (Plan 10.4): „Lieferung
            8–10 Uhr" soll der Planer sehen, bevor er einteilt — damit gleich
            jemand zur Annahme auf der Baustelle steht.
          */}
          <TermineKarte
            titel={`Termine am ${fmtDay(date)}`}
            vorgabe={{ bezug: 'frei', datum: date }}
            onTermine={setTermineDesTages}
          />

          {/* Bündig: jede Baustelle ein Abschnitt mit ihren Leuten darunter,
              statt eines Kastens in der Karte (Linie „Lot“, Regel 1). */}
          {nurUnbesetzt && <Adressfilter text="nur unbesetzte Einsätze" parameter={['filter']} />}
          <Card title={`${nurUnbesetzt ? 'Unbesetzte Einsätze' : 'Einsätze'} am ${fmtDay(date)}`} buendig>
            {byProject.size === 0 ? (
              <EmptyState>{nurUnbesetzt ? 'An diesem Tag ist jeder Einsatz besetzt.' : 'Keine Einsätze an diesem Tag.'}</EmptyState>
            ) : (
              <div>
                {[...byProject.entries()].map(([pn, rows]) => {
                  const proj = projects.find((p) => p.projectNumber === pn);
                  const stufeVon = (r: (typeof rows)[number]) =>
                    stufeImEinsatz(r.asHelper, users.find((u) => u.uid === r.userId));
                  const zaehlung = STUFEN_IM_EINSATZ.map(
                    (stufe) => [stufe, rows.filter((r) => stufeVon(r) === stufe).length] as const,
                  ).filter(([, n]) => n > 0);
                  /*
                    AUFGABE UND MATERIAL STEHEN HIER, nicht nur im Formular.
                    Gemeldet: „man sieht nirgends ausser in der Bearbeitung,
                    welche Materialien und welche Notiz eingegeben wurden."
                    Die Aufgabe wird für alle Eingeteilten gemeinsam gesetzt
                    und steht deshalb einmal am Kopf; eine abweichende (aus
                    älteren Einteilungen) bleibt an der Person stehen.
                  */
                  const aufgabe = rows.find((r) => r.comment?.trim())?.comment?.trim() ?? '';
                  const material = materialAn
                    ? tagesListen.find((l) => l.projectNumber === pn)?.positionen ?? []
                    : [];
                  const geladen = tagesListen.find((l) => l.projectNumber === pn)?.geladen ?? {};
                  const inBearbeitung = pn === projectNumber;
                  const termineDort = termineAuf(pn);
                  return (
                    <div key={pn}>
                      <div className="abschnitt flex-wrap">
                        <h3>
                          {proj?.customerName ?? pn}{' '}
                          <span className="text-sm font-normal text-ink-muted">({pn})</span>
                        </h3>
                        <span className="flex flex-wrap items-center gap-2">
                          {einsatzZeit(rows[0]) && <Marke>{einsatzZeit(rows[0])}</Marke>}
                          {zaehlung.map(([stufe, n]) => (
                            <Marke key={stufe}>{stufeAnzahl(stufe, n)}</Marke>
                          ))}
                          {/*
                            BEARBEITEN DIREKT HIER. Bisher ging das nur, indem
                            man oben dieselbe Baustelle noch einmal wählte —
                            oder über den Wochenplan. Das Formular übernimmt
                            die vorhandene Planung samt Rüstliste von selbst.
                          */}
                          {inBearbeitung ? (
                            <span className="text-sm text-ink-muted">wird oben bearbeitet</span>
                          ) : (
                            <Button
                              variant="secondary"
                              groesse="klein"
                              onClick={() => {
                                setProjectNumber(pn);
                                formular.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              Bearbeiten
                            </Button>
                          )}
                        </span>
                      </div>
                      {(aufgabe || material.length > 0 || termineDort.length > 0) && (
                        <div className="space-y-2 border-t border-line px-4 py-2 text-sm">
                          {termineDort.length > 0 && (
                            <p className="text-ink">
                              <span className="font-normal">Am selben Tag:</span> {termineDort.join('; ')}
                            </p>
                          )}
                          {aufgabe && (
                            <p className="whitespace-pre-line text-ink">
                              <span className="font-normal">Aufgabe:</span> {aufgabe}
                            </p>
                          )}
                          {material.length > 0 && (
                            <div>
                              <p className="font-normal text-ink">Material:</p>
                              <ul className="mt-1 space-y-0.5 text-ink">
                                {material.map((m) => (
                                  <li key={m.id} className="flex flex-wrap gap-x-2">
                                    <span>
                                      {m.menge}
                                      {m.einheit ? ` ${m.einheit}` : ''}
                                    </span>
                                    <span>{m.name}</span>
                                    {geladen[m.id] && (
                                      <span className="text-success">eingeladen</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {/*
                        Eine Zeile je Eingeteiltem (Linie „Lot“: Zeilen statt
                        eigener Listen). Löschen als Wort statt ✕ — Symbole
                        nur, wo das Zeichen mehr sagt als das Wort.
                      */}
                      <List>
                        {rows.map((a) => (
                          <ListRow
                            key={a.id}
                            title={a.userName}
                            subtitle={
                              a.comment?.trim() && a.comment.trim() !== aufgabe ? a.comment : undefined
                            }
                            zustand={stufeVon(a) !== 'Facharbeiter' ? <Marke>{stufeVon(a)}</Marke> : undefined}
                          >
                            <Button
                              variant="ghost"
                              aria-label={`Einsatz von ${a.userName} löschen`}
                              onClick={() => setToDelete(a)}
                            >
                              Löschen
                            </Button>
                          </ListRow>
                        ))}
                      </List>
                    </div>
                  );
                })}
              </div>
            )}

            {/*
              Steht UNTER den Baustellen, nicht darueber: die Einteilung ist
              die Antwort, die Luecke die Rueckfrage. Und nur, wenn ueberhaupt
              schon geplant ist — sonst listete die Zeile die ganze
              Belegschaft und saegte an ihrem eigenen Wert.

              `staff.length > 0` ist keine Formalie, sondern der Unterschied
              zwischen einer Aussage und einer Behauptung. Solange die
              Belegschaft nicht geladen ist, ist die Luecke LEER — und die
              Zeile sagte „alle sind eingeteilt", obwohl sie niemanden kennt.
              Faellt das Laden ganz aus, steht das oben als Teilfehler.
            */}
            {dayAssignments.length > 0 && staff.length > 0 && (
              <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">
                {nichtEingeteilt.length === 0 ? (
                  <>Alle verfügbaren Mitarbeiter sind an diesem Tag eingeteilt.</>
                ) : (
                  <>
                    <strong className="text-ink">
                      Noch nicht eingeteilt ({nichtEingeteilt.length}):
                    </strong>{' '}
                    {nichtEingeteilt.map((u) => u.name).join(', ')}
                  </>
                )}
              </p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Einsatz löschen?"
        message={
          toDelete
            ? `Der Einsatz von ${toDelete.userName} am ${fmtDay(toDelete.date)} wird entfernt.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const weg = toDelete;
          setToDelete(null);
          if (!weg) return;
          // Scheitert es, wird es gesagt — vorher blieb der Dialog wortlos offen.
          try {
            await deleteAssignment(weg.id);
            toast.success('Einsatz gelöscht');
          } catch {
            toast.error(`Der Einsatz von ${weg.userName} konnte nicht gelöscht werden.`);
          }
        }}
      />
    </div>
  );
}
