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
import MonthCalendar from '@/components/MonthCalendar';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** 'YYYY-MM-DD' -> 'Mo., 15.06.2026'. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Eigene Einsätze im Monatskalender — dieselbe Ansicht wie im Prototyp.
 *
 * Die reine Liste beantwortete nur „was kommt als Nächstes". Am Kalender
 * sieht ein Monteur dagegen auf einen Blick, an welchen Tagen er verplant
 * ist und welche noch frei sind — die Frage, die er tatsächlich stellt.
 */
export default function MyScheduleView() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(todayStr());
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

  /** Einsätze je Tag des angezeigten Monats — die Zahlen im Kalender. */
  const marks = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of rows) {
      if (!a.date.startsWith(prefix)) continue;
      m.set(a.date, (m.get(a.date) ?? 0) + 1);
    }
    return m;
  }, [rows, prefix]);

  const visible = useMemo(
    () => rows.filter((a) => a.date === selected),
    [rows, selected],
  );

  const today = todayStr();

  return (
    <div className="space-y-6">
      <PageHeader title="Mein Einsatzplan" subtitle="Deine geplanten Einsätze" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <MonthCalendar
              year={cursor.year}
              month={cursor.month}
              selected={selected}
              onSelect={setSelected}
              onShiftMonth={(delta) =>
                setCursor((c) => {
                  const d = new Date(c.year, c.month + delta, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              marks={marks}
              markLabel={(n) => `${n} ${n === 1 ? 'Einsatz' : 'Einsätze'}`}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
                Einsätze geplant
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand/25 ring-1 ring-brand" />
                Heute
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-5 rounded-sm bg-warning-bg shadow-[inset_0_2px_0_0_var(--warning)]" />
                Feiertag (AT)
              </span>
            </div>
          </div>

          <div className="lg:col-span-3">
            <Card title={`Einsätze am ${fmtDay(selected)}`}>
              {visible.length === 0 ? (
                <EmptyState>
                  Kein Einsatz an diesem Tag. Die roten Zahlen im Kalender zeigen, an welchen
                  Tagen du eingeplant bist.
                </EmptyState>
              ) : (
                <div className="space-y-3">
                  {visible.map((a) => {
                    const proj = projects.find((p) => p.projectNumber === a.projectNumber);
                    return (
                      <div key={a.id} className="rounded border border-line p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-ink">
                            {proj?.customerName ?? a.projectNumber}
                            {/* Nummer nur zusätzlich zeigen, wenn ein Kundenname
                                da ist — sonst stünde sie doppelt. */}
                            {proj?.customerName && (
                              <span className="tnum ml-1 text-sm font-normal text-ink-muted">
                                ({a.projectNumber})
                              </span>
                            )}
                          </span>
                          <span className="flex gap-2">
                            {a.date === today && <Badge tone="danger">Heute</Badge>}
                            <Badge tone={a.asHelper ? 'warning' : 'info'}>
                              {a.asHelper ? 'Helfer' : 'Facharbeiter'}
                            </Badge>
                          </span>
                        </div>
                        {a.comment && <p className="mt-1 text-sm text-ink-muted">{a.comment}</p>}
                        {proj?.address && (
                          <p className="mt-0.5 text-sm text-ink-muted">{proj.address}</p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {/* Übernimmt Baustelle und Helfer-Rolle ins
                              Zeitformular — ein vergessener Helfer-Haken
                              kostet den falschen Satz. */}
                          <Link
                            to="/time"
                            state={{ projectNumber: a.projectNumber, asHelper: !!a.asHelper }}
                            className="flex min-h-touch items-center rounded bg-brand px-4 py-2 font-semibold text-brand-fg"
                          >
                            Zeit erfassen
                          </Link>
                          {proj?.address && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(proj.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex min-h-touch items-center rounded border border-line px-4 py-2 font-medium text-ink"
                            >
                              Route
                            </a>
                          )}
                          {proj?.contactPhone && (
                            <a
                              href={`tel:${proj.contactPhone.replace(/[^\d+]/g, '')}`}
                              className="flex min-h-touch items-center rounded border border-line px-4 py-2 font-medium text-ink"
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
        </div>
      )}
    </div>
  );
}
