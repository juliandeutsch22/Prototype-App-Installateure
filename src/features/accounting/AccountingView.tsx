import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { subscribeAllEntries } from '@/lib/db/timeEntries';
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
import type { AppUser, TimeEntry } from '@/types';
import { shouldShowOvertime } from '@/lib/permissions';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { SelectField } from '@/components/Field';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

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
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch((e) => setError(e.message));
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

      <Card title={`${MONTHS[month]} ${year}`}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState>Keine aktiven Mitarbeiter mit Zeitkonto.</EmptyState>
        ) : (
          <div className="space-y-3">
            {rows.map(({ user: u, monthEntries, stats, completeness }) => {
              const open = expanded === u.uid;
              return (
                <div key={u.uid} className="rounded border border-line">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : u.uid)}
                    aria-expanded={open}
                    className="flex min-h-touch w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{u.name}</span>
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
                      <span className="font-mono text-sm text-ink-muted">
                        {fmtMin(stats.istMin)} / {fmtMin(stats.sollMin)}
                      </span>
                      <Badge tone={stats.saldoMin >= 0 ? 'success' : 'danger'}>
                        {stats.saldoMin > 0 ? '+' : ''}
                        {fmtMin(stats.saldoMin)}
                      </Badge>
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-line px-4 py-3">
                      {completeness.missingCount > 0 && (
                        <p className="mb-3 rounded border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
                          Nicht gebucht: {completeness.missingDates.join(', ')}
                        </p>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[34rem] text-sm">
                          <thead>
                            <tr className="border-b border-line text-left text-ink-muted">
                              <th className="py-1 pr-3 font-medium">Tag</th>
                              <th className="py-1 pr-3 font-medium">Status</th>
                              <th className="py-1 pr-3 font-medium">Zeit</th>
                              <th className="py-1 pr-3 font-medium">Baustelle</th>
                              <th className="py-1 text-right font-medium">Stunden</th>
                            </tr>
                          </thead>
                          <tbody>
                            {daysOfMonth(year, month).map((d) => {
                              const entry = monthEntries.find((e) => e.date === d);
                              const holiday = getAustrianHolidayName(new Date(`${d}T00:00:00`));
                              if (!entry && !holiday) return null;
                              return (
                                <tr key={d} className="border-b border-line/60">
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
                                  <td className="py-1 text-right font-mono">
                                    {entry ? fmtMin(calcWorkMin(entry)) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="font-medium">
                              <td className="pt-2" colSpan={4}>
                                {monthEntries.length} Einträge · {stats.requiredDays} Solltage
                                {stats.holidaysInMonth > 0 && ` · ${stats.holidaysInMonth} Feiertage`}
                              </td>
                              <td className="pt-2 text-right font-mono">{fmtMin(stats.istMin)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <p className="mt-2 text-sm text-ink-muted">
                        Tagessoll {stats.dailyTargetH.toFixed(2)} h · Wochenstunden{' '}
                        {stats.weeklyTarget} h
                      </p>
                      <Button
                        variant="ghost"
                        className="mt-2"
                        onClick={() => setExpanded(null)}
                      >
                        Einklappen
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
