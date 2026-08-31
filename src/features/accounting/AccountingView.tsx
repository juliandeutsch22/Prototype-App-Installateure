import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { listAllProjects } from '@/lib/db/projects';
import {
  subscribeEntriesInRange,
  listEntriesInRange,
  deleteTimeEntry,
} from '@/lib/db/timeEntries';
import {
  calcMonthStats,
  calcCompleteness,
  calcWorkMin,
  fmtMin,
  getAustrianHolidayName,
  localDateStr,
  type CompletenessStatus,
} from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Project, TimeEntry } from '@/types';
import { shouldShowOvertime } from '@/lib/permissions';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/Icon';
import ExportDialog from './ExportDialog';
import ProjectSummary from './ProjectSummary';
import TimeForm from '@/features/time/TimeForm';
import ConfirmDialog from '@/components/ConfirmDialog';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import {
  buildMonthCsv,
  monthCsvFilename,
  buildUserCsv,
  userCsvFilename,
  buildUserProjectCsv,
  userProjectCsvFilename,
  generateHoursPdf,
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
const STATUS_TONE: Record<CompletenessStatus, 'success' | 'info' | 'danger'> = {
  complete: 'success',
  today_only: 'info',
  missing: 'danger',
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
 * Kennzahl im aufgeklappten Bereich: Wert über Beschriftung.
 *
 * Bewusst keine `Metric`-Kachel — die trägt Rahmen und Symbol und wäre
 * innerhalb einer bereits gerahmten Zeile eine Schachtel in der Schachtel.
 * Hier zählt nur, dass jede Zahl ihren Namen bei sich hat: „101:00" allein
 * sagt niemandem, ob das Ist, Soll oder Saldo ist.
 */
function Figure({
  label,
  value,
  tone = '',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className={`tnum text-lg font-bold leading-tight ${tone || 'text-ink'}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
    listAllProjects(user.companyId).then(setProjects).catch(() => undefined);
  }, [user]);

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

  // Deaktivierte Mitarbeiter fallen aus der Auswertung (Legacy:5407).
  const relevant = useMemo(
    () =>
      users
        .filter((u) => shouldShowOvertime(u.role) && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const rows = useMemo(
    () =>
      relevant.map((u) => {
        const own = entries.filter((e) => e.userId === u.uid);
        const monthEntries = own.filter((e) => e.date.startsWith(monthPrefix));
        const yearEntries = own.filter((e) => e.date.startsWith(String(year)));
        return {
          user: u,
          monthEntries,
          stats: calcMonthStats(u, monthEntries, yearEntries, year, month),
          completeness: calcCompleteness(u, monthEntries, year, month),
        };
      }),
    [relevant, entries, monthPrefix, year, month],
  );

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function exportMonthCsv() {
    downloadCsv(buildMonthCsv(rows, year, month), monthCsvFilename(year, month));
    toast.success('Monats-CSV heruntergeladen');
  }

  function exportUserCsv(u: AppUser) {
    const r = rows.find((x) => x.user.uid === u.uid);
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
                <Icon name="download" size={16} className="mr-1.5 shrink-0" />
                Monats-CSV
              </Button>
            )}
          </span>
        }
      >
        {loading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState>Keine aktiven Mitarbeiter mit Zeitkonto.</EmptyState>
        ) : (
          <div className="space-y-3">
            {rows.map(({ user: u, monthEntries, stats, completeness }) => {
              const open = expanded === u.uid;
              return (
                <div
                  key={u.uid}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    open ? 'border-brand/40' : 'border-line'
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
                      {completeness.status !== 'complete' && (
                        <Badge tone={STATUS_TONE[completeness.status]}>
                          {completeness.status === 'missing'
                            ? `${completeness.missingCount} Tage fehlen`
                            : STATUS_LABEL[completeness.status]}
                        </Badge>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-right sm:block">
                        <span className="tnum block text-sm font-semibold text-ink">
                          {fmtMin(stats.istMin)}
                        </span>
                        <span className="tnum block text-xs text-ink-muted">
                          von {fmtMin(stats.sollMin)}
                        </span>
                      </span>
                      <Badge tone={stats.saldoMin >= 0 ? 'success' : 'danger'}>
                        {stats.saldoMin > 0 ? '+' : ''}
                        {fmtMin(stats.saldoMin)}
                      </Badge>
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
                      <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
                        <Figure label="Ist" value={fmtMin(stats.istMin)} />
                        <Figure label="Soll" value={fmtMin(stats.sollMin)} />
                        <Figure
                          label="Saldo"
                          value={`${stats.saldoMin > 0 ? '+' : ''}${fmtMin(stats.saldoMin)}`}
                          tone={stats.saldoMin >= 0 ? 'text-success' : 'text-danger'}
                        />
                        <Figure
                          label="Krank"
                          value={`${stats.krankDays} ${stats.krankDays === 1 ? 'Tag' : 'Tage'}`}
                          tone={stats.krankDays > 0 ? 'text-warning' : ''}
                        />
                        <Figure
                          label="Urlaub"
                          value={`${stats.urlaubDays} ${stats.urlaubDays === 1 ? 'Tag' : 'Tage'}`}
                        />
                        <Figure
                          label="Resturlaub"
                          value={`${stats.urlaubRest} ${stats.urlaubRest === 1 ? 'Tag' : 'Tage'}`}
                          tone={stats.urlaubRest < 5 ? 'text-warning' : ''}
                        />
                      </div>
                      <p className="mt-2 text-xs text-ink-muted">
                        Tagessoll {stats.dailyTargetH.toFixed(2).replace('.', ',')} h ·
                        Wochenstunden {String(stats.weeklyTarget).replace('.', ',')} h ·{' '}
                        {stats.requiredDays === 1 ? '1 Solltag' : `${stats.requiredDays} Solltage`}
                        {stats.holidaysInMonth > 0 &&
                          ` · ${stats.holidaysInMonth === 1 ? '1 Feiertag' : `${stats.holidaysInMonth} Feiertage`}`}
                      </p>

                      {completeness.missingCount > 0 && (
                        <details className="mt-4 rounded border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
                          <summary className="cursor-pointer font-semibold">
                            {completeness.missingCount === 1
                              ? '1 Arbeitstag ohne Buchung'
                              : `${completeness.missingCount} Arbeitstage ohne Buchung`}
                          </summary>
                          <p className="mt-1.5 leading-relaxed">
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
                        const days = daysOfMonth(year, month)
                          .map((d) => {
                            const entry = monthEntries.find((e) => e.date === d);
                            const holiday = getAustrianHolidayName(new Date(`${d}T00:00:00`));
                            if (!entry && !holiday) return null;
                            return {
                              d,
                              entry,
                              holiday,
                              zeit:
                                entry?.startTime && entry?.endTime
                                  ? `${entry.startTime}–${entry.endTime}`
                                  : null,
                            };
                          })
                          .filter((x): x is NonNullable<typeof x> => x !== null);

                        /* Abwesenheit und Feiertag als Pille statt als
                           eingefärbte Zeile: die Tönung allein war für
                           Farbenblinde kein Signal. */
                        const status = (x: (typeof days)[number]) =>
                          !x.entry ? (
                            <Badge tone="info">{x.holiday}</Badge>
                          ) : x.entry.status === 'Krank' ? (
                            <Badge tone="warning">Krank</Badge>
                          ) : x.entry.status === 'Urlaub' ? (
                            <Badge tone="info">Urlaub</Badge>
                          ) : (
                            <span className="text-ink-muted">Anwesend</span>
                          );

                        const actions = (e: WithId<TimeEntry>) =>
                          e.isBilled ? (
                            // Verrechnete Einträge sind Rechnungsgrundlage
                            // und bleiben unangetastet.
                            <Badge tone="gray">verrechnet</Badge>
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
                            <h4 className="section-label mb-1">Tagesnachweis</h4>

                            <table className="hidden w-full text-sm sm:table">
                              <thead>
                                <tr className="border-b border-line text-left text-ink-muted">
                                  <th className="py-1.5 pr-3 font-medium">Tag</th>
                                  <th className="py-1.5 pr-3 font-medium">Status</th>
                                  <th className="py-1.5 pr-3 font-medium">Zeit</th>
                                  <th className="py-1.5 pr-3 font-medium">Baustelle</th>
                                  <th className="py-1.5 pr-3 text-right font-medium">Stunden</th>
                                  <th className="py-1.5 text-right font-medium">
                                    <span className="sr-only">Aktionen</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.map((x) => (
                                  <tr key={x.d} className="border-b border-line/60">
                                    <td className="tnum whitespace-nowrap py-1.5 pr-3 font-medium text-ink">
                                      {dayLabel(x.d)}
                                    </td>
                                    <td className="py-1.5 pr-3">{status(x)}</td>
                                    <td className="tnum py-1.5 pr-3 text-ink-muted">
                                      {x.zeit ?? '—'}
                                    </td>
                                    <td className="py-1.5 pr-3">{x.entry?.customerName ?? '—'}</td>
                                    <td className="tnum py-1.5 pr-3 text-right font-medium">
                                      {x.entry ? fmtMin(calcWorkMin(x.entry)) : '—'}
                                    </td>
                                    <td className="py-1.5">
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

                            <ul className="sm:hidden">
                              {days.map((x) => (
                                <li key={x.d} className="border-b border-line/60 py-2">
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
                          </div>
                        );
                      })()}
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                        <Button variant="secondary" onClick={() => exportUserCsv(u)}>
                          <Icon name="download" size={16} className="mr-1.5 shrink-0" />
                          Monat als CSV
                        </Button>
                        <Button variant="accent" onClick={() => setExportFor(u)}>
                          Bericht für Zeitraum …
                        </Button>
                        <Button variant="ghost" onClick={() => setExpanded(null)}>
                          Einklappen
                        </Button>
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
