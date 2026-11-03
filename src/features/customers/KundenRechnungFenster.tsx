import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RechnungDetail, { type MahnungZeile, type RechnungAktion } from '@/features/invoices/RechnungDetail';
import { mahnungPdfLaden, rechnungPdfLaden, stornorechnungPdfLaden } from '@/features/invoices/belegeLaden';
import { TEXTE, type Mahnstufe } from '@/features/invoices/mahnung';
import { listMahnungenZurRechnung } from '@/lib/db/invoices';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import type { WithId } from '@/lib/db/core';
import type { Company, Invoice, Mahnung } from '@/types';

/**
 * DIE RECHNUNG IN DER KUNDENAKTE (Auftrag 03.11.2026: „die Rechnungen
 * sollten sich direkt in der Akte öffnen lassen … und nicht einfach zur
 * Rechnungsseite wechseln“).
 *
 * Dasselbe Seitenfenster wie auf der Rechnungsseite (`RechnungDetail`):
 * Angaben, Leistungen, Summen, Zahlstand und Mahnungen; die Rechnung, ihre
 * Mahnungen und eine ausgestellte Stornorechnung als PDF. Was Geld- oder
 * Belegstände schreibt — Zahlung, Mahnung, Storno, E-Rechnung, Bankgarantie —
 * bleibt bei den Rechnungen: dort führen Mahnlauf, Zahlungsabgleich und
 * Rechnungskreis es mit, und zwei Wege zu denselben Buchungen liefen
 * auseinander. „In Rechnungen bearbeiten“ öffnet dort genau dieses Fenster.
 */
export default function KundenRechnungFenster({
  inv,
  companyId,
  company,
  onClose,
}: {
  inv: WithId<Invoice> | null;
  companyId: string;
  company: Company | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [mahnungen, setMahnungen] = useState<{ fuer: string; liste: WithId<Mahnung>[] } | null>(null);

  // Die Mahnungen nur, wenn gemahnt ist — wie auf der Rechnungsseite.
  const id = inv?.id;
  const gemahnt = !!inv?.mahnstufe;
  useEffect(() => {
    if (!id || !gemahnt) {
      setMahnungen(null);
      return;
    }
    let weg = false;
    listMahnungenZurRechnung(companyId, id)
      .then((liste) => { if (!weg) setMahnungen({ fuer: id, liste }); })
      // Ohne Liste bleibt die Zeile „Gemahnt“ — die Rechnung selbst ist lesbar.
      .catch(() => { if (!weg) setMahnungen(null); });
    return () => { weg = true; };
  }, [companyId, id, gemahnt]);

  const laden = (was: () => Promise<void>, fehler: string) => () => {
    void was().catch((err: unknown) => toast.error(grundAus(err, fehler)));
  };

  // Die PDFs brauchen die Firmendaten; solange sie fehlen, bleibt der Weg zum Bearbeiten.
  const aktionen: RechnungAktion[] = inv ? [
    ...(company ? [{ label: 'PDF laden', onSelect: laden(() => rechnungPdfLaden(company, inv), 'Das PDF konnte nicht erzeugt werden.') }] : []),
    ...(company && inv.stornoNummer
      ? [{ label: 'Stornorechnung (PDF)', onSelect: laden(() => stornorechnungPdfLaden(company, inv), 'Die Stornorechnung konnte nicht geladen werden.') }]
      : []),
    {
      label: 'In Rechnungen bearbeiten',
      onSelect: () => navigate(`/invoices?suche=${encodeURIComponent(inv.invoiceNumber)}&oeffnen=${encodeURIComponent(inv.id)}`),
    },
  ] : [];

  const liste = inv && mahnungen?.fuer === inv.id ? mahnungen.liste : [];
  return (
    <RechnungDetail
      inv={inv}
      onClose={onClose}
      aktionen={aktionen}
      mahnungen={liste.map((m): MahnungZeile => ({
        id: m.id, titel: TEXTE[m.stufe as Mahnstufe]?.titel ?? 'Mahnung', datum: m.datum, frist: m.frist,
        von: m.gemahntVonName,
      }))}
      onMahnungLaden={company ? (mid) => {
        const m = liste.find((x) => x.id === mid);
        if (m) laden(() => mahnungPdfLaden(company, m), 'Die Mahnung konnte nicht geladen werden.')();
      } : undefined}
    />
  );
}
