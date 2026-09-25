import { useState, useEffect } from 'react';
import type { AppUser } from '@/types';
import Button from '@/components/Button';
import { InputField, FormGrid } from '@/components/Field';
import { localDateStr } from '@/lib/time';
import { grundAus } from '@/lib/fehlerGrund';

interface Props {
  user: AppUser;
  /** Vorbelegung: der aktuell gewählte Monat der Übersicht. */
  year: number;
  month: number;
  onClose: () => void;
  onExportPdf: (from: string, to: string) => Promise<void> | void;
  onExportProjectCsv: (from: string, to: string) => Promise<void> | void;
}

/**
 * Zeitraum-Auswahl für die Mitarbeiter-Exporte (Legacy:8195-8242). Der
 * Stundennachweis geht oft an Kunden oder die Lohnverrechnung und braucht
 * deshalb einen frei wählbaren Zeitraum statt nur den Monatsfilter.
 */
export default function ExportDialog({
  user,
  year,
  month,
  onClose,
  onExportPdf,
  onExportProjectCsv,
}: Props) {
  const [from, setFrom] = useState(() => localDateStr(new Date(year, month, 1)));
  const [to, setTo] = useState(() => localDateStr(new Date(year, month + 1, 0)));
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const invalid = !from || !to || from > to;

  async function run(kind: 'pdf' | 'csv') {
    if (invalid) {
      setMessage('Bitte einen gültigen Zeitraum wählen (Von ≤ Bis).');
      return;
    }
    setMessage(null);
    setBusy(kind);
    try {
      if (kind === 'pdf') await onExportPdf(from, to);
      else await onExportProjectCsv(from, to);
      onClose();
    } catch (e) {
      setMessage(grundAus(e, 'Der Export ist fehlgeschlagen.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
      onClick={onClose}
    >
      <div
        className="blatt"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="export-title" className="titel-karte">
          Bericht exportieren
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{user.name}</p>

        <div className="mt-4">
          <FormGrid>
            <InputField
              id="export-from"
              label="Von"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <InputField
              id="export-to"
              label="Bis"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </FormGrid>
          {invalid && (
            <p className="mt-2 text-sm font-medium text-danger" role="alert">
              Bitte einen gültigen Zeitraum wählen (Von ≤ Bis).
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            className="w-full justify-center"
            loading={busy === 'pdf'}
            disabled={invalid || busy !== null}
            onClick={() => void run('pdf')}
          >
            Stundennachweis (PDF)
          </Button>
          <Button
            className="w-full justify-center"
            loading={busy === 'csv'}
            disabled={invalid || busy !== null}
            onClick={() => void run('csv')}
          >
            Projektauswertung (CSV)
          </Button>
        </div>

        {message && (
          <p className="mt-3 text-center text-sm text-danger" role="alert">
            {message}
          </p>
        )}

        <Button variant="ghost" className="mt-3 w-full justify-center" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </div>
  );
}
