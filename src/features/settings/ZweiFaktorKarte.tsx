import { useEffect, useState } from 'react';
import {
  neueCodes, zweitenFaktorAusschalten, zweiterFaktorStand, type ZweiterFaktorStand,
} from '@/lib/auth/sitzung';
import { updateCompany } from '@/lib/db/company';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { CheckboxField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import ZweiFaktorEinrichten, { WiederherstellungsCodes } from '@/features/auth/ZweiFaktorEinrichten';

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * ZWEI-FAKTOR-ANMELDUNG UNTER „MEIN KONTO“ (Runde 3, H1).
 *
 * Für Leitung und Buchhaltung angeboten, für das Plattformkonto Pflicht. Wer den Betrieb
 * verwalten darf, schaltet hier auch die Pflicht für Administrator und
 * Geschäftsführung und Buchhaltung — erst nachdem er selbst einen zweiten Faktor hat, sonst
 * sperrte er sich aus (die Datenbank weist es dann ab).
 */
export default function ZweiFaktorKarte({
  betrieb,
  onBetriebGeaendert,
}: {
  /** Kennung des Betriebs, wenn die Person die Pflicht schalten darf. */
  betrieb?: string;
  onBetriebGeaendert?: () => Promise<void> | void;
}) {
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
      hint="Nach dem Passwort zusätzlich ein Code aus einer Authenticator-App am Telefon. Wer das Passwort erfährt, kommt damit allein nicht hinein."
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
              {stand.plattform
                ? 'Für das Plattformkonto ist sie Pflicht.'
                : 'Im Betrieb ist sie für Leitung und Buchhaltung Pflicht — ausschalten geht deshalb nicht.'}
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

      {betrieb && !stand.plattform && (
        <div className="mt-4 border-t border-line pt-3">
          <CheckboxField
            id="zf-pflicht"
            label="Für Administrator, Geschäftsführung und Buchhaltung in diesem Betrieb verpflichtend"
            checked={stand.betriebPflicht}
            disabled={laeuft || (!stand.eingerichtet && !stand.betriebPflicht)}
            onChange={(e) => {
              const an = e.target.checked;
              void tun(async () => {
                await updateCompany(betrieb, { zweiFaktorPflicht: an });
                await onBetriebGeaendert?.();
                toast.success(an ? 'Pflicht eingeschaltet' : 'Pflicht ausgeschaltet');
              });
            }}
          />
          {!stand.eingerichtet && !stand.betriebPflicht && (
            <p className="text-sm text-ink-muted">Zuerst für dich selbst einrichten, dann lässt sich die Pflicht einschalten.</p>
          )}
          {stand.betriebPflicht && (
            <p className="text-sm text-ink-muted">
              Wer zur Leitung oder Buchhaltung gehört und noch keinen zweiten Faktor hat, richtet ihn bei der nächsten Anmeldung ein.
            </p>
          )}
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
