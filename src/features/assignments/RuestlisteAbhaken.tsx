import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { ladenUmschalten } from '@/lib/db/einsatzMaterial';
import type { EinsatzMaterial, RuestPosition } from '@/types';
import { grundAus } from '@/lib/fehlerGrund';
import { localDateStr, todayStr } from '@/lib/time';

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
  /**
   * Höchstens so viele Zeilen, der Rest hinter „und N weitere“ (Startseite,
   * Nachtest 01.10.2026). Ohne Angabe alle.
   */
  max?: number;
}

export default function RuestlisteAbhaken({
  date,
  projectNumber,
  positionen,
  geladen,
  abhakbar = true,
  max,
}: Props) {
  const { user } = useAuth();
  const [alle, setAlle] = useState(false);
  const [oertlich, setOertlich] = useState<NonNullable<EinsatzMaterial['geladen']>>(geladen);
  const [fehler, setFehler] = useState<string | null>(null);

  if (positionen.length === 0) return null;

  const offen = positionen.filter((p) => !oertlich[p.id]).length;
  /*
    ZURÜCKNEHMEN NUR AM SELBEN TAG (Nachtest 01.10.2026): mit dem Haken bucht
    die Datenbank den Lagerabgang. Am nächsten Tag ist das Material im Bus
    oder verbaut; was übrig bleibt, geht über die Retoure zurück.
  */
  const heute = todayStr();
  const vonHeute = (am: number) => localDateStr(new Date(am)) === heute;

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
    } catch (err) {
      setOertlich(vorher);
      setFehler(grundAus(err, 'Das konnte nicht gespeichert werden. Bitte noch einmal antippen.'));
    }
  }

  return (
    // Zeilen mit Linien statt eines Kastens im Einsatz (Designlinie „Fassung 3").
    <div className="mt-3">
      <p className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <span className="section-label">Material</span>
        <span className="text-sm text-ink-muted">
          {offen === 0 ? 'alles eingeladen' : `noch ${offen} von ${positionen.length}`}
        </span>
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {(max && !alle ? positionen.slice(0, max) : positionen).map((p) => {
          const eintrag = oertlich[p.id];
          const id = `rl-${projectNumber}-${p.id}`;
          return (
            <li key={p.id}>
              <label
                htmlFor={id}
                className={`flex min-h-touch items-center gap-3 py-2 ${
                  abhakbar ? 'cursor-pointer' : ''
                }`}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={!!eintrag}
                  disabled={!abhakbar || (!!eintrag && !vonHeute(eintrag.am))}
                  title={eintrag && !vonHeute(eintrag.am)
                    ? 'Eingeladen lässt sich nur am selben Tag zurücknehmen — was übrig bleibt, geht über die Retoure zurück.'
                    : undefined}
                  onChange={() => void umschalten(p)}
                  className="checkbox"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block ${eintrag ? 'text-ink-muted line-through' : 'text-ink'}`}>
                    <span className="font-semibold">{p.menge}</span>
                    {p.einheit ? ` ${p.einheit}` : ''} {p.name}
                  </span>
                  {/* Der Name verhindert die doppelte Suche im Lager. */}
                  {eintrag && (
                    <span className="block text-xs text-ink-muted">
                      eingeladen von {eintrag.von}
                      {eintrag.gebucht ? ' · vom Lager abgebucht' : ''}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {max != null && positionen.length > max && (
        <button
          type="button"
          aria-expanded={alle}
          onClick={() => setAlle((a) => !a)}
          className="flex min-h-touch w-full items-center border-b border-line text-left text-sm font-semibold text-ink-deep"
        >
          {alle ? 'weniger anzeigen' : `und ${positionen.length - max} weitere →`}
        </button>
      )}
      {abhakbar && (
        <p className="pt-2 text-xs text-ink-muted">
          Der Haken bucht Lagermaterial vom Bestand ab. Zurücknehmen geht nur heute; was übrig
          bleibt, kommt über die Retoure zurück.
        </p>
      )}
      {fehler && (
        <p role="alert" className="py-2 text-sm text-danger">
          {fehler}
        </p>
      )}
    </div>
  );
}
