import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { listAllEntries } from '@/lib/db/timeEntries';
import { calcOverallSaldo } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';
import { shouldShowOvertime } from '@/lib/permissions';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** Mitarbeiterübersicht: Überstunden-Saldo je Mitarbeiter (Buchhaltung/GF/Admin). */
export default function AccountingView() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([listUsers(user.companyId), listAllEntries(user.companyId)])
      .then(([u, e]) => {
        setUsers(u);
        setEntries(e);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;
  const relevant = users.filter((u) => shouldShowOvertime(u.role));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mitarbeiterübersicht</h1>
      <Card title="Überstunden-Saldo">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : relevant.length === 0 ? (
          <EmptyState>Keine Mitarbeiter mit Saldo-Konfiguration.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {relevant.map((u) => {
              const ownEntries = entries.filter((e) => e.userId === u.uid);
              const { saldoH, hasConfig } = calcOverallSaldo(u, ownEntries);
              return (
                <li key={u.uid} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-sm text-gray-500">
                      {u.role} · {ownEntries.length} Einträge
                    </p>
                  </div>
                  {hasConfig ? (
                    <Badge tone={saldoH >= 0 ? 'green' : 'red'}>
                      {saldoH > 0 ? '+' : ''}
                      {saldoH} h
                    </Badge>
                  ) : (
                    <Badge tone="gray">kein Startdatum</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
