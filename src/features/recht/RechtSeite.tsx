import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ProduktMarke from '@/components/ProduktMarke';
import { GEPRUEFT, STAND } from './betreiber';

/**
 * Der Rahmen für Impressum und Datenschutz.
 *
 * AUSSERHALB DER ANMELDUNG UND OHNE LAYOUT: beide Seiten müssen auch lesen
 * können, wer (noch) kein Konto hat — und wer angemeldet ist, kommt über
 * „Zur App" zurück.
 */
export default function RechtSeite({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-bg">
      <div className="panel-dark px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <ProduktMarke hoehe={28} className="text-white" />
          <Link to="/" className="min-h-touch py-2 text-sm font-medium text-white underline underline-offset-2">
            Zur App
          </Link>
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {!GEPRUEFT && (
          <p role="note" className="rounded-sm border border-warning bg-surface px-3 py-2 text-sm text-ink">
            <strong>Entwurf.</strong> Dieser Text ist noch nicht rechtlich geprüft; Angaben in
            eckigen Klammern werden ergänzt.
          </p>
        )}
        <h1 className="text-2xl font-bold text-ink">{titel}</h1>
        <div className="recht space-y-6 text-base leading-relaxed text-ink">{children}</div>
        <p className="text-sm text-ink-muted">Stand: {STAND}</p>
      </main>
    </div>
  );
}

/** Ein Abschnitt mit Überschrift — die Seiten bestehen nur daraus. */
export function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-ink">{titel}</h2>
      {children}
    </section>
  );
}
