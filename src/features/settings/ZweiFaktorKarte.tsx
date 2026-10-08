import { useEffect, useState } from 'react';
import {
  neueCodes, zweitenFaktorAusschalten, zweiterFaktorStand, type ZweiterFaktorStand,
} from '@/lib/auth/sitzung';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import ZweiFaktorEinrichten, { WiederherstellungsCodes } from '@/features/auth/ZweiFaktorEinrichten';

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Freiwillig für Betriebskonten; ausschließlich für den globalen Admin Pflicht. */
export default function ZweiFaktorKarte() {
  const toast = useToast();
  const [stand, setStand] = useState<ZweiterFaktorStand | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [einrichten, setEinrichten] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    try {
      setStand(await zweiterFaktorStand());
      setLadeFehler(null);
    } catch (e) {
      setLadeFehler(e instanceof Error ? e.message : 'Der Stand ließ sich nicht laden.');
    }
  }
  useEffect(() => {
    void laden();
  }, []);

  async function tun(was: () => Promise<void>) {
    setLaeuft(true);
    setFehler(null);
    try {
      await was();
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Das ging nicht.');
    } finally {
      setLaeuft(false);
    }
  }

  if (ladeFehler) {
    return (
      <Card title="Zwei-Faktor-Anmeldung">
        <ErrorState message={ladeFehler} onRetry={() => void laden()} />
      </Card>
    );
  }
  if (!stand || !stand.angeboten) return null;

  return (
    <Card
      title="Zwei-Faktor-Anmeldung"
      hint="Einmal mit einer Authenticator-App einrichten. Eine gültige gespeicherte Sitzung bleibt angemeldet. Erst nach Abmelden oder Ablauf wird zusätzlich zum Passwort wieder ein Code benötigt. Verpflichtend ist die Einrichtung nur für den globalen Administrator."
    >
      {codes ? (
        <WiederherstellungsCodes codes={codes} onWeiter={() => setCodes(null)} />
      ) : stand.eingerichtet ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Eingerichtet. Noch {stand.codesOffen} von 10 Wiederherstellungscodes offen.
            {stand.codeZuletztVerwendet && ` Zuletzt einen verwendet am ${datum(stand.codeZuletztVerwendet)}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={laeuft}
              onClick={() => void tun(async () => setCodes(await neueCodes()))}
            >
              Neue Wiederherstellungscodes
            </Button>
            {!stand.pflicht && (
              <Button
                variant="ghost"
                loading={laeuft}
                onClick={() => void tun(async () => {
                  await zweitenFaktorAusschalten();
                  toast.success('Zwei-Faktor-Anmeldung ausgeschaltet');
                })}
              >
                Ausschalten
              </Button>
            )}
          </div>
          {stand.pflicht && (
            <p className="text-sm text-ink-muted">
              Für den globalen Administrator ist sie Pflicht.
            </p>
          )}
        </div>
      ) : einrichten ? (
        <ZweiFaktorEinrichten
          onCodes={(c) => {
            setEinrichten(false);
            setCodes(c);
            void laden();
          }}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Noch nicht eingerichtet.</p>
          <Button variant="secondary" onClick={() => setEinrichten(true)}>
            Einrichten
          </Button>
        </div>
      )}

      {fehler && (
        <div className="mt-3">
          <ErrorState message={fehler} />
        </div>
      )}
    </Card>
  );
}
