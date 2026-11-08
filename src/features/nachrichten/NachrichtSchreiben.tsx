import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { kanalDirekt } from '@/lib/db/nachrichten';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import type { Variant } from '@/components/knopf';

/**
 * „Nachricht schreiben“ an einer Person (M10/B09): öffnet das Gespräch der
 * beiden — das es zwischen zwei Personen nur einmal gibt. Die Akte, an der
 * der Knopf steht, sieht vom Inhalt nichts.
 */
export default function NachrichtSchreiben({ an, variant = 'secondary' }: { an: string; variant?: Variant }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [laeuft, setLaeuft] = useState(false);
  return (
    <Button
      variant={variant}
      loading={laeuft}
      onClick={() => {
        setLaeuft(true);
        kanalDirekt(an)
          .then((k) => navigate(`/nachrichten/${k}`))
          .catch((e: unknown) => { toast.error(grundAus(e, 'Das Gespräch konnte nicht geöffnet werden.')); setLaeuft(false); });
      }}
    >
      Nachricht schreiben
    </Button>
  );
}
