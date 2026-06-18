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
      <h1 className="text-2xl font-bold text-gray-900">Zeiterfassung</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Einträge" value={entries.length} />
        <Metric
          label="Saldo"
          value={saldo?.hasConfig ? `${saldo.saldoH > 0 ? '+' : ''}${saldo.saldoH} h` : '—'}
          hint={saldo?.hasConfig ? 'Über-/Unterstunden' : 'Kein Startdatum konfiguriert'}
        />
        <Metric
          label="Diese Woche"
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
                <h3 className="mb-2 text-sm font-semibold text-gray-500">{week}</h3>
                <ul className="divide-y divide-gray-100">
                  {rows.map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {e.date}
                          {e.customerName && ` · ${e.customerName}`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {e.status === 'Anwesend'
                            ? `${e.startTime}–${e.endTime}`
                            : e.status}
                          {e.comment && ` · ${e.comment}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {e.source === 'voice' && <Badge tone="blue">KI</Badge>}
                        {e.isHelper && <Badge tone="amber">Helfer</Badge>}
                        <span className="font-mono text-gray-900">{fmtMin(calcWorkMin(e))}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
