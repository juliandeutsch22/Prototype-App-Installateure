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

/** Eine gespeicherte Mahnung, wie die Detailansicht sie nennt. */
export interface MahnungZeile {
  id: string;
  titel: string;
  datum: string;
  frist: string;
  /** Wer gemahnt hat — fehlt bei Mahnungen von vor dem 24.10.2026. */
  von?: string | null;
}

/** Eine Handlung an der Rechnung — wie früher ein Eintrag im ⋯ der Zeile. */
export interface RechnungAktion {
  label: string;
  onSelect: () => void;
  /** Unumkehrbar (Storno) — umrandet in Rot, wie im Menü vorher rot gesetzt. */
  danger?: boolean;
  /** Der häufigste nächste Schritt — der eine gefüllte Knopf. */
  haupt?: boolean;
}

/**
 * DIE RECHNUNG IN DER APP LESEN (Testbericht 30.09.2026, M19).
 *
 * Bisher war eine Rechnung nur als PDF einzusehen — für die Frage „was stand
 * drauf, was ist bezahlt“ musste jedes Mal eine Datei her. Hier steht, was
 * die Rechnung festhält: Kopf, Positionen, Summen, Zahlstand, Mahnungen,
 * Storno. Gerechnet wird nichts neu; es ist der gespeicherte Beleg.
 *
 * SEIT DER LINIE „LOT“ STEHEN HIER AUCH DIE HANDLUNGEN, die vorher im ⋯ der
 * Zeile lagen (Regel 3): die Zeile öffnet dieses Seitenfenster, und wer eine
 * Zahlung erfasst oder mahnt, sieht dabei Betrag, Rest und Mahnstand. Der
 * Weg ist gleich lang wie vorher — ein Tipp auf die Zeile statt auf das ⋯.
 * Die Handlungen stehen oben, vor den Einzelheiten: wer zum Zahlen kommt,
 * soll nicht erst über die Positionen rollen.
 */
/** Die laufende Nummer einer Position — Titel- und Textzeilen zählen nicht mit, wie auf dem PDF. */
function positionsNummer(positionen: { art?: string }[], index: number): number {
  return positionen.slice(0, index + 1).filter((p) => p.art !== 'titel' && p.art !== 'text').length;
}

export default function RechnungDetail({
  inv,
  onClose,
  aktionen,
  mahnungen = [],
  onMahnungLaden,
}: {
  inv: Invoice | null;
  onClose: () => void;
  aktionen: RechnungAktion[];
  /** Die gespeicherten Mahnungen dieser Rechnung (seit 10.10.2026), älteste zuerst. */
  mahnungen?: MahnungZeile[];
  /** Das Schreiben einer Mahnung erneut als PDF — so, wie es hinausging. */
  onMahnungLaden?: (id: string) => void;
}) {
  if (!inv) return null;
  const stand = zahlstand(inv);
  const name = `${ARTNAME[inv.art ?? 'einzel'] ?? 'Rechnung'} ${inv.invoiceNumber}`;
  const zeile = (wort: string, wert: React.ReactNode) =>
    wert ? (
      <div className="rechnung-detail-zeile">
        {/* Die Bezeichnung bricht nicht: am Handy stand sonst „Gemahn|t“. */}
        <dt className="shrink-0 text-ink-muted">{wort}</dt>
        <dd className="text-right text-ink">{wert}</dd>
      </div>
    ) : null;

  return (
    <BottomSheet open auchBreit breit onClose={onClose} label={name} titel={ARTNAME[inv.art ?? 'einzel'] ?? 'Rechnung'} stempel={inv.invoiceNumber}>
      <div className="rechnung-leseansicht text-sm">
        <p className="text-ink-muted">
          {inv.customerName}{inv.customerVatId ? ` · UID ${inv.customerVatId}` : ''}
        </p>

        {aktionen.length > 0 && (
          <div className="rechnung-detail-aktionen">
            {aktionen.map((a) => (
              <Button
                key={a.label}
                variant={a.haupt ? 'primary' : a.danger ? 'danger' : 'secondary'}
                onClick={a.onSelect}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}

        <section className="rechnung-lesegruppe" aria-label="Rechnungsangaben">
          <h3 className="rechnung-lesetitel">Rechnungsangaben</h3>
          <dl className="divide-y divide-line">
            {zeile('Rechnungsdatum', datumAT(inv.invoiceDate))}
            {zeile('Fällig', datumAT(inv.dueDate))}
            {zeile('Baustelle', inv.projectNumber)}
            {zeile('Leistungszeitraum', inv.leistungVon && inv.leistungBis
              ? `${datumAT(inv.leistungVon)} – ${datumAT(inv.leistungBis)}` : null)}
            {zeile('Leistungsort', inv.leistungsort)}
            {zeile('Bestellnummer des Kunden', inv.bestellnummer)}
          </dl>
        </section>

        {inv.positions && inv.positions.length > 0 && (
          <section className="rechnung-lesegruppe" aria-label="Leistungen">
            <h3 className="rechnung-lesetitel">Leistungen</h3>
            {/*
              DIE ZAHLEN BRECHEN NICHT UND KLEBEN NICHT (Testbericht Runde 6,
              G1). Die Lesegruppe bricht Zellen „anywhere“, damit lange
              Bezeichnungen das Seitenfenster nicht sprengen — der Kopf
              „Menge“ brach dadurch zu „Meng/e“, und ohne Abstand las sich die
              Zeile „1 Stk7 500,50“. Köpfe und Zahlen bleiben ganz und halten
              Abstand zur Spalte davor.
            */}
            {/* Als Stückliste (Planlinie B6): Kopf zwischen zwei Linien, Pos-Nummer, Zahlen in Mono. */}
            <table className="tabelle tabelle-eng rechnung-stueckliste">
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th scope="col">Bezeichnung</th>
                  <th scope="col" className="r">Menge</th>
                  <th scope="col" className="r">Netto</th>
                </tr>
              </thead>
              <tbody>
                {inv.positions.map((p, i) =>
                  // Titel und Text ohne Beträge, wie auf dem PDF (M18).
                  p.art === 'titel' || p.art === 'text' ? (
                    <tr key={i}>
                      <td className="pos" />
                      <td colSpan={3} className={p.art === 'titel' ? 'font-semibold' : 'text-ink-muted'}>{p.label}</td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td className="pos">{String(positionsNummer(inv.positions ?? [], i)).padStart(2, '0')}</td>
                      <td>
                        {p.label}
                        {positionsRabattText(p.rabattProzent) && (
                          <span className="block text-xs text-ink-muted">{positionsRabattText(p.rabattProzent)}</span>
                        )}
                      </td>
                      <td className="r whitespace-nowrap">
                        {String(p.qty).replace('.', ',')} {p.unit}
                      </td>
                      <td className="r whitespace-nowrap">{euroBetrag(p.netto)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </section>
        )}

        <section className="rechnung-lesegruppe" aria-label="Belegsumme">
          <h3 className="rechnung-lesetitel">Belegsumme</h3>
          <dl className="divide-y divide-line">
            {/* Gegliedert wie Vorschau und PDF — mit Abzug der Anzahlung (N2). */}
            {detailSummen(inv).map((z, i) => (
              <div key={i} className={z.abzug ? 'rechnung-detail-abzug' : 'rechnung-detail-zeile'}>
                <dt className={z.abzug ? '' : 'text-ink-muted'}>{z.wort}</dt>
                <dd className="whitespace-nowrap text-right text-ink">
                  {z.betont ? <b>{euro(z.betrag)}</b> : z.abzug ? `−${euro(z.betrag)}` : euro(z.betrag)}
                </dd>
              </div>
            ))}
            {zeile(
              inv.ruecklassArt === 'deckung' ? 'Deckungsrücklass' : 'Haftrücklass',
              inv.ruecklassBetrag != null && inv.ruecklassBis
                ? `${euro(inv.ruecklassBetrag)} (${(inv.ruecklassProzent ?? 0).toLocaleString('de-AT', { maximumFractionDigits: 2 })} %), fällig am ${datumAT(inv.ruecklassBis)}`
                : null,
            )}
            {zeile('Bankgarantie', inv.ruecklassGarantieAm
              ? [
                  `Rücklass abgelöst am ${datumAT(inv.ruecklassGarantieAm)}`,
                  inv.ruecklassGarantieBank,
                  inv.ruecklassGarantieNr ? `Nr. ${inv.ruecklassGarantieNr}` : null,
                  inv.ruecklassGarantieBis ? `gültig bis ${datumAT(inv.ruecklassGarantieBis)}` : null,
                ].filter(Boolean).join(' · ')
              : null)}
          </dl>
        </section>

        <section className="rechnung-lesegruppe" aria-label="Zahlstand">
          <h3 className="rechnung-lesetitel">Zahlstand</h3>
          <dl className="divide-y divide-line">
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
        </section>

        {/*
          JEDE MAHNUNG ERNEUT LADEN — die ganze Zeile ist der Knopf. Mahnungen
          von vor dem 10.10.2026 stehen hier nicht: von ihnen ist nur die
          letzte Stufe gespeichert (Zeile „Gemahnt“ oben), kein Schreiben.
        */}
        {onMahnungLaden && mahnungen.length > 0 && (
          <section className="rechnung-lesegruppe" aria-label="Mahnungen">
            <h3 className="rechnung-lesetitel">Mahnungen</h3>
            <ul className="divide-y divide-line">
              {mahnungen.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="rechnung-detail-zeile w-full text-left"
                    onClick={() => onMahnungLaden(m.id)}
                    aria-label={`${m.titel} vom ${datumAT(m.datum)} als PDF laden`}
                  >
                    <span className="text-ink">
                      {m.titel} vom {datumAT(m.datum)}
                      <span className="block text-xs text-ink-muted">
                        Frist bis {datumAT(m.frist)}{m.von ? ` · gemahnt von ${m.von}` : ''}
                      </span>
                    </span>
                    <span className="link shrink-0 self-center">PDF</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}
