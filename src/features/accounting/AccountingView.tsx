import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { listProjectsByNumbers } from '@/lib/db/projects';
import {
  subscribeEntriesInRange,
  listEntriesInRange,
  listEntriesForProjects,
  deleteTimeEntry,
  listUrlaubstage,
} from '@/lib/db/timeEntries';
import {
  calcMonthStats,
  calcCompleteness,
  calcWorkMin,
  fmtMin,
  getAustrianHolidayName,
  localDateStr,
  type CompletenessStatus,
  uebertragsRegel,
  tageWort,
} from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Project, TimeEntry } from '@/types';
import { erscheintInAuswertung, shouldShowOvertime } from '@/lib/permissions';
import Card from '@/components/Card';
import { Marke, Warnung, Zustand } from '@/components/Badge';
import Zeitmarker from '@/features/time/Zeitmarker';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/Icon';
import ExportDialog from './ExportDialog';
import ProjectSummary from './ProjectSummary';
import TimeForm from '@/features/time/TimeForm';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, SelectField, CheckboxField } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import {
  buildMonthCsv,
  monthCsvFilename,
  buildUserCsv,
  userCsvFilename,
  buildUserProjectCsv,
  userProjectCsvFilename,
  hoursPdfFilename,
  downloadCsv,
  entriesInRange,
} from './export';

const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const STATUS_LABEL: Record<CompletenessStatus, string> = {
  complete: 'vollständig',
  today_only: 'heute offen',
  missing: 'fehlt',
};


/** Alle Kalendertage eines Monats als 'YYYY-MM-DD'. */
function daysOfMonth(year: number, month: number): string[] {
  const last = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => localDateStr(new Date(year, month, i + 1)));
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** '2026-08-03' -> 'Mo 03.08.' — der Wochentag macht den Monat lesbar. */
function dayLabel(iso: string): string {
  return `${WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()]} ${iso.slice(8)}.${iso.slice(5, 7)}.`;
}

/**
 * Mitarbeiterübersicht (Buchhaltung/GF/Admin): Monatsauswertung je Mitarbeiter
 * mit Vollständigkeitskontrolle. Da es keinen Freigabe-Workflow gibt, ist die
 * Ampel die eigentliche Kontrollinstanz der Geschäftsführung.
 */
export default function AccountingView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  /** Alle Stunden der vorkommenden Baustellen; `null` = nicht geladen. */
  const [gesamtProjektzeiten, setGesamtProjektzeiten] = useState<WithId<TimeEntry>[] | null>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Auswertung steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [nurLuecken, setNurLuecken] = useState(false);
  /** Offener Zeitraum-Export für einen Mitarbeiter. */
  const [exportFor, setExportFor] = useState<AppUser | null>(null);
  /** Erfassen fuer einen Mitarbeiter bzw. Korrigieren eines Eintrags. */
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<TimeEntry> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<TimeEntry> | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch((e) => setError(e.message));
  }, [user]);

  /**
   * Nur die Baustellen, die in den geladenen Buchungen VORKOMMEN.
   *
   * Gebraucht werden hier ausschliesslich Kundenname und Stundenbudget zu den
   * Nummern, die ohnehin schon auf dem Schirm sind. Vorher wurde dafuer der
   * gesamte Baustellenbestand des Betriebs geladen — nach zehn Jahren
   * zweitausend Dokumente, um dreissig Namen nachzuschlagen. Die Menge haengt
   * jetzt am angezeigten Zeitraum, nicht am Alter des Betriebs.
   */
  const projektNummern = useMemo(
    () => [...new Set(entries.map((e) => e.projectNumber).filter(Boolean) as string[])],
    [entries],
  );
  const nummernSchluessel = projektNummern.join('|');
  useEffect(() => {
    if (!user || projektNummern.length === 0) {
      setProjects([]);
      return;
    }
    // Ohne die Stammdaten stehen in der Auswertung nur Baustellennummern.
    listProjectsByNumbers(user.companyId, projektNummern)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellendaten'));
    // Am Inhalt haengen, nicht an der Array-Identitaet: sonst laedt jeder
    // Renderdurchlauf neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummernSchluessel]);

  /**
   * ALLE Stunden der vorkommenden Baustellen — nur für den Budgetstand.
   *
   * WARUM DAS SEIN MUSS. `estimatedHours` ist für den GANZEN Auftrag
   * kalkuliert. Die Auswertung verglich dagegen die Stunden des gewählten
   * Monats damit und meldete „22,5 h / 40 h · 56 %", während dieselbe
   * Baustelle im Dashboard bei „39,5 von 40 h · 99 %" stand — der
   * Unterschied waren die Stunden des Vormonats. Wer hier nachsah, hielt eine
   * ausgereizte Baustelle für halb offen.
   *
   * Dieselbe Funktion wie im Dashboard, damit die beiden Zahlen aus
   * derselben Quelle kommen und nicht wieder auseinanderlaufen können.
   *
   * `null` heißt „nicht geladen" — die Auswertung lässt den Balken dann weg,
   * statt auf die Monatszahl zurückzufallen. Das war ja der Fehler.
   */
  useEffect(() => {
    if (!user || projektNummern.length === 0) {
      setGesamtProjektzeiten([]);
      return;
    }
    let verworfen = false;
    listEntriesForProjects(user.companyId, projektNummern)
      .then((rows) => {
        if (!verworfen) setGesamtProjektzeiten(rows);
      })
      .catch(() => {
        if (verworfen) return;
        setGesamtProjektzeiten(null);
        setNebenFehler('Die Gesamtstunden der Baustellen');
      });
    return () => {
      verworfen = true;
    };
    // Am Inhalt haengen, nicht an der Array-Identitaet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummernSchluessel]);

  // Nur das angezeigte Jahr, nicht die gesamte Betriebsgeschichte. Das Jahr
  // (nicht der Monat) deshalb, weil der Resturlaub die Urlaubstage des ganzen
  // Jahres zählt.
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return subscribeEntriesInRange(
      user.companyId,
      `${year}-01-01`,
      `${year}-12-31`,
      (rows) => {
        setEntries(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [user, year]);

  /*
    DER URLAUBSVERLAUF — eine eigene, schmale Abfrage neben dem Jahr.

    Der Resturlaub hängt seit dem Übertrag nicht mehr nur am angezeigten Jahr:
    was 2026 offen blieb, steht 2027 zur Verfügung. Ohne den Verlauf wäre der
    Übertrag hier immer null — die Mitarbeiteransicht zeigte den richtigen
    Stand und die Lohn-CSV den alten.

    Geholt werden NUR Urlaubstage, serverseitig gefiltert. Den kompletten
    Zeitbestand mehrerer Jahre zu laden wäre um Grössenordnungen mehr, als die
    Frage braucht. Der Zeitraum beginnt am frühesten Startdatum der
    Belegschaft; früher gibt es nichts zu rechnen.
  */
  const [urlaubVerlauf, setUrlaubVerlauf] = useState<WithId<TimeEntry>[]>([]);
  const fruehesterStart = useMemo(
    () => users.map((u) => u.appStartDate).filter((d): d is string => !!d).sort()[0] ?? null,
    [users],
  );

  useEffect(() => {
    if (!user || !fruehesterStart) {
      setUrlaubVerlauf([]);
      return;
    }
    let abgemeldet = false;
    listUrlaubstage(user.companyId, fruehesterStart, `${year}-12-31`)
      .then((rows) => { if (!abgemeldet) setUrlaubVerlauf(rows); })
      // Ein fehlender Verlauf darf die Ansicht nicht kippen: dann rechnet sie
      // ohne Übertrag weiter — zu wenig, aber nicht gar nichts.
      .catch(() => { if (!abgemeldet) setUrlaubVerlauf([]); });
    return () => { abgemeldet = true; };
  }, [user, fruehesterStart, year]);

  const urlaubsRegel = useMemo(() => uebertragsRegel(company), [company]);

  // Deaktivierte Mitarbeiter fallen aus der Auswertung (Legacy:5407).
  const relevant = useMemo(
    () =>
      users
        .filter((u) => erscheintInAuswertung(u.role) && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const alleRows = useMemo(
    () =>
      relevant.map((u) => {
        const own = entries.filter((e) => e.userId === u.uid);
        const monthEntries = own.filter((e) => e.date.startsWith(monthPrefix));
        const yearEntries = own.filter((e) => e.date.startsWith(String(year)));
        return {
          user: u,
          monthEntries,
          stats: calcMonthStats(u, monthEntries, yearEntries, year, month, {
            verlauf: urlaubVerlauf
              .filter((e) => e.userId === u.uid)
              .map((e) => ({ von: e.date, tage: 1 })),
            regel: urlaubsRegel,
          }),
          completeness: calcCompleteness(u, monthEntries, year, month),
        };
      }),
    [relevant, entries, monthPrefix, year, month, urlaubVerlauf, urlaubsRegel],
  );

  /**
   * Suche und Filter. Bei zwanzig Monteuren ist die Liste sonst nur noch
   * scrollbar: wer EINEN Mitarbeiter prüfen will, sucht ihn; wer den Monat
   * abschliesst, will die mit Luecken sehen und nicht die anderen achtzehn.
   */
  const luecken = useMemo(
    () => alleRows.filter((r) => r.completeness.missingCount > 0).length,
    [alleRows],
  );
  const rows = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return alleRows.filter(
      (r) =>
        (!q || r.user.name.toLowerCase().includes(q)) &&
        (!nurLuecken || r.completeness.missingCount > 0),
    );
  }, [alleRows, suche, nurLuecken]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function exportMonthCsv() {
    // Bewusst alleRows: der Monatsexport ist ein Abschluss und darf nicht
    // davon abhaengen, was gerade im Suchfeld steht.
    downloadCsv(buildMonthCsv(alleRows, year, month), monthCsvFilename(year, month));
    toast.success('Monats-CSV heruntergeladen');
  }

  function exportUserCsv(u: AppUser) {
    const r = alleRows.find((x) => x.user.uid === u.uid);
    if (!r || r.monthEntries.length === 0) {
      toast.error('Keine Einträge für diesen Monat.');
      return;
    }
    downloadCsv(
      buildUserCsv(u, r.monthEntries, r.stats, year, month),
      userCsvFilename(u, year, month),
    );
    toast.success(`CSV für ${u.name} heruntergeladen`);
  }

  async function exportPdf(u: AppUser, from: string, to: string) {
    // Frisch aus der Datenbank statt aus der Ansicht: der gewählte Zeitraum
    // kann über das geladene Jahr hinausreichen.
    const range = entriesInRange(
      await listEntriesInRange(user!.companyId, from, to),
      u.uid,
      from,
      to,
    );
    if (range.length === 0) throw new Error('Keine Einträge im gewählten Zeitraum.');
    // Erst hier nachladen: jsPDF wiegt mehrere hundert Kilobyte und wird nur
    // gebraucht, wenn wirklich jemand einen Nachweis erzeugt.
    const { generateHoursPdf } = await import('./hoursPdf');
    const doc = generateHoursPdf({
      company: company ?? ({ id: '', name: 'Firma' } as NonNullable<typeof company>),
      user: u,
      entries: range,
      from,
      to,
    });
    doc.save(hoursPdfFilename(u, from, to));
    toast.success('Stundennachweis erstellt');
  }

  async function exportProjectCsv(u: AppUser, from: string, to: string) {
    const range = entriesInRange(
      await listEntriesInRange(user!.companyId, from, to),
      u.uid,
      from,
      to,
    );
    const withProject = range.filter((e) => e.status === 'Anwesend' && e.projectNumber);
    if (withProject.length === 0) throw new Error('Keine Projekteinträge im gewählten Zeitraum.');
    downloadCsv(buildUserProjectCsv(u, range, from, to), userProjectCsvFilename(u, from, to));
    toast.success('Projektauswertung heruntergeladen');
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mitarbeiterübersicht"
        subtitle="Monatsauswertung, Vollständigkeit und Salden"
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <Card title="Zeitraum">
        <div className="grid grid-cols-2 gap-4">
          <SelectField id="acc-month" label="Monat" value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </SelectField>
          <SelectField id="acc-year" label="Jahr" value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </SelectField>
        </div>
      </Card>

      {/* Zeiten für andere erfassen und korrigieren — z. B. wenn ein Monteur
          krank ist oder sich vertippt hat. Die Rules erlauben das für
          Buchhaltung/GF/Administrator. */}
      {(creating || editing) && (
        <Card
          title={
            editing
              ? `Eintrag von ${editing.userName ?? 'Mitarbeiter'} korrigieren`
              : 'Zeit für einen Mitarbeiter erfassen'
          }
        >
          {/* Ohne existingDates: der Zielmitarbeiter steht erst nach der
              Auswahl fest — die Doppelbuchung fängt createTimeEntry ab. */}
          <TimeForm
            key={editing?.id ?? 'new-foreign'}
            entry={editing ?? undefined}
            staff={editing ? undefined : relevant}
            ownerRole={
              editing ? users.find((u) => u.uid === editing.userId)?.role : undefined
            }
            onSaved={() => {
              setCreating(false);
              setEditing(null);
            }}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </Card>
      )}

      <Card
        title={`${MONTHS[month]} ${year}`}
        action={
          <span className="flex flex-wrap gap-2">
            {!creating && !editing && (
              <Button
                variant="accent"
                onClick={() => {
                  setEditing(null);
                  setCreating(true);
                }}
              >
                Zeit erfassen
              </Button>
            )}
            {rows.length > 0 && (
              <Button variant="secondary" onClick={exportMonthCsv}>
                <Icon name="download" size={16} className="mr-2 shrink-0" />
                Monats-CSV
              </Button>
            )}
          </span>
        }
      >
        {alleRows.length >= 8 && (
          <div className="mb-4 space-y-2">
            <InputField
              id="accsuche"
              label="Mitarbeiter suchen"
              type="search"
              placeholder="Name"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
            {/* Beim Monatsabschluss zaehlt genau eine Frage: bei wem fehlt
                noch etwas? Ohne diesen Filter scrollt man durch zwanzig
                vollstaendige Zeilen, um die zwei offenen zu finden. */}
            <CheckboxField
              id="accluecken"
              label={`Nur mit fehlenden Tagen (${luecken} von ${alleRows.length})`}
              checked={nurLuecken}
              onChange={(e) => setNurLuecken(e.target.checked)}
            />
          </div>
        )}
        {loading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState>
            {/*
              WARUM DIESE UNTERSCHEIDUNG. „Keine aktiven Mitarbeiter mit
              Zeitkonto" stand hier auch dann, wenn der Betrieb sehr wohl
              Benutzer hat — nur eben keinen, der ein Zeitkonto FÜHRT.
              Geschäftsführung und Administration tun das nicht (siehe
              `erscheintInAuswertung`), sie erscheinen hier also nie, auch
              nicht mit eigenen Buchungen. Die Projektleitung erscheint sehr
              wohl — sie führt kein Zeitkonto, bucht aber Zeit.

              Aus dem Betrieb gemeldet: die Geschäftsführung bucht eine Zeit
              und liest danach, es gebe keine Mitarbeiter. Die Aussage war
              richtig und trotzdem irreführend — sie klang nach einem Fehler,
              wo eine Erklärung hingehört.
            */}
            {alleRows.length === 0
              ? users.length === 0
                ? 'Noch keine Benutzer angelegt.'
                : 'Kein Konto erscheint in dieser Auswertung. Geschäftsführung und Administration stehen hier nicht — auch nicht mit eigenen Buchungen. Monteure, Verwaltung, Buchhaltung und Projektleitung legst du unter Einstellungen → Benutzerverwaltung an.'
              : suche
                ? `Kein Mitarbeiter passt zu „${suche}".`
                : 'Alle Zeitkonten sind vollständig.'}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {rows.map(({ user: u, monthEntries, stats, completeness }) => {
              const open = expanded === u.uid;
              /*
                Traegt dieser Mitarbeiter ueberhaupt einen Saldo?

                Zwei Faelle, in denen die Zahl KEINE Aussage ist: die
                Projektleitung fuehrt kein Zeitkonto (es gibt kein Soll), und
                ohne hinterlegtes Eintrittsdatum laesst sich keines rechnen.
                Beide sind unten je mit einem eigenen Kasten erklaert — die
                Bedingung steht hier einmal, damit die grosse Zahl am Telefon
                und der Kasten nicht auseinanderlaufen koennen.
              */
              const zeigtSaldo = shouldShowOvertime(u.role) && stats.hasConfig;
              return (
                <div
                  key={u.uid}
                  className={`panel overflow-hidden transition-colors ${
                    open ? 'border-brand/40' : ''
                  }`}
                >
                  {/* Der Kopf trägt nur noch, was den Mitarbeiter einordnet:
                      Name, Ampel, Saldo. Krankheit, Urlaub und Resturlaub
                      standen hier als vierte, fünfte, sechste Pille und
                      ergaben eine Zeile, die man las statt überflog — sie
                      stehen jetzt beschriftet im aufgeklappten Bereich.

                      Der blaue Block beim Aufklappen ist ebenfalls weg. Er
                      schrie lauter als der Inhalt, den er ankündigte; jetzt
                      genügt der hellere Grund und die farbige Kante. */}
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : u.uid)}
                    aria-expanded={open}
                    className={`flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      open ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'
                    }`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{u.name}</span>
                      {/* „vollständig" braucht keine Pille — nur die Ausnahme
                          verdient Aufmerksamkeit. */}
                      {completeness.status === 'missing' ? (
                        <Warnung>
                          {`${tageWort(completeness.missingCount)} ${
                            completeness.missingCount === 1 ? 'fehlt' : 'fehlen'}`}
                        </Warnung>
                      ) : completeness.status !== 'complete' ? (
                        /* „heute offen" ist keine Lücke, sondern der laufende
                           Tag — er füllt sich von selbst bis zum Feierabend. */
                        <Marke>{STATUS_LABEL[completeness.status]}</Marke>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-right sm:block">
                        <span className="tnum block text-sm font-semibold text-ink">
                          {fmtMin(stats.istMin)}
                        </span>
                        {/*
                          „von 176:00" im LAUFENDEN Monat las sich wie ein
                          Monatsergebnis. Das Soll waechst aber mit jedem
                          vergangenen Tag — deshalb sagt die Zeile jetzt, dass
                          es ein Zwischenstand ist.
                        */}
                        <span className="tnum block text-xs text-ink-muted">
                          von {fmtMin(stats.sollMin)}
                          {stats.istLaufend && ' bisher'}
                        </span>
                      </span>
                      {/* Fehlen Buchungen, ist der Saldo eine Datenluecke und
                          kein Befund ueber den Mitarbeiter. Rot behauptete das
                          Gegenteil — und bei zwanzig Zeilen ergab das eine Wand
                          aus Rot, in der die eine echte Unterstunde unterging. */}
                      {/*
                        Ohne Eintrittsdatum ist der Saldo keine Null, sondern
                        gar keine Aussage. Vorher stand dort ein sauberes
                        00:00 — das sah aus wie ein gepflegter Datensatz und
                        verbarg, dass die Stammdaten unvollstaendig sind.
                      */}
                      {!shouldShowOvertime(u.role) ? (
                        /*
                          Ein Projektleiter hat kein Soll — „kein Eintritt
                          hinterlegt" stünde hier also als Mangel, wo keiner
                          ist, und schickte jemanden in die Stammdaten.
                        */
                        <Marke>führt kein Zeitkonto</Marke>
                      ) : !stats.hasConfig ? (
                        <Marke>kein Eintritt hinterlegt</Marke>
                      ) : (
                        /*
                          DER SALDO IST EINE ZAHL, KEINE AUFFORDERUNG. Er stand
                          als gefüllte Pille neben der Lückenmeldung, und zwei
                          Pillen in einer Zeile riefen beide gleich laut —
                          dabei ist nur die eine etwas zu tun.
                        */
                        <Zustand
                          stand={
                            completeness.missingCount > 0
                              ? 'ruht'
                              : stats.saldoMin >= 0
                                ? 'gut'
                                : 'achtung'
                          }
                        >
                          <span className="tnum">
                            {stats.saldoMin > 0 ? '+' : ''}
                            {fmtMin(stats.saldoMin)}
                          </span>
                        </Zustand>
                      )}
                      <Icon
                        name="chevron"
                        size={18}
                        className={`shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-line px-4 py-4">
                      {/* Zuerst die Zahlen des Monats, dann erst die Tage.
                          Wer eine Zeitkarte öffnet, will meist nur wissen,
                          wie der Monat steht — nicht jeden einzelnen Tag. */}
                      {/*
                        EINE ZAHL BEANTWORTET DIE FRAGE, DER REST ORDNET SICH UNTER.

                        Hier standen sechs gleich grosse Kennzahlen nebeneinander.
                        Sechs gleich grosse Zahlen beantworten aber keine Frage,
                        sie stellen sechs — und auf dem Telefon stapelten sie
                        sich zu zwei Reihen, bevor der Inhalt ueberhaupt begann.

                        Wer eine Zeitkarte oeffnet, will den SALDO. Ist und Soll
                        sind dessen Herleitung und gehoeren klein darunter;
                        Krank, Urlaub und Resturlaub sind Nebenzahlen und stehen
                        als Zeile. Am Schreibtisch ruecken die beiden Bloecke
                        nebeneinander, damit die Breite nicht leer bleibt.

                        DAS WORT „SALDO" BLEIBT STEHEN. Eine grosse Zahl ohne
                        Namen ist auf dem Schirm mehrdeutig und fuer einen
                        Vorleser gar nichts — er laese „minus fuenfundneunzig
                        dreissig" und sonst nichts.
                      */}
                      <div className="sm:flex sm:items-end sm:justify-between sm:gap-6">
                        <div className="min-w-0">
                          <p className="section-label">{zeigtSaldo ? 'Saldo' : 'Gebucht'}</p>
                          {zeigtSaldo ? (
                            <>
                              <p
                                className={`tnum mt-1 text-[2rem] font-bold leading-none tracking-tight ${
                                  stats.saldoMin >= 0 ? 'text-success' : 'text-danger'
                                }`}
                              >
                                {stats.saldoMin > 0 ? '+' : ''}
                                {fmtMin(stats.saldoMin)}
                              </p>
                              <p className="tnum mt-1.5 text-sm text-ink-muted">
                                {fmtMin(stats.istMin)} von {fmtMin(stats.sollMin)} Soll
                                {stats.istLaufend && ' bisher'}
                              </p>
                            </>
                          ) : (
                            /*
                              OHNE SOLL IST DER SALDO KEINE ZAHL, SONDERN KEINE
                              AUSSAGE. Ihn trotzdem gross zu setzen, hiesse eine
                              Luecke in den Stammdaten als Befund ueber den
                              Mitarbeiter auszugeben. Gross steht dann, was
                              wirklich gemessen ist: die gebuchte Zeit.
                            */
                            <p className="tnum mt-1 text-[2rem] font-bold leading-none tracking-tight text-ink">
                              {fmtMin(stats.istMin)}
                            </p>
                          )}
                        </div>
                        <p className="mt-3 text-sm text-ink-muted sm:mt-0 sm:shrink-0 sm:text-right">
                          <b className="font-semibold text-ink">{stats.krankDays}</b> Tage krank ·{' '}
                          <b className="font-semibold text-ink">{stats.urlaubDays}</b> Tage Urlaub ·{' '}
                          <b
                            className={`font-semibold ${
                              stats.urlaubRest < 5 ? 'text-warning' : 'text-ink'
                            }`}
                          >
                            {stats.urlaubRest}
                          </b>{' '}
                          Tage Resturlaub
                        </p>
                      </div>
                      {/*
                        DIE ZAHLEN BLEIBEN, DER ERKLAERSATZ WANDERT INS „i".
                        „Der Monat laeuft noch: gezaehlt sind die Solltage bis
                        gestern …" stand bei JEDEM Mitarbeiter, jeden Monat,
                        den ganzen Monat lang — dreissig Mal dieselben zwei
                        Zeilen in einer Liste, durch die man scrollt. Wer es
                        einmal gelesen hat, blaettert es danach nur noch weg.
                        Uebrig bleibt das Wort „laufend"; warum das zaehlt,
                        sagt das „i" auf Wunsch.
                      */}
                      <p className="mt-3 flex flex-wrap items-center gap-x-1 text-xs text-ink-muted">
                        Tagessoll {stats.dailyTargetH.toFixed(2).replace('.', ',')} h ·
                        Wochenstunden {String(stats.weeklyTarget).replace('.', ',')} h ·{' '}
                        {stats.requiredDays === 1 ? '1 Solltag' : `${stats.requiredDays} Solltage`}
                        {stats.holidaysInMonth > 0 &&
                          ` · ${stats.holidaysInMonth === 1 ? '1 Feiertag' : `${stats.holidaysInMonth} Feiertage`}`}
                        {stats.hasConfig && stats.istLaufend && (
                          <>
                            {' · laufend'}
                            <InfoHint about="den laufenden Monat">
                              Gezählt sind die Solltage bis gestern. Die Zahl wächst mit jedem
                              Arbeitstag und ist erst nach Monatsende endgültig — ein Rückstand
                              mitten im Monat ist deshalb noch keine Aussage.
                            </InfoHint>
                          </>
                        )}
                      </p>
                      {!shouldShowOvertime(u.role) ? (
                        <p className="mt-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink-muted">
                          Die Projektleitung führt kein Zeitkonto: es gibt kein Soll und damit
                          weder Über- noch Unterstunden. Die gebuchten Stunden stehen trotzdem
                          hier — sie gehören auf die Baustelle und in die Nachkalkulation.
                        </p>
                      ) : !stats.hasConfig ? (
                        <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
                          Für diesen Mitarbeiter ist kein Eintrittsdatum hinterlegt. Ohne das lässt
                          sich kein Soll berechnen — die Zahlen oben sind deshalb kein Rückstand,
                          sondern keine Aussage. Nachtragen in der Benutzerverwaltung.
                        </p>
                      ) : null}

                      {completeness.missingCount > 0 && (
                        /*
                          DAS ZEICHEN ZUM AUFKLAPPEN IST UNSERES, NICHT DAS DES
                          BROWSERS.

                          Hier stand ein blankes `<summary>`. Ein solches ist
                          `display: list-item` und bekommt damit das native
                          Dreieck davor — mitten im roten Text, in einer App,
                          die sonst ueberall denselben Winkel rechts benutzt
                          (Mitarbeiterkarte, Baustellenzeile). Aus dem Betrieb:
                          „macht der Pfeil vor dem roten text hier?"

                          `flex` nimmt dem `<summary>` das Dreieck (es ist dann
                          kein list-item mehr), `list-none` sagt es zusaetzlich
                          fuer Browser, die das anders halten. Der Winkel steht
                          rechts und dreht sich beim Oeffnen — dieselbe
                          Bewegung wie eine Zeile hoeher.
                        */
                        <details className="group mt-4 rounded border border-line bg-surface-2 text-sm text-danger">
                          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-semibold [&::-webkit-details-marker]:hidden">
                            <span>
                              {completeness.missingCount === 1
                                ? '1 Arbeitstag ohne Buchung'
                                : `${completeness.missingCount} Arbeitstage ohne Buchung`}
                            </span>
                            <Icon
                              name="chevron"
                              size={18}
                              className="shrink-0 transition-transform duration-200 group-open:rotate-180"
                            />
                          </summary>
                          <p className="px-3 pb-2 leading-relaxed">
                            {completeness.missingDates.map((d) => dayLabel(d)).join(' · ')}
                          </p>
                        </details>
                      )}
                      {(() => {
                        // Einmal rechnen, zweimal darstellen: die Tabelle für
                        // den Schreibtisch, die Liste fürs Telefon. Eine
                        // sechsspaltige Tabelle war am Handy nicht zu retten —
                        // entweder man wischte seitwärts oder die Knöpfe
                        // wurden abgeschnitten.
                        /*
                          EINE ZEILE JE EINTRAG, nicht je Tag.

                          AUS DEM BETRIEB GEMELDET: „die zweite Zeitbuchung an
                          einem Tag erscheint zwar in der Projektauswertung,
                          aber wird in der Mitarbeiterübersicht nicht
                          angezeigt."

                          Hier stand `monthEntries.find(...)` — die ERSTE
                          Buchung des Tages, und der Rest fiel unter den Tisch.
                          Das war richtig, solange je Tag nur eine Buchung
                          möglich war; seit ein Monteur mehrere Baustellen an
                          einem Tag buchen kann, ist es falsch.

                          Besonders unangenehm: der Fuß zählte trotzdem ALLE
                          Einträge und die volle Summe. „4 Einträge · 31:00"
                          über drei sichtbaren Zeilen — eine Ansicht, die sich
                          selbst widerspricht, und die vierte Buchung war
                          weder zu sehen noch zu bearbeiten oder zu löschen.

                          Innerhalb eines Tages nach Beginn sortiert: so liest
                          sich der Tag in der Reihenfolge, in der er passiert
                          ist.
                        */
                        type Tageszeile = {
                          d: string;
                          entry?: WithId<TimeEntry>;
                          holiday: string | null;
                          zeit: string | null;
                        };
                        const days = daysOfMonth(year, month).flatMap((d): Tageszeile[] => {
                          const holiday = getAustrianHolidayName(new Date(`${d}T00:00:00`));
                          const amTag = monthEntries
                            .filter((e) => e.date === d)
                            .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
                          if (amTag.length === 0) {
                            /*
                              EIN FEIERTAG VOR DEM EINTRITT GEHOERT NICHT IN
                              DEN NACHWEIS.

                              Der Nachweis beginnt beim Eintritt — dafuer gibt
                              es das Datum. Ein Tag ohne Buchung kam bisher
                              trotzdem herein, wenn er ein Feiertag war: bei
                              einem Eintritt am 17. August stand dort „Sa
                              15.08. Mariä Himmelfahrt — — —", ein Tag, an dem
                              die Person noch gar nicht im Betrieb war.

                              Eine BUCHUNG vor dem Eintritt bleibt dagegen
                              stehen. Sie waere eine Merkwuerdigkeit in den
                              Daten, und die soll man sehen statt sie
                              wegzufiltern.
                            */
                            if (u.appStartDate && d < u.appStartDate) return [];
                            return holiday ? [{ d, entry: undefined, holiday, zeit: null }] : [];
                          }
                          return amTag.map((entry) => ({
                            d,
                            entry,
                            holiday,
                            zeit:
                              entry.startTime && entry.endTime
                                ? `${entry.startTime}–${entry.endTime}`
                                : null,
                          }));
                        });

                        /* Abwesenheit und Feiertag als Pille statt als
                           eingefärbte Zeile: die Tönung allein war für
                           Farbenblinde kein Signal. */
                        const status = (x: (typeof days)[number]) =>
                          !x.entry ? (
                            <Marke>{x.holiday}</Marke>
                          ) : x.entry.status === 'Krank' ? (
                            <Marke>Krank</Marke>
                          ) : x.entry.status === 'Urlaub' ? (
                            <Marke>Urlaub</Marke>
                          ) : (
                            <span className="text-ink-muted">Anwesend</span>
                          );

                        const actions = (e: WithId<TimeEntry>) =>
                          e.isBilled ? (
                            // Verrechnete Einträge sind Rechnungsgrundlage
                            // und bleiben unangetastet.
                            <Marke>verrechnet</Marke>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setCreating(false);
                                  setEditing(e);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                              >
                                Bearbeiten
                              </Button>
                              <Button variant="ghost" onClick={() => setToDelete(e)}>
                                Löschen
                              </Button>
                            </>
                          );

                        return (
                          <div className="mt-4">
                            <details className="group">
                              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                                <span>
                                  Tagesnachweis ·{' '}
                                  {monthEntries.length === 1
                                    ? '1 Eintrag'
                                    : `${monthEntries.length} Einträge`}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="tnum font-normal text-ink-muted">
                                    {fmtMin(stats.istMin)}
                                  </span>
                                  {/* Ohne Winkel war ueberhaupt nicht zu sehen,
                                      dass sich hier etwas oeffnet: `flex` am
                                      `<summary>` nimmt das native Dreieck weg,
                                      und ein Ersatz stand nicht da. */}
                                  <Icon
                                    name="chevron"
                                    size={18}
                                    className="shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-180"
                                  />
                                </span>
                              </summary>
                              <table className="mt-1 hidden w-full text-sm sm:table">
                              <thead>
                                <tr className="border-b border-line text-left text-ink-muted">
                                  <th className="py-2 pr-3 font-medium">Tag</th>
                                  <th className="py-2 pr-3 font-medium">Status</th>
                                  <th className="py-2 pr-3 font-medium">Zeit</th>
                                  <th className="py-2 pr-3 font-medium">Baustelle</th>
                                  <th className="py-2 pr-3 text-right font-medium">Stunden</th>
                                  <th className="py-2 text-right font-medium">
                                    <span className="sr-only">Aktionen</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.map((x) => (
                                  // Der Schlüssel haengt am EINTRAG: zwei
                                  // Buchungen desselben Tages haetten sonst
                                  // denselben, und React zoege die Zeilen
                                  // beim Bearbeiten durcheinander.
                                  <tr key={x.entry?.id ?? x.d} className="border-b border-line/60">
                                    <td className="tnum whitespace-nowrap py-2 pr-3 font-medium text-ink">
                                      {dayLabel(x.d)}
                                    </td>
                                    <td className="py-2 pr-3">
                                      {/*
                                        Notdienst und Nachtarbeit gehören
                                        NEBEN den Status. Sie hängen an einem
                                        Zuschlag; wer sie hier nicht sieht,
                                        schreibt die Stunde ohne ihn in die
                                        Rechnung.
                                      */}
                                      <span className="flex flex-wrap items-center gap-1">
                                        {status(x)}
                                        {x.entry && <Zeitmarker eintrag={x.entry} />}
                                      </span>
                                    </td>
                                    <td className="tnum py-2 pr-3 text-ink-muted">
                                      {x.zeit ?? '—'}
                                    </td>
                                    <td className="py-2 pr-3">{x.entry?.customerName ?? '—'}</td>
                                    <td className="tnum py-2 pr-3 text-right font-medium">
                                      {x.entry ? fmtMin(calcWorkMin(x.entry)) : '—'}
                                    </td>
                                    <td className="py-2">
                                      {/* Flex statt Inline: sonst sitzen die
                                          Knöpfe auf der Textgrundlinie und
                                          hängen sichtbar unter der Zeile. */}
                                      <div className="flex items-center justify-end gap-1">
                                        {x.entry && actions(x.entry)}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="font-semibold">
                                  <td className="pt-2" colSpan={4}>
                                    {monthEntries.length === 1
                                      ? '1 Eintrag'
                                      : `${monthEntries.length} Einträge`}
                                  </td>
                                  <td className="tnum pt-2 pr-3 text-right">
                                    {fmtMin(stats.istMin)}
                                  </td>
                                  <td className="pt-2" />
                                </tr>
                              </tfoot>
                            </table>

                            {/*
                              ZUGEKLAPPT — UND NUR AM TELEFON.

                              Der Tagesnachweis ist der laengste Teil der Karte
                              (bis zu einunddreissig Zeilen mit je zwei
                              Knoepfen) und der am seltensten gebrauchte: wer
                              eine Zeitkarte oeffnet, will meist wissen, wie der
                              Monat steht, nicht was am 14. war. Offen schob er
                              alles darunter aus dem Bild.

                              Die Zusammenfassung sagt weiterhin, wie viele
                              Eintraege es sind und wie viel zusammenkommt — man
                              tippt also nur hinein, wenn man einen bestimmten
                              Tag sucht.

                              AM SCHREIBTISCH BLEIBT DIE TABELLE OFFEN. Dort ist
                              der Tagesnachweis das Werkzeug der Buchhaltung und
                              kein Anhang; ein zusaetzlicher Klick waere dort
                              keine Ruhe, sondern ein Umweg.
                            */}
                              <ul className="sm:hidden">
                              {days.map((x) => (
                                <li key={x.entry?.id ?? x.d} className="border-b border-line/60 py-2">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="tnum font-semibold text-ink">
                                      {dayLabel(x.d)}
                                    </span>
                                    <span className="tnum font-semibold text-ink">
                                      {x.entry ? fmtMin(calcWorkMin(x.entry)) : '—'}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                                    {status(x)}
                                    {x.entry && <Zeitmarker eintrag={x.entry} />}
                                    {x.zeit && <span className="tnum">{x.zeit}</span>}
                                    {x.entry?.customerName && <span>{x.entry.customerName}</span>}
                                  </div>
                                  {x.entry && (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {actions(x.entry)}
                                    </div>
                                  )}
                                </li>
                              ))}
                              <li className="flex justify-between py-2 font-semibold">
                                <span>
                                  {monthEntries.length === 1
                                    ? '1 Eintrag'
                                    : `${monthEntries.length} Einträge`}
                                </span>
                                <span className="tnum">{fmtMin(stats.istMin)}</span>
                              </li>
                              </ul>
                            </details>
                          </div>
                        );
                      })()}
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                        <Button variant="secondary" onClick={() => exportUserCsv(u)}>
                          <Icon name="download" size={16} className="mr-2 shrink-0" />
                          Monat als CSV
                        </Button>
                        <Button variant="accent" onClick={() => setExportFor(u)}>
                          Bericht für Zeitraum …
                        </Button>
                        {/*
                          „Einklappen" ist entfallen. Der Knopf machte dasselbe
                          wie der Kartenkopf darueber und war die Antwort auf
                          eine Karte, die ueber den Bildschirm hinausging —
                          seit der Tagesnachweis zugeklappt ist, ist sie das
                          nicht mehr, und der Kopf steht wieder in Reichweite.
                        */}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Deckungsbeitrags-Sicht: Ist gegen kalkuliertes Budget je Baustelle. */}
      <ProjectSummary
        entries={entries.filter((e) => e.date.startsWith(monthPrefix))}
        gesamtEntries={gesamtProjektzeiten}
        projects={projects}
        label={`${MONTHS[month]} ${year}`}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eintrag löschen?"
        message={
          toDelete
            ? `Der Eintrag von ${toDelete.userName ?? 'Mitarbeiter'} vom ${toDelete.date} wird endgültig entfernt.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            if (editing?.id === toDelete.id) setEditing(null);
            await deleteTimeEntry(toDelete.id);
            toast.success('Eintrag gelöscht');
          }
          setToDelete(null);
        }}
      />

      {exportFor && (
        <ExportDialog
          user={exportFor}
          year={year}
          month={month}
          onClose={() => setExportFor(null)}
          onExportPdf={(from, to) => exportPdf(exportFor, from, to)}
          onExportProjectCsv={(from, to) => exportProjectCsv(exportFor, from, to)}
        />
      )}
    </div>
  );
}
