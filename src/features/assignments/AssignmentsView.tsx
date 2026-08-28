import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAssignmentsForDate, saveAssignments, deleteAssignment } from '@/lib/db/assignments';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState } from '@/components/States';

/** 'YYYY-MM-DD' -> 'Fr., 28.08.2026'. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Auswahlzustand je Mitarbeiter: eingeplant und in welcher Rolle. */
interface Pick {
  on: boolean;
  asHelper: boolean;
}

/** Einsatzplanung: Datum + Baustelle + Mitarbeiter -> speichern. */
export default function AssignmentsView() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [date, setDate] = useState(todayStr());
  const [projectNumber, setProjectNumber] = useState('');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [comment, setComment] = useState('');
  const [dayAssignments, setDayAssignments] = useState<WithId<Assignment>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Assignment> | null>(null);

  const refreshDay = useCallback(() => {
    if (!user) return;
    listAssignmentsForDate(user.companyId, date)
      .then(setDayAssignments)
      .catch((e) => setError(e.message));
  }, [user, date]);

  useEffect(() => {
    if (!user) return;
    listActiveProjects(user.companyId).then(setProjects).catch(() => undefined);
    listUsers(user.companyId).then(setUsers).catch(() => undefined);
  }, [user]);

  useEffect(refreshDay, [refreshDay]);

  // Nur Außendienst wird eingeplant — Buchhaltung und Verwaltung fahren nicht raus.
  const staff = useMemo(
    () =>
      users
        .filter((u) => u.role === 'Mitarbeiter' && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );

  /**
   * Vorhandene Planung ins Formular übernehmen, sobald Datum UND Baustelle
   * stehen. Ohne das startete das Formular leer und das Speichern hätte die
   * bestehenden Einsätze gelöscht (delete-then-recreate) — echter Datenverlust,
   * wenn eigentlich nur der Kommentar geändert werden sollte.
   */
  useEffect(() => {
    if (!projectNumber) {
      setPicks({});
      setComment('');
      return;
    }
    const existing = dayAssignments.filter((a) => a.projectNumber === projectNumber);
    const next: Record<string, Pick> = {};
    for (const a of existing) next[a.userId] = { on: true, asHelper: !!a.asHelper };
    setPicks(next);
    setComment(existing[0]?.comment ?? '');
  }, [projectNumber, dayAssignments]);

  const selectedCount = Object.values(picks).filter((p) => p.on).length;
  const existingForProject = dayAssignments.filter((a) => a.projectNumber === projectNumber);
  const holiday = getAustrianHolidayName(new Date(`${date}T00:00:00`));
  const weekend = isWeekend(new Date(`${date}T00:00:00`));

  async function save() {
    if (!user || !projectNumber) return;
    if (selectedCount === 0) {
      setError(
        existingForProject.length > 0
          ? 'Kein Mitarbeiter ausgewählt. Zum Entfernen der Planung bitte die Einsätze unten einzeln löschen.'
          : 'Bitte mindestens einen Mitarbeiter auswählen.',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rows = staff
        .filter((u) => picks[u.uid]?.on)
        .map((u) => ({
          date,
          projectNumber,
          userId: u.uid,
          userName: u.name,
          // Helfer werden mit einem anderen Satz verrechnet — ein vergessener
          // Haken kostet bare Münze.
          asHelper: !!picks[u.uid]?.asHelper,
          comment,
          createdBy: user.uid,
        }));
      await saveAssignments(user.companyId, date, projectNumber, rows);
      refreshDay();
      toast.success('Einsatz gespeichert');
    } catch {
      setError('Der Einsatz konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  // Tagesübersicht nach Baustelle gruppieren.
  const byProject = new Map<string, WithId<Assignment>[]>();
  for (const a of dayAssignments) {
    const list = byProject.get(a.projectNumber) ?? [];
    list.push(a);
    byProject.set(a.projectNumber, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Einsatzplanung" subtitle="Mitarbeiter einem Tag und einer Baustelle zuteilen" />

      <Card title="Einsatz planen" accent="brand">
        <FormGrid>
          <InputField id="adate" label="Datum" type="date" value={date}
            onChange={(e) => setDate(e.target.value)} />
          <SelectField id="aproj" label="Baustelle" value={projectNumber}
            onChange={(e) => setProjectNumber(e.target.value)}>
            <option value="">— wählen —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {p.customerName} ({p.projectNumber})
              </option>
            ))}
          </SelectField>
        </FormGrid>

        {(holiday || weekend) && (
          <p className="mt-3 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
            {holiday ? `${holiday} — gesetzlicher Feiertag.` : 'Wochenende.'} Einsatz ist trotzdem
            planbar.
          </p>
        )}

        {projectNumber && existingForProject.length > 0 && (
          <p className="mt-3 rounded-sm border border-info/30 bg-info-bg px-3 py-2 text-sm text-info">
            Für diese Baustelle ist der Tag bereits geplant. Die Auswahl unten ist übernommen —
            Speichern überschreibt sie.
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-ink">
            Mitarbeiter {selectedCount > 0 && `(${selectedCount} ausgewählt)`}
          </legend>
          {staff.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Keine aktiven Mitarbeiter vorhanden.</p>
          ) : (
            <div className="mt-2 space-y-1">
              {staff.map((u) => {
                const p = picks[u.uid] ?? { on: false, asHelper: false };
                return (
                  <div
                    key={u.uid}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-1.5"
                  >
                    <CheckboxField
                      id={`assign-${u.uid}`}
                      label={u.name}
                      checked={p.on}
                      onChange={(e) =>
                        setPicks((c) => ({ ...c, [u.uid]: { ...p, on: e.target.checked } }))
                      }
                    />
                    {p.on && (
                      <CheckboxField
                        id={`helper-${u.uid}`}
                        label="als Helfer"
                        checked={p.asHelper}
                        onChange={(e) =>
                          setPicks((c) => ({ ...c, [u.uid]: { ...p, asHelper: e.target.checked } }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="mt-4">
          <InputField id="acomment" label="Kommentar / Aufgabe" value={comment}
            onChange={(e) => setComment(e.target.value)} />
        </div>
        {error && <div className="mt-3"><ErrorState message={error} /></div>}
        <div className="mt-4">
          <Button onClick={save} loading={saving} disabled={!projectNumber}>
            Einsatz speichern
          </Button>
        </div>
      </Card>

      <Card title={`Einsätze am ${fmtDay(date)}`}>
        {dayAssignments.length === 0 ? (
          <EmptyState>Keine Einsätze an diesem Tag.</EmptyState>
        ) : (
          <div className="space-y-4">
            {[...byProject.entries()].map(([pn, rows]) => {
              const proj = projects.find((p) => p.projectNumber === pn);
              const fach = rows.filter((r) => !r.asHelper).length;
              const helper = rows.filter((r) => r.asHelper).length;
              return (
                <div key={pn} className="rounded-sm border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
                    <span className="font-semibold text-ink">
                      {proj?.customerName ?? pn}{' '}
                      <span className="font-mono text-sm text-ink-muted">({pn})</span>
                    </span>
                    <span className="flex gap-2">
                      <Badge tone="info">{fach} Facharbeiter</Badge>
                      {helper > 0 && <Badge tone="warning">{helper} Helfer</Badge>}
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {rows.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{a.userName}</span>
                          {a.comment && (
                            <span className="block truncate text-sm text-ink-muted">{a.comment}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {a.asHelper && <Badge tone="warning">Helfer</Badge>}
                          <IconButton label={`Einsatz von ${a.userName} löschen`} tone="danger"
                            onClick={() => setToDelete(a)}>
                            ✕
                          </IconButton>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Einsatz löschen?"
        message={
          toDelete
            ? `Der Einsatz von ${toDelete.userName} am ${fmtDay(toDelete.date)} wird entfernt.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteAssignment(toDelete.id);
            refreshDay();
            toast.success('Einsatz gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
