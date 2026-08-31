import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  listUsers,
  updateUserProfile,
  DEFAULT_WEEKLY_HOURS,
  DEFAULT_VACATION_DAYS,
  DEFAULT_WORK_DAYS,
} from '@/lib/db/users';
import { provisionUser, resendPasswordReset } from '@/lib/auth/provisionUser';
import { todayStr } from '@/lib/time';
import { ROLES, type AppUser, type Role } from '@/types';
import { canManageAdmins } from '@/lib/permissions';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge, { RoleBadge } from '@/components/Badge';
import Metric from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'So' },
];

function emptyForm() {
  return {
    name: '',
    email: '',
    role: 'Mitarbeiter' as Role,
    active: true,
    weeklyTargetHours: String(DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: String(DEFAULT_VACATION_DAYS),
    // Ohne Startdatum bleibt der Saldo dauerhaft "nicht konfiguriert",
    // deshalb wie im Legacy mit heute vorbelegen.
    appStartDate: todayStr(),
    initialOvertime: '0',
    workDays: DEFAULT_WORK_DAYS,
  };
}

type FormState = ReturnType<typeof emptyForm>;

function formFromUser(u: AppUser): FormState {
  return {
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active !== false,
    weeklyTargetHours: String(u.weeklyTargetHours ?? DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: String(u.yearlyVacationDays ?? DEFAULT_VACATION_DAYS),
    appStartDate: u.appStartDate ?? todayStr(),
    initialOvertime: String(u.initialOvertime ?? 0),
    workDays: u.workDays ?? DEFAULT_WORK_DAYS,
  };
}

/** Benutzerverwaltung (GF/Admin): anlegen, Stammdaten und Rollen pflegen. */
export default function UserMgmtView() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [toToggle, setToToggle] = useState<AppUser | null>(null);
  /** Initialpasswort, falls die Willkommens-Mail nicht zugestellt werden konnte. */
  const [handoverPassword, setHandoverPassword] = useState<{ name: string; pw: string } | null>(null);

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

  const sorted = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );
  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.active !== false).length,
      field: users.filter((u) => u.role === 'Mitarbeiter').length,
    }),
    [users],
  );

  function startEdit(u: AppUser) {
    setEditing(u);
    setForm(formFromUser(u));
    setShowDetails(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm());
    setShowDetails(false);
    setError(null);
  }

  function toggleWorkday(d: number) {
    setForm((f) => ({
      ...f,
      workDays: f.workDays.includes(d)
        ? f.workDays.filter((x) => x !== d)
        : [...f.workDays, d].sort(),
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    const profile = {
      name: form.name,
      email: form.email,
      role: form.role,
      active: form.active,
      weeklyTargetHours: Number(form.weeklyTargetHours) || DEFAULT_WEEKLY_HOURS,
      yearlyVacationDays: Number(form.yearlyVacationDays) || DEFAULT_VACATION_DAYS,
      appStartDate: form.appStartDate || null,
      initialOvertime: Number(form.initialOvertime) || 0,
      workDays: form.workDays.length ? form.workDays : DEFAULT_WORK_DAYS,
    };
    try {
      if (editing) {
        await updateUserProfile(editing.uid, profile);
        toast.success(`${form.name} aktualisiert`);
        cancelEdit();
      } else {
        const res = await provisionUser(user.companyId, profile);
        if (res.mailSent) {
          toast.success(`${form.name} angelegt — Passwort-Mail versendet`);
        } else {
          toast.success(`${form.name} angelegt`);
          setHandoverPassword({ name: form.name, pw: res.tempPassword });
        }
        setForm(emptyForm());
        setShowDetails(false);
      }
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('email-already-in-use')
          ? 'Diese E-Mail ist bereits vergeben.'
          : editing
            ? 'Die Änderungen konnten nicht gespeichert werden.'
            : 'Der Benutzer konnte nicht angelegt werden.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendReset(u: AppUser) {
    try {
      await resendPasswordReset(u.email);
      toast.success(`Passwort-Mail an ${u.email} gesendet`);
    } catch {
      toast.error('Die Passwort-Mail konnte nicht gesendet werden.');
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Benutzerverwaltung" subtitle="Benutzer anlegen, Rollen und Zeitkonten pflegen" />

      {/* Mobil zweispaltig: bei drei Spalten wurden längere Beschriftungen
          wie "Im Außendienst" abgeschnitten. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Metric label="Benutzer" icon="users" value={stats.total} />
        <Metric label="Aktiv" icon="chart" value={stats.active} />
        <Metric label="Im Außendienst" icon="building" value={stats.field} />
      </div>

      {handoverPassword && (
        <div className="rounded border border-warning/30 bg-warning-bg p-4 text-warning" role="alert">
          <p className="font-semibold">Willkommens-Mail konnte nicht gesendet werden</p>
          <p className="mt-1 text-sm">
            Bitte {handoverPassword.name} dieses Startpasswort persönlich weitergeben. Es wird
            nur jetzt angezeigt:
          </p>
          <p className="mt-2 select-all tnum text-lg font-semibold">{handoverPassword.pw}</p>
          <Button variant="ghost" className="mt-2" onClick={() => setHandoverPassword(null)}>
            Verstanden
          </Button>
        </div>
      )}

      <Card title={editing ? `${editing.name} bearbeiten` : 'Neuen Benutzer anlegen'}>
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField id="uname" label="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <InputField id="uemail" label="E-Mail" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required disabled={!!editing}
              title={editing ? 'Die E-Mail-Adresse ist das Anmeldekonto und kann hier nicht geändert werden.' : undefined} />
            <SelectField id="urole" label="Rolle" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {/* Die Rolle Administrator vergibt nur ein Administrator.
                  Sonst koennte sich eine Geschaeftsfuehrung selbst zum
                  Superuser machen. Dieselbe Grenze steht in firestore.rules —
                  hier wird sie nur sichtbar gemacht. */}
              {ROLES.filter((r) => r !== 'Administrator' || canManageAdmins(user.role)).map(
                (r) => <option key={r} value={r}>{r}</option>,
              )}
            </SelectField>
            <SelectField id="uactive" label="Status" value={form.active ? 'aktiv' : 'inaktiv'}
              onChange={(e) => setForm({ ...form, active: e.target.value === 'aktiv' })}>
              <option value="aktiv">Aktiv</option>
              <option value="inaktiv">Deaktiviert</option>
            </SelectField>
          </FormGrid>

          {/* Zeitkonto-Details sind vorbelegt — für den Normalfall reicht oben. */}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="min-h-touch text-sm font-medium text-brand underline"
          >
            {showDetails ? 'Zeitkonto-Einstellungen ausblenden' : 'Zeitkonto-Einstellungen anzeigen'}
          </button>

          {showDetails && (
            <div className="space-y-4 rounded border border-line bg-surface-2 p-4">
              <FormGrid>
                <InputField id="uhours" label="Wochenstunden" type="number" step="0.5" min="0"
                  value={form.weeklyTargetHours}
                  onChange={(e) => setForm({ ...form, weeklyTargetHours: e.target.value })} />
                <InputField id="uvac" label="Urlaubstage pro Jahr" type="number" min="0"
                  value={form.yearlyVacationDays}
                  onChange={(e) => setForm({ ...form, yearlyVacationDays: e.target.value })} />
                <InputField id="ustart" label="Saldo-Startdatum" type="date"
                  value={form.appStartDate}
                  onChange={(e) => setForm({ ...form, appStartDate: e.target.value })} />
                <InputField id="uinit" label="Start-Saldo (Stunden)" type="number" step="0.25"
                  value={form.initialOvertime}
                  onChange={(e) => setForm({ ...form, initialOvertime: e.target.value })} />
              </FormGrid>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">Arbeitstage</legend>
                <div className="flex flex-wrap gap-x-4">
                  {WEEKDAYS.map((d) => (
                    <CheckboxField
                      key={d.value}
                      id={`wd-${d.value}`}
                      label={d.label}
                      checked={form.workDays.includes(d.value)}
                      onChange={() => toggleWorkday(d.value)}
                    />
                  ))}
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  Bestimmt das Tagessoll: Wochenstunden geteilt durch Arbeitstage.
                </p>
              </fieldset>
            </div>
          )}

          {error && <ErrorState message={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editing ? 'Änderungen speichern' : 'Benutzer anlegen'}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={cancelEdit} className="w-full sm:w-auto">
                Abbrechen
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Benutzer">
        {loading ? <SkeletonList rows={4} /> : sorted.length === 0 ? (
          <EmptyState>
            Noch keine Benutzer. Lege oben den ersten Mitarbeiter an — Name,
            E-Mail und Rolle genügen.
          </EmptyState>
        ) : (
          <List>
            {sorted.map((u) => (
              <ListRow
                key={u.uid}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {u.name}
                    <RoleBadge role={u.role} />
                    {u.active === false && <Badge tone="gray">inaktiv</Badge>}
                  </span>
                }
                subtitle={u.email}
              >
                {/* Ein Administrator laesst sich nur von einem Administrator
                    anfassen — sonst koennte die Geschaeftsfuehrung den letzten
                    Superuser deaktivieren und sich selbst aussperren. */}
                {u.role === 'Administrator' && !canManageAdmins(user.role) ? (
                  <span className="text-sm text-ink-muted">nur durch Administrator</span>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => startEdit(u)}>Bearbeiten</Button>
                    <Button variant="ghost" onClick={() => void sendReset(u)}>Passwort-Mail</Button>
                    {u.uid !== user.uid && (
                      <Button variant="ghost" onClick={() => setToToggle(u)}>
                        {u.active === false ? 'Aktivieren' : 'Deaktivieren'}
                      </Button>
                    )}
                  </>
                )}
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      {/* Bewusst kein Löschen: Zeiteinträge, Bestellungen und Einsätze
          verweisen auf die uid und würden verwaisen. Deaktivieren sperrt die
          Anmeldung und blendet den Nutzer aus Auswertungen aus. */}
      <ConfirmDialog
        open={!!toToggle}
        title={toToggle?.active === false ? 'Benutzer aktivieren?' : 'Benutzer deaktivieren?'}
        message={
          toToggle
            ? toToggle.active === false
              ? `${toToggle.name} kann sich danach wieder anmelden.`
              : `${toToggle.name} kann sich danach nicht mehr anmelden. Alle bisherigen Zeiteinträge bleiben erhalten.`
            : ''
        }
        onCancel={() => setToToggle(null)}
        onConfirm={async () => {
          if (toToggle) {
            const next = toToggle.active === false;
            await updateUserProfile(toToggle.uid, { active: next });
            await reload();
            toast.success(next ? 'Benutzer aktiviert' : 'Benutzer deaktiviert');
          }
          setToToggle(null);
        }}
      />
    </div>
  );
}
