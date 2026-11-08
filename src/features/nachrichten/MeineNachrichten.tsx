import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { hatGespraeche, selbstexport } from '@/lib/db/nachrichten';
import { useModul } from '@/lib/useModule';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { exportDateiname } from './text';

/**
 * MEINE NACHRICHTEN EXPORTIEREN (M10/B09) — der Weg zum Inhalt der eigenen
 * Gespräche (Art. 15, 20 DSGVO), nur für sich selbst. Die Datenauskunft, die
 * die Führung für eine Person ausstellt, enthält davon bewusst nur Anzahl
 * und Zeitraum; hier bekommt die Person alles, was sie lesen darf.
 *
 * Steht, solange das Modul an ist — und danach, solange es Gespräche gibt:
 * ausgeschaltet bleiben sie hier exportierbar.
 */
export default function MeineNachrichten() {
  const { user } = useAuth();
  const toast = useToast();
  const an = useModul('nachrichten');
  const [vorhanden, setVorhanden] = useState<boolean | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!user || an) return;
    let weg = false;
    hatGespraeche(user.uid).then((ja) => { if (!weg) setVorhanden(ja); }).catch(() => { if (!weg) setVorhanden(false); });
    return () => { weg = true; };
  }, [user, an]);

  if (!user || (!an && !vorhanden)) return null;

  async function exportieren() {
    setLaeuft(true);
    setFehler(null);
    try {
      const daten = await selbstexport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = exportDateiname(user!.name ?? 'person', new Date());
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Deine Nachrichten sind heruntergeladen');
    } catch (e) {
      setFehler(grundAus(e, 'Die Nachrichten konnten nicht exportiert werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card
      title="Meine Nachrichten"
      hint="Alle Gespräche, die du lesen darfst, mit jeder Nachricht, die du darin siehst — als Datei nur für dich. Anhänge stehen mit Namen darin; die Dateien selbst öffnest du im Gespräch. Die Datenauskunft der Geschäftsführung enthält von deinen Nachrichten nur Anzahl und Zeitraum."
    >
      <Button variant="secondary" loading={laeuft} onClick={() => void exportieren()}>
        Meine Nachrichten exportieren
      </Button>
      {fehler && (
        <div className="mt-3">
          <ErrorState message={fehler} />
        </div>
      )}
    </Card>
  );
}
