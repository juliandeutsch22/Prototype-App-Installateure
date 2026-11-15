import { useEffect, useState } from 'react';
import type { AppUser } from '@/types';
import { zweiterFaktorVon, zweitenFaktorZuruecksetzen } from '@/lib/db/users';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { ZWEI_FAKTOR_ROLLEN } from '@/lib/auth/kern';

/**
 * DEN ZWEITEN FAKTOR EINES KOLLEGEN ZURÜCKSETZEN — im Zugang der Akte (K7,
 * Durchsicht 15.11.2026).
 *
 * Vorher ging das nur über den Notzugang des Senklot-Supports und nur für
 * Leitung und Buchhaltung. Wer nach einem Rollenwechsel Telefon und Codes
 * verlor, kam nicht mehr hinein. Jetzt tut es eine zweite Leitung, wie beim
 * Startpasswort: mit Grund, der im Verlauf der Akte steht; die Person wird
 * überall abgemeldet. Das eigene Konto nicht — dafür gibt es die
 * Wiederherstellungscodes oder eine zweite Leitung.
 *
 * Der Knopf erscheint nur, wo es einen Faktor gibt. Was erlaubt ist, prüft
 * die Datenbank noch einmal; ihre Absage steht dann so da, wie sie kommt.
 */
export default function ZweiterFaktorZuruecksetzen({
  person, eigenesKonto, onZurueckgesetzt,
}: {
  person: AppUser;
  eigenesKonto: boolean;
  onZurueckgesetzt: () => void;
}) {
  const toast = useToast();
  const [hat, setHat] = useState(false);
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (eigenesKonto) return undefined;
    let weg = false;
    zweiterFaktorVon(person.uid)
      .then((ja) => { if (!weg) setHat(ja); })
      // Ohne Antwort kein Knopf: lieber keiner als einer, der ins Leere geht.
      .catch(() => { if (!weg) setHat(false); });
    return () => {
      weg = true;
    };
  }, [person.uid, eigenesKonto]);

  if (eigenesKonto || !hat) return null;

  const pflicht = ZWEI_FAKTOR_ROLLEN.includes(person.role);

  function schliessen() {
    setOffen(false);
    setGrund('');
    setFehler(null);
  }

  async function zuruecksetzen(): Promise<void> {
    if (!grund.trim()) {
      setFehler('Bitte einen Grund angeben — er steht im Verlauf.');
      return;
    }
    setLaeuft(true);
    setFehler(null);
    try {
      await zweitenFaktorZuruecksetzen(person.uid, grund.trim());
      schliessen();
      setHat(false);
      toast.success(`Zweiter Faktor von ${person.name} zurückgesetzt`);
      onZurueckgesetzt();
    } catch (err) {
      setFehler(grundAus(err, 'Der zweite Faktor ließ sich nicht zurücksetzen.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-3">
      {!offen ? (
        <Button variant="ghost" onClick={() => setOffen(true)}>
          Zweiten Faktor zurücksetzen …
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Für den Fall, dass {person.name} Telefon und Wiederherstellungscodes nicht mehr hat. Die
            Authenticator-App und die offenen Codes gelten danach nicht mehr, und {person.name} wird
            überall abgemeldet.{' '}
            {pflicht
              ? 'Beim nächsten Anmelden richtet sie oder er einen neuen zweiten Faktor ein.'
              : 'Danach geht die Anmeldung wieder mit dem Passwort allein.'}{' '}
            Der Grund steht im Verlauf dieser Akte.
          </p>
          <InputField
            id="zf-zuruecksetzen-grund" label="Grund" pflicht
            value={grund} onChange={(e) => setGrund(e.target.value)}
          />
          {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
          <div className="flex flex-wrap gap-3">
            <Button loading={laeuft} onClick={() => void zuruecksetzen()}>Zurücksetzen</Button>
            <Button variant="ghost" onClick={schliessen} disabled={laeuft}>Abbrechen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
