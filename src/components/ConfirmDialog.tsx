import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Button from './Button';
import Hinweiszeile from './Hinweiszeile';
import { istOben, useFokusFalle } from './fokusFalle';
import { useHintergrundSperre } from './hintergrundSperre';
import { ImFenster } from './imFenster';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * Modaler Bestätigungsdialog für nicht-triviale/destruktive Aktionen
 * (z. B. Löschen). Schließt mit Escape, Fokus liegt auf der Abbrechen-Aktion.
 *
 * `onConfirm` darf asynchron sein: der Dialog wartet darauf, zeigt solange
 * einen Ladezustand und BLEIBT bei einem Fehler offen samt Meldung. Vorher
 * war der Rückgabewert `void` — eine fehlgeschlagene Löschung oder ein
 * misslungener Storno verschwand kommentarlos, und der Nutzer klickte erneut.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Löschen',
  /**
   * Rot ist die Ausnahme, nicht die Regel. Eine Bestellung abzuschließen ist
   * ein normaler Arbeitsschritt — steht dort ein roter Knopf, gewöhnt sich
   * der Nutzer an Rot und übersieht es beim echten Löschen.
   */
  confirmTone = 'danger',
  onConfirm,
  onCancel,
  nurSchliessen = false,
  children,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmTone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /**
   * Ein Dialog, der nur etwas zeigt (etwa das Bewegungsprotokoll): ein
   * einziger Knopf „Schließen“. Mit „Abbrechen“ daneben fragte man sich, was
   * es abzubrechen gäbe (Runde 3, G20). Er ruft `onCancel`.
   */
  nurSchliessen?: boolean;
  /** Zusätzliche Eingaben, z. B. ein Grund für die Aktion. */
  children?: ReactNode;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  // Tab bleibt im Dialog (Prüflauf 25.09.2026, P4-05). Den Fokus setzt
  // weiterhin `autoFocus` auf „Abbrechen".
  useFokusFalle(dialog, open);
  // Die Seite dahinter steht still, solange die Rückfrage offen ist.
  useHintergrundSperre(open);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  /*
    WÄHREND DIE AKTION LÄUFT, SCHLIESST NICHTS. Escape und ein Tipp daneben
    riefen `onCancel` auch mitten im Löschen — der Dialog war weg, die Aktion
    lief weiter, und ihre Fehlermeldung hatte keinen Ort mehr (P4-05).
    „Abbrechen" ist in der Zeit ohnehin gesperrt.
  */
  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && istOben(dialog) && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(
        grundAus(e, 'Die Aktion konnte nicht ausgeführt werden.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={dialog}
      className="schleier-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="titel-karte">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
        {children && <div className="mt-4"><ImFenster>{children}</ImFenster></div>}
        {error && (
          <div className="mt-3">
            <Hinweiszeile stufe="fehl" role="alert">
              <p>{error}</p>
            </Hinweiszeile>
          </div>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {nurSchliessen ? (
            <Button variant="primary" onClick={onCancel} autoFocus>
              Schließen
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
                Abbrechen
              </Button>
              <Button variant={confirmTone} onClick={handleConfirm} loading={busy}>
                {confirmLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
