import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { bankgarantieSetzen } from '@/lib/db/invoices';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';
import { euro } from '@/lib/betrag';
import type { Invoice } from '@/types';
import { offenerRuecklass } from './zahlstand';

/**
 * DER RÜCKLASS, ABGELÖST DURCH BANKGARANTIE (seit 10.10.2026).
 *
 * Der Betrieb übergibt dem Kunden eine Garantie seiner Bank, der Kunde zahlt
 * den Rücklass dafür sofort aus. Für Senklot heisst das: der Rücklass ist ab
 * dem Tag der Ablöse fällig (Mahnlauf, Startseite, offene Posten), und Bank,
 * Nummer und Ablauf der Garantie stehen an der Rechnung — damit die Urkunde
 * nach der Gewährleistung wieder auffindbar ist. Die ausgestellte Rechnung
 * bleibt, wie sie ist.
 *
 * Ohne Datum wird eine erfasste Ablöse zurückgenommen.
 */
export default function BankgarantieDialog({
  inv,
  onClose,
}: {
  inv: (Invoice & { id: string }) | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [am, setAm] = useState('');
  const [bank, setBank] = useState('');
  const [nummer, setNummer] = useState('');
  const [bis, setBis] = useState('');

  useEffect(() => {
    if (!inv) return;
    setAm(inv.ruecklassGarantieAm ?? todayStr());
    setBank(inv.ruecklassGarantieBank ?? '');
    setNummer(inv.ruecklassGarantieNr ?? '');
    setBis(inv.ruecklassGarantieBis ?? inv.ruecklassBis ?? '');
  }, [inv]);

  const zuruecknehmen = !!inv?.ruecklassGarantieAm && !am;

  return (
    <ConfirmDialog
      open={!!inv}
      title={inv ? `Bankgarantie — ${inv.invoiceNumber}` : 'Bankgarantie'}
      message={
        inv
          ? `${inv.ruecklassArt === 'deckung' ? 'Deckungsrücklass' : 'Haftrücklass'} ${euro(inv.ruecklassBetrag ?? 0)}` +
            `, vereinbart fällig am ${datumAT(inv.ruecklassBis ?? '')}` +
            (offenerRuecklass(inv) > 0 ? `, offen ${euro(offenerRuecklass(inv))}.` : '.') +
            ' Mit der Ablöse wird er am angegebenen Tag fällig.'
          : undefined
      }
      confirmLabel={zuruecknehmen ? 'Ablöse zurücknehmen' : 'Speichern'}
      confirmTone="primary"
      onCancel={onClose}
      onConfirm={async () => {
        if (!inv) return;
        // Die Meldung zeigt der Dialog selbst (`ConfirmDialog`), er bleibt dann offen.
        if (!am && !inv.ruecklassGarantieAm) throw new Error('Bitte den Tag der Ablöse angeben.');
        if (am && bis && bis < am) {
          throw new Error('Die Garantie läuft vor dem Tag der Ablöse ab — bitte die Daten prüfen.');
        }
        await bankgarantieSetzen(inv.id, am ? { am, bank, nummer, bis: bis || null } : null);
        toast.success(am ? 'Bankgarantie gespeichert' : 'Ablöse zurückgenommen');
        onClose();
      }}
    >
      <div className="space-y-3">
        <InputField id="garantie-am" label="Abgelöst am" type="date" value={am} onChange={(e) => setAm(e.target.value)} />
        <InputField id="garantie-bank" label="Bank" value={bank} onChange={(e) => setBank(e.target.value)} />
        <InputField id="garantie-nr" label="Garantienummer" value={nummer} onChange={(e) => setNummer(e.target.value)} />
        <InputField id="garantie-bis" label="Garantie gültig bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
        {inv?.ruecklassGarantieAm && (
          <p className="text-sm text-ink-muted">Ohne Datum „Abgelöst am“ wird die Ablöse zurückgenommen.</p>
        )}
      </div>
    </ConfirmDialog>
  );
}
