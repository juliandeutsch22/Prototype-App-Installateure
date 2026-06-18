import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listProjectsForEmployee } from '@/lib/db/projects';
import type { Project } from '@/types';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const STATUS_TONE = { Aktiv: 'green', Pausiert: 'amber', Abgeschlossen: 'gray' } as const;

/** Read-only Liste der Baustellen, denen der Mitarbeiter zugeordnet ist. */
export default function MyProjectsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listProjectsForEmployee(user.companyId, user.uid)
      .then((rows) => setProjects(rows))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Meine Baustellen</h1>
      <Card>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : projects.length === 0 ? (
          <EmptyState>Dir sind aktuell keine Baustellen zugeordnet.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-gray-900">{p.customerName}</p>
                  <p className="text-sm text-gray-500">
                    {p.projectNumber}
                    {p.address && ` · ${p.address}`}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
