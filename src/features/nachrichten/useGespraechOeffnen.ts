import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { kanalDirekt } from '@/lib/db/nachrichten';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * Das Gespräch mit einer Person öffnen (M10/B09) — als Knopf
 * (`NachrichtSchreiben`) oder als Eintrag im ⋯ einer Akte (U1: am Handy
 * trägt eine Akte nur eine Hauptaktion).
 */
export function useGespraechOeffnen(an: string): { oeffnen: () => void; laeuft: boolean } {
  const navigate = useNavigate();
  const toast = useToast();
  const [laeuft, setLaeuft] = useState(false);
  const oeffnen = () => {
    setLaeuft(true);
    kanalDirekt(an)
      .then((k) => navigate(`/nachrichten/${k}`))
      .catch((e: unknown) => { toast.error(grundAus(e, 'Das Gespräch konnte nicht geöffnet werden.')); setLaeuft(false); });
  };
  return { oeffnen, laeuft };
}
