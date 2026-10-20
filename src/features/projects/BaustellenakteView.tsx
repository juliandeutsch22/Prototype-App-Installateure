import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import BetriebsurlaubHinweis from './BetriebsurlaubHinweis';
import { baustelleUmnummern, listProjectsByIds, updateProject } from '@/lib/db/projects';
import { alsEntwurf, gleich, stammdatenFehler, stundenbudgetAus, type BaustellenEntwurf } from './baustellenEntwurf';
import BaustellenPlaene from './BaustellenPlaene';
import BaustellenScheine, { ScheinZeilen, type AktenScheineStand } from './BaustellenScheine';
import { listUsers } from '@/lib/db/users';
import { schluessel, useGemerkt } from '@/lib/zwischenspeicher';
import { Wert } from '@/components/Wert';
import { listQuotesForProject } from '@/lib/db/quotes';
import { pauschalAngebot } from '@/features/invoices/pauschale';
import { ABRECHNUNGSARTEN, abrechnungText } from '@/lib/abrechnung';
import { euro } from '@/lib/betrag';
import { canAccess } from '@/app/navigation';
import { canInvoice, isGF } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import type { Project, AppUser, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Aktionsleiste from '@/components/Aktionsleiste';
import Hinweiszeile from '@/components/Hinweiszeile';
import AktenBereiche, { AktenAngaben, AktenAngabe, AktenVerweis } from '@/components/AktenBereiche';
import AktenKopf from '@/components/AktenKopf';
import { List } from '@/components/ListRow';
import AktenBearbeiten from '@/components/AktenBearbeiten';
import AktenTerminVorschau, { type AktenTerminStand } from '@/components/AktenTerminVorschau';
import TermineKarte from '@/features/termine/TermineKarte';
import Button from '@/components/Button';
import { Zustand } from '@/components/Badge';
import { LotVerlauf, type LotPunkt } from '@/components/LotBausteine';
import { endeVorbei } from './baustellenLage';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import PersonPicker from '@/components/PersonPicker';
import ConfirmDialog from '@/components/ConfirmDialog';
import KundenAuswahl from '@/components/KundenAuswahl';
import { useKunde } from '@/features/customers/useKundenFuer';
import { InputField, SelectField, TextareaField, FormGrid } from '@/components/Field';
import AdresseFeld from '@/components/AdresseFeld';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import { fmtStunden, todayStr } from '@/lib/time';
import ZahlFeld from '@/components/ZahlFeld';

/**
 * Die Akte einer Baustelle — und die Stelle, an der sie bearbeitet wird.
 *
 * WAS VORHER WAR. Die Baustelle hatte keine eigene Seite. Bearbeitet wurde
 * sie in einem Formular über der Liste, und ihre Stundenauswertung klappte
 * IN der Listenzeile auf — dieselbe Konstruktion, die bei den Kunden schon
 * einmal aufgelöst wurde: eine Ansicht in der Verkleidung einer Zeile. Wer
 * eine Baustelle ändern wollte, sprang nach oben, tippte, und suchte sie
 * danach in der Liste wieder.
 *
 * WARUM DIE KENNUNG IN DER ADRESSE STEHT UND NICHT DIE NUMMER. Die
 * Projektnummer ist der Geschäftsschlüssel, aber sie ist änderbar. Wird ein
 * Zahlendreher korrigiert, führte ein Lesezeichen auf die Akte ins Leere.
 */

/* Erst beim Öffnen der Akte geladen, nicht mit der Liste mitgeliefert. */
const BaustellenUebersicht = lazy(() => import('./BaustellenUebersicht'));

/** Ein Teil der Akte lädt für sich — ein Fehler nimmt nicht die ganze Seite. */
type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };

const LAEDT = { zustand: 'laedt' } as const;

const fmtDatum = (iso?: string) =>
  datumAT(iso);

export default function BaustellenakteView() {
  const { id } = useParams<{ id: string }>();
  const { user, company } = useAuth();
  const toast = useToast();
  const scheineAn = useModul('scheine');
  const einsatzAn = useModul('einsatzplanung');
  /*
    Angebote tragen Preise und sind Büro und Leitung vorbehalten (Zeilenschutz
    `quotes_lesen`). Wer sie nicht sehen darf, bekommt auch keinen Verweis —
    und die Abfrage wird gar nicht erst gestellt.
  */
  const angeboteSichtbar = user ? canAccess(user.role, '/quotes', company?.modules) : false;
  const [angebote, setAngebote] = useState<WithId<Quote>[]>([]);

  const [baustelle, setBaustelle] = useState<Teil<WithId<Project> | null>>(LAEDT);
  /*
    DIE BELEGSCHAFT, gemerkt für den nächsten Besuch (Stufe 3) — derselbe
    Schlüssel wie Baustellenliste und „Tag planen“. Bis sie da ist (oder ihr
    Fehler), stehen Team und Leitung als Platzhalter: vorher standen dort
    anderthalb Sekunden lang die internen Kennungen („ea9573da-…“,
    Messung 11.10.2026).
  */
  const { anfang: belegschaftGemerkt, merken: belegschaftMerken } = useGemerkt<{ users: AppUser[] }>(
    user ? schluessel('belegschaft', user) : null,
  );
  const [users, setUsers] = useState<AppUser[]>(() => belegschaftGemerkt?.users ?? []);
  const [namenDa, setNamenDa] = useState(() => belegschaftGemerkt?.users !== undefined);
  /** Ein Nebenladevorgang ist ausgefallen — die Stammdaten stehen trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  const [entwurf, setEntwurf] = useState<BaustellenEntwurf | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [bearbeitet, setBearbeitet] = useState(false);
  const [terminStand, setTerminStand] = useState<AktenTerminStand>({ termine: null, fehler: false });
  const [scheinStand, setScheinStand] = useState<AktenScheineStand>({ scheine: null, verrechnet: new Set(), fehler: false });
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  /** Eine geänderte Nummer wird erst nach Rückfrage gespeichert. */
  const [nummerFragen, setNummerFragen] = useState<{ alt: string; neu: string } | null>(null);

  const companyId = user?.companyId;
  const darfAendern = user ? isGF(user.role) : false;

  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setBaustelle(LAEDT);
    void (async () => {
      try {
        const treffer = await listProjectsByIds(companyId, [id]);
        if (!weg) setBaustelle({ zustand: 'bereit', daten: treffer[0] ?? null });
      } catch {
        if (!weg) setBaustelle({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, versuch]);

  /*
    DIE BELEGSCHAFT BRAUCHEN AUCH DIE, DIE NUR LESEN.

    Erst hatte ich sie nur für die Auswahlfelder geladen — und damit stand im
    Team der Nur-Lesen-Ansicht `u1, u2` statt „Anton Meier, Berta Klein". An
    der Baustelle steht, WER dort arbeitet; eine Kennung beantwortet das
    nicht. Gefunden hat das die Prüfung, nicht der Kopf.

    Den Kundenstamm lädt die Akte nicht mehr (Ladezeit, 19.10.2026): die
    Auswahl sucht auf dem Server, und der Kundenname steht ohnehin auf der
    Baustelle.
  */
  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    void (async () => {
      try {
        const u = await listUsers(companyId);
        if (weg) return;
        setUsers(u);
        belegschaftMerken({ users: u });
      } catch {
        // Ohne Hinweis bliebe das Team einfach leer, und es sähe aus, als
        // hätte der Betrieb keine Monteure.
        if (!weg) setNebenFehler('Belegschaft');
      } finally {
        if (!weg) setNamenDa(true);
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, darfAendern, belegschaftMerken]);

  const daten = baustelle.zustand === 'bereit' ? baustelle.daten : null;

  /*
    DAS ANGEBOT, AUS DEM DIE BAUSTELLE ENTSTAND. Gemeldet: in der Beschreibung
    stand nur „Aus Angebot AN-…", und das Angebot war von hier aus nicht zu
    erreichen. Gesucht wird über die Kennung der Baustelle, nicht ihre Nummer —
    die lässt sich oben in der Akte ändern.
  */
  const baustellenId = daten?.id;
  useEffect(() => {
    if (!companyId || !baustellenId || !angeboteSichtbar) return;
    let weg = false;
    void (async () => {
      try {
        const q = await listQuotesForProject(companyId, baustellenId);
        if (!weg) setAngebote(q);
      } catch {
        if (!weg) setNebenFehler('Das Angebot zu dieser Baustelle');
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, baustellenId, angeboteSichtbar]);

  /*
    Der Entwurf folgt der geladenen Baustelle — aber NUR, wenn diese sich
    wirklich geändert hat. Liefe er bei jedem Durchlauf mit, überschriebe
    jedes erneute Zeichnen die halb getippte Eingabe.
  */
  useEffect(() => {
    setEntwurf(daten ? alsEntwurf(daten) : null);
  }, [daten]);

  const geaendert = entwurf !== null && daten !== null && !gleich(entwurf, alsEntwurf(daten));
  // Wer mit ungespeicherten Änderungen weggeht, wird gefragt (Testbericht 30.09.2026, M1).
  const warnung = useUngespeichertWarnung(geaendert);

  /**
   * Zur Wahl stehende Monteure. Wer bereits zugeordnet IST, bleibt sichtbar —
   * auch wenn er inzwischen eine andere Rolle hat oder deaktiviert wurde.
   * Sonst hinge er unsichtbar an der Baustelle und liesse sich nicht mehr
   * abwählen. (Dieselbe Regel wie in der Baustellenliste.)
   */
  const staff = useMemo(
    () =>
      users
        .filter(
          (u) =>
            (u.role === 'Mitarbeiter' && u.active !== false) ||
            (entwurf?.assignedEmployees ?? []).includes(u.uid),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, entwurf?.assignedEmployees],
  );

  /** Die Geschäftsführung steht mit zur Wahl: in kleinen Betrieben fährt sie selbst hinaus. */
  const leads = useMemo(
    () =>
      users
        .filter(
          (u) =>
            ((u.role === 'Projektleiter' || u.role === 'Geschäftsführung') && u.active !== false) ||
            (entwurf?.projectManagers ?? []).includes(u.uid),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, entwurf?.projectManagers],
  );

  const namen = useMemo(() => new Map(users.map((u) => [u.uid, u.name])), [users]);

  async function stammdatenSpeichern(nummerBestaetigt = false): Promise<void> {
    if (!companyId || !id || !entwurf || !daten) return;
    if (!entwurf.projectNumber.trim()) {
      setSpeicherFehler('Ohne Projektnummer geht es nicht — daran hängen Zeitbuchungen und Scheine.');
      return;
    }
    if (!entwurf.customerId && !entwurf.customerName.trim()) {
      setSpeicherFehler('Ohne Kunden geht es nicht — die Rechnung weiß sonst nicht, an wen.');
      return;
    }
    const falsch = stammdatenFehler(entwurf);
    if (falsch) {
      setSpeicherFehler(falsch);
      return;
    }
    const neueNummer = entwurf.projectNumber.trim();
    const nummerNeu = neueNummer !== daten.projectNumber;
    if (nummerNeu && !nummerBestaetigt) {
      setNummerFragen({ alt: daten.projectNumber, neu: neueNummer });
      return;
    }
    setSpeichert(true);
    setSpeicherFehler(null);
    /*
      DIE NUMMER GEHT EIGENE WEGE. An ihr hängen Buchungen, Scheine und
      Einsätze als Text; `baustelle_umnummern` zieht sie in einem Schritt
      nach oder lehnt mit Grund ab. Über `updateProject` gewechselt, blieben
      sie auf der alten Nummer stehen — genau so war es bis zum 23.09.
    */
    if (nummerNeu) {
      try {
        await baustelleUmnummern(id, neueNummer);
      } catch (e) {
        setSpeicherFehler(grundAus(e, 'Die Nummer konnte nicht geändert werden.'));
        setSpeichert(false);
        return;
      }
    }
    try {
      await updateProject(id, {
        customerId: entwurf.customerId || undefined,
        customerName: entwurf.customerName,
        bezeichnung: entwurf.bezeichnung.trim(),
        address: entwurf.address,
        status: entwurf.status,
        // Leer heisst „nicht festgelegt" — der Schein rechnet dann mit Regie,
        // wie bisher. Eine leere Zeichenkette in die Daten zu schreiben wäre
        // ein dritter Zustand, den niemand entworfen hat.
        billingMode: entwurf.billingMode || undefined,
        // Leeres Feld heisst „kein Budget" — dann bleibt die Ampel der
        // Projektauswertung bewusst aus, statt 0 h anzunehmen.
        estimatedHours: stundenbudgetAus(entwurf.estimatedHours),
        description: entwurf.description,
        startDate: entwurf.startDate,
        endDate: entwurf.endDate,
        contactName: entwurf.contactName,
        contactPhone: entwurf.contactPhone,
        assignedEmployees: entwurf.assignedEmployees,
        projectManagers: entwurf.projectManagers,
      });
      setBearbeitet(false);
      toast.success(nummerNeu ? `Baustelle gespeichert — jetzt ${neueNummer}` : 'Baustelle gespeichert');
      setVersuch((v) => v + 1);
    } catch {
      setSpeicherFehler(
        nummerNeu
          ? `Die Nummer ist auf ${neueNummer} geändert, die übrigen Angaben aber nicht gespeichert.`
          : 'Die Baustelle konnte nicht gespeichert werden.',
      );
      // Die Nummer steht bereits neu — die Akte muss sie zeigen.
      if (nummerNeu) setVersuch((v) => v + 1);
    } finally {
      setSpeichert(false);
    }
  }

  if (baustelle.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Baustelle" />
        <Card><SkeletonList rows={4} /></Card>
      </div>
    );
  }

  if (baustelle.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Baustelle" />
        <Card>
          <ErrorState
            message="Die Baustelle konnte nicht geladen werden."
            onRetry={() => setVersuch((v) => v + 1)}
          />
        </Card>
      </div>
    );
  }

  const b = baustelle.daten;
  if (!b) {
    return (
      <div className="space-y-6">
        <PageHeader title="Baustelle" />
        <Card>
          {/*
            „Nicht gefunden" ist etwas anderes als „nicht geladen". Wer einem
            alten Lesezeichen folgt, soll das erfahren und nicht auf einen
            Ladefehler schliessen.
          */}
          <EmptyState
            action={<Link to="/admin-projects" className="link-weiter">Zur Baustellenliste</Link>}
          >
            Diese Baustelle gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  const verlauf = verlaufPunkte(b, angebote, todayStr());
  const auftrag = (
    <Card title="Auftrag" id="b-ueberblick">
      <AktenAngaben>
        <AktenAngabe wort="Auftragsumfang" breit><span className="whitespace-pre-line">{b.description?.trim() || 'nicht hinterlegt'}</span></AktenAngabe>
        <AktenAngabe wort="Abrechnung">{b.billingMode ? abrechnungText(b.billingMode) : 'nicht festgelegt'}</AktenAngabe>
        <AktenAngabe wort="Stundenbudget">{b.estimatedHours ? `${fmtStunden(b.estimatedHours)} h` : 'nicht festgelegt'}</AktenAngabe>
        <AktenAngabe wort="Beginn">{fmtDatum(b.startDate)}</AktenAngabe>
        <AktenAngabe wort="Ende (geplant)">{fmtDatum(b.endDate)}</AktenAngabe>
      </AktenAngaben>
      {(b.billingMode === 'Pauschal' || b.billingMode === 'Einheitspreis') &&
        <PauschalHinweis angebote={angebote} sichtbar={angeboteSichtbar} art={b.billingMode} />}
      {user && <Suspense fallback={<p className="text-sm text-ink-muted">Stunden werden geladen …</p>}>
        <BaustellenUebersicht companyId={user.companyId} projekt={b} kompakt />
      </Suspense>}
      <div className="flex flex-wrap items-center gap-x-4">
        {angebote.map((q) => <Link key={q.id} to={`/quotes/${q.id}`} className="link akten-verweis">Angebot {q.quoteNumber}</Link>)}
      </div>
      {verlauf.length > 1 && <details className="akten-weitere"><summary>Verlauf der Baustelle</summary>
        <LotVerlauf name="Verlauf der Baustelle" punkte={verlauf} />
      </details>}
    </Card>
  );
  const kundeOrt = <Card title="Kunde und Ort" id="b-daten">
    <AktenAngaben>
      <AktenAngabe wort="Kunde" breit>{b.customerId
        ? <Link to={`/customers/${b.customerId}`} className="link inline-flex min-h-touch items-center">{b.customerName} · Zur Kundenakte</Link>
        : <span className="text-warning">Kein Kunde verknüpft — bisher nur als Text: „{b.customerName}".</span>}</AktenAngabe>
      <AktenAngabe wort="Ansprechpartner vor Ort">{b.contactName}</AktenAngabe>
      <AktenAngabe wort="Baustellenadresse" breit>{b.address?.trim() ? <AdresseLink adresse={b.address} /> : null}</AktenAngabe>
      <AktenAngabe wort="Telefon vor Ort" breit>{b.contactPhone?.trim() ? <TelefonLink nummer={b.contactPhone} name={b.contactName} /> : null}</AktenAngabe>
      {b.bezeichnung?.trim() && <AktenAngabe wort="Bezeichnung">{b.bezeichnung}</AktenAngabe>}
    </AktenAngaben>
  </Card>;
  const team = <Card title="Team und Leitung" id="b-team">
    <AktenAngaben>
      <AktenAngabe wort="Team" breit>{namenDa ? (b.assignedEmployees ?? []).map((u) => namen.get(u) ?? u).join(', ') || 'kein Team'
        : <Wert bereit={false} muster="Monteur Muster, Monteur Muster">{null}</Wert>}</AktenAngabe>
      <AktenAngabe wort="Projektleitung" breit>{namenDa ? (b.projectManagers?.length
        ? b.projectManagers.map((u) => namen.get(u) ?? u).join(', ') : <span className="text-warning">keine Projektleitung</span>)
        : <Wert bereit={false} muster="Paul Projektleiter">{null}</Wert>}</AktenAngabe>
    </AktenAngaben>
    {namenDa && !b.projectManagers?.length && <Hinweiszeile stufe="warn"><p>Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle niemanden. Die Verwaltung wird weiterhin verständigt.</p></Hinweiszeile>}
  </Card>;
  const plaene = user ? (
    <Card title="Pläne und Dokumente" id="b-plaene">
      <BaustellenPlaene
        companyId={user.companyId}
        projectId={b.id}
        darfAendern={darfAendern}
        meinName={user.name}
        personen={users.map((u) => u.name)}
      />
    </Card>
  ) : null;
  /*
    DIE HANDWERKSSCHEINE DER BAUSTELLE (09.10.2026): nur mit dem Modul und für
    die, die die Scheinliste sehen dürfen — dieselbe Regel wie der Menüpunkt.
  */
  const scheineSichtbar = !!user && scheineAn && canAccess(user.role, '/worksheets', company?.modules);
  const scheineKarte = user && scheineSichtbar ? (
    <Card
      title="Handwerksscheine"
      id="b-scheine"
      buendig
      // Wie „Termin anlegen“ bei den Terminen: der nächste Schritt im Kopf der Karte.
      action={
        <Link
          to={`/worksheet?projekt=${encodeURIComponent(b.projectNumber)}`}
          className="link inline-flex min-h-touch items-center"
        >
          Handwerksschein schreiben
        </Link>
      }
    >
      <BaustellenScheine
        companyId={user.companyId}
        projectNumber={b.projectNumber}
        verrechnungSehen={canInvoice(user.role)}
        onStand={setScheinStand}
      />
    </Card>
  ) : null;
  // Termine gehören zur Einsatzplanung: ohne das Modul gibt es sie nicht.
  const termineKarte = einsatzAn ? (
    <div id="b-termine">
      <TermineKarte titel="Termine" onStand={setTerminStand} vorgabe={{ bezug: 'baustelle', projectNumber: b.projectNumber }} />
    </div>
  ) : null;

  return (
    <div className="akten-seite">
      {warnung}
      <AktenKopf art="Baustelle" zurueck="/admin-projects" zurueckText="Zur Baustellenliste"
        meta={<span className="akten-identitaet">
            <span className="nr">{b.projectNumber}</span>
            {b.billingMode ? ` · ${abrechnungText(b.billingMode)}` : ''}
            <StatusBadge status={b.status} />
          </span>}
        title={baustellenTitel(b)}
        kontakt={<><TelefonLink nummer={b.contactPhone} name={b.contactName} /><a className="akten-verweis" href="#baustelle-kontext">Adresse und Kontakt</a></>}
        action={(scheineSichtbar || darfAendern) && <div className="akten-aktionen">
          {scheineSichtbar && <Link to={`/worksheet?projekt=${encodeURIComponent(b.projectNumber)}`} className="inline-flex min-h-touch items-center justify-center rounded bg-brand px-4 py-2 text-fliess font-semibold text-brand-fg">Schein schreiben</Link>}
          {darfAendern && <Button variant={scheineSichtbar ? 'secondary' : 'primary'} onClick={() => setBearbeitet(true)}>Bearbeiten</Button>}
        </div>}
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <AktenBereiche kennung="baustelle" kontext={<>{kundeOrt}{team}</>} bereiche={[
        { id: 'uebersicht', titel: 'Übersicht', sprungziele: ['b-ueberblick', 'b-daten'], inhalt:
          <div className="akten-spalte">{auftrag}
            {einsatzAn && <AktenTerminVorschau stand={terminStand} bereich="planung" />}
            {scheineSichtbar && <Card title="Jüngste Handwerksscheine" action={<AktenVerweis bereich="dokumente">Alle Scheine →</AktenVerweis>}>
              {scheinStand.fehler ? <TeilFehler was="die Handwerksscheine" /> : scheinStand.scheine === null ? <SkeletonList rows={2} />
                : scheinStand.scheine.length === 0 ? <EmptyState>Zu dieser Baustelle gibt es noch keinen Handwerksschein.</EmptyState>
                : <List><ScheinZeilen scheine={scheinStand.scheine.slice(0, 3)} verrechnet={user && canInvoice(user.role) ? scheinStand.verrechnet : new Set()} /></List>}
            </Card>}
          </div> },
        ...(scheineKarte ? [{ id: 'dokumente', titel: 'Scheine', sprungziele: ['b-scheine'], inhalt: scheineKarte }] : []),
        { id: 'planung', titel: 'Termine', sprungziele: ['b-termine', 'b-team'], inhalt:
          termineKarte || <Card title="Termine"><p className="text-sm text-ink-muted">Die Einsatzplanung ist für diesen Betrieb nicht aktiviert.</p></Card> },
        { id: 'plaene', titel: 'Pläne', sprungziele: ['b-plaene'], inhalt: plaene },
      ]} />
      {darfAendern && entwurf && <AktenBearbeiten offen={bearbeitet} titel="Baustelle bearbeiten"
        geaendert={geaendert} speichert={speichert} onSchliessen={() => setBearbeitet(false)} onVerwerfen={() => { setEntwurf(alsEntwurf(b)); setSpeicherFehler(null); }}>
        <StammdatenFormular entwurf={entwurf} setEntwurf={setEntwurf} staff={staff} leads={leads} namenDa={namenDa}
          geaendert={geaendert} speichert={speichert} fehler={speicherFehler} onSpeichern={() => void stammdatenSpeichern()}
          onVerwerfen={() => setEntwurf(alsEntwurf(b))} angebote={angebote} angeboteSichtbar={angeboteSichtbar} />
      </AktenBearbeiten>}

      <ConfirmDialog
        open={!!nummerFragen}
        title="Projektnummer ändern?"
        confirmLabel="Nummer ändern"
        confirmTone="primary"
        message={
          nummerFragen
            ? `Aus ${nummerFragen.alt} wird ${nummerFragen.neu}. Zeitbuchungen, Einsätze, Rüstlisten, Schein-Entwürfe, Anforderungen und Angebote wandern mit. Steht die Nummer schon auf einer Rechnung oder einem unterschriebenen Schein, bleibt sie.`
            : ''
        }
        onCancel={() => setNummerFragen(null)}
        onConfirm={() => {
          setNummerFragen(null);
          void stammdatenSpeichern(true);
        }}
      />

    </div>
  );
}

/**
 * DER VERLAUF DER BAUSTELLE als Lot — nur aus dem, was die Akte schon lädt:
 * die Angebote (sofern die Rolle sie lesen darf), Beginn, heute und das
 * geplante Ende. Kein Punkt wird erfunden: fehlt ein Datum, fehlt der Punkt.
 * „Heute“ ist der Ring, solange die Baustelle nicht abgeschlossen ist.
 */
function verlaufPunkte(b: Project, angebote: Quote[], heute: string): LotPunkt[] {
  const punkte: (LotPunkt & { datum: string })[] = [];
  for (const q of angebote) {
    punkte.push({
      titel: `Angebot ${q.quoteNumber}`,
      zeit: fmtDatum(q.quoteDate) || undefined,
      text: q.status,
      datum: q.quoteDate ?? '',
    });
  }
  if (b.startDate) {
    punkte.push({
      titel: b.startDate > heute ? 'Beginn geplant' : 'Beginn',
      zeit: fmtDatum(b.startDate),
      datum: b.startDate,
    });
  }
  if (b.status !== 'Abgeschlossen') {
    punkte.push({ titel: `Heute · ${b.status}`, zeit: fmtDatum(heute), jetzt: true, datum: heute });
  }
  if (b.endDate) {
    punkte.push({
      titel: b.status === 'Abgeschlossen' ? 'Ende' : 'Ende geplant',
      zeit: fmtDatum(b.endDate),
      // Dieselbe Regel wie der Filter „Ende überschritten“ der Startseite.
      text: endeVorbei(b, heute) ? <Zustand stand="achtung">überschritten</Zustand> : undefined,
      datum: b.endDate,
    });
  }
  // Am selben Tag bleibt die Reihenfolge oben stehen (Angebot, Beginn, heute, Ende).
  return punkte
    .map((p, i) => ({ p, i }))
    .sort((x, y) => x.p.datum.localeCompare(y.p.datum) || x.i - y.i)
    .map(({ p }) => ({ titel: p.titel, zeit: p.zeit, text: p.text, jetzt: p.jetzt }));
}

/**
 * Im Bearbeitungsfenster bleiben alle Felder offen. Die Orientierung kommt
 * aus den Überschriften; zusätzliche Aufklappzustände würden Felder verstecken.
 */
function Gruppe({ name, children }: { name: string; children: React.ReactNode }) {
  return <section className="akten-editor-gruppe"><h3>{name}</h3>{children}</section>;
}

interface FormularProps {
  entwurf: BaustellenEntwurf;
  setEntwurf: (e: BaustellenEntwurf) => void;
  staff: AppUser[];
  leads: AppUser[];
  namenDa: boolean;
  geaendert: boolean;
  speichert: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onVerwerfen: () => void;
  /** Für den Hinweis, woher der Pauschalpreis kommt (M14). */
  angebote: Quote[];
  angeboteSichtbar: boolean;
}

/**
 * Dieselben Stammdaten, bearbeitbar.
 *
 * DIE ANRUF- UND KARTENVERWEISE BLEIBEN — und stehen jetzt oben. Ein
 * Eingabefeld allein nähme der Akte genau das, wofür die Projektleitung sie
 * aufmacht: die Adresse antippen und hinfahren. Sie folgen dem, was gerade
 * im Feld steht.
 */
function StammdatenFormular({
  entwurf, setEntwurf, staff, leads, namenDa,
  geaendert, speichert, fehler, onSpeichern, onVerwerfen, angebote, angeboteSichtbar,
}: FormularProps) {
  const setze = <F extends keyof BaustellenEntwurf>(feld: F, wert: BaustellenEntwurf[F]) =>
    setEntwurf({ ...entwurf, [feld]: wert });
  const companyId = useAuth().user?.companyId;
  /** Der Kunde der Baustelle — einzeln geholt, nicht der ganze Kundenstamm (Ladezeit, 19.10.2026). */
  const [kunde, setKunde] = useKunde(companyId, entwurf.customerId);
  const pauschal = entwurf.billingMode === 'Pauschal' || entwurf.billingMode === 'Einheitspreis';

  return (
    <>
      <div className="min-w-0">
        {/* Anrufen und hinfahren, ohne erst aufzuklappen. */}
        <div className="akte-griffe">
          <AdresseLink adresse={entwurf.address} variante="knopf" />
          <TelefonLink nummer={entwurf.contactPhone} name={entwurf.contactName} variante="knopf" />
        </div>

        <Gruppe name="Kunde und Ort">
          {/*
            Kunde AUSWÄHLEN statt tippen: zwei Schreibweisen ergäben zwei Kunden,
            beide unvollständig. Der Name wandert als Kopie mit, weil die
            Baustellenlisten ihn zeigen, ohne den Kundenstamm zu laden.
          */}
          {companyId && (
            <KundenAuswahl
              companyId={companyId}
              id="b-kunde"
              pflicht
              value={entwurf.customerId}
              kunde={kunde}
              onChange={(id, gewaehlt) => {
                const vorher = kunde?.address;
                setKunde(gewaehlt);
                setEntwurf({
                  ...entwurf,
                  customerId: id,
                  customerName: gewaehlt?.name ?? entwurf.customerName,
                  // G5: die Anschrift des Kunden als Vorschlag — nur in ein leeres
                  // Feld oder statt des unveränderten Vorschlags des vorigen Kunden.
                  address: !entwurf.address || entwurf.address === vorher ? (gewaehlt?.address ?? '') : entwurf.address,
                });
              }}
            />
          )}
          <InputField
            id="b-bezeichnung" label="Bezeichnung (freiwillig)" placeholder="z. B. Bad 2. OG"
            maxLength={120} value={entwurf.bezeichnung}
            onChange={(e) => setze('bezeichnung', e.target.value)}
          />
          {/* Ausdrücklich die BAUSTELLENadresse: die Rechnungsadresse steht beim
              Kunden, und eine Hausverwaltung hat zwanzig Baustellen. */}
          <AdresseFeld
            id="b-adresse" label="Baustellenadresse" value={entwurf.address}
            vorschlag={kunde?.address}
            onChange={(t) => setze('address', t)}
          />
          {/* Der Monteur braucht vor Ort vor allem eine Telefonnummer. */}
          <FormGrid>
            <InputField
              id="b-ansprech" label="Ansprechpartner vor Ort" value={entwurf.contactName}
              onChange={(e) => setze('contactName', e.target.value)}
            />
            <InputField
              id="b-telefon" label="Telefon vor Ort" type="tel" value={entwurf.contactPhone}
              onChange={(e) => setze('contactPhone', e.target.value)}
            />
          </FormGrid>
        </Gruppe>
        {!entwurf.customerId && entwurf.customerName && (
          <div className="akte-hinweis">
            <p className="text-sm text-warning">
              Bisher als Text hinterlegt: „{entwurf.customerName}". Bitte den passenden Kunden
              wählen — oder in der{' '}
              <Link to="/customers" className="link-hinweis-weiter">Kundenverwaltung</Link>{' '}
              anlegen.
            </p>
          </div>
        )}

        <Gruppe name="Auftrag">
          <FormGrid>
            <InputField
              id="b-nummer" label="Projektnummer" pflicht value={entwurf.projectNumber}
              onChange={(e) => setze('projectNumber', e.target.value)}
            />
            <SelectField
              id="b-status" label="Status" value={entwurf.status}
              onChange={(e) => setze('status', e.target.value as Project['status'])}
            >
              <option>Aktiv</option>
              <option>Pausiert</option>
              <option>Abgeschlossen</option>
            </SelectField>
            {/*
              DIE ABRECHNUNGSART WAR NIRGENDS ÄNDERBAR. Der Handwerksschein liest
              sie (auf einer Regiebaustelle sind die bestätigten Stunden die
              Rechnungsgrundlage, auf einer Pauschalbaustelle belegt derselbe
              Schein nur, DASS gearbeitet wurde) — geschrieben wurde sie aber nur
              beim Umwandeln eines Angebots.
            */}
            <SelectField
              id="b-abrechnung" label="Abrechnung" value={entwurf.billingMode}
              onChange={(e) => setze('billingMode', e.target.value as BaustellenEntwurf['billingMode'])}
            >
              <option value="">— nicht festgelegt (gilt als Regie) —</option>
              {ABRECHNUNGSARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>{a.text}</option>
              ))}
            </SelectField>
            <ZahlFeld
              id="b-budget" label="Stundenbudget (kalkuliert)"
              placeholder="z. B. 40" value={entwurf.estimatedHours}
              onChange={(t) => setze('estimatedHours', t)}
            />
          </FormGrid>
          <TextareaField
            id="b-beschreibung" label="Beschreibung / Auftragsumfang"
            value={entwurf.description}
            onChange={(e) => setze('description', e.target.value)}
          />
        </Gruppe>
        {pauschal && (
          <div className="akte-hinweis">
            <PauschalHinweis
              angebote={angebote}
              sichtbar={angeboteSichtbar}
              art={entwurf.billingMode as 'Pauschal' | 'Einheitspreis'}
            />
          </div>
        )}

        <Gruppe name="Zeitraum">
          <FormGrid>
            <InputField
              id="b-beginn" label="Beginn" type="date" value={entwurf.startDate}
              onChange={(e) => setze('startDate', e.target.value)}
            />
            <InputField
              id="b-ende" label="Ende (geplant)" type="date" value={entwurf.endDate}
              onChange={(e) => setze('endDate', e.target.value)}
            />
          </FormGrid>
        </Gruppe>
        <div className="akte-hinweis">
          <BetriebsurlaubHinweis companyId={companyId} von={entwurf.startDate} bis={entwurf.endDate} />
        </div>

        <Gruppe name="Mannschaft">
          {!namenDa ? (
            <SkeletonList rows={4} />
          ) : (
            <>
              <PersonPicker
                legend="Zugeordnete Mitarbeiter"
                idPrefix="akte-emp"
                people={staff.map((u) => ({ uid: u.uid, name: u.name }))}
                selected={entwurf.assignedEmployees}
                onChange={(w) => setze('assignedEmployees', w)}
                emptyHint="Keine aktiven Monteure vorhanden."
              />
              <PersonPicker
                legend="Verantwortliche Projektleitung"
                idPrefix="akte-lead"
                people={leads.map((u) => ({ uid: u.uid, name: u.name, hint: u.role }))}
                selected={entwurf.projectManagers}
                onChange={(w) => setze('projectManagers', w)}
                emptyHint="Keine Projektleitung angelegt."
              />
            </>
          )}
        </Gruppe>
        {/* Ohne Zuständige läuft eine Eilbestellung ins Leere — das gehört
            gesagt, nicht erst, wenn ein Monteur wartet. */}
        {entwurf.projectManagers.length === 0 && (
          <div className="akte-hinweis">
            <Hinweiszeile stufe="warn">
              <p>
                Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle
                niemanden. Die Verwaltung wird weiterhin verständigt.
              </p>
            </Hinweiszeile>
          </div>
        )}
      </div>

      {fehler && <p role="alert" className="mt-4 text-sm text-danger">{fehler}</p>}

      {/*
        DER BALKEN ERSCHEINT ERST BEI EINER ÄNDERUNG — als Aktionsleiste, wie
        am Buchungsformular: am Telefon klebt sie ÜBER der Reiterleiste, am
        Schreibtisch steht sie rechtsbündig unter den Daten. So ist
        „Speichern" nach einer Änderung zu erreichen, ohne ans Ende zu rollen.
      */}
      {geaendert && (
        <Aktionsleiste
          summe={{ name: 'Es gibt ungespeicherte Änderungen.', wert: null }}
          links={
            <Button variant="ghost" onClick={onVerwerfen} disabled={speichert}>
              Verwerfen
            </Button>
          }
          rechts={
            <Button onClick={onSpeichern} loading={speichert}>
              Speichern
            </Button>
          }
        />
      )}
    </>
  );
}

/**
 * WOHER DER PREIS EINER PAUSCHALBAUSTELLE KOMMT (Testbericht 30.09.2026, M14).
 *
 * Die Akte hat bewusst KEIN Preisfeld: eine Baustelle liest jeder im Betrieb,
 * auch der Monteur — ein Preis dort wäre für alle lesbar, während Angebote
 * Büro und Leitung vorbehalten sind. Der Preis steht im angenommenen Angebot;
 * ohne Angebot trägt ihn die Rechnung ein. Das sagt dieser Hinweis, statt die
 * Frage offen zu lassen.
 */
function PauschalHinweis({
  angebote,
  sichtbar,
  art,
}: {
  angebote: Quote[];
  sichtbar: boolean;
  art: 'Pauschal' | 'Einheitspreis';
}) {
  const angebot = sichtbar ? pauschalAngebot(angebote) : null;
  const text =
    art === 'Einheitspreis'
      ? angebot
        ? `Die Einheitspreise kommen aus dem angenommenen Angebot ${angebot.quoteNumber}. Die Rechnung übernimmt dessen Positionen; die Mengen trägt man nach Aufmaß ein.`
        : sichtbar
          ? 'Einheitspreis ohne angenommenes Angebot: die Preise stehen noch nirgends. Die Rechnung setzt eine leere Zeile an — dort Positionen, Mengen nach Aufmaß und Preise eintragen. Oder ein Angebot anlegen und annehmen.'
          : 'Die Einheitspreise legt das angenommene Angebot fest; die Mengen kommen aus dem Aufmaß.'
      : angebot
        ? `Den Pauschalpreis legt das angenommene Angebot ${angebot.quoteNumber} fest (${euro(angebot.totalNetto)} netto). Die Rechnung übernimmt dessen Positionen.`
        : sichtbar
          ? 'Pauschal ohne angenommenes Angebot: der vereinbarte Preis steht noch nirgends. Die Rechnung setzt eine Zeile „Pauschale gemäß Vereinbarung“ mit 0,00 € an — dort den Betrag eintragen. Oder ein Angebot anlegen und annehmen, dann übernimmt die Rechnung dessen Positionen.'
          : 'Den Pauschalpreis legt das angenommene Angebot fest; ohne Angebot trägt ihn das Büro in der Rechnung ein.';
  return (
    <Hinweiszeile stufe={sichtbar && !angebot ? 'warn' : undefined}>
      <p>{text}</p>
    </Hinweiszeile>
  );
}
