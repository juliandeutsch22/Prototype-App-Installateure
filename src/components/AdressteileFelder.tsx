import { InputField, SelectField } from './Field';
import { LAENDER, plzFehler, type Adressteile } from '@/lib/adresse';

/**
 * Straße, PLZ, Ort und Land — für Kunden und den Betrieb (Testbericht
 * 30.09.2026, M12). Die eine Zeile, die Belege und Listen zeigen, entsteht
 * daraus in der Datenbank.
 */
export default function AdressteileFelder({
  idPrefix,
  wert,
  onChange,
  titel = 'Anschrift',
}: {
  idPrefix: string;
  wert: Adressteile;
  onChange: (neu: Adressteile) => void;
  titel?: string;
}) {
  const plz = plzFehler(wert.plz, wert.land);
  return (
    <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <legend className="mb-1 text-sm font-medium text-ink">{titel}</legend>
      <div className="sm:col-span-6">
        <InputField
          id={`${idPrefix}-strasse`}
          label="Straße und Hausnummer"
          autoComplete="street-address"
          value={wert.strasse ?? ''}
          onChange={(e) => onChange({ ...wert, strasse: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <InputField
          id={`${idPrefix}-plz`}
          label="PLZ"
          inputMode="numeric"
          autoComplete="postal-code"
          value={wert.plz ?? ''}
          aria-invalid={plz ? true : undefined}
          onChange={(e) => onChange({ ...wert, plz: e.target.value })}
        />
        {plz && <p className="mt-1 text-sm text-danger">{plz}</p>}
      </div>
      <div className="sm:col-span-2">
        <InputField
          id={`${idPrefix}-ort`}
          label="Ort"
          autoComplete="address-level2"
          value={wert.ort ?? ''}
          onChange={(e) => onChange({ ...wert, ort: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <SelectField
          id={`${idPrefix}-land`}
          label="Land"
          value={(wert.land ?? 'AT').toUpperCase()}
          onChange={(e) => onChange({ ...wert, land: e.target.value })}
        >
          {LAENDER.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </SelectField>
      </div>
    </fieldset>
  );
}
