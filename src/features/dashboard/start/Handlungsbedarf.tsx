import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/Icon';
import { summe, type Abschnitt, type Ton, type Zeile } from './abschnitte';

const TON: Record<Ton, string> = {
  fehl: 'stand-fehl',
  warn: 'stand-warn',
  leise: 'stand-leise',
  ok: 'stand-ok',
  info: 'stand-info',
};

/**
 * Eine Zeile: Titel, ein Detail, Status (Punkt + grauer Text, Rot nur für
 * Überfälliges). In schmalen Karten steht der Status vorn in der
 * Detailzeile, am Schreibtisch rechts — so wird der Titel nie abgeschnitten.
 */
function EintragZeile({ z }: { z: Zeile }) {
  const status = z.status && <span className={`stand ${TON[z.status.ton]}`}>{z.status.text}</span>;
  const inhalt = (
    <>
      <span className="min-w-0 flex-1">
        <span className="kein-trennen block font-medium text-ink-deep">{z.titel}</span>
        {(z.detail || z.status) && (
          <span className="kein-trennen mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-ink-muted">
            {/* Am Telefon steht der Status vorn in der Detailzeile. */}
            {status && <span className="start-status-vorn">{status}</span>}
            {status && z.detail && <span className="start-status-vorn" aria-hidden="true">·</span>}
            {z.detail && <span>{z.detail}</span>}
          </span>
        )}
      </span>
      {status && <span className="start-status-rechts shrink-0">{status}</span>}
      {z.to && <Icon name="weiter" size={16} className="zeile-pfeil shrink-0" />}
    </>
  );
  return (
    <li className="border-t border-line first:border-t-0">
      {z.to ? (
        <Link to={z.to} className="flex min-h-touch items-center gap-3 px-4 py-2.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
          {inhalt}
        </Link>
      ) : (
        <div className="flex min-h-touch items-center gap-3 px-4 py-2.5">{inhalt}</div>
      )}
    </li>
  );
}

function AbschnittBlock({ a }: { a: Abschnitt }) {
  const [offen, setOffen] = useState(false);
  const zeilen = offen && a.weiter && 'aufklappen' in a.weiter ? [...a.zeilen, ...a.weiter.aufklappen] : a.zeilen;
  const rest = a.anzahl - a.zeilen.length;
  return (
    <section aria-label={a.titel} className="border-t border-line first:border-t-0">
      <h3 className="start-abschnitt">
        {a.titel} <span className="font-normal text-ink-muted">· {a.anzahl}</span>
      </h3>
      <ul>
        {zeilen.map((z) => <EintragZeile key={z.key} z={z} />)}
      </ul>
      {a.weiter && 'to' in a.weiter && (
        <Link to={a.weiter.to} className="start-weiter">
          und {rest} weitere →
        </Link>
      )}
      {a.weiter && 'aufklappen' in a.weiter && (
        <button type="button" className="start-weiter w-full text-left" aria-expanded={offen} onClick={() => setOffen((o) => !o)}>
          {offen ? 'weniger anzeigen' : `und ${rest} weitere →`}
        </button>
      )}
    </section>
  );
}

/**
 * HANDLUNGSBEDARF: EINE Karte, je Thema ein Abschnitt (Designlinie: keine
 * Karte in der Karte). Höchstens drei Zeilen je Abschnitt; leere fallen weg.
 */
export default function Handlungsbedarf({
  abschnitte,
  zaehlwort,
}: {
  abschnitte: Abschnitt[];
  /** „Themen“ bei der Geschäftsführung; sonst steht nur die Zahl der Einträge. */
  zaehlwort?: string;
}) {
  if (abschnitte.length === 0) return null;
  const zahl = summe(abschnitte);
  return (
    <section className="panel karte" aria-labelledby="handlungsbedarf-titel">
      <header className="karte-kopf">
        <h2 id="handlungsbedarf-titel" className="titel-karte">
          Handlungsbedarf <span className="font-normal text-ink-muted">· {zahl}{zaehlwort ? ` ${zaehlwort}` : ''}</span>
        </h2>
      </header>
      <div className="karte-buendig border-t border-line">
        {abschnitte.map((a) => <AbschnittBlock key={a.key} a={a} />)}
      </div>
    </section>
  );
}

export { EintragZeile, AbschnittBlock };
