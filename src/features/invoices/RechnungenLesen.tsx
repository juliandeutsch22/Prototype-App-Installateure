import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeRecentInvoices } from '@/lib/db/invoices';
import type { WithId } from '@/lib/db/core';
import type { Invoice } from '@/types';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { ListRow } from '@/components/ListRow';
import { Marke } from '@/components/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { euro } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';

/**
 * DIE RECHNUNGEN DER EIGENEN BAUSTELLEN, NUR LESEN (Testbericht 30.09.2026,
 * M38; entschieden am 30.09.).
 *
 * Für die Projektleitung mit der Freigabe „Rechnungen lesen“. Welche Zeilen
 * ankommen, entscheidet die Datenbank: nur Rechnungen von Baustellen, in
 * deren Leitung die Person steht. Hier gibt es nichts anzulegen, zu ändern
 * oder zu mahnen — das bleibt bei Buchhaltung und Leitung.
 */
export default function RechnungenLesen() {
  const { user } = useAuth();
  const [zeilen, setZeilen] = useState<WithId<Invoice>[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // An der Kennung des Betriebs, nicht am Objekt — sonst abonnierte jede neue Identität neu.
  const betrieb = user?.companyId;
  useEffect(() => {
    if (!betrieb) return;
    return subscribeRecentInvoices(
      betrieb,
      200,
      (r) => setZeilen(r),
      () => setFehler('Die Rechnungen konnten nicht geladen werden.'),
    );
  }, [betrieb]);

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Rechnungen"
        subtitle="Die Rechnungen deiner Baustellen — nur lesen."
      />
      <Card>
        {fehler ? (
          <ErrorState message={fehler} />
        ) : zeilen === null ? (
          <SkeletonList />
        ) : zeilen.length === 0 ? (
          <EmptyState>Zu deinen Baustellen gibt es noch keine Rechnung.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {zeilen.map((r) => {
              const offen = Math.max(0, (r.totalBrutto ?? 0) - (r.bezahltBetrag ?? 0));
              return (
                <li key={r.id}>
                  <ListRow
                    title={`${r.invoiceNumber} · ${r.customerName}`}
                    subtitle={`${datumAT(r.invoiceDate)} · Baustelle ${r.projectNumber}${
                      offen > 0 && r.paymentStatus !== 'Storniert' ? ` · offen ${euro(offen)}` : ''}`}
                    zustand={<Marke>{r.paymentStatus}</Marke>}
                    wert={euro(r.totalBrutto ?? 0)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
