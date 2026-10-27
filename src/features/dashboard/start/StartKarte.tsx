import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Eine Karte der Startseite: Titel mit grauer Zahl („Heute · 2 Einsätze“),
 * rechts ein Verweis („Mein Einsatzplan ›“), darunter bündige Zeilen.
 */
export default function StartKarte({
  titel,
  zusatz,
  verweis,
  verweisUnten = false,
  children,
}: {
  titel: string;
  zusatz?: string;
  verweis?: { to: string; text: string };
  verweisUnten?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="panel karte start-karte" aria-labelledby={id}>
      <header className="karte-kopf start-karte-kopf">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id={id} className="titel-karte">
            {titel}
            {zusatz && <span className="start-karte-zusatz font-normal text-ink-muted"> · {zusatz}</span>}
          </h2>
          {verweis && !verweisUnten && (
            <Link to={verweis.to} className="link-weiter inline-flex min-h-touch items-center text-sm">
              {verweis.text}
            </Link>
          )}
        </div>
      </header>
      <div className="karte-buendig start-karte-inhalt">{children}</div>
      {/*
        Der Pfeil kommt aus `link-weiter` (::after). Ein eigenes „›“ dazu ergab
        „Einsatzplanung › ›“ (Testbericht Runde 6, G9).
      */}
      {verweis && verweisUnten && (
        <Link to={verweis.to} className="start-karte-verweis link-weiter">{verweis.text}</Link>
      )}
    </section>
  );
}
