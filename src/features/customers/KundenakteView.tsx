import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listCustomersByIds,
  listProjectsForCustomer,
  listUnlinkedProjectsByName,
  assignProjectToCustomer,
} from '@/lib/db/customers';
import { listQuotesForCustomer } from '@/lib/db/quotes';
import { listWartungenForCustomer } from '@/lib/db/wartungen';
import { useModul } from '@/lib/useModule';
import { isGF } from '@/lib/permissions';
import { beurteile } from '@/features/maintenance/wartungsplan';
import { todayStr } from '@/lib/time';
import type { Customer, Project, Quote, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { AdresseLink, TelefonLink, MailLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';

/**
 * Die Akte eines Kunden — alles, was der Betrieb über ihn weiss.
 *
 * AUS DEM BETRIEB GEMELDET: „Man kann Kunden zwar eine Mail, Notiz, UID und
 * weiteres hinzufügen, diese Daten scheinen jedoch nirgendwo auf."
 *
 * Das stimmte. Das Formular nahm sieben Felder entgegen, die Liste zeigte
 * drei davon. E-Mail, UID-Nummer und Notiz wurden erfasst und danach nie
 * wieder gezeigt — der Betrieb pflegte Daten in ein Loch. Am teuersten war
 * die UID: sie gehört auf jede Rechnung an ein Unternehmen, und wer sie
 * nachsehen wollte, musste in die Bearbeitungsmaske.
 *
 * WARUM EINE EIGENE SEITE und nicht wieder ein Aufklappen in der Liste. Die
 * Historie hing bisher IN der Nebenzeile einer Listenzeile — ein Absatz, in
 * dem Blöcke stehen sollten, mit `span` gebaut, weil ein `p` keine `div`
 * verträgt. Um Stammdaten und Wartungen erweitert wäre daraus vollends eine
 * Ansicht in der Verkleidung einer Zeile. Und eine Seite hat eine Adresse:
 * von der Baustelle oder der Rechnung lässt sich später darauf verlinken,
 * auf ein Aufklappen nicht.
 */

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const fmtDatum = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT') : '—';

/** Ein Teil der Akte lädt für sich — ein Fehler nimmt nicht die ganze Seite. */
type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };

const LAEDT = { zustand: 'laedt' } as const;

export default function KundenakteView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const wartungAn = useModul('wartung');
  const angeboteAn = useModul('angebote');

  const [kunde, setKunde] = useState<Teil<WithId<Customer> | null>>(LAEDT);
  const [baustellen, setBaustellen] = useState<Teil<WithId<Project>[]>>(LAEDT);
  const [namensgleich, setNamensgleich] = useState<WithId<Project>[]>([]);
  const [angebote, setAngebote] = useState<Teil<WithId<Quote>[]>>(LAEDT);
  const [wartungen, setWartungen] = useState<Teil<WithId<Wartung>[]>>(LAEDT);
  const [zuordnenLaeuft, setZuordnenLaeuft] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  const companyId = user?.companyId;
  const darfAendern = user ? isGF(user.role) : false;
  const heute = todayStr();

  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setKunde(LAEDT);
    void (async () => {
      try {
        const treffer = await listCustomersByIds(companyId, [id]);
        if (!weg) setKunde({ zustand: 'bereit', daten: treffer[0] ?? null });
      } catch {
        if (!weg) setKunde({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, versuch]);

  /*
    Die drei Bereiche laden GETRENNT. Ein Ausfall bei den Angeboten darf die
    Stammdaten nicht mitreissen — die sind der Grund, warum jemand die Seite
    öffnet.
  */
  const kundeDaten = kunde.zustand === 'bereit' ? kunde.daten : null;
  const kundeName = kundeDaten?.name;

  useEffect(() => {
    if (!companyId || !id || !kundeName) return;
    let weg = false;
    void (async () => {
      try {
        const [zugeordnet, offen] = await Promise.all([
          listProjectsForCustomer(companyId, id),
          listUnlinkedProjectsByName(companyId, kundeName),
        ]);
        if (weg) return;
        setBaustellen({ zustand: 'bereit', daten: zugeordnet });
        setNamensgleich(offen);
      } catch {
        if (!weg) setBaustellen({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, kundeName, versuch]);

  useEffect(() => {
    if (!companyId || !kundeName || !angeboteAn) return;
    let weg = false;
    listQuotesForCustomer(companyId, kundeName)
      .then((q) => !weg && setAngebote({ zustand: 'bereit', daten: q }))
      .catch(() => !weg && setAngebote({ zustand: 'fehler' }));
    return () => {
      weg = true;
    };
  }, [companyId, kundeName, angeboteAn, versuch]);

  useEffect(() => {
    if (!companyId || !id || !wartungAn) return;
    let weg = false;
    listWartungenForCustomer(companyId, id)
      .then((w) => !weg && setWartungen({ zustand: 'bereit', daten: w }))
      .catch(() => !weg && setWartungen({ zustand: 'fehler' }));
    return () => {
      weg = true;
    };
  }, [companyId, id, wartungAn, versuch]);

  if (!user) return null;

  if (kunde.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Kundenakte" />
        <Card>
          <SkeletonList rows={3} />
        </Card>
      </div>
    );
  }

  if (kunde.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Kundenakte" />
        <ErrorState
          message="Der Kunde konnte nicht geladen werden."
          onRetry={() => setVersuch((v) => v + 1)}
        />
      </div>
    );
  }

  const k = kunde.daten;
  if (!k) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kundenakte" />
        <Card>
          {/*
            „Nicht gefunden" ist etwas anderes als „nicht geladen". Wer einem
            alten Lesezeichen folgt, soll das erfahren und nicht auf einen
            Ladefehler schliessen.
          */}
          <EmptyState action={<Link to="/customers" className="text-brand underline">Zur Kundenliste</Link>}>
            Diesen Kunden gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={k.name}
        subtitle={
          <Link to="/customers" className="text-brand underline">
            ← Zur Kundenliste
          </Link>
        }
        action={
          darfAendern ? (
            <Button onClick={() => navigate(`/customers?bearbeiten=${k.id}`)}>Bearbeiten</Button>
          ) : undefined
        }
      />

      {/*
        DIE STAMMDATEN ZUERST. Sie sind der Grund, warum es diese Seite gibt:
        E-Mail, UID und Notiz standen bisher in keiner Ansicht.
      */}
      <Card title="Stammdaten">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Rechnungsadresse">
            {k.address ? <AdresseLink adresse={k.address} /> : null}
          </Angabe>
          <Angabe wort="Ansprechpartner">{k.contactName}</Angabe>
          <Angabe wort="Telefon">
            {k.contactPhone ? (
              <TelefonLink nummer={k.contactPhone} name={k.contactName} />
            ) : null}
          </Angabe>
          <Angabe wort="E-Mail">{k.email ? <MailLink adresse={k.email} /> : null}</Angabe>
          {/*
            Die UID gehört auf jede Rechnung an ein Unternehmen. Sie war
            bisher nur in der Bearbeitungsmaske zu sehen — also genau dort,
            wo man sie versehentlich ändert, während man sie nachsieht.
          */}
          <Angabe wort="UID-Nummer">
            {k.vatId ? <span className="tnum">{k.vatId}</span> : null}
          </Angabe>
          <Angabe wort="Zustand">
            {k.active === false ? <Badge tone="gray">inaktiv</Badge> : <Badge tone="success">aktiv</Badge>}
          </Angabe>
        </dl>

        {k.notes?.trim() ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="section-label">Notiz</p>
            {/* Zeilenumbrüche bleiben: eine Notiz ist oft eine Liste. */}
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{k.notes}</p>
          </div>
        ) : null}
      </Card>

      <Card title={`Baustellen${baustellen.zustand === 'bereit' ? ` (${baustellen.daten.length})` : ''}`}>
        {baustellen.zustand === 'laedt' ? (
          <SkeletonList rows={2} />
        ) : baustellen.zustand === 'fehler' ? (
          <TeilFehler was="die Baustellen" onRetry={() => setVersuch((v) => v + 1)} />
        ) : baustellen.daten.length === 0 ? (
          <EmptyState>Noch keine Baustelle zugeordnet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {baustellen.daten
              .slice()
              .sort((a, b) => b.projectNumber.localeCompare(a.projectNumber))
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link
                    to={`/admin-projects?baustelle=${encodeURIComponent(p.projectNumber)}`}
                    className="truncate text-sm text-brand underline"
                  >
                    {p.projectNumber} · {p.address ?? 'ohne Adresse'}
                  </Link>
                  <StatusBadge status={p.status} />
                </li>
              ))}
          </ul>
        )}

        {/*
          Baustellen, die den Namen tragen, aber auf keinen Kunden zeigen.
          Sie nur anzuzeigen wäre halb — der Knopf stellt die Verbindung her.
        */}
        {namensgleich.length > 0 && (
          <div className="mt-4 rounded border border-warning/40 bg-warning-bg p-3">
            <p className="text-sm text-warning">
              <strong>{namensgleich.length}</strong>{' '}
              {namensgleich.length === 1
                ? 'Baustelle trägt diesen Namen, ist'
                : 'Baustellen tragen diesen Namen, sind'}{' '}
              aber keinem Kunden zugeordnet.
            </p>
            <ul className="mt-2 space-y-2">
              {namensgleich.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-sm text-ink">
                    {p.projectNumber} · {p.address ?? 'ohne Adresse'}
                  </span>
                  {darfAendern && (
                    <Button
                      variant="secondary"
                      loading={zuordnenLaeuft === p.id}
                      onClick={async () => {
                        setZuordnenLaeuft(p.id);
                        try {
                          await assignProjectToCustomer(p.id, k.id, k.name);
                          toast.success('Baustelle zugeordnet');
                          setVersuch((v) => v + 1);
                        } catch {
                          toast.error('Die Zuordnung ist fehlgeschlagen.');
                        } finally {
                          setZuordnenLaeuft(null);
                        }
                      }}
                    >
                      Zuordnen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {baustellen.zustand === 'bereit' &&
          baustellen.daten.length === 0 &&
          namensgleich.length === 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Gesucht wurde nach exakt „{k.name}". Bei abweichender Schreibweise hilft
              „Bestehende Baustellen übernehmen" in der Kundenliste.
            </p>
          )}
      </Card>

      {wartungAn && (
        <Card title="Wartungen">
          {wartungen.zustand === 'laedt' ? (
            <SkeletonList rows={1} />
          ) : wartungen.zustand === 'fehler' ? (
            <TeilFehler was="die Wartungen" onRetry={() => setVersuch((v) => v + 1)} />
          ) : wartungen.daten.length === 0 ? (
            <EmptyState>Keine Wartungsvereinbarung.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {wartungen.daten.map((w) => {
                const u = beurteile(w, heute);
                return (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-sm text-ink">
                      {w.anlage}
                      <span className="block text-xs text-ink-muted">
                        alle {w.intervallMonate} Monate · Termin {fmtDatum(w.faelligAm)}
                      </span>
                    </span>
                    <Badge
                      tone={
                        u.stand === 'überfällig'
                          ? 'danger'
                          : u.stand === 'fällig'
                            ? 'warning'
                            : 'gray'
                      }
                    >
                      {u.stand === 'ruht' ? 'ruht' : u.text}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {angeboteAn && (
        <Card title="Angebote">
          {angebote.zustand === 'laedt' ? (
            <SkeletonList rows={1} />
          ) : angebote.zustand === 'fehler' ? (
            <TeilFehler was="die Angebote" onRetry={() => setVersuch((v) => v + 1)} />
          ) : angebote.daten.length === 0 ? (
            <EmptyState>Noch kein Angebot.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {angebote.daten.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link to="/quotes" className="truncate text-sm text-brand underline">
                    {q.quoteNumber}
                  </Link>
                  <span className="tnum text-sm text-ink-muted">
                    {fmtEUR(q.totalNetto)} netto · {q.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Eine Angabe der Stammdaten.
 *
 * LEER HEISST „NICHT HINTERLEGT", und das steht auch da. Die Zeile ganz
 * wegzulassen wäre bequemer und falsch: dann sähe eine Akte ohne UID genauso
 * aus wie eine, in der das Feld gar nicht vorgesehen ist — und niemand käme
 * auf die Idee, sie nachzutragen.
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
