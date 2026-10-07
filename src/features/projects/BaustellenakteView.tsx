import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import BetriebsurlaubHinweis from './BetriebsurlaubHinweis';
import { baustelleUmnummern, listProjectsByIds, updateProject } from '@/lib/db/projects';
import { alsEntwurf, gleich, stammdatenFehler, stundenbudgetAus, type BaustellenEntwurf } from './baustellenEntwurf';
import BaustellenPlaene from './BaustellenPlaene';
import { listUsers } from '@/lib/db/users';
import { listCustomers } from '@/lib/db/customers';
import { listQuotesForProject } from '@/lib/db/quotes';
import { pauschalAngebot } from '@/features/invoices/pauschale';
import { ABRECHNUNGSARTEN, abrechnungText } from '@/lib/abrechnung';
import { euro } from '@/lib/betrag';
import { canAccess } from '@/app/navigation';
import { isGF } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import type { Abrechnungsart, Project, AppUser, Customer, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Aktionsleiste from '@/components/Aktionsleiste';
import Hinweiszeile from '@/components/Hinweiszeile';
import Aktenspalten from '@/components/Aktenspalten';
import TermineKarte from '@/features/termine/TermineKarte';
import Button from '@/components/Button';
import { Marke, Zustand } from '@/components/Badge';
import { LotVerlauf, Sprungleiste, type LotPunkt } from '@/components/LotBausteine';
import { endeVorbei } from './baustellenLage';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import PersonPicker from '@/components/PersonPicker';
import ConfirmDialog from '@/components/ConfirmDialog';
import KundenGrenze from '@/components/AuswahlGrenze';
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
  const [users, setUsers] = useState<AppUser[]>([]);
  const [kunden, setKunden] = useState<(Customer & { id: string })[]>([]);
  /** Ein Nebenladevorgang ist ausgefallen — die Stammdaten stehen trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  const [entwurf, setEntwurf] = useState<BaustellenEntwurf | null>(null);
  const [speichert, setSpeichert] = useState(false);
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

    Der Kundenstamm bleibt dagegen den Ändernden vorbehalten: er füllt nur
    das Auswahlfeld, und der Kundenname steht ohnehin auf der Baustelle.
  */
  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    void (async () => {
      try {
        const [u, k] = await Promise.all([
          listUsers(companyId),
          darfAendern ? listCustomers(companyId) : Promise.resolve([]),
        ]);
        if (weg) return;
        setUsers(u);
        setKunden(k);
      } catch {
        // Ohne Hinweis blieben Team und Kundenauswahl einfach leer, und es
        // sähe aus, als hätte der Betrieb weder Monteure noch Kunden.
        if (!weg) setNebenFehler(darfAendern ? 'Belegschaft und Kundenstamm' : 'Belegschaft');
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, darfAendern]);

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

  /*
    DIE AKTE IN DER LINIE „LOT“ (Schritt E7): zuerst die Zusammenfassung —
    wie die Baustelle steht (Stunden), wo sie zeitlich steht (Verlauf) und
    die Wege weiter —, dann die Einzelheiten. Die Stammdaten stehen als
    Kurzzeilen da: ihr Kopf sagt schon das Wichtigste, aufgeklappt wird zum
    Nachlesen oder Ändern. Hinweise und Warnungen stehen UNTER der jeweiligen
    Kurzzeile und bleiben damit sichtbar, auch wenn sie zu ist.

    Am Schreibtisch ordnet `Aktenspalten` wie bisher: links die Stammdaten,
    rechts Termine und Pläne; die Sprungleiste steht links daneben.
  */
  const verlauf = verlaufPunkte(b, angebote, todayStr());
  const ueberblick = (
    <Card title="Überblick" id="b-ueberblick">
      <div className="flex flex-col gap-4">
        {/*
          DIE STUNDEN STEHEN IN DER AKTE, nicht mehr aufgeklappt in der
          Listenzeile. Dieselbe Auswertung, derselbe Baustein — nur an einem
          Ort, der eine Adresse hat.
        */}
        {user && (
          <Suspense fallback={<p className="text-sm text-ink-muted">Stunden werden geladen …</p>}>
            <BaustellenUebersicht companyId={user.companyId} projekt={b} />
          </Suspense>
        )}
        {/* Aus dem, was die Akte ohnehin lädt: Angebote, Beginn, heute, Ende. */}
        {verlauf.length > 1 && (
          <div className="border-t border-line pt-4">
            <LotVerlauf name="Verlauf der Baustelle" punkte={verlauf} />
          </div>
        )}
        {/* Die Links tragen ihre 48 px Tastfläche selbst — deshalb kein
            senkrechter Abstand dazwischen (Prüflauf 25.09.2026, P4-09). */}
        <div className="flex flex-wrap items-center gap-x-3 border-t border-line pt-1">
          {b.customerId ? (
            <Link to={`/customers/${b.customerId}`} className="link inline-flex min-h-touch items-center">
              Zur Kundenakte
            </Link>
          ) : (
            /*
              Altbestand: die Baustelle trägt einen Kundennamen, aber keine
              Verknüpfung. Das stumm zu lassen hiesse, den fehlenden Verweis
              wie „gibt es nicht" aussehen zu lassen.
            */
            <span className="py-3 text-sm text-warning">
              Kein Kunde verknüpft — bisher nur als Text: „{b.customerName}".
            </span>
          )}
          {angebote.map((q) => (
            <Link key={q.id} to={`/quotes/${q.id}`} className="link inline-flex min-h-touch items-center">
              Angebot {q.quoteNumber}
            </Link>
          ))}
          {scheineAn && (
            <Link
              to={`/worksheet?projekt=${encodeURIComponent(b.projectNumber)}`}
              className="link inline-flex min-h-touch items-center"
            >
              Handwerksschein schreiben
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
  const stammdaten = (
    <Card title="Stammdaten" id="b-daten">
      {darfAendern && entwurf ? (
        <StammdatenFormular
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          kunden={kunden}
          staff={staff}
          leads={leads}
          namen={namen}
          geaendert={geaendert}
          speichert={speichert}
          fehler={speicherFehler}
          onSpeichern={() => void stammdatenSpeichern()}
          onVerwerfen={() => setEntwurf(alsEntwurf(b))}
          angebote={angebote}
          angeboteSichtbar={angeboteSichtbar}
        />
      ) : (
        <StammdatenLesen b={b} namen={namen} />
      )}
    </Card>
  );
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
  // Termine gehören zur Einsatzplanung: ohne das Modul gibt es sie nicht.
  const termineKarte = einsatzAn ? (
    <div id="b-termine">
      <TermineKarte titel="Termine" vorgabe={{ bezug: 'baustelle', projectNumber: b.projectNumber }} />
    </div>
  ) : null;

  return (
    <div className="space-y-3 lg:space-y-5">
      {warnung}
      <PageHeader
        ort={
          <>
            <span className="nr">{b.projectNumber}</span>
            {b.billingMode ? ` · ${abrechnungText(b.billingMode)}` : ''}
          </>
        }
        title={baustellenTitel(b)}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/admin-projects" className="link inline-flex min-h-touch items-center">← Zur Baustellenliste</Link>
            <StatusBadge status={b.status} />
            {b.estimatedHours ? <Marke>{fmtStunden(b.estimatedHours)} h Budget</Marke> : null}
          </span>
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <div className="akte">
        <Sprungleiste
          ziele={[
            { id: 'b-ueberblick', text: 'Überblick' },
            ...(einsatzAn ? [{ id: 'b-termine', text: 'Termine' }] : []),
            { id: 'b-daten', text: 'Daten' },
            ...(plaene ? [{ id: 'b-plaene', text: 'Pläne' }] : []),
          ]}
        />
        <div className="akte-spalte">
          {ueberblick}
          <Aktenspalten
            telefon={[termineKarte, stammdaten, plaene]}
            links={[stammdaten]}
            rechts={[termineKarte, plaene]}
          />
        </div>
      </div>

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
 * Eine Kurzzeile der Stammdaten: Kopf wie `Kurzzeile` (Klassen aus lot.css),
 * der Inhalt aber in voller Breite. `Kurzzeile` rückt ihn ab dem Tablet um
 * 12 rem ein — für ein Formular in der halben Spalte des Schreibtischs blieb
 * danach kaum Platz (Änderungswunsch an `LotBausteine`: eine Angabe `breit`).
 */
function Gruppe({ name, wert, children }: { name: string; wert: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="kurz">
      <summary className="kurz-kopf">
        <span className="kurz-name">{name}</span>
        <span className="kurz-wert">{wert}</span>
        <span className="kurz-zeichen" aria-hidden="true">›</span>
      </summary>
      <div className="akte-gruppe-inhalt">{children}</div>
    </details>
  );
}

/** Was die Köpfe der Kurzzeilen zusammenfassen — für Lesen und Ändern gleich. */
function koepfe(d: {
  customerName: string;
  address?: string;
  status: string;
  billingMode?: Abrechnungsart;
  estimatedHours?: number | string;
  startDate?: string;
  endDate?: string;
  team: string[];
  leitung: string[];
}) {
  const budget = typeof d.estimatedHours === 'string' ? stundenbudgetAus(d.estimatedHours) : d.estimatedHours;
  return {
    kundeOrt: [d.customerName, d.address].filter(Boolean).join(' · ') || 'nicht hinterlegt',
    auftrag: [
      d.status,
      d.billingMode ? abrechnungText(d.billingMode) : 'Abrechnung nicht festgelegt',
      budget ? `${fmtStunden(budget)} h Budget` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    zeitraum:
      d.startDate || d.endDate
        ? `${fmtDatum(d.startDate) || 'offen'} – ${fmtDatum(d.endDate) || 'offen'}`
        : 'nicht festgelegt',
    mannschaft: (
      <>
        {d.team.length > 0 ? d.team.join(', ') : 'kein Team'}
        {' · '}
        {d.leitung.length > 0 ? (
          `Leitung: ${d.leitung.join(', ')}`
        ) : (
          <span className="text-warning">keine Projektleitung</span>
        )}
      </>
    ),
  };
}

/** Die Stammdaten für alle, die sie nicht ändern dürfen. */
function StammdatenLesen({ b, namen }: { b: Project; namen: Map<string, string> }) {
  const team = (b.assignedEmployees ?? []).map((u) => namen.get(u) ?? u);
  const leitung = (b.projectManagers ?? []).map((u) => namen.get(u) ?? u);
  const k = koepfe({ ...b, team, leitung });
  return (
    <div className="-mx-4 -mb-4">
      {/* Anrufen und hinfahren, ohne erst aufzuklappen. */}
      <div className="akte-griffe">
        <AdresseLink adresse={b.address} variante="knopf" />
        <TelefonLink nummer={b.contactPhone} name={b.contactName} variante="knopf" />
      </div>
      <Gruppe name="Kunde und Ort" wert={k.kundeOrt}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Kunde">{b.customerName}</Angabe>
          {b.bezeichnung?.trim() && <Angabe wort="Bezeichnung">{b.bezeichnung}</Angabe>}
          <Angabe wort="Baustellenadresse">
            {b.address ? <AdresseLink adresse={b.address} /> : null}
          </Angabe>
          <Angabe wort="Ansprechpartner vor Ort">{b.contactName}</Angabe>
          <Angabe wort="Telefon vor Ort">
            {b.contactPhone ? <TelefonLink nummer={b.contactPhone} name={b.contactName} /> : null}
          </Angabe>
        </dl>
      </Gruppe>
      <Gruppe name="Auftrag" wert={k.auftrag}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Projektnummer"><span>{b.projectNumber}</span></Angabe>
          <Angabe wort="Abrechnung">{b.billingMode ? abrechnungText(b.billingMode) : null}</Angabe>
        </dl>
        {b.description?.trim() ? (
          <div className="border-t border-line pt-3">
            <p className="section-label">Beschreibung / Auftragsumfang</p>
            {/* Zeilenumbrüche bleiben: ein Auftragsumfang ist oft eine Liste. */}
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{b.description}</p>
          </div>
        ) : null}
      </Gruppe>
      <Gruppe name="Zeitraum" wert={k.zeitraum}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Beginn">{fmtDatum(b.startDate)}</Angabe>
          <Angabe wort="Ende (geplant)">{fmtDatum(b.endDate)}</Angabe>
        </dl>
      </Gruppe>
      <Gruppe name="Mannschaft" wert={k.mannschaft}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Team">{team.join(', ')}</Angabe>
          <Angabe wort="Projektleitung">{leitung.join(', ')}</Angabe>
        </dl>
      </Gruppe>
    </div>
  );
}

interface FormularProps {
  entwurf: BaustellenEntwurf;
  setEntwurf: (e: BaustellenEntwurf) => void;
  kunden: (Customer & { id: string })[];
  staff: AppUser[];
  leads: AppUser[];
  namen: Map<string, string>;
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
  entwurf, setEntwurf, kunden, staff, leads, namen,
  geaendert, speichert, fehler, onSpeichern, onVerwerfen, angebote, angeboteSichtbar,
}: FormularProps) {
  const setze = <F extends keyof BaustellenEntwurf>(feld: F, wert: BaustellenEntwurf[F]) =>
    setEntwurf({ ...entwurf, [feld]: wert });
  const companyId = useAuth().user?.companyId;
  const k = koepfe({
    ...entwurf,
    billingMode: entwurf.billingMode || undefined,
    team: entwurf.assignedEmployees.map((u) => namen.get(u) ?? u),
    leitung: entwurf.projectManagers.map((u) => namen.get(u) ?? u),
  });
  const pauschal = entwurf.billingMode === 'Pauschal' || entwurf.billingMode === 'Einheitspreis';

  return (
    <>
      <div className="-mx-4">
        {/* Anrufen und hinfahren, ohne erst aufzuklappen. */}
        <div className="akte-griffe">
          <AdresseLink adresse={entwurf.address} variante="knopf" />
          <TelefonLink nummer={entwurf.contactPhone} name={entwurf.contactName} variante="knopf" />
        </div>

        <Gruppe name="Kunde und Ort" wert={k.kundeOrt}>
          {/*
            Kunde AUSWÄHLEN statt tippen: zwei Schreibweisen ergäben zwei Kunden,
            beide unvollständig. Der Name wandert als Kopie mit, weil die
            Baustellenlisten ihn zeigen, ohne den Kundenstamm zu laden.
          */}
          <SelectField
            id="b-kunde" label="Kunde" pflicht value={entwurf.customerId}
            onChange={(e) => {
              const kunde = kunden.find((x) => x.id === e.target.value);
              const vorher = kunden.find((x) => x.id === entwurf.customerId)?.address;
              setEntwurf({
                ...entwurf,
                customerId: e.target.value,
                customerName: kunde?.name ?? entwurf.customerName,
                // G5: die Anschrift des Kunden als Vorschlag — nur in ein leeres
                // Feld oder statt des unveränderten Vorschlags des vorigen Kunden.
                address: !entwurf.address || entwurf.address === vorher ? (kunde?.address ?? '') : entwurf.address,
              });
            }}
          >
            <option value="">— wählen —</option>
            {kunden.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </SelectField>
          <KundenGrenze kunden={kunden} />
          <InputField
            id="b-bezeichnung" label="Bezeichnung (freiwillig)" placeholder="z. B. Bad 2. OG"
            maxLength={120} value={entwurf.bezeichnung}
            onChange={(e) => setze('bezeichnung', e.target.value)}
          />
          {/* Ausdrücklich die BAUSTELLENadresse: die Rechnungsadresse steht beim
              Kunden, und eine Hausverwaltung hat zwanzig Baustellen. */}
          <AdresseFeld
            id="b-adresse" label="Baustellenadresse" value={entwurf.address}
            vorschlag={kunden.find((x) => x.id === entwurf.customerId)?.address}
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

        <Gruppe name="Auftrag" wert={k.auftrag}>
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

        <Gruppe name="Zeitraum" wert={k.zeitraum}>
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

        <Gruppe name="Mannschaft" wert={k.mannschaft}>
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
 * Eine Angabe der Stammdaten.
 *
 * LEER HEISST „NICHT HINTERLEGT", und das steht auch da. Die Zeile
 * wegzulassen wäre bequemer und falsch: dann sähe eine Akte ohne
 * Ansprechpartner genauso aus wie eine, in der das Feld gar nicht vorgesehen
 * ist — und niemand käme auf die Idee, ihn nachzutragen.
 */
function Angabe({ wort, children }: { wort: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="section-label">{wort}</dt>
      <dd className="mt-0.5 text-sm text-ink">
        {children || <span className="text-ink-muted">nicht hinterlegt</span>}
      </dd>
    </div>
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
