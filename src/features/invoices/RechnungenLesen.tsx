import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { subscribeRecentInvoices } from '@/lib/db/invoices';
import type { WithId } from '@/lib/db/core';
import type { Invoice } from '@/types';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { ListRow } from '@/components/ListRow';
import StatusBadge from '@/components/StatusBadge';
import { InputField } from '@/components/Field';
import { Segmente } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { euro } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';
import { BEREICHE, imArbeitsstand, rechnungsGruppen, RechnungsGruppe, type Bereich } from './RechnungsListe';

/**
 * DIE RECHNUNGEN DER EIGENEN BAUSTELLEN, NUR LESEN (Testbericht 30.09.2026,
 * M38; entschieden am 30.09.).
 *
 * Für die Projektleitung mit der Freigabe „Rechnungen lesen“. Welche Zeilen
 * ankommen, entscheidet die Datenbank: nur Rechnungen von Baustellen, in
 * deren Leitung die Person steht. Hier gibt es nichts anzulegen, zu ändern
 * oder zu mahnen — das bleibt bei Buchhaltung und Leitung.
 *
 * SEIT DER LINIE „LOT“ wie jede Liste (Protokoll E6): zuerst der
 * Arbeitsstand, „Erledigt“ und „Alle“ als Segmente, eine Suche, Gruppen
 * höchstens zwanzig Zeilen. Auswahl und Suche filtern nur, was schon geladen
 * ist — gelesen wird dieselbe Abfrage wie bisher. Die Zeilen öffnen nichts:
 * eine Ansicht der ganzen Rechnung hatte die Projektleitung hier nie.
 */
export default function RechnungenLesen() {
  const { user } = useAuth();
  const [zeilen, setZeilen] = useState<WithId<Invoice>[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  // Die Ansicht steht in der Adresse wie bei der Rechnungsverwaltung (Regel 5).
  const [parameter, setParameter] = useSearchParams();
  const ansicht = parameter.get('ansicht');
  const bereich: Bereich = BEREICHE.some((b) => b.wert === ansicht) ? (ansicht as Bereich) : 'offen';

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

  const gezeigt = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (zeilen ?? []).filter(
      (r) =>
        (bereich === 'alle' || (bereich === 'offen') === imArbeitsstand(r))
        && (!q || [r.invoiceNumber, r.customerName, r.projectNumber].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [zeilen, bereich, suche]);

  const zeile = (r: WithId<Invoice>) => {
    const offen = Math.max(0, (r.totalBrutto ?? 0) - (r.bezahltBetrag ?? 0));
    return (
      <ListRow
        key={r.id}
        title={`${r.invoiceNumber} · ${r.customerName}`}
        subtitle={`${datumAT(r.invoiceDate)} · Baustelle ${r.projectNumber}${
          offen > 0 && r.paymentStatus !== 'Storniert' ? ` · offen ${euro(offen)}` : ''}`}
        zustand={<StatusBadge status={r.paymentStatus} />}
        wert={euro(r.totalBrutto ?? 0)}
      />
    );
  };

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        ort="Geld"
        title="Rechnungen"
        subtitle="Die Rechnungen deiner Baustellen — nur lesen."
      />
      <Card buendig>
        <div className="rechnungen-filter">
          <Segmente
            name="Rechnungen zeigen"
            werte={BEREICHE}
            wert={bereich}
            onChange={(w) => {
              const neu = new URLSearchParams(parameter);
              neu.set('ansicht', w);
              setParameter(neu, { replace: true });
            }}
          />
          <InputField
            id="rechnungen-lesen-suche"
            label="Suche"
            type="search"
            placeholder="Rechnungsnummer, Kunde oder Baustelle"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
        {fehler ? (
          <ErrorState message={fehler} />
        ) : zeilen === null ? (
          <div className="px-4 pb-4">
            <SkeletonList />
          </div>
        ) : zeilen.length === 0 ? (
          <EmptyState>Zu deinen Baustellen gibt es noch keine Rechnung.</EmptyState>
        ) : gezeigt.length === 0 ? (
          <EmptyState>
            {suche.trim() ? `Keine Rechnung passt zu „${suche.trim()}“.` : 'Keine Rechnung in dieser Auswahl.'}
          </EmptyState>
        ) : (
          rechnungsGruppen(gezeigt, bereich === 'offen', todayStr()).map((g) => (
            <RechnungsGruppe key={`${bereich}-${g.schluessel}`} titel={g.titel} rechnungen={g.rechnungen} zeile={zeile} />
          ))
        )}
      </Card>
    </div>
  );
}
