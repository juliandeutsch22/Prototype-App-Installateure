import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { canAccess } from '@/app/navigation';
import { deleteQuote, getQuote, listFassungen, updateQuote } from '@/lib/db/quotes';
import { listCustomersByIds } from '@/lib/db/customers';
import { isGF } from '@/lib/permissions';
import { praefixeVon } from '@/lib/praefixe';
import { todayStr } from '@/lib/time';
import { discountLabel, positionsRabattText, titelSummen } from '@/features/invoices/totals';
import type { Abrechnungsart, Customer, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Aktenspalten from '@/components/Aktenspalten';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import RowMenu from '@/components/RowMenu';
import Metric, { MetricRow } from '@/components/Metric';
import { LotVerlauf, Sprungleiste, type LotPunkt } from '@/components/LotBausteine';
import { Zustand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import { angebotAnnehmen, annahmeMeldung } from './angebotAnnehmen';
import { downloadAngebotPdf } from './angebotPdf';
import { STAND } from './stand';
import AbrechnungWahl from './AbrechnungWahl';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';

/**
 * Ein Angebot auf seiner eigenen Seite.
 *
 * GEMELDET: „ein erstelltes Angebot kann man nicht als PDF herunterladen oder
 * überhaupt ansehen im Nachhinein". Die Liste zeigte Nummer, Kunde und
 * Bruttobetrag — Positionen und Anmerkungen gab es nach dem Anlegen nirgends
 * mehr zu sehen, und dem Kunden liess sich nichts schicken.
 *
 * Eine Seite und nicht ein Aufklappen in der Liste: sie hat eine Adresse, auf
 * die die Kundenakte und die Baustelle verlinken können.
 */

const fmtMenge = (n: number) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(n);

const fmtDatum = (iso?: string) =>
  datumAT(iso);

type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };
const LAEDT = { zustand: 'laedt' } as const;

export default function AngebotView() {
  const { id } = useParams<{ id: string }>();
  const { user, company } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [angebot, setAngebot] = useState<Teil<WithId<Quote> | null>>(LAEDT);
  const [kunde, setKunde] = useState<Teil<WithId<Customer> | null>>(LAEDT);
  const [versuch, setVersuch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschenFragen, setLoeschenFragen] = useState(false);
  const [annehmenFragen, setAnnehmenFragen] = useState(false);
  /** Die Abrechnung der Baustelle, die beim Annehmen entsteht (M16). */
  const [abrechnung, setAbrechnung] = useState<Abrechnungsart>('Pauschal');
  /** Die Fassungen rundherum (M17): woraus dieses Angebot entstand, was daraus wurde. */
  const [vorgaenger, setVorgaenger] = useState<WithId<Quote> | null>(null);
  const [fassungen, setFassungen] = useState<WithId<Quote>[]>([]);

  const companyId = user?.companyId;
  const darfAendern = user ? isGF(user.role) : false;
  const baustellenSichtbar = user ? canAccess(user.role, '/admin-projects', company?.modules) : false;

  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setAngebot(LAEDT);
    void (async () => {
      try {
        const q = await getQuote(companyId, id);
        if (!weg) setAngebot({ zustand: 'bereit', daten: q });
      } catch {
        if (!weg) setAngebot({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, versuch]);

  /*
    DIE FASSUNGEN LADEN FÜR SICH (M17). Scheitern sie, fehlt nur der Verweis;
    das Angebot selbst bleibt lesbar.
  */
  const vorgaengerId = angebot.zustand === 'bereit' ? angebot.daten?.vorgaengerId : undefined;
  useEffect(() => {
    if (!companyId || !id || angebot.zustand !== 'bereit') return;
    let weg = false;
    void (async () => {
      try {
        const [vor, nach] = await Promise.all([
          vorgaengerId ? getQuote(companyId, vorgaengerId) : Promise.resolve(null),
          listFassungen(companyId, id),
        ]);
        if (!weg) {
          setVorgaenger(vor);
          setFassungen(nach);
        }
      } catch {
        if (!weg) {
          setVorgaenger(null);
          setFassungen([]);
        }
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, vorgaengerId, angebot.zustand]);

  /*
    DER KUNDE LÄDT FÜR SICH — er liefert nur die Anschrift fürs PDF. Scheitert
    er, bleibt das Angebot lesbar; nur das PDF wartet, statt mit der falschen
    Anschrift (dem Ort der Leistung) hinauszugehen.
  */
  const kundenId = angebot.zustand === 'bereit' ? angebot.daten?.customerId : undefined;
  useEffect(() => {
    if (!companyId || angebot.zustand !== 'bereit') return;
    if (!kundenId) {
      setKunde({ zustand: 'bereit', daten: null });
      return;
    }
    let weg = false;
    setKunde(LAEDT);
    void (async () => {
      try {
        const treffer = await listCustomersByIds(companyId, [kundenId]);
        if (!weg) setKunde({ zustand: 'bereit', daten: treffer[0] ?? null });
      } catch {
        if (!weg) setKunde({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, kundenId, angebot.zustand, versuch]);

  async function status(q: WithId<Quote>, neu: Quote['status'], meldung: string) {
    setBusy(true);
    setFehler(null);
    try {
      await updateQuote(q.id, { status: neu });
      toast.success(meldung);
      setVersuch((v) => v + 1);
    } catch (err) {
      setFehler(grundAus(err, 'Der Status konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  async function annehmen(q: WithId<Quote>) {
    if (!companyId) return;
    setBusy(true);
    setFehler(null);
    try {
      toast.success(annahmeMeldung(await angebotAnnehmen(companyId, q, praefixeVon(company).baustelle, abrechnung)));
      setVersuch((v) => v + 1);
    } catch (err) {
      setFehler(grundAus(err, 'Die Baustelle konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
    }
  }

  async function pdf(q: WithId<Quote>) {
    if (!company || kunde.zustand !== 'bereit') return;
    setPdfLaeuft(true);
    setFehler(null);
    try {
      await downloadAngebotPdf({ company, quote: q, kunde: kunde.daten });
    } catch {
      setFehler('Das PDF konnte nicht erzeugt werden.');
    } finally {
      setPdfLaeuft(false);
    }
  }

  if (!user) return null;

  /*
    DER WEG ZURÜCK STEHT IN DER ORTSZEILE (Linie „Lot“, Seitenkopf): klein
    über dem Titel, wo „wo bin ich“ steht. Polster und Gegenrand geben dem
    Link 48 px Tastfläche, ohne die Zeile höher zu machen.
  */
  const zurueck = (
    <Link to="/quotes" className="link -my-3 inline-block py-3">← Zu den Angeboten</Link>
  );

  if (angebot.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" ort={zurueck} />
        <Card><SkeletonList rows={4} /></Card>
      </div>
    );
  }
  if (angebot.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" ort={zurueck} />
        <Card>
          <ErrorState
            message="Das Angebot konnte nicht geladen werden."
            onRetry={() => setVersuch((v) => v + 1)}
          />
        </Card>
      </div>
    );
  }
  const q = angebot.daten;
  if (!q) {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" ort={zurueck} />
        <Card>
          <EmptyState action={<Link to="/quotes" className="link-weiter">Zur Angebotsliste</Link>}>
            Dieses Angebot gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  const offen = q.status === 'Entwurf' || q.status === 'Versendet';
  const abgelaufen = offen && q.validUntil < todayStr();

  /*
    DIE ZUSAMMENFASSUNG ZUERST (Linie „Lot“, Regel 6): was das Angebot wert
    ist, wie viel Arbeit darin steckt und bis wann es gilt. Die kalkulierte
    Arbeitszeit ist intern — sie steht nicht auf dem PDF, sie wird beim
    Annehmen zum Budget der Baustelle.
  */
  const kennzahlen = (
    <MetricRow>
      <Metric label="Brutto" value={euro(q.totalBrutto)} />
      <Metric label="Netto" value={euro(q.totalNetto)} />
      <Metric label="Kalkulierte Arbeitszeit" value={`${fmtMenge(q.kalkulierteStunden)} h`} />
      <Metric label="Gültig bis" value={fmtDatum(q.validUntil)} tone={abgelaufen ? 'warning' : 'default'} />
    </MetricRow>
  );

  /*
    DER NÄCHSTE SCHRITT STEHT AM PUNKT, AN DEM DAS ANGEBOT GERADE STEHT
    (Entwurf der Linie: die Akte trägt den Knopf im Verlauf). Was seltener
    ist — ablehnen, kopieren, löschen — liegt im „⋯“ des Seitenkopfs.
  */
  const schritte = darfAendern && q.status !== 'Angenommen' ? (
    <span className="mt-2 flex flex-wrap gap-2">
      {q.status === 'Entwurf' && (
        <>
          {/* Nur der Entwurf: was beim Kunden liegt, ändert sich nicht mehr. */}
          <Link
            to={`/quotes?bearbeiten=${q.id}`}
            className="link inline-flex min-h-touch items-center px-4 text-sm"
          >
            Bearbeiten
          </Link>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => void status(q, 'Versendet', 'Als versendet markiert')}
          >
            Als versendet markieren
          </Button>
        </>
      )}
      {offen && (
        <Button variant="secondary" loading={busy} onClick={() => { setAbrechnung('Pauschal'); setAnnehmenFragen(true); }}>
          Annehmen → Baustelle
        </Button>
      )}
      {/*
        ÜBERARBEITEN, OHNE ZU ÄNDERN (M17). Was beim Kunden liegt, bleibt;
        die neue Fassung ist ein eigener Entwurf mit eigener Nummer.
      */}
      {(q.status === 'Versendet' || q.status === 'Abgelehnt') && (
        <Link
          to={`/quotes?neueFassung=${q.id}`}
          className="link inline-flex min-h-touch items-center px-4 text-sm"
        >
          Neue Fassung
        </Link>
      )}
    </span>
  ) : null;

  /*
    DER VERLAUF ALS LOT (Regel 7) — nur aus dem, was geladen ist: das
    Angebotsdatum, der Status, die Fassungen davor und danach (M17). Wann
    versendet oder angenommen wurde, speichert die App nicht; deshalb steht
    dort kein Datum, statt eines geratenen.

    Die Links darin fliessen im Text mit (Polster und Gegenrand für die
    Tastfläche): als eigener Block risse jeder die Zeile auf 44 px auf.
  */
  const punkte: LotPunkt[] = [
    {
      titel: 'Angebot erstellt',
      zeit: fmtDatum(q.quoteDate),
      text: vorgaenger ? (
        <>
          als neue Fassung von{' '}
          <Link to={`/quotes/${vorgaenger.id}`} className="link -my-3 py-3">
            {vorgaenger.quoteNumber}
          </Link>
        </>
      ) : undefined,
    },
    q.status === 'Entwurf'
      ? { titel: 'Entwurf', text: <>Noch nicht versendet.{schritte}</>, jetzt: true }
      : q.status === 'Versendet'
        ? {
            titel: 'Versendet',
            zeit: `gültig bis ${fmtDatum(q.validUntil)}`,
            text: <>{abgelaufen ? 'Die Bindefrist ist abgelaufen.' : 'Wartet auf die Antwort des Kunden.'}{schritte}</>,
            jetzt: true,
          }
        : q.status === 'Angenommen'
          ? { titel: 'Angenommen', text: q.projectNumber ? `Baustelle ${q.projectNumber}` : undefined }
          : { titel: 'Abgelehnt', text: schritte },
    ...fassungen.map((f) => ({
      titel: (
        <>
          Überarbeitet als{' '}
          <Link to={`/quotes/${f.id}`} className="link -my-3 py-3">
            {f.quoteNumber} ({f.status})
          </Link>
        </>
      ),
      zeit: fmtDatum(f.quoteDate),
    })),
  ];
  const verlauf = (
    <Card title="Verlauf" id="angebot-verlauf">
      <LotVerlauf name="Verlauf des Angebots" punkte={punkte} />
    </Card>
  );

  const angaben = (
    <Card title="Angaben" id="angebot-angaben">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Angabe wort="Kunde">
          {q.customerId ? (
            <Link to={`/customers/${q.customerId}`} className="link inline-flex min-h-touch items-center">
              {q.customerName}
            </Link>
          ) : (
            q.customerName
          )}
        </Angabe>
        <Angabe wort="Ort der Leistung">{q.address}</Angabe>
        <Angabe wort="Angebotsdatum">{fmtDatum(q.quoteDate)}</Angabe>
        <Angabe wort="Baustelle">
          {q.projectNumber ? (
            q.projectId && baustellenSichtbar ? (
              <Link to={`/admin-projects/${q.projectId}`} className="link inline-flex min-h-touch items-center">
                {q.projectNumber}
              </Link>
            ) : (
              <span>{q.projectNumber}</span>
            )
          ) : null}
        </Angabe>
      </dl>
    </Card>
  );
  const titel = titelSummen(q.positions);
  const positionen = (
    <Card title={`Positionen (${q.positions.filter((p) => (p.art ?? 'position') === 'position').length})`} id="angebot-positionen">
      <ul className="divide-y divide-line">
        {q.positions.map((p, i) =>
          // Titel mit der Summe seiner Positionen, Text ohne Beträge (M18).
          p.art === 'titel' ? (
            <li key={i} className="flex items-start justify-between gap-3 pb-1 pt-3">
              <p className="text-sm font-semibold text-ink">{p.label}</p>
              {titel.has(i) && <span className="shrink-0 text-sm text-ink-muted">Summe {euro(titel.get(i)!)}</span>}
            </li>
          ) : p.art === 'text' ? (
            <li key={i} className="py-2">
              <p className="whitespace-pre-line text-sm text-ink-muted">{p.label}</p>
            </li>
          ) : (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">{p.label}</p>
                <p className="text-xs text-ink-muted">
                  {fmtMenge(p.qty)} {p.unit} × {euro(p.unitPrice)}
                  {positionsRabattText(p.rabattProzent) ? `, ${positionsRabattText(p.rabattProzent)}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm text-ink">{euro(p.netto)}</span>
            </li>
          ),
        )}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-ink pt-3 text-sm">
        {(q.discountAmount ?? 0) > 0 && q.discount && (
          <>
            <Summe wort="Zwischensumme">{euro(q.subtotalNetto)}</Summe>
            <Summe wort={discountLabel(q.discount)}>- {euro(q.discountAmount ?? 0)}</Summe>
          </>
        )}
        <Summe wort="Netto">{euro(q.totalNetto)}</Summe>
        <Summe wort={`USt. ${Math.round(q.vatRate * 100)}%`}>{euro(q.totalVat)}</Summe>
        <Summe wort="Brutto" fett>{euro(q.totalBrutto)}</Summe>
      </dl>
    </Card>
  );
  const anmerkungen = q.notes?.trim() ? (
    <Card title="Anmerkungen" id="angebot-anmerkungen">
      <p className="whitespace-pre-line text-sm text-ink">{q.notes}</p>
    </Card>
  ) : null;

  /*
    SELTENE AKTIONEN IM „⋯“ des Seitenkopfs (Regel 2) — dieselben wie bisher
    in der Karte „Weiter“, ein Tipp weiter. Löschen nur im Entwurf: alles
    Versendete bleibt nachvollziehbar.
  */
  const mehr = darfAendern ? (
    <RowMenu
      about={`Angebot ${q.quoteNumber}`}
      items={[
        ...(offen
          ? [{ label: 'Als abgelehnt markieren', onSelect: () => void status(q, 'Abgelehnt', 'Als abgelehnt vermerkt') }]
          : []),
        // Dasselbe ohne Verweis — etwa als Vorlage für einen ähnlichen Auftrag (M17).
        { label: 'Als Kopie anlegen', onSelect: () => navigate(`/quotes?kopie=${q.id}`) },
        ...(q.status === 'Entwurf'
          ? [{ label: 'Löschen', danger: true, onSelect: () => setLoeschenFragen(true) }]
          : []),
      ]}
    />
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        ort={zurueck}
        title={`Angebot ${q.quoteNumber}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{q.customerName}</span>
            <Zustand stand={STAND[q.status]}>{q.status}</Zustand>
            {abgelaufen && <Zustand stand="achtung">Bindefrist abgelaufen</Zustand>}
          </span>
        }
        mehr={mehr}
        action={
          <Button
            onClick={() => void pdf(q)}
            loading={pdfLaeuft}
            disabled={kunde.zustand !== 'bereit'}
          >
            PDF herunterladen
          </Button>
        }
      />

      {kunde.zustand === 'fehler' && (
        <TeilFehler
          was="die Anschrift des Kunden (für das PDF)"
          onRetry={() => setVersuch((v) => v + 1)}
        />
      )}
      {fehler && <ErrorState message={fehler} />}

      {kennzahlen}

      {/*
        DIE SPRUNGLEISTE NUR AN HANDY UND TABLET, waagrecht mitlaufend: dort
        steht die Akte in einer Spalte, und nach vielen Positionen liegen die
        Anmerkungen weit unten. Am Schreibtisch stehen die Karten in zwei
        Spalten nebeneinander — eine Leiste daneben zeigte nur, was schon zu
        sehen ist. `contents` lässt sie im Fluss der Seite kleben.
      */}
      <div className="contents lg:hidden">
        <Sprungleiste
          ziele={[
            { id: 'angebot-verlauf', text: 'Verlauf' },
            { id: 'angebot-angaben', text: 'Angaben' },
            { id: 'angebot-positionen', text: 'Positionen' },
            ...(anmerkungen ? [{ id: 'angebot-anmerkungen', text: 'Anmerkungen' }] : []),
          ]}
        />
      </div>

      {/*
        DIE KARTEN DES ANGEBOTS — einmal angelegt, von `Aktenspalten` angeordnet:
        am Telefon zuerst Verlauf und Angaben (wo es steht, für wen), dann
        die Positionen; am Schreibtisch links, was angeboten wird, rechts der
        Verlauf mit dem nächsten Schritt und die Angaben.
      */}
      <Aktenspalten
        telefon={[verlauf, angaben, positionen, anmerkungen]}
        links={[positionen, anmerkungen]}
        rechts={[verlauf, angaben]}
      />

      {/* Erst fragen, dann anlegen (Launch-Check, M8) — wie in der Liste. */}
      <ConfirmDialog
        open={annehmenFragen}
        title="Angebot annehmen?"
        message={`${q.quoteNumber} wird angenommen, und für ${q.customerName} entsteht eine Baustelle mit der nächsten Baustellennummer.`}
        confirmLabel="Annehmen"
        confirmTone="primary"
        onCancel={() => setAnnehmenFragen(false)}
        onConfirm={async () => {
          setAnnehmenFragen(false);
          await annehmen(q);
        }}
      >
        <AbrechnungWahl wert={abrechnung} onWert={setAbrechnung} />
      </ConfirmDialog>

      <ConfirmDialog
        open={loeschenFragen}
        title="Angebot löschen?"
        message={`${q.quoteNumber} wird entfernt. Nur Entwürfe sind löschbar.`}
        onCancel={() => setLoeschenFragen(false)}
        onConfirm={async () => {
          setLoeschenFragen(false);
          try {
            await deleteQuote(q.id);
            toast.success('Angebot gelöscht');
            navigate('/quotes');
          } catch (err) {
            setFehler(grundAus(err, 'Das Angebot konnte nicht gelöscht werden.'));
          }
        }}
      />
    </div>
  );
}

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

function Summe({ wort, fett, children }: { wort: string; fett?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex justify-between gap-3 ${fett ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
      <dt>{wort}</dt>
      <dd>{children}</dd>
    </div>
  );
}
