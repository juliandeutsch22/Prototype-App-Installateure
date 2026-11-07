import { InputField, SelectField } from '@/components/Field';
import type { Zeitfeld, ZeitfeldWert } from '@/lib/zeitfelder';

/**
 * DIE FREIEN ZEITFELDER IN DER BUCHUNGSMASKE (M06b) — die Felder, die für
 * diese Buchung gelten (Stand und Rolle der gebuchten Person), in der
 * Reihenfolge des Betriebs. Was in sie eingetragen ist, hält die Maske als
 * Text (`roh`); erst beim Speichern wird daraus ein Wert und geprüft — mit
 * derselben Regel wie auf dem Server (`lib/zeitfelder.ts`).
 *
 * „Pflicht beim Buchen“ trägt den Stern. Ja/Nein ist eine Auswahl mit „keine
 * Angabe“, kein Kästchen: sonst gäbe es kein „noch nicht ausgefüllt“.
 */
export default function ZeitfeldEingaben({
  felder,
  roh,
  onChange,
  alteWerte,
}: {
  felder: readonly Zeitfeld[];
  roh: Record<string, string>;
  onChange: (feldId: string, wert: string) => void;
  /** Gespeicherte Werte der Buchung: eine nicht mehr wählbare Option bleibt an ihr stehen. */
  alteWerte?: Record<string, ZeitfeldWert>;
}) {
  if (felder.length === 0) return null;
  return (
    <fieldset className="space-y-4 border-t border-line pt-2" aria-label="Angaben für den Betrieb">
      <legend className="pr-2 section-label">Angaben für den Betrieb</legend>
      {felder.map((f) => {
        const id = `zeitfeld-${f.id}`;
        const pflicht = f.pflicht === 'beim_buchen';
        const wert = roh[f.id] ?? '';
        const setze = (w: string) => onChange(f.id, w);
        if (f.typ === 'janein') {
          return (
            <SelectField key={f.id} id={id} label={f.name} pflicht={pflicht} value={wert} onChange={(e) => setze(e.target.value)}>
              <option value="">— keine Angabe —</option>
              <option value="ja">Ja</option>
              <option value="nein">Nein</option>
            </SelectField>
          );
        }
        if (f.typ === 'auswahl') {
          const alt = alteWerte?.[f.id];
          const optionen = (f.regeln.optionen ?? []).filter((o) => o.aktiv || o.id === alt);
          return (
            <SelectField key={f.id} id={id} label={f.name} pflicht={pflicht} value={wert} onChange={(e) => setze(e.target.value)}>
              <option value="">— keine Angabe —</option>
              {optionen.map((o) => (
                <option key={o.id} value={o.id}>{o.aktiv ? o.text : `${o.text} (nicht mehr wählbar)`}</option>
              ))}
            </SelectField>
          );
        }
        if (f.typ === 'datum') {
          return <InputField key={f.id} id={id} label={f.name} pflicht={pflicht} type="date" value={wert} onChange={(e) => setze(e.target.value)} />;
        }
        if (f.typ === 'zahl') {
          return (
            <InputField
              key={f.id}
              id={id}
              label={f.regeln.einheit ? `${f.name} (${f.regeln.einheit})` : f.name}
              pflicht={pflicht}
              inputMode="decimal"
              value={wert}
              onChange={(e) => setze(e.target.value)}
            />
          );
        }
        return (
          <InputField
            key={f.id}
            id={id}
            label={f.name}
            pflicht={pflicht}
            maxLength={f.regeln.laenge ?? 200}
            value={wert}
            onChange={(e) => setze(e.target.value)}
          />
        );
      })}
    </fieldset>
  );
}
