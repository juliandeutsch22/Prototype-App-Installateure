import BottomSheet from '@/components/BottomSheet';
import { positionsRabattText } from './totals';
import Button from '@/components/Button';
import { euro, euroBetrag } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';
import type { Invoice } from '@/types';
import { zahlstand } from './zahlstand';
import { detailSummen } from './detailSummen';

const ARTNAME: Record<string, string> = {
  einzel: 'Rechnung',
  anzahlung: 'Anzahlungsrechnung',
  teil: 'Teilrechnung',
  schluss: 'Schlussrechnung',
};

/**
 * DIE RECHNUNG IN DER APP LESEN (Testbericht 30.09.2026, M19).
 *
 * Bisher war eine Rechnung nur als PDF einzusehen — für die Frage „was stand
 * drauf, was ist bezahlt“ musste jedes Mal eine Datei her. Hier steht, was
 * die Rechnung festhält: Kopf, Positionen, Summen, Zahlstand, Mahnungen,
 * Storno. Gerechnet wird nichts neu; es ist der gespeicherte Beleg.
 */
export default function RechnungDetail({
  inv,
  onClose,
  onPdf,
}: {
  inv: Invoice | null;
  onClose: () => void;
  onPdf: (inv: Invoice) => void;
}) {
  if (!inv) return null;
  const stand = zahlstand(inv);
  const zeile = (wort: string, wert: React.ReactNode) =>
    wert ? (
      <div className="flex justify-between gap-3 py-1">
        <dt className="text-ink-muted">{wort}</dt>
        <dd className="text-right text-ink">{wert}</dd>
      </div>
    ) : null;

  return (
    <BottomSheet open auchBreit onClose={onClose} label={`${ARTNAME[inv.art ?? 'einzel'] ?? 'Rechnung'} ${inv.invoiceNumber}`}>
      <div className="space-y-4 px-4 pb-4 text-sm">
        <div>
          <p className="text-base font-semibold text-ink-deep">
            {ARTNAME[inv.art ?? 'einzel'] ?? 'Rechnung'} {inv.invoiceNumber}
          </p>
          <p className="text-ink-muted">{inv.customerName}{inv.customerVatId ? ` · UID ${inv.customerVatId}` : ''}</p>
        </div>

        <dl className="divide-y divide-line">
          {zeile('Rechnungsdatum', datumAT(inv.invoiceDate))}
          {zeile('Fällig', datumAT(inv.dueDate))}
          {zeile('Baustelle', inv.projectNumber)}
          {zeile('Leistungszeitraum', inv.leistungVon && inv.leistungBis
            ? `${datumAT(inv.leistungVon)} – ${datumAT(inv.leistungBis)}` : null)}
          {zeile('Leistungsort', inv.leistungsort)}
          {zeile('Bestellnummer des Kunden', inv.bestellnummer)}
        </dl>

        {inv.positions && inv.positions.length > 0 && (
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-ink-muted">
                <th className="py-1 font-medium">Bezeichnung</th>
                <th className="py-1 text-right font-medium">Menge</th>
                <th className="py-1 text-right font-medium">Netto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inv.positions.map((p, i) =>
                // Titel und Text ohne Beträge, wie auf dem PDF (M18).
                p.art === 'titel' || p.art === 'text' ? (
                  <tr key={i}>
                    <td colSpan={3} className={`py-1 pr-2 ${p.art === 'titel' ? 'font-semibold' : 'text-ink-muted'}`}>{p.label}</td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      {p.label}
                      {positionsRabattText(p.rabattProzent) && (
                        <span className="block text-xs text-ink-muted">{positionsRabattText(p.rabattProzent)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1 text-right">
                      {String(p.qty).replace('.', ',')} {p.unit}
                    </td>
                    <td className="whitespace-nowrap py-1 text-right">{euroBetrag(p.netto)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}

        <dl className="divide-y divide-line">
          {/* Gegliedert wie Vorschau und PDF — mit Abzug der Anzahlung (N2). */}
          {detailSummen(inv).map((z, i) => (
            <div key={i} className={`flex justify-between gap-3 py-1 ${z.abzug ? 'text-danger' : ''}`}>
              <dt className={z.abzug ? '' : 'text-ink-muted'}>{z.wort}</dt>
              <dd className="whitespace-nowrap text-right text-ink">
                {z.betont ? <b>{euro(z.betrag)}</b> : z.abzug ? `−${euro(z.betrag)}` : euro(z.betrag)}
              </dd>
            </div>
          ))}
          {zeile('Bezahlt', stand.bezahlt > 0 ? euro(stand.bezahlt) : null)}
          {zeile('Offen', inv.paymentStatus !== 'Storniert' ? euro(stand.rest) : null)}
          {zeile('Guthaben des Kunden', stand.guthaben > 0 ? euro(stand.guthaben) : null)}
          {zeile('Stand', inv.paymentStatus)}
          {zeile('Gemahnt', inv.mahnstufe
            ? `Stufe ${inv.mahnstufe}${inv.gemahntAm ? ` am ${datumAT(inv.gemahntAm)}` : ''}${inv.mahnfrist ? `, Frist bis ${datumAT(inv.mahnfrist)}` : ''}`
            : null)}
          {zeile('Storno', inv.cancellationNote)}
          {zeile('Stornorechnung', inv.stornoNummer)}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onPdf(inv)}>PDF laden</Button>
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
