import { useMemo, useState } from 'react';
import {
  groupProjectHours,
  calcBudgetState,
  normProjectNumber,
  calcWorkMin,
  fmtMin,
} from '@/lib/time';
import type { Project, TimeEntry } from '@/types';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Icon from '@/components/Icon';
import { EmptyState } from '@/components/States';

const BAR_TONE = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-accent',
  neutral: 'bg-line',
} as const;

/** 'YYYY-MM-DD' -> 'Mo., 15.06.25'. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** Dezimalstunden mit Komma. */
const h = (min: number) => (min / 60).toFixed(1).replace('.', ',');

/**
 * Projektauswertung: Ist-Stunden gegen das kalkulierte Budget, getrennt nach
 * Fach- und Helferzeit. Helferstunden zählen bewusst NICHT gegen das Budget —
 * sie werden zwar verrechnet, sind für die Kalkulation aber kostenneutral.
 */
export default function ProjectSummary({
  entries,
  projects,
  label,
}: {
  entries: TimeEntry[];
  projects: Project[];
  label: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const grouped = groupProjectHours(entries);
    return grouped.map((g) => {
      const project = projects.find(
        (p) => normProjectNumber(p.projectNumber) === g.projectNumber,
      );
      return { ...g, project, budget: calcBudgetState(g.fachMin, project?.estimatedHours) };
    });
  }, [entries, projects]);

  if (rows.length === 0) {
    return (
      <Card title={`Projektauswertung ${label}`}>
        <EmptyState>Keine Projektstunden in diesem Zeitraum.</EmptyState>
      </Card>
    );
  }

  return (
    <Card title={`Projektauswertung ${label}`}>
      <div className="space-y-3">
        {rows.map((r) => {
          const isOpen = open === r.projectNumber;
          // Mitarbeiter-Zwischensummen, größter Beitrag zuerst.
          const byUser = new Map<string, { name: string; fachMin: number; helperMin: number }>();
          for (const e of r.entries) {
            const key = e.userId || 'unbekannt';
            const cur = byUser.get(key) ?? {
              name: e.userName || 'Unbekannt',
              fachMin: 0,
              helperMin: 0,
            };
            const min = calcWorkMin(e);
            if (e.isHelper) cur.helperMin += min;
            else cur.fachMin += min;
            byUser.set(key, cur);
          }
          const people = [...byUser.values()].sort(
            (a, b) => b.fachMin + b.helperMin - (a.fachMin + a.helperMin),
          );

          return (
            <div key={r.projectNumber} className="overflow-hidden rounded-lg border border-line">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.projectNumber)}
                aria-expanded={isOpen}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  isOpen ? 'bg-brand text-brand-fg' : 'bg-surface-2 hover:bg-line/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className={`block font-bold ${isOpen ? 'text-brand-fg' : 'text-ink'}`}>
                      {r.project?.customerName ?? r.projectNumber}
                    </span>
                    <span
                      className={`block tnum text-sm ${isOpen ? 'text-brand-fg/80' : 'text-ink-muted'}`}
                    >
                      {r.projectNumber}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`tnum text-sm ${isOpen ? 'text-brand-fg' : 'text-ink'}`}>
                      {h(r.fachMin)} h
                      {r.project?.estimatedHours ? ` / ${r.project.estimatedHours} h` : ''}
                    </span>
                    {r.budget.over && <Badge tone="danger">über Budget</Badge>}
                    {r.helperMin > 0 && <Badge tone="warning">+{h(r.helperMin)} h Helfer</Badge>}
                    <Icon
                      name="chevron"
                      size={18}
                      className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </div>

                {/* Fortschritt nur mit hinterlegtem Budget — sonst wäre der
                    Balken eine Aussage, die gar nicht getroffen werden kann. */}
                {r.budget.pct !== null ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-line/60">
                      <span
                        className={`block h-full ${BAR_TONE[r.budget.tone]}`}
                        style={{ width: `${r.budget.pct}%` }}
                      />
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        r.budget.over
                          ? 'text-accent'
                          : isOpen
                            ? 'text-brand-fg/80'
                            : 'text-ink-muted'
                      }`}
                    >
                      {r.budget.pct} %
                    </span>
                  </div>
                ) : (
                  <p
                    className={`mt-1 text-xs ${isOpen ? 'text-brand-fg/70' : 'text-ink-muted'}`}
                  >
                    Kein Stundenbudget hinterlegt.
                  </p>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-line px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {people.map((p) => (
                      <span
                        key={p.name}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-xs"
                      >
                        <span className="font-semibold text-ink">{p.name}</span>
                        <span className="text-ink-muted">{h(p.fachMin)} h</span>
                        {p.helperMin > 0 && (
                          <Badge tone="warning">+{h(p.helperMin)} h Helfer</Badge>
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-ink-muted">
                          <th className="py-1 pr-3 font-medium">Tag</th>
                          <th className="py-1 pr-3 font-medium">Mitarbeiter</th>
                          <th className="py-1 pr-3 font-medium">Tätigkeit</th>
                          <th className="py-1 text-right font-medium">Stunden</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...r.entries]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((e) => (
                            <tr
                              key={e.id}
                              className={`border-b border-line/60 ${e.isHelper ? 'bg-warning-bg/40' : ''}`}
                            >
                              <td className="py-1 pr-3 tnum">{dayLabel(e.date)}</td>
                              <td className="py-1 pr-3">
                                {e.userName ?? '–'}
                                {e.isHelper && (
                                  <span className="ml-1.5">
                                    <Badge tone="warning">Helfer</Badge>
                                  </span>
                                )}
                              </td>
                              <td className="py-1 pr-3 text-ink-muted">
                                {e.comment ? `„${e.comment}"` : '–'}
                              </td>
                              <td className="py-1 text-right tnum">
                                {fmtMin(calcWorkMin(e))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 border-t border-line pt-2 text-sm">
                    <span className="font-semibold text-ink">Fachzeit: {h(r.fachMin)} h</span>
                    {r.project?.estimatedHours ? (
                      <span className="text-ink-muted"> / {r.project.estimatedHours} h Budget</span>
                    ) : null}
                    {r.helperMin > 0 && (
                      <>
                        <span className="text-ink-muted"> · </span>
                        <span className="font-semibold text-warning">
                          + {h(r.helperMin)} h Helfer-Leistung
                        </span>
                        <span className="text-ink-muted"> (kostenneutral für das Budget)</span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
