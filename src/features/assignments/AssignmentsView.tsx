import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAbwesendInRange, type Abwesenheit } from '@/lib/db/vacations';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { subscribeAssignmentsForMonth, saveAssignments, deleteAssignment } from '@/lib/db/assignments';
import { subscribeMaterials } from '@/lib/db/materials';
import { createMaterialOrder } from '@/lib/db/materialOrders';
import {
  subscribeEinsatzMaterialForDate,
  saveEinsatzMaterial,
} from '@/lib/db/einsatzMaterial';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type {
  Project,
  AppUser,
  Assignment,
  Betriebsurlaub,
  Material,
  EinsatzMaterial,
  RuestPosition,
} from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import MonthCalendar from '@/components/MonthCalendar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, CheckboxField } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import PersonPicker from '@/components/PersonPicker';
import RuestlistePlanen from './RuestlistePlanen';
import { useModul } from '@/lib/useModule';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, TeilFehler } from '@/components/States';

/** 'YYYY-MM-DD' -> 'Fr., 28.08.2026'. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Auswahlzustand je Mitarbeiter: eingeplant und in welcher Rolle. */
interface Pick {
  on: boolean;
  asHelper: boolean;
}

/**
 * Einsatzplanung: Kalender + Baustelle + Mitarbeiter -> speichern.
 *
 * Der Kalender ersetzt das Datumsfeld aus der ersten Fassung. Wer plant,
 * fragt nicht „welches Datum hat der Dienstag?", sondern „wo ist noch nichts
 * eingeteilt?" — und diese Frage beantwortet nur das Monatsraster.
 */
export default function AssignmentsView() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  /**
   * Tag und Baustelle koennen vom Wochenplan mitkommen.
   *
   * Dort steht, WER wann frei ist; eingetragen wird hier. Ohne diese
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
  const startDatum = uebergabe?.datum ?? todayStr();

  const [date, setDate] = useState(startDatum);
  const [cursor, setCursor] = useState(() => {
    // Lokal rechnen, NICHT über toISOString: das rechnet in UTC und liefert
    // am Monatsersten vor 02:00 Uhr (Sommerzeit) noch den Vormonat.
    const [y, m] = startDatum.split('-');
    return { year: Number(y), month: Number(m) - 1 };
  });
  const [projectNumber, setProjectNumber] = useState(uebergabe?.projectNumber ?? '');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [comment, setComment] = useState('');
  const [monthAssignments, setMonthAssignments] = useState<WithId<Assignment>[]>([]);
  const [urlaube, setUrlaube] = useState<Abwesenheit[]>([]);
  const [betriebsurlaube, setBetriebsurlaube] = useState<Betriebsurlaub[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Kalender steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Assignment> | null>(null);

  /*
    Die Rüstliste. Sie hängt am Paar aus Tag und Baustelle, nicht an der
    Person — deshalb ein eigener Zustand neben `picks` und ein eigener Knopf.
    Wer nur das Material ändert, soll die Mannschaft nicht anfassen müssen.
  */
  const materialAn = useModul('material');
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [tagesListen, setTagesListen] = useState<WithId<EinsatzMaterial>[]>([]);
  const [ruestliste, setRuestliste] = useState<RuestPosition[]>([]);
  /** Eine freie Zeile der Rüstliste, die eingetippt, aber nicht hinzugefügt ist. */
  const [offeneRuestzeile, setOffeneRuestzeile] = useState<string | null>(null);
  const [ruestFehler, setRuestFehler] = useState<string | null>(null);
  const [anforderungLaeuft, setAnforderungLaeuft] = useState(false);
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
   * Der Materialstamm — nur wenn das Modul überhaupt an ist.
   *
   * Ein Fehlschlag bleibt hier folgenlos: ohne Katalog gibt es keine Suche,
   * aber die Einteilung selbst ist davon unberührt. Sie ist die Aufgabe
   * dieser Ansicht; das Material ist die Zugabe.
   */
  useEffect(() => {
    if (!user || !materialAn) return;
    return subscribeMaterials(user.companyId, setMaterials, () => setMaterials([]));
  }, [user, materialAn]);

  /** Die Rüstlisten des gewählten Tages, live wie die Einteilung selbst. */
  useEffect(() => {
    if (!user || !materialAn) return;
    return subscribeEinsatzMaterialForDate(
      user.companyId,
      date,
      setTagesListen,
      () => setTagesListen([]),
    );
  }, [user, date, materialAn]);

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
        .filter((u) => u.role === 'Mitarbeiter' && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );

  /**
   * Vorhandene Planung ins Formular übernehmen, sobald Datum UND Baustelle
   * stehen. Ohne das startete das Formular leer und das Speichern hätte die
   * bestehenden Einsätze gelöscht (delete-then-recreate) — echter Datenverlust,
   * wenn eigentlich nur der Kommentar geändert werden sollte.
   */
  useEffect(() => {
    if (!projectNumber) {
      setPicks({});
      setComment('');
      return;
    }
    const existing = dayAssignments.filter((a) => a.projectNumber === projectNumber);
    const next: Record<string, Pick> = {};
    for (const a of existing) next[a.userId] = { on: true, asHelper: !!a.asHelper };
    setPicks(next);
    setComment(existing[0]?.comment ?? '');
  }, [projectNumber, dayAssignments]);

  /**
   * Dieselbe Vorsicht wie bei der Mannschaft: eine vorhandene Rüstliste kommt
   * ins Formular, bevor jemand speichern kann. Startete es leer, hätte ein
   * Speichern die geplante Liste gelöscht — und der Monteur führe am
   * nächsten Morgen ohne Material los.
   */
  useEffect(() => {
    if (!projectNumber) {
      setRuestliste([]);
      return;
    }
    const treffer = tagesListen.find((l) => l.projectNumber === projectNumber);
    setRuestliste(treffer?.positionen ?? []);
  }, [projectNumber, tagesListen]);

  /**
   * Wo steht diese Person an diesem Tag SCHON — auf anderen Baustellen?
   *
   * Mehrere Einsätze am selben Tag waren technisch immer möglich: gespeichert
   * wird je Paar aus Tag und Baustelle, ein Mitarbeiter kann also in mehreren
   * Paaren vorkommen. Nur SAH das niemand. Wer vormittags die eine Baustelle
   * plant und nachmittags die andere, teilte denselben Monteur zweimal ein,
   * ohne es zu merken — oder traute sich umgekehrt nicht, weil das Formular
   * so aussah, als würde die zweite Einteilung die erste ersetzen.
   *
   * Die eigene Baustelle bleibt draußen: dass jemand auf der Baustelle steht,
   * die man gerade plant, zeigt schon der gesetzte Haken.
   */
  const schonVerplant = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of dayAssignments) {
      if (a.projectNumber === projectNumber) continue;
      const proj = projects.find((p) => p.projectNumber === a.projectNumber);
      const liste = m.get(a.userId) ?? [];
      liste.push(proj?.customerName ?? a.projectNumber);
      m.set(a.userId, liste);
    }
    return m;
  }, [dayAssignments, projectNumber, projects]);

  /**
   * Wer am GEWÄHLTEN Tag den GANZEN Tag fehlt — uid -> Grund („Urlaub",
   * „ZA", „Krank" oder „abwesend").
   *
   * Stundenweise weg (ZA 13–17 Uhr) zählt hier nicht: vormittags ist die
   * Person da und darf ohne Warnung eingeteilt werden. Sie steht in
   * `teilweiseWeg` und bekommt einen Hinweis am Namen.
   */
  const { imUrlaub, teilweiseWeg } = useMemo(() => {
    const ganz = new Map<string, string>();
    const teils = new Map<string, string>();
    for (const v of urlaube) {
      if (v.von > date || v.bis < date) continue;
      const text = [v.grund ?? 'abwesend', v.zeiten].filter(Boolean).join(' ');
      if (v.zeiten) teils.set(v.userId, text);
      else ganz.set(v.userId, text);
    }
    return { imUrlaub: ganz, teilweiseWeg: teils };
  }, [urlaube, date]);
  const nameVon = (uid: string) => users.find((u) => u.uid === uid)?.name ?? 'Mitarbeiter';

  /** Hat der Betrieb am gewählten Tag zu? */
  const betriebsurlaubHeute = betriebsurlaube.find((b) => b.von <= date && b.bis >= date);

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

  const selectedCount = Object.values(picks).filter((p) => p.on).length;
  /**
   * Jemanden im Urlaub einzuteilen ist kein Fehler des Programms, sondern
   * fast immer ein Versehen. Verboten wird es nicht — bei einem Notdienst
   * holt man auch mal jemanden aus dem Urlaub — aber es steht dann dabei.
   */
  const verplanteUrlauber = useMemo(
    () =>
      Object.entries(picks)
        .filter(([uid, p]) => p.on && imUrlaub.has(uid))
        .map(([uid]) => `${users.find((u) => u.uid === uid)?.name ?? 'Mitarbeiter'} (${imUrlaub.get(uid)})`),
    [picks, imUrlaub, users],
  );
  const existingForProject = dayAssignments.filter((a) => a.projectNumber === projectNumber);
  const holiday = getAustrianHolidayName(new Date(`${date}T00:00:00`));
  const weekend = isWeekend(new Date(`${date}T00:00:00`));

  async function save() {
    if (!user || !projectNumber) return;
    if (selectedCount === 0) {
      setError(
        existingForProject.length > 0
          ? 'Kein Mitarbeiter ausgewählt. Zum Entfernen der Planung bitte die Einsätze unten einzeln löschen.'
          : 'Bitte mindestens einen Mitarbeiter auswählen.',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rows = staff
        .filter((u) => picks[u.uid]?.on)
        .map((u) => ({
          date,
          projectNumber,
          userId: u.uid,
          userName: u.name,
          // Helfer werden mit einem anderen Satz verrechnet — ein vergessener
          // Haken kostet bare Münze.
          asHelper: !!picks[u.uid]?.asHelper,
          comment,
          createdBy: user.uid,
        }));
      await saveAssignments(user.companyId, date, projectNumber, rows);

      /*
        DIE RUESTLISTE GEHT IM SELBEN ZUG MIT.

        Gemeldet: „ich würde es besser finden, Einsatz plus Rüstliste
        gemeinsam zu speichern und nicht einzeln. Das ist ein zusätzlicher
        Knopfdruck, auf den man potenziell vergessen kann."

        Der Einwand trifft genau die teure Stelle. Wer den zweiten Knopf
        vergisst, merkt es nicht — die Liste steht ja ausgefüllt vor ihm.
        Auffallen würde es erst am nächsten Morgen, wenn der Monteur auf
        seiner Startseite kein Material findet und ohne losfährt.

        DIE KENNUNGEN KOMMEN AUS `rows`, nicht aus der gespeicherten
        Einteilung. An dieser Liste haengt die Regel, die entscheidet, wer
        abhaken darf. Vorher musste die Mannschaft dafuer schon gespeichert
        sein — jetzt ist sie es in derselben Handlung, und zwar mit genau
        den Leuten, die eben geschrieben wurden.

        GESCHRIEBEN WIRD NUR, WENN ES ETWAS ZU SCHREIBEN GIBT: Positionen im
        Formular, oder eine bereits gespeicherte Liste, die geleert werden
        soll. Sonst entstuende fuer jeden Einsatz ein leeres Dokument.
      */
      const positionen = ruestliste.filter((p) => p.menge > 0);
      const hatGespeicherteListe = tagesListen.some((l) => l.projectNumber === projectNumber);
      if (materialAn && (positionen.length > 0 || hatGespeicherteListe)) {
        try {
          await saveEinsatzMaterial(
            user.companyId,
            date,
            projectNumber,
            positionen,
            rows.map((r) => r.userId),
            user.uid,
          );
        } catch {
          /*
            Der Einsatz steht bereits — das muss dastehen. „Speichern
            fehlgeschlagen" liesse den Planer glauben, auch die Einteilung
            sei weg, und er teilte sie ein zweites Mal ein.
          */
          setError(
            'Der Einsatz ist gespeichert, die Rüstliste nicht. Bitte noch einmal speichern.',
          );
          return;
        }
        toast.success('Einsatz und Rüstliste gespeichert');
        return;
      }

      toast.success('Einsatz gespeichert');
    } catch {
      setError('Der Einsatz konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Aus einer Unterdeckung eine Materialanforderung machen — AUF TIPP.
   *
   * Nie von selbst: der Planer weiß vielleicht, dass morgen eine Lieferung
   * kommt oder das Teil schon im Bus liegt. Eine Schreibung in die
   * Arbeitsliste eines anderen, auf Grundlage einer Vermutung, ist genau die
   * Sorte Funktion, die das Vertrauen in die App kostet.
   *
   * Der LAGERSTAND BLEIBT UNANGETASTET. Abgezogen wird erst, wenn die
   * Anforderung erledigt oder abgeholt wird — dort, wo es schon immer
   * passiert. Zweimal abziehen hieße, den Bestand kaputtzurechnen.
   */
  async function anforderungAnlegen(position: RuestPosition, fehlmenge: number) {
    if (!user) return;
    setAnforderungLaeuft(true);
    setRuestFehler(null);
    try {
      await createMaterialOrder(user.companyId, {
        materialId: position.materialId ?? '',
        materialName: position.name,
        quantity: fehlmenge,
        projectNumber,
        note: `Für den Einsatz am ${fmtDay(date)}`,
        status: 'Offen',
        transactionType: 'order',
        userId: user.uid,
        userName: user.name,
      });
      toast.success('Anforderung angelegt');
    } catch {
      setRuestFehler('Die Anforderung konnte nicht angelegt werden.');
    } finally {
      setAnforderungLaeuft(false);
    }
  }

  if (!user) return null;

  // Tagesübersicht nach Baustelle gruppieren.
  const byProject = new Map<string, WithId<Assignment>[]>();
  for (const a of dayAssignments) {
    const list = byProject.get(a.projectNumber) ?? [];
    list.push(a);
    byProject.set(a.projectNumber, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Einsatzplanung" subtitle="Mitarbeiter einem Tag und einer Baustelle zuteilen" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
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
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand/25 ring-1 ring-brand" />
              Heute
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-5 rounded-sm border border-line bg-surface-2 shadow-[inset_0_2px_0_0_var(--warning)]" />
              Feiertag (AT)
            </span>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <div ref={formular} className="scroll-mt-4">
          <Card title={`Einsatz planen — ${fmtDay(date)}`}>
            <BaustellenSelect
              id="aproj"
              companyId={user.companyId}
              value={projectNumber}
              onChange={(nr, p) => {
                setProjectNumber(nr);
                if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
              }}
            />

            {(holiday || weekend) && (
              <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
                {holiday ? `${holiday} — gesetzlicher Feiertag.` : 'Wochenende.'} Einsatz ist trotzdem
                planbar.
              </p>
            )}

            {/*
              Wer an diesem Tag im Urlaub ist — VOR der Auswahlliste, nicht
              hinterher. Diese Zeile ist der Grund, warum der Urlaub überhaupt
              in dieser Ansicht auftaucht.
            */}
            {betriebsurlaubHeute && (
              <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning" role="alert">
                <strong>{betriebsurlaubHeute.bezeichnung}:</strong> Der Betrieb hat an diesem Tag
                zu. Einteilen geht trotzdem — etwa für einen Notdienst.
              </p>
            )}
            {imUrlaub.size > 0 && (
              <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
                <strong>Abwesend an diesem Tag:</strong>{' '}
                {[...imUrlaub].map(([uid, grund]) => `${nameVon(uid)} (${grund})`).join(', ')}
              </p>
            )}

            {/*
              Ausdrücklich sagen, dass Mehrfach-Einteilung geht. Das Formular
              speichert je Paar aus Tag und Baustelle; wer das nicht weiß,
              vermutet hinter dem Speichern ein Überschreiben des ganzen Tages.
            */}
            {projectNumber && schonVerplant.size > 0 && (
              <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
                Einige Mitarbeiter sind heute bereits auf anderen Baustellen eingeteilt (siehe
                Hinweis am Namen). Eine zusätzliche Einteilung ist möglich — die bestehende bleibt
                bestehen.
              </p>
            )}

            {projectNumber && existingForProject.length > 0 && (
              <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
                Für diese Baustelle ist der Tag bereits geplant. Die Auswahl unten ist übernommen —
                Speichern überschreibt sie.
              </p>
            )}

            <div className="mt-4">
              {/* Der Helfer-Haken haengt an der EINZELNEN Auswahl, deshalb als
                  Zusatz je Zeile: ein vergessener Haken kostet den falschen
                  Verrechnungssatz. */}
              <PersonPicker
                legend="Mitarbeiter"
                idPrefix="assign"
                people={staff.map((u) => {
                  const andere = schonVerplant.get(u.uid);
                  // Der Urlaub zuerst: er ist der Grund, jemanden GAR NICHT
                  // einzuteilen. Eine zweite Baustelle ist nur eine Warnung.
                  const hinweise = [
                    imUrlaub.has(u.uid) ? (imUrlaub.get(u.uid) as string) : null,
                    teilweiseWeg.has(u.uid) ? (teilweiseWeg.get(u.uid) as string) : null,
                    andere?.length ? `heute schon eingeteilt: ${andere.join(', ')}` : null,
                  ].filter(Boolean);
                  return {
                    uid: u.uid,
                    name: u.name,
                    hint: hinweise.length > 0 ? hinweise.join(' · ') : undefined,
                    // Genau dieselben zwei Gruende, die schon im Hinweis
                    // stehen — nur maschinenlesbar, damit die Liste sie
                    // sortieren und filtern kann.
                    // Stundenweise weg macht niemanden unfrei — vormittags
                    // ist er da.
                    nichtFrei: imUrlaub.has(u.uid) || !!andere?.length,
                  };
                })}
                selected={staff.filter((u) => picks[u.uid]?.on).map((u) => u.uid)}
                onChange={(next) =>
                  setPicks(() => {
                    const out: Record<string, Pick> = {};
                    for (const uid of next) out[uid] = { on: true, asHelper: !!picks[uid]?.asHelper };
                    return out;
                  })
                }
                emptyHint="Keine aktiven Mitarbeiter vorhanden."
                renderExtra={(uid) => (
                  <CheckboxField
                    id={`helper-${uid}`}
                    label="als Helfer"
                    checked={!!picks[uid]?.asHelper}
                    onChange={(e) =>
                      setPicks((c) => ({ ...c, [uid]: { on: true, asHelper: e.target.checked } }))
                    }
                  />
                )}
              />
            </div>

            <div className="mt-4">
              <InputField id="acomment" label="Kommentar / Aufgabe" value={comment}
                onChange={(e) => setComment(e.target.value)} />
            </div>
            {/*
              Nicht verbieten, sondern sagen. Bei einem Notdienst holt man auch
              mal jemanden aus dem Urlaub; eine Sperre stünde dann im Weg. Ein
              stilles Durchwinken wäre aber genauso falsch.
            */}
            {verplanteUrlauber.length > 0 && (
              <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
                <strong>{verplanteUrlauber.join(', ')}</strong>{' '}
                {verplanteUrlauber.length === 1 ? 'ist' : 'sind'} an diesem Tag abwesend. Das
                Einteilen geht trotzdem — gemeint ist es meistens nicht.
              </p>
            )}
          </Card>
          </div>

          {/*
            NACH dem Einsatz, VOR der Tagesübersicht. Erst steht fest, wer
            hinfährt; dann, was mitkommt. Und nur mit gewählter Baustelle —
            eine Rüstliste ohne Baustelle gehört zu nichts.
          */}
          {materialAn && projectNumber && (
            <Card
              title="Material für diesen Einsatz"
              hint={
                <>
                  Was der Monteur am Einsatztag mitnehmen soll. Er sieht die Liste auf seiner
                  Startseite und hakt ab, was im Bus ist. Der Lagerstand ändert sich dadurch
                  <strong> nicht</strong> — gebucht wird er weiterhin über die Materialanforderung
                  und das Abholen.
                </>
              }
            >
              <RuestlistePlanen
                materials={materials}
                positionen={ruestliste}
                onChange={setRuestliste}
                onAnforderung={anforderungAnlegen}
                anforderungLaeuft={anforderungLaeuft}
                onOffen={setOffeneRuestzeile}
              />
              {/*
                Der Fehler der ANFORDERUNG steht weiter hier — sie ist ein
                eigener Vorgang mit eigenem Knopf. Der Fehler des Speicherns
                steht unten beim Speichern.
              */}
              {ruestFehler && <div className="mt-3"><ErrorState message={ruestFehler} /></div>}
            </Card>
          )}

          {/*
            EIN Knopf fuer das ganze Formular, am Ende des Formulars.

            Vorher standen hier zwei: einer fuer die Mannschaft, einer fuer
            die Ruestliste. Gemeldet: „das ist ein zusätzlicher Knopfdruck,
            auf den man potenziell vergessen kann." Und vergessen faellt
            nicht auf — die ausgefuellte Liste steht ja da; auffallen wuerde
            es erst dem Monteur am naechsten Morgen.

            Er steht UNTER der Ruestliste, nicht darueber: sonst scrollte man
            beim Ausfuellen an ihm vorbei und suchte ihn danach unten.
          */}
          <div>
            {error && <div className="mb-3"><ErrorState message={error} /></div>}
            {/*
              EINGETIPPT, ABER NICHT HINZUGEFÜGT — wie am Handwerksschein. Die
              freie Zeile kommt erst mit „Hinzufügen" auf die Rüstliste; wer
              sie eintippt und gleich speichert, verlor sie still, und der
              Monteur stand ohne das Leihgerät auf der Baustelle.
            */}
            {offeneRuestzeile && materialAn && (
              <p className="mb-3 text-sm text-warning" role="alert">
                <strong>Noch nicht auf der Rüstliste:</strong> {offeneRuestzeile}. Bitte
                „Hinzufügen" oder das Feld leeren.
              </p>
            )}
            <Button
              onClick={save}
              loading={saving}
              disabled={!projectNumber || (materialAn && !!offeneRuestzeile)}
            >
              {materialAn && projectNumber ? 'Einsatz und Rüstliste speichern' : 'Einsatz speichern'}
            </Button>
          </div>

          <Card title={`Einsätze am ${fmtDay(date)}`}>
            {dayAssignments.length === 0 ? (
              <EmptyState>Keine Einsätze an diesem Tag.</EmptyState>
            ) : (
              <div className="space-y-4">
                {[...byProject.entries()].map(([pn, rows]) => {
                  const proj = projects.find((p) => p.projectNumber === pn);
                  const fach = rows.filter((r) => !r.asHelper).length;
                  const helper = rows.filter((r) => r.asHelper).length;
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
                  return (
                    <div key={pn} className="rounded-sm border border-line">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
                        <span className="font-semibold text-ink">
                          {proj?.customerName ?? pn}{' '}
                          <span className="tnum text-sm text-ink-muted">({pn})</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Marke>{fach} Facharbeiter</Marke>
                          {helper > 0 && <Marke>{helper} Helfer</Marke>}
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
                      {(aufgabe || material.length > 0) && (
                        <div className="space-y-2 border-b border-line px-3 py-2 text-sm">
                          {aufgabe && (
                            <p className="whitespace-pre-line text-ink">
                              <span className="font-medium">Aufgabe:</span> {aufgabe}
                            </p>
                          )}
                          {material.length > 0 && (
                            <div>
                              <p className="font-medium text-ink">Material:</p>
                              <ul className="mt-1 space-y-0.5 text-ink">
                                {material.map((m) => (
                                  <li key={m.id} className="flex flex-wrap gap-x-2">
                                    <span className="tnum">
                                      {m.menge}
                                      {m.einheit ? ` ${m.einheit}` : ''}
                                    </span>
                                    <span>{m.name}</span>
                                    {geladen[m.id] && (
                                      <span className="text-success">✓ eingeladen</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      <ul className="divide-y divide-line">
                        {rows.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-ink">{a.userName}</span>
                              {a.comment?.trim() && a.comment.trim() !== aufgabe && (
                                <span className="block truncate text-sm text-ink-muted">{a.comment}</span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {a.asHelper && <Marke>Helfer</Marke>}
                              <IconButton label={`Einsatz von ${a.userName} löschen`} tone="danger"
                                onClick={() => setToDelete(a)}>
                                ✕
                              </IconButton>
                            </span>
                          </li>
                        ))}
                      </ul>
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
            */}
            {/*
              `staff.length > 0` ist keine Formalie, sondern der Unterschied
              zwischen einer Aussage und einer Behauptung. Solange die
              Belegschaft nicht geladen ist, ist die Luecke LEER — und die
              Zeile sagte „alle sind eingeteilt", obwohl sie niemanden kennt.
              Faellt das Laden ganz aus, steht das oben als Teilfehler.
            */}
            {dayAssignments.length > 0 && staff.length > 0 && (
              <p className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
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
