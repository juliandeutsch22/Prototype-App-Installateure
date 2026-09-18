import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listProjectsByIds, updateProject } from '@/lib/db/projects';
import { alsEntwurf, gleich, type BaustellenEntwurf } from './baustellenEntwurf';
import { listUsers } from '@/lib/db/users';
import { listCustomers } from '@/lib/db/customers';
import { isGF } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import type { Project, AppUser, Customer } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import PersonPicker from '@/components/PersonPicker';
import KundenGrenze from '@/components/AuswahlGrenze';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';

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
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT') : '';

export default function BaustellenakteView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const scheineAn = useModul('scheine');

  const [baustelle, setBaustelle] = useState<Teil<WithId<Project> | null>>(LAEDT);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [kunden, setKunden] = useState<(Customer & { id: string })[]>([]);
  /** Ein Nebenladevorgang ist ausgefallen — die Stammdaten stehen trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  const [entwurf, setEntwurf] = useState<BaustellenEntwurf | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);

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
    Der Entwurf folgt der geladenen Baustelle — aber NUR, wenn diese sich
    wirklich geändert hat. Liefe er bei jedem Durchlauf mit, überschriebe
    jedes erneute Zeichnen die halb getippte Eingabe.
  */
  useEffect(() => {
    setEntwurf(daten ? alsEntwurf(daten) : null);
  }, [daten]);

  const geaendert = entwurf !== null && daten !== null && !gleich(entwurf, alsEntwurf(daten));

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

  async function stammdatenSpeichern(): Promise<void> {
    if (!companyId || !id || !entwurf) return;
    if (!entwurf.projectNumber.trim()) {
      setSpeicherFehler('Ohne Projektnummer geht es nicht — daran hängen Zeitbuchungen und Scheine.');
      return;
    }
    if (!entwurf.customerId && !entwurf.customerName.trim()) {
      setSpeicherFehler('Ohne Kunden geht es nicht — die Rechnung weiss sonst nicht, an wen.');
      return;
    }
    setSpeichert(true);
    setSpeicherFehler(null);
    try {
      await updateProject(id, {
        projectNumber: entwurf.projectNumber.trim(),
        customerId: entwurf.customerId || undefined,
        customerName: entwurf.customerName,
        address: entwurf.address,
        status: entwurf.status,
        // Leer heisst „nicht festgelegt" — der Schein rechnet dann mit Regie,
        // wie bisher. Eine leere Zeichenkette in die Daten zu schreiben wäre
        // ein dritter Zustand, den niemand entworfen hat.
        billingMode: entwurf.billingMode || undefined,
        // Leeres Feld heisst „kein Budget" — dann bleibt die Ampel der
        // Projektauswertung bewusst aus, statt 0 h anzunehmen.
        estimatedHours:
          entwurf.estimatedHours === '' ? undefined : Number(entwurf.estimatedHours) || 0,
        description: entwurf.description,
        startDate: entwurf.startDate,
        endDate: entwurf.endDate,
        contactName: entwurf.contactName,
        contactPhone: entwurf.contactPhone,
        assignedEmployees: entwurf.assignedEmployees,
        projectManagers: entwurf.projectManagers,
      });
      toast.success('Baustelle gespeichert');
      setVersuch((v) => v + 1);
    } catch {
      setSpeicherFehler('Die Baustelle konnte nicht gespeichert werden.');
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
            action={<Link to="/admin-projects" className="text-brand underline">Zur Baustellenliste</Link>}
          >
            Diese Baustelle gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={b.customerName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/admin-projects" className="text-brand underline">← Zur Baustellenliste</Link>
            <span className="tnum text-ink-muted">{b.projectNumber}</span>
            <StatusBadge status={b.status} />
            {b.estimatedHours ? <Marke>{b.estimatedHours} h Budget</Marke> : null}
          </span>
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <Card title="Stammdaten">
        {darfAendern && entwurf ? (
          <StammdatenFormular
            entwurf={entwurf}
            setEntwurf={setEntwurf}
            kunden={kunden}
            staff={staff}
            leads={leads}
            geaendert={geaendert}
            speichert={speichert}
            fehler={speicherFehler}
            onSpeichern={() => void stammdatenSpeichern()}
            onVerwerfen={() => setEntwurf(alsEntwurf(b))}
          />
        ) : (
          <StammdatenLesen b={b} namen={namen} />
        )}
      </Card>

      {/*
        DIE STUNDEN STEHEN IN DER AKTE, nicht mehr aufgeklappt in der
        Listenzeile. Dieselbe Auswertung, derselbe Baustein — nur an einem
        Ort, der eine Adresse hat.
      */}
      <Card title="Stunden auf dieser Baustelle">
        {user && (
          <Suspense fallback={<p className="text-sm text-ink-muted">Stunden werden geladen …</p>}>
            <BaustellenUebersicht companyId={user.companyId} projekt={b} />
          </Suspense>
        )}
      </Card>

      <Card title="Weiter">
        <div className="flex flex-wrap gap-3">
          {b.customerId ? (
            <Link to={`/customers/${b.customerId}`} className="text-brand underline">
              Zur Kundenakte
            </Link>
          ) : (
            /*
              Altbestand: die Baustelle trägt einen Kundennamen, aber keine
              Verknüpfung. Das stumm zu lassen hiesse, den fehlenden Verweis
              wie „gibt es nicht" aussehen zu lassen.
            */
            <span className="text-sm text-warning">
              Kein Kunde verknüpft — bisher nur als Text: „{b.customerName}".
            </span>
          )}
          {scheineAn && (
            <Link
              to={`/worksheet?projekt=${encodeURIComponent(b.projectNumber)}`}
              className="text-brand underline"
            >
              Handwerksschein schreiben
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Die Stammdaten für alle, die sie nicht ändern dürfen. */
function StammdatenLesen({ b, namen }: { b: Project; namen: Map<string, string> }) {
  const team = (b.assignedEmployees ?? []).map((u) => namen.get(u) ?? u);
  const leitung = (b.projectManagers ?? []).map((u) => namen.get(u) ?? u);
  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Angabe wort="Projektnummer"><span className="tnum">{b.projectNumber}</span></Angabe>
        <Angabe wort="Kunde">{b.customerName}</Angabe>
        <Angabe wort="Baustellenadresse">
          {b.address ? <AdresseLink adresse={b.address} /> : null}
        </Angabe>
        <Angabe wort="Abrechnung">{b.billingMode}</Angabe>
        <Angabe wort="Ansprechpartner vor Ort">{b.contactName}</Angabe>
        <Angabe wort="Telefon vor Ort">
          {b.contactPhone ? <TelefonLink nummer={b.contactPhone} name={b.contactName} /> : null}
        </Angabe>
        <Angabe wort="Beginn">{fmtDatum(b.startDate)}</Angabe>
        <Angabe wort="Ende (geplant)">{fmtDatum(b.endDate)}</Angabe>
        <Angabe wort="Team">{team.join(', ')}</Angabe>
        <Angabe wort="Projektleitung">{leitung.join(', ')}</Angabe>
      </dl>

      {b.description?.trim() ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="section-label">Beschreibung / Auftragsumfang</p>
          {/* Zeilenumbrüche bleiben: ein Auftragsumfang ist oft eine Liste. */}
          <p className="mt-1 whitespace-pre-line text-sm text-ink">{b.description}</p>
        </div>
      ) : null}
    </>
  );
}

interface FormularProps {
  entwurf: BaustellenEntwurf;
  setEntwurf: (e: BaustellenEntwurf) => void;
  kunden: (Customer & { id: string })[];
  staff: AppUser[];
  leads: AppUser[];
  geaendert: boolean;
  speichert: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onVerwerfen: () => void;
}

/**
 * Dieselben Stammdaten, bearbeitbar.
 *
 * DIE ANRUF- UND KARTENVERWEISE BLEIBEN. Ein Eingabefeld allein nähme der
 * Akte genau das, wofür die Projektleitung sie aufmacht: die Adresse antippen
 * und hinfahren. Sie folgen dem, was gerade im Feld steht.
 */
function StammdatenFormular({
  entwurf, setEntwurf, kunden, staff, leads,
  geaendert, speichert, fehler, onSpeichern, onVerwerfen,
}: FormularProps) {
  const setze = <F extends keyof BaustellenEntwurf>(feld: F, wert: BaustellenEntwurf[F]) =>
    setEntwurf({ ...entwurf, [feld]: wert });

  return (
    <div className="flex flex-col gap-4">
      <FormGrid>
        <InputField
          id="b-nummer" label="Projektnummer" pflicht value={entwurf.projectNumber}
          onChange={(e) => setze('projectNumber', e.target.value)}
        />
        {/*
          Kunde AUSWÄHLEN statt tippen: zwei Schreibweisen ergäben zwei Kunden,
          beide unvollständig. Der Name wandert als Kopie mit, weil die
          Baustellenlisten ihn zeigen, ohne den Kundenstamm zu laden.
        */}
        <SelectField
          id="b-kunde" label="Kunde" pflicht value={entwurf.customerId}
          onChange={(e) => {
            const k = kunden.find((x) => x.id === e.target.value);
            setEntwurf({
              ...entwurf,
              customerId: e.target.value,
              customerName: k?.name ?? entwurf.customerName,
            });
          }}
        >
          <option value="">— wählen —</option>
          {kunden.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </SelectField>
        <KundenGrenze kunden={kunden} />
        {!entwurf.customerId && entwurf.customerName && (
          <p className="text-sm text-warning sm:col-span-2">
            Bisher als Text hinterlegt: „{entwurf.customerName}". Bitte den passenden Kunden
            wählen — oder in der{' '}
            <Link to="/customers" className="font-semibold underline">Kundenverwaltung</Link>{' '}
            anlegen.
          </p>
        )}
        {/* Ausdrücklich die BAUSTELLENadresse: die Rechnungsadresse steht beim
            Kunden, und eine Hausverwaltung hat zwanzig Baustellen. */}
        <InputField
          id="b-adresse" label="Baustellenadresse" value={entwurf.address}
          onChange={(e) => setze('address', e.target.value)}
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
          beim Umwandeln eines Angebots. Wer sie korrigieren musste, konnte es
          nicht.
        */}
        <SelectField
          id="b-abrechnung" label="Abrechnung" value={entwurf.billingMode}
          onChange={(e) => setze('billingMode', e.target.value as BaustellenEntwurf['billingMode'])}
        >
          <option value="">— nicht festgelegt (gilt als Regie) —</option>
          <option value="Regie">Regie</option>
          <option value="Pauschal">Pauschal</option>
        </SelectField>
        <InputField
          id="b-budget" label="Stundenbudget (kalkuliert)" type="number" min="0" step="0.5"
          placeholder="z. B. 40" value={entwurf.estimatedHours}
          onChange={(e) => setze('estimatedHours', e.target.value)}
        />
        <InputField
          id="b-beginn" label="Beginn" type="date" value={entwurf.startDate}
          onChange={(e) => setze('startDate', e.target.value)}
        />
        <InputField
          id="b-ende" label="Ende (geplant)" type="date" value={entwurf.endDate}
          onChange={(e) => setze('endDate', e.target.value)}
        />
        {/* Der Monteur braucht vor Ort vor allem eine Telefonnummer. */}
        <InputField
          id="b-ansprech" label="Ansprechpartner vor Ort" value={entwurf.contactName}
          onChange={(e) => setze('contactName', e.target.value)}
        />
        <InputField
          id="b-telefon" label="Telefon vor Ort" type="tel" value={entwurf.contactPhone}
          onChange={(e) => setze('contactPhone', e.target.value)}
        />
      </FormGrid>

      <div className="flex flex-col gap-1">
        <label htmlFor="b-beschreibung" className="text-sm font-medium text-ink">
          Beschreibung / Auftragsumfang
        </label>
        <textarea
          id="b-beschreibung"
          rows={3}
          className="min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
          value={entwurf.description}
          onChange={(e) => setze('description', e.target.value)}
        />
      </div>

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
      {/* Ohne Zuständige läuft eine Eilbestellung ins Leere — das gehört
          gesagt, nicht erst, wenn ein Monteur wartet. */}
      {entwurf.projectManagers.length === 0 && (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
          Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle
          niemanden. Die Verwaltung wird weiterhin verständigt.
        </p>
      )}

      {(entwurf.address || entwurf.contactPhone) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <AdresseLink adresse={entwurf.address} variante="knopf" />
          <TelefonLink nummer={entwurf.contactPhone} name={entwurf.contactName} variante="knopf" />
        </div>
      )}

      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

      {/*
        DER BALKEN ERSCHEINT ERST BEI EINER ÄNDERUNG — und er steht IN der
        Karte, nicht fest am unteren Rand. Dort sitzt am Telefon bereits die
        Tableiste; zwei Balken übereinander wären eine Falle statt einer Hilfe.
      */}
      {geaendert && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-brand-fixed/40 bg-info-bg p-3">
          <span className="text-sm text-ink">Es gibt ungespeicherte Änderungen.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onVerwerfen} disabled={speichert}>Verwerfen</Button>
            <Button onClick={onSpeichern} loading={speichert}>Speichern</Button>
          </div>
        </div>
      )}
    </div>
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
