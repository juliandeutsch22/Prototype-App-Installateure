import Button from '@/components/Button';
import type { Variant } from '@/components/knopf';
import { useGespraechOeffnen } from './useGespraechOeffnen';

/**
 * „Nachricht schreiben“ an einer Person (M10/B09): öffnet das Gespräch der
 * beiden — das es zwischen zwei Personen nur einmal gibt. Die Akte, an der
 * der Knopf steht, sieht vom Inhalt nichts.
 */
export default function NachrichtSchreiben({ an, variant = 'secondary' }: { an: string; variant?: Variant }) {
  const { oeffnen, laeuft } = useGespraechOeffnen(an);
  return (
    <Button variant={variant} loading={laeuft} onClick={oeffnen}>
      Nachricht schreiben
    </Button>
  );
}
