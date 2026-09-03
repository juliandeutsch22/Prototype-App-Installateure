import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { ladenUmschalten } from '@/lib/db/einsatzMaterial';
import type { EinsatzMaterial, RuestPosition } from '@/types';

/**
 * Die Rüstliste aus der Sicht des Monteurs: was mitkommt, und was schon im
 * Bus ist.
 *
 * DER HAKEN GILT FÜR DIE MANNSCHAFT, nicht für die Person. Die Kiste steht
 * einmal im Bus — wenn Max sie eingeladen hat, soll Tom sie nicht ein
 * zweites Mal suchen. Deshalb steht der Name daneben und deshalb liegt die
 * Liste an Tag und Baustelle, nicht am einzelnen Einsatz.
 *
 * WARUM DER HAKEN SOFORT UMSPRINGT und erst danach geschrieben wird: auf der
 * Baustelle ist das Netz schlecht. Ein Kästchen, das eine Sekunde lang nicht
 * reagiert, wird ein zweites Mal angetippt — und beim Beladen eines Busses
 * schaut niemand auf einen Ladebalken. Schlägt das Schreiben fehl, springt
 * er zurück UND es steht dabei; ein stiller Rücksprung sähe aus wie ein
 * Fehlgriff des eigenen Fingers.
 */

interface Props {
  date: string;
  projectNumber: string;
  positionen: RuestPosition[];
  geladen: NonNullable<EinsatzMaterial['geladen']>;
  /** Darf hier abgehakt werden? Sonst nur anzeigen. */
  abhakbar?: boolean;
}

export default function RuestlisteAbhaken({
  date,
  projectNumber,
  positionen,
  geladen,
  abhakbar = true,
}: Props) {
  const { user } = useAuth();
  const [oertlich, setOertlich] = useState<NonNullable<EinsatzMaterial['geladen']>>(geladen);
  const [fehler, setFehler] = useState<string | null>(null);

  if (positionen.length === 0) return null;

  const offen = positionen.filter((p) => !oertlich[p.id]).length;

  async function umschalten(p: RuestPosition) {
    if (!user || !abhakbar) return;
    const an = !oertlich[p.id];
    const vorher = oertlich;
    setOertlich((c) => {
      const next = { ...c };
      if (an) next[p.id] = { von: user.name, am: Date.now() };
      else delete next[p.id];
      return next;
    });
    setFehler(null);
    try {
      await ladenUmschalten(user.companyId, date, projectNumber, p.id, an, user.name);
    } catch {
      setOertlich(vorher);
      setFehler('Das konnte nicht gespeichert werden. Bitte noch einmal antippen.');
    }
  }

  return (
    <div className="mt-3 rounded-sm border border-line">
      <p className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <span className="font-semibold text-ink">Material</span>
        <span className="text-sm text-ink-muted">
          {offen === 0 ? 'alles eingeladen' : `noch ${offen} von ${positionen.length}`}
        </span>
      </p>
      <ul className="divide-y divide-line">
        {positionen.map((p) => {
          const eintrag = oertlich[p.id];
          const id = `rl-${projectNumber}-${p.id}`;
          return (
            <li key={p.id} className={eintrag ? 'bg-surface-2' : ''}>
              <label
                htmlFor={id}
                className={`flex min-h-touch items-center gap-3 px-3 py-2 ${
                  abhakbar ? 'cursor-pointer' : ''
                }`}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={!!eintrag}
                  disabled={!abhakbar}
                  onChange={() => void umschalten(p)}
                  className="h-5 w-5 shrink-0 rounded border-line text-brand focus:ring-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block ${eintrag ? 'text-ink-muted line-through' : 'text-ink'}`}>
                    <span className="tnum font-semibold">{p.menge}</span>
                    {p.einheit ? ` ${p.einheit}` : ''} {p.name}
                  </span>
                  {/* Der Name verhindert die doppelte Suche im Lager. */}
                  {eintrag && (
                    <span className="block text-xs text-ink-muted">
                      eingeladen von {eintrag.von}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {fehler && (
        <p role="alert" className="border-t border-line px-3 py-2 text-sm text-danger">
          {fehler}
        </p>
      )}
    </div>
  );
}
