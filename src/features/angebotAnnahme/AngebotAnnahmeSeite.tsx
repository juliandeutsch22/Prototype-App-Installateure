import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import RechtLinks from '@/components/RechtLinks';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import Metric, { MetricRow } from '@/components/Metric';
import { CheckboxField, InputField, TextareaField } from '@/components/Field';
import { ErrorState, LoadingState } from '@/components/States';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
import { Zustand } from '@/components/Badge';
import { taktHalten } from '@/lib/takt';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import { mitAussteller } from '@/lib/aussteller';
import { istZeichenbar } from '@/lib/pdfBriefkopf';
import { annahmeAnfrage, type AnnahmeAntwort, type AnnahmeStand } from '@/lib/db/angebotAnnahme';
import { GRUND_MAX, NAME_MAX, SCHLUESSEL_FORM, ablehnungFehler, annahmeFehler } from '@shared/angebotLink';
import PositionenTabelle from '@/features/quotes/PositionenTabelle';
import { zeitpunkt } from '@/features/quotes/annahmeLink';
import { downloadAngebotPdf } from '@/features/quotes/angebotPdf';
import type { Company } from '@/types';

/**
 * DIE SEITE DES ANNAHME-LINKS (M02a, A06) — für den Kunden, ohne Anmeldung.
 *
 * DER SCHLÜSSEL STEHT IM FRAGMENT (`/angebot/annehmen#<schlüssel>`). Das
 * Fragment schickt kein Browser an einen Server: es steht weder im Protokoll
 * der Auslieferung (Firebase Hosting liefert für jede Adresse dieselbe
 * `index.html`) noch im `Referer` einer anderen Seite. Die Seite liest es
 * selbst und schickt den Schlüssel im Rumpf an die Edge Function — die
 * liegt auf der Supabase-Adresse, die die Inhaltsregel ohnehin erlaubt.
 *
 * WIE IMPRESSUM UND DATENSCHUTZ: ohne Hülle der App, das Raster als
 * Zeichentisch, das Angebot als Blatt darauf (E44). Handy zuerst — so wird
 * ein Link aus einer Mail meistens geöffnet.
 *
 * NICHTS IM SPEICHER DES BROWSERS: kein `localStorage`, kein Cookie. Name
 * und Unterschrift leben nur im Formular, bis sie abgeschickt sind.
 */

type Seite =
  | { zustand: 'laedt' }
  | { zustand: 'ungueltig' }
  | { zustand: 'zu_viele'; grund: string }
  | { zustand: 'fehler'; grund: string }
  | MitStand;

/** Eine Antwort mit dem Stand des Angebots: offen, angenommen oder abgelehnt. */
type MitStand = Extract<AnnahmeAntwort, { stand: AnnahmeStand }>;

function schluesselAusAdresse(): string {
  return typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.replace(/^#/, ''));
}

/** Die Firmendaten des Angebots für das PDF — nur die des Versands, nichts von heute. */
function firmaAus(stand: AnnahmeStand): Company {
  return mitAussteller({ id: '', name: stand.aussteller.name ?? '' }, stand.aussteller);
}

export default function AngebotAnnahmeSeite() {
  const flaeche = useRef<HTMLDivElement>(null);
  useEffect(() => (flaeche.current ? taktHalten(flaeche.current) : undefined), []);

  const [schluessel, setSchluessel] = useState(schluesselAusAdresse);
  const [seite, setSeite] = useState<Seite>({ zustand: 'laedt' });
  const [versuch, setVersuch] = useState(0);

  // Ein anderer Link im selben Fenster (nur das Fragment ändert sich) lädt neu.
  useEffect(() => {
    const neu = () => setSchluessel(schluesselAusAdresse());
    window.addEventListener('hashchange', neu);
    return () => window.removeEventListener('hashchange', neu);
  }, []);

  useEffect(() => {
    let weg = false;
    if (!SCHLUESSEL_FORM.test(schluessel)) {
      // Ein falsch geformter Schlüssel geht gar nicht erst hinaus.
      setSeite({ zustand: 'ungueltig' });
      return;
    }
    setSeite({ zustand: 'laedt' });
    void (async () => {
      try {
        const a = await annahmeAnfrage({ aktion: 'abruf', schluessel });
        if (!weg) setSeite(a);
      } catch (e) {
        if (!weg) setSeite({ zustand: 'fehler', grund: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      weg = true;
    };
  }, [schluessel, versuch]);

  const erneut = useCallback(() => setVersuch((v) => v + 1), []);

  return (
    <SeitenHilfeProvider>
      <div ref={flaeche} className="hauptflaeche recht-flaeche">
        <main className="inhalt recht-inhalt">
          <div className="space-y-6">
            {seite.zustand === 'laedt' ? (
              <>
                <PageHeader ort="Angebot" title="Angebot" />
                <LoadingState label="Das Angebot wird geladen …" />
              </>
            ) : seite.zustand === 'ungueltig' ? (
              <>
                <PageHeader ort="Angebot" title="Link nicht gültig" />
                <Card className="recht-blatt">
                  <p className="pt-6 text-base text-ink">
                    Dieser Link ist nicht (mehr) gültig. Er kann abgelaufen oder zurückgezogen sein, oder er wurde
                    nicht vollständig kopiert. Bitte wenden Sie sich an den Betrieb, der Ihnen das Angebot geschickt
                    hat.
                  </p>
                </Card>
              </>
            ) : seite.zustand === 'zu_viele' ? (
              <>
                <PageHeader ort="Angebot" title="Angebot" />
                <ErrorState message={seite.grund} onRetry={erneut} />
              </>
            ) : seite.zustand === 'fehler' ? (
              <>
                <PageHeader ort="Angebot" title="Angebot" />
                <ErrorState message={`Das Angebot ließ sich nicht laden. ${seite.grund}`} onRetry={erneut} />
              </>
            ) : (
              <AngebotMitAntwort seite={seite} schluessel={schluessel} onSeite={setSeite} />
            )}
            <RechtLinks className="recht-fuss" />
          </div>
        </main>
      </div>
    </SeitenHilfeProvider>
  );
}

function AngebotMitAntwort({
  seite,
  schluessel,
  onSeite,
}: {
  seite: MitStand;
  schluessel: string;
  onSeite: (s: Seite) => void;
}) {
  const { stand } = seite;
  const q = stand.angebot;
  const firma = stand.aussteller.name ?? '';
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const [pdfFehler, setPdfFehler] = useState<string | null>(null);

  async function pdf() {
    setPdfLaeuft(true);
    setPdfFehler(null);
    try {
      await downloadAngebotPdf({
        company: firmaAus(stand),
        quote: q,
        kunde: stand.kunde ? { name: stand.kunde.name ?? q.customerName, address: stand.kunde.address, vatId: stand.kunde.vatId } : null,
      });
    } catch {
      setPdfFehler('Das PDF konnte nicht erzeugt werden. Bitte erneut versuchen.');
    } finally {
      setPdfLaeuft(false);
    }
  }

  const anschrift = stand.kunde?.address?.trim() || q.address;
  const logo = istZeichenbar(stand.aussteller.logoUrl ?? undefined) ? stand.aussteller.logoUrl! : null;

  return (
    <>
      {/* Von wem das Angebot ist — der Briefkopf des Betriebs, wie auf dem PDF. */}
      <div className="recht-kopf">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-ink-deep">{firma}</p>
          {[stand.aussteller.addressLine, stand.aussteller.contactLine].filter(Boolean).map((z) => (
            <p key={z} className="text-sm text-ink-muted">{z}</p>
          ))}
        </div>
        {logo && <img src={logo} alt={`Logo ${firma}`} className="h-12 w-auto max-w-[8rem] shrink-0 object-contain" />}
      </div>

      <PageHeader
        ort={firma || 'Angebot'}
        title="Angebot"
        stempel={q.quoteNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{q.customerName}</span>
            {seite.zustand === 'angenommen' && <Zustand stand="erledigt">Angenommen</Zustand>}
            {seite.zustand === 'abgelehnt' && <Zustand stand="storniert">Abgelehnt</Zustand>}
          </span>
        }
        stand={
          <MetricRow>
            <Metric label="Brutto" value={euro(q.totalBrutto)} />
            <Metric label="Netto" value={euro(q.totalNetto)} />
            <Metric label="Angebot gültig bis" value={datumAT(q.validUntil)} />
          </MetricRow>
        }
        action={
          <Button variant="secondary" onClick={() => void pdf()} loading={pdfLaeuft}>
            Als PDF
          </Button>
        }
      />
      {pdfFehler && <ErrorState message={pdfFehler} />}

      {seite.zustand === 'offen' ? (
        <Antwort seite={seite} schluessel={schluessel} onSeite={onSeite} />
      ) : (
        <Entschieden seite={seite} />
      )}

      <Card title="Angaben" className="recht-blatt">
        <dl className="beleg-angaben grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Angabe wort="Für">
            {stand.kunde?.name || q.customerName}
            {anschrift && <span className="block text-ink-muted">{anschrift}</span>}
          </Angabe>
          {q.address?.trim() && q.address.trim() !== anschrift?.trim() && (
            <Angabe wort="Ort der Leistung">{q.address}</Angabe>
          )}
          {/* Datumswerte als Gemessenes in Plex Mono (V10), wie Beträge und Nummer im Kopf. */}
          <Angabe wort="Angebotsdatum"><span className="mono">{datumAT(q.quoteDate)}</span></Angabe>
          <Angabe wort="Gültig bis"><span className="mono">{datumAT(q.validUntil)}</span></Angabe>
        </dl>
      </Card>

      <Card title={`Positionen (${q.positions.filter((p) => (p.art ?? 'position') === 'position').length})`} className="recht-blatt">
        <PositionenTabelle q={q} />
      </Card>

      {q.notes?.trim() && (
        <Card title="Anmerkungen" className="recht-blatt">
          <p className="whitespace-pre-line text-sm text-ink">{q.notes}</p>
        </Card>
      )}

      <p className="text-xs text-ink-muted">
        Prüfsumme dieses Stands: <span className="break-all font-mono">{seite.pruefsumme}</span>
      </p>
    </>
  );
}

/** Annehmen oder ablehnen — eine Karte, zwei Wege. */
function Antwort({
  seite,
  schluessel,
  onSeite,
}: {
  seite: MitStand;
  schluessel: string;
  onSeite: (s: Seite) => void;
}) {
  const [art, setArt] = useState<'annehmen' | 'ablehnen'>('annehmen');
  const [name, setName] = useState('');
  const [bestaetigt, setBestaetigt] = useState(false);
  const [unterschrieben, setUnterschrieben] = useState(false);
  const [grund, setGrund] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const feld = useRef<SignaturePadHandle>(null);
  const firma = seite.stand.aussteller.name || 'der Betrieb';

  async function senden() {
    setFehler(null);
    let anfrage;
    if (art === 'annehmen') {
      const unterschrift = unterschrieben ? feld.current?.bildLesen() ?? null : null;
      const grundFehlt = annahmeFehler({ name, bestaetigt, unterschrift });
      if (grundFehlt) {
        setFehler(grundFehlt);
        return;
      }
      anfrage = { aktion: 'annehmen' as const, schluessel, name: name.trim(), bestaetigt, unterschrift: unterschrift! };
    } else {
      const grundFehlt = ablehnungFehler({ name, grund });
      if (grundFehlt) {
        setFehler(grundFehlt);
        return;
      }
      anfrage = { aktion: 'ablehnen' as const, schluessel, name: name.trim(), grund: grund.trim() };
    }
    setLaeuft(true);
    try {
      const a = await annahmeAnfrage(anfrage);
      if (a.zustand === 'fehler') setFehler(a.grund);
      else onSeite(a);
    } catch (e) {
      setFehler(`Das hat nicht geklappt — bitte erneut versuchen. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card
      title={art === 'annehmen' ? 'Angebot annehmen' : 'Angebot ablehnen'}
      className="recht-blatt"
      hint={
        <>
          Mit „Verbindlich annehmen“ nehmen Sie dieses Angebot von {firma} in dem Stand an, den diese Seite zeigt
          (Prüfsumme unten). Gespeichert werden Ihr Name, Ihre Unterschrift und der Zeitpunkt — bei {firma}, als
          Nachweis Ihrer Annahme bzw. Ablehnung. Vom Öffnen dieses Links werden nur Zeitpunkt und Anzahl
          festgehalten, keine IP-Adresse und kein Gerät. Der Link gilt bis {datumAT(seite.gueltigBis)}.
        </>
      }
    >
      <form
        className="formular space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void senden();
        }}
      >
        <InputField
          id="annahme-name"
          label="Ihr Name"
          pflicht
          required
          autoComplete="name"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {art === 'annehmen' ? (
          <>
            <CheckboxField
              id="annahme-bestaetigt"
              label="Ich nehme dieses Angebot verbindlich an."
              checked={bestaetigt}
              onChange={(e) => setBestaetigt(e.target.checked)}
            />
            <SignaturePad ref={feld} titel="Ihre Unterschrift" onChange={setUnterschrieben} />
          </>
        ) : (
          <TextareaField
            id="annahme-grund"
            label="Grund (freiwillig)"
            maxLength={GRUND_MAX}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
          />
        )}
        <p className="text-sm text-ink-muted">
          Gespeichert werden Name{art === 'annehmen' ? ', Unterschrift' : ', Grund'} und Zeitpunkt — keine IP-Adresse,
          kein Gerät.
        </p>
        {fehler && (
          <Hinweiszeile stufe="fehl" role="alert">
            <p>{fehler}</p>
          </Hinweiszeile>
        )}
        {/* Am Handy untereinander, die Hauptaktion oben und beide gleich breit (E72, R7). */}
        <div className="fuss-aktionen">
          {art === 'annehmen' ? (
            <>
              <Button type="button" variant="ghost" onClick={() => { setArt('ablehnen'); setFehler(null); }}>
                Ablehnen …
              </Button>
              <Button type="submit" loading={laeuft}>Verbindlich annehmen</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => { setArt('annehmen'); setFehler(null); }}>
                Zurück
              </Button>
              <Button type="submit" variant="danger" loading={laeuft}>Angebot ablehnen</Button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Schon entschieden — durch diese Anfrage oder eine frühere. */
function Entschieden({ seite }: { seite: MitStand }) {
  const am = seite.entschiedenAm ? zeitpunkt(Date.parse(seite.entschiedenAm)) : '';
  const angenommen = seite.zustand === 'angenommen';
  return (
    <Card title={angenommen ? 'Angenommen' : 'Abgelehnt'} className="recht-blatt">
      <div role="status" className="space-y-2 pt-1 text-base text-ink">
        {seite.neu ? (
          <p>
            {angenommen
              ? `Vielen Dank. Sie haben das Angebot am ${am} verbindlich angenommen${seite.name ? ` (${seite.name})` : ''}.`
              : `Sie haben das Angebot am ${am} abgelehnt${seite.name ? ` (${seite.name})` : ''}.`}
          </p>
        ) : (
          <p>
            {angenommen ? 'Bereits angenommen' : 'Bereits abgelehnt'} am {am}
            {seite.name ? ` von ${seite.name}` : ''}.
          </p>
        )}
        <p className="text-sm text-ink-muted">
          {angenommen
            ? 'Bitte bewahren Sie das Angebot als PDF auf. Der Betrieb hat Ihre Annahme erhalten.'
            : 'Der Betrieb hat Ihre Antwort erhalten.'}
        </p>
      </div>
    </Card>
  );
}

function Angabe({ wort, children }: { wort: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="section-label">{wort}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}
