import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { provisionUser } from '@/lib/auth/provisionUser';
import { ROLES, type AppUser, type Role } from '@/types';
import { canManageAdmins } from '@/lib/permissions';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import Metric, { MetricRow } from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField, FormGrid, Pflichthinweis } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { anlegeFehler } from './anlegeFehler';
import {
  WEEKDAYS, leererEntwurf, alsProfil, type BenutzerEntwurf,
} from './benutzerEntwurf';


/** Benutzerverwaltung (GF/Admin): anlegen, Stammdaten und Rollen pflegen. */
export default function UserMgmtView() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BenutzerEntwurf>(leererEntwurf);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [suche, setSuche] = useState('');
  const [status, setStatus] = useState<'aktiv' | 'inaktiv' | 'alle'>('aktiv');
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

  /**
   * Suche, Statusfilter und Gruppierung nach Rolle.
   *
   * Fuenfundzwanzig Namen in einer Liste sind keine Uebersicht: wer die
   * Buchhaltung sucht, liest zwanzig Monteure. Nach Rolle gruppiert steht
   * jeder dort, wo man ihn vermutet, und deaktivierte Konten lassen sich
   * ausblenden, statt zwischen den aktiven zu stehen.
   */
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return sorted.filter(
      (u) =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (status === 'alle' ||
          (status === 'aktiv' ? u.active !== false : u.active === false)),
    );
  }, [sorted, suche, status]);

  const gruppen = useMemo(
    () =>
      ROLES.map((r) => ({ rolle: r, leute: gefiltert.filter((u) => u.role === r) })).filter(
        (g) => g.leute.length > 0,
      ),
    [gefiltert],
  );
  const inaktiv = useMemo(() => users.filter((u) => u.active === false).length, [users]);
  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.active !== false).length,
      field: users.filter((u) => u.role === 'Mitarbeiter').length,
    }),
    [users],
  );

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
    /*
      Die Umrechnung steht in `benutzerEntwurf.ts` und nicht hier. Die Akte
      schreibt dieselben Felder; zwei Auslegungen von „leer" wären zwei
      verschiedene Wochenstunden für denselben Menschen.
    */
    const profile = alsProfil(form);
    try {
      /*
        DIESES FORMULAR LEGT NUR NOCH AN. Geändert wird in der Akte
        (`/user-mgmt/:uid`) — dort, wo die Person auch steht, und mit
        offenen Zeitkonto-Feldern statt eines zweiten Aufklappens.
      */
      const res = await provisionUser(user.companyId, profile);
      if (res.mailSent) {
        toast.success(`${form.name} angelegt — Passwort-Mail versendet`);
      } else {
        toast.success(`${form.name} angelegt`);
        setHandoverPassword({ name: form.name, pw: res.tempPassword });
      }
      setForm(leererEntwurf());
      setShowDetails(false);
      await reload();
    } catch (err) {
      setError(anlegeFehler(err, false));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Benutzerverwaltung" subtitle="Benutzer anlegen, Rollen und Zeitkonten pflegen" />

      {/*
        „Außendienst" statt „Im Außendienst": bei drei Kennzahlen nebeneinander
        bleiben auf 390 px rund 95 px je Beschriftung, und die längere wurde
        dort zu „IM AUSSENDI…" abgeschnitten. Die Leiste ist bewusst EINE
        Reihe (siehe Metric.tsx) — kürzer beschriften ist hier richtiger, als
        die Leiste für einen Sonderfall umzubauen.
      */}
      <MetricRow>
        <Metric label="Benutzer" value={stats.total} />
        <Metric label="Aktiv" value={stats.active} />
        <Metric label="Außendienst" value={stats.field} />
      </MetricRow>

      {handoverPassword && (
        <div className="rounded border border-line bg-surface-2 p-4 text-warning" role="alert">
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

      <Card title="Neuen Benutzer anlegen">
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField id="uname" label="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required pflicht />
            <InputField id="uemail" label="E-Mail" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required pflicht />
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
                <InputField
                  id="uvacinit"
                  label="Resturlaub beim Umstieg (Tage)"
                  type="number"
                  step="0.5"
                  placeholder="leer = voller Jahresanspruch"
                  value={form.initialVacationDays}
                  onChange={(e) => setForm({ ...form, initialVacationDays: e.target.value })} />
              </FormGrid>
              {/* Zwei Urlaubsfelder nebeneinander brauchen einen Satz dazu —
                  „pro Jahr" und „beim Umstieg" sehen sonst aus wie dasselbe. */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span>Warum es zwei Urlaubsfelder gibt</span>
                <InfoHint about="Resturlaub beim Umstieg">
                  <p>
                    <strong>Urlaubstage pro Jahr</strong> ist der Anspruch laut Vertrag. Danach
                    rechnet die App in jedem vollen Jahr.
                  </p>
                  <p className="mt-2">
                    <strong>Resturlaub beim Umstieg</strong> gilt nur für das Jahr, in dem der
                    Saldo startet. Wer im September umsteigt und schon 18 von 25 Tagen genommen
                    hat, trägt hier <span className="tnum">7</span> ein — sonst zeigt die App
                    weiterhin 25, weil die Tage davor in keiner Buchung stehen.
                  </p>
                  <p className="mt-2">
                    Leer lassen, wenn der Anspruch am Startdatum unangetastet war. Dann bleibt es
                    beim vollen Jahresanspruch.
                  </p>
                </InfoHint>
              </div>

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

          <Pflichthinweis />
          {error && <ErrorState message={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              Benutzer anlegen
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title={`Benutzer (${gefiltert.length})`}
        action={
          <SelectField
            id="usrstatus"
            label=""
            className="py-1 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="aktiv">Aktive</option>
            <option value="inaktiv">Inaktive ({inaktiv})</option>
            <option value="alle">Alle</option>
          </SelectField>
        }
      >
        {users.length >= 8 && (
          <div className="mb-4">
            <InputField
              id="usrsuche"
              label="Suche"
              type="search"
              placeholder="Name oder E-Mail"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>
        )}
        {loading ? <SkeletonList rows={4} /> : users.length === 0 ? (
          <EmptyState>
            Noch keine Benutzer. Lege oben den ersten Mitarbeiter an — Name,
            E-Mail und Rolle genügen.
          </EmptyState>
        ) : gefiltert.length === 0 ? (
          <EmptyState>
            {suche ? `Niemand passt zu „${suche}".` : 'Kein Benutzer in dieser Auswahl.'}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {gruppen.map((g) => (
              <div key={g.rolle}>
                <h3 className="section-label mb-1 flex items-center justify-between">
                  <span>{g.rolle}</span>
                  <span className="tnum font-normal text-ink-muted">{g.leute.length}</span>
                </h3>
                <List>
            {g.leute.map((u) => (
              <ListRow
                key={u.uid}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {u.name}
                    {/* Die Rolle steht bereits in der Gruppenueberschrift —
                        sie an jeder Zeile zu wiederholen ist Laerm. */}
                    {u.active === false && <Marke>inaktiv</Marke>}
                  </span>
                }
                subtitle={u.email}
              >
                {/* Ein Administrator laesst sich nur von einem Administrator
                    anfassen — sonst koennte die Geschaeftsfuehrung den letzten
                    Superuser deaktivieren und sich selbst aussperren. */}
                {/*
                  EIN WEG STATT DREI. Hier standen „Bearbeiten" (sprang in das
                  Anlege-Formular ganz oben, wo die Zeitkonto-Felder erst noch
                  aufzuklappen waren) und ein Zeilenmenü mit Passwort-Mail und
                  Sperren. Alles drei steht jetzt in der Akte — und die hat
                  eine Adresse, auf die sich verweisen lässt.

                  Auch für einen Administrator, den die aufrufende Rolle nicht
                  ändern darf: ANSEHEN darf sie ihn, und die Akte sagt dort,
                  warum nichts zu ändern ist. Ein „nur durch Administrator"
                  ohne Weg dorthin war eine Sackgasse.
                */}
                <Link
                  to={`/user-mgmt/${u.uid}`}
                  className="flex min-h-touch items-center px-2 text-sm font-semibold text-brand underline"
                >
                  Akte
                </Link>
              </ListRow>
            ))}
                </List>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}
