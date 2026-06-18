import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listUsers, updateUserDoc, deleteUserDoc } from '@/lib/db/users';
import { provisionUser } from '@/lib/auth/provisionUser';
import { ROLES, type AppUser, type Role } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import { InputField, SelectField } from '@/components/Field';
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
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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
    setInfo(null);
    try {
      await provisionUser(user.companyId, {
        name: form.name,
        email: form.email,
        role: form.role,
        active: true,
        weeklyTargetHours: Number(form.weeklyTargetHours) || 38.5,
        appStartDate: form.appStartDate || null,
      });
      setInfo(`Benutzer ${form.email} angelegt. Eine Passwort-Mail wurde versendet.`);
      setForm(emptyForm);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('email-already-in-use')
          ? 'Diese E-Mail ist bereits vergeben.'
          : 'Benutzer konnte nicht angelegt werden.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(u: AppUser, role: Role) {
    await updateUserDoc(u.uid, { role });
    await reload();
  }
  async function toggleActive(u: AppUser) {
    await updateUserDoc(u.uid, { active: !u.active });
    await reload();
  }
  async function remove(u: AppUser) {
    await deleteUserDoc(u.uid);
    await reload();
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Benutzerverwaltung</h1>

      <Card title="Neuen Benutzer anlegen">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>
          {error && <ErrorState message={error} />}
          {info && <Badge tone="green">{info}</Badge>}
          <Button type="submit" loading={saving}>Benutzer anlegen</Button>
        </form>
      </Card>

      <Card title="Benutzer">
        {loading ? <LoadingState /> : users.length === 0 ? (
          <EmptyState>Noch keine Benutzer.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map((u) => (
              <li key={u.uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {u.name} {u.active === false && <Badge tone="gray">inaktiv</Badge>}
                  </p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <SelectField id={`role-${u.uid}`} label="" className="text-sm"
                    value={u.role} onChange={(e) => void changeRole(u, e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </SelectField>
                  <Button variant="ghost" onClick={() => void toggleActive(u)}>
                    {u.active === false ? 'Aktivieren' : 'Deaktivieren'}
                  </Button>
                  {u.uid !== user.uid && (
                    <button aria-label="Löschen" className="min-h-touch px-2 text-gray-400 hover:text-red-600"
                      onClick={() => void remove(u)}>✕</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
