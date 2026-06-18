import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { listAllEntries } from '@/lib/db/timeEntries';
import { calcOverallSaldo } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';
import { shouldShowOvertime } from '@/lib/permissions';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
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
      <PageHeader title="Mitarbeiterübersicht" subtitle="Überstunden-Saldo je Mitarbeiter" />
      <Card title="Überstunden-Saldo">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : relevant.length === 0 ? (
          <EmptyState>Keine Mitarbeiter mit Saldo-Konfiguration.</EmptyState>
        ) : (
          <List>
            {relevant.map((u) => {
              const ownEntries = entries.filter((e) => e.userId === u.uid);
              const { saldoH, hasConfig } = calcOverallSaldo(u, ownEntries);
              return (
                <ListRow key={u.uid} title={u.name} subtitle={`${u.role} · ${ownEntries.length} Einträge`}>
                  {hasConfig ? (
                    <Badge tone={saldoH >= 0 ? 'success' : 'danger'}>
                      {saldoH > 0 ? '+' : ''}
                      {saldoH} h
                    </Badge>
                  ) : (
                    <Badge tone="gray">kein Startdatum</Badge>
                  )}
                </ListRow>
              );
            })}
          </List>
        )}
      </Card>
    </div>
  );
}
