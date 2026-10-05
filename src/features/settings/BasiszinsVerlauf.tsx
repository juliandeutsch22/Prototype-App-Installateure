import { useEffect, useState } from 'react';
import type { InvoiceRates } from '@/types';
import { SelectField } from '@/components/Field';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import InfoHint from '@/components/InfoHint';
import { basiszinsVerlauf, halbjahresbeginn, halbjahreZurWahl, type Basiszinssatz } from '@/features/invoices/mahnung';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';
import { listBasiszinssaetze, type ZentralerBasiszinssatz } from '@/lib/db/basiszins';

const pz = (n: number) => `${n.toLocaleString('de-AT', { maximumFractionDigits: 2 })} %`;

/**
 * Die Basiszinssätze als Verlauf je Halbjahr (Testbericht 30.09.2026, G30).
 *
 * Vorher war nur das laufende und das nächste Halbjahr wählbar; für eine
 * ältere, noch offene Forderung liess sich der damals gültige Satz nicht
 * hinterlegen. Jetzt steht je Halbjahr ein Satz da. Ein einzelner Satz aus
 * der Zeit davor wird übernommen und beim Speichern in die Liste geschrieben.
 *
 * SEIT 05.10.2026 PFLEGT DER BETREIBER DEN SATZ ZENTRAL. Diese Halbjahre
 * stehen hier mit „zentral“ und ohne Knopf; eintragen lässt sich nur noch
 * ein Halbjahr, zu dem zentral nichts steht. Was der Betrieb früher für ein
 * solches Halbjahr selbst eingetragen hat, bleibt gespeichert, gilt aber
 * nicht mehr — gerechnet wird mit dem zentralen Satz.
 */
export default function BasiszinsVerlauf({
  rates,
  setRates,
}: {
  rates: InvoiceRates;
  setRates: (r: InvoiceRates) => void;
}) {
  const [zentral, setZentral] = useState<ZentralerBasiszinssatz[]>([]);
  useEffect(() => {
    let weg = false;
    // Kommt die zentrale Liste nicht, bleibt die Karte, wie sie vorher war.
    listBasiszinssaetze().then((l) => { if (!weg) setZentral(l); }, () => undefined);
    return () => { weg = true; };
  }, []);
  const zentraleHalbjahre = new Set(zentral.map((b) => b.ab));
  /** Die eigenen Einträge des Betriebs — nur sie werden gespeichert. */
  const verlauf = basiszinsVerlauf(rates);
  /** Was gilt: zentral vor eigen. */
  const geltend = basiszinsVerlauf(rates, zentral);
  const zurWahl = halbjahreZurWahl(todayStr()).filter((hj) => !zentraleHalbjahre.has(hj));
  const laufendes = halbjahresbeginn(todayStr());
  const [ab, setAb] = useState(laufendes);
  const [satz, setSatz] = useState<number | null>(null);
  // Steht das gewählte Halbjahr inzwischen zentral, rückt die Wahl auf das erste freie.
  const gewaehlt = zurWahl.includes(ab) ? ab : (zurWahl[0] ?? '');

  function setze(neu: Basiszinssatz[]) {
    // Der einzelne Satz von früher geht in der Liste auf.
    setRates({ ...rates, basiszinssaetze: neu, basiszinssatz: undefined, basiszinssatzAb: undefined });
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <p className="text-sm font-medium text-ink">Basiszinssatz je Halbjahr</p>
      {geltend.length === 0 ? (
        <p className="text-sm text-ink-muted">Noch keiner eingetragen — Mahnungen an Unternehmer tragen dann keine Zinsen.</p>
      ) : (
        <ul className="divide-y divide-line rounded-sm border border-line">
          {[...geltend].reverse().map((b) => (
            <li key={b.ab} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span>
                ab {datumAT(b.ab)}: <strong>{pz(b.satz)}</strong>
              </span>
              {zentraleHalbjahre.has(b.ab) ? (
                <span className="text-ink-muted">zentral</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Basiszinssatz ab ${datumAT(b.ab)} entfernen`}
                  onClick={() => setze(verlauf.filter((x) => x.ab !== b.ab))}
                >
                  Entfernen
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {zentral.length > 0 && (
        <InfoHint about="den Basiszinssatz">
          Mit „zentral“ markierte Sätze pflegt der Betreiber von Senklot für alle Betriebe. Eintragen
          lässt sich hier nur ein Halbjahr, für das zentral noch keiner hinterlegt ist.
        </InfoHint>
      )}
      {!geltend.some((b) => b.ab === laufendes) && geltend.length > 0 && (
        <Hinweiszeile stufe="warn">
          <p>
            Für das laufende Halbjahr (ab {datumAT(laufendes)}) ist kein Satz eingetragen. Mahnungen an
            Unternehmer tragen bis dahin keine Zinsen.
          </p>
        </Hinweiszeile>
      )}
      {zurWahl.length > 0 && (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
          <SelectField id="r-basiszins-ab" label="Halbjahr ab" value={gewaehlt} onChange={(e) => setAb(e.target.value)}>
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
            disabled={satz === null || !gewaehlt}
            onClick={() => {
              if (satz === null || !gewaehlt) return;
              setze([...verlauf.filter((x) => x.ab !== gewaehlt), { ab: gewaehlt, satz }].sort((a, b) => a.ab.localeCompare(b.ab)));
              setSatz(null);
            }}
          >
            {verlauf.some((b) => b.ab === gewaehlt) ? 'Satz ersetzen' : 'Satz eintragen'}
          </Button>
        </div>
      )}
    </div>
  );
}
