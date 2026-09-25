import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Card from '@/components/Card';
import MarkenRahmen from '@/features/auth/MarkenRahmen';
import Meldung from '@/components/Meldung';
import PageHeader from '@/components/PageHeader';
import { GEPRUEFT, STAND } from './betreiber';

/**
 * Der Rahmen für Impressum und Datenschutz.
 *
 * AUSSERHALB DER ANMELDUNG UND OHNE LAYOUT: beide Seiten müssen auch lesen
 * können, wer (noch) kein Konto hat — und wer angemeldet ist, kommt über
 * „Zur App" zurück.
 */
export default function RechtSeite({ titel, children }: { titel: string; children: ReactNode }) {
  /*
    NACH DER LINIE: die Marke im Rahmen wie in der Seitenleiste
    (`MarkenRahmen`), der Titel als Seitenkopf, der Text in einer weißen
    Karte statt frei auf dem Grund, „Stand“ im Kartenfuß. Am Text selbst
    ändert sich nichts.
  */
  return (
    <MarkenRahmen
      aktion={
        <Link to="/" className="marken-leiste-link">
          Zur App
        </Link>
      }
    >
      <main className="marken-spalte">
        <PageHeader title={titel} />
        {!GEPRUEFT && (
          // `note`: ein stehender Vermerk zum Text, weder Alarm noch Status.
          <Meldung ton="warnung" role="note">
            <strong>Entwurf.</strong> Dieser Text ist noch nicht rechtlich geprüft; Angaben in
            eckigen Klammern werden ergänzt.
          </Meldung>
        )}
        <Card footer={<p className="text-sm text-ink-muted">Stand: {STAND}</p>}>
          <div className="recht space-y-6 text-base leading-relaxed text-ink">{children}</div>
        </Card>
      </main>
    </MarkenRahmen>
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
