import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { kanalBaustelle, kanalDirekt, kanalRunde } from '@/lib/db/nachrichten';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { useToast } from '@/components/Toast';
import BaustellenWahl from './BaustellenWahl';
import PersonWahl, { type Person } from './PersonWahl';

type Schritt = 'zu' | 'personen' | 'runde' | 'baustelle' | null;

/**
 * NEUE NACHRICHT — an eine Person (das Direktgespräch der beiden, das es
 * nur einmal gibt), an mehrere (eine Runde, der Name ist freiwillig) oder in
 * den Thread einer Baustelle. Ohne eingeschaltete Direktnachrichten geht es
 * gleich zur Baustelle.
 */
export default function NeueNachricht({
  open,
  onClose,
  direktAn,
  personen,
}: {
  open: boolean;
  onClose: () => void;
  direktAn: boolean;
  /** Die aktiven Konten des Betriebs ohne einen selbst. */
  personen: Person[];
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [gewaehlt, setGewaehlt] = useState<Person[]>([]);
  const [name, setName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [innen, setInnen] = useState<Schritt>(null);

  if (!user) return null;
  const schritt: Schritt = !open ? null : innen ?? (direktAn ? 'zu' : 'baustelle');

  function schliessen() {
    setInnen(null);
    setGewaehlt([]);
    setName('');
    setFehler(null);
    onClose();
  }

  async function oeffnen(kanal: () => Promise<string>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const k = await kanal();
      schliessen();
      navigate(`/nachrichten/${k}`);
    } catch (e) {
      // Als Meldung: die Wahl einer Person oder Baustelle hat kein eigenes Fehlerfeld.
      const grund = grundAus(e, 'Das Gespräch konnte nicht geöffnet werden.');
      setFehler(grund);
      toast.error(grund);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <BottomSheet open={schritt === 'zu' || schritt === 'runde'} onClose={schliessen} label="Neue Nachricht" titel="Neue Nachricht">
        {schritt === 'zu' && (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => setInnen('personen')}>An eine oder mehrere Personen …</Button>
            <Button variant="secondary" onClick={() => setInnen('baustelle')}>In den Thread einer Baustelle …</Button>
            <p className="text-sm text-ink-muted">
              Eine Person: ein Gespräch zu zweit. Mehrere: eine Runde. Beides lesen nur die Teilnehmer.
              Den Thread einer Baustelle lesen alle, die die Baustelle sehen.
            </p>
            {fehler && <ErrorState message={fehler} />}
          </div>
        )}
        {schritt === 'runde' && (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); void oeffnen(() => kanalRunde(name, gewaehlt.map((p) => p.uid))); }}
          >
            <p className="text-sm">Mit {gewaehlt.map((p) => p.name).join(', ')}.</p>
            <InputField id="runde-name" label="Name der Runde (freiwillig)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="etwa „Bad Huber“" />
            {fehler && <ErrorState message={fehler} />}
            <div className="fuss-aktionen">
              <Button type="button" variant="ghost" onClick={() => setInnen('personen')}>Zurück</Button>
              <Button type="submit" loading={laeuft}>Runde beginnen</Button>
            </div>
          </form>
        )}
      </BottomSheet>

      <PersonWahl
        open={schritt === 'personen'}
        titel="An wen?"
        personen={personen}
        mehrere
        bestaetigen="Weiter"
        onClose={schliessen}
        onWahl={(liste) => {
          if (liste.length === 1) {
            setInnen('zu');
            void oeffnen(() => kanalDirekt(liste[0].uid));
            return;
          }
          setGewaehlt(liste);
          setInnen('runde');
        }}
      />

      <BaustellenWahl
        open={schritt === 'baustelle'}
        titel="Welche Baustelle?"
        companyId={user.companyId}
        uid={user.uid}
        rolle={user.role}
        onClose={schliessen}
        onWahl={(p) => void oeffnen(() => kanalBaustelle(p.id))}
      />
    </>
  );
}
