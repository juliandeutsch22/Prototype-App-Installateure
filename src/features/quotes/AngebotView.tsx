import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { canAccess } from '@/app/navigation';
import { annahmeZuruecknehmen, getQuote, listFassungen, updateQuote } from '@/lib/db/quotes';
import { baustelleVerwendung } from '@/lib/db/projects';
import { ruecknahmeFolge } from '@/features/projects/baustelleVerwendung';
import { TextareaField } from '@/components/Field';
import { listCustomersByIds } from '@/lib/db/customers';
import { belegFirma } from '@/lib/db/aussteller';
import { isGF } from '@/lib/permissions';
import { praefixeVon } from '@/lib/praefixe';
import { todayStr } from '@/lib/time';
import type { Abrechnungsart, Customer, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Aktenspalten from '@/components/Aktenspalten';
import Button from '@/components/Button';
import KnopfLink from '@/components/KnopfLink';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import RowMenu from '@/components/RowMenu';
import Metric, { MetricRow } from '@/components/Metric';
import { LotVerlauf, Sprungleiste, type LotPunkt } from '@/components/LotBausteine';
import ObjektVerlauf from '@/features/verlauf/ObjektVerlauf';
import { verlaufSichtbar } from '@/features/verlauf/verlaufSichtbar';
import { Zustand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import { angebotAnnehmen, annahmeMeldung } from './angebotAnnehmen';
import { fassungsHinweis } from './fassungen';
import { downloadAngebotPdf } from './angebotPdf';
import { STAND, standWort } from './stand';
import { verwerfenFrage, VERWORFEN_MELDUNG, WIEDERHERGESTELLT_MELDUNG } from './verwerfen';
import { hatPosition, statusFrage, type StatusFrage } from './statusFrage';
import Hinweiszeile from '@/components/Hinweiszeile';
import AnnahmeZiel from './AnnahmeZiel';
import { zielBereit, zielVorgabe, type AnnahmeZielWert } from './annahmeZiel';
import PositionenTabelle from './PositionenTabelle';
import { AnnahmeLinkAbschnitt, AnnahmeLinkDialog } from './AnnahmeLink';
import { angebotLinkGesehen, angebotLinkWiderrufen, listAngebotLinks, type AngebotLink } from '@/lib/db/angebotLinks';
import { useModul } from '@/lib/useModule';
import { liegenschaftZeile } from '@/features/liegenschaften/liegenschaftText';
import { getEingangZu } from '@/lib/db/auftragseingaenge';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT, datumAusMs } from '@/lib/datum';
import { verworfenText } from '@/features/papierkorb/papierkorbText';
import { euro } from '@/lib/betrag';
import { DRINGLICHKEIT_TEXT } from '@/features/auftragseingang/eingangText';

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
  const { user, company, einblick } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [angebot, setAngebot] = useState<Teil<WithId<Quote> | null>>(LAEDT);
  const [kunde, setKunde] = useState<Teil<WithId<Customer> | null>>(LAEDT);
  const [versuch, setVersuch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [verwerfenFragen, setVerwerfenFragen] = useState(false);
  /** Ein Standwechsel, der erst nach der Rückfrage gilt (A5). */
  const [wechselFrage, setWechselFrage] = useState<{ q: WithId<Quote>; frage: StatusFrage } | null>(null);
  const [annehmenFragen, setAnnehmenFragen] = useState(false);
  /*
    DIE RÜCKNAHME EINER ANNAHME (A1, F7): Fehlklick oder Rücktritt des
    Kunden. Der Grund ist Pflicht; was mit der Baustelle geschieht, sagt die
    Rückfrage vorher — aus derselben Zählung, mit der die Datenbank
    entscheidet (`baustelle_verwendung`).
  */
  const [ruecknahme, setRuecknahme] = useState(false);
  const [ruecknahmeGrund, setRuecknahmeGrund] = useState('');
  const [ruecknahmeFolgeText, setRuecknahmeFolgeText] = useState<Teil<string> | null>(null);
  /** Die Abrechnung der Baustelle, die beim Annehmen entsteht (M16). */
  const [abrechnung, setAbrechnung] = useState<Abrechnungsart>('Pauschal');
  /** Neue Baustelle oder Nachtrag an eine bestehende (A3, F6). */
  const [ziel, setZiel] = useState<AnnahmeZielWert>({ art: 'neu', baustelleId: '', projekt: null });
  /** Die Fassungen rundherum (M17): woraus dieses Angebot entstand, was daraus wurde. */
  const [vorgaenger, setVorgaenger] = useState<WithId<Quote> | null>(null);
  const [fassungen, setFassungen] = useState<WithId<Quote>[]>([]);
  /** Die Annahme-Links (M02a), der jüngste zuerst — laden für sich wie die Fassungen. */
  const [links, setLinks] = useState<Teil<AngebotLink[]>>(LAEDT);
  const [linksVersuch, setLinksVersuch] = useState(0);
  const [linkDialog, setLinkDialog] = useState(false);
  const onlineAnnahme = useModul('angebote.online_annahme');
  const liegenschaftenAn = useModul('kunden.liegenschaften');

  const companyId = user?.companyId;
  const darfAendern = user ? isGF(user.role) : false;
  const baustellenSichtbar = user ? canAccess(user.role, '/admin-projects', company?.modules) : false;
  /** Der Auftragseingang, aus dem das Angebot entstand (M02b) — nur mit der Unterfähigkeit. */
  const eingaengeSichtbar = user ? canAccess(user.role, '/eingaenge', company?.modules) : false;
  const [ausEingang, setAusEingang] = useState<{ id: string; nummer: string } | null>(null);

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

  /* Der Eingang lädt für sich (M02b): scheitert er, fehlt nur der Verweis. */
  useEffect(() => {
    if (!companyId || !id || !eingaengeSichtbar) {
      setAusEingang(null);
      return;
    }
    let weg = false;
    getEingangZu(companyId, { quoteId: id })
      .then((e) => { if (!weg) setAusEingang(e); })
      .catch(() => { if (!weg) setAusEingang(null); });
    return () => {
      weg = true;
    };
  }, [companyId, id, eingaengeSichtbar]);

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
    DIE ANNAHME-LINKS LADEN FÜR SICH (M02a). Scheitern sie, sagt ein
    Teilfehler das; das Angebot bleibt lesbar. Im Supporteinblick nicht: die
    Links tragen Name und Unterschrift des Kunden, und die bleiben dem
    Support verschlossen (wie das Journal).
  */
  useEffect(() => {
    if (!companyId || !id || angebot.zustand !== 'bereit' || einblick) return;
    let weg = false;
    setLinks(LAEDT);
    void (async () => {
      try {
        const l = await listAngebotLinks(id);
        if (!weg) setLinks({ zustand: 'bereit', daten: l });
      } catch {
        if (!weg) setLinks({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, angebot.zustand, einblick, versuch, linksVersuch]);

  /*
    GESEHEN (M02a): öffnet jemand aus der Führung ein über den Link
    angenommenes Angebot, geht der Hinweis auf der Startseite. Scheitert das,
    bleibt er höchstens sieben Tage stehen — kein Grund, die Seite zu stören.
  */
  const fuehrung = user ? isGF(user.role) : false;
  useEffect(() => {
    if (links.zustand !== 'bereit' || !fuehrung || einblick) return;
    for (const l of links.daten) {
      if (l.zustand === 'angenommen' && !l.gesehenAm) void angebotLinkGesehen(l.id).catch(() => undefined);
    }
  }, [links, fuehrung, einblick]);

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

  const ruecknahmeProjekt = ruecknahme && angebot.zustand === 'bereit' ? angebot.daten?.projectId ?? null : null;
  const ruecknahmeNummer = angebot.zustand === 'bereit' ? angebot.daten?.projectNumber ?? '' : '';
  useEffect(() => {
    if (!ruecknahme || !id) {
      setRuecknahmeFolgeText(null);
      return;
    }
    if (!ruecknahmeProjekt) {
      setRuecknahmeFolgeText({ zustand: 'bereit', daten: 'An diesem Angebot hängt keine Baustelle mehr.' });
      return;
    }
    let weg = false;
    setRuecknahmeFolgeText(LAEDT);
    baustelleVerwendung(ruecknahmeProjekt)
      .then((v) => { if (!weg) setRuecknahmeFolgeText({ zustand: 'bereit', daten: ruecknahmeFolge(v, id, ruecknahmeNummer) }); })
      .catch(() => { if (!weg) setRuecknahmeFolgeText({ zustand: 'fehler' }); });
    return () => {
      weg = true;
    };
  }, [ruecknahme, ruecknahmeProjekt, ruecknahmeNummer, id]);

  async function annahmeZurueck(q: WithId<Quote>) {
    const r = await annahmeZuruecknehmen(q.id, ruecknahmeGrund.trim());
    const baustelle = r.baustelle
      ? r.ergebnis === 'geloescht'
        ? ` Baustelle ${r.baustelle} gelöscht.`
        : r.ergebnis === 'abgeschlossen'
          ? ` Baustelle ${r.baustelle} abgeschlossen.`
          : ''
      : '';
    toast.success(
      `Annahme zurückgenommen — ${q.quoteNumber} ist wieder ${r.status === 'Entwurf' ? 'ein Entwurf' : 'versendet'}.${baustelle}`,
      r.baustelleId && baustellenSichtbar
        ? { label: 'Zur Baustelle', onClick: () => navigate(`/admin-projects/${r.baustelleId}`) }
        : undefined,
    );
    setRuecknahme(false);
    setRuecknahmeGrund('');
    setVersuch((v) => v + 1);
  }

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

  /** Nach der Rückfrage (A5): scheitert es, bleibt der Dialog offen und sagt den Grund der Datenbank. */
  async function statusNachFrage(q: WithId<Quote>, neu: Quote['status'], meldung: string) {
    await updateQuote(q.id, { status: neu });
    toast.success(meldung);
    setVersuch((v) => v + 1);
  }

  async function annehmen(q: WithId<Quote>) {
    if (!companyId) return;
    setBusy(true);
    setFehler(null);
    try {
      toast.success(annahmeMeldung(await angebotAnnehmen(
        companyId, q, praefixeVon(company).baustelle, abrechnung, ziel.art === 'nachtrag' ? ziel.baustelleId : null,
      )));
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
      // Ein versendetes Angebot mit den Firmendaten seines Versands, ein Entwurf mit den heutigen.
      await downloadAngebotPdf({ company: await belegFirma(company, q.ausstellerStand), quote: q, kunde: kunde.daten });
    } catch {
      setFehler('Das PDF konnte nicht erzeugt werden.');
    } finally {
      setPdfLaeuft(false);
    }
  }

  if (!user) return null;

  /*
    DER WEG ZURÜCK STEHT IN DER ORTSZEILE (Linie „Lot“, Seitenkopf): klein
    über dem Titel, wo „wo bin ich“ steht — seit E31 wie in den Akten über
    `zurueck` des Seitenkopfs, mit derselben Tastfläche.
  */
  const zurueck = { to: '/quotes', text: 'Zu den Angeboten' };

  if (angebot.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" zurueck={zurueck} />
        <Card><SkeletonList rows={4} /></Card>
      </div>
    );
  }
  if (angebot.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Angebot" zurueck={zurueck} />
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
        <PageHeader title="Angebot" zurueck={zurueck} />
        <Card>
          <EmptyState action={<Link to="/quotes" className="link-weiter">Zur Angebotsliste</Link>}>
            Dieses Angebot gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  const offen = q.status === 'Entwurf' || q.status === 'Versendet';
  /*
    DIE FASSUNGEN RUNDHERUM (Runde 6, G15): ist eine andere schon angenommen
    (Bestand von vor dem Stand „Ersetzt“), wird diese nicht angenommen; sonst
    sagt der Dialog, welche danach als ersetzt gelten.
  */
  const nachbarn = fassungsHinweis(q, [...(vorgaenger ? [vorgaenger] : []), ...fassungen]);
  const abgelaufen = offen && q.validUntil < todayStr();
  /* Ein neuer Annahme-Link: wo heute versendet oder angenommen werden kann (M02a). */
  const linkNeuMoeglich = offen && !nachbarn.angenommen;
  const linkMoeglich = linkNeuMoeglich && darfAendern && onlineAnnahme && !einblick;
  const linkListe = links.zustand === 'bereit' ? links.daten : [];
  /* Hat der Kunde einen Link schon geöffnet oder entschieden? Solange die Links nicht geladen sind: vorsichtshalber ja. */
  const linkGesehen = links.zustand !== 'bereit'
    || linkListe.some((l) => l.zuerstGeoeffnetAm || l.angenommenAm || l.abgelehntAm);
  /*
    IM PAPIERKORB (M01d): nur lesen. Der einzige Schritt ist das
    Wiederherstellen — außer, eine andere Fassung ist inzwischen angenommen;
    dann bleibt es dort (die Datenbank nähme es nicht zurück, G15).
  */
  const imPapierkorb = q.status === 'Verworfen';
  const zurueckholbar = imPapierkorb && darfAendern && !nachbarn.angenommen;

  /*
    DIE ZUSAMMENFASSUNG ZUERST (Linie „Lot“, Regel 6): was das Angebot wert
    ist, wie viel Arbeit darin steckt und bis wann es gilt — im Seitenkopf
    (E24), unter Kunde und Stand des Angebots. Die kalkulierte
    Arbeitszeit ist intern — sie steht nicht auf dem PDF, sie wird beim
    Annehmen zum Budget der Baustelle.
  */
  const kennzahlen = (
    <MetricRow>
      <Metric label="Brutto" value={euro(q.totalBrutto)} />
      <Metric label="Netto" value={euro(q.totalNetto)} />
      {/* Kurz (E76): „Kalkulierte Arbeitszeit“ passte am Handy und am Tablet nicht ins Feld und endete mit „…“. */}
      <Metric label="Kalk. Stunden" value={`${fmtMenge(q.kalkulierteStunden)} h`} />
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
          {/* Ein Schritt wie seine Nachbarn, kein Text daneben (E72, R1). */}
          <KnopfLink to={`/quotes?bearbeiten=${q.id}`} variant="secondary">
            Bearbeiten
          </KnopfLink>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => setWechselFrage({ q, frage: statusFrage(q, 'versenden') })}
          >
            Als versendet markieren
          </Button>
        </>
      )}
      {offen && !nachbarn.angenommen && (
        <Button variant="secondary" loading={busy} onClick={() => { setAbrechnung('Pauschal'); setZiel(zielVorgabe(q)); setAnnehmenFragen(true); }}>
          Annehmen → Baustelle
        </Button>
      )}
      {/*
        DER ANNAHME-LINK (M02a) neben dem internen Annehmen: der Kunde nimmt
        selbst an. Nicht im Supporteinblick — der Link ist eine Erklärung des
        Betriebs an seinen Kunden (die Datenbank weist den Support ab).
      */}
      {linkMoeglich && hatPosition(q) && (
        <Button variant="secondary" onClick={() => setLinkDialog(true)}>
          Annahme-Link
        </Button>
      )}
      {/* A5: ein leeres Angebot geht nicht hinaus — weder als versendet noch über den Link. */}
      {offen && !hatPosition(q) && (
        <span className="text-sm text-ink-muted">Noch ohne Position — versenden und verlinken geht erst mit einer.</span>
      )}
      {offen && nachbarn.angenommen && (
        <span className="text-sm text-ink-muted">
          Die Fassung {nachbarn.angenommen.quoteNumber} ist schon angenommen — diese wird nicht mehr angenommen.
        </span>
      )}
      {/*
        ÜBERARBEITEN, OHNE ZU ÄNDERN (M17). Was beim Kunden liegt, bleibt;
        die neue Fassung ist ein eigener Entwurf mit eigener Nummer.
      */}
      {(q.status === 'Versendet' || q.status === 'Abgelehnt') && (
        <KnopfLink to={`/quotes?neueFassung=${q.id}`} variant="secondary">
          Neue Fassung
        </KnopfLink>
      )}
    </span>
  ) : null;

  /*
    DER VERLAUF ALS LOT (Regel 7) — nur aus dem, was geladen ist: das
    Angebotsdatum, der Status, die Fassungen davor und danach (M17). Seit
    12.10.2026 (17 G) hält die Datenbank fest, wann versendet, angenommen
    oder abgelehnt wurde; ältere Angebote haben dort kein Datum, und es wird
    keines geraten.

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
    // Versendet war es auch, wenn es danach angenommen oder abgelehnt wurde —
    // das steht dann als eigener Punkt davor, sofern sein Tag bekannt ist.
    ...(q.status !== 'Entwurf' && q.status !== 'Versendet' && q.versendetAm
      ? [{ titel: 'Versendet', zeit: datumAusMs(q.versendetAm) }]
      : []),
    // A1: die zurückgenommene Annahme bleibt im Verlauf stehen, mit ihrem Grund.
    ...(q.annahmeZurueckgenommenAm
      ? [{
          titel: 'Annahme zurückgenommen',
          zeit: datumAusMs(q.annahmeZurueckgenommenAm),
          text: q.annahmeZurueckgenommenGrund ? `Grund: ${q.annahmeZurueckgenommenGrund}` : undefined,
        }]
      : []),
    q.status === 'Entwurf'
      ? { titel: 'Entwurf', text: <>Noch nicht versendet.{schritte}</>, jetzt: true }
      : q.status === 'Versendet'
        ? {
            titel: 'Versendet',
            zeit: [q.versendetAm ? `am ${datumAusMs(q.versendetAm)}` : '', `gültig bis ${fmtDatum(q.validUntil)}`]
              .filter(Boolean)
              .join(' · '),
            text: <>{abgelaufen ? 'Die Bindefrist ist abgelaufen.' : 'Wartet auf die Antwort des Kunden.'}{schritte}</>,
            jetzt: true,
          }
        : q.status === 'Angenommen'
          ? {
              titel: 'Angenommen',
              zeit: q.angenommenAm ? datumAusMs(q.angenommenAm) : undefined,
              text: q.projectNumber ? `Baustelle ${q.projectNumber}` : undefined,
            }
          : q.status === 'Ersetzt'
            ? { titel: 'Ersetzt', text: 'Eine andere Fassung dieses Angebots wurde angenommen.' }
            : imPapierkorb
              ? {
                  titel: 'Im Papierkorb',
                  zeit: q.verworfenAm ? datumAusMs(q.verworfenAm) : undefined,
                  text: (
                    <>
                      {nachbarn.angenommen
                        ? `Die Fassung ${nachbarn.angenommen.quoteNumber} ist inzwischen angenommen — dieses Angebot bleibt im Papierkorb.`
                        : 'Wiederhergestellt ist es wieder ein Entwurf.'}
                      {darfAendern && (
                        <>
                          {' '}
                          <Link to="/settings/papierkorb" className="link -my-3 py-3">Zum Papierkorb</Link>
                        </>
                      )}
                    </>
                  ),
                  jetzt: true,
                }
              : { titel: 'Abgelehnt', zeit: q.abgelehntAm ? datumAusMs(q.abgelehntAm) : undefined, text: schritte },
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
      {/* Unter dem Stand des Angebots: wer was wann daran geändert hat (M01b) — auf Klick. */}
      {companyId && verlaufSichtbar(user.role, 'angebot', !!einblick) && <ObjektVerlauf companyId={companyId} objektart="angebot" objektId={q.id} />}
    </Card>
  );

  const angaben = (
    <Card title="Angaben" id="angebot-angaben">
      <dl className="beleg-angaben grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
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
        {/* M02c: Liegenschaft und Top — die Annahme gibt sie an die Baustelle weiter. */}
        {liegenschaftenAn && q.liegenschaftId && (
          <Angabe wort="Liegenschaft">
            {canAccess(user.role, '/liegenschaften', company?.modules) ? (
              <Link to={`/liegenschaften/${q.liegenschaftId}`} className="link inline-flex min-h-touch items-center">
                {liegenschaftZeile(q)}
              </Link>
            ) : liegenschaftZeile(q)}
          </Angabe>
        )}
        <Angabe wort="Angebotsdatum">{fmtDatum(q.quoteDate)}</Angabe>
        {/* A8: Arbeitsangaben aus dem Eingang — nicht auf dem Angebot beim Kunden, die Annahme gibt sie weiter. */}
        {(q.ansprechpartnerName || q.ansprechpartnerTelefon) && (
          <Angabe wort="Ansprechpartner vor Ort">
            {[q.ansprechpartnerName, q.ansprechpartnerTelefon].filter(Boolean).join(' · ')}
          </Angabe>
        )}
        {q.dringlichkeit && q.dringlichkeit !== 'normal' && (
          <Angabe wort="Dringlichkeit">{DRINGLICHKEIT_TEXT[q.dringlichkeit]}</Angabe>
        )}
        {q.wunschtermin && <Angabe wort="Wunschtermin">{fmtDatum(q.wunschtermin)}</Angabe>}
        {ausEingang && (
          <Angabe wort="Herkunft">
            <Link to={`/eingaenge/${ausEingang.id}`} className="link inline-flex min-h-touch items-center">
              Aus Eingang {ausEingang.nummer}
            </Link>
          </Angabe>
        )}
        {/* A3: vor der Annahme die Baustelle, an die das Angebot als Nachtrag kommt. */}
        <Angabe wort={q.status === 'Angenommen' ? (q.nachtrag ? 'Baustelle (Nachtrag)' : 'Baustelle') : q.projectNumber ? 'Nachtrag zu Baustelle' : 'Baustelle'}>
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
  /* Gezählt werden nur Positionen — Titel und Text tragen keine Nummer (M18). */
  const posAnzahl = q.positions.filter((p) => (p.art ?? 'position') === 'position').length;
  const positionen = (
    <Card title={`Positionen (${posAnzahl})`} id="angebot-positionen">
      <PositionenTabelle q={q} />
    </Card>
  );
  /*
    ANNAHME PER LINK (M02a): was aus dem Link wurde — nur, wenn es einen gab.
    Ein Ladefehler steht als Teilfehler oben; das Angebot bleibt lesbar.
  */
  const annahmeLink = linkListe.length > 0 ? (
    <AnnahmeLinkAbschnitt
      links={linkListe}
      darfAendern={darfAendern && !einblick}
      modulAn={onlineAnnahme}
      neuMoeglich={linkNeuMoeglich}
      onNeu={() => setLinkDialog(true)}
      onWiderrufen={async (l) => {
        await angebotLinkWiderrufen(l.id);
        toast.success('Annahme-Link widerrufen');
        setLinksVersuch((v) => v + 1);
      }}
    />
  ) : null;
  const anmerkungen = q.notes?.trim() ? (
    <Card title="Anmerkungen" id="angebot-anmerkungen">
      <p className="whitespace-pre-line text-sm text-ink">{q.notes}</p>
    </Card>
  ) : null;

  /*
    SELTENE AKTIONEN IM „⋯“ des Seitenkopfs (Regel 2) — dieselben wie bisher
    in der Karte „Weiter“, ein Tipp weiter. Verwerfen nur im Entwurf: alles
    Versendete bleibt nachvollziehbar. Im Papierkorb gibt es keine — dort
    ist nur zu lesen und wiederherzustellen.
  */
  const mehr = darfAendern && !imPapierkorb ? (
    <RowMenu
      about={`Angebot ${q.quoteNumber}`}
      items={[
        ...(offen
          ? [{ label: 'Als abgelehnt markieren', onSelect: () => setWechselFrage({ q, frage: statusFrage(q, 'ablehnen') }) }]
          : []),
        // A5: der Rückweg, solange der Kunde den Link nicht geöffnet hat (die Datenbank prüft dasselbe).
        ...(q.status === 'Versendet' && !linkGesehen
          ? [{ label: 'Zurück in den Entwurf', onSelect: () => setWechselFrage({ q, frage: statusFrage(q, 'zurueckInEntwurf') }) }]
          : []),
        // A5: eine im Büro vermerkte Ablehnung lässt sich zurücknehmen — die des Kunden über den Link nicht.
        ...(q.status === 'Abgelehnt' && !linkListe.some((l) => l.abgelehntAm)
          ? [{ label: 'Ablehnung zurücknehmen', onSelect: () => setWechselFrage({ q, frage: statusFrage(q, 'ablehnungZurueck') }) }]
          : []),
        // A1: der Rückweg aus „Angenommen“ — nicht rot im Menü, die Rückfrage sagt, was geschieht.
        ...(q.status === 'Angenommen'
          ? [{ label: 'Annahme zurücknehmen', onSelect: () => { setRuecknahmeGrund(''); setRuecknahme(true); } }]
          : []),
        // Dasselbe ohne Verweis — etwa als Vorlage für einen ähnlichen Auftrag (M17).
        { label: 'Als Kopie anlegen', onSelect: () => navigate(`/quotes?kopie=${q.id}`) },
        // Nicht rot: es landet im Papierkorb und lässt sich zurückholen (M01d).
        ...(q.status === 'Entwurf'
          ? [{ label: 'Verwerfen', onSelect: () => setVerwerfenFragen(true) }]
          : []),
      ]}
    />
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        zurueck={zurueck}
        // Die Nummer als Nummernstempel neben dem Titel (Planlinie B10), wie in jeder Akte.
        title="Angebot"
        stempel={q.quoteNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{q.customerName}</span>
            <Zustand stand={STAND[q.status]}>{standWort(q.status)}</Zustand>
            {/* „abgelaufen“ wie in der Liste: am Handy lief die Zeile sonst auf drei Zeilen (E72, D8); „Gültig bis“ steht darunter. */}
            {abgelaufen && <Zustand stand="achtung">abgelaufen</Zustand>}
          </span>
        }
        mehr={mehr}
        stand={kennzahlen}
        action={
          imPapierkorb ? (
            // Die eine Hauptaktion im Papierkorb; ein PDF eines verworfenen Entwurfs braucht niemand.
            zurueckholbar ? (
              <Button loading={busy} onClick={() => void status(q, 'Entwurf', WIEDERHERGESTELLT_MELDUNG)}>
                Wiederherstellen
              </Button>
            ) : undefined
          ) : (
            <Button
              onClick={() => void pdf(q)}
              loading={pdfLaeuft}
              disabled={kunde.zustand !== 'bereit'}
            >
              PDF herunterladen
            </Button>
          )
        }
      />

      {imPapierkorb && (
        <Hinweiszeile>
          <p>
            <b>Im Papierkorb</b> — {verworfenText(q, Date.now())}. Nur zum Lesen: bearbeiten, versenden
            und annehmen lässt es sich erst wiederhergestellt.
          </p>
        </Hinweiszeile>
      )}

      {kunde.zustand === 'fehler' && (
        <TeilFehler
          was="die Anschrift des Kunden (für das PDF)"
          onRetry={() => setVersuch((v) => v + 1)}
        />
      )}
      {links.zustand === 'fehler' && (
        <TeilFehler was="die Annahme-Links" onRetry={() => setLinksVersuch((v) => v + 1)} />
      )}
      {fehler && <ErrorState message={fehler} />}

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
            ...(annahmeLink ? [{ id: 'angebot-annahmelink', text: 'Annahme per Link' }] : []),
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
        telefon={[verlauf, annahmeLink, angaben, positionen, anmerkungen]}
        links={[positionen, anmerkungen]}
        rechts={[verlauf, annahmeLink, angaben]}
      />

      {/* Der Link wird nur einmal gezeigt — die Seite lädt erst neu, wenn das Fenster zu ist. */}
      {linkDialog && (
        <AnnahmeLinkDialog
          open
          angebot={q}
          firma={company?.name ?? ''}
          kundenEmail={kunde.zustand === 'bereit' ? kunde.daten?.email : undefined}
          vorsatz={praefixeVon(company).baustelle}
          heute={todayStr()}
          ersetztOffenenLink={linkListe.some((l) => l.zustand === 'offen')}
          onClose={(erzeugt) => {
            setLinkDialog(false);
            if (erzeugt) setVersuch((v) => v + 1);
          }}
        />
      )}

      {/* Erst fragen, dann anlegen (Launch-Check, M8) — wie in der Liste. */}
      <ConfirmDialog
        open={annehmenFragen}
        title="Angebot annehmen?"
        message={ziel.art === 'nachtrag'
          ? `${q.quoteNumber} wird angenommen und kommt als Nachtrag an die gewählte Baustelle.`
          : `${q.quoteNumber} wird angenommen, und für ${q.customerName} entsteht eine Baustelle mit der nächsten Baustellennummer.`}
        confirmLabel="Annehmen"
        confirmTone="primary"
        gesperrt={!zielBereit(ziel)}
        onCancel={() => setAnnehmenFragen(false)}
        onConfirm={async () => {
          setAnnehmenFragen(false);
          await annehmen(q);
        }}
      >
        {nachbarn.ersetzt.length > 0 && (
          <p className="text-sm text-ink">
            Damit gilt {nachbarn.ersetzt.map((x) => x.quoteNumber).join(', ')} als ersetzt und lässt sich nicht
            mehr annehmen.
          </p>
        )}
        {companyId && (
          <AnnahmeZiel companyId={companyId} angebot={q} ziel={ziel} onZiel={setZiel} abrechnung={abrechnung} onAbrechnung={setAbrechnung} />
        )}
      </ConfirmDialog>

      {/* A5: kein Standwechsel mit einem Tipp — erst fragen, und sagen, wie es zurückgeht. */}
      <ConfirmDialog
        open={!!wechselFrage}
        title={wechselFrage?.frage.titel ?? ''}
        message={wechselFrage?.frage.text}
        confirmLabel={wechselFrage?.frage.label}
        confirmTone="primary"
        gesperrt={!!wechselFrage?.frage.gesperrt}
        onCancel={() => setWechselFrage(null)}
        onConfirm={async () => {
          const w = wechselFrage;
          if (!w) return;
          await statusNachFrage(w.q, w.frage.neu, w.frage.meldung);
          setWechselFrage(null);
        }}
      />

      {/* A1: Annahme zurücknehmen — Grund ist Pflicht, die Folge für die Baustelle steht davor. */}
      <ConfirmDialog
        open={ruecknahme}
        title="Annahme zurücknehmen?"
        message={`${q.quoteNumber} ist danach wieder ${q.versendetAm ? 'versendet' : 'ein Entwurf'} und lässt sich erneut annehmen oder ablehnen.`}
        confirmLabel="Annahme zurücknehmen"
        confirmTone="danger"
        gesperrt={ruecknahmeGrund.trim().length < 3}
        onCancel={() => setRuecknahme(false)}
        onConfirm={() => annahmeZurueck(q)}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink" role="status">
            {ruecknahmeFolgeText === null || ruecknahmeFolgeText.zustand === 'laedt'
              ? 'Wird nachgesehen, was an der Baustelle hängt …'
              : ruecknahmeFolgeText.zustand === 'fehler'
                ? `Was an der Baustelle ${q.projectNumber ?? ''} hängt, ließ sich gerade nicht nachsehen. Hängt nichts daran, wird sie gelöscht, sonst abgeschlossen.`
                : ruecknahmeFolgeText.daten}
          </p>
          {[...(vorgaenger ? [vorgaenger] : []), ...fassungen].some((f) => f.status === 'Ersetzt') && (
            <p className="text-sm text-ink">
              Wieder offen sind dann auch{' '}
              {[...(vorgaenger ? [vorgaenger] : []), ...fassungen].filter((f) => f.status === 'Ersetzt').map((f) => f.quoteNumber).join(', ')}.
            </p>
          )}
          <TextareaField
            id="annahme-zurueck-grund"
            label="Grund"
            pflicht
            required
            rows={3}
            placeholder="z. B. Kunde ist zurückgetreten, falsche Fassung angenommen"
            value={ruecknahmeGrund}
            onChange={(e) => setRuecknahmeGrund(e.target.value)}
          />
        </div>
      </ConfirmDialog>

      {/* Verwerfen statt löschen (M01d): umkehrbar, deshalb nicht rot. */}
      <ConfirmDialog
        open={verwerfenFragen}
        title="Entwurf verwerfen?"
        message={verwerfenFrage(q, ausEingang)}
        confirmLabel="Verwerfen"
        confirmTone="primary"
        onCancel={() => setVerwerfenFragen(false)}
        onConfirm={async () => {
          setVerwerfenFragen(false);
          await status(q, 'Verworfen', VERWORFEN_MELDUNG);
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
