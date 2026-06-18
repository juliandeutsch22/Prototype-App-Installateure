import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUser } from '@/lib/db/assignments';
import type { Assignment } from '@/types';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
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
      <h1 className="text-2xl font-bold text-gray-900">Mein Einsatzplan</h1>
      <Card title={`Einsätze ${month}`}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : thisMonth.length === 0 ? (
          <EmptyState>Keine Einsätze in diesem Monat.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {thisMonth.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-gray-900">{a.date}</p>
                  <p className="text-sm text-gray-500">
                    {a.projectNumber}
                    {a.comment && ` · ${a.comment}`}
                  </p>
                </div>
                {a.asHelper && <Badge tone="amber">Helfer</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
