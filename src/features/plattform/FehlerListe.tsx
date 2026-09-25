import { useMemo } from 'react';
import Card from '@/components/Card';
import { Marke, Warnung } from '@/components/Badge';
import { EmptyState } from '@/components/States';
import { List, ListRow } from '@/components/ListRow';
import { fehlerGruppen, meldungen, type ProtokollZeile } from './fehlergruppen';

const zeit = (ms: number) =>
  new Date(ms).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/**
 * Meldungen und Fehler aus den Betrieben, für den Senklot-Support.
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
      <Card title="Gemeldete Probleme" anzahl={gemeldet.length}>
        {gemeldet.length === 0 ? (
          <EmptyState>Niemand hat ein Problem gemeldet.</EmptyState>
        ) : (
          <List>
            {gemeldet.map((m) => (
              <ListRow
                key={m.id}
                title={<span className="whitespace-pre-wrap break-words">{m.beschreibung}</span>}
                subtitle={
                  <>
                    {m.createdAt ? zeit(m.createdAt) : ''}
                    {m.betrieb && ` · ${m.betrieb}`}
                    {m.wer && ` · ${m.wer}`}
                    {m.pfad && ` · ${m.pfad}`}
                    {m.nachricht && (
                      <span className="mt-1 block break-words text-xs">
                        Kurz davor: <span className="font-mono">{m.nachricht}</span>
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </List>
        )}
      </Card>

      <Card title="Technische Fehler" anzahl={gruppen.length}>
        {gruppen.length === 0 ? (
          <EmptyState>Keine Abstürze und keine unbehandelten Fehler.</EmptyState>
        ) : (
          <List>
            {gruppen.map((g) => (
              <ListRow
                key={g.schluessel}
                title={<span className="break-words font-mono text-sm">{g.nachricht}</span>}
                zustand={g.art === 'absturz' ? <Warnung>Absturz</Warnung> : <Marke>Fehler</Marke>}
                subtitle={
                  <>
                    {g.anzahl}× · zuletzt {zeit(g.zuletzt)}
                    {g.betroffen > 1 && ` · ${g.betroffen} betroffen`}
                    <span className="mt-1 block break-words text-xs">
                      {g.ansichten.join(', ')}
                      {g.fassungen.length > 0 && ` · Fassung ${g.fassungen.join(', ')}`}
                    </span>
                  </>
                }
                unten={
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
                }
              />
            ))}
          </List>
        )}
      </Card>
    </>
  );
}
