import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAssignmentsForDate, saveAssignments, deleteAssignment } from '@/lib/db/assignments';
import { todayStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import { InputField, SelectField } from '@/components/Field';
import { ErrorState, EmptyState } from '@/components/States';

/** Einsatzplanung: Datum + Projekt + Mitarbeiter -> speichern (delete-then-recreate). */
export default function AssignmentsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [date, setDate] = useState(todayStr());
  const [projectNumber, setProjectNumber] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [dayAssignments, setDayAssignments] = useState<WithId<Assignment>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function save() {
    if (!user || !projectNumber) return;
    setSaving(true);
    setError(null);
    try {
      const rows = users
        .filter((u) => checked[u.uid])
        .map((u) => ({
          date,
          projectNumber,
          userId: u.uid,
          userName: u.name,
          asHelper: false,
          comment,
          createdBy: user.uid,
        }));
      await saveAssignments(user.companyId, date, projectNumber, rows);
      setChecked({});
      setComment('');
      refreshDay();
    } catch {
      setError('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Einsatzplanung</h1>

      <Card title="Einsatz planen">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField id="adate" label="Datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SelectField id="aproj" label="Baustelle" value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)}>
            <option value="">— wählen —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>{p.customerName} ({p.projectNumber})</option>
            ))}
          </SelectField>
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-gray-700">Mitarbeiter</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {users.map((u) => (
              <label key={u.uid} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!!checked[u.uid]}
                  onChange={(e) => setChecked((c) => ({ ...c, [u.uid]: e.target.checked }))} />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <InputField id="acomment" label="Kommentar" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {error && <div className="mt-3"><ErrorState message={error} /></div>}
        <div className="mt-4">
          <Button onClick={save} loading={saving} disabled={!projectNumber}>Einsatz speichern</Button>
        </div>
      </Card>

      <Card title={`Einsätze am ${date}`}>
        {dayAssignments.length === 0 ? (
          <EmptyState>Keine Einsätze an diesem Tag.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {dayAssignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-gray-900">{a.userName}</p>
                  <p className="text-sm text-gray-500">{a.projectNumber}{a.comment && ` · ${a.comment}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.asHelper && <Badge tone="amber">Helfer</Badge>}
                  <button aria-label="Löschen" className="min-h-touch px-2 text-gray-400 hover:text-red-600"
                    onClick={async () => { await deleteAssignment(a.id); refreshDay(); }}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
