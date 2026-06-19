import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeOwnEntries } from '@/lib/db/timeEntries';
import { getUserByUid } from '@/lib/db/users';
import { calcWorkMin, fmtMin, calcOverallSaldo, getISOWeek } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { TimeEntry, AppUser } from '@/types';
import Card from '@/components/Card';
import Metric from '@/components/Metric';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import TimeForm from './TimeForm';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/**
 * Zeiterfassung — der vertikale Schnitt (Spec §8, Phase 2): Mitarbeiter
 * erfasst -> Firestore -> hier live sichtbar, inkl. portiertem Saldo.
 */
export default function TimeView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getUserByUid(user.companyId, user.uid).then(setProfile).catch(() => undefined);
    const unsub = subscribeOwnEntries(
      user.companyId,
      user.uid,
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

  const saldo = useMemo(
    () => (profile ? calcOverallSaldo(profile, entries) : null),
    [profile, entries],
  );

  // Nach Woche gruppieren, neueste zuerst.
  const byWeek = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const groups = new Map<string, WithId<TimeEntry>[]>();
    for (const e of sorted) {
      const { week, year } = getISOWeek(new Date(`${e.date}T00:00:00`));
      const key = `KW ${week} / ${year}`;
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [entries]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Zeiterfassung" subtitle="Deine gebuchten Zeiten und dein Saldo" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Einträge" icon="clipboard" value={entries.length} />
        <Metric
          label="Saldo"
          icon="chart"
          tone={saldo?.hasConfig ? (saldo.saldoH >= 0 ? 'success' : 'danger') : 'default'}
          value={saldo?.hasConfig ? `${saldo.saldoH > 0 ? '+' : ''}${saldo.saldoH} h` : '—'}
          hint={saldo?.hasConfig ? 'Über-/Unterstunden' : 'Kein Startdatum konfiguriert'}
        />
        <Metric
          label="Diese Woche"
          icon="clock"
          value={fmtMin(
            byWeek[0]?.[1].reduce((sum, e) => sum + calcWorkMin(e), 0) ?? 0,
          )}
        />
      </div>

      <Card title="Neuen Eintrag erfassen">
        <TimeForm onSaved={() => undefined} />
      </Card>

      <Card title="Meine Einträge">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : entries.length === 0 ? (
          <EmptyState>Noch keine Zeiteinträge erfasst.</EmptyState>
        ) : (
          <div className="space-y-6">
            {byWeek.map(([week, rows]) => (
              <div key={week}>
                <h3 className="mb-1 text-sm font-semibold text-ink-muted">{week}</h3>
                <List>
                  {rows.map((e) => {
                    // Sprach-/Stundeneinträge haben keine Start-/Endzeit -> nicht "undefined–undefined" zeigen.
                    const timeLabel =
                      e.status === 'Anwesend'
                        ? e.startTime && e.endTime
                          ? `${e.startTime}–${e.endTime}`
                          : null
                        : e.status;
                    const subtitle = [timeLabel, e.comment].filter(Boolean).join(' · ');
                    return (
                    <ListRow
                      key={e.id}
                      title={
                        <span>
                          {e.date}
                          {e.customerName && ` · ${e.customerName}`}
                        </span>
                      }
                      subtitle={subtitle || undefined}
                    >
                      {e.source === 'voice' && <Badge tone="info">KI</Badge>}
                      {e.isHelper && <Badge tone="warning">Helfer</Badge>}
                      <span className="font-mono font-medium text-ink">{fmtMin(calcWorkMin(e))}</span>
                    </ListRow>
                    );
                  })}
                </List>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
