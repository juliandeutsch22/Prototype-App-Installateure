import { SelectField } from './Field';
import { EINHEITEN } from '@/lib/einheit';

/**
 * DIE EINHEIT AUS EINER FESTEN LISTE (Nachtest 01.10.2026, U5): im Lager
 * standen „Stk“, „Stck“ und „M“ nebeneinander. Eine Einheit, die schon
 * anders gespeichert ist (etwa „Karton“ aus einer DATANORM-Datei), bleibt
 * wählbar, damit beim Bearbeiten nichts verloren geht. Die Datenbank
 * schreibt Varianten zusätzlich in die übliche Form (`app.einheit_norm`).
 */
export default function EinheitFeld({
  id,
  value,
  onChange,
  leer,
}: {
  id: string;
  value: string;
  onChange: (einheit: string) => void;
  /** Beschriftung der leeren Wahl — ohne Angabe keine leere Wahl. */
  leer?: string;
}) {
  const bisher = value && !EINHEITEN.includes(value) ? value : null;
  return (
    <SelectField id={id} label="Einheit" value={value} onChange={(e) => onChange(e.target.value)}>
      {leer !== undefined && <option value="">{leer}</option>}
      {EINHEITEN.map((e) => (
        <option key={e} value={e}>{e}</option>
      ))}
      {bisher && <option value={bisher}>{bisher} (bisher)</option>}
    </SelectField>
  );
}
