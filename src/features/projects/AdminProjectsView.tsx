import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import BetriebsurlaubHinweis from './BetriebsurlaubHinweis';
import {
  subscribeRecentProjects,
  createProject,
  deleteProject,
  searchProjects,
  reserveProjectNumber,
} from '@/lib/db/projects';
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
import StatusBadge from '@/components/StatusBadge';
import { AdresseLink, KontaktZeile, TelefonLink } from '@/components/Kontakt';
import PageHeader from '@/components/PageHeader';
import RowMenu from '@/components/RowMenu';
import { praefixeVon, belegNummer, hoechsteLfdImJahr } from '@/lib/praefixe';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, FormGrid, Pflichthinweis } from '@/components/Field';
import PersonPicker from '@/components/PersonPicker';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import Meldung from '@/components/Meldung';
import Aktionsleiste from '@/components/Aktionsleiste';
import { fmtStunden } from '@/lib/time';
import { AB_TABELLE, useAbBreite } from '@/lib/useAbBreite';
import { abgeschnitten } from '@/lib/listengrenzen';

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
  const { user, company } = useAuth();
  const navigate = useNavigate();
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
  /*
    LISTE ZUERST — gemessen, nicht geschätzt. Am Telefon begann „Alle
    Baustellen" bei 1590 px, also knapp DREI Bildschirme unter der Kante, und
    darüber stand eine leere Maske. Diese Ansicht wird zum Nachschlagen
    geöffnet; angelegt wird der seltenere Fall.

    Dasselbe Muster wie in `WartungenView`: Knopf in der Kopfzeile, Formular
    klappt auf. `PageHeader` trägt den `action`-Platz dafür seit jeher.
  */
  const [formOffen, setFormOffen] = useState(false);
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
    const nummer = form.projectNumber.trim();
    // Die Nummer, an der es scheitern kann — nach dem Zähler dessen Nummer.
    let versucht = nummer;
    try {
      const data = {
        ...form,
        projectNumber: nummer,
        // Leeres Feld heißt "kein Budget" — dann bleibt die Ampel der
        // Projektauswertung bewusst aus, statt 0 h anzunehmen.
        estimatedHours: form.estimatedHours === '' ? undefined : Number(form.estimatedHours) || 0,
        assignedEmployees: assigned,
        projectManagers: managers,
      };
      /*
        WER DIE NUMMER STEHEN LIESS, BEKOMMT DIE VERBINDLICHE AUS DEM ZÄHLER.
        Wer eine eigene getippt hat, behält sie — manche Betriebe führen die
        Nummer des Bauträgers oder des Architekten, und ein Pflichtschema
        nähme ihnen das weg. Der Zähler wird dann gar nicht erst angefasst.
      */
      if (nummer === nummernVorschlag) {
        const vergeben = await reserveProjectNumber(user.companyId, {
          seedFrom: 0, // Den Anfangsstand liest die Datenbank selbst.
          praefix: vorsaetze.baustelle,
        });
        // `null` heisst „kein Zähler verfügbar" — dann gilt der Vorschlag.
        if (vergeben) data.projectNumber = versucht = vergeben;
      }
      await createProject(user.companyId, data);
      reset();
      setFormOffen(false);
      toast.success('Baustelle angelegt');
    } catch (err) {
      setError(
        grundAus(err, 'Die Baustelle konnte nicht gespeichert werden.', {
          doppelt: `Die Nummer ${versucht} ist schon vergeben — bitte eine andere eintragen.`,
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * Der Vorschlag für die nächste Baustellennummer.
   *
   * GERECHNET WIRD ÖRTLICH, VERGEBEN WIRD SERVERSEITIG — dasselbe Vorgehen
   * wie bei den Rechnungen, und aus demselben Grund: würde beim Öffnen der
   * Maske eine Nummer aus dem Zähler gezogen, verbrauchte jedes Abbrechen
   * eine. Nach zehn Versuchen stünde die erste Baustelle auf der Elf.
   *
   * Der Vorschlag darf und wird veralten, sobald jemand anderes gleichzeitig
   * anlegt; verbindlich wird die Nummer erst beim Speichern.
   */
  const vorsaetze = praefixeVon(company);
  const nummernVorschlag = useMemo(
    () =>
      belegNummer(
        vorsaetze.baustelle,
        new Date().getFullYear(),
        hoechsteLfdImJahr(projects.map((p) => p.projectNumber), new Date().getFullYear()) + 1,
      ),
    [projects, vorsaetze.baustelle],
  );

  /*
    DER VORSCHLAG GEHÖRT IN DEN ZUSTAND, NICHT IN DIE ANZEIGE.

    Hier stand kurz `value={form.projectNumber || nummernVorschlag}`. Das sieht
    richtig aus und ist es nicht: das Feld wird kontrolliert gezeichnet, im
    Zustand steht aber die leere Zeichenkette. Wer dann tippt, bekommt
    „B-2026-00012026-042" — die Anzeige plus das Getippte. Gefunden hat das
    `AdminProjectsView.test.tsx`, nicht das Nachdenken.

    Vorbelegt wird nur, solange das Feld leer ist: beim ersten Eintreffen der
    Liste und nach jedem Speichern. Wer den Vorschlag löscht, um seine eigene
    Nummer zu tippen, bekommt ihn nicht sofort zurück — die Wirkung hängt am
    Vorschlag selbst, und der ändert sich erst mit der Liste.

    EIN STEHENGELASSENER VORSCHLAG ZIEHT MIT. Der erste Vorschlag entsteht,
    bevor die Liste da ist, also aus nichts: „…-0001". Blieb er stehen, als
    die Liste kam, galt er beim Speichern als eigene Nummer — der Zähler wurde
    übergangen, und die Baustelle scheiterte an der schon vergebenen 0001
    (Prüflauf 24.09.2026, F4). Deshalb merkt sich `letzterVorschlag`, was hier
    eingesetzt wurde; steht genau das noch im Feld, gehört es nicht dem
    Benutzer und wird ersetzt.
  */
  const letzterVorschlag = useRef('');
  useEffect(() => {
    // Vorher festhalten: die Funktion in `setForm` läuft erst beim nächsten
    // Zeichnen, und dann stünde in der Ref schon der neue Vorschlag.
    const alt = letzterVorschlag.current;
    letzterVorschlag.current = nummernVorschlag;
    setForm((f) =>
      f.projectNumber === '' || f.projectNumber === alt ? { ...f, projectNumber: nummernVorschlag } : f,
    );
  }, [nummernVorschlag]);

  // Neueste zuerst; ohne Sortierung ist die Reihenfolge der Datenbank beliebig.
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
  const [serverTreffer, setServerTreffer] = useState<WithId<Project>[]>([]);

  /*
    JEDE EINGABE GEHT AN DEN SERVER und sucht über Nummer, Kunde und Adresse,
    auch mitten im Wort.

    Bis zum Abbau von Firestore ging nur eine BAUSTELLENNUMMER an den Server,
    weil dort nur Anfänge einer sortierten Spalte vergleichbar waren:
    „2026-0042" war findbar, „Seestraße" nicht. Mit dieser Einschränkung sind
    auch die beiden Hinweissätze gefallen, die sie dem Benutzer erklärten —
    sie behaupteten zuletzt etwas, das nicht mehr stimmte.

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
    if (begriff === '') {
      setServerTreffer([]);
      return;
    }

    let verworfen = false;
    const verzoegert = setTimeout(() => {
      void searchProjects(user.companyId, begriff)
        .then((gefunden) => {
          if (!verworfen) setServerTreffer(gefunden);
        })
        /*
          Ein Fehlschlag laesst die oertliche Suche stehen, statt die Liste zu
          leeren: was geladen ist, ist deshalb nicht falsch. Unten steht dann
          nur nicht mehr, dass vom Server etwas dazukam.
        */
        .catch(() => {
          if (!verworfen) setServerTreffer([]);
        });
    }, 300);

    return () => {
      verworfen = true;
      clearTimeout(verzoegert);
    };
  }, [user, suche]);

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
    const geladen = new Set(sorted.map((p) => p.id));
    return serverTreffer.filter((p) => !geladen.has(p.id)).length;
  }, [serverTreffer, sorted]);

  /** Am Schreibtisch die Baustellen als Tabelle, am Telefon als Liste. */
  const schreibtisch = useAbBreite(AB_TABELLE);

  if (!user) return null;

  /** Namen statt Kennungen — Team und Projektleitung einer Baustelle. */
  const personen = (p: WithId<Project>) => {
    const namen = (uids: string[]) =>
      uids.map((uid) => users.find((u) => u.uid === uid)?.name).filter(Boolean);
    return { team: namen(p.assignedEmployees ?? []), leitung: namen(p.projectManagers ?? []) };
  };

  /*
    DIE AKTIONEN EINER BAUSTELLENZEILE — am Telefon in der Listenzeile, am
    Schreibtisch in der letzten Tabellenspalte (siehe `useAbBreite`). Einmal
    geschrieben, damit beide Formen dieselben Handgriffe tragen.
  */
  const baustelleAktionen = (p: WithId<Project>) => (
    <>
      {/*
        EIN WEG STATT ZWEI. Hier standen „Übersicht" (klappte eine
        Auswertung in die Liste) und „Bearbeiten" (sprang in das
        Formular ganz oben). Beides steht jetzt in der Akte, und
        die hat eine Adresse: sie lässt sich verlinken, als
        Lesezeichen ablegen und kommt zurück, wohin man war.
      */}
      {/* Ein Textknopf wie „Öffnen" bei den Angeboten, kein
          unterstrichener Link (docs/design/linie.md 3). */}
      <Link to={`/admin-projects/${p.id}`} className="knopf-leise-klein">
        Akte
      </Link>
      {/*
        LÖSCHEN STEHT IM MENÜ, NICHT ALS ✕ IN DER ZEILE.

        Gemessen auf 375 px (iPhone XS): mit Budget-Marke, Zustand
        und zwei Verweisen passte das ✕ nicht mehr in die Zeile und
        rutschte ALLEIN in eine zweite — rechtsbündig, unter einer
        leeren Lücke. Damit stand ausgerechnet die einzige
        unumkehrbare Aktion am auffälligsten da.

        Die Regel steht schon in `ListRow`: „Wo es mehr als zwei
        Aktionen gibt, gehört alles Seltene in ein RowMenu." Hier
        war sie nur nicht befolgt.

        NUR DAS ✕ ZU VERSCHIEBEN REICHTE NICHT — nachgemessen
        rutschte danach das Menü selbst in die zweite Zeile. Fünf
        Elemente passen auf 375 px nicht, gleich welches zuletzt
        kommt. Deshalb geht „Schein nachtragen" mit: übrig bleiben
        Budget, Zustand, die Akte und das Menü. Der Umbruch war der
        Anlass, die Gewichtung ist der Gewinn.
      */}
      <RowMenu
        about={`Baustelle ${p.projectNumber}`}
        items={[
          /*
            „Schein nachtragen" ist der Ausnahmefall — der
            Monteur hat ihn vor Ort vergessen. Als eigener
            Verweis in der Zeile stand er gleichauf mit der
            Akte, die man täglich braucht.
          */
          ...(scheineAn
            ? [{
                label: 'Schein nachtragen',
                onSelect: () =>
                  navigate(`/worksheet?projekt=${encodeURIComponent(p.projectNumber)}`),
              }]
            : []),
          { label: 'Löschen', onSelect: () => setToDelete(p), danger: true },
        ]}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Baustellen"
        subtitle="Baustellen anlegen und suchen — geändert wird in der Akte"
        action={
          formOffen ? undefined : (
            <Button onClick={() => setFormOffen(true)}>Neue Baustelle</Button>
          )
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {formOffen && (
      <Card title="Neue Baustelle">
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField
              id="pnr"
              label="Projektnummer"
              value={form.projectNumber}
              onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
              required
              pflicht
            />
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
                <Link to="/customers" className="textlink">
                  Kundenverwaltung
                </Link>{' '}
                anlegen und die Baustellen übernehmen.
              </p>
            )}
            {kunden.length === 0 && (
              <p className="text-sm text-ink-muted sm:col-span-2">
                Noch keine Kunden angelegt.{' '}
                <Link to="/customers" className="textlink">
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
          <BetriebsurlaubHinweis companyId={user?.companyId} von={form.startDate} bis={form.endDate} />
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
            <Meldung ton="warnung">
              Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle
              niemanden. Die Verwaltung wird weiterhin verständigt.
            </Meldung>
          )}
          <Pflichthinweis />
          {error && <ErrorState message={error} />}
          {/* Das Formular ist am Telefon mehrere Bildschirme lang — die Leiste
              hält „Anlegen" erreichbar. */}
          <Aktionsleiste>
            <Button type="submit" loading={saving}>Anlegen</Button>
            {/* Der Weg zurück zur Liste — vorher gab es ihn nicht, weil das
                Formular gar nicht zuging. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setFormOffen(false); reset(); }}
            >
              Abbrechen
            </Button>
          </Aktionsleiste>
        </form>
      </Card>
      )}

      <Card
        title="Alle Baustellen"
        // Zahl und Filter rechts im Titel, wie in jeder Liste (Linie, 2).
        action={
          <div className="liste-kopf-rechts">
            <span className="liste-anzahl">{visible.length}</span>
            <SelectField id="pfilter" label="" aria-label="Baustellen zeigen" value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="offen">Aktiv &amp; pausiert</option>
              <option value="alle">Alle</option>
              <option value="archiv">Archiv ({archivCount})</option>
            </SelectField>
          </div>
        }
        /*
          Steht unter der Liste, im Kartenfuß, nicht im Kopf: erst wer bis ans
          Ende gescrollt hat und nichts gefunden hat, braucht die Auskunft.
          In den Fuß kommt sie nur, wenn die Grenze greift.

          KEIN SUCHSATZ MEHR. Er sagte „Nach Kunde und Adresse wird nur in
          diesen gesucht" — richtig unter Firestore, seit dem Abbau falsch:
          die Datenbank sucht über Nummer, Kunde und Adresse im ganzen
          Bestand. Die Grenze gilt nur noch für das, was OHNE Suchbegriff
          angezeigt wird. Eine Auskunft, die einmal danebenlag, wird beim
          nächsten Mal nicht mehr geglaubt.
        */
        footer={
          abgeschnitten(projects, grenze) && (
            <Nachladen
              geladen={projects.length}
              grenze={grenze}
              onMehr={() => setGrenze((g) => g + BAUSTELLEN_JE_SEITE)}
              einheit="Baustellen"
              sucheImBrowser={false}
            />
          )
        }
      >
        {projects.length >= 8 && (
          <div className="liste-suche">
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
        ) : schreibtisch ? (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead className="tabelle-kopfzeile">
                <tr>
                  <th className="tabelle-kopf">Baustelle</th>
                  <th className="tabelle-kopf">Adresse</th>
                  <th className="tabelle-kopf">Projektleitung</th>
                  <th className="tabelle-kopf-zahl">Budget</th>
                  <th className="tabelle-kopf">Status</th>
                  <th className="tabelle-kopf-zahl">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const { team, leitung } = personen(p);
                  return (
                    <tr key={p.id} className="tabelle-zeile">
                      {/* Die Nummer als zweite Zeile unter dem Kunden, wie die
                          Baustelle unter dem Kunden bei den Angeboten. */}
                      <td className="tabelle-name">
                        {p.customerName}
                        <span className="tabelle-unter">{p.projectNumber}</span>
                      </td>
                      {/* Adresse und Nummer anklickbar, wie in der Liste. */}
                      <td className="tabelle-zelle">
                        <span className="tabelle-kontakt">
                          <AdresseLink adresse={p.address} />
                          <TelefonLink
                            nummer={p.contactPhone}
                            name={p.contactName}
                            className="whitespace-nowrap"
                          />
                        </span>
                      </td>
                      <td className="tabelle-zelle">
                        {leitung.length > 0 ? (
                          leitung.join(', ')
                        ) : (
                          <span className="text-warning">Keine Projektleitung zugeteilt</span>
                        )}
                        {team.length > 0 && (
                          <span className="tabelle-unter">Team: {team.join(', ')}</span>
                        )}
                      </td>
                      <td className="tabelle-zahl-stark">
                        {p.estimatedHours ? `${fmtStunden(p.estimatedHours)} h` : null}
                      </td>
                      <td className="tabelle-zelle">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="tabelle-aktionen">
                        <div className="tabelle-knoepfe">{baustelleAktionen(p)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <List>
            {visible.map((p) => {
              const { team, leitung } = personen(p);
              return (
                <ListRow
                  key={p.id}
                  title={p.customerName}
                  /*
                    Nach der Linie (3): Titel der Kunde, Unterzeile mit „·" —
                    Nummer, Leitung, Team. Das Budget rechts als Wert, fett,
                    wie der Betrag eines Angebots.
                  */
                  subtitle={
                    <>
                      {p.projectNumber}
                      {' · '}
                      {leitung.length > 0 ? (
                        <>Projektleitung: {leitung.join(', ')}</>
                      ) : (
                        <span className="text-warning">Keine Projektleitung zugeteilt</span>
                      )}
                      {team.length > 0 && <> · Team: {team.join(', ')}</>}
                    </>
                  }
                  zustand={<StatusBadge status={p.status} />}
                  wert={p.estimatedHours ? `${fmtStunden(p.estimatedHours)} h Budget` : undefined}
                  /* Adresse und Nummer als Chips unter der Zeile — auch die
                     Projektleitung fährt raus und ruft an (Linie, 5). */
                  unten={
                    p.address?.trim() || p.contactPhone?.trim() ? (
                      <KontaktZeile
                        adresse={p.address}
                        nummer={p.contactPhone}
                        name={p.contactName}
                        className="mt-1"
                      />
                    ) : undefined
                  }
                >
                  {baustelleAktionen(p)}
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
          const weg = toDelete;
          setToDelete(null);
          if (!weg) return;
          /*
            SCHEITERN WIRD GESAGT. Hier stand kein Fang: an einer Baustelle mit
            Buchungen, Scheinen, Rechnungen oder Plänen verweigert die
            Datenbank das Löschen — und der Dialog blieb einfach offen, ohne ein
            Wort. Richtig ist dann das Abschliessen, nicht das Löschen.
          */
          try {
            await deleteProject(weg.id);
            toast.success('Baustelle gelöscht');
          } catch (e) {
            toast.error(
              /foreign key|violates|verweis/i.test((e as Error).message)
                ? `${weg.projectNumber} lässt sich nicht löschen — an ihr hängen schon Buchungen, Scheine, Rechnungen oder Pläne. Setze sie stattdessen auf „Abgeschlossen".`
                : `${weg.projectNumber} konnte nicht gelöscht werden.`,
            );
          }
        }}
      />
    </div>
  );
}
