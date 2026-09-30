import { useState } from 'react';
import type { InvoiceRates } from '@/types';
import { SelectField } from '@/components/Field';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { basiszinsVerlauf, halbjahresbeginn, halbjahreZurWahl, type Basiszinssatz } from '@/features/invoices/mahnung';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';

const pz = (n: number) => `${n.toLocaleString('de-AT', { maximumFractionDigits: 2 })} %`;

/**
 * Die Basiszinssätze als Verlauf je Halbjahr (Testbericht 30.09.2026, G30).
 *
 * Vorher war nur das laufende und das nächste Halbjahr wählbar; für eine
 * ältere, noch offene Forderung liess sich der damals gültige Satz nicht
 * hinterlegen. Jetzt steht je Halbjahr ein Satz da. Ein einzelner Satz aus
 * der Zeit davor wird übernommen und beim Speichern in die Liste geschrieben.
 */
export default function BasiszinsVerlauf({
  rates,
  setRates,
}: {
  rates: InvoiceRates;
  setRates: (r: InvoiceRates) => void;
}) {
  const verlauf = basiszinsVerlauf(rates);
  const zurWahl = halbjahreZurWahl(todayStr());
  const laufendes = halbjahresbeginn(todayStr());
  const [ab, setAb] = useState(laufendes);
  const [satz, setSatz] = useState<number | null>(null);

  function setze(neu: Basiszinssatz[]) {
    // Der einzelne Satz von früher geht in der Liste auf.
    setRates({ ...rates, basiszinssaetze: neu, basiszinssatz: undefined, basiszinssatzAb: undefined });
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <p className="text-sm font-medium text-ink">Basiszinssatz je Halbjahr</p>
      {verlauf.length === 0 ? (
        <p className="text-sm text-ink-muted">Noch keiner eingetragen — Mahnungen an Unternehmer tragen dann keine Zinsen.</p>
      ) : (
        <ul className="divide-y divide-line rounded-sm border border-line">
          {[...verlauf].reverse().map((b) => (
            <li key={b.ab} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span>
                ab {datumAT(b.ab)}: <strong>{pz(b.satz)}</strong>
              </span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Basiszinssatz ab ${datumAT(b.ab)} entfernen`}
                onClick={() => setze(verlauf.filter((x) => x.ab !== b.ab))}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!verlauf.some((b) => b.ab === laufendes) && verlauf.length > 0 && (
        <Hinweiszeile stufe="warn">
          <p>
            Für das laufende Halbjahr (ab {datumAT(laufendes)}) ist kein Satz eingetragen. Mahnungen an
            Unternehmer tragen bis dahin keine Zinsen.
          </p>
        </Hinweiszeile>
      )}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <SelectField id="r-basiszins-ab" label="Halbjahr ab" value={ab} onChange={(e) => setAb(e.target.value)}>
          {zurWahl.map((hj) => (
            <option key={hj} value={hj}>{datumAT(hj)}</option>
          ))}
        </SelectField>
        <ZahlWertFeld
          id="r-basiszins"
          label="Basiszinssatz (%)"
          negativ
          wert={satz}
          leerAls={null}
          onWert={setSatz}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={satz === null}
          onClick={() => {
            if (satz === null) return;
            setze([...verlauf.filter((x) => x.ab !== ab), { ab, satz }].sort((a, b) => a.ab.localeCompare(b.ab)));
            setSatz(null);
          }}
        >
          {verlauf.some((b) => b.ab === ab) ? 'Satz ersetzen' : 'Satz eintragen'}
        </Button>
      </div>
    </div>
  );
}
