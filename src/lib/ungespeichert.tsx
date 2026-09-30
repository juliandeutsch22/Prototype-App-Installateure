import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * WARNUNG BEI UNGESPEICHERTEN ÄNDERUNGEN (Testbericht 30.09.2026, M1).
 *
 * Wer in einer Akte etwas ändert und wegnavigiert, verlor es bisher still.
 * Jetzt fragt die App — in der App über einen eigenen Dialog, beim Schließen
 * oder Neuladen des Tabs über die Rückfrage des Browsers (deren Text legt
 * der Browser fest).
 *
 * WARUM ÜBER DEN KLICK UND NICHT ÜBER DEN ROUTER: die App läuft mit
 * `BrowserRouter`; dessen Sperre (`useBlocker`) gibt es nur mit einem
 * Daten-Router. Abgefangen werden deshalb Klicks auf interne Links — Menü,
 * Reiter, Rücksprünge. Was die Akte selbst auslöst (Löschen, Speichern und
 * weiter), ist eine bewusste Handlung und wird nicht gefragt. Die
 * Zurück-Taste des Browsers lässt sich so nicht aufhalten; das ist benannt.
 */
export function useUngespeichertWarnung(aktiv: boolean): ReactNode {
  const navigate = useNavigate();
  const [ziel, setZiel] = useState<string | null>(null);

  useEffect(() => {
    if (!aktiv) return;
    const vorEntladen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Ältere Browser brauchen den Rückgabewert.
      e.returnValue = '';
    };
    const vorKlick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const pfad = url.pathname + url.search + url.hash;
      if (pfad === window.location.pathname + window.location.search + window.location.hash) return;
      e.preventDefault();
      e.stopPropagation();
      setZiel(pfad);
    };
    window.addEventListener('beforeunload', vorEntladen);
    document.addEventListener('click', vorKlick, true);
    return () => {
      window.removeEventListener('beforeunload', vorEntladen);
      document.removeEventListener('click', vorKlick, true);
    };
  }, [aktiv]);

  return (
    <ConfirmDialog
      open={ziel !== null}
      title="Ungespeicherte Änderungen verwerfen?"
      confirmLabel="Verwerfen und weiter"
      onCancel={() => setZiel(null)}
      onConfirm={() => {
        const wohin = ziel;
        setZiel(null);
        if (wohin) navigate(wohin);
      }}
    >
      <p className="text-sm">
        Hier gibt es Änderungen, die noch nicht gespeichert sind. Wer jetzt weitergeht, verliert sie.
      </p>
    </ConfirmDialog>
  );
}
