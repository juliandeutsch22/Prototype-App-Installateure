import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { bereichVon } from '@/app/navigation';
import { zugriffMelden } from '@/lib/db/support';
import { ErrorState, LoadingState } from '@/components/States';

/**
 * JEDER BEREICH, DEN DER SUPPORT ÖFFNET, STEHT IM PROTOKOLL — BEVOR ER LÄDT
 * (offene Punkte B4).
 *
 * Seit der Support in der echten App arbeitet (#136), meldete sie nur noch
 * den Beginn („Betrieb"). Die Übersicht „was in einem Zugang angesehen
 * wurde" zeigte damit immer dasselbe, und `docs/DEPLOYMENT.md` versprach
 * mehr, als geschah.
 *
 * GEMELDET WIRD BEIM WECHSEL DES BEREICHS, nicht bei jedem Klick darin: wer
 * in den Rechnungen drei Rechnungen öffnet, war einmal in den Rechnungen.
 * Scheitert die Meldung, erscheint der Bereich nicht — dieselbe Regel wie
 * beim Beginn. Dass überhaupt nur nach einem Eintrag gelesen wird, erzwingt
 * die Datenbank; die Bereiche danach meldet die App.
 */
export default function EinblickProtokoll({ children }: { children: ReactNode }) {
  const { einblick } = useAuth();
  const { pathname } = useLocation();
  const bereich = einblick ? bereichVon(pathname) : null;
  const schluessel = einblick && bereich ? `${einblick.id}|${bereich}` : null;

  const [gemeldet, setGemeldet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    if (!einblick || !bereich || !schluessel || schluessel === gemeldet) return;
    let weg = false;
    setFehler(null);
    zugriffMelden(einblick.company_id, einblick.id, bereich).then(
      () => {
        if (!weg) setGemeldet(schluessel);
      },
      (e: unknown) => {
        if (!weg) setFehler(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      weg = true;
    };
    // `gemeldet` fehlt mit Absicht: nach der Meldung soll nichts erneut laufen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, versuch]);

  if (!einblick) return <>{children}</>;
  if (fehler) {
    return (
      <ErrorState
        message={`Der Zugriff auf „${bereich}" liess sich nicht protokollieren, deshalb bleibt er zu. ${fehler}`}
        onRetry={() => setVersuch((v) => v + 1)}
      />
    );
  }
  if (gemeldet !== schluessel) return <LoadingState label="Zugriff wird protokolliert …" />;
  return <>{children}</>;
}
