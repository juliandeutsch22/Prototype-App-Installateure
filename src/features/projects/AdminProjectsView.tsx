import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeProjects, createProject, updateProject, deleteProject } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const empty = { projectNumber: '', customerName: '', address: '', status: 'Aktiv' as Project['status'] };

/** Baustellen-Verwaltung: CRUD + Mitarbeiterzuordnung (GF/Admin). */
export default function AdminProjectsView() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<WithId<Project>[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Project> | null>(null);

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
      toast.success(editId ? 'Baustelle gespeichert' : 'Baustelle angelegt');
    } catch {
      setError('Die Baustelle konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Baustellen" subtitle="Projekte anlegen, bearbeiten und Mitarbeiter zuordnen" />

      <Card title={editId ? 'Baustelle bearbeiten' : 'Neue Baustelle'}>
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
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
          </FormGrid>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Zugeordnete Mitarbeiter</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {users.map((u) => (
                <CheckboxField
                  key={u.uid}
                  id={`proj-emp-${u.uid}`}
                  label={u.name}
                  checked={assigned.includes(u.uid)}
                  onChange={(e) =>
                    setAssigned((prev) => (e.target.checked ? [...prev, u.uid] : prev.filter((x) => x !== u.uid)))
                  }
                />
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
          <EmptyState>Noch keine Baustellen angelegt.</EmptyState>
        ) : (
          <List>
            {projects.map((p) => (
              <ListRow
                key={p.id}
                title={
                  <span>
                    {p.customerName} <span className="font-mono text-ink-muted">({p.projectNumber})</span>
                  </span>
                }
                subtitle={p.address}
              >
                <StatusBadge status={p.status} />
                <Button variant="ghost" onClick={() => startEdit(p)}>Bearbeiten</Button>
                <IconButton label="Baustelle löschen" tone="danger" onClick={() => setToDelete(p)}>
                  ✕
                </IconButton>
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Baustelle löschen?"
        message={toDelete ? `${toDelete.customerName} (${toDelete.projectNumber}) wird entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteProject(toDelete.id);
            toast.success('Baustelle gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
