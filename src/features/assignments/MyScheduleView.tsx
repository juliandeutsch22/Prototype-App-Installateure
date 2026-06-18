import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUser } from '@/lib/db/assignments';
import type { Assignment } from '@/types';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** Eigene Einsätze des aktuellen Monats, nach Datum gruppiert. */
export default function MyScheduleView() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listAssignmentsForUser(user.companyId, user.uid)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const thisMonth = useMemo(
    () => rows.filter((a) => a.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)),
    [rows, month],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Mein Einsatzplan" subtitle="Deine geplanten Einsätze diesen Monat" />
      <Card title={`Einsätze ${month}`}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : thisMonth.length === 0 ? (
          <EmptyState>Keine Einsätze in diesem Monat.</EmptyState>
        ) : (
          <List>
            {thisMonth.map((a) => (
              <ListRow
                key={a.id}
                title={a.date}
                subtitle={
                  <>
                    {a.projectNumber}
                    {a.comment && ` · ${a.comment}`}
                  </>
                }
              >
                {a.asHelper && <Badge tone="warning">Helfer</Badge>}
              </ListRow>
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
