import { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { FormGrid, InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthContext';
import { listEntriesForProjectsInRange } from '@/lib/db/timeEntries';
import { localDateStr } from '@/lib/time';
import { nachweisDateiname, nachweisZeilen } from './baustellenNachweis';

/**
 * „Stundennachweis“ aus der Baustellen- oder Kundenakte (F12): Zeitraum
 * wählen, PDF entsteht. Vorbelegt ist der laufende Monat — der Zeitraum, den
 * ein Regiekunde meist bestätigt haben will.
 */
export default function StundennachweisDialog({
  offen,
  onClose,
  nummern,
  bezug,
  angaben,
  dateiBezug,
}: {
  offen: boolean;
  onClose: () => void;
  /** Die Baustellen, deren Stunden auf das Blatt kommen. */
  nummern: string[];
  /** Erste Kopfangabe des Blatts, z. B. ['Baustelle:', 'PR-2026-014 · Huber']. */
  bezug: [string, string];
  angaben?: [string, string][];
  /** Was im Dateinamen steht (Nummer oder Kundenname). */
  dateiBezug: string;
}) {
  const { user, company } = useAuth();
  const toast = useToast();
  const jetzt = new Date();
  const [von, setVon] = useState(() => localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1)));
  const [bis, setBis] = useState(() => localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 0)));
  const ungueltig = !von || !bis || von > bis;

  async function erzeugen() {
    if (!user || !company) throw new Error('Die Firmendaten sind noch nicht geladen — bitte gleich noch einmal versuchen.');
    if (ungueltig) throw new Error('Bitte einen gültigen Zeitraum wählen (Von ≤ Bis).');
    const zeilen = nachweisZeilen(await listEntriesForProjectsInRange(user.companyId, nummern, von, bis), nummern);
    // Geworfen, damit der Dialog offen bleibt und es selbst sagt.
    if (zeilen.length === 0) throw new Error('Im gewählten Zeitraum ist hier keine Arbeitszeit gebucht.');
    const { generateBaustellenNachweisPdf } = await import('./baustellenNachweisPdf');
    generateBaustellenNachweisPdf({ company, bezug, angaben, zeilen, mitBaustelle: nummern.length > 1, von, bis })
      .save(nachweisDateiname(dateiBezug, von, bis));
    toast.success('Stundennachweis erstellt');
    onClose();
  }

  return (
    <ConfirmDialog
      open={offen}
      title="Stundennachweis"
      message={`Für den Kunden: nur die Arbeitszeit auf ${nummern.length > 1 ? 'den Baustellen dieses Kunden' : 'dieser Baustelle'}, alle Personen — ohne Abwesenheiten und andere Aufträge.`}
      confirmLabel="PDF erstellen"
      confirmTone="primary"
      gesperrt={ungueltig}
      onConfirm={erzeugen}
      onCancel={onClose}
    >
      <FormGrid>
        <InputField id="nachweis-von" label="Von" type="date" value={von} onChange={(e) => setVon(e.target.value)} />
        <InputField id="nachweis-bis" label="Bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
      </FormGrid>
      {ungueltig && (
        <p className="mt-2 text-sm text-ink" role="alert">Bitte einen gültigen Zeitraum wählen (Von ≤ Bis).</p>
      )}
    </ConfirmDialog>
  );
}
