import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ProduktMarke from '@/components/ProduktMarke';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Hinweiszeile from '@/components/Hinweiszeile';
import RechtLinks from '@/components/RechtLinks';
import { ErrorState, LoadingState } from '@/components/States';
import { taktHalten } from '@/lib/takt';
import { datumAusMs } from '@/lib/datum';
import { rechtstexteAktuell } from '@/lib/db/rechtstexte';
import RechtInhalt from './RechtInhalt';
import { LEERER_BETREIBER, offeneAngaben, standVon, type GeltendeTexte } from './rechtstext';

/**
 * Der Rahmen für Impressum und Datenschutz.
 *
 * AUSSERHALB DER ANMELDUNG UND OHNE LAYOUT: beide Seiten müssen auch lesen
 * können, wer (noch) kein Konto hat — und wer angemeldet ist, kommt über
 * „Zur App" zurück.
 *
 * IN DER LINIE „LOT“ (04.11.2026, E44): dieselbe Arbeitsfläche wie in der
 * App — das Raster als Zeichentisch, der Text als Blatt darauf, jede Kante
 * auf einer Rasterlinie (derselbe Taktgeber wie im `Layout`), der Seitenkopf
 * wie auf jeder Seite. Die Marke steht hell auf dem Raster wie auf der Bühne
 * der Anmeldung: ohne Seitenleiste fehlt die dunkle Fläche, die sie in der
 * App trägt.
 *
 * DER TEXT KOMMT AUS DER DATENBANK (04.11.2026, E45): der Betreiber pflegt
 * ihn in der Plattform, die Seite zeigt die geltende Fassung. „Stand“ ist
 * der Tag, an dem sie — oder die Betreiberangaben, die sie einsetzt —
 * veröffentlicht wurde. Das Band „Entwurf“ steht, solange die Fassung nicht
 * rechtlich geprüft ist ODER noch eine Angabe offen ist.
 *
 * KEIN TEXT IM QUELLTEXT ALS RÜCKFALL. Ist die Datenbank nicht erreichbar,
 * sagt die Seite das und bietet „Erneut versuchen“ — ein mitgelieferter
 * Text wäre irgendwann ein veralteter Rechtstext, und der ist schlimmer als
 * eine ehrliche Fehlermeldung.
 */
export default function RechtSeite({ titel, art }: { titel: string; art: 'impressum' | 'datenschutz' }) {
  const flaeche = useRef<HTMLDivElement>(null);
  useEffect(() => (flaeche.current ? taktHalten(flaeche.current) : undefined), []);

  const [texte, setTexte] = useState<GeltendeTexte | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(async () => {
    setFehler(null);
    try {
      setTexte((await rechtstexteAktuell()) ?? {});
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);

  const fassung = texte?.[art];
  const betreiber = texte?.betreiber?.inhalt ?? LEERER_BETREIBER;
  const offen = fassung ? offeneAngaben(fassung.inhalt, betreiber) : [];
  const entwurf = !!fassung && (!fassung.geprueft || offen.length > 0);

  return (
    <div ref={flaeche} className="hauptflaeche recht-flaeche">
      {/* Der Stapel trägt die Abstände wie `space-y-6` auf jeder Seite der App. */}
      <main className="inhalt recht-inhalt">
        <div className="space-y-6">
          <div className="recht-kopf">
            <ProduktMarke hoehe={28} className="text-accent-deep" />
            <Link to="/" className="recht-zur-app">
              Zur App
            </Link>
          </div>
          <PageHeader
            ort="Rechtliches"
            title={titel}
            subtitle={fassung ? `Stand: ${datumAusMs(Date.parse(standVon(fassung, texte?.betreiber)))}` : undefined}
          />
          {entwurf && (
            <div role="note">
              <Hinweiszeile stufe="warn">
                <strong>Entwurf.</strong>{' '}
                {fassung.geprueft
                  ? 'Angaben in eckigen Klammern werden ergänzt.'
                  : 'Dieser Text ist noch nicht rechtlich geprüft; Angaben in eckigen Klammern werden ergänzt.'}
              </Hinweiszeile>
            </div>
          )}
          {fehler ? (
            <ErrorState message={`Der Text ließ sich nicht laden: ${fehler}`} onRetry={() => void laden()} />
          ) : !texte ? (
            <LoadingState />
          ) : !fassung ? (
            <ErrorState message="Zu dieser Seite ist noch keine Fassung veröffentlicht." onRetry={() => void laden()} />
          ) : (
            <Card className="recht-blatt">
              {/* Ohne Kartenkopf bringt das Blatt oben kein Polster mit: eine Zelle, wie an den Seiten. */}
              <div className="recht space-y-6 pt-6 text-base leading-relaxed text-ink">
                <RechtInhalt inhalt={fassung.inhalt} betreiber={betreiber} />
              </div>
            </Card>
          )}
          <RechtLinks className="recht-fuss" />
        </div>
      </main>
    </div>
  );
}
