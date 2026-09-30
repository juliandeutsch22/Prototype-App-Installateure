import { SelectField } from '@/components/Field';
import { ABRECHNUNGSARTEN } from '@/lib/abrechnung';
import type { Abrechnungsart } from '@/types';

/**
 * WIE DIE NEUE BAUSTELLE ABGERECHNET WIRD — beim Annehmen gewählt
 * (Testbericht 30.09.2026, M16). Vorher wurde jede Baustelle aus einem
 * Angebot eine Pauschalbaustelle; das bleibt die Vorgabe.
 */
export default function AbrechnungWahl({
  wert,
  onWert,
}: {
  wert: Abrechnungsart;
  onWert: (a: Abrechnungsart) => void;
}) {
  return (
    <div className="mt-3">
      <SelectField
        id="annahme-abrechnung"
        label="Abrechnung der Baustelle"
        value={wert}
        onChange={(e) => onWert(e.target.value as Abrechnungsart)}
      >
        {ABRECHNUNGSARTEN.map((a) => (
          <option key={a.wert} value={a.wert}>
            {a.text}
          </option>
        ))}
      </SelectField>
      <p className="mt-1 text-sm text-ink-muted">
        {wert === 'Pauschal'
          ? 'Die Rechnung übernimmt das Angebot als Festpreis.'
          : wert === 'Einheitspreis'
            ? 'Die Rechnung übernimmt die Positionen mit ihren Einheitspreisen; die Mengen kommen aus dem Aufmaß.'
            : 'Verrechnet werden die bestätigten Stunden und das Material der Scheine.'}
      </p>
    </div>
  );
}
