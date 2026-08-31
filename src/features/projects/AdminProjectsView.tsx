import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeProjects, createProject, updateProject, deleteProject } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const empty = {
  projectNumber: '',
  customerName: '',
  address: '',
  status: 'Aktiv' as Project['status'],
  /** Kalkuliertes Stundenbudget — Grundlage der Ampel in der Projektauswertung. */
  estimatedHours: '',
  description: '',
  startDate: '',
  endDate: '',
  contactName: '',
  contactPhone: '',
};

type FormState = typeof empty;

function formFromProject(p: WithId<Project>): FormState {
  return {
    projectNumber: p.projectNumber,
    customerName: p.customerName,
    address: p.address ?? '',
    status: p.status,
    estimatedHours: p.estimatedHours != null ? String(p.estimatedHours) : '',
    description: p.description ?? '',
    startDate: p.startDate ?? '',
    endDate: p.endDate ?? '',
    contactName: p.contactName ?? '',
    contactPhone: p.contactPhone ?? '',
  };
}

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
  const [filter, setFilter] = useState<'offen' | 'alle' | 'archiv'>('offen');

  /**
   * Auf eine Baustelle gehören Monteure, nicht Büro und nicht Leitung.
   * Vorher stand hier die ungefilterte Nutzerliste — Administrator,
   * Geschäftsführung und Buchhaltung erschienen als anhakbare Mitarbeiter.
   * Die Einsatzplanung filtert längst so; hier war es schlicht vergessen.
   * Deaktivierte Konten fallen ebenfalls raus, sonst ließe sich jemand
   * einplanen, der sich gar nicht mehr anmelden kann.
   */
  const staff = useMemo(
    () =>
      users
        .filter(
          (u) =>
            (u.role === 'Mitarbeiter' && u.active !== false) ||
            // Wer bereits zugeordnet IST, bleibt sichtbar — auch wenn er
            // inzwischen eine andere Rolle hat oder deaktiviert wurde.
            // Sonst hinge er unsichtbar an der Baustelle und ließe sich
            // nicht mehr abwählen.
            assigned.includes(u.uid),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, assigned],
  );

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
    setForm(formFromProject(p));
    setAssigned(p.assignedEmployees ?? []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const data = {
        ...form,
        // Leeres Feld heißt "kein Budget" — dann bleibt die Ampel der
        // Projektauswertung bewusst aus, statt 0 h anzunehmen.
        estimatedHours: form.estimatedHours === '' ? undefined : Number(form.estimatedHours) || 0,
        assignedEmployees: assigned,
      };
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

  // Neueste zuerst; ohne Sortierung ist die Reihenfolge von Firestore beliebig.
  const sorted = useMemo(
    () => [...projects].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [projects],
  );
  const archivCount = useMemo(
    () => projects.filter((p) => p.status === 'Abgeschlossen').length,
    [projects],
  );
  const visible = useMemo(() => {
    if (filter === 'alle') return sorted;
    if (filter === 'archiv') return sorted.filter((p) => p.status === 'Abgeschlossen');
    return sorted.filter((p) => p.status !== 'Abgeschlossen');
  }, [sorted, filter]);

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
            <InputField id="phours" label="Stundenbudget (kalkuliert)" type="number" min="0" step="0.5"
              placeholder="z. B. 40" value={form.estimatedHours}
              onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} />
            <InputField id="pstart" label="Beginn" type="date" value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <InputField id="pend" label="Ende (geplant)" type="date" value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            {/* Der Monteur braucht vor Ort vor allem eine Telefonnummer. */}
            <InputField id="pcontact" label="Ansprechpartner" value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            <InputField id="pphone" label="Telefon Ansprechpartner" type="tel" value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </FormGrid>
          <InputField id="pdesc" label="Beschreibung / Auftragsumfang" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <fieldset>
            <legend className="text-sm font-medium text-ink">Zugeordnete Mitarbeiter</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {staff.map((u) => (
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

      <Card
        title="Alle Baustellen"
        action={
          <SelectField id="pfilter" label="" className="py-1 text-sm" value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="offen">Aktiv &amp; pausiert</option>
            <option value="alle">Alle</option>
            <option value="archiv">Archiv ({archivCount})</option>
          </SelectField>
        }
      >
        {loading ? <LoadingState /> : visible.length === 0 ? (
          <EmptyState>
            {projects.length === 0 ? 'Noch keine Baustellen angelegt.' : 'Keine Baustelle in dieser Auswahl.'}
          </EmptyState>
        ) : (
          <List>
            {visible.map((p) => {
              const team = (p.assignedEmployees ?? [])
                .map((uid) => users.find((u) => u.uid === uid)?.name)
                .filter(Boolean);
              return (
                <ListRow
                  key={p.id}
                  title={
                    <span>
                      {p.customerName} <span className="font-mono text-ink-muted">({p.projectNumber})</span>
                    </span>
                  }
                  subtitle={
                    <>
                      {p.address}
                      {team.length > 0 && (
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          Team: {team.join(', ')}
                        </span>
                      )}
                    </>
                  }
                >
                  {p.estimatedHours ? <Badge tone="gray">{p.estimatedHours} h Budget</Badge> : null}
                  <StatusBadge status={p.status} />
                  <Button variant="ghost" onClick={() => startEdit(p)}>Bearbeiten</Button>
                  <IconButton label="Baustelle löschen" tone="danger" onClick={() => setToDelete(p)}>
                    ✕
                  </IconButton>
                </ListRow>
              );
            })}
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
