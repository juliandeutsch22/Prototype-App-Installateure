import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { listAllProjects } from '@/lib/db/projects';
import { subscribeAllEntries, deleteTimeEntry } from '@/lib/db/timeEntries';
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
    const unsub = subscribeAllEntries(
      user.companyId,
      (rows) => {
        setEntries(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

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

  function exportPdf(u: AppUser, from: string, to: string) {
    const range = entriesInRange(entries, u.uid, from, to);
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

  function exportProjectCsv(u: AppUser, from: string, to: string) {
    const range = entriesInRange(entries, u.uid, from, to);
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
          accent="accent"
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
                  className="overflow-hidden rounded-lg border border-line shadow-sm transition-shadow hover:shadow-lg"
                >
                  {/* Aufgeklappt färbt sich der Kopf Perl-Blau — im Prototyp
                      das Signal, welcher Mitarbeiter gerade geöffnet ist. */}
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : u.uid)}
                    aria-expanded={open}
                    className={`flex min-h-touch w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors ${
                      open ? 'bg-brand text-brand-fg' : 'bg-surface-2 hover:bg-line/40'
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`font-bold ${open ? 'text-brand-fg' : 'text-ink'}`}>
                        {u.name}
                      </span>
                      <Badge tone={STATUS_TONE[completeness.status]}>
                        {completeness.status === 'missing'
                          ? `${completeness.missingCount} Tage fehlen`
                          : STATUS_LABEL[completeness.status]}
                      </Badge>
                      {stats.krankDays > 0 && <Badge tone="warning">{stats.krankDays}× krank</Badge>}
                      {stats.urlaubDays > 0 && <Badge tone="info">{stats.urlaubDays}× Urlaub</Badge>}
                      <Badge tone={stats.urlaubRest < 5 ? 'warning' : 'gray'}>
                        Resturlaub {stats.urlaubRest}
                      </Badge>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={`font-mono text-sm ${open ? 'text-brand-fg/80' : 'text-ink-muted'}`}
                      >
                        {fmtMin(stats.istMin)} / {fmtMin(stats.sollMin)}
                      </span>
                      <Badge tone={stats.saldoMin >= 0 ? 'success' : 'danger'}>
                        {stats.saldoMin > 0 ? '+' : ''}
                        {fmtMin(stats.saldoMin)}
                      </Badge>
                      <Icon
                        name="chevron"
                        size={18}
                        className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-line px-4 py-3">
                      {completeness.missingCount > 0 && (
                        <details className="mb-3 rounded-sm border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
                          <summary className="cursor-pointer font-semibold">
                            {completeness.missingCount === 1
                              ? '1 Arbeitstag ohne Buchung'
                              : `${completeness.missingCount} Arbeitstage ohne Buchung`}
                          </summary>
                          <p className="mt-1.5 leading-relaxed">
                            {completeness.missingDates
                              .map((d) => `${d.slice(8)}.${d.slice(5, 7)}.`)
                              .join(' · ')}
                          </p>
                        </details>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[34rem] text-sm">
                          <thead>
                            <tr className="border-b border-line text-left text-ink-muted">
                              <th className="py-1 pr-3 font-medium">Tag</th>
                              <th className="py-1 pr-3 font-medium">Status</th>
                              <th className="py-1 pr-3 font-medium">Zeit</th>
                              <th className="py-1 pr-3 font-medium">Baustelle</th>
                              <th className="py-1 pr-3 text-right font-medium">Stunden</th>
                              <th className="py-1 text-right font-medium">
                                <span className="sr-only">Aktionen</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {daysOfMonth(year, month).map((d) => {
                              const entry = monthEntries.find((e) => e.date === d);
                              const holiday = getAustrianHolidayName(new Date(`${d}T00:00:00`));
                              if (!entry && !holiday) return null;
                              // Zeilenfarben wie im Prototyp: Feiertag blau,
                              // Abwesenheit gelb — der Monat ist so überfliegbar.
                              const rowTone = !entry
                                ? 'bg-info-bg/60'
                                : entry.status === 'Krank' || entry.status === 'Urlaub'
                                  ? 'bg-warning-bg/50'
                                  : '';
                              return (
                                <tr key={d} className={`border-b border-line/60 ${rowTone}`}>
                                  <td className="py-1 pr-3 font-mono">{d.slice(8)}.{d.slice(5, 7)}.</td>
                                  <td className="py-1 pr-3">
                                    {entry ? entry.status : <span className="text-ink-muted">{holiday}</span>}
                                  </td>
                                  <td className="py-1 pr-3 font-mono text-ink-muted">
                                    {entry?.startTime && entry?.endTime
                                      ? `${entry.startTime}–${entry.endTime}`
                                      : '—'}
                                  </td>
                                  <td className="py-1 pr-3">{entry?.customerName ?? '—'}</td>
                                  <td className="py-1 pr-3 text-right font-mono">
                                    {entry ? fmtMin(calcWorkMin(entry)) : '—'}
                                  </td>
                                  <td className="py-1 text-right whitespace-nowrap">
                                    {entry && (
                                      entry.isBilled ? (
                                        // Verrechnete Einträge sind Rechnungs-
                                        // grundlage und bleiben unangetastet.
                                        <Badge tone="gray">verrechnet</Badge>
                                      ) : (
                                        <>
                                          <Button variant="ghost" onClick={() => {
                                            setCreating(false);
                                            setEditing(entry);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                          }}>
                                            Bearbeiten
                                          </Button>
                                          <Button variant="ghost" onClick={() => setToDelete(entry)}>
                                            Löschen
                                          </Button>
                                        </>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="font-medium">
                              <td className="pt-2" colSpan={5}>
                                {monthEntries.length === 1 ? '1 Eintrag' : `${monthEntries.length} Einträge`}
                                {' · '}
                                {stats.requiredDays === 1 ? '1 Solltag' : `${stats.requiredDays} Solltage`}
                                {stats.holidaysInMonth > 0 &&
                                  ` · ${stats.holidaysInMonth === 1 ? '1 Feiertag' : `${stats.holidaysInMonth} Feiertage`}`}
                              </td>
                              <td className="pt-2 text-right font-mono">{fmtMin(stats.istMin)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <p className="mt-2 text-sm text-ink-muted">
                        Tagessoll {stats.dailyTargetH.toFixed(2).replace('.', ',')} h ·
                        Wochenstunden {String(stats.weeklyTarget).replace('.', ',')} h
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
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
