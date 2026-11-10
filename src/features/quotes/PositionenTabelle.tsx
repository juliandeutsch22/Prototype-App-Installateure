import { discountLabel, positionsRabattText, titelSummen } from '@/features/invoices/totals';
import { euro } from '@/lib/betrag';
import type { Quote } from '@/types';

const fmtMenge = (n: number) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(n);

/**
 * DIE POSITIONEN ALS STÜCKLISTE (Planlinie B6): Kopf zwischen zwei Linien,
 * die laufende Nummer vorn, Beträge in Mono rechtsbündig, die Summe unter
 * einer Doppellinie. Gezählt werden nur Positionen — Titel und Text tragen
 * keine Nummer, so wie sie auch keinen Betrag tragen (M18). Die Nummer ist
 * die Reihenfolge auf dem Angebot, keine gespeicherte Angabe.
 *
 * EINE TABELLE FÜR BÜRO UND KUNDE (M02a): die Angebotsseite und die Seite
 * des Annahme-Links zeigen dasselbe Angebot gleich — sonst sähe der Kunde
 * etwas anderes als das Büro, das ihm den Link geschickt hat.
 */
export default function PositionenTabelle({ q }: { q: Pick<Quote, 'positions' | 'discount' | 'discountAmount' | 'subtotalNetto' | 'totalNetto' | 'vatRate' | 'totalVat' | 'totalBrutto'> }) {
  const titel = titelSummen(q.positions);
  const posNummer = new Map<number, string>();
  q.positions.forEach((p, i) => {
    if ((p.art ?? 'position') === 'position') posNummer.set(i, String(posNummer.size + 1).padStart(2, '0'));
  });
  return (
    <div className="overflow-x-auto">
      {/* `positionen-tabelle`: am Handy steht der Betrag unter der Bezeichnung (lot-akten.css, E72). */}
      <table className="tabelle stueckliste positionen-tabelle">
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Bezeichnung</th>
            <th scope="col" className="r">Netto</th>
          </tr>
        </thead>
        <tbody>
          {q.positions.map((p, i) =>
            // Titel mit der Summe seiner Positionen, Text ohne Beträge (M18).
            p.art === 'titel' ? (
              <tr key={i} className="stueckliste-titel">
                <td className="pos" />
                <td>{p.label}</td>
                <td className="r">{titel.has(i) && <>Summe {euro(titel.get(i)!)}</>}</td>
              </tr>
            ) : p.art === 'text' ? (
              <tr key={i}>
                <td className="pos" />
                <td colSpan={2} className="positionen-text whitespace-pre-line text-ink-muted">{p.label}</td>
              </tr>
            ) : (
              <tr key={i}>
                <td className="pos">{posNummer.get(i)}</td>
                <td>
                  {p.label}
                  <span className="stueckliste-menge">
                    {fmtMenge(p.qty)} {p.unit} × {euro(p.unitPrice)}
                    {positionsRabattText(p.rabattProzent) ? `, ${positionsRabattText(p.rabattProzent)}` : ''}
                  </span>
                </td>
                <td className="r">{euro(p.netto)}</td>
              </tr>
            ),
          )}
        </tbody>
        <tfoot>
          {(q.discountAmount ?? 0) > 0 && q.discount && (
            <>
              <Summe wort="Zwischensumme">{euro(q.subtotalNetto)}</Summe>
              <Summe wort={discountLabel(q.discount)}>- {euro(q.discountAmount ?? 0)}</Summe>
            </>
          )}
          <Summe wort="Netto">{euro(q.totalNetto)}</Summe>
          <Summe wort={`USt. ${Math.round(q.vatRate * 100)}%`}>{euro(q.totalVat)}</Summe>
          <Summe wort="Brutto" fett>{euro(q.totalBrutto)}</Summe>
        </tfoot>
      </table>
    </div>
  );
}

/** Eine Zeile unter den Positionen; die Bruttosumme steht als `summe` unter der Doppellinie. */
function Summe({ wort, fett, children }: { wort: string; fett?: boolean; children: React.ReactNode }) {
  return (
    <tr className={fett ? 'summe' : 'stueckliste-zwischen'}>
      <td className="pos" />
      <td>{wort}</td>
      <td className="r">{children}</td>
    </tr>
  );
}
