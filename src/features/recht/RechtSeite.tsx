import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ProduktMarke from '@/components/ProduktMarke';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Hinweiszeile from '@/components/Hinweiszeile';
import RechtLinks from '@/components/RechtLinks';
import { taktHalten } from '@/lib/takt';
import { GEPRUEFT, STAND } from './betreiber';

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
 * wie auf jeder Seite. Vorher standen die Seiten unter einem dunklen Band in
 * der Form vor der Linie, mit einem gerundeten Kasten für „Entwurf“.
 * Die Marke steht hell auf dem Raster wie auf der Bühne der Anmeldung: ohne
 * Seitenleiste fehlt die dunkle Fläche, die sie in der App trägt.
 */
export default function RechtSeite({ titel, children }: { titel: string; children: ReactNode }) {
  const flaeche = useRef<HTMLDivElement>(null);
  useEffect(() => (flaeche.current ? taktHalten(flaeche.current) : undefined), []);
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
          <PageHeader ort="Rechtliches" title={titel} subtitle={`Stand: ${STAND}`} />
          {!GEPRUEFT && (
            <div role="note">
              <Hinweiszeile stufe="warn">
                <strong>Entwurf.</strong> Dieser Text ist noch nicht rechtlich geprüft; Angaben in
                eckigen Klammern werden ergänzt.
              </Hinweiszeile>
            </div>
          )}
          <Card className="recht-blatt">
            {/* Ohne Kartenkopf bringt das Blatt oben kein Polster mit: eine Zelle, wie an den Seiten. */}
            <div className="recht space-y-6 pt-6 text-base leading-relaxed text-ink">{children}</div>
          </Card>
          <RechtLinks className="recht-fuss" />
        </div>
      </main>
    </div>
  );
}

/** Ein Abschnitt mit Überschrift — die Seiten bestehen nur daraus. */
export function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="titel-karte">{titel}</h2>
      {children}
    </section>
  );
}
