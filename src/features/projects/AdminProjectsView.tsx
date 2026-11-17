import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useNeuAusAdresse } from '@/lib/useNeuAusAdresse';
import { isGF } from '@/lib/permissions';
import OhneUmbruch from '@/components/OhneUmbruch';
import BottomSheet from '@/components/BottomSheet';
import Abschnitt from '@/components/Abschnitt';
import { Listenleiste, MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import Hinweiszeile from '@/components/Hinweiszeile';
import Adressfilter from '@/components/Adressfilter';
import { BAUSTELLEN_FILTER, bekannt as bekannterWert, type BaustellenFilter } from '@/features/dashboard/start/ziele';
import {
  BUDGET_AB_PROZENT,
  budgetStand,
  type BudgetZeile,
} from './baustellenLage';
import Metric, { MetricRow } from '@/components/Metric';
import { ZIEL } from '@/features/dashboard/start/ziele';
import { stundenDerBaustellen } from '@/lib/db/timeEntries';
import { baustellenOhneEinsatz } from '@/lib/db/assignments';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useBeiAktualisieren } from '@/lib/aktualisieren';
import BetriebsurlaubHinweis from './BetriebsurlaubHinweis';
import {
  baustellenListe,
  baustellenBudgetLage,
  baustellenBeobachten,
  type BaustellenListe,
  createProject,
  deleteProject,
  searchProjects,
  reserveProjectNumber,
  baustelleVerwendung,
} from '@/lib/db/projects';
import { aufzaehlen, loeschWeg, type LoeschWeg } from './baustelleVerwendung';
import BaustelleAbschliessen from './BaustelleAbschliessen';
import { neuFuerLaden, neuFuerLesen, ohneNeuFuer } from '@/features/customers/neuFuer';
import { listUsers } from '@/lib/db/users';
import { schluessel, useGemerkt } from '@/lib/zwischenspeicher';
import { useModul } from '@/lib/useModule';
import type { WithId } from '@/lib/db/core';
import type { Abrechnungsart, Project, AppUser } from '@/types';
import Card from '@/components/Card';
import KundenAuswahl from '@/components/KundenAuswahl';
import { useKunde } from '@/features/customers/useKundenFuer';
import Button from '@/components/Button';
import { Zustand } from '@/components/Badge';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import PageHeader from '@/components/PageHeader';
import RowMenu from '@/components/RowMenu';
import { praefixeVon } from '@/lib/praefixe';
import { useBaustellenVorschlag } from './useBaustellenVorschlag';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, TextareaField, FormGrid, Pflichthinweis } from '@/components/Field';
import PersonPicker from '@/components/PersonPicker';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { fmtStd, fmtStunden, todayStr } from '@/lib/time';
import ZahlFeld from '@/components/ZahlFeld';
import AdresseFeld from '@/components/AdresseFeld';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { ABRECHNUNGSARTEN } from '@/lib/abrechnung';
import { stammdatenFehler, stundenbudgetAus } from './baustellenEntwurf';
import LiegenschaftAuswahl from '@/features/liegenschaften/LiegenschaftAuswahl';
import LiegenschaftVorschlaege from '@/features/liegenschaften/LiegenschaftVorschlaege';
import type { Customer, Liegenschaft } from '@/types';
import { akteVorbereiten } from '@/lib/akteVorbereiten';
import Schalter from '@/components/Schalter';

const empty = {
  projectNumber: '',
  customerId: '',
  customerName: '',
  /** Freiwilliger Name der Baustelle (G4). */
  bezeichnung: '',
  address: '',
  status: 'Aktiv' as Project['status'],
  /** Wie in der Akte (G5): leer heisst „nicht festgelegt", gilt als Regie. */
  billingMode: '' as '' | Abrechnungsart,
  /** Kalkuliertes Stundenbudget — Grundlage der Ampel in der Projektauswertung. */
  estimatedHours: '',
  description: '',
  startDate: '',
  endDate: '',
  contactName: '',
  contactPhone: '',
  /** Liegenschaft und Top (M02c) — freiwillig, nur mit der Unterfähigkeit. */
  liegenschaftId: '',
  topId: '',
};


/** Baustellen-Verwaltung: CRUD + Mitarbeiterzuordnung (GF/Admin). */
/**
 * Wie viele Baustellen die Verwaltungsliste laedt.
 *
 * Baustellen wachsen langsamer als Zeiteintraege, aber sie wachsen: bei
 * zweihundert Auftraegen im Jahr sind es nach zehn Jahren zweitausend.
 */

/** Höchstens so viele Zeilen je Gruppe, dann „und N weitere“ (Linie „Lot“, Regel 4). */
const JE_GRUPPE = 20;

/**
 * Die Auswahl über der Liste. Die Werte sind die bisherigen, damit eine
 * Ansicht als Lesezeichen (`?stand=archiv`) dieselbe bleibt.
 */
const STAENDE = ['offen', 'archiv', 'alle'] as const;
type Stand = (typeof STAENDE)[number];

/**
 * In dieser Reihenfolge stehen die Gruppen: woran gerade gearbeitet wird
 * zuerst. Ein Status, den es hier nicht gibt, steht danach unter seinem
 * eigenen Namen — gezeigt wird jede Baustelle, auch eine unerwartete.
 */
const STATUS_REIHE = ['Aktiv', 'Pausiert', 'Abgeschlossen'];

/** So viele Namen des Teams stehen in der Zeile; die übrigen als „+2“. */
const TEAM_IN_DER_ZEILE = 2;

/**
 * Das Team in der Zeile, gekürzt (Auftrag 04.11.2026). Bei sechs Leuten war
 * das Team die längste Angabe der Zeile und brach sie um; wer genau dabei
 * ist, steht in der Akte. Der Vorleser bekommt alle Namen.
 */
function TeamKurz({ namen }: { namen: string[] }) {
  const gezeigt = namen.slice(0, TEAM_IN_DER_ZEILE);
  const rest = namen.slice(TEAM_IN_DER_ZEILE);
  return (
    <span>
      Team: {gezeigt.join(', ')}
      {rest.length > 0 && (
        <>
          <span aria-hidden="true">{` +${rest.length}`}</span>
          <span className="sr-only">{`, ${rest.join(', ')}`}</span>
        </>
      )}
    </span>
  );
}

export default function AdminProjectsView() {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  /*
    DIE LISTE AUS DER DATENBANK (Durchsicht 15.11.2026, Budget B3): je
    Statusgruppe die Zahl und so viele Zeilen, wie gezeigt werden — über ALLE
    Baustellen, gefiltert, gesucht und gezählt nach denselben Regeln wie bis
    dahin hier. Vorher kamen die jüngsten 300 und alle laufenden (gewachsener
    Bestand: 720 Zeilen). `null`: noch unterwegs.
  */
  const [liste, setListe] = useState<BaustellenListe | null>(null);
  /** Eine Runde weiter, wenn sich an den Baustellen etwas geändert hat: die Liste fragt neu. */
  const [listenRunde, setListenRunde] = useState(0);
  // Ziehen zum Aktualisieren (F15): die Liste lädt selbst — sie fragt dann neu.
  useBeiAktualisieren(() => setListenRunde((n) => n + 1));
  /*
    DIE BELEGSCHAFT, gemerkt für den zweiten Besuch (Stufe 3). Die Baustellen
    kommen dann als Live-Liste sofort; ohne Namen stand kurz „Keine
    Projektleitung zugeteilt“ in der Zeile (Messung 11.10.2026). Die Liste
    steht deshalb erst mit der Belegschaft (oder ihrem Fehler) da.
  */
  const { anfang: belegschaftGemerkt, merken: belegschaftMerken } = useGemerkt<{ users: AppUser[] }>(
    user ? schluessel('belegschaft', user) : null,
  );
  const [users, setUsers] = useState<AppUser[]>(() => belegschaftGemerkt?.users ?? []);
  const [belegschaftDa, setBelegschaftDa] = useState(() => belegschaftGemerkt?.users !== undefined);
  const [error, setError] = useState<string | null>(null);
  /*
    DER LADEFEHLER DER LISTE GEHÖRT AN DIE LISTE (wie bei den Kunden). Er
    teilte sich `error` mit dem Formular und stand nur dort, im zugeklappten
    Seitenfenster; die leere Liste darunter zeigte dann gar nichts.
  */
  const [listenFehler, setListenFehler] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Baustellenliste steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  /** Der gewählte Kunde — aus der Suche, beim Bearbeiten einzeln nachgeladen (Ladezeit, 19.10.2026). */
  const [kunde, setKunde] = useKunde(user?.companyId, form.customerId);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /*
    LISTE ZUERST — gemessen, nicht geschätzt. Am Telefon begann „Alle
    Baustellen" bei 1590 px, also knapp DREI Bildschirme unter der Kante, und
    darüber stand eine leere Maske. Diese Ansicht wird zum Nachschlagen
    geöffnet; angelegt wird der seltenere Fall.

    Knopf in der Kopfzeile, das Formular im Seitenfenster (Linie „Lot“,
    Regel 8): die Liste bleibt daneben stehen, statt nach unten zu rutschen.
    Wer das Fenster nur wegklickt, findet seine Eingaben beim nächsten Öffnen
    wieder; verworfen wird erst mit „Abbrechen“.
  */
  const [formOffen, setFormOffen] = useState(false);
  // „Neue Baustelle“ aus „Suchen oder springen“ (F15): `?neu` öffnet das Formular, wie der Knopf.
  useNeuAusAdresse(() => setFormOffen(true), !!user && isGF(user.role));
  const [toDelete, setToDelete] = useState<WithId<Project> | null>(null);
  /** Geführt abschließen (A11) — aus dem Zeilenmenü und aus dem Löschdialog. */
  const [zuSchliessen, setZuSchliessen] = useState<WithId<Project> | null>(null);
  /*
    WAS IM WEG STEHT, BEVOR GEFRAGT WIRD (A1). Der Dialog sagte „wird
    entfernt“ und scheiterte danach mit „an ihr hängen schon Buchungen,
    Scheine, Rechnungen oder Pläne“ — auch bei einer leeren Baustelle, an der
    nur ihr angenommenes Angebot hing. Jetzt nennt er vorher den wahren Grund
    und den Weg, aus der Zählung der Datenbank (`baustelle_verwendung`).
  */
  const [loeschLage, setLoeschLage] = useState<{ id: string; weg: LoeschWeg } | 'laedt' | 'fehler' | null>(null);
  useEffect(() => {
    if (!toDelete) {
      setLoeschLage(null);
      return;
    }
    let weg = false;
    setLoeschLage('laedt');
    baustelleVerwendung(toDelete.id)
      .then((v) => { if (!weg) setLoeschLage({ id: toDelete.id, weg: loeschWeg(v) }); })
      .catch(() => { if (!weg) setLoeschLage('fehler'); });
    return () => {
      weg = true;
    };
  }, [toDelete]);
  const loeschWegJetzt = loeschLage && typeof loeschLage === 'object' && toDelete && loeschLage.id === toDelete.id
    ? loeschLage.weg
    : null;
  /**
   * Ein Tiefenlink auf eine Baustelle setzt Suche UND Filter.
   *
   * Der Filter gehört dazu: die Liste zeigt sonst nur offene Baustellen, und
   * ein Link aus der Kundenakte auf einen abgeschlossenen Auftrag liefe ins
   * Leere — mit der Suche im Feld und der Meldung, dass nichts passt. Genau
   * die Art von Sackgasse, die wie ein Fehler aussieht.
   */
  const [suchparameter, setSuchparameter] = useSearchParams();
  /*
    AUS DER KUNDEN- ODER LIEGENSCHAFTSAKTE (V3): „Neue Baustelle“ mit Kunde,
    Ort und Liegenschaft vorbelegt — ohne zweite Kundensuche.
  */
  const neuFuer = neuFuerLesen(suchparameter);
  const neuFuerSchluessel = neuFuer ? JSON.stringify(neuFuer) : null;
  useEffect(() => {
    if (!neuFuer || !user) return;
    let weg = false;
    void (async () => {
      const v = await neuFuerLaden(user.companyId, neuFuer);
      if (weg) return;
      setForm({
        ...empty,
        customerId: v.kunde?.id ?? '',
        customerName: v.kunde?.name ?? '',
        address: v.ort,
        liegenschaftId: v.liegenschaft?.id ?? '',
        topId: v.liegenschaft ? neuFuer.top ?? '' : '',
      });
      setFormOffen(true);
      setSuchparameter(ohneNeuFuer(suchparameter), { replace: true });
    })();
    return () => {
      weg = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neuFuerSchluessel, user]);
  // Der Schein-Verweis verschwindet mit seinem Modul.
  const scheineAn = useModul('scheine');
  const liegenschaftenAn = useModul('kunden.liegenschaften');
  /** Die gewählte Liegenschaft — für die Vorschläge (M02c). */
  const [liegenschaft, setLiegenschaft] = useState<Liegenschaft | null>(null);
  const gesuchteBaustelle = suchparameter.get('baustelle') ?? '';
  /*
    DIE AUSWAHL STEHT IN DER ADRESSE (Protokoll 7.5): als Lesezeichen
    gespeichert und beim Zurückkehren aus der Akte wieder da. Ohne Angabe
    gilt wie bisher „Aktiv & pausiert“, mit einem Tiefenlink „Alle“.
  */
  const standInAdresse = suchparameter.get('stand');
  const filter: Stand = (STAENDE as readonly string[]).includes(standInAdresse ?? '')
    ? (standInAdresse as Stand)
    : gesuchteBaustelle
      ? 'alle'
      : 'offen';
  const setFilter = (wert: Stand) => {
    const neu = new URLSearchParams(suchparameter);
    neu.set('stand', wert);
    setSuchparameter(neu, { replace: true });
  };
  /*
    DIE SUCHE STEHT IN DER ADRESSE (`?suche=`, wie bei Kunden, Angeboten und
    Wartungen): wer aus einer Akte zurückkommt, findet sie wieder — der
    Rückweg im Seitenkopf nimmt die Abfrage mit (`lib/listenAdresse.ts`).
    Ein Tiefenlink (`?baustelle=`) gilt als erste Suche; wer weitertippt,
    behält die Ansicht, die der Tiefenlink gesetzt hat.
  */
  const [suche, setSucheFeld] = useState(() => gesuchteBaustelle || (suchparameter.get('suche') ?? ''));
  const setSuche = (q: string) => {
    setSucheFeld(q);
    setSuchparameter((alt) => {
      const neu = new URLSearchParams(alt);
      if (neu.has('baustelle')) {
        if (!neu.has('stand')) neu.set('stand', filter);
        neu.delete('baustelle');
      }
      if (q.trim()) neu.set('suche', q);
      else neu.delete('suche');
      return neu;
    }, { replace: true });
  };
  /** Wie viele Zeilen je Statusgruppe gezeigt sind; ohne Eintrag `JE_GRUPPE`. */
  const [gezeigt, setGezeigt] = useState<Record<string, number>>({});
  /*
    NUR MEINE BAUSTELLEN (Testbericht 30.09.2026, M38): für die
    Projektleitung die, in deren Leitung oder Team sie steht. Ab Werk aus —
    sie soll nicht plötzlich Baustellen vermissen, die sie bisher sah.
  */
  const istProjektleitung = user?.role === 'Projektleiter';

  /*
    FILTER AUS DER ADRESSE (Startseite, Nachtest 01.10.2026): „aktiv“,
    „über oder nahe Budget“ (ab 90 %), „ohne Einsatz in den nächsten 14
    Tagen“, „ohne Projektleiter“, „Ende überschritten“. Budget und Einsätze
    werden nur geholt, wenn danach gefiltert wird.
  */
  const adressFilter = bekannterWert(BAUSTELLEN_FILTER, suchparameter.get('filter'));
  const [lage, setLage] = useState<{ art: BaustellenFilter; nummern: Set<string> } | null>(null);
  const [nurMeine, setNurMeine] = useState(false);
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
    listUsers(user.companyId)
      .then((u) => {
        setUsers(u);
        belegschaftMerken({ users: u });
      })
      .catch(() => setNebenFehler('Die Belegschaft'))
      .finally(() => setBelegschaftDa(true));
    try {
      return baustellenBeobachten(user.companyId, () => setListenRunde((n) => n + 1));
    } catch {
      // Ohne Meldeweg steht die Liste trotzdem; sie fragt nach eigenen Änderungen neu.
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- belegschaftMerken hängt nur am Benutzer
  }, [user]);

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
    setLiegenschaft(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const falsch = stammdatenFehler(form);
    if (falsch) {
      setError(falsch);
      return;
    }
    setSaving(true);
    setError(null);
    const nummer = form.projectNumber.trim();
    // Die Nummer, an der es scheitern kann — nach dem Zähler dessen Nummer.
    let versucht = nummer;
    try {
      const data = {
        ...form,
        projectNumber: nummer,
        bezeichnung: form.bezeichnung.trim() || undefined,
        // Leer heisst „nicht festgelegt" — keine leere Zeichenkette in die Daten.
        billingMode: form.billingMode || undefined,
        // Leeres Feld heißt "kein Budget" — dann bleibt die Ampel der
        // Projektauswertung bewusst aus, statt 0 h anzunehmen.
        estimatedHours: stundenbudgetAus(form.estimatedHours),
        assignedEmployees: assigned,
        projectManagers: managers,
        // Ohne Liegenschaft (oder ohne die Unterfähigkeit) bleibt die Spalte leer — wie bisher.
        liegenschaftId: liegenschaftenAn && form.liegenschaftId ? form.liegenschaftId : undefined,
        topId: liegenschaftenAn && form.liegenschaftId && form.topId ? form.topId : undefined,
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
  // Das Jahr vom Server, wie die Vergabe (Befund aus G12); ohne Verbindung das des Geräts.
  const projektNummern = useMemo(() => liste?.neuesteNummern ?? [], [liste]);
  const { vorschlag: nummernVorschlag, vomServer: vorschlagVomServer } =
    useBaustellenVorschlag(projektNummern, vorsaetze.baustelle);

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

  /*
    DER BUDGETSTAND ÜBER ALLE AKTIVEN (Schriftfeld, Filter „Budget“) aus der
    Datenbank (`baustellen_budget_lage`, dieselbe Rechnung wie `budgetStand`
    — geprüft gegen sie): wie viele über 100 % und ab 90 %, und die Nummern
    ab 90 %. Scheitert er (etwa ohne Rechte der Leitung), fehlen die
    Budgetfelder statt einer geratenen Null.
  */
  const [budgetLageDB, setBudgetLageDB] = useState<{ ueber: number; nah: number; nummern: string[] } | null | 'fehler'>(null);
  // Neu gefragt, wenn der Kanal eine Änderung meldet — nicht erst nach der Liste: der Filter „Budget“ wartet auf die Nummern.
  useEffect(() => {
    if (!user) return;
    let weg = false;
    baustellenBudgetLage(BUDGET_AB_PROZENT)
      .then((b) => { if (!weg) setBudgetLageDB(b); })
      .catch(() => { if (!weg) setBudgetLageDB('fehler'); });
    return () => { weg = true; };
  }, [user, listenRunde]);
  useEffect(() => {
    if (!user || adressFilter !== 'ohne-einsatz') {
      setLage(null);
      return;
    }
    let weg = false;
    void (async () => {
      try {
        // Dieselbe Antwort wie der Zähler der Startseite (P8): über alle aktiven Baustellen, in der Datenbank.
        const nummern = (await baustellenOhneEinsatz(todayStr())).map((x) => x.projectNumber);
        if (!weg) setLage({ art: adressFilter, nummern: new Set(nummern) });
      } catch {
        if (!weg) setLage({ art: adressFilter, nummern: new Set() });
      }
    })();
    return () => {
      weg = true;
    };
  }, [user, adressFilter, listenRunde]);
  // Die Nummern für die Filter „Budget“ und „ohne Einsatz“ nennen ihre eigenen Funktionen; bis sie da sind, wartet die Liste.
  const filterNummern = adressFilter === 'budget'
    ? (budgetLageDB === null ? null : budgetLageDB === 'fehler' ? [] : budgetLageDB.nummern)
    : adressFilter === 'ohne-einsatz'
      ? (lage?.art === 'ohne-einsatz' ? [...lage.nummern] : null)
      : undefined;
  const lageFehlt = filterNummern === null;
  const nummernSchluessel = filterNummern ? [...filterNummern].sort().join('|') : '';

  /*
    DIE GEZEIGTE SEITE. Getippt wird kurz abgewartet; eine Antwort zu einem
    älteren Stand wird verworfen. Neu gefragt bei jeder Runde (Kanal, eigene
    Änderung).
  */
  const begriff = suche.trim();
  const gezeigtSchluessel = JSON.stringify(gezeigt);
  useEffect(() => {
    if (!user || lageFehlt) return;
    let weg = false;
    const t = setTimeout(() => {
      const zahl = JSON.parse(gezeigtSchluessel) as Record<string, number>;
      baustellenListe({
        heute: todayStr(),
        status: filter as 'offen' | 'archiv' | 'alle',
        filter: adressFilter ?? null,
        nummern: nummernSchluessel ? nummernSchluessel.split('|') : adressFilter === 'budget' || adressFilter === 'ohne-einsatz' ? [] : null,
        meine: nurMeine,
        begriff,
        anzahl: Object.fromEntries([...STATUS_REIHE, 'Ohne Status'].map((st) => [st, zahl[st] ?? JE_GRUPPE])),
      })
        .then((l) => {
          if (weg) return;
          setListe(l);
          setListenFehler(null);
        })
        .catch((e: Error) => { if (!weg) setListenFehler(e.message); });
    }, begriff ? 200 : 0);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [user, filter, adressFilter, nummernSchluessel, lageFehlt, nurMeine, begriff, gezeigtSchluessel, listenRunde]);
  const loading = liste === null && !listenFehler;

  /*
    DER BUDGETSTAND DER GEZEIGTEN ZEILEN (Maßlinie, Zustand „über Budget“):
    dieselbe Rechnung wie die Startseite (`budgetStand` aus den Summen von
    `stundenDerBaustellen`), nur für die Baustellen, die dastehen.
  */
  const gezeigteMitBudget = useMemo(
    () => (liste?.gruppen ?? []).flatMap((g) => g.zeilen).filter((p) => p.status === 'Aktiv' && (p.estimatedHours ?? 0) > 0),
    [liste],
  );
  const gezeigteNummern = gezeigteMitBudget.map((p) => p.projectNumber).sort().join('|');
  const [budgetJe, setBudgetJe] = useState<Map<string, BudgetZeile> | null | 'fehler'>(null);
  useEffect(() => {
    if (!user) return;
    let weg = false;
    void (async () => {
      try {
        const stunden = gezeigteMitBudget.length ? await stundenDerBaustellen(gezeigteMitBudget.map((p) => p.projectNumber)) : [];
        if (!weg) setBudgetJe(new Map(budgetStand(gezeigteMitBudget, stunden).map((b) => [b.projectNumber, b])));
      } catch {
        if (!weg) setBudgetJe('fehler');
      }
    })();
    return () => {
      weg = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- an den gezeigten Nummern, nicht an jeder Antwort
  }, [user, gezeigteNummern, listenRunde]);

  const ueberBudget = budgetLageDB && budgetLageDB !== 'fehler' ? budgetLageDB.ueber : 0;
  const nahBudget = budgetLageDB && budgetLageDB !== 'fehler' ? budgetLageDB.nah : 0;
  const aktivZahl = liste?.aktiv ?? 0;
  const endeZahl = liste?.ende ?? 0;
  const gesamtZahl = liste?.gesamt ?? 0;

  /*
    NACH STATUS GRUPPIERT (Linie „Lot“, Regel 4): „Aktiv“ vor „Pausiert“ vor
    „Abgeschlossen“, innerhalb der Gruppe die neueste zuerst — so kommt es
    aus der Datenbank. DER SERVERTREFFER GEHT AM STATUSFILTER VORBEI: wer eine
    Nummer eintippt, meint genau diese Baustelle; abgeschlossen ist die
    gesuchte alte Baustelle fast immer. Er steht in seiner Gruppe dazu.
  */
  const { gruppen, nurVomServer } = useMemo(() => {
    const basisGruppen = (liste?.gruppen ?? []).map((g) => ({ status: g.status, anzahl: g.anzahl, zeilen: [...g.zeilen] }));
    if (!begriff) return { gruppen: basisGruppen, nurVomServer: 0 };
    const bekannt = new Set(basisGruppen.flatMap((g) => g.zeilen.map((p) => p.id)));
    const dazu = serverTreffer.filter((p) => !bekannt.has(p.id));
    for (const p of dazu) {
      const st = p.status || 'Ohne Status';
      let g = basisGruppen.find((x) => x.status === st);
      if (!g) {
        g = { status: st, anzahl: 0, zeilen: [] };
        basisGruppen.push(g);
      }
      g.zeilen.push(p);
      g.anzahl += 1;
    }
    const rang = (st: string) => {
      const i = STATUS_REIHE.indexOf(st);
      return i === -1 ? STATUS_REIHE.length : i;
    };
    basisGruppen.sort((x, y) => rang(x.status) - rang(y.status) || x.status.localeCompare(y.status, 'de'));
    return { gruppen: basisGruppen, nurVomServer: dazu.length };
  }, [liste, begriff, serverTreffer]);
  const sichtbar = gruppen.reduce((n, g) => n + g.zeilen.length, 0);

  if (!user) return null;

  /** Die Namen zu Kennungen — für Team und Projektleitung in der Zeile. */
  const namen = (uids: string[]) =>
    uids.map((uid) => users.find((u) => u.uid === uid)?.name).filter((n): n is string => !!n);

  /** Den Kunden wählen — aus der Suche oder aus einem Vorschlag der Liegenschaft (M02c). */
  function kundeWaehlen(id: string, k: WithId<Customer> | null) {
    const vorher = kunde?.address;
    /*
      Runde 6, Hinweis 11: dasselbe für den Ansprechpartner — er musste
      bei jeder Baustelle neu getippt werden. Ein Vorschlag aus der
      Kundenakte, nur in ein leeres Feld oder statt des vorigen Kunden.
    */
    const vorschlag = (feld: string | undefined, vonVorher: string | undefined, neu: string | undefined) =>
      !feld || feld === (vonVorher ?? '') ? (neu ?? '') : feld;
    setKunde(k);
    setForm({
      ...form,
      customerId: id,
      customerName: k?.name ?? form.customerName,
      // G5: die Anschrift des Kunden als Vorschlag — nur in ein
      // leeres Feld oder statt des Vorschlags des vorigen Kunden.
      address: !form.address || form.address === vorher ? (k?.address ?? '') : form.address,
      contactName: vorschlag(form.contactName, kunde?.contactName, k?.contactName),
      contactPhone: vorschlag(form.contactPhone, kunde?.contactPhone, k?.contactPhone),
    });
  }

  const formular = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Einspaltig: das Seitenfenster ist am Tablet 440 px breit, zwei
          Spalten liessen den Kundennamen im Auswahlfeld abschneiden. */}
      <FormGrid cols={1}>
        <InputField
          id="pnr"
          label="Projektnummer"
          value={form.projectNumber}
          onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
          required
          pflicht
        />
        {/*
          OHNE VERBINDUNG IST DER VORSCHLAG NUR EIN BEISPIEL: Jahr und Zahl kommen
          dann vom Gerät. Bleibt er stehen, vergibt der Server beim Speichern
          ohnehin die verbindliche Nummer.
        */}
        {!vorschlagVomServer && form.projectNumber === nummernVorschlag && (
          <p className="-mt-2 text-sm text-ink-muted">
            Beispiel ohne Verbindung zum Server (Jahr vom Gerät) — die Nummer vergibt der Server beim Speichern.
          </p>
        )}
        {/*
          Kunde AUSWÄHLEN statt tippen.
          Vorher war das ein freies Textfeld, und zwei Schreibweisen
          ergaben zwei Kunden — beide unvollständig. Ist ein Kunde noch
          nicht angelegt, führt der Hinweis darunter direkt dorthin;
          ihn hier nebenbei anzulegen würde die Stammdaten wieder
          verwässern.
        */}
        {/*
          LIEGENSCHAFT UND TOP (M02c) — freiwillig, vor dem Kunden: aus ihren
          Beteiligten kommen die Vorschläge für Kunde, Adresse und
          Ansprechpartner. Übernommen wird nur auf Klick.
        */}
        {liegenschaftenAn && user && (
          <>
            <LiegenschaftAuswahl
              companyId={user.companyId}
              idPrefix="pliegenschaft"
              liegenschaftId={form.liegenschaftId}
              topId={form.topId}
              onChange={(w) => {
                setLiegenschaft(w.liegenschaft);
                setForm((f) => ({ ...f, liegenschaftId: w.liegenschaftId, topId: w.topId }));
              }}
            />
            <LiegenschaftVorschlaege
              companyId={user.companyId}
              liegenschaft={form.liegenschaftId ? liegenschaft : null}
              topId={form.topId}
              heute={todayStr()}
              kundeGewaehlt={form.customerId}
              adresse={form.address}
              ansprechpartner={{ name: form.contactName, telefon: form.contactPhone }}
              onKunde={(k) => kundeWaehlen(k.id, k)}
              onAdresse={(a) => setForm((f) => ({ ...f, address: a }))}
              onAnsprechpartner={(a) => setForm((f) => ({ ...f, contactName: a.name, contactPhone: a.telefon }))}
            />
          </>
        )}
        <KundenAuswahl
          companyId={user?.companyId ?? ''}
          id="pcust"
          value={form.customerId}
          kunde={kunde}
          onChange={kundeWaehlen}
          pflicht
          required
        />
        {/*
          Altbestand: die Baustelle trägt einen Kundennamen, aber noch
          keine Verknüpfung. Ohne diesen Hinweis stünde beim Bearbeiten
          nur „— wählen —", und niemand wüsste, welcher Kunde gemeint war.
        */}
        {!form.customerId && form.customerName && (
          <p className="text-sm text-warning">
            Bisher als Text hinterlegt: „{form.customerName}". Bitte den passenden Kunden
            wählen — oder in der{' '}
            <Link to="/customers" className="link-hinweis-weiter">
              Kundenverwaltung
            </Link>{' '}
            anlegen und die Baustellen übernehmen.
          </p>
        )}
        {/* Ausdrücklich die BAUSTELLENadresse: die Rechnungsadresse steht
            beim Kunden, und eine Hausverwaltung hat zwanzig Baustellen. */}
        <InputField id="pbez" label="Bezeichnung (freiwillig)" placeholder="z. B. Bad 2. OG"
          maxLength={120} value={form.bezeichnung}
          onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} />
        <AdresseFeld id="padr" label="Baustellenadresse" value={form.address}
          vorschlag={kunde?.address}
          onChange={(t) => setForm({ ...form, address: t })} />
        <SelectField id="pstatus" label="Status" value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as Project['status'] })}>
          <option>Aktiv</option>
          <option>Pausiert</option>
          <option>Abgeschlossen</option>
        </SelectField>
        {/* Dieselben Felder wie in der Akte (G5): die Abrechnung gab es nur dort. */}
        <SelectField id="pabrechnung" label="Abrechnung" value={form.billingMode}
          onChange={(e) => setForm({ ...form, billingMode: e.target.value as typeof form.billingMode })}>
          <option value="">— nicht festgelegt (gilt als Regie) —</option>
          {ABRECHNUNGSARTEN.map((a) => (
            <option key={a.wert} value={a.wert}>{a.text}</option>
          ))}
        </SelectField>
        <ZahlFeld id="phours" label="Stundenbudget (kalkuliert)"
          placeholder="z. B. 40" value={form.estimatedHours}
          onChange={(t) => setForm({ ...form, estimatedHours: t })} />
        <InputField id="pstart" label="Beginn" type="date" value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <InputField id="pend" label="Ende (geplant)" type="date" value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <BetriebsurlaubHinweis companyId={user?.companyId} von={form.startDate} bis={form.endDate} />
        {/* Der Monteur braucht vor Ort vor allem eine Telefonnummer. */}
        <InputField id="pcontact" label="Ansprechpartner vor Ort" value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        <InputField id="pphone" label="Telefon vor Ort" type="tel" value={form.contactPhone}
          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
      </FormGrid>
      <TextareaField id="pdesc" label="Beschreibung / Auftragsumfang" value={form.description}
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
        <Hinweiszeile stufe="warn">
          <p>
            Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle
            niemanden. Die Verwaltung wird weiterhin verständigt.
          </p>
        </Hinweiszeile>
      )}
      <Pflichthinweis />
      {error && <ErrorState message={error} />}
      <div className="fuss-aktionen">
        {/* Der Weg zurück zur Liste — und der einzige, der das Eingetragene verwirft. */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => { setFormOffen(false); reset(); }}
        >
          Abbrechen
        </Button>
        <Button type="submit" loading={saving}>Anlegen</Button>
      </div>
    </form>
  );

  const ersteBaustelle = !loading && !lageFehlt && belegschaftDa && gesamtZahl === 0 && !suche && !error && !listenFehler && !formOffen;

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Baustellen"
        subtitle="Anlegen und suchen — geändert wird in der Akte"
        // Eine Hilfe je Seite (Testbericht Runde 5, G8) — der Wortlaut aus dem Handbuch.
        hilfe={
          <>
            Eine Zeile öffnet die Akte der Baustelle: Stunden gegen das Budget, Termine,
            Handwerksscheine, Pläne und Stammdaten — geändert wird dort. Gesucht wird nach
            Nummer, Bezeichnung, Adresse und Kunde, auch unter den abgeschlossenen. Löschen und
            „Schein nachtragen“ stehen im „⋯“ der Zeile; eine Baustelle mit Buchungen, Scheinen
            oder Plänen lässt sich nicht löschen.
          </>
        }
        action={
          formOffen ? undefined : (
            <Button onClick={() => setFormOffen(true)}>Neue Baustelle</Button>
          )
        }
        /*
          DAS SCHRIFTFELD (Planlinie B1): was die Liste ohnehin weiß — aktive
          Baustellen, Budgetstand wie auf der Startseite, Endtermin vorbei —,
          jedes Feld ein Weg in die passende Auswahl.
        */
        stand={!loading && aktivZahl > 0 ? (
          <MetricRow label="Stand der Baustellen">
            <Metric label="Aktiv" value={aktivZahl} hint="laufende Baustellen" to={ZIEL.baustellen('aktiv')} nurBreit />
            {budgetJe !== 'fehler' && (
              <>
                <Metric label="Über Budget" value={ueberBudget} hint="Stunden über Budget" tone={ueberBudget ? 'danger' : 'default'} to={ZIEL.baustellen('budget')} bereit={budgetJe !== null} zusatzMuster="Stunden über Budget" />
                <Metric label="Ab 90 %" value={nahBudget} hint="nahe am Budget" tone={nahBudget ? 'warning' : 'default'} to={ZIEL.baustellen('budget')} bereit={budgetJe !== null} zusatzMuster="nahe am Budget" />
              </>
            )}
            <Metric label="Ende überschritten" value={endeZahl} hint="Endtermin vorbei" tone={endeZahl ? 'danger' : 'default'} to={ZIEL.baustellen('ende-ueberschritten')} />
          </MetricRow>
        ) : undefined}
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {adressFilter && (
        <Adressfilter
          text={{
            aktiv: 'nur aktive Baustellen',
            budget: `über oder nahe Budget (ab ${BUDGET_AB_PROZENT} %)`,
            'ohne-einsatz': 'ohne Einsatz in den nächsten 14 Tagen',
            'ohne-leitung': 'ohne Projektleiter',
            'ende-ueberschritten': 'Ende überschritten',
          }[adressFilter]}
          parameter={['filter']}
        />
      )}

      {/*
        EINE GRUPPE: Suche und Auswahl oben, darunter die Baustellen nach
        Status — Linien statt Karten in der Karte.
      */}
      <Card buendig>
        {/* Erster Besuch: noch nichts zu filtern oder zu suchen — die Leiste kommt mit dem ersten Eintrag. */}
        {!ersteBaustelle && (
          <Listenleiste
            reiter={
              /*
                ARBEITSSTAND ALS STANDARD (Protokoll 7.1): laufend heisst aktiv
                und pausiert, wie bisher; „Erledigt“ (die abgeschlossenen, bis
                zum Umbau „Archiv“) und „Alle“ einen Tipp weiter. Ohne Zahl am
                Reiter: Laufendes ist Bestand, kein Handlungsbedarf (7.7) — die
                Zahl steht über der Gruppe.
              */
              <Segmente
                name="Baustellen filtern"
                werte={[
                  { wert: 'offen', text: 'Laufend' },
                  { wert: 'archiv', text: 'Erledigt' },
                  { wert: 'alle', text: 'Alle' },
                ]}
                wert={filter}
                onChange={setFilter}
              />
            }
            /*
              G7: die Suche steht da, sobald es Baustellen gibt — nicht erst ab
              acht. Der Platzhalter ist so kurz, dass er auch am Telefon ganz
              dasteht (U11); dass auch die Bezeichnung gefunden wird, sagt die
              Hilfe der Seite.
            */
            suche={gesamtZahl > 0 ? { id: 'psuche', wert: suche, onChange: setSuche, platzhalter: 'Kunde, Nummer oder Adresse' } : undefined}
            /* NUR MEINE BAUSTELLEN (Testbericht 30.09.2026, M38): für die
               Projektleitung die, in deren Leitung oder Team sie steht. */
            zusatz={istProjektleitung ? (
              <Schalter
                id="pmeine"
                label="Nur meine Baustellen"
                an={nurMeine}
                onChange={(wert) => setNurMeine(wert)}
              />
            ) : undefined}
          />
        )}
        {/*
          WAS DIE SUCHE ERREICHT, BEVOR SIE ETWAS FINDET.

          Ohne diesen Satz sah eine Suche nach „Huber" ueber die Grenze
          hinaus genauso aus wie eine, die es wirklich nicht gibt: leer.
          Der Hinweis steht deshalb waehrend des Tippens da und nicht
          erst im Leerzustand.
        */}
        {nurVomServer > 0 && (
          <p className="px-4 pb-3 text-xs text-ink">
            {nurVomServer === 1
              ? 'Eine Baustelle außerhalb dieser Auswahl gefunden.'
              : `${nurVomServer} Baustellen außerhalb dieser Auswahl gefunden.`}
          </p>
        )}

        {loading || lageFehlt || !belegschaftDa ? (
          <div className="border-t border-line p-4">
            <SkeletonList rows={4} />
          </div>
        ) : sichtbar === 0 && listenFehler && !suche ? (
          /* Nicht geladen ist nicht „noch keine“. */
          <div className="border-t border-line p-4">
            <ErrorState message={listenFehler} />
          </div>
        ) : sichtbar === 0 ? (
          <div className={ersteBaustelle ? undefined : 'border-t border-line'}>
            <EmptyState
              zeichnung={ersteBaustelle ? 'bau' : suche ? 'suche' : undefined}
              titel={ersteBaustelle ? 'Deine erste Baustelle.' : suche ? 'Keine passenden Baustellen.' : undefined}
              aktionImDaumen={ersteBaustelle}
              action={
                ersteBaustelle
                  ? <Button onClick={() => setFormOffen(true)}>Neue Baustelle</Button>
                  : suche
                    ? <Button variant="secondary" onClick={() => setSuche('')}>Suche zurücksetzen</Button>
                    : undefined
              }
            >
              {ersteBaustelle
                ? 'Auftrag, Einsätze, Pläne und Belege einer Baustelle stehen hier an einem Ort.'
                : suche
                  ? `Gesucht wurde „${suche.trim()}“ in Kunde, Nummer und Adresse.`
                  : gesamtZahl === 0
                    ? 'Noch keine Baustellen angelegt.'
                    : 'Keine Baustelle in dieser Auswahl.'}
            </EmptyState>
          </div>
        ) : (
          gruppen.map(({ status, anzahl, zeilen }) => {
            const zeigen = gezeigt[status] ?? JE_GRUPPE;
            return (
              <section key={status} aria-label={status} className="baustellen-gruppe">
                <Abschnitt titel={status} anzahl={anzahl} />
                <List>
                  {zeilen.slice(0, zeigen).map((p) => {
                    const team = namen(p.assignedEmployees ?? []);
                    const leitung = namen(p.projectManagers ?? []);
                    return (
                      <ListRow
                        key={p.id}
                        /*
                          DIE GANZE ZEILE ÖFFNET DIE AKTE (Linie „Lot“, Regel 3).
                          Bis zum Umbau stand dafür ein eigener Verweis „Akte“
                          rechts in der Zeile; die Akte hat eine Adresse, sie
                          lässt sich verlinken und kommt zurück, wohin man war.
                        */
                        to={`/admin-projects/${p.id}`}
                        // Berührt: Baustein und Kopf der Akte vorab — der Kopf aus dieser Zeile, ohne Anfrage (L12).
                        vorbereiten={user ? () => akteVorbereiten(`/admin-projects/${p.id}`, { schluessel: schluessel('baustellenakte', user, p.id), daten: { baustelle: p } }) : undefined}
                        /*
                          ZEILEN GLEICH GEBAUT (Design-Entwurf, Punkt 3): Name fett,
                          Nummer grau daneben, eine Detailzeile, rechts Zustand und
                          Wert in festen Spalten. Ohne „›“: das „⋯“ steht schon da,
                          und die ganze Zeile führt ohnehin in die Akte.
                        */
                        title={<OhneUmbruch text={baustellenTitel(p)} />}
                        nummer={p.projectNumber}
                        /*
                          ZWEI ZEILEN STATT EINER, DIE UMBRICHT (Auftrag 04.11.2026:
                          „eng, viel Text, wenig Abstände“). Adresse, Telefon,
                          Leitung und Team liefen hintereinander und brachen, wo
                          die Breite endete — mal nach der Adresse, mal mitten im
                          Team. Jetzt: wo und wen anrufen, darunter wer dran ist.
                          Adresse und Nummer anklickbar: auch die Projektleitung
                          fährt raus und ruft an. Über der Fläche der Zeile,
                          sonst öffnete der Tipp die Akte statt der Karte.
                        */
                        gestapelt
                        subtitle={
                          <>
                            {(p.address?.trim() || p.contactPhone?.trim()) && (
                              <span className="baustelle-zeile">
                                <span className="zeile-griff"><AdresseLink adresse={p.address} /></span>
                                <span className="zeile-griff"><TelefonLink nummer={p.contactPhone} name={p.contactName} /></span>
                              </span>
                            )}
                            {(leitung.length > 0 || team.length > 0) && (
                              <span className="baustelle-zeile">
                                {leitung.length > 0 && <span>Projektleitung: {leitung.join(', ')}</span>}
                                {team.length > 0 && <TeamKurz namen={team} />}
                              </span>
                            )}
                          </>
                        }
                        /*
                          Ohne Leitung ist ein Zustand, keine Fußnote: er steht in der Spalte, wo man nach Achtung sucht.
                          Ebenso das Budget, wenn es eng wird (14.11.2026): „nahe am Budget“ ab derselben Schwelle wie
                          die Kennzahl „Ab 90 %“, darüber die Überschreitung in Stunden.
                        */
                        zustand={(() => {
                          const b = budgetJe instanceof Map ? budgetJe.get(p.projectNumber) : undefined;
                          // Dieselben Schwellen wie die Kennzahlen „Über Budget“ und „Ab 90 %“ darüber.
                          const ueberMin = b ? b.usedMin - b.estimatedHours * 60 : 0;
                          const budget = !b ? null
                            : b.pct > 100 ? <Zustand stand="achtung">{ueberMin >= 6 ? `+${fmtStd(ueberMin)} h ` : ''}über Budget</Zustand>
                            : b.pct >= BUDGET_AB_PROZENT ? <Zustand stand="achtung">nahe am Budget</Zustand>
                            : null;
                          if (leitung.length > 0 && !budget) return undefined;
                          return <>{leitung.length === 0 && <Zustand stand="achtung">ohne Projektleitung</Zustand>}{budget}</>;
                        })()}
                        /*
                          GEBUCHT VON BUDGET ALS ZAHL, NICHT ALS MASSLINIE (14.11.2026). Die
                          schmale Maßlinie (Planlinie B2) brauchte in jeder Zeile drei Zeilen
                          Höhe und sagte bei den meisten Baustellen nur „0,0 h gebucht“ unter
                          einer leeren Linie. Was die Liste beantworten soll, ist: wo wird es
                          eng? Das steht jetzt als Zustand links daneben; hier steht knapp der
                          Stand, in Mono wie jede Zahl. Die Maßlinie bleibt in der Akte, wo
                          Restbudget und Verlauf Platz haben. Solange der Stand lädt (oder
                          nicht kam) und solange nichts gebucht ist, steht das Budget allein.
                        */
                        wert={p.estimatedHours ? (() => {
                          const b = budgetJe instanceof Map ? budgetJe.get(p.projectNumber) : undefined;
                          if (!b || b.usedMin === 0) {
                            return <>{fmtStunden(p.estimatedHours)} h<small>{b ? 'Budget, nichts gebucht' : 'Budget'}</small></>;
                          }
                          // Gebucht mit einer Nachkommastelle wie im Plan („45,0 h“), das Budget, wie es eingetragen ist.
                          return <>{fmtStd(b.usedMin)} / {fmtStunden(b.estimatedHours)} h<small>gebucht · {b.pct} %</small></>;
                        })() : undefined}
                      >
                        {/*
                          LÖSCHEN STEHT IM MENÜ, NICHT ALS ✕ IN DER ZEILE.

                          Gemessen auf 375 px (iPhone XS): mit Budget-Marke, Zustand
                          und zwei Verweisen passte das ✕ nicht mehr in die Zeile und
                          rutschte ALLEIN in eine zweite — rechtsbündig, unter einer
                          leeren Lücke. Damit stand ausgerechnet die einzige
                          unumkehrbare Aktion am auffälligsten da. „Schein nachtragen"
                          ist der Ausnahmefall und steht deshalb mit im Menü.
                        */}
                        <RowMenu
                          about={`Baustelle ${p.projectNumber}`}
                          items={[
                            ...(scheineAn
                              ? [{
                                  label: 'Schein nachtragen',
                                  onSelect: () =>
                                    navigate(`/worksheet?projekt=${encodeURIComponent(p.projectNumber)}`),
                                }]
                              : []),
                            // A11: geführt — der Dialog sagt vorher, was noch offen ist.
                            ...(p.status !== 'Abgeschlossen' ? [{ label: 'Abschließen', onSelect: () => setZuSchliessen(p) }] : []),
                            { label: 'Löschen', onSelect: () => setToDelete(p), danger: true },
                          ]}
                        />
                      </ListRow>
                    );
                  })}
                </List>
                <MehrAnzeigen
                  anzahl={Math.max(0, anzahl - Math.min(zeigen, zeilen.length))}
                  // Die nächsten aus der Datenbank, wie in den anderen Listen — nicht die ganze Gruppe auf einmal.
                  onClick={() => setGezeigt((g) => ({ ...g, [status]: zeigen + JE_GRUPPE }))}
                />
              </section>
            );
          })
        )}
      </Card>

      {/* Anlegen im Seitenfenster (Linie „Lot“, Regel 8); am Handy ein Blatt von unten. */}
      <BottomSheet
        open={formOffen}
        onClose={() => setFormOffen(false)}
        label="Neue Baustelle"
        auchBreit
        titel="Neue Baustelle"
      >
        {formular}
      </BottomSheet>

      <BaustelleAbschliessen projekt={zuSchliessen} onClose={() => setZuSchliessen(null)} />

      <ConfirmDialog
        open={!!toDelete}
        title="Baustelle löschen?"
        message={
          !toDelete
            ? ''
            : !loeschWegJetzt
              ? loeschLage === 'fehler'
                ? `${baustellenTitel(toDelete)} (${toDelete.projectNumber}) wird entfernt — sofern nichts an ihr hängt; was daran hängt, ließ sich gerade nicht nachsehen.`
                : 'Wird nachgesehen, was an der Baustelle hängt …'
              : loeschWegJetzt.art === 'frei'
                ? `${baustellenTitel(toDelete)} (${toDelete.projectNumber}) wird entfernt.${loeschWegJetzt.mitgehend.length ? ` Mit ihr gehen ${aufzaehlen(loeschWegJetzt.mitgehend)}.` : ''}`
                : loeschWegJetzt.art === 'angebot'
                  ? `An ${toDelete.projectNumber} hängt das angenommene Angebot ${loeschWegJetzt.angebot.nummer}, sonst nichts. Gelöscht wird sie über das Angebot: „Annahme zurücknehmen“ öffnet es wieder und nimmt die Baustelle mit.`
                  : `An ${toDelete.projectNumber} ${loeschWegJetzt.grund.length === 1 && /^1 /.test(loeschWegJetzt.grund[0]) ? 'hängt' : 'hängen'} ${aufzaehlen(loeschWegJetzt.grund)} — die bleiben nachvollziehbar. Statt sie zu löschen, schließt man sie ab; dann fällt sie aus den Auswahllisten.`
        }
        confirmLabel={!loeschWegJetzt || loeschWegJetzt.art === 'frei' ? 'Löschen' : loeschWegJetzt.art === 'angebot' ? 'Zum Angebot' : toDelete?.status === 'Abgeschlossen' ? 'Zur Baustelle' : 'Abschließen …'}
        confirmTone={!loeschWegJetzt || loeschWegJetzt.art === 'frei' ? 'danger' : 'primary'}
        gesperrt={loeschLage === 'laedt'}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const weg = toDelete;
          if (!weg) return;
          if (loeschWegJetzt?.art === 'angebot') {
            setToDelete(null);
            navigate(`/quotes/${loeschWegJetzt.angebot.id}`);
            return;
          }
          if (loeschWegJetzt?.art === 'abschliessen') {
            setToDelete(null);
            // A11: der geführte Abschluss statt eines Auswahlfelds in der Akte.
            if (weg.status === 'Abgeschlossen') navigate(`/admin-projects/${weg.id}`);
            else setZuSchliessen(weg);
            return;
          }
          /*
            SCHEITERN WIRD GESAGT — mit dem Grund. Zwischen Nachsehen und
            Löschen kann jemand anders etwas gebucht haben; dann bleibt der
            Dialog offen und nennt neu nachgesehen, was jetzt daran hängt.
          */
          try {
            await deleteProject(weg.id);
          } catch (e) {
            const neu = await baustelleVerwendung(weg.id).then(loeschWeg).catch(() => null);
            if (neu && neu.art !== 'frei') {
              setLoeschLage({ id: weg.id, weg: neu });
              throw new Error(`${weg.projectNumber} lässt sich nicht mehr löschen — inzwischen hängt etwas an ihr.`);
            }
            throw new Error(grundAus(e, `${weg.projectNumber} konnte nicht gelöscht werden.`));
          }
          setToDelete(null);
          toast.success('Baustelle gelöscht');
        }}
      />
    </div>
  );
}
