import { useEffect, useState, type FormEvent } from 'react';
import {
  leitungMitZweitemFaktor, zweitenFaktorZuruecksetzen, type LeitungMitZweitemFaktor,
} from '@/lib/db/plattform';
import Button from '@/components/Button';
import { CheckboxField, InputField, SelectField } from '@/components/Field';
import { ErrorState } from '@/components/States';

/**
 * TELEFON WEG, CODES WEG (Runde 3, H1): der Support entfernt den zweiten
 * Faktor eines Leitungskontos — nur über einen offenen Notzugang, mit Grund
 * und Rückruf an die Nummer aus Firmenbuch oder Gewerberegister, wie beim
 * Passwort. Die Person richtet ihn bei der nächsten Anmeldung neu ein, wenn
 * ihr Betrieb ihn verlangt. Die Grenzen stehen in der Datenbank
 * (`plattform_zweiter_faktor_zuruecksetzen`).
 */
export default function NotzugangZweiFaktor({ kennung, name }: { kennung: string; name: string }) {
  const [konten, setKonten] = useState<LeitungMitZweitemFaktor[] | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [uid, setUid] = useState('');
  const [grund, setGrund] = useState('');
  const [rueckruf, setRueckruf] = useState('');
  const [bestaetigt, setBestaetigt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<string | null>(null);

  async function laden() {
    try {
      setKonten(await leitungMitZweitemFaktor(kennung));
    } catch (e) {
      setLadeFehler(e instanceof Error ? e.message : 'Die Konten ließen sich nicht laden.');
    }
  }
  useEffect(() => {
    void laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kennung]);

  async function zuruecksetzen(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      await zweitenFaktorZuruecksetzen({ uid, grund: grund.trim(), rueckruf: rueckruf.trim() });
      setErledigt(konten?.find((k) => k.uid === uid)?.name ?? '');
      setUid('');
      setGrund('');
      setRueckruf('');
      setBestaetigt(false);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Der zweite Faktor wurde nicht zurückgesetzt.');
    } finally {
      setLaeuft(false);
    }
  }

  if (ladeFehler) return <ErrorState message={ladeFehler} />;
  if (!konten) return <p className="text-sm text-ink-muted">Leitungskonten werden geladen …</p>;

  return (
    <div className="space-y-3 rounded-sm border border-line p-3">
      <p className="text-sm font-medium text-ink">Zwei-Faktor-Anmeldung eines Leitungskontos zurücksetzen — {name}</p>
      {erledigt !== null && (
        <p className="text-sm text-ink" role="status">
          Zurückgesetzt{erledigt ? ` für ${erledigt}` : ''}. Alle Sitzungen sind beendet, der Vorgang steht im
          Protokoll des Betriebs.
        </p>
      )}
      {konten.length === 0 ? (
        <p className="text-sm text-ink-muted">Kein aktives Leitungskonto dieses Betriebs hat einen zweiten Faktor.</p>
      ) : (
        <form onSubmit={zuruecksetzen} className="space-y-3">
          <SelectField id="nz-konto" label="Konto" value={uid} onChange={(e) => setUid(e.target.value)} required pflicht>
            <option value="">— wählen —</option>
            {konten.map((k) => (
              <option key={k.uid} value={k.uid}>
                {k.name} · {k.rolle}
              </option>
            ))}
          </SelectField>
          <InputField id="nz-grund" label="Grund" placeholder="z. B. Telefon verloren, keine Codes mehr"
            value={grund} onChange={(e) => setGrund(e.target.value)} required pflicht />
          <InputField id="nz-rueckruf" label="Rückruf an (Nummer laut Firmenbuch oder Gewerberegister)"
            placeholder="z. B. +43 1 234 56 78" value={rueckruf} onChange={(e) => setRueckruf(e.target.value)} required pflicht />
          <CheckboxField
            id="nz-bestaetigt"
            label="Die Identität ist durch Rückruf an diese Nummer bestätigt — nicht an die Nummer des Anrufers."
            checked={bestaetigt}
            onChange={(e) => setBestaetigt(e.target.checked)}
          />
          {fehler && <ErrorState message={fehler} />}
          <Button type="submit" loading={laeuft} disabled={!uid || !grund.trim() || !rueckruf.trim() || !bestaetigt}>
            Zweiten Faktor zurücksetzen
          </Button>
        </form>
      )}
    </div>
  );
}
