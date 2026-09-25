import { useEffect, useId, useState, type ReactNode } from 'react';
import Button from './Button';
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
  children,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmTone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** Zusätzliche Eingaben, z. B. ein Grund für die Aktion. */
  children?: ReactNode;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
    >
      <div
        className="panel w-full max-w-sm p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
        {children && <div className="mt-4">{children}</div>}
        {error && (
          <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
            Abbrechen
          </Button>
          <Button variant={confirmTone} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
