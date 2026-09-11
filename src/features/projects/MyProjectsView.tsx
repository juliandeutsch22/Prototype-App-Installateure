import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listProjectsForEmployee } from '@/lib/db/projects';
import type { Project } from '@/types';
import Card from '@/components/Card';
import Icon from '@/components/Icon';
import { TelefonLink } from '@/components/Kontakt';
import { mapsUrl } from '@/lib/kontakt';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Badge from '@/components/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** 'YYYY-MM-DD' -> '27.08.2026'; leer bleibt leer. */
function fmt(d?: string): string {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Baustellen des Mitarbeiters. Bewusst als Karten statt als Liste: vor Ort
 * zählen Ansprechpartner, Telefonnummer und Route — die müssen groß und mit
 * einem Daumen erreichbar sein.
 */
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

  // Abgeschlossene Baustellen gehören nicht in die Arbeitsliste.
  const active = useMemo(
    () => projects.filter((p) => p.status !== 'Abgeschlossen'),
    [projects],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Meine Baustellen" subtitle="Baustellen, denen du zugeordnet bist" />

      {loading ? (
        <Card><LoadingState /></Card>
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : active.length === 0 ? (
        <Card><EmptyState>Dir sind aktuell keine Baustellen zugeordnet. Die Einteilung macht die Projektleitung.</EmptyState></Card>
      ) : (
        <div className="space-y-4">
          {active.map((p) => (
            <Card
              key={p.id}
              title={p.customerName}
              action={<StatusBadge status={p.status} />}
            >
              <p className="tnum text-sm text-ink-muted">{p.projectNumber}</p>
              {p.description && <p className="mt-2 text-ink">{p.description}</p>}

              {(p.startDate || p.endDate) && (
                <p className="mt-2 text-sm text-ink-muted">
                  {fmt(p.startDate)}
                  {p.endDate && ` – ${fmt(p.endDate)}`}
                </p>
              )}
              {p.estimatedHours ? (
                <p className="mt-2">
                  <Badge tone="gray">{p.estimatedHours} h kalkuliert</Badge>
                </p>
              ) : null}

              {/* Ansprechpartner: ohne Nummer steht der Monteur vor Ort ohne
                  Kontakt da — deshalb wird ein fehlender Eintrag angemahnt. */}
              <div className="mt-4 rounded-sm border border-line bg-surface-2 p-3">
                <p className="section-label">Ansprechpartner</p>
                {p.contactName || p.contactPhone ? (
                  <div className="mt-1">
                    {p.contactName && <p className="font-medium text-ink">{p.contactName}</p>}
                    <TelefonLink
                      nummer={p.contactPhone}
                      name={p.contactName}
                      className="mt-1"
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-warning">Kein Ansprechpartner hinterlegt.</p>
                )}
              </div>

              {/* Die Route bleibt hier die Hauptaktion der Karte und
                  behaelt deshalb die volle Breite und die Markenfarbe. */}
              {p.address && (
                <a
                  href={mapsUrl(p.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex min-h-touch items-center justify-center gap-2 rounded-sm bg-brand bg-grad-brand-soft px-4 py-2 font-semibold text-brand-fg shadow-sm"
                >
                  <Icon name="pin" size={18} aria-hidden />
                  Route: {p.address}
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
