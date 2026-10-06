import { useState, type FormEvent } from 'react';
import { einrichtenBeginnen, einrichtenBestaetigen, type NeuerFaktor } from '@/lib/auth/sitzung';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';

/**
 * DEN ZWEITEN FAKTOR EINRICHTEN (Runde 3, H1): QR-Code scannen, ersten Code
 * eingeben, die Wiederherstellungscodes notieren. Gebraucht nach der
 * Anmeldung (Pflicht) und unter „Mein Konto“ (freiwillig).
 */
export default function ZweiFaktorEinrichten({
  onCodes,
}: {
  /** Nach dem Bestätigen: die Wiederherstellungscodes zum Notieren. */
  onCodes: (codes: string[]) => void;
}) {
  const [faktor, setFaktor] = useState<NeuerFaktor | null>(null);
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function beginnen() {
    setLaeuft(true);
    setFehler(null);
    try {
      setFaktor(await einrichtenBeginnen());
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Einrichtung ließ sich nicht beginnen.');
    } finally {
      setLaeuft(false);
    }
  }

  async function bestaetigen(e: FormEvent) {
    e.preventDefault();
    if (!faktor) return;
    setLaeuft(true);
    setFehler(null);
    try {
      onCodes(await einrichtenBestaetigen(faktor.faktorId, code));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Der Code ließ sich nicht prüfen.');
    } finally {
      setLaeuft(false);
    }
  }

  if (!faktor) {
    return (
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          Du brauchst eine Authenticator-App am Telefon.
          <InfoHint about="Authenticator-App">
            Etwa Google Authenticator, Microsoft Authenticator oder die Passwörter-App am iPhone. Die
            App zeigt alle 30 Sekunden einen neuen sechsstelligen Code; den gibst du nach dem Passwort
            ein. Ohne das Telefon helfen die Wiederherstellungscodes, die du gleich bekommst.
          </InfoHint>
        </p>
        {fehler && <ErrorState message={fehler} />}
        <Button loading={laeuft} onClick={() => void beginnen()}>
          Einrichtung beginnen
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={bestaetigen} className="space-y-3">
      <p className="text-sm text-ink">1. Den Code mit der Authenticator-App scannen.</p>
      <div className="inline-flex rounded border border-line bg-white p-2">
        <img src={faktor.qrCode} alt="QR-Code für die Authenticator-App" className="h-44 w-44" />
      </div>
      <p className="text-sm text-ink-muted">
        Ohne Kamera: in der App „Schlüssel eingeben“ wählen und diesen eintippen:{' '}
        <span className="break-all font-mono text-ink">{faktor.geheimnis}</span>
      </p>
      <p className="text-sm text-ink">2. Den sechsstelligen Code aus der App eingeben.</p>
      <InputField
        id="zf-einrichten-code"
        label="Code aus der App"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        pflicht
      />
      {fehler && <ErrorState message={fehler} />}
      <Button type="submit" loading={laeuft} disabled={code.replace(/\s/g, '').length !== 6}>
        Bestätigen
      </Button>
    </form>
  );
}

/**
 * Die Wiederherstellungscodes — nur jetzt zu sehen. Erst „notiert“ führt
 * weiter, damit niemand sie überspringt und sich später aussperrt.
 */
export function WiederherstellungsCodes({ codes, onWeiter }: { codes: string[]; onWeiter: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        Wiederherstellungscodes — nur jetzt zu sehen. Ohne Telefon meldest du dich mit einem davon an;
        jeder gilt einmal. Bitte ausdrucken oder sicher ablegen, nicht am Telefon.
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-base text-ink" aria-label="Wiederherstellungscodes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join('\n')).then(() => setKopiert(true)).catch(() => undefined);
          }}
        >
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </Button>
        <Button onClick={onWeiter}>Codes notiert — weiter</Button>
      </div>
    </div>
  );
}
