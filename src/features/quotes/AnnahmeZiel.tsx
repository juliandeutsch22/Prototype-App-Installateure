import type { Abrechnungsart, Quote } from '@/types';
import BaustellenSuche from '@/components/BaustellenSuche';
import { fmtStunden } from '@/lib/time';
import AbrechnungWahl from './AbrechnungWahl';
import type { AnnahmeZielWert } from './annahmeZiel';

/**
 * WOHIN DAS ANGENOMMENE ANGEBOT GEHT (A3, F6): eine neue Baustelle oder als
 * Nachtrag an eine bestehende. Vorher legte jedes Annehmen eine neue an —
 * auch dort, wo die Baustellenakte selbst riet, „ein Angebot anzulegen und
 * anzunehmen“; der Auftrag stand danach doppelt da.
 *
 * Eine Stelle für Liste und Angebotsseite, wie `angebotAnnehmen`.
 */
export default function AnnahmeZiel({
  companyId,
  angebot,
  ziel,
  onZiel,
  abrechnung,
  onAbrechnung,
}: {
  companyId: string;
  angebot: Pick<Quote, 'customerId' | 'kalkulierteStunden'>;
  ziel: AnnahmeZielWert;
  onZiel: (z: AnnahmeZielWert) => void;
  abrechnung: Abrechnungsart;
  onAbrechnung: (a: Abrechnungsart) => void;
}) {
  return (
    <fieldset className="mt-3 space-y-2">
      <legend className="section-label">Baustelle</legend>
      <div className="flex flex-col">
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-fliess text-ink">
          <input
            type="radio"
            name="annahme-ziel"
            className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
            checked={ziel.art === 'neu'}
            onChange={() => onZiel({ art: 'neu', baustelleId: '', projekt: null })}
          />
          Neue Baustelle
        </label>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 text-fliess text-ink">
          <input
            type="radio"
            name="annahme-ziel"
            className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
            checked={ziel.art === 'nachtrag'}
            onChange={() => onZiel({ ...ziel, art: 'nachtrag' })}
          />
          An eine bestehende Baustelle (Nachtrag)
        </label>
      </div>
      {ziel.art === 'neu' ? (
        <AbrechnungWahl wert={abrechnung} onWert={onAbrechnung} />
      ) : (
        <div className="space-y-2">
          <BaustellenSuche
            companyId={companyId}
            id="annahme-baustelle"
            label="Baustelle des Nachtrags"
            pflicht
            value={ziel.baustelleId}
            projekt={ziel.projekt}
            kundeId={angebot.customerId}
            hinweisAbgeschlossen="abgeschlossen — wird mit dem Nachtrag wieder aktiv"
            onChange={(id, projekt) => onZiel({ art: 'nachtrag', baustelleId: id, projekt })}
          />
          <p className="text-meta text-ink-muted">
            {angebot.kalkulierteStunden > 0
              ? `Das Stundenbudget der Baustelle wächst um ${fmtStunden(angebot.kalkulierteStunden)} h. `
              : ''}
            Das Angebot steht danach in ihrer Akte; ihre Abrechnung bleibt, wie sie ist.
          </p>
        </div>
      )}
    </fieldset>
  );
}
