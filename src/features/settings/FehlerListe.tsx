import { useMemo } from 'react';
import Card from '@/components/Card';
import { Marke, Warnung } from '@/components/Badge';
import { EmptyState } from '@/components/States';
import { fehlerGruppen, meldungen, type ProtokollZeile } from './fehlergruppen';

const zeit = (ms: number) =>
  new Date(ms).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/**
 * Meldungen und Fehler — dieselbe Darstellung im Betrieb und auf der Plattform.
 *
 * Zwei Karten, weil es zwei Fragen sind: „wer hat sich gemeldet" ist eine
 * Aufgabe mit einem Menschen dahinter, „was stürzt ab" eine Liste für die
 * Entwicklung. Gemischt ginge die Meldung eines Monteurs zwischen vierzig
 * gleichen Abstürzen unter.
 */
export default function FehlerListe({ zeilen }: { zeilen: ProtokollZeile[] }) {
  const gemeldet = useMemo(() => meldungen(zeilen), [zeilen]);
  const gruppen = useMemo(() => fehlerGruppen(zeilen), [zeilen]);

  return (
    <>
      <Card title={`Gemeldete Probleme (${gemeldet.length})`}>
        {gemeldet.length === 0 ? (
          <EmptyState>Niemand hat ein Problem gemeldet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {gemeldet.map((m) => (
              <li key={m.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-ink-muted">
                  {m.createdAt ? zeit(m.createdAt) : ''}
                  {m.betrieb && ` · ${m.betrieb}`}
                  {m.wer && ` · ${m.wer}`}
                  {m.pfad && ` · ${m.pfad}`}
                </p>
                <p className="whitespace-pre-wrap break-words text-ink">{m.beschreibung}</p>
                {m.nachricht && (
                  <p className="break-words text-xs text-ink-muted">
                    Kurz davor: <span className="font-mono">{m.nachricht}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Technische Fehler (${gruppen.length})`}>
        {gruppen.length === 0 ? (
          <EmptyState>Keine Abstürze und keine unbehandelten Fehler.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {gruppen.map((g) => (
              <li key={g.schluessel} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  {g.art === 'absturz' ? <Warnung>Absturz</Warnung> : <Marke>Fehler</Marke>}
                  <span className="text-sm text-ink-muted">
                    {g.anzahl}× · zuletzt {zeit(g.zuletzt)}
                    {g.betroffen > 1 && ` · ${g.betroffen} betroffen`}
                  </span>
                </div>
                <p className="break-words font-mono text-sm text-ink">{g.nachricht}</p>
                <p className="break-words text-xs text-ink-muted">
                  {g.ansichten.join(', ')}
                  {g.fassungen.length > 0 && ` · Fassung ${g.fassungen.join(', ')}`}
                </p>
                <details className="text-xs text-ink-muted">
                  <summary className="cursor-pointer">Technische Details</summary>
                  <p className="mt-2 break-words">
                    Erstmals {zeit(g.zuerst)}
                    {g.beispiel.betrieb && ` · ${g.beispiel.betrieb}`}
                    {g.beispiel.wer && ` · zuletzt bei ${g.beispiel.wer}`}
                  </p>
                  {g.beispiel.geraet && <p className="mt-1 break-words">{g.beispiel.geraet}</p>}
                  {g.beispiel.stapel && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                      {g.beispiel.stapel}
                    </pre>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
