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
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState } from '@/components/States';

/** Einsatzplanung: Datum + Projekt + Mitarbeiter -> speichern (delete-then-recreate). */
export default function AssignmentsView() {
  const { user } = useAuth();
  const toast = useToast();
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
      toast.success('Einsatz gespeichert');
    } catch {
      setError('Der Einsatz konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Einsatzplanung" subtitle="Mitarbeiter einem Tag und einer Baustelle zuteilen" />

      <Card title="Einsatz planen">
        <FormGrid>
          <InputField id="adate" label="Datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SelectField id="aproj" label="Baustelle" value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)}>
            <option value="">— wählen —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>{p.customerName} ({p.projectNumber})</option>
            ))}
          </SelectField>
        </FormGrid>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-ink">Mitarbeiter</legend>
          <div className="mt-1 flex flex-wrap gap-x-5">
            {users.map((u) => (
              <CheckboxField
                key={u.uid}
                id={`assign-${u.uid}`}
                label={u.name}
                checked={!!checked[u.uid]}
                onChange={(e) => setChecked((c) => ({ ...c, [u.uid]: e.target.checked }))}
              />
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
          <List>
            {dayAssignments.map((a) => (
              <ListRow
                key={a.id}
                title={a.userName ?? ''}
                subtitle={
                  <>
                    {a.projectNumber}
                    {a.comment && ` · ${a.comment}`}
                  </>
                }
              >
                {a.asHelper && <Badge tone="warning">Helfer</Badge>}
                <IconButton
                  label="Einsatz löschen"
                  tone="danger"
                  onClick={async () => {
                    await deleteAssignment(a.id);
                    refreshDay();
                    toast.success('Einsatz gelöscht');
                  }}
                >
                  ✕
                </IconButton>
              </ListRow>
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
