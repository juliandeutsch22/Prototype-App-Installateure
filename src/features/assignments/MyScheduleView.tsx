import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUser } from '@/lib/db/assignments';
import { listAllProjects } from '@/lib/db/projects';
import type { Assignment, Project } from '@/types';
import { todayStr } from '@/lib/time';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** 'YYYY-MM-DD' -> 'Mo., 15.06.'. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

/** Eigene Einsätze, monatsweise blätterbar. */
export default function MyScheduleView() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lokaler Monat, NICHT über toISOString: das rechnet in UTC und liefert am
  // Monatsersten vor 02:00 Uhr (Sommerzeit) noch den Vormonat.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayStr().split('-');
    return { year: Number(y), month: Number(m) - 1 };
  });

  useEffect(() => {
    if (!user) return;
    // ALLE Baustellen der Firma: eingeplant zu sein heißt nicht, der
    // Baustelle fest zugeordnet zu sein — sonst bliebe der Kundenname leer
    // und Route/Anruf fehlten. Die Rules erlauben firmenweites Lesen.
    listAllProjects(user.companyId).then(setProjects).catch(() => undefined);
    listAssignmentsForUser(user.companyId, user.uid)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const visible = useMemo(
    () => rows.filter((a) => a.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date)),
    [rows, prefix],
  );

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const today = todayStr();

  return (
    <div className="space-y-6">
      <PageHeader title="Mein Einsatzplan" subtitle="Deine geplanten Einsätze" />

      <Card
        title={`${MONTHS[cursor.month]} ${cursor.year}`}
        action={
          // Blättern: ohne das war der Folgemonat gar nicht einsehbar.
          <span className="flex gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Vorheriger Monat"
              className="min-h-touch min-w-touch rounded-sm border border-line px-3 font-bold text-ink">
              ‹
            </button>
            <button type="button" onClick={() => shift(1)} aria-label="Nächster Monat"
              className="min-h-touch min-w-touch rounded-sm border border-line px-3 font-bold text-ink">
              ›
            </button>
          </span>
        }
      >
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : visible.length === 0 ? (
          <EmptyState>Keine Einsätze in diesem Monat.</EmptyState>
        ) : (
          <div className="space-y-3">
            {visible.map((a) => {
              const proj = projects.find((p) => p.projectNumber === a.projectNumber);
              const isToday = a.date === today;
              return (
                <div
                  key={a.id}
                  className={`rounded-sm border p-3 ${isToday ? 'border-l-4 border-l-accent border-line bg-surface-2' : 'border-line'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{dayLabel(a.date)}</span>
                    <span className="flex gap-2">
                      {isToday && <Badge tone="danger">Heute</Badge>}
                      <Badge tone={a.asHelper ? 'warning' : 'info'}>
                        {a.asHelper ? 'Helfer' : 'Facharbeiter'}
                      </Badge>
                    </span>
                  </div>

                  <p className="mt-1 text-ink">
                    {proj?.customerName ?? a.projectNumber}
                    {/* Nummer nur zusätzlich zeigen, wenn ein Kundenname da ist —
                        sonst stünde sie doppelt. */}
                    {proj?.customerName && (
                      <span className="ml-1 font-mono text-sm text-ink-muted">
                        ({a.projectNumber})
                      </span>
                    )}
                  </p>
                  {a.comment && <p className="mt-0.5 text-sm text-ink-muted">{a.comment}</p>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Übernimmt Baustelle und Helfer-Rolle ins Zeitformular —
                        ein vergessener Helfer-Haken kostet den falschen Satz. */}
                    <Link
                      to="/time"
                      state={{ projectNumber: a.projectNumber, asHelper: !!a.asHelper }}
                      className="flex min-h-touch items-center rounded-sm bg-brand px-4 py-2 font-semibold text-brand-fg"
                    >
                      Zeit erfassen
                    </Link>
                    {proj?.address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(proj.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-touch items-center rounded-sm border border-line px-4 py-2 font-medium text-ink"
                      >
                        Route
                      </a>
                    )}
                    {proj?.contactPhone && (
                      <a
                        href={`tel:${proj.contactPhone.replace(/[^\d+]/g, '')}`}
                        className="flex min-h-touch items-center rounded-sm border border-line px-4 py-2 font-medium text-ink"
                      >
                        Anrufen
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
