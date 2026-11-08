import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { baustelleStand, kanalBaustelle } from '@/lib/db/nachrichten';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { TeilFehler } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import { zeitText } from './text';

/**
 * DER THREAD IN DER AKTE (M10/B09): wie viele Nachrichten, wann die letzte,
 * die eigene Zahl — und ein Knopf in den Thread. Angelegt wird er erst beim
 * Öffnen; eine Baustelle ohne Nachrichten hat keinen leeren Thread.
 */
export default function BaustelleNachrichten({ projektId }: { projektId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [stand, setStand] = useState<Awaited<ReturnType<typeof baustelleStand>> | null>(null);
  const [fehler, setFehler] = useState(false);
  const [oeffnet, setOeffnet] = useState(false);

  useEffect(() => {
    let weg = false;
    const laden = () => baustelleStand(projektId)
      .then((s) => { if (!weg) { setStand(s); setFehler(false); } })
      .catch(() => { if (!weg) setFehler(true); });
    void laden();
    window.addEventListener(NACHRICHTEN_NEU, laden);
    return () => { weg = true; window.removeEventListener(NACHRICHTEN_NEU, laden); };
  }, [projektId]);

  async function oeffnen() {
    setOeffnet(true);
    try {
      const k = stand?.kanal ?? await kanalBaustelle(projektId);
      navigate(`/nachrichten/${k}`);
    } catch (e) {
      toast.error(grundAus(e, 'Der Thread konnte nicht geöffnet werden.'));
      setOeffnet(false);
    }
  }

  return (
    <Card title="Nachrichten" id="b-nachrichten">
      {fehler ? <TeilFehler was="die Nachrichten" /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {stand === null ? 'Wird geladen …'
              : stand.anzahl === 0 ? 'Noch keine Nachricht zu dieser Baustelle.'
              : <>
                  {stand.anzahl === 1 ? '1 Nachricht' : `${stand.anzahl} Nachrichten`}
                  {stand.zuletzt && <>, zuletzt <span className="font-mono">{zeitText(stand.zuletzt)}</span></>}
                  {stand.ungelesen > 0 && <> · <span className="text-ink">{stand.ungelesen} neu</span></>}
                </>}
          </p>
          <Button variant="secondary" loading={oeffnet} onClick={() => void oeffnen()}>
            {stand?.anzahl ? 'Thread öffnen' : 'Nachricht schreiben'}
          </Button>
        </div>
      )}
    </Card>
  );
}
