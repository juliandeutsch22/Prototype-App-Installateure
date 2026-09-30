import { InputField, SelectField, FormGrid } from './Field';
import { uidFehler, uidNormalisieren, type Kundenart } from '@/lib/uid';

/**
 * Kundenart und UID-Nummer — beim Anlegen und in der Kundenakte gleich
 * (Testbericht 30.09.2026, M10).
 *
 * Wer eine UID einträgt, ist Unternehmer: die Kundenart springt mit. Eine
 * Privatperson ohne UID bleibt Privatperson; ein Unternehmen ohne UID
 * (Kleinunternehmer) wählt die Kundenart selbst.
 */
export default function KundenartUidFelder({
  idPrefix,
  kundenart,
  vatId,
  onChange,
}: {
  idPrefix: string;
  kundenart: Kundenart | '' | null | undefined;
  vatId: string | null | undefined;
  onChange: (neu: { kundenart: Kundenart | ''; vatId: string }) => void;
}) {
  const fehler = uidFehler(vatId);
  const art = kundenart ?? '';
  return (
    <FormGrid>
      <SelectField
        id={`${idPrefix}-art`}
        label="Kundenart"
        value={art}
        onChange={(e) => onChange({ kundenart: e.target.value as Kundenart | '', vatId: vatId ?? '' })}
      >
        {art === '' && <option value="">Nicht angegeben</option>}
        <option value="privat">Privatperson</option>
        <option value="unternehmen">Unternehmen</option>
      </SelectField>
      <div>
        <InputField
          id={`${idPrefix}-uid`}
          label="UID-Nummer"
          placeholder={art === 'privat' ? 'bei Privatpersonen leer' : 'z. B. ATU12345678'}
          value={vatId ?? ''}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={fehler ? `${idPrefix}-uid-fehler` : undefined}
          onChange={(e) => {
            const neu = e.target.value;
            onChange({
              // Nur „Privatperson“ wird umgestellt; ohne Angabe setzt es die
              // Datenbank beim Speichern, und ein reines Nachsehen bleibt
              // ohne Änderung.
              kundenart: uidNormalisieren(neu) && art === 'privat' ? 'unternehmen' : art,
              vatId: neu,
            });
          }}
        />
        {fehler && (
          <p id={`${idPrefix}-uid-fehler`} className="mt-1 text-sm text-danger">
            {fehler}
          </p>
        )}
      </div>
    </FormGrid>
  );
}
