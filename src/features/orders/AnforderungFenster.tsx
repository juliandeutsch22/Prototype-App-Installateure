import type { WithId } from '@/lib/db/core';
import type { MaterialOrder } from '@/types';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import StatusBadge from '@/components/StatusBadge';
import { Warnung } from '@/components/Badge';
import { fmtMenge } from '@/lib/belegLayout';
import { eiligMoeglich } from './eilig';

/**
 * EINE ANFORDERUNG IM SEITENFENSTER (C7, E89): die Zeile unter „Meine
 * Anforderungen“ trägt nur noch Stand und „Abgeholt“ — „Eilig“ stand dort
 * als dritter Knopf in einer Reihe und machte jede Zeile am Handy zweizeilig.
 * Hier steht alles zur Anforderung, dazu „Als eilig markieren“, solange das
 * geht (`eiligMoeglich`, dieselbe Bedingung wie in der Datenbank).
 */
export default function AnforderungFenster({
  o,
  wasLaeuft,
  onEilig,
  onAbgeholt,
  onClose,
}: {
  o: WithId<MaterialOrder>;
  /** Warum es dauert (beim Großhändler bestellt …) — dieselbe Zeile wie in der Liste. */
  wasLaeuft: string;
  onEilig: () => void;
  onAbgeholt: () => void;
  onClose: () => void;
}) {
  const angaben: [string, string][] = [
    ['Menge', fmtMenge(o.quantity)],
    ['Baustelle', o.projectNumber || 'ohne Baustelle'],
    ...(o.note ? [['Notiz', o.note] as [string, string]] : []),
    ...(wasLaeuft ? [['Beschaffung', wasLaeuft] as [string, string]] : []),
  ];
  return (
    <BottomSheet open onClose={onClose} label={`Anforderung ${o.materialName}`} titel={o.materialName} auchBreit>
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
        </p>
        <dl className="divide-y divide-line">
          {angaben.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="fuss-aktionen">
          {!o.isUrgent && eiligMoeglich(o) && (
            <Button variant="ghost" onClick={onEilig}>Als eilig markieren</Button>
          )}
          <Button onClick={onAbgeholt}>Abgeholt</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
