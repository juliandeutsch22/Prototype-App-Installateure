import { useState, type FormEvent } from 'react';
import { codeEinloesen, codePruefen, type ZweiterFaktorBedarf } from '@/lib/auth/sitzung';
import MarkenBand from '@/components/MarkenBand';
import Button from '@/components/Button';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import ZweiFaktorEinrichten from './ZweiFaktorEinrichten';

/**
 * NACH DEM PASSWORT DER ZWEITE FAKTOR (Runde 3, H1) — vor der App, vor der
 * Plattformseite, vor allem. Ohne ihn liefert die Datenbank diesem Konto
 * nichts; die Seite sagt, was zu tun ist.
 */
export default function ZweiFaktorSeite({
  bedarf,
  onCodes,
  onAbmelden,
}: {
  bedarf: Exclude<ZweiterFaktorBedarf, 'keiner'>;
  onCodes: (codes: string[]) => void;
  onAbmelden: () => void;
}) {
  const [code, setCode] = useState('');
  const [mitWiederherstellung, setMitWiederherstellung] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function pruefen(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      if (mitWiederherstellung) await codeEinloesen(code);
      else await codePruefen(code);
      setCode('');
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Der Code ließ sich nicht prüfen.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
      <MarkenBand />
      {/* Seitenkopf wie überall (Linie „Lot“) — auch vor der App, ohne Hülle. */}
      <PageHeader
        ort="Anmeldung"
        title="Zwei-Faktor-Anmeldung"
        subtitle={
          bedarf === 'einrichten'
            ? 'Für dieses Konto ist ein zweiter Faktor Pflicht. Richte ihn jetzt ein — danach geht es weiter.'
            : mitWiederherstellung
              ? 'Gib einen deiner Wiederherstellungscodes ein. Er gilt einmal; danach richtest du den zweiten Faktor neu ein.'
              : 'Gib den sechsstelligen Code aus deiner Authenticator-App ein.'
        }
      />

      <Card>
        {bedarf === 'einrichten' ? (
          <ZweiFaktorEinrichten onCodes={onCodes} />
        ) : (
          <form onSubmit={pruefen} className="formular space-y-3">
            <InputField
              id="zf-code"
              label={mitWiederherstellung ? 'Wiederherstellungscode' : 'Code aus der App'}
              inputMode={mitWiederherstellung ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              pflicht
            />
            {fehler && <ErrorState message={fehler} />}
            <Button type="submit" loading={laeuft} disabled={!code.trim()}>
              {mitWiederherstellung ? 'Code einlösen' : 'Anmelden'}
            </Button>
            <p className="text-sm">
              <button
                type="button"
                className="link inline-flex min-h-touch items-center"
                onClick={() => {
                  setMitWiederherstellung((w) => !w);
                  setCode('');
                  setFehler(null);
                }}
              >
                {mitWiederherstellung ? 'Doch mit dem Code aus der App' : 'Telefon nicht zur Hand? Wiederherstellungscode verwenden'}
              </button>
            </p>
          </form>
        )}
      </Card>

      <p className="text-sm text-ink-muted">
        Weder Telefon noch Code? Bei einem Konto der Leitung setzt der Senklot-Support den zweiten Faktor
        über den Notzugang zurück — mit Rückruf an die Nummer aus dem Firmenbuch.{' '}
        <button type="button" className="link inline-flex min-h-touch items-center" onClick={onAbmelden}>
          Abmelden
        </button>
      </p>
    </div>
  );
}
