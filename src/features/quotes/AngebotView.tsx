import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { canAccess } from '@/app/navigation';
import { deleteQuote, getQuote, updateQuote } from '@/lib/db/quotes';
import { listCustomersByIds } from '@/lib/db/customers';
import { isGF } from '@/lib/permissions';
import { praefixeVon } from '@/lib/praefixe';
import { todayStr } from '@/lib/time';
import { discountLabel } from '@/features/invoices/totals';
import type { Customer, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Zustand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import { angebotAnnehmen, annahmeMeldung } from './angebotAnnehmen';
import { downloadAngebotPdf } from './angebotPdf';
import { STAND } from './stand';

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

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const fmtMenge = (n: number) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(n);

const fmtDatum = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT') : '';

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
    } catch {
      setFehler('Der Status konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }

  async function annehmen(q: WithId<Quote>) {
    if (!companyId) return;
    setBusy(true);
    setFehler(null);
    try {
      toast.success(annahmeMeldung(await angebotAnnehmen(companyId, q, praefixeVon(company).baustelle)));
      setVersuch((v) => v + 1);
    } catch {
      setFehler('Die Baustelle konnte nicht angelegt werden.');
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

  const zurueck = (
    <Link to="/quotes" className="text-brand underline">← Zu den Angeboten</Link>
  );

  if (angebot.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" subtitle={zurueck} />
        <Card><SkeletonList rows={4} /></Card>
      </div>
    );
  }
  if (angebot.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" subtitle={zurueck} />
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
        <PageHeader title="Angebot" subtitle={zurueck} />
        <Card>
          <EmptyState action={<Link to="/quotes" className="text-brand underline">Zur Angebotsliste</Link>}>
            Dieses Angebot gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  const offen = q.status === 'Entwurf' || q.status === 'Versendet';
  const abgelaufen = offen && q.validUntil < todayStr();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Angebot ${q.quoteNumber}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {zurueck}
            <span>{q.customerName}</span>
            <Zustand stand={STAND[q.status]}>{q.status}</Zustand>
            {abgelaufen && <Zustand stand="achtung">Bindefrist abgelaufen</Zustand>}
          </span>
        }
        action={
          <Button
            onClick={() => void pdf(q)}
            loading={pdfLaeuft}
            disabled={kunde.zustand !== 'bereit'}
          >
            <Icon name="download" size={18} />
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

      <Card title="Angaben">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Kunde">
            {q.customerId ? (
              <Link to={`/customers/${q.customerId}`} className="text-brand underline">
                {q.customerName}
              </Link>
            ) : (
              q.customerName
            )}
          </Angabe>
          <Angabe wort="Ort der Leistung">{q.address}</Angabe>
          <Angabe wort="Angebotsdatum">{fmtDatum(q.quoteDate)}</Angabe>
          <Angabe wort="Gültig bis">{fmtDatum(q.validUntil)}</Angabe>
          <Angabe wort="Kalkulierte Arbeitszeit">
            {/* Intern: steht nicht auf dem PDF, wird beim Annehmen zum Budget. */}
            <span className="tnum">{fmtMenge(q.kalkulierteStunden)} h</span>
          </Angabe>
          <Angabe wort="Baustelle">
            {q.projectNumber ? (
              q.projectId && baustellenSichtbar ? (
                <Link to={`/admin-projects/${q.projectId}`} className="tnum text-brand underline">
                  {q.projectNumber}
                </Link>
              ) : (
                <span className="tnum">{q.projectNumber}</span>
              )
            ) : null}
          </Angabe>
        </dl>
      </Card>

      <Card title={`Positionen (${q.positions.length})`}>
        <ul className="divide-y divide-line">
          {q.positions.map((p, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">{p.label}</p>
                <p className="tnum text-xs text-ink-muted">
                  {fmtMenge(p.qty)} {p.unit} × {fmtEUR(p.unitPrice)}
                </p>
              </div>
              <span className="tnum shrink-0 text-sm text-ink">{fmtEUR(p.netto)}</span>
            </li>
          ))}
        </ul>
        <dl className="tnum mt-3 space-y-1 border-t border-ink pt-3 text-sm">
          {(q.discountAmount ?? 0) > 0 && q.discount && (
            <>
              <Summe wort="Zwischensumme">{fmtEUR(q.subtotalNetto)}</Summe>
              <Summe wort={discountLabel(q.discount)}>- {fmtEUR(q.discountAmount ?? 0)}</Summe>
            </>
          )}
          <Summe wort="Netto">{fmtEUR(q.totalNetto)}</Summe>
          <Summe wort={`USt. ${Math.round(q.vatRate * 100)}%`}>{fmtEUR(q.totalVat)}</Summe>
          <Summe wort="Brutto" fett>{fmtEUR(q.totalBrutto)}</Summe>
        </dl>
      </Card>

      {q.notes?.trim() && (
        <Card title="Anmerkungen">
          <p className="whitespace-pre-line text-sm text-ink">{q.notes}</p>
        </Card>
      )}

      {darfAendern && offen && (
        <Card title="Weiter">
          <div className="flex flex-wrap gap-2">
            {q.status === 'Entwurf' && (
              <>
                {/* Nur der Entwurf: was beim Kunden liegt, ändert sich nicht mehr. */}
                <Link
                  to={`/quotes?bearbeiten=${q.id}`}
                  className="inline-flex min-h-touch items-center px-4 text-sm font-semibold text-brand underline"
                >
                  Bearbeiten
                </Link>
                <Button
                  variant="ghost"
                  loading={busy}
                  onClick={() => void status(q, 'Versendet', 'Als versendet markiert')}
                >
                  Als versendet markieren
                </Button>
              </>
            )}
            <Button variant="ghost" loading={busy} onClick={() => void annehmen(q)}>
              Annehmen → Baustelle
            </Button>
            <Button
              variant="ghost"
              loading={busy}
              onClick={() => void status(q, 'Abgelehnt', 'Als abgelehnt vermerkt')}
            >
              Abgelehnt
            </Button>
            {/* Löschen nur im Entwurf: alles Versendete bleibt nachvollziehbar. */}
            {q.status === 'Entwurf' && (
              <Button variant="ghost" onClick={() => setLoeschenFragen(true)}>
                Löschen
              </Button>
            )}
          </div>
        </Card>
      )}

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
          } catch {
            setFehler('Das Angebot konnte nicht gelöscht werden.');
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
    <div className={`flex justify-between gap-3 ${fett ? 'font-bold text-ink' : 'text-ink-muted'}`}>
      <dt>{wort}</dt>
      <dd>{children}</dd>
    </div>
  );
}
