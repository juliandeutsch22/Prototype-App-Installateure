import { useCallback, useEffect, useState } from 'react';
import {
  neueCodes, ohneFaktor, zweitenFaktorAusschalten, zweiterFaktorStand, type OhneFaktor, type ZweiterFaktorStand,
} from '@/lib/auth/sitzung';
import { updateCompany } from '@/lib/db/company';
import Button from '@/components/Button';
import Card from '@/components/Card';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CheckboxField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import ZweiFaktorEinrichten, { WiederherstellungsCodes } from '@/features/auth/ZweiFaktorEinrichten';

/** „Anna Berger, Max Huber und Eva Lang“ — in der Reihenfolge der Datenbank. */
function namenListe(personen: OhneFaktor[]): string {
  const namen = personen.map((p) => p.name);
  return namen.length > 1 ? `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}` : namen[0] ?? '';
}

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * ZWEI-FAKTOR-ANMELDUNG UNTER „MEIN KONTO“ (Runde 3, H1).
 *
 * Für Leitung und Buchhaltung angeboten, für das Plattformkonto Pflicht. Wer
 * den Betrieb verwalten darf, schaltet hier auch die Pflicht für
 * Administrator, Geschäftsführung und Buchhaltung — erst nachdem er selbst
 * einen zweiten Faktor hat, sonst sperrte er sich aus (die Datenbank weist es
 * dann ab). Die Buchhaltung sieht dasselbe Geld wie die Leitung; seit
 * 11.10.2026 gehört sie dazu.
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
  /*
    WEN DIE PFLICHT TRIFFT (K6, Durchsicht 15.11.2026). Sie wirkt sofort —
    wer zur Leitung oder Buchhaltung gehört und keinen Faktor hat, sieht ab
    dem Speichern nichts mehr, bis er ihn einrichtet. Deshalb steht vor dem
    Einschalten, wen das betrifft, und solange die Pflicht gilt, wer noch
    fehlt. `null`: noch nicht geladen oder nicht abrufbar — dann fragt der
    Dialog trotzdem, statt still einzuschalten.
  */
  const [ohne, setOhne] = useState<OhneFaktor[] | null>(null);
  const [pflichtFragen, setPflichtFragen] = useState(false);

  const laden = useCallback(async () => {
    try {
      const s = await zweiterFaktorStand();
      setStand(s);
      if (betrieb && !s.plattform) setOhne(await ohneFaktor().catch(() => null));
      setLadeFehler(null);
    } catch (e) {
      setLadeFehler(e instanceof Error ? e.message : 'Der Stand ließ sich nicht laden.');
    }
  }, [betrieb]);
  useEffect(() => {
    void laden();
  }, [laden]);

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

  async function pflichtSetzen(an: boolean) {
    if (!betrieb) return;
    await tun(async () => {
      await updateCompany(betrieb, { zweiFaktorPflicht: an });
      await onBetriebGeaendert?.();
      toast.success(an ? 'Pflicht eingeschaltet' : 'Pflicht ausgeschaltet');
    });
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
              if (an && (ohne === null || ohne.length > 0)) {
                setPflichtFragen(true);
                return;
              }
              void pflichtSetzen(an);
            }}
          />
          {!stand.eingerichtet && !stand.betriebPflicht && (
            <p className="text-sm text-ink-muted">Zuerst für dich selbst einrichten, dann lässt sich die Pflicht einschalten.</p>
          )}
          {stand.betriebPflicht && (
            <p className="text-sm text-ink-muted">
              {ohne && ohne.length > 0
                ? `Noch ohne zweiten Faktor: ${namenListe(ohne)}. Die App führt sie beim nächsten Öffnen zur Einrichtung; bis dahin sehen sie keine Daten.`
                : ohne
                  ? 'Alle in Leitung und Buchhaltung haben einen zweiten Faktor.'
                  : 'Wer zur Leitung oder Buchhaltung gehört und noch keinen zweiten Faktor hat, wird sofort zur Einrichtung geführt.'}
            </p>
          )}
        </div>
      )}

      {betrieb && (
        <ConfirmDialog
          open={pflichtFragen}
          title="Pflicht jetzt einschalten?"
          confirmLabel="Pflicht einschalten"
          confirmTone="primary"
          message={
            ohne === null
              ? 'Ob alle in Leitung und Buchhaltung einen zweiten Faktor haben, ließ sich nicht abrufen. Wer keinen hat, sieht ab sofort keine Daten mehr, bis er ihn eingerichtet hat — die App führt ihn dorthin.'
              : 'Diese Personen haben noch keinen zweiten Faktor. Ab sofort sehen sie keine Daten mehr, bis sie ihn eingerichtet haben — die App führt sie innerhalb einer Minute dorthin. Am besten vorher Bescheid geben.'
          }
          onCancel={() => setPflichtFragen(false)}
          onConfirm={async () => {
            setPflichtFragen(false);
            await pflichtSetzen(true);
          }}
        >
          {ohne && ohne.length > 0 && (
            <ul className="space-y-1 text-sm text-ink">
              {ohne.map((p) => <li key={p.uid}>{p.name} · {p.rolle}</li>)}
            </ul>
          )}
        </ConfirmDialog>
      )}

      {fehler && (
        <div className="mt-3">
          <ErrorState message={fehler} />
        </div>
      )}
    </Card>
  );
}
