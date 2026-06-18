import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeProjects, createProject, updateProject, deleteProject } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import { InputField, SelectField } from '@/components/Field';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const STATUS_TONE = { Aktiv: 'green', Pausiert: 'amber', Abgeschlossen: 'gray' } as const;
const empty = { projectNumber: '', customerName: '', address: '', status: 'Aktiv' as Project['status'] };

/** Baustellen-Verwaltung: CRUD + Mitarbeiterzuordnung (GF/Admin). */
export default function AdminProjectsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<WithId<Project>[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch(() => undefined);
    const unsub = subscribeProjects(
      user.companyId,
      (rows) => {
        setProjects(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

  function startEdit(p: WithId<Project>) {
    setEditId(p.id);
    setForm({ projectNumber: p.projectNumber, customerName: p.customerName, address: p.address ?? '', status: p.status });
    setAssigned(p.assignedEmployees ?? []);
  }
  function reset() {
    setEditId(null);
    setForm(empty);
    setAssigned([]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const data = { ...form, assignedEmployees: assigned };
      if (editId) await updateProject(editId, data);
      else await createProject(user.companyId, data);
      reset();
    } catch {
      setError('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Baustellen</h1>

      <Card title={editId ? 'Baustelle bearbeiten' : 'Neue Baustelle'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField id="pnr" label="Projektnummer" value={form.projectNumber}
              onChange={(e) => setForm({ ...form, projectNumber: e.target.value })} required />
            <InputField id="pcust" label="Kunde" value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })} required />
            <InputField id="padr" label="Adresse" value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <SelectField id="pstatus" label="Status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Project['status'] })}>
              <option>Aktiv</option>
              <option>Pausiert</option>
              <option>Abgeschlossen</option>
            </SelectField>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Zugeordnete Mitarbeiter</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {users.map((u) => (
                <label key={u.uid} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={assigned.includes(u.uid)}
                    onChange={(e) =>
                      setAssigned((prev) => e.target.checked ? [...prev, u.uid] : prev.filter((x) => x !== u.uid))
                    } />
                  {u.name}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <ErrorState message={error} />}
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>{editId ? 'Speichern' : 'Anlegen'}</Button>
            {editId && <Button type="button" variant="secondary" onClick={reset}>Abbrechen</Button>}
          </div>
        </form>
      </Card>

      <Card title="Alle Baustellen">
        {loading ? <LoadingState /> : projects.length === 0 ? (
          <EmptyState>Noch keine Baustellen.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-gray-900">{p.customerName} <span className="font-mono text-gray-500">({p.projectNumber})</span></p>
                  <p className="text-sm text-gray-500">{p.address}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  <Button variant="ghost" onClick={() => startEdit(p)}>Bearbeiten</Button>
                  <button aria-label="Löschen" className="min-h-touch px-2 text-gray-400 hover:text-red-600"
                    onClick={() => void deleteProject(p.id)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
