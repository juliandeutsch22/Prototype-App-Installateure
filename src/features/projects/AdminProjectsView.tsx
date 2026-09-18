import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeRecentProjects,
  createProject,
  deleteProject,
  findProjectsByNumber,
  searchProjects,
} from '@/lib/db/projects';
import { nutztPostgres } from '@/lib/db/quelle';
import { deuteBaustellenSuche, baustellenSuchHinweis } from './baustellenSuche';
import { listUsers } from '@/lib/db/users';
import { listCustomers } from '@/lib/db/customers';
import { useModul } from '@/lib/useModule';
import type { WithId } from '@/lib/db/core';
import { byNewest } from '@/lib/timestamps';
import type { Project, AppUser, Customer } from '@/types';
import Card from '@/components/Card';
import KundenGrenze from '@/components/AuswahlGrenze';
import Nachladen from '@/components/Nachladen';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import { Marke } from '@/components/Badge';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, FormGrid, Pflichthinweis } from '@/components/Field';
import PersonPicker from '@/components/PersonPicker';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';

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
  /*
    WIE WEIT DIE LISTE REICHT — und dass sie es sagt.

    Sie holte fest die jüngsten 300 und schwieg dazu. Ab der 301. Baustelle
    fielen die ÄLTESTEN heraus, ohne dass irgendwo etwas stand: die Baustelle
    von vor drei Jahren war in der Verwaltung schlicht nicht mehr auffindbar,
    und nichts unterschied das von „gibt es nicht".

    Genau diese Fehlerform hat „Sichtbare Grenzen" überall herausgenommen —
    hier wurde sie übersehen, weil die Ansicht ein LIVE-ABO verwendet und
    damit nicht ins Muster der einmal ladenden Listen passte.

    Buchen war davon nie betroffen: die Baustellenauswahl hängt an
    `listActiveProjects` und kennt keine Grenze. Betroffen war die
    Verwaltung — dort, wo jemand gezielt nachschlägt.
  */
  const [grenze, setGrenze] = useState(BAUSTELLEN_JE_SEITE);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [kunden, setKunden] = useState<(Customer & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Baustellenliste steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Project> | null>(null);
  /**
   * Ein Tiefenlink auf eine Baustelle setzt Suche UND Filter.
   *
   * Der Filter gehört dazu: die Liste zeigt sonst nur offene Baustellen, und
   * ein Link aus der Kundenakte auf einen abgeschlossenen Auftrag liefe ins
   * Leere — mit der Suche im Feld und der Meldung, dass nichts passt. Genau
   * die Art von Sackgasse, die wie ein Fehler aussieht.
   */
  const [suchparameter] = useSearchParams();
  // Der Schein-Verweis verschwindet mit seinem Modul.
  const scheineAn = useModul('scheine');
  const gesuchteBaustelle = suchparameter.get('baustelle') ?? '';
  const [filter, setFilter] = useState<'offen' | 'alle' | 'archiv'>(
    gesuchteBaustelle ? 'alle' : 'offen',
  );
  const [suche, setSuche] = useState(gesuchteBaustelle);

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
    // Ohne Hinweis blieben Team- und Kundenauswahl einfach leer, und die
    // Baustelle liesse sich anlegen — ohne Kunden, ohne Mannschaft.
    listUsers(user.companyId).then(setUsers).catch(() => setNebenFehler('Die Belegschaft'));
    listCustomers(user.companyId).then(setKunden).catch(() => setNebenFehler('Die Kunden'));
    const unsub = subscribeRecentProjects(
      user.companyId,
      grenze,
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
    // Die Grenze gehört in die Abhängigkeiten: ein Abo trägt sie in sich,
    // eine neue Grenze heisst also ein neues Abo.
  }, [user, grenze]);

  /*
    DIESES FORMULAR LEGT NUR NOCH AN. Geändert wird in der Akte der
    Baustelle (`/admin-projects/:id`) — dort, wo die Baustelle auch steht. Vorher
    sprang „Bearbeiten" hierher nach oben, und wer fertig war, suchte die
    Baustelle in der Liste wieder.
  */
  function reset() {
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
      await createProject(user.companyId, data);
      reset();
      toast.success('Baustelle angelegt');
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
  /**
   * Was der Suchbegriff meint. Eine Baustellennummer geht auf den Server und
   * findet damit auch, was ausserhalb der geladenen Liste liegt; alles andere
   * bleibt eine Suche im Geladenen. Warum diese Trennung und keine
   * Volltextsuche: siehe `baustellenSuche.ts`.
   */
  const absicht = useMemo(() => deuteBaustellenSuche(suche), [suche]);

  const [serverTreffer, setServerTreffer] = useState<WithId<Project>[]>([]);

  /*
    UNTER POSTGRES GEHT JEDE EINGABE AN DEN SERVER, nicht nur eine Nummer.

    Die Einschränkung auf Nummern war eine Notlösung: Firestore kann nur
    Anfänge einer sortierten Spalte vergleichen, also war „B-2026-0042"
    findbar und „Seestraße" nicht. Postgres sucht über Nummer, Kunde und
    Adresse, und auch mitten im Wort.

    `deuteBaustellenSuche` bleibt für die Firestore-Seite stehen und
    verschwindet mit ihr in Stufe 9 — solange beide laufen, muss jede das
    Beste können, was sie kann.

    DIE VERZÖGERUNG IST KEIN FEINSCHLIFF. Zwischen zwei Anschlägen liegen
    Millisekunden, eine Abfrage dauert länger; ohne sie stünden zwanzig
    gleichzeitig in der Leitung und die Antworten kämen in beliebiger
    Reihenfolge zurück.
  */
  useEffect(() => {
    if (!user) {
      setServerTreffer([]);
      return;
    }
    const begriff = suche.trim();
    const nummernweg = !nutztPostgres();
    if (nummernweg ? absicht.art !== 'nummer' : begriff === '') {
      setServerTreffer([]);
      return;
    }

    let verworfen = false;
    const formen = absicht.art === 'nummer' ? absicht.formen : [];
    const verzoegert = setTimeout(() => {
      void (nummernweg
        ? findProjectsByNumber(user.companyId, formen)
        : searchProjects(user.companyId, begriff))
        .then((gefunden) => {
          if (!verworfen) setServerTreffer(gefunden);
        })
        /*
          Ein Fehlschlag laesst die oertliche Suche stehen, statt die Liste zu
          leeren: was geladen ist, ist deshalb nicht falsch. Gemeldet wird er
          trotzdem — unten steht dann, dass ueber die Nummer nichts dazukam.
        */
        .catch(() => {
          if (!verworfen) setServerTreffer([]);
        });
    }, nummernweg ? 0 : 300);

    return () => {
      verworfen = true;
      clearTimeout(verzoegert);
    };
  }, [user, absicht, suche]);

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
    const oertlich = nachStatus.filter((p) =>
      [p.customerName, p.projectNumber, p.address].some((v) => v?.toLowerCase().includes(q)),
    );

    /*
      DER SERVERTREFFER GEHT AM STATUSFILTER VORBEI.

      Wer eine Nummer eintippt, meint genau diese Baustelle. Sie wegen „Aktiv
      & pausiert" zu verschweigen waere wieder das leere Ergebnis, das wie ein
      Befund aussieht — und abgeschlossen ist die gesuchte alte Baustelle
      fast immer.
    */
    const bekannt = new Set(oertlich.map((p) => p.id));
    return [...oertlich, ...serverTreffer.filter((p) => !bekannt.has(p.id))];
  }, [sorted, filter, suche, serverTreffer]);

  /** Wie viele Treffer NUR vom Server kamen — das ist die Aussage, nicht die Summe. */
  const nurVomServer = useMemo(() => {
    // Unter Firestore kommen Servertreffer nur bei einer Nummer; unter
    // Postgres bei jeder Eingabe.
    if (!nutztPostgres() && absicht.art !== 'nummer') return 0;
    const geladen = new Set(sorted.map((p) => p.id));
    return serverTreffer.filter((p) => !geladen.has(p.id)).length;
  }, [absicht, serverTreffer, sorted]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Baustellen" subtitle="Baustellen anlegen und suchen — geändert wird in der Akte" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <Card title="Neue Baustelle">
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField id="pnr" label="Projektnummer" value={form.projectNumber}
              onChange={(e) => setForm({ ...form, projectNumber: e.target.value })} required pflicht />
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
              pflicht
            >
              <option value="">— wählen —</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </SelectField>
            <KundenGrenze kunden={kunden} />
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
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
              Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle
              niemanden. Die Verwaltung wird weiterhin verständigt.
            </p>
          )}
          <Pflichthinweis />
          {error && <ErrorState message={error} />}
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>Anlegen</Button>
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
            {/*
              WAS DIE SUCHE ERREICHT, BEVOR SIE ETWAS FINDET.

              Ohne diesen Satz sah eine Suche nach „Huber" ueber die Grenze
              hinaus genauso aus wie eine, die es wirklich nicht gibt: leer.
              Der Hinweis steht deshalb waehrend des Tippens da und nicht
              erst im Leerzustand.
            */}
            {suche.trim() && (
              <p className="mt-1 text-xs text-ink-muted">{baustellenSuchHinweis(absicht)}</p>
            )}
            {nurVomServer > 0 && (
              <p className="mt-1 text-xs text-ink">
                {nurVomServer === 1
                  ? 'Eine Baustelle ausserhalb der geladenen Liste gefunden.'
                  : `${nurVomServer} Baustellen ausserhalb der geladenen Liste gefunden.`}
              </p>
            )}
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
                  {p.estimatedHours ? <Marke>{p.estimatedHours} h Budget</Marke> : null}
                  <StatusBadge status={p.status} />
                  {/* Nachtraeglich einen Schein schreiben — der Fall, in dem
                      der Monteur ihn vor Ort vergessen hat. */}
                  {scheineAn && (
                    <Link
                      to={`/worksheet?projekt=${encodeURIComponent(p.projectNumber)}`}
                      className="flex min-h-touch items-center px-2 text-sm font-semibold text-brand underline"
                    >
                      Schein
                    </Link>
                  )}
                  {/*
                    EIN WEG STATT ZWEI. Hier standen „Übersicht" (klappte eine
                    Auswertung in die Liste) und „Bearbeiten" (sprang in das
                    Formular ganz oben). Beides steht jetzt in der Akte, und
                    die hat eine Adresse: sie lässt sich verlinken, als
                    Lesezeichen ablegen und kommt zurück, wohin man war.
                  */}
                  <Link
                    to={`/admin-projects/${p.id}`}
                    className="flex min-h-touch items-center px-2 text-sm font-semibold text-brand underline"
                  >
                    Akte
                  </Link>
                  <IconButton label="Baustelle löschen" tone="danger" onClick={() => setToDelete(p)}>
                    ✕
                  </IconButton>
                </ListRow>
              );
            })}
          </List>
        )}
        {/*
          Steht unter der Liste, nicht im Kopf: erst wer bis ans Ende gescrollt
          hat und nichts gefunden hat, braucht die Auskunft.

          Der Satz ist seither GENAUER: die Nummer geht auf den Server, Kunde
          und Adresse nicht. „Die Suche geht nur über diese" wäre jetzt falsch,
          und eine Auskunft, die einmal danebenlag, wird beim nächsten Mal
          nicht mehr geglaubt.
        */}
        <Nachladen
          geladen={projects.length}
          grenze={grenze}
          onMehr={() => setGrenze((g) => g + BAUSTELLEN_JE_SEITE)}
          einheit="Baustellen"
          sucheSatz="Nach Kunde und Adresse wird nur in diesen gesucht; eine Baustellennummer geht auf den Server."
        />
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
