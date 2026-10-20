import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import { canAccess } from '@/app/navigation';
import {
  listCustomersByIds,
  listProjectsForCustomer,
  listUnlinkedProjectsByName,
  assignProjectToCustomer,
  updateCustomer,
  type NewCustomer,
} from '@/lib/db/customers';
import { listQuotesForCustomer } from '@/lib/db/quotes';
import { listInvoicesForCustomer } from '@/lib/db/invoices';
import { listWartungenForCustomer } from '@/lib/db/wartungen';
import { useModul } from '@/lib/useModule';
import { canInvoice, darfKundenPflegen, darfTermineSchreiben, isGF } from '@/lib/permissions';
import TermineKarte from '@/features/termine/TermineKarte';
import { beurteile } from '@/features/maintenance/wartungsplan';
import { todayStr } from '@/lib/time';
import type { Customer, Invoice, Project, Quote, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Aktionsleiste from '@/components/Aktionsleiste';
import AktenBereiche, { AktenAngaben, AktenAngabe, AktenVerweis } from '@/components/AktenBereiche';
import AktenBearbeiten from '@/components/AktenBearbeiten';
import AktenTerminVorschau, { type AktenTerminStand } from '@/components/AktenTerminVorschau';
import Hinweiszeile from '@/components/Hinweiszeile';
import { InputField, FormGrid, CheckboxField } from '@/components/Field';
import Button from '@/components/Button';
import { Warnung, Zustand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { AdresseLink, TelefonLink, MailLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import Datenauskunft from '@/features/recht/Datenauskunft';
import { zeigtAuskunft } from '@/features/recht/auskunftDatei';
import AdressteileFelder from '@/components/AdressteileFelder';
import { adresseZeile } from '@/lib/adresse';
import KundenartUidFelder from '@/components/KundenartUidFelder';
import { uidNormalisieren, uidSperrt } from '@/lib/uid';
import UidVies from './UidVies';

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

const fmtDatum = (iso?: string) =>
  datumAT(iso) || '—';

/** Ein Teil der Akte lädt für sich — ein Fehler nimmt nicht die ganze Seite. */
/** Wie viele Rechnungen die Akte zuerst zeigt. */
const RECHNUNGEN_KURZ = 5;

type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };

const LAEDT = { zustand: 'laedt' } as const;

export default function KundenakteView() {
  const { id } = useParams<{ id: string }>();
  const { user, company, einblick } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const wartungAn = useModul('wartung');
  const angeboteAn = useModul('angebote');
  const rechnungenAn = useModul('rechnungen');
  const einsatzAn = useModul('einsatzplanung');

  const [kunde, setKunde] = useState<Teil<WithId<Customer> | null>>(LAEDT);
  const [baustellen, setBaustellen] = useState<Teil<WithId<Project>[]>>(LAEDT);
  const [namensgleich, setNamensgleich] = useState<WithId<Project>[]>([]);
  const [angebote, setAngebote] = useState<Teil<WithId<Quote>[]>>(LAEDT);
  const [rechnungen, setRechnungen] = useState<Teil<WithId<Invoice>[]>>(LAEDT);
  /** Alle Rechnungen zeigen — sonst die jüngsten fünf; die Akte soll lesbar bleiben. */
  const [alleRechnungen, setAlleRechnungen] = useState(false);
  const [wartungen, setWartungen] = useState<Teil<WithId<Wartung>[]>>(LAEDT);
  const [zuordnenLaeuft, setZuordnenLaeuft] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  // Lesen zeigt den gespeicherten Stand. Erst „Bearbeiten“ öffnet den
  // vollständigen Entwurf; die bisherigen Speicherregeln bleiben dieselben.
  const [entwurf, setEntwurf] = useState<NewCustomer | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [bearbeitet, setBearbeitet] = useState(false);
  const [terminStand, setTerminStand] = useState<AktenTerminStand>({ termine: null, fehler: false });
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);

  const companyId = user?.companyId;
  const darfAendern = user ? darfKundenPflegen(user) : false;
  // Eine Baustelle zuordnen ändert die BAUSTELLE — das bleibt bei der Leitung.
  const darfBaustellenZuordnen = user ? isGF(user.role) : false;
  /** Rechnungen liest nur, wer sie auch stellt — so steht es im Zeilenschutz. */
  const darfRechnungen = user ? canInvoice(user.role) : false;
  /*
    ANGEBOTE UND BAUSTELLEN NUR FÜR DIE, DIE SIE AUCH ÖFFNEN DÜRFEN — dieselbe
    Frage wie in `AngebotView`. Die Verwaltung liest per Zeilenschutz keine
    Angebote: die Karte zeigte ihr „Noch kein Angebot.", obwohl es welche
    gab. Und ein Link auf die Baustellenliste führte Verwaltung und
    Buchhaltung auf „Kein Zugriff" (Prüflauf 25.09.2026, P4-03).
  */
  const darfAngebote = user ? canAccess(user.role, '/quotes', company?.modules) : false;
  const baustellenSichtbar = user ? canAccess(user.role, '/admin-projects', company?.modules) : false;
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

  /*
    Der Entwurf folgt dem geladenen Kunden — aber NUR, wenn dieser sich
    wirklich geändert hat. Liefe er bei jedem Durchlauf mit, überschriebe
    jedes erneute Zeichnen die halb getippte Eingabe.
  */
  useEffect(() => {
    setEntwurf(kundeDaten ? alsEntwurf(kundeDaten) : null);
  }, [kundeDaten]);

  const geaendert =
    entwurf !== null && kundeDaten !== null && !gleich(entwurf, alsEntwurf(kundeDaten));
  // Wer mit ungespeicherten Änderungen weggeht, wird gefragt (Testbericht 30.09.2026, M1).
  const warnung = useUngespeichertWarnung(geaendert);

  async function stammdatenSpeichern(): Promise<void> {
    if (!companyId || !id || !entwurf) return;
    if (!entwurf.name.trim()) {
      setSpeicherFehler('Ohne Namen geht es nicht — daran hängen Baustellen und Rechnungen.');
      return;
    }
    // Eine falsch geschriebene UID hält auf — nur wenn sie geändert wurde (M10).
    const uidFalsch = uidSperrt(entwurf.vatId, kundeDaten?.vatId);
    if (uidFalsch) {
      setSpeicherFehler(uidFalsch);
      return;
    }
    setSpeichert(true);
    setSpeicherFehler(null);
    try {
      const nachgezogen = await updateCustomer(companyId, id, entwurf);
      /*
        WIE VIELE BAUSTELLEN MITGEWANDERT SIND, WIRD GESAGT. Der Kundenname
        steht als Kopie auf jeder Baustelle; ein Umbenennen zieht sie nach.
        Das lautlos zu tun hiesse, eine Änderung an fremden Datensätzen zu
        verschweigen — dieselbe Meldung gab schon die Kundenliste.
      */
      setBearbeitet(false);
      toast.success(
        nachgezogen > 0
          ? `Gespeichert, ${nachgezogen} ${nachgezogen === 1 ? 'Baustelle' : 'Baustellen'} nachgezogen`
          : 'Gespeichert',
      );
      // Neu laden: der Name ist der Schlüssel, unter dem Angebote und
      // namensgleiche Baustellen gesucht werden.
      setVersuch((v) => v + 1);
    } catch (err) {
      setSpeicherFehler(grundAus(err, 'Der Kunde konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

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

  /*
    DIE ANGEBOTE HINGEN AM NAMEN UND MUSSTEN AN DER KENNUNG HÄNGEN.

    Hier stand `listQuotesForCustomer(companyId, kundeName)`. Die Abfrage
    filtert aber auf `customerId` — und `quotes.customer_id` ist eine `uuid`.
    Unter Postgres scheitert sie damit an jedem Kunden, und die Akte meldete
    „die Angebote konnte nicht geladen werden"; unter Firestore kam einfach
    nichts zurück, was wie „noch kein Angebot" aussah. Der Abschnitt hat also
    nie funktioniert, und der Umzug hat aus einer stillen Leere eine sichtbare
    Meldung gemacht — genau der Grund, aus dem eine verschluckte Antwort
    schlimmer ist als ein Fehler.

    Angebote tragen die Kennung (`QuotesView` setzt sie beim Anlegen aus dem
    gewählten Kunden), also wird danach gesucht.
  */
  useEffect(() => {
    if (!companyId || !id || !angeboteAn || !darfAngebote) return;
    let weg = false;
    listQuotesForCustomer(companyId, id)
      .then((q) => !weg && setAngebote({ zustand: 'bereit', daten: q }))
      .catch(() => !weg && setAngebote({ zustand: 'fehler' }));
    return () => {
      weg = true;
    };
  }, [companyId, id, angeboteAn, darfAngebote, versuch]);

  /*
    DIE RECHNUNGEN DES KUNDEN — über seine Baustellen. Eine Rechnung trägt den
    Kundennamen als Text, und ihr Kunde ergibt sich aus der Baustelle; siehe
    `listInvoicesForCustomer`. Geladen wird deshalb erst, wenn die
    Baustellen da sind.
  */
  const baustellenIds =
    baustellen.zustand === 'bereit' ? baustellen.daten.map((b) => b.id).sort().join('|') : null;
  useEffect(() => {
    if (!companyId || !id || !rechnungenAn || !darfRechnungen || baustellenIds === null) return;
    let weg = false;
    setRechnungen(LAEDT);
    listInvoicesForCustomer(companyId, id, baustellenIds ? baustellenIds.split('|') : [])
      .then((r) => !weg && setRechnungen({ zustand: 'bereit', daten: r }))
      .catch(() => !weg && setRechnungen({ zustand: 'fehler' }));
    return () => {
      weg = true;
    };
  }, [companyId, id, rechnungenAn, darfRechnungen, baustellenIds, versuch]);

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
          <EmptyState action={<Link to="/customers" className="link-weiter">Zur Kundenliste</Link>}>
            Diesen Kunden gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  const vies = <UidVies kunde={k} uidGeaendert={!!entwurf && uidNormalisieren(entwurf.vatId) !== uidNormalisieren(k.vatId)} darfPruefen={!einblick} />;
  const stammdaten = <Card title="Kundendaten" id="k-daten">
    <StammdatenLesen k={k} />
  </Card>;
  const baustellenKarte = (
    <Card id="k-baustellen" title={`Baustellen${baustellen.zustand === 'bereit' ? ` (${baustellen.daten.length})` : ''}`}>
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
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                {baustellenSichtbar ? (
                  /* 44 px Tastfläche; dafür die Zeile mit weniger Polster,
                     damit die Liste kaum wächst (P4-09). Das `truncate`
                     sitzt innen — an einem Flex-Behälter greifen die
                     Auslassungspunkte nicht. */
                  <Link
                    to={`/admin-projects?baustelle=${encodeURIComponent(p.projectNumber)}`}
                    className="link inline-flex min-h-touch min-w-0 items-center text-sm"
                  >
                    <span><span className="block font-semibold">{p.projectNumber}</span><span className="block text-ink-muted">{p.bezeichnung || p.address || 'ohne Adresse'}</span></span>
                  </Link>
                ) : (
                  <span className="truncate py-1 text-sm text-ink">
                    {p.projectNumber} · {p.address ?? 'ohne Adresse'}
                  </span>
                )}
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
        <div className="mt-4">
          <Hinweiszeile stufe="warn">
            <p>
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
                  {darfBaustellenZuordnen && (
                    <Button
                      variant="secondary"
                      loading={zuordnenLaeuft === p.id}
                      onClick={async () => {
                        setZuordnenLaeuft(p.id);
                        try {
                          await assignProjectToCustomer(p.id, k.id, k.name);
                          toast.success('Baustelle zugeordnet');
                          setVersuch((v) => v + 1);
                        } catch (err) {
                          toast.error(grundAus(err, 'Die Zuordnung ist fehlgeschlagen.'));
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
          </Hinweiszeile>
        </div>
      )}

      {darfBaustellenZuordnen &&
        baustellen.zustand === 'bereit' &&
        baustellen.daten.length === 0 &&
        namensgleich.length === 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            Gesucht wurde nach exakt „{k.name}". Bei abweichender Schreibweise hilft
            „Bestehende Baustellen übernehmen“ in der Kundenliste.
          </p>
        )}
    </Card>
  );
  const wartungKarte = wartungAn ? (
    <Card title="Wartungen" id="k-wartungen">
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
                <Zustand
                  stand={
                    u.stand === 'überfällig'
                      ? 'schlecht'
                      : u.stand === 'fällig'
                        ? 'achtung'
                        : 'ruht'
                  }
                >
                  {u.stand === 'ruht' ? 'ruht' : u.text}
                </Zustand>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  ) : null;
  const rechnungKarte = rechnungenAn && darfRechnungen ? (
    <Card title="Rechnungen" id="k-rechnungen">
      {rechnungen.zustand === 'laedt' || baustellen.zustand === 'laedt' ? (
        <SkeletonList rows={1} />
      ) : rechnungen.zustand === 'fehler' || baustellen.zustand === 'fehler' ? (
        <TeilFehler was="die Rechnungen" onRetry={() => setVersuch((v) => v + 1)} />
      ) : rechnungen.daten.length === 0 ? (
        <EmptyState>Noch keine Rechnung.</EmptyState>
      ) : (
        <>
        <ul className="divide-y divide-line">
          {(alleRechnungen ? rechnungen.daten : rechnungen.daten.slice(0, RECHNUNGEN_KURZ)).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm">
                <Link
                  to={`/invoices?suche=${encodeURIComponent(r.invoiceNumber)}`}
                  className="link"
                >
                  {r.invoiceNumber}
                </Link>
                {/* Leerzeichen im Text (Runde 3, G4): sonst las sich
                    „RE-2026-150706.10.2026“ beim Kopieren und Vorlesen. */}
                {' '}
                <span className="ml-1 whitespace-nowrap text-xs text-ink-muted">
                  {fmtDatum(r.invoiceDate)} · <span className="nr">{r.projectNumber}</span>
                </span>
              </span>
              <span className="whitespace-nowrap text-sm text-ink-muted">
                {euro(r.totalBrutto)} brutto · {r.paymentStatus}
              </span>
            </li>
          ))}
        </ul>
        {rechnungen.daten.length > RECHNUNGEN_KURZ && (
          <Button variant="ghost" className="mt-2" onClick={() => setAlleRechnungen((a) => !a)}>
            {alleRechnungen ? 'Nur die jüngsten zeigen' : `Alle ${rechnungen.daten.length} zeigen`}
          </Button>
        )}
        </>
      )}
    </Card>
  ) : null;
  const angebotKarte = angeboteAn && darfAngebote ? (
    <Card title="Angebote" id="k-angebote">
      {angebote.zustand === 'laedt' ? (
        <SkeletonList rows={1} />
      ) : angebote.zustand === 'fehler' ? (
        <TeilFehler was="die Angebote" onRetry={() => setVersuch((v) => v + 1)} />
      ) : angebote.daten.length === 0 ? (
        <EmptyState>Noch kein Angebot.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {angebote.daten.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <Link
                to={`/quotes/${q.id}`}
                className="link inline-flex min-h-touch min-w-0 items-center text-sm"
              >
                <span className="truncate">{q.quoteNumber}</span>
              </Link>
              <span className="text-sm text-ink-muted">
                {euro(q.totalNetto)} netto · {q.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  ) : null;
  /*
    TERMINE BEIM KUNDEN UND AUF SEINEN BAUSTELLEN (Plan 10.4) — hier legt
    die Verwaltung die Besichtigung an, bevor es eine Baustelle gibt. Nur
    für Leitung und Verwaltung: die Buchhaltung liest Termine nicht, die
    Karte zeigte ihr sonst „Keine Termine". Gewartet wird auf die
    Baustellen, damit deren Termine nicht einen Augenblick fehlen.
  */
  const terminKarte = einsatzAn && user && darfTermineSchreiben(user.role) && baustellen.zustand !== 'laedt' ? (
    <div id="k-termine">
      <TermineKarte
        titel="Termine"
        onStand={setTerminStand}
        vorgabe={{
          bezug: 'kunde',
          customerId: k.id,
          baustellen: (baustellen.zustand === 'bereit' ? baustellen.daten : []).map((b) => ({
            projectNumber: b.projectNumber,
            label: [b.projectNumber, b.address].filter(Boolean).join(' · '),
          })),
        }}
      />
    </div>
  ) : null;
  const auskunft = zeigtAuskunft(user?.role, !!einblick) ? (
    <div id="k-auskunft">
      <Datenauskunft
        art="kunde"
        id={k.id}
        // Ging der Kunde ganz, gibt es diese Akte nicht mehr.
        onGeloescht={(ganz) => (ganz ? navigate('/customers') : setVersuch((v) => v + 1))}
      />
    </div>
  ) : null;

  return (
    <div className="akten-seite">
      {warnung}
      <PageHeader ort={k.kundennummer ? `Kunde · Nr. ${k.kundennummer}` : 'Kunde'} title={k.name}
        subtitle={<span className="flex flex-wrap items-center gap-x-3"><Link to="/customers" className="link inline-flex min-h-touch items-center">← Zur Kundenliste</Link>
          <Zustand stand={k.active === false ? 'ruht' : 'gut'}>{k.active === false ? 'inaktiv' : 'aktiv'}</Zustand></span>}
        action={darfAendern && <Button onClick={() => setBearbeitet(true)}>Bearbeiten</Button>} />
      <div className="akten-kontakt"><AdresseLink adresse={k.address} /><TelefonLink nummer={k.contactPhone} name={k.contactName} /><MailLink adresse={k.email} /></div>
      <AktenBereiche kennung="kunde" bereiche={[
        { id: 'uebersicht', titel: 'Übersicht', sprungziele: ['k-daten', 'k-auskunft'], inhalt:
          <div className="akten-spalten"><div className="akten-spalte">{stammdaten}
            <Card title="Aktive Baustellen" action={<AktenVerweis bereich="belege">Alle Baustellen →</AktenVerweis>}>
              {baustellen.zustand === 'laedt' ? <SkeletonList rows={2} /> : baustellen.zustand === 'fehler'
                ? <TeilFehler was="die Baustellen" onRetry={() => setVersuch((v) => v + 1)} />
                : baustellen.daten.filter((p) => p.status !== 'Abgeschlossen').length === 0 ? <EmptyState>Keine aktive Baustelle.</EmptyState>
                : <ul className="divide-y divide-line">{baustellen.daten.filter((p) => p.status !== 'Abgeschlossen').slice(0, 3).map((p) => <li key={p.id} className="py-3 text-sm">
                    {baustellenSichtbar ? <Link to={`/admin-projects/${p.id}`} className="link"><span className="block font-semibold">{p.projectNumber}</span>{p.bezeichnung || p.address || 'ohne Adresse'}</Link>
                    : <><span className="block font-semibold">{p.projectNumber}</span>{p.bezeichnung || p.address || 'ohne Adresse'}</>}
                    <div><StatusBadge status={p.status} /></div>
                  </li>)}</ul>}
            </Card>{auskunft}
          </div><div className="akten-spalte">
            {terminKarte && <AktenTerminVorschau stand={terminStand} bereich="wartung" />}
            {!bearbeitet && (k.vatId?.trim() || k.kundenart === 'unternehmen') && <Card>{vies}</Card>}
          </div></div> },
        { id: 'belege', titel: 'Baustellen und Belege', sprungziele: ['k-baustellen', 'k-rechnungen', 'k-angebote'], inhalt:
          <div className="akten-spalten"><div className="akten-spalte">{baustellenKarte}</div><div className="akten-spalte">{rechnungKarte}{angebotKarte}</div></div> },
        ...((wartungKarte || terminKarte) ? [{ id: 'wartung', titel: wartungKarte ? 'Wartungen' : 'Termine', sprungziele: ['k-wartungen', 'k-termine'], inhalt:
          <div className="akten-spalten"><div className="akten-spalte">{wartungKarte}</div><div className="akten-spalte">{terminKarte}</div></div> }] : []),
      ]} />
      {darfAendern && entwurf && <AktenBearbeiten offen={bearbeitet} titel="Kunde bearbeiten" geaendert={geaendert} speichert={speichert}
        onSchliessen={() => setBearbeitet(false)} onVerwerfen={() => { setEntwurf(alsEntwurf(k)); setSpeicherFehler(null); }}>
        <StammdatenFormular entwurf={entwurf} setEntwurf={setEntwurf} geaendert={geaendert} speichert={speichert} fehler={speicherFehler}
          onSpeichern={() => void stammdatenSpeichern()} onVerwerfen={() => setEntwurf(alsEntwurf(k))} uidPruefung={bearbeitet ? vies : null} />
      </AktenBearbeiten>}
    </div>
  );
}

/** Die Felder, die die Akte bearbeitet — dieselben, die das Anlegen kennt. */
function alsEntwurf(k: Customer): NewCustomer {
  return {
    name: k.name ?? '',
    address: k.address ?? '',
    strasse: k.strasse ?? '',
    plz: k.plz ?? '',
    ort: k.ort ?? '',
    land: k.land ?? 'AT',
    kundennummer: k.kundennummer ?? '',
    lieferantennummer: k.lieferantennummer ?? '',
    contactName: k.contactName ?? '',
    contactPhone: k.contactPhone ?? '',
    email: k.email ?? '',
    vatId: k.vatId ?? '',
    kundenart: k.kundenart ?? null,
    notes: k.notes ?? '',
    active: k.active !== false,
  };
}

/**
 * Hat sich wirklich etwas geändert?
 *
 * Feldweise und nicht über `JSON.stringify`: die Reihenfolge der Schlüssel
 * wäre dort Teil des Vergleichs, und ein Entwurf aus einer anderen Quelle
 * gälte als geändert, obwohl er dasselbe sagt. Der Speichern-Balken erschiene
 * dann, ohne dass jemand etwas getan hat.
 */
function gleich(a: NewCustomer, b: NewCustomer): boolean {
  return (Object.keys(a) as (keyof NewCustomer)[]).every((f) => a[f] === b[f]);
}

/** Im Bearbeitungsfenster sind die Gruppen ohne weiteren Klick offen. */
function Gruppe({ name, children }: { name: string; children: React.ReactNode }) {
  return <section className="akten-editor-gruppe"><h3>{name}</h3>{children}</section>;
}

/** Die Stammdaten für alle, die sie nicht ändern dürfen. */
function StammdatenLesen({ k }: { k: Customer }) {
  return <><AktenAngaben>
    <AktenAngabe wort="Kundenart">{k.kundenart === 'unternehmen' ? 'Unternehmen' : k.kundenart === 'privat' ? 'Privatperson' : <Warnung>Kundenart prüfen</Warnung>}</AktenAngabe>
    <AktenAngabe wort="UID-Nummer">{k.vatId}</AktenAngabe>
    <AktenAngabe wort="Ansprechpartner">{k.contactName}</AktenAngabe>
    {!k.address?.trim() && <AktenAngabe wort="Rechnungsadresse">{null}</AktenAngabe>}
    {!k.contactPhone?.trim() && <AktenAngabe wort="Telefon">{null}</AktenAngabe>}
    {!k.email?.trim() && <AktenAngabe wort="E-Mail">{null}</AktenAngabe>}
    {k.lieferantennummer && <AktenAngabe wort="Unsere Lieferantennummer">{k.lieferantennummer}</AktenAngabe>}
  </AktenAngaben>{k.notes?.trim() && <><h3 className="section-label">Notiz</h3><p className="akten-notiz whitespace-pre-line">{k.notes}</p></>}</>;
}

interface FormularProps {
  entwurf: NewCustomer;
  setEntwurf: (e: NewCustomer) => void;
  geaendert: boolean;
  speichert: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onVerwerfen: () => void;
  uidPruefung?: React.ReactNode;
}

/**
 * Dieselben Stammdaten, bearbeitbar.
 *
 * DIE ANRUF- UND KARTENVERWEISE BLEIBEN — und stehen jetzt oben. Ein
 * Eingabefeld allein nähme der Akte genau das, wofür das Büro sie aufmacht:
 * die Nummer antippen und anrufen. Sie folgen dem, was gerade im Feld steht —
 * wer eine Nummer korrigiert, kann sie sofort wählen, ohne vorher zu
 * speichern.
 */
function StammdatenFormular({
  entwurf, setEntwurf, geaendert, speichert, fehler, onSpeichern, onVerwerfen, uidPruefung,
}: FormularProps) {
  const setze = (feld: keyof NewCustomer, wert: string | boolean) =>
    setEntwurf({ ...entwurf, [feld]: wert });

  return (
    <>
      <div className="min-w-0">
        <div className="akte-griffe">
          <AdresseLink adresse={entwurf.address} variante="knopf" />
          <TelefonLink nummer={entwurf.contactPhone} name={entwurf.contactName} variante="knopf" />
          <MailLink adresse={entwurf.email} variante="knopf" />
        </div>
        <Gruppe name="Anschrift">
          <InputField
            id="k-name" label="Name" pflicht value={entwurf.name}
            onChange={(e) => setze('name', e.target.value)}
          />
          <AdressteileFelder
            idPrefix="k-adresse"
            titel="Rechnungsadresse"
            wert={entwurf}
            onChange={(teile) =>
              setEntwurf({ ...entwurf, ...teile, land: teile.land ?? 'AT', address: adresseZeile({ ...entwurf, ...teile }) })
            }
          />
          <InputField
            id="k-nummer" label="Kundennummer (freiwillig)" value={entwurf.kundennummer ?? ''}
            onChange={(e) => setze('kundennummer', e.target.value)}
          />
          <InputField
            id="k-lieferant" label="Unsere Lieferantennummer bei diesem Kunden (freiwillig)"
            placeholder="für die E-Rechnung, z. B. 50012345"
            value={entwurf.lieferantennummer ?? ''}
            onChange={(e) => setze('lieferantennummer', e.target.value)}
          />
        </Gruppe>
        <Gruppe name="Kontakt">
          <InputField
            id="k-ansprech" label="Ansprechpartner" value={entwurf.contactName ?? ''}
            onChange={(e) => setze('contactName', e.target.value)}
          />
          <FormGrid>
            <InputField
              id="k-telefon" label="Telefon" type="tel" value={entwurf.contactPhone ?? ''}
              onChange={(e) => setze('contactPhone', e.target.value)}
            />
            <InputField
              id="k-mail" label="E-Mail" type="email" value={entwurf.email ?? ''}
              onChange={(e) => setze('email', e.target.value)}
            />
          </FormGrid>
        </Gruppe>
        <Gruppe name="Kundenart und UID">
          <KundenartUidFelder
            idPrefix="k"
            kundenart={entwurf.kundenart}
            vatId={entwurf.vatId}
            onChange={({ kundenart, vatId }) => setEntwurf({ ...entwurf, kundenart: kundenart || null, vatId })}
          />
        </Gruppe>
      </div>

      {/* Notiz und Zustand stehen offen: sie sind kurz, und die Notiz ist das,
          was man vor dem Anruf wissen muss. */}
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="k-notiz" className="text-sm font-normal text-ink">Notiz</label>
          <textarea
            id="k-notiz"
            rows={3}
            className="min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-placeholder focus:border-brand focus:ring-1 focus:ring-brand"
            value={entwurf.notes ?? ''}
            onChange={(e) => setze('notes', e.target.value)}
          />
        </div>

        {/*
          DER ZUSTAND IST EIN KÄSTCHEN UND KEIN LÖSCHEN. Ein Kunde mit
          Baustellen und Rechnungen verschwindet nicht; er wird stillgelegt.
        */}
        <CheckboxField
          id="k-aktiv"
          label="Aktiv — erscheint in den Auswahlfeldern"
          checked={entwurf.active !== false}
          onChange={(e) => setze('active', e.target.checked)}
        />

      </div>
      {uidPruefung}
      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

        {/*
          DER BALKEN ERSCHEINT ERST BEI EINER ÄNDERUNG — als Aktionsleiste, wie
          am Buchungsformular: am Telefon klebt sie ÜBER der Reiterleiste, am
          Schreibtisch steht sie rechtsbündig unter dem Formular. So ist
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
