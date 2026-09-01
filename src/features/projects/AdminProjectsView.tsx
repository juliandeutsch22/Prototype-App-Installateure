import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeRecentProjects, createProject, updateProject, deleteProject } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listCustomers } from '@/lib/db/customers';
import type { WithId } from '@/lib/db/core';
import { byNewest } from '@/lib/timestamps';
import type { Project, AppUser, Customer } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import Badge from '@/components/Badge';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import PersonPicker from '@/components/PersonPicker';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const empty = {
  projectNumber: '',
  customerId: '',
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
    customerId: p.customerId ?? '',
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
/**
 * Wie viele Baustellen die Verwaltungsliste laedt.
 *
 * Baustellen wachsen langsamer als Zeiteintraege, aber sie wachsen: bei
 * zweihundert Auftraegen im Jahr sind es nach zehn Jahren zweitausend.
 */
const BAUSTELLEN_JE_SEITE = 300;

export default function AdminProjectsView() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<WithId<Project>[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [kunden, setKunden] = useState<(Customer & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Project> | null>(null);
  const [filter, setFilter] = useState<'offen' | 'alle' | 'archiv'>('offen');
  const [suche, setSuche] = useState('');

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

  /**
   * Verantwortliche Projektleitung. Die Geschaeftsfuehrung steht mit zur
   * Wahl: in kleinen Betrieben faehrt sie selbst hinaus, und eine Baustelle
   * ohne Zustaendigen kann keine Eilzustellung melden.
   */
  const leads = useMemo(
    () =>
      users
        .filter(
          (u) =>
            ((u.role === 'Projektleiter' || u.role === 'Geschäftsführung') && u.active !== false) ||
            managers.includes(u.uid),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, managers],
  );

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch(() => undefined);
    listCustomers(user.companyId).then(setKunden).catch(() => undefined);
    const unsub = subscribeRecentProjects(
      user.companyId,
      BAUSTELLEN_JE_SEITE,
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
    setManagers(p.projectManagers ?? []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() {
    setEditId(null);
    setForm(empty);
    setAssigned([]);
    setManagers([]);
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
        projectManagers: managers,
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
    () => [...projects].sort((a, b) => byNewest(a, b)),
    [projects],
  );
  const archivCount = useMemo(
    () => projects.filter((p) => p.status === 'Abgeschlossen').length,
    [projects],
  );
  const visible = useMemo(() => {
    const nachStatus =
      filter === 'alle'
        ? sorted
        : filter === 'archiv'
          ? sorted.filter((p) => p.status === 'Abgeschlossen')
          : sorted.filter((p) => p.status !== 'Abgeschlossen');
    // Suche ueber Kunde, Nummer und Adresse: bei sechzig Baustellen ist die
    // Liste sonst nur noch scrollbar, nicht mehr benutzbar.
    const q = suche.trim().toLowerCase();
    if (!q) return nachStatus;
    return nachStatus.filter((p) =>
      [p.customerName, p.projectNumber, p.address].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [sorted, filter, suche]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Baustellen" subtitle="Projekte anlegen, bearbeiten und Mitarbeiter zuordnen" />

      <Card title={editId ? 'Baustelle bearbeiten' : 'Neue Baustelle'}>
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField id="pnr" label="Projektnummer" value={form.projectNumber}
              onChange={(e) => setForm({ ...form, projectNumber: e.target.value })} required />
            {/*
              Kunde AUSWÄHLEN statt tippen.
              Vorher war das ein freies Textfeld, und zwei Schreibweisen
              ergaben zwei Kunden — beide unvollständig. Ist ein Kunde noch
              nicht angelegt, führt der Hinweis darunter direkt dorthin;
              ihn hier nebenbei anzulegen würde die Stammdaten wieder
              verwässern.
            */}
            <SelectField
              id="pcust"
              label="Kunde"
              value={form.customerId}
              onChange={(e) => {
                const k = kunden.find((x) => x.id === e.target.value);
                setForm({
                  ...form,
                  customerId: e.target.value,
                  customerName: k?.name ?? form.customerName,
                });
              }}
              required
            >
              <option value="">— wählen —</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </SelectField>
            {/*
              Altbestand: die Baustelle trägt einen Kundennamen, aber noch
              keine Verknüpfung. Ohne diesen Hinweis stünde beim Bearbeiten
              nur „— wählen —", und niemand wüsste, welcher Kunde gemeint war.
            */}
            {!form.customerId && form.customerName && (
              <p className="text-sm text-warning sm:col-span-2">
                Bisher als Text hinterlegt: „{form.customerName}". Bitte den passenden Kunden
                wählen — oder in der{' '}
                <Link to="/customers" className="font-semibold underline">
                  Kundenverwaltung
                </Link>{' '}
                anlegen und die Baustellen übernehmen.
              </p>
            )}
            {kunden.length === 0 && (
              <p className="text-sm text-ink-muted sm:col-span-2">
                Noch keine Kunden angelegt.{' '}
                <Link to="/customers" className="font-semibold text-brand underline">
                  Zur Kundenverwaltung
                </Link>
              </p>
            )}
            {/* Ausdrücklich die BAUSTELLENadresse: die Rechnungsadresse steht
                beim Kunden, und eine Hausverwaltung hat zwanzig Baustellen. */}
            <InputField id="padr" label="Baustellenadresse" value={form.address}
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
            <InputField id="pcontact" label="Ansprechpartner vor Ort" value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            <InputField id="pphone" label="Telefon vor Ort" type="tel" value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </FormGrid>
          <InputField id="pdesc" label="Beschreibung / Auftragsumfang" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <PersonPicker
            legend="Zugeordnete Mitarbeiter"
            idPrefix="proj-emp"
            people={staff.map((u) => ({ uid: u.uid, name: u.name }))}
            selected={assigned}
            onChange={setAssigned}
            emptyHint="Keine aktiven Monteure vorhanden."
          />
          <PersonPicker
            legend="Verantwortliche Projektleitung"
            idPrefix="proj-lead"
            people={leads.map((u) => ({ uid: u.uid, name: u.name, hint: u.role }))}
            selected={managers}
            onChange={setManagers}
            emptyHint="Keine Projektleitung angelegt."
          />
          {/* Ohne Zustaendige laeuft eine Eilbestellung ins Leere — das gehoert
              beim Anlegen gesagt, nicht erst, wenn ein Monteur wartet. */}
          {managers.length === 0 && (
            <p className="rounded border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
              Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle
              niemanden. Die Verwaltung wird weiterhin verständigt.
            </p>
          )}
          {error && <ErrorState message={error} />}
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>{editId ? 'Speichern' : 'Anlegen'}</Button>
            {editId && <Button type="button" variant="secondary" onClick={reset}>Abbrechen</Button>}
          </div>
        </form>
      </Card>

      <Card
        title={`Alle Baustellen (${visible.length})`}
        action={
          <SelectField id="pfilter" label="" className="py-1 text-sm" value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="offen">Aktiv &amp; pausiert</option>
            <option value="alle">Alle</option>
            <option value="archiv">Archiv ({archivCount})</option>
          </SelectField>
        }
      >
        {projects.length >= 8 && (
          <div className="mb-4">
            <InputField
              id="psuche"
              label="Suche"
              type="search"
              placeholder="Kunde, Projektnummer oder Adresse"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>
        )}
        {loading ? <SkeletonList rows={4} /> : visible.length === 0 ? (
          <EmptyState>
            {projects.length === 0
              ? 'Noch keine Baustellen angelegt.'
              : suche
                ? `Keine Baustelle passt zu „${suche}".`
                : 'Keine Baustelle in dieser Auswahl.'}
          </EmptyState>
        ) : (
          <List>
            {visible.map((p) => {
              const namen = (uids: string[]) =>
                uids.map((uid) => users.find((u) => u.uid === uid)?.name).filter(Boolean);
              const team = namen(p.assignedEmployees ?? []);
              const leitung = namen(p.projectManagers ?? []);
              return (
                <ListRow
                  key={p.id}
                  title={
                    <span>
                      {p.customerName} <span className="tnum text-ink-muted">({p.projectNumber})</span>
                    </span>
                  }
                  subtitle={
                    <>
                      {/* Adresse und Nummer anklickbar: auch die Projektleitung
                          faehrt raus und ruft an — hier stand beides bisher
                          als toter Text. */}
                      <span className="flex flex-wrap items-center gap-x-3">
                        <AdresseLink adresse={p.address} />
                        <TelefonLink nummer={p.contactPhone} name={p.contactName} />
                      </span>
                      {team.length > 0 && (
                        <span className="mt-1 block text-xs text-ink-muted">
                          Team: {team.join(', ')}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-ink-muted">
                        {leitung.length > 0 ? (
                          <>Projektleitung: {leitung.join(', ')}</>
                        ) : (
                          <span className="text-warning">Keine Projektleitung zugeteilt</span>
                        )}
                      </span>
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
