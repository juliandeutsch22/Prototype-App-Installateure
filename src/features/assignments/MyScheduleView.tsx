import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listAssignmentsForUserInRange,
  listUpcomingAssignments,
} from '@/lib/db/assignments';
import { listProjectsByNumbers } from '@/lib/db/projects';
import { listAbwesendInRange, listOwnVacations, type Abwesenheit } from '@/lib/db/vacations';
import { useModul } from '@/lib/useModule';
import { listEinsatzMaterialForDate } from '@/lib/db/einsatzMaterial';
import RuestlisteAbhaken from './RuestlisteAbhaken';
import PlaeneListe from '@/features/projects/PlaeneListe';
import { planeVon, usePlaene } from '@/features/projects/usePlaene';
import type { Assignment, Project, Vacation, EinsatzMaterial } from '@/types';
import type { WithId } from '@/lib/db/core';
import { tageWort, todayStr } from '@/lib/time';
import Card from '@/components/Card';
import Hinweiszeile from '@/components/Hinweiszeile';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { Marke, Zustand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import MonthCalendar from '@/components/MonthCalendar';
import { LoadingState, ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { ganztagsWeg } from './besetzung';

/** 'YYYY-MM-DD' -> 'Mo., 15.06.2026'. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Eigene Einsätze im Monatskalender — dieselbe Ansicht wie im Prototyp.
 *
 * Die reine Liste beantwortete nur „was kommt als Nächstes". Am Kalender
 * sieht ein Monteur dagegen auf einen Blick, an welchen Tagen er verplant
 * ist und welche noch frei sind — die Frage, die er tatsächlich stellt.
 */
export default function MyScheduleView() {
  const { user } = useAuth();
  // Querverweise nur zeigen, wenn ihr Ziel ueberhaupt existiert — ein Link in
  // die Meldung „ist ausgeschaltet" ist eine Sackgasse.
  const scheineAn = useModul('scheine');
  const urlaubAn = useModul('urlaub');
  const materialAn = useModul('material');
  const [rows, setRows] = useState<Assignment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Kalender steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [selected, setSelected] = useState(todayStr());
  // Lokaler Monat, NICHT über toISOString: das rechnet in UTC und liefert am
  // Monatsersten vor 02:00 Uhr (Sommerzeit) noch den Vormonat.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayStr().split('-');
    return { year: Number(y), month: Number(m) - 1 };
  });

  /** Die anstehenden Einsätze — „alle geplanten", unabhängig vom Kalender. */
  const [naechste, setNaechste] = useState<Assignment[]>([]);
  /** Eigene Abwesenheiten im Zeitraum der nächsten Einsätze — Urlaub, ZA, Krank (M33). */
  const [abwesend, setAbwesend] = useState<Abwesenheit[]>([]);

  /**
   * Die eigenen Urlaubsanträge — beantragte MIT eingeschlossen.
   *
   * Anders als in der Einsatzplanung, die nur genehmigten Urlaub zeigt: dort
   * geht es darum, wer sicher weg ist. Hier geht es um die Frage, die der
   * Monteur tatsächlich stellt — „habe ich im Juli frei, und ist das schon
   * entschieden?" Ein beantragter Urlaub gehört in diese Antwort, aber sichtbar
   * als das, was er ist.
   */
  const [urlaube, setUrlaube] = useState<WithId<Vacation>[]>([]);

  const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;

  /**
   * Der ANGEZEIGTE Monat, nicht die ganze Einsatzgeschichte.
   *
   * Vorher wurde jeder Einsatz geladen, den dieser Monteur je hatte — nach
   * zehn Jahren rund 2.200 Dokumente, um ein Monatsraster zu fuellen. Der
   * Kalender zeigt immer genau einen Monat; mehr braucht er nicht.
   */
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const letzter = new Date(cursor.year, cursor.month + 1, 0).getDate();
    listAssignmentsForUserInRange(
      user.companyId,
      user.uid,
      `${prefix}-01`,
      `${prefix}-${String(letzter).padStart(2, '0')}`,
    )
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, prefix, cursor.year, cursor.month]);

  /**
   * Die anstehenden Einsätze ab heute — die Frage „wo muss ich als Nächstes
   * hin?", die der Monatskalender allein nicht beantwortet: liegt der
   * nächste Einsatz im Folgemonat, sieht man ihn im aktuellen Raster nicht.
   */
  useEffect(() => {
    if (!user) return;
    // Ohne Hinweis stuende „keine kommenden Einsaetze" da, wo „nicht
    // geladen" gemeint ist — und der Monteur faehrt morgen nirgendwohin.
    listUpcomingAssignments(user.companyId, user.uid, todayStr())
      .then(setNaechste)
      .catch(() => setNebenFehler('Die kommenden Einsätze'));
    listOwnVacations(user.companyId, user.uid)
      .then(setUrlaube)
      .catch(() => setUrlaube([]));
  }, [user]);

  /*
    WER AN DEM TAG GANZTAGS WEG IST, HAT DORT KEINEN „NÄCHSTEN EINSATZ“
    (Testbericht 30.09.2026, M33). Vorher stand der Einsatz trotz
    Krankmeldung oben in der Liste. Gefragt wird dieselbe Stelle wie im
    Wochenplan; scheitert sie, bleibt die Liste wie bisher.
  */
  useEffect(() => {
    if (!user || naechste.length === 0) {
      setAbwesend([]);
      return;
    }
    const bis = naechste.reduce((m, a) => (a.date > m ? a.date : m), naechste[0].date);
    let weg = false;
    Promise.resolve()
      .then(() => listAbwesendInRange(todayStr(), bis))
      .then((l) => {
        if (!weg) setAbwesend(l.filter((a) => a.userId === user.uid));
      })
      .catch(() => {
        if (!weg) setAbwesend([]);
      });
    return () => {
      weg = true;
    };
  }, [user, naechste]);
  const anstehend = useMemo(
    () => naechste.filter((a) => !user || !ganztagsWeg(abwesend, user.uid, a.date)),
    [naechste, abwesend, user],
  );
  const ausgeblendet = naechste.length - anstehend.length;

  /**
   * Baustellen-Stammdaten nur zu den Nummern, die tatsächlich vorkommen.
   *
   * Eingeplant zu sein heißt nicht, der Baustelle fest zugeordnet zu sein —
   * ohne die Stammdaten bliebe der Kundenname leer und Route und Anruf
   * fehlten. Vorher wurde dafür der gesamte Baustellenbestand des Betriebs
   * geladen; jetzt nur die paar, die auf dem Schirm sind.
   */
  const nummern = useMemo(
    () => [...new Set([...rows, ...naechste].map((a) => a.projectNumber))].sort(),
    [rows, naechste],
  );
  const nummernSchluessel = nummern.join('|');
  useEffect(() => {
    if (!user || nummern.length === 0) return;
    // Fehlen die Stammdaten, bleiben Kundenname, Route und Anruf leer —
    // stumm sieht das aus wie eine Baustelle ohne Kontakt.
    listProjectsByNumbers(user.companyId, nummern)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellendaten'));
    // Am Inhalt haengen, nicht an der Array-Identitaet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummernSchluessel]);

  /*
    DIE PLÄNE DER BAUSTELLEN AUF DEM SCHIRM. Eingeteilt zu sein reicht, um
    sie zu sehen — die Datenbank lässt einen Monteur die Pläne jeder
    Baustelle lesen, auf der er einen Einsatz hat, auch ohne im Team zu
    stehen.
  */
  const { stand: plaene, neuLaden: plaeneNeu } = usePlaene(
    user?.companyId,
    projects.map((p) => p.id),
  );

  /** Einsätze je Tag des angezeigten Monats — die Zahlen im Kalender. */
  const marks = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of rows) {
      if (!a.date.startsWith(prefix)) continue;
      m.set(a.date, (m.get(a.date) ?? 0) + 1);
    }
    return m;
  }, [rows, prefix]);

  const visible = useMemo(
    () => rows.filter((a) => a.date === selected),
    [rows, selected],
  );

  /**
   * Die Rüstlisten des gewählten Tages.
   *
   * AUCH FÜR KOMMENDE TAGE, nicht nur für heute: den Bus lädt man am
   * Vorabend. Wer erst am Einsatzmorgen erfährt, was mitzunehmen ist, steht
   * um sieben vor einem Lager, in dem etwas fehlt.
   *
   * Ein Fehlschlag bleibt folgenlos — die Einteilung ist die Aufgabe dieser
   * Ansicht, das Material die Zugabe.
   */
  const [ruestlisten, setRuestlisten] = useState<WithId<EinsatzMaterial>[]>([]);
  useEffect(() => {
    if (!user || !materialAn) {
      setRuestlisten([]);
      return;
    }
    let verworfen = false;
    listEinsatzMaterialForDate(user.companyId, selected)
      .then((r) => {
        if (!verworfen) setRuestlisten(r);
      })
      .catch(() => {
        if (!verworfen) setRuestlisten([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, selected, materialAn]);

  /** Fällt der gewählte Tag in einen eigenen Urlaub — und ist er entschieden? */
  const urlaubAmTag = useMemo(
    () =>
      urlaube.find(
        (v) =>
          (v.status === 'Genehmigt' || v.status === 'Beantragt') &&
          v.von <= selected &&
          v.bis >= selected,
      ),
    [urlaube, selected],
  );

  /** Die kommenden eigenen Urlaube — die Antwort auf „wann habe ich frei?". */
  const kommendeUrlaube = useMemo(() => {
    const heute = todayStr();
    return urlaube
      .filter((v) => (v.status === 'Genehmigt' || v.status === 'Beantragt') && v.bis >= heute)
      .sort((a, b) => a.von.localeCompare(b.von))
      .slice(0, 5);
  }, [urlaube]);

  const today = todayStr();

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title="Mein Einsatzplan" subtitle="Deine geplanten Einsätze" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}
      {plaene.zustand === 'fehler' && <TeilFehler was="Die Pläne" onRetry={plaeneNeu} />}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-5">
          <div className="space-y-3 lg:col-span-2">
            <MonthCalendar
              year={cursor.year}
              month={cursor.month}
              selected={selected}
              onSelect={setSelected}
              onShiftMonth={(delta) =>
                setCursor((c) => {
                  const d = new Date(c.year, c.month + delta, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              marks={marks}
              markLabel={(n) => `${n} ${n === 1 ? 'Einsatz' : 'Einsätze'}`}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-muted">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
                Einsätze geplant
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

          <div className="lg:col-span-3">
            <Card title={`Einsätze am ${fmtDay(selected)}`}>
              {/*
                Der Urlaub steht ÜBER den Einsätzen: fällt beides auf denselben
                Tag, ist das der Widerspruch, den man sofort sehen muss.
              */}
              {urlaubAmTag && (
                <div className="mb-3">
                  <Hinweiszeile stufe={urlaubAmTag.status === 'Genehmigt' ? undefined : 'warn'}>
                    <p>
                      {urlaubAmTag.status === 'Genehmigt' ? (
                        <>
                          <strong>Urlaub</strong> — genehmigt
                          {urlaubAmTag.entschiedenVonName ? ` von ${urlaubAmTag.entschiedenVonName}` : ''}.
                        </>
                      ) : (
                        <>
                          <strong>Urlaub beantragt</strong> — noch nicht entschieden. Bitte noch nichts
                          fix buchen.
                        </>
                      )}
                    </p>
                  </Hinweiszeile>
                </div>
              )}
              {visible.length === 0 ? (
                <EmptyState>
                  Kein Einsatz an diesem Tag. Die Zahlen im Kalender zeigen, an welchen
                  Tagen du eingeplant bist.
                </EmptyState>
              ) : (
                // Mehrere Einsätze am Tag: durch Linien getrennt, nicht als Kästen in der Karte.
                <div className="divide-y divide-line">
                  {visible.map((a) => {
                    const proj = projects.find((p) => p.projectNumber === a.projectNumber);
                    return (
                      <div key={a.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-ink">
                            {proj?.customerName ?? a.projectNumber}
                            {/* Nummer nur zusätzlich zeigen, wenn ein Kundenname
                                da ist — sonst stünde sie doppelt. */}
                            {proj?.customerName && (
                              <span className="ml-1 text-sm font-normal text-ink-muted">
                                ({a.projectNumber})
                              </span>
                            )}
                          </span>
                          <span className="flex gap-2">
                            {/* „Heute" war rot. Es ist kein Ausfall, sondern der
                                Einsatz, der GERADE läuft. */}
                            {a.date === today && <Zustand stand="laeuft">Heute</Zustand>}
                            <Marke>{a.asHelper ? 'Helfer' : 'Facharbeiter'}</Marke>
                          </span>
                        </div>
                        {a.comment && <p className="mt-1 text-sm text-ink-muted">{a.comment}</p>}

                        {/* Was mitzunehmen ist — abhakbar, auch am Vorabend. */}
                        {(() => {
                          const liste = ruestlisten.find(
                            (l) => l.projectNumber === a.projectNumber,
                          );
                          if (!materialAn || !liste?.positionen?.length) return null;
                          return (
                            <RuestlisteAbhaken
                              date={a.date}
                              projectNumber={a.projectNumber}
                              positionen={liste.positionen}
                              geladen={liste.geladen ?? {}}
                            />
                          );
                        })()}


                        {(() => {
                          const eigene = planeVon(plaene, proj?.id);
                          if (plaene.zustand !== 'bereit' || eigene.length === 0) return null;
                          return (
                            <div className="mt-3">
                              <p className="section-label">Pläne und Dokumente</p>
                              <PlaeneListe dokumente={eigene} adressen={plaene.adressen} />
                            </div>
                          );
                        })()}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {/* Übernimmt Baustelle und Helfer-Rolle ins
                              Zeitformular — ein vergessener Helfer-Haken
                              kostet den falschen Satz. */}
                          <Link
                            to="/time"
                            state={{ projectNumber: a.projectNumber, asHelper: !!a.asHelper }}
                            className="flex min-h-touch items-center rounded bg-brand px-4 py-2 font-semibold text-brand-fg shadow-sm"
                          >
                            Zeit erfassen
                          </Link>
                          {/*
                            Der Schein gehoert an den Einsatz, nicht in einen
                            eigenen Bereich, in dem man die Baustelle erneut
                            heraussuchen muss. Datum und Baustelle wandern mit.
                          */}
                          {scheineAn && (
                          <Link
                            to={`/worksheet?projekt=${encodeURIComponent(a.projectNumber)}&datum=${a.date}`}
                            className="flex min-h-touch items-center rounded border border-line px-4 py-2 font-medium text-ink"
                          >
                            Schein schreiben
                          </Link>
                          )}
                          <AdresseLink adresse={proj?.address} variante="knopf" />
                          <TelefonLink
                            nummer={proj?.contactPhone}
                            name={proj?.contactName}
                            variante="knopf"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/*
              Alle anstehenden Einsätze, unabhängig vom Kalendermonat.
              Der Kalender zeigt immer genau einen Monat — liegt der nächste
              Einsatz am Ersten des Folgemonats, war er im aktuellen Raster
              schlicht nicht zu sehen, und die Ansicht behauptete damit, es
              stünde nichts an.
            */}
            <Card title="Nächste Einsätze" className="mt-3 lg:mt-5">
              {anstehend.length === 0 ? (
                <EmptyState>Zurzeit ist nichts eingeplant.</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {anstehend.slice(0, 15).map((a) => {
                    const proj = projects.find((p) => p.projectNumber === a.projectNumber);
                    return (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">
                            {proj?.customerName ?? a.projectNumber}
                          </span>
                          <span className="block text-xs text-ink-muted">{fmtDay(a.date)}</span>
                        </span>
                        <span className="flex shrink-0 gap-2">
                          {a.date === today && <Zustand stand="laeuft">Heute</Zustand>}
                          {a.asHelper && <Marke>Helfer</Marke>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {anstehend.length > 15 && (
                <p className="mt-2 text-sm text-ink-muted">
                  und {anstehend.length - 15} weitere — im Kalender links nachschlagen.
                </p>
              )}
              {ausgeblendet > 0 && (
                <p className="mt-2 text-sm text-ink-muted">
                  {ausgeblendet === 1
                    ? 'Ein Einsatz liegt an einem Tag, an dem du abwesend bist — das Büro plant ihn neu.'
                    : `${ausgeblendet} Einsätze liegen an Tagen, an denen du abwesend bist — das Büro plant sie neu.`}
                </p>
              )}
            </Card>

            {/*
              „Wann habe ich frei, und ist es schon entschieden?" — die zweite
              Frage, mit der ein Monteur in diese Ansicht kommt. Sie hier zu
              beantworten spart den Anruf im Büro.
            */}
            {urlaubAn && (
            <Card
              title="Mein Urlaub"
              action={
                <Link to="/vacations" className="link-weiter text-sm">
                  Beantragen
                </Link>
              }
            >
              {kommendeUrlaube.length === 0 ? (
                <EmptyState>Kein kommender Urlaub beantragt.</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {kommendeUrlaube.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-ink">
                        {v.von === v.bis ? fmtDay(v.von) : `${fmtDay(v.von)} – ${fmtDay(v.bis)}`}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-ink-muted">
                          {tageWort(Number(v.tage))}
                        </span>
                        <Zustand stand={v.status === 'Genehmigt' ? 'gut' : 'achtung'}>
                          {v.status}
                        </Zustand>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
