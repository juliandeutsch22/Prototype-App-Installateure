import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers, updateUserDoc, deleteUserDoc } from '@/lib/db/users';
import { provisionUser } from '@/lib/auth/provisionUser';
import { ROLES, type AppUser, type Role } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const emptyForm = {
  name: '',
  email: '',
  role: 'Mitarbeiter' as Role,
  weeklyTargetHours: '38.5',
  appStartDate: '',
};

/** Benutzerverwaltung (GF/Admin): anlegen (Secondary-App), Rolle/Status pflegen. */
export default function UserMgmtView() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<AppUser | null>(null);

  async function reload() {
    if (!user) return;
    setUsers(await listUsers(user.companyId));
  }

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId)
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await provisionUser(user.companyId, {
        name: form.name,
        email: form.email,
        role: form.role,
        active: true,
        weeklyTargetHours: Number(form.weeklyTargetHours) || 38.5,
        appStartDate: form.appStartDate || null,
      });
      toast.success(`${form.name} angelegt — Passwort-Mail versendet`);
      setForm(emptyForm);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('email-already-in-use')
          ? 'Diese E-Mail ist bereits vergeben.'
          : 'Der Benutzer konnte nicht angelegt werden.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(u: AppUser, role: Role) {
    await updateUserDoc(u.uid, { role });
    await reload();
    toast.success('Rolle geändert');
  }
  async function toggleActive(u: AppUser) {
    await updateUserDoc(u.uid, { active: !u.active });
    await reload();
    toast.success(u.active === false ? 'Benutzer aktiviert' : 'Benutzer deaktiviert');
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Benutzerverwaltung" subtitle="Benutzer anlegen, Rollen und Status pflegen" />

      <Card title="Neuen Benutzer anlegen">
        <form onSubmit={create} className="space-y-4">
          <FormGrid>
            <InputField id="uname" label="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <InputField id="uemail" label="E-Mail" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <SelectField id="urole" label="Rolle" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </SelectField>
            <InputField id="uhours" label="Wochenstunden" type="number" step="0.5" value={form.weeklyTargetHours}
              onChange={(e) => setForm({ ...form, weeklyTargetHours: e.target.value })} />
            <InputField id="ustart" label="Saldo-Startdatum (optional)" type="date" value={form.appStartDate}
              onChange={(e) => setForm({ ...form, appStartDate: e.target.value })} />
          </FormGrid>
          {error && <ErrorState message={error} />}
          <Button type="submit" loading={saving}>Benutzer anlegen</Button>
        </form>
      </Card>

      <Card title="Benutzer">
        {loading ? <LoadingState /> : users.length === 0 ? (
          <EmptyState>Noch keine Benutzer.</EmptyState>
        ) : (
          <List>
            {users.map((u) => (
              <ListRow
                key={u.uid}
                title={
                  <span className="flex items-center gap-2">
                    {u.name} {u.active === false && <Badge tone="gray">inaktiv</Badge>}
                  </span>
                }
                subtitle={u.email}
              >
                <SelectField id={`role-${u.uid}`} label="" className="py-1 text-sm"
                  value={u.role} onChange={(e) => void changeRole(u, e.target.value as Role)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </SelectField>
                <Button variant="ghost" onClick={() => void toggleActive(u)}>
                  {u.active === false ? 'Aktivieren' : 'Deaktivieren'}
                </Button>
                {u.uid !== user.uid && (
                  <IconButton label="Benutzer löschen" tone="danger" onClick={() => setToDelete(u)}>
                    ✕
                  </IconButton>
                )}
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Benutzer löschen?"
        message={toDelete ? `Das Profil von ${toDelete.name} wird entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteUserDoc(toDelete.uid);
            await reload();
            toast.success('Benutzer gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
