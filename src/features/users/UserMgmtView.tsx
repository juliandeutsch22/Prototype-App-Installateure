import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listUsers } from '@/lib/db/users';
import { provisionUser } from '@/lib/auth/provisionUser';
import { ROLES, type AppUser, type Role } from '@/types';
import { canManageAdmins } from '@/lib/permissions';
import Card from '@/components/Card';
import Meldung from '@/components/Meldung';
import Button from '@/components/Button';
import Aktionsleiste from '@/components/Aktionsleiste';
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
  WEEKDAYS, leererEntwurf, alsProfil, aliquoterAnspruch, zahlOderVorgabe,
  type BenutzerEntwurf, type Eintrittsart,
} from './benutzerEntwurf';
import { DEFAULT_VACATION_DAYS } from '@/lib/db/benutzerVorgaben';
import { JAHRESBEGINN_VORGABE } from '@/lib/time';
import { benutzernameFehler, kontoAnzeige, kunstadresse } from '@shared/benutzername';
import { AB_TABELLE, useAbBreite } from '@/lib/useAbBreite';


/** Benutzerverwaltung (GF/Admin): anlegen, Stammdaten und Rollen pflegen. */
export default function UserMgmtView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BenutzerEntwurf>(leererEntwurf);
  const [saving, setSaving] = useState(false);
  /*
    LISTE ZUERST — gemessen: am Telefon begann die Benutzerliste bei 932 px.
    Das ist der kürzeste Weg der vier Ansichten und trotzdem eineinhalb
    Bildschirme; angelegt wird ein Benutzer ein paarmal im Jahr, nachgesehen
    wird er dauernd. Dasselbe Muster wie in `WartungenView`.
  */
  const [formOffen, setFormOffen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  /*
    TRITT DIE PERSON EIN, ODER IST SIE SCHON DA?

    Zwei verschiedene Sachverhalte, die bis zum 20.09.2026 dieselben drei
    Felder bekamen — und deren Vorbelegung nur für einen der beiden stimmte.
    `bestand` ist die Vorgabe: es ist der Fall beim Einrichten, und es ist
    genau das Verhalten von vorher.
  */
  const [eintritt, setEintritt] = useState<Eintrittsart>('bestand');
  const [suche, setSuche] = useState('');
  const [status, setStatus] = useState<'aktiv' | 'inaktiv' | 'alle'>('aktiv');
  /**
   * Der aliquote Vorschlag für einen Neueintritt.
   *
   * Als Funktion und nicht als abgeleiteter Wert: er wird an drei Stellen
   * gebraucht (beim Umschalten, beim Ändern des Eintrittsdatums und beim
   * Ändern des Jahresanspruchs), und an allen dreien mit FRISCHEN Werten —
   * der Zustand von React ist im selben Durchlauf noch der alte.
   */
  const jahresbeginn = company?.urlaubJahresbeginn ?? JAHRESBEGINN_VORGABE;
  const vorschlag = (datum: string, jahresTage: string) =>
    aliquoterAnspruch(
      zahlOderVorgabe(jahresTage, DEFAULT_VACATION_DAYS),
      datum,
      jahresbeginn,
    );

  /** Initialpasswort, falls die Willkommens-Mail nicht zugestellt werden konnte. */
  const [handoverPassword, setHandoverPassword] = useState<
    { name: string; pw: string; benutzername?: string } | null
  >(null);
  /*
    WOMIT SICH DIE PERSON ANMELDET. Neben dem Entwurf und nicht darin: die
    Akte kennt nur das fertige Konto, und `gleich()` soll dort nichts
    vergleichen, was sich nicht ändern lässt.
  */
  const [anmeldung, setAnmeldung] = useState<'email' | 'benutzername'>('email');
  const [benutzername, setBenutzername] = useState('');
  /*
    AM SCHREIBTISCH EINE TABELLE, am Telefon die Liste — genau eine Form im
    DOM (siehe `useAbBreite`). Dieselben Gruppen in derselben Reihenfolge,
    derselbe Weg in die Akte; nur stehen Name und Anmeldung nebeneinander
    statt untereinander, und „Akte" steht nicht allein am rechten Rand.
  */
  const schreibtisch = useAbBreite(AB_TABELLE);

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
        (!q || u.name.toLowerCase().includes(q)
          || kontoAnzeige(u.email).toLowerCase().includes(q)) &&
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
    if (anmeldung === 'benutzername') {
      // Dieselbe Prüfung wie in der Edge Function — hier nur früher gesagt.
      const warum = benutzernameFehler(benutzername);
      if (warum) {
        setError(warum);
        setSaving(false);
        return;
      }
      profile.email = kunstadresse(benutzername);
    }
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
        setHandoverPassword({
          name: form.name,
          pw: res.tempPassword,
          benutzername: res.benutzerkonto ? kontoAnzeige(profile.email) : undefined,
        });
      }
      setForm(leererEntwurf());
      setAnmeldung('email');
      setBenutzername('');
      setEintritt('bestand');
      setShowDetails(false);
      setFormOffen(false);
      await reload();
    } catch (err) {
      setError(anlegeFehler(err, false));
    } finally {
      setSaving(false);
    }
  }

  /*
    EIN WEG STATT DREI. Hier standen „Bearbeiten" (sprang in das Anlege-
    Formular ganz oben, wo die Zeitkonto-Felder erst noch aufzuklappen waren)
    und ein Zeilenmenü mit Passwort-Mail und Sperren. Alles drei steht jetzt
    in der Akte — und die hat eine Adresse, auf die sich verweisen lässt.

    Auch für einen Administrator, den die aufrufende Rolle nicht ändern darf
    (sonst könnte die Geschäftsführung den letzten Superuser deaktivieren und
    sich selbst aussperren): ANSEHEN darf sie ihn, und die Akte sagt dort,
    warum nichts zu ändern ist. Ein „nur durch Administrator" ohne Weg dorthin
    war eine Sackgasse. Einmal geschrieben, in Liste und Tabelle derselbe.
  */
  const akteLink = (u: AppUser) => (
    <Link to={`/user-mgmt/${u.uid}`} className="textlink-allein px-2">
      Akte
    </Link>
  );

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benutzerverwaltung"
        subtitle="Benutzer anlegen, Rollen und Zeitkonten pflegen"
        action={
          formOffen ? undefined : (
            <Button onClick={() => setFormOffen(true)}>Neuer Benutzer</Button>
          )
        }
      />

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
        <Meldung
          ton="warnung"
          role="alert"
          titel={
            handoverPassword.benutzername
              ? `Zugangsdaten für ${handoverPassword.name}`
              : 'Willkommens-Mail konnte nicht gesendet werden'
          }
        >
          <p>
            Bitte {handoverPassword.name} dieses Startpasswort persönlich weitergeben. Es wird
            nur jetzt angezeigt
            {handoverPassword.benutzername
              ? ' — beim ersten Anmelden vergibt die Person ein eigenes:'
              : ':'}
          </p>
          {handoverPassword.benutzername && (
            <p className="mt-2 text-ink">
              Benutzername:{' '}
              <span className="select-all font-semibold">{handoverPassword.benutzername}</span>
            </p>
          )}
          <p data-testid="startpasswort" className="mt-2 select-all text-lg font-semibold">{handoverPassword.pw}</p>
          <Button variant="ghost" className="mt-2" onClick={() => setHandoverPassword(null)}>
            Verstanden
          </Button>
        </Meldung>
      )}

      {/*
        DER FEHLER STEHT AUSSERHALB DES FORMULARS, und das ist eine Korrektur.

        `error` trägt ZWEI Dinge: das gescheiterte Laden der Liste (Zeile 55)
        und das gescheiterte Anlegen. Angezeigt wurde er nur INNEN — solange
        das Formular immer offen stand, fiel das nicht auf. Mit dem
        zugeklappten Formular wäre ein Ladefehler unsichtbar geworden: die
        Liste bliebe leer und niemand erführe, warum.

        Gefunden hat das `UserMgmtView.test.tsx`, nicht das Nachdenken.
      */}
      {error && <ErrorState message={error} />}

      {formOffen && (
      <Card title="Neuen Benutzer anlegen">
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField id="uname" label="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required pflicht />
            <SelectField id="uanmeldung" label="Anmeldung mit" value={anmeldung}
              onChange={(e) => setAnmeldung(e.target.value as 'email' | 'benutzername')}>
              <option value="email">E-Mail-Adresse</option>
              <option value="benutzername">Benutzername</option>
            </SelectField>
            {anmeldung === 'email' ? (
              <InputField id="uemail" label="E-Mail" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required pflicht />
            ) : (
              <div className="flex flex-col gap-1">
                {/*
                  KLEIN GESCHRIEBEN BEIM TIPPEN, nicht erst beim Speichern:
                  was hier steht, ist genau das, was der Monteur später
                  eintippt — und das soll er so auch weitergesagt bekommen.
                */}
                <InputField id="ubenutzername" label="Benutzername" value={benutzername}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  placeholder="z. B. manfred.huber"
                  onChange={(e) => setBenutzername(e.target.value.toLowerCase().trim())}
                  required pflicht />
                <p className="flex flex-wrap items-center text-xs text-ink-muted">
                  Ohne E-Mail: das Startpasswort gibst du persönlich weiter.
                  <InfoHint about="Benutzername">
                    Erlaubt sind Kleinbuchstaben a–z, Ziffern, Punkt, Bindestrich und
                    Unterstrich, 3 bis 40 Zeichen — also „ue" statt „ü". Der Name gilt über
                    alle Betriebe in Senklot; ist er schon vergeben, einfach einen anderen
                    wählen. Ein vergessenes Passwort lässt sich nicht per Mail zurücksetzen:
                    Geschäftsführung oder Administration vergeben in der Benutzerakte ein
                    neues Startpasswort. Nachträglich auf E-Mail umstellen geht nicht.
                  </InfoHint>
                </p>
              </div>
            )}
            <SelectField id="urole" label="Rolle" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {/* Die Rolle Administrator vergibt nur ein Administrator.
                  Sonst koennte sich eine Geschaeftsfuehrung selbst zum
                  Superuser machen. Dieselbe Grenze steht im Trigger
                  `users_adminrolle` — hier wird sie nur sichtbar gemacht. */}
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
          {/*
            DIE WAHL STEHT AUSSERHALB DES AUFKLAPPERS, und das ist der Punkt.

            Die Zeitkonto-Felder sind eingeklappt — wer sie nie öffnet, bekam
            bisher stillschweigend die Vorbelegung. Für einen Bestandsmitarbeiter
            ist das richtig; für einen Neueintritt bedeutete es den VOLLEN
            Jahresanspruch ab Tag eins. Wer am 1. Oktober anfängt, hatte damit
            25 Tage statt rund sechs, und es fiel erst auf, wenn er Urlaub
            einreicht, den er nicht hat. Die Frage muss deshalb gestellt
            werden, bevor jemand entscheidet, ob er aufklappt.
          */}
          <fieldset className="kasten">
            <legend className="section-label px-1">Was für ein Zugang ist das?</legend>
            <div className="flex flex-col gap-2">
              <label className="flex min-h-touch items-start gap-3 py-1">
                <input
                  type="radio"
                  name="eintritt"
                  id="eintritt-bestand"
                  className="auswahlpunkt mt-1"
                  checked={eintritt === 'bestand'}
                  onChange={() => {
                    setEintritt('bestand');
                    // Zurück auf die Vorbelegung: „nicht angegeben" heisst beim
                    // Umstieg voller Jahresanspruch, und das ist hier richtig.
                    setForm((f) => ({ ...f, initialVacationDays: '', initialOvertime: '0' }));
                  }}
                />
                <span className="text-sm">
                  <strong className="text-ink">Arbeitet schon im Betrieb</strong>
                  <span className="mt-1 block text-ink-muted">
                    Der Umstieg auf Senklot. Resturlaub und Überstundensaldo bringt die Person
                    mit — die App kann beides nicht wissen und fragt danach.
                  </span>
                </span>
              </label>
              <label className="flex min-h-touch items-start gap-3 py-1">
                <input
                  type="radio"
                  name="eintritt"
                  id="eintritt-neu"
                  className="auswahlpunkt mt-1"
                  checked={eintritt === 'neu'}
                  onChange={() => {
                    setEintritt('neu');
                    setForm((f) => ({
                      ...f,
                      initialOvertime: '0',
                      initialVacationDays: String(
                        vorschlag(f.appStartDate, f.yearlyVacationDays).tage,
                      ),
                    }));
                  }}
                />
                <span className="text-sm">
                  <strong className="text-ink">Tritt neu ein</strong>
                  <span className="mt-1 block text-ink-muted">
                    Bringt nichts mit. Für das angebrochene erste Urlaubsjahr schlägt die App
                    den aliquoten Anspruch vor.
                  </span>
                </span>
              </label>
            </div>

            {eintritt === 'neu' && (
              <div className="mt-3">
                <Meldung>
                  Vorschlag für {form.appStartDate || 'das Eintrittsdatum'}:{' '}
                  <strong className="text-ink">
                    {vorschlag(form.appStartDate, form.yearlyVacationDays).tage}
                  </strong>{' '}
                  Tage —{' '}
                  {zahlOderVorgabe(form.yearlyVacationDays, DEFAULT_VACATION_DAYS)} ×{' '}
                  {vorschlag(form.appStartDate, form.yearlyVacationDays).monate} von 12 Monaten.{' '}
                  <strong className="text-ink">Änderbar:</strong> ob im ersten Arbeitsjahr aliquot
                  oder nach sechs Monaten voll gerechnet wird, entscheidet der Kollektivvertrag —
                  nicht diese App.
                </Meldung>
              </div>
            )}
          </fieldset>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="textlink-allein"
          >
            {showDetails ? 'Zeitkonto-Einstellungen ausblenden' : 'Zeitkonto-Einstellungen anzeigen'}
          </button>

          {showDetails && (
            <div className="kasten space-y-4">
              <FormGrid>
                <InputField id="uhours" label="Wochenstunden" type="number" step="0.5" min="0"
                  value={form.weeklyTargetHours}
                  onChange={(e) => setForm({ ...form, weeklyTargetHours: e.target.value })} />
                <InputField id="uvac" label="Urlaubstage pro Jahr" type="number" min="0"
                  value={form.yearlyVacationDays}
                  onChange={(e) => {
                    const jahresTage = e.target.value;
                    setForm((f) => ({
                      ...f,
                      yearlyVacationDays: jahresTage,
                      // Der Vorschlag hängt am Jahresanspruch — ihn stehen zu
                      // lassen hiesse, eine Zahl aus einer alten Rechnung zu
                      // zeigen.
                      ...(eintritt === 'neu'
                        ? { initialVacationDays: String(vorschlag(f.appStartDate, jahresTage).tage) }
                        : {}),
                    }));
                  }} />
                <InputField
                  id="ustart"
                  label={eintritt === 'neu' ? 'Eintrittsdatum' : 'Saldo-Startdatum'}
                  type="date"
                  value={form.appStartDate}
                  onChange={(e) => {
                    const datum = e.target.value;
                    setForm((f) => ({
                      ...f,
                      appStartDate: datum,
                      ...(eintritt === 'neu'
                        ? { initialVacationDays: String(vorschlag(datum, f.yearlyVacationDays).tage) }
                        : {}),
                    }));
                  }} />
                {/*
                  KEIN STARTSALDO BEIM NEUEINTRITT. Wer eintritt, bringt keine
                  Überstunden mit — ein Feld, in das nur eine 0 gehört, ist
                  eine Gelegenheit für einen Tippfehler und sonst nichts.
                */}
                {eintritt === 'bestand' && (
                  <InputField id="uinit" label="Start-Saldo (Stunden)" type="number" step="0.25"
                    value={form.initialOvertime}
                    onChange={(e) => setForm({ ...form, initialOvertime: e.target.value })} />
                )}
                {/*
                  ZWEI NACHKOMMASTELLEN, NICHT HALBE TAGE. Hier stand
                  `step="0.5"` — und der eigene Vorschlag der App verstösst
                  dagegen: 25 × 4/12 sind 8,33 Tage. Solange der Aufklapper zu
                  ist, steht das Feld nicht im Formular und der Browser prüft
                  es nicht; wer ihn öffnete, bekam eine Maske, die den von ihr
                  selbst vorgeschlagenen Wert abwies.
                */}
                <InputField
                  id="uvacinit"
                  label={
                    eintritt === 'neu'
                      ? 'Urlaub im ersten Jahr (Tage)'
                      : 'Resturlaub beim Umstieg (Tage)'
                  }
                  type="number"
                  step="0.01"
                  placeholder={eintritt === 'neu' ? '' : 'leer = voller Jahresanspruch'}
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
                    hat, trägt hier <span>7</span> ein — sonst zeigt die App
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
          {/* Mit aufgeklapptem Zeitkonto läuft das Formular am Telefon über
              mehr als einen Bildschirm — die Leiste hält „Benutzer anlegen"
              in Reichweite. Dieselben Knöpfe in derselben Reihenfolge. */}
          <Aktionsleiste>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              Benutzer anlegen
            </Button>
            {/* Der Weg zurück zur Liste. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFormOffen(false);
                setForm(leererEntwurf());
                setAnmeldung('email');
                setBenutzername('');
              }}
              className="w-full sm:w-auto"
            >
              Abbrechen
            </Button>
          </Aktionsleiste>
        </form>
      </Card>
      )}

      <Card
        title={`Benutzer (${gefiltert.length})`}
        action={
          <SelectField
            id="usrstatus"
            label=""
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
              placeholder="Name, E-Mail oder Benutzername"
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
        ) : schreibtisch ? (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead className="tabelle-kopfzeile">
                <tr>
                  <th className="tabelle-kopf">Name</th>
                  <th className="tabelle-kopf">Anmeldung</th>
                  <th className="tabelle-kopf-zahl">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              {/* Je Rolle ein eigener Zeilenblock mit Kopf — dieselbe
                  Gruppierung wie in der Liste, wie bei den Anforderungen. */}
              {gruppen.map((g) => (
                <tbody key={g.rolle}>
                  <tr>
                    <th colSpan={3} scope="rowgroup" className="tabelle-gruppe">
                      <h3 className="section-label flex items-center justify-between">
                        <span>{g.rolle}</span>
                        <span className="font-normal text-ink-muted">{g.leute.length}</span>
                      </h3>
                    </th>
                  </tr>
                  {g.leute.map((u) => (
                    <tr key={u.uid} className="tabelle-zeile">
                      <td className="tabelle-name">
                        <span className="tabelle-marken">
                          {u.name}
                          {u.active === false && <Marke>inaktiv</Marke>}
                        </span>
                      </td>
                      <td className="tabelle-zelle">{kontoAnzeige(u.email)}</td>
                      <td className="tabelle-aktionen">
                        <div className="tabelle-knoepfe">{akteLink(u)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            {gruppen.map((g) => (
              <div key={g.rolle}>
                <h3 className="section-label mb-1 flex items-center justify-between">
                  <span>{g.rolle}</span>
                  <span className="font-normal text-ink-muted">{g.leute.length}</span>
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
                subtitle={kontoAnzeige(u.email)}
              >
                {akteLink(u)}
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
