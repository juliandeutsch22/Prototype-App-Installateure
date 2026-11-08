import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBeteiligungenDesKunden, listLiegenschaftenByIds, listTops } from '@/lib/db/liegenschaften';
import type { Liegenschaft, LiegenschaftBeteiligter } from '@/types';
import Card from '@/components/Card';
import { EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { datumAT } from '@/lib/datum';
import { ROLLE_TEXT, zeitraumText } from './liegenschaftText';

/** So viele Beteiligungen zeigt die Kundenakte — die jüngsten. */
export const BETEILIGUNGEN_HOECHSTENS = 50;

interface Zeile {
  b: LiegenschaftBeteiligter;
  liegenschaft: Liegenschaft | undefined;
  top: string | undefined;
}

/**
 * „LIEGENSCHAFTEN“ IN DER KUNDENAKTE (M02c): woran der Kunde beteiligt ist,
 * mit Rolle — die Hausverwaltung sieht so ihre Häuser, der Eigentümer seine
 * Wohnung. Nur, wenn die Unterfähigkeit an ist; das entscheidet die Akte.
 */
export default function KundenLiegenschaften({ companyId, customerId }: { companyId: string; customerId: string }) {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let weg = false;
    setZeilen(null);
    setFehler(false);
    void (async () => {
      try {
        const b = await listBeteiligungenDesKunden(companyId, customerId, BETEILIGUNGEN_HOECHSTENS);
        const ids = [...new Set(b.map((x) => x.liegenschaftId))];
        const liegenschaften = await listLiegenschaftenByIds(companyId, ids);
        // Die Tops nur dort, wo eine Beteiligung an einem Top hängt — je Liegenschaft einmal.
        const mitTop = [...new Set(b.filter((x) => x.topId).map((x) => x.liegenschaftId))];
        const tops = (await Promise.all(mitTop.map((l) => listTops(companyId, l)))).flat();
        if (weg) return;
        setZeilen(b.map((x) => ({
          b: x,
          liegenschaft: liegenschaften.find((l) => l.id === x.liegenschaftId),
          top: x.topId ? tops.find((t) => t.id === x.topId)?.bezeichnung : undefined,
        })));
      } catch {
        if (!weg) setFehler(true);
      }
    })();
    return () => { weg = true; };
  }, [companyId, customerId, versuch]);

  return (
    <Card id="k-liegenschaften" title="Liegenschaften">
      {fehler ? <TeilFehler was="die Liegenschaften" onRetry={() => setVersuch((v) => v + 1)} />
        : zeilen === null ? <SkeletonList rows={1} />
          : zeilen.length === 0 ? <EmptyState>An keiner Liegenschaft beteiligt.</EmptyState>
            : (
              <>
                <ul className="divide-y divide-line">
                  {zeilen.map(({ b, liegenschaft, top }) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                      <Link to={`/liegenschaften/${b.liegenschaftId}`} className="link inline-flex min-h-touch min-w-0 items-center text-sm">
                        <span className="truncate">{[liegenschaft?.bezeichnung ?? 'Liegenschaft', top].filter(Boolean).join(' · ')}</span>
                      </Link>
                      <span className="text-sm text-ink-muted">
                        {[ROLLE_TEXT[b.rolle], zeitraumText(b, datumAT)].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
                {zeilen.length >= BETEILIGUNGEN_HOECHSTENS && (
                  <p className="mt-2 text-sm text-ink-muted">Die jüngsten {BETEILIGUNGEN_HOECHSTENS} Beteiligungen.</p>
                )}
              </>
            )}
    </Card>
  );
}
