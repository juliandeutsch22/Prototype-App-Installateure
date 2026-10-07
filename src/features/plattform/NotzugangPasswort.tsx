import { useEffect, useState, type FormEvent } from 'react';
import { leitungskontenImNotzugang, notzugangPasswort, type Leitungskonto } from '@/lib/db/plattform';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { CheckboxField, InputField, SelectField } from '@/components/Field';
import { ErrorState } from '@/components/States';

/**
 * EIN AUSGESPERRTER BETRIEB BEKOMMT WIEDER EIN PASSWORT (Testbericht
 * 30.09.2026, P2) — nur über einen offenen Notzugang, nur für ein
 * Leitungskonto mit Benutzername, mit Grund und Identitätsprüfung. Die
 * Grenzen stehen in der Edge Function `notzugang-passwort` und in der
 * Datenbank; hier steht, was der Support vorher tun muss.
 */
export default function NotzugangPasswort({ kennung, name }: { kennung: string; name: string }) {
  const [konten, setKonten] = useState<Leitungskonto[] | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [uid, setUid] = useState('');
  const [grund, setGrund] = useState('');
  const [rueckruf, setRueckruf] = useState('');
  const [bestaetigt, setBestaetigt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ wer: string; passwort: string } | null>(null);

  useEffect(() => {
    let weg = false;
    leitungskontenImNotzugang(kennung)
      .then((k) => {
        if (!weg) setKonten(k);
      })
      .catch((e: Error) => {
        if (!weg) setLadeFehler(e.message);
      });
    return () => {
      weg = true;
    };
  }, [kennung]);

  async function setzen(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      const passwort = await notzugangPasswort({ uid, grund: grund.trim(), rueckruf: rueckruf.trim(), identitaetBestaetigt: bestaetigt });
      const k = konten?.find((x) => x.uid === uid);
      setErgebnis({ wer: k ? `${k.name} (${k.benutzername})` : '', passwort });
      setUid('');
      setGrund('');
      setRueckruf('');
      setBestaetigt(false);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das Passwort wurde nicht gesetzt.');
    } finally {
      setLaeuft(false);
    }
  }

  if (ladeFehler) return <ErrorState message={ladeFehler} />;
  if (!konten) return <p className="text-sm text-ink-muted">Leitungskonten werden geladen …</p>;

  return (
    <div className="space-y-3 rounded-sm border border-line p-3">
      <p className="text-sm font-normal text-ink">Passwort eines Leitungskontos neu setzen — {name}</p>
      {ergebnis && (
        <Hinweiszeile stufe="warn">
          <p>
            Startpasswort für {ergebnis.wer}: <span className="font-mono text-base">{ergebnis.passwort}</span>. Nur
            jetzt zu sehen. Alle Sitzungen dieses Kontos sind beendet, beim nächsten Anmelden vergibt er ein
            eigenes, und im Protokoll des Betriebs steht der Vorgang.
          </p>
        </Hinweiszeile>
      )}
      {konten.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Dieser Betrieb hat kein aktives Leitungskonto mit Benutzername. Konten mit E-Mail setzen ihr
          Passwort über „Passwort vergessen“ selbst.
        </p>
      ) : (
        <form onSubmit={setzen} className="space-y-3">
          <SelectField id="np-konto" label="Konto" value={uid} onChange={(e) => setUid(e.target.value)} required pflicht>
            <option value="">— wählen —</option>
            {konten.map((k) => (
              <option key={k.uid} value={k.uid}>
                {k.name} · {k.benutzername} · {k.rolle}
              </option>
            ))}
          </SelectField>
          <InputField id="np-grund" label="Grund" placeholder="z. B. Passwort vergessen, einziges Leitungskonto"
            value={grund} onChange={(e) => setGrund(e.target.value)} required pflicht />
          <InputField id="np-rueckruf" label="Rückruf an (Nummer laut Firmenbuch oder Gewerberegister)"
            placeholder="z. B. +43 1 234 56 78" value={rueckruf} onChange={(e) => setRueckruf(e.target.value)} required pflicht />
          <CheckboxField
            id="np-bestaetigt"
            label="Die Identität ist durch Rückruf an diese Nummer bestätigt — nicht an die Nummer des Anrufers."
            checked={bestaetigt}
            onChange={(e) => setBestaetigt(e.target.checked)}
          />
          {fehler && <ErrorState message={fehler} />}
          <Button
            type="submit"
            loading={laeuft}
            disabled={!uid || !grund.trim() || !rueckruf.trim() || !bestaetigt}
          >
            Startpasswort erzeugen
          </Button>
        </form>
      )}
    </div>
  );
}
