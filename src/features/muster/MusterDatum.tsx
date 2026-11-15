import { useState } from 'react';
import Card from '@/components/Card';
import { FormGrid, InputField } from '@/components/Field';

/**
 * U10, E5 AUF DER MUSTERSEITE: Datum und Uhrzeit mit dem Rad des Geräts.
 * Zeichnet das Gerät das Feld nicht deutsch, steht der Wert darunter als
 * TT.MM.JJJJ bzw. HH:MM — auf einem deutschen Gerät nicht (dort stünde er
 * zweimal da).
 */
export default function MusterDatum() {
  const [tag, setTag] = useState('2026-11-15');
  const [zeit, setZeit] = useState('07:00');
  return (
    <Card title="Datum und Uhrzeit" hint="Das Feld behält die Eingabe des Geräts. Wo das Gerät das Feld nicht deutsch zeichnet, steht der Wert darunter deutsch.">
      <div className="formular">
        <FormGrid>
          <InputField id="muster-datum" label="Tag" type="date" value={tag} onChange={(e) => setTag(e.target.value)} />
          <InputField id="muster-zeit" label="Beginn" type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} />
        </FormGrid>
      </div>
    </Card>
  );
}
