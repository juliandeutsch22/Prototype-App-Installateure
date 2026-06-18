import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listProjectsForEmployee } from '@/lib/db/projects';
import type { Project } from '@/types';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { List, ListRow } from '@/components/ListRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

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
      <PageHeader title="Meine Baustellen" subtitle="Baustellen, denen du zugeordnet bist" />
      <Card>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : projects.length === 0 ? (
          <EmptyState>Dir sind aktuell keine Baustellen zugeordnet.</EmptyState>
        ) : (
          <List>
            {projects.map((p) => (
              <ListRow
                key={p.id}
                title={p.customerName}
                subtitle={
                  <>
                    {p.projectNumber}
                    {p.address && ` · ${p.address}`}
                  </>
                }
              >
                <StatusBadge status={p.status} />
              </ListRow>
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
