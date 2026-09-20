import { useEffect, useState } from 'react';
import { getCompany } from '@/lib/db/company';
import { listUsers } from '@/lib/db/users';
import { listRecentProjects } from '@/lib/db/projects';
import { listInvoicesInRange } from '@/lib/db/invoices';
import { zugriffMelden, type OffeneFreigabe } from '@/lib/db/support';
import type { AppUser, Company, Invoice, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke, Warnung } from '@/components/Badge';
import { ErrorState, SkeletonList } from '@/components/States';

/**
 * Was der Support beim freigegebenen Betrieb sieht.
 *
 * NUR LISTEN, KEINE KNÖPFE. Es gibt hier nichts zu ändern — nicht, weil es
 * jemand vergessen hätte, sondern weil ein Supportzugang nirgends schreibt.
 * Ein Knopf, der zuverlässig eine Fehlermeldung erzeugt, wäre schlimmer als
 * keiner.
 *
 * WAS FEHLT, FEHLT MIT ABSICHT: Zeitbuchungen, Urlaube und Scheinfotos. Dort
 * stehen Kranken- und Urlaubstage von Mitarbeitern und Aufnahmen aus
 * Kundenwohnungen. Die Grenze steht in der Datenbank und nicht in dieser
 * Datei; hier steht sie nur noch einmal in Worten, damit niemand sie für ein
 * Versehen hält.
 *
 * JEDER GEÖFFNETE BEREICH WIRD GEMELDET, und zwar bevor er gezeigt wird.
 * Scheitert die Meldung, wird nichts geladen: ein Einblick, der nicht im
 * Protokoll steht, ist genau das, wovon dieser ganze Bau wegführen soll.
 */

type Bereich = 'stammdaten' | 'benutzer' | 'baustellen' | 'rechnungen';

const BEREICHE: Array<[Bereich, string]> = [
  ['stammdaten', 'Betrieb'],
  ['benutzer', 'Benutzer'],
  ['baustellen', 'Baustellen'],
  ['rechnungen', 'Rechnungen'],
];

const eur = (n?: number) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

export default function SupportEinblick({
  freigabe,
  onZurueck,
}: {
  freigabe: OffeneFreigabe;
  onZurueck: () => void;
}) {
  const [bereich, setBereich] = useState<Bereich>('stammdaten');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);

  const [betrieb, setBetrieb] = useState<Company | null>(null);
  const [benutzer, setBenutzer] = useState<AppUser[]>([]);
  const [baustellen, setBaustellen] = useState<WithId<Project>[]>([]);
  const [rechnungen, setRechnungen] = useState<WithId<Invoice>[]>([]);

  useEffect(() => {
    let wach = true;
    setLaedt(true);
    setFehler(null);

    (async () => {
      // Erst melden, dann laden. Siehe oben.
      await zugriffMelden(
        freigabe.company_id,
        freigabe.id,
        BEREICHE.find(([b]) => b === bereich)?.[1] ?? bereich,
      );
      if (!wach) return;

      if (bereich === 'stammdaten') setBetrieb(await getCompany(freigabe.company_id));
      if (bereich === 'benutzer') setBenutzer(await listUsers(freigabe.company_id));
      if (bereich === 'baustellen') setBaustellen(await listRecentProjects(freigabe.company_id, 50));
      if (bereich === 'rechnungen') {
        const heute = new Date();
        const von = new Date(heute.getFullYear() - 2, 0, 1).toISOString().slice(0, 10);
        setRechnungen(
          await listInvoicesInRange(freigabe.company_id, von, heute.toISOString().slice(0, 10)),
        );
      }
    })()
      .catch((e: Error) => wach && setFehler(e.message))
      .finally(() => wach && setLaedt(false));

    return () => {
      wach = false;
    };
  }, [bereich, freigabe]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{freigabe.name}</h1>
          <p className="text-sm text-ink-muted">
            {freigabe.notzugang ? 'Notzugang — ' : ''}
            {freigabe.grund}
          </p>
        </div>
        <Button variant="ghost" onClick={onZurueck}>
          Zurück zur Übersicht
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {BEREICHE.map(([b, label]) => (
          <button
            key={b}
            role="tab"
            aria-selected={bereich === b}
            onClick={() => setBereich(b)}
            className={`flex min-h-touch shrink-0 items-center border-b-2 px-4 py-2 text-sm transition ${
              bereich === b
                ? 'border-b-accent-deep font-bold text-accent-deep'
                : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {fehler && <ErrorState message={fehler} />}

      {laedt ? (
        <SkeletonList rows={4} />
      ) : bereich === 'stammdaten' ? (
        <Card title="Betrieb">
          {betrieb ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-muted">Kennung</dt><dd>{freigabe.company_id}</dd></div>
              <div><dt className="text-ink-muted">Name</dt><dd>{betrieb.name}</dd></div>
              <div>
                <dt className="text-ink-muted">Rechnungsarten</dt>
                <dd>{betrieb.rechnungsarten ? 'eingeschaltet' : 'aus'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Urlaubsjahr beginnt</dt>
                <dd>{betrieb.urlaubJahresbeginn ?? '01-01'}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">Nicht lesbar.</p>
          )}
        </Card>
      ) : bereich === 'benutzer' ? (
        <Card title={`Benutzer (${benutzer.length})`}>
          <ul className="space-y-2 text-sm">
            {benutzer.map((b) => (
              <li key={b.uid} className="flex flex-wrap items-baseline gap-x-2">
                {b.active === false ? <Warnung>gesperrt</Warnung> : <Marke>{b.role}</Marke>}
                <span className="font-medium">{b.name}</span>
                <span className="text-ink-muted">{b.email}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : bereich === 'baustellen' ? (
        <Card title={`Baustellen (${baustellen.length})`}>
          <ul className="space-y-2 text-sm">
            {baustellen.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{p.projectNumber}</span>
                <span>{p.customerName}</span>
                <span className="text-ink-muted">{p.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card
          title={`Rechnungen (${rechnungen.length})`}
          hint="Die letzten zwei Jahre. Zeitbuchungen, Urlaube und Fotos sind nicht einsehbar — dort stehen Kranken- und Urlaubstage von Mitarbeitern und Aufnahmen aus Kundenwohnungen."
        >
          <ul className="space-y-2 text-sm">
            {rechnungen.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.invoiceNumber}</span>
                <span>{r.customerName}</span>
                <span className="tnum">{eur(r.totalBrutto)}</span>
                <span className="text-ink-muted">{r.paymentStatus}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
