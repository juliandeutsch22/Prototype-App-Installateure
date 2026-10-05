import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { SelectField } from '@/components/Field';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import { ErrorState } from '@/components/States';
import {
  basiszinssatzEntfernen, basiszinssatzSetzen, listBasiszinssaetze, type ZentralerBasiszinssatz,
} from '@/lib/db/basiszins';
import { halbjahresbeginn, halbjahreZurWahl } from '@/features/invoices/mahnung';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';

const pz = (n: number) => `${n.toLocaleString('de-AT', { maximumFractionDigits: 2 })} %`;

/**
 * Der Basiszinssatz für alle Betriebe (seit 05.10.2026).
 *
 * Er steht hier und nicht in jedem Betrieb, weil die OeNB ihn für ganz
 * Österreich festlegt. Was hier steht, gewinnt je Halbjahr über die Einträge
 * der Betriebe; die bleiben als Rückfall für Halbjahre ohne zentralen Satz.
 *
 * Kein Fenster in einen Betrieb: die Zahl ist öffentlich und gehört keinem.
 */
export default function BasiszinsZentral() {
  const [liste, setListe] = useState<ZentralerBasiszinssatz[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ab, setAb] = useState(() => halbjahresbeginn(todayStr()));
  const [satz, setSatz] = useState<number | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [aktionsFehler, setAktionsFehler] = useState<string | null>(null);

  async function laden() {
    setFehler(null);
    try {
      setListe(await listBasiszinssaetze());
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void laden();
  }, []);

  async function ausfuehren(schritt: () => Promise<void>) {
    setLaeuft(true);
    setAktionsFehler(null);
    try {
      await schritt();
      await laden();
    } catch (e) {
      setAktionsFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  const laufendes = halbjahresbeginn(todayStr());
  const vorhanden = liste?.some((b) => b.ab === ab) ?? false;

  return (
    <Card
      title="Basiszinssatz"
      hint="Der Basiszinssatz der OeNB je Halbjahr, für alle Betriebe. Er gewinnt über die Einträge der Betriebe; die gelten nur noch für Halbjahre, zu denen hier nichts steht. Mahnungen an Unternehmer rechnen damit die Verzugszinsen (§ 456 UGB)."
    >
      {fehler ? (
        <ErrorState message={fehler} onRetry={() => void laden()} />
      ) : !liste ? (
        <p className="text-sm text-ink-muted">Wird geladen …</p>
      ) : (
        <div className="flex flex-col gap-3">
          {liste.length === 0 ? (
            <p className="text-sm text-ink-muted">Noch keiner hinterlegt — es gelten die Einträge der Betriebe.</p>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line">
              {[...liste].reverse().map((b) => (
                <li key={b.ab} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                  <span>
                    ab {datumAT(b.ab)}: <strong>{pz(b.satz)}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={laeuft}
                    aria-label={`Basiszinssatz ab ${datumAT(b.ab)} entfernen`}
                    onClick={() => void ausfuehren(() => basiszinssatzEntfernen(b.ab))}
                  >
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!liste.some((b) => b.ab === laufendes) && (
            <Hinweiszeile stufe="warn">
              <p>
                Für das laufende Halbjahr (ab {datumAT(laufendes)}) ist zentral kein Satz hinterlegt. Es
                gilt, was ein Betrieb selbst eingetragen hat; sonst tragen seine Mahnungen an
                Unternehmer keine Zinsen.
              </p>
            </Hinweiszeile>
          )}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
            <SelectField id="p-basiszins-ab" label="Halbjahr ab" value={ab} onChange={(e) => setAb(e.target.value)}>
              {halbjahreZurWahl(todayStr()).map((hj) => (
                <option key={hj} value={hj}>{datumAT(hj)}</option>
              ))}
            </SelectField>
            <ZahlWertFeld
              id="p-basiszins"
              label="Basiszinssatz (%)"
              negativ
              wert={satz}
              leerAls={null}
              onWert={setSatz}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={satz === null || laeuft}
              onClick={() => {
                if (satz === null) return;
                const neu = satz;
                void ausfuehren(async () => {
                  await basiszinssatzSetzen(ab, neu);
                  setSatz(null);
                });
              }}
            >
              {vorhanden ? 'Satz ersetzen' : 'Satz eintragen'}
            </Button>
          </div>
          {aktionsFehler && <p className="text-sm text-danger">{aktionsFehler}</p>}
        </div>
      )}
    </Card>
  );
}
