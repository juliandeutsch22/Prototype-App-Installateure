import BottomSheet from '@/components/BottomSheet';
import { positionsRabattText } from './totals';
import Button from '@/components/Button';
import { euro, euroBetrag } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';
import type { Invoice } from '@/types';
import { zahlstand } from './zahlstand';
import { detailSummen } from './detailSummen';
import StatusBadge from '@/components/StatusBadge';

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
  verlauf,
}: {
  inv: Invoice | null;
  onClose: () => void;
  aktionen: RechnungAktion[];
  /** Die gespeicherten Mahnungen dieser Rechnung (seit 10.10.2026), älteste zuerst. */
  mahnungen?: MahnungZeile[];
  /** Das Schreiben einer Mahnung erneut als PDF — so, wie es hinausging. */
  onMahnungLaden?: (id: string) => void;
  /**
   * Der Änderungsverlauf der Rechnung samt Zahlungen und Mahnungen (M01b),
   * zugeklappt am Ende. Von außen, weil nur der Aufrufer weiß, ob die Rolle
   * ihn lesen darf und für welchen Betrieb.
   */
  verlauf?: React.ReactNode;
}) {
  if (!inv) return null;
  const stand = zahlstand(inv);
  const name = `${ARTNAME[inv.art ?? 'einzel'] ?? 'Rechnung'} ${inv.invoiceNumber}`;
  /** `gemessen`: Betrag, Datum oder Nummer — in Plex Mono, tabellarisch (V10). Sätze bleiben in der Textschrift. */
  const zeile = (wort: string, wert: React.ReactNode, gemessen = false) =>
    wert ? (
      <div className="rechnung-detail-zeile">
        {/* Die Bezeichnung bricht nicht: am Handy stand sonst „Gemahn|t“. */}
        <dt className="shrink-0 text-ink-muted">{wort}</dt>
        <dd className={gemessen ? 'rechnung-detail-wert' : 'text-right text-ink'}>{wert}</dd>
      </div>
    ) : null;
  const betrag = detailSummen(inv).find((z) => z.betont);

  return (
    <BottomSheet open auchBreit breit onClose={onClose} label={name} titel={ARTNAME[inv.art ?? 'einzel'] ?? 'Rechnung'} stempel={inv.invoiceNumber}>
      <div className="rechnung-leseansicht text-sm">
        <p className="text-ink-muted">
          {inv.customerName}{inv.customerVatId ? ` · UID ${inv.customerVatId}` : ''}
        </p>

        {/*
          DER STAND AM BELEG (V10, 13.11.2026; Auftrag 11.5): Betrag, was davon
          offen ist und bis wann, und wo die Rechnung steht — oben, direkt über
          den Handlungen, statt erst unter Positionen und Summen. Gerechnet
          wird nichts neu: dieselben Werte wie „Belegsumme“ und „Zahlstand“.
        */}
        <dl className="rechnung-stand" aria-label="Stand der Rechnung">
          {betrag && (
            <div className="rechnung-stand-punkt">
              {/* Ein eigenes Wort, nicht „Brutto“: dieselbe Zeile steht unter „Belegsumme“ und hieße sonst zweimal gleich. */}
              <dt className="rechnung-stand-name">{(inv.vorrechnungen ?? []).length > 0 ? 'Restforderung' : 'Betrag'}</dt>
              <dd className="rechnung-stand-betrag">{euro(betrag.betrag)}</dd>
            </div>
          )}
          {inv.paymentStatus !== 'Storniert' && (
            <div className="rechnung-stand-punkt">
              <dt className="rechnung-stand-name">Offen</dt>
              <dd className="rechnung-stand-betrag">{euro(stand.rest)}</dd>
              {stand.rest > 0 && inv.dueDate && <dd className="rechnung-stand-zusatz">fällig {datumAT(inv.dueDate)}</dd>}
            </div>
          )}
          {/* Der Zustand mit seinem Zeichen — „Überfällig“ ohne rote Fläche, als Wort und Symbol. */}
          <div className="rechnung-stand-punkt">
            <dt className="rechnung-stand-name">Stand</dt>
            <dd className="rechnung-stand-zustand"><StatusBadge status={inv.paymentStatus} /></dd>
          </div>
        </dl>

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
            {zeile('Rechnungsdatum', datumAT(inv.invoiceDate), true)}
            {zeile('Fällig', datumAT(inv.dueDate), true)}
            {zeile('Baustelle', inv.projectNumber, true)}
            {zeile('Leistungszeitraum', inv.leistungVon && inv.leistungBis
              ? `${datumAT(inv.leistungVon)} – ${datumAT(inv.leistungBis)}` : null, true)}
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
              ABSTAND AUS DER TABELLENREGEL (14.11.2026). Der Abstand stand als
              `pl-3` an den Zellen und wirkte nie: `.tabelle-eng td` ist
              spezifischer und setzte 5 px. Mit den Mono-Ziffern von V10 las
              sich „1 pausch 18 420,50“ wie eine Zahl. Jetzt setzen
              `stueck-menge` (12 px) und `stueck-betrag` (eine Zelle, 24 px)
              den Abstand in lot-rechnungen.css.
            */}
            {/* Als Stückliste (Planlinie B6): Kopf zwischen zwei Linien, Pos-Nummer, Zahlen in Mono. */}
            <table className="tabelle tabelle-eng rechnung-stueckliste">
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th scope="col">Bezeichnung</th>
                  <th scope="col" className="r whitespace-nowrap stueck-menge">Menge</th>
                  <th scope="col" className="r whitespace-nowrap stueck-betrag">Netto</th>
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
                      <td className="r whitespace-nowrap stueck-menge">
                        {String(p.qty).replace('.', ',')} {p.unit}
                      </td>
                      <td className="r whitespace-nowrap stueck-betrag">{euroBetrag(p.netto)}</td>
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
            {/*
              DER BETRAG BRICHT NICHT UND SCHRUMPFT NICHT (`shrink-0`): die
              Lesegruppe erlaubt jedem `dd` das Schrumpfen, damit lange Werte
              umbrechen — ein Betrag ohne Umbruch lief dann über den Rand,
              sobald das Wort daneben lang war.
            */}
            {detailSummen(inv).map((z, i) => (
              <div key={i} className={z.abzug ? 'rechnung-detail-abzug' : 'rechnung-detail-zeile'}>
                <dt className={z.abzug ? '' : 'text-ink-muted'}>
                  {z.wort}
                  {z.zusatz && <span className="rechnung-detail-zusatz">{z.zusatz}</span>}
                </dt>
                <dd className="rechnung-detail-betrag">
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
            {zeile('Bezahlt', stand.bezahlt > 0 ? euro(stand.bezahlt) : null, true)}
            {zeile('Offen', inv.paymentStatus !== 'Storniert' ? euro(stand.rest) : null, true)}
            {zeile('Guthaben des Kunden', stand.guthaben > 0 ? euro(stand.guthaben) : null, true)}
            {/* Begleichen die Mahnung, nicht die Rechnung (09.11.2026) — darum neben „Bezahlt“, nicht darin. */}
            {zeile('Mahnspesen und Zinsen bezahlt', (inv.mahnkostenBetrag ?? 0) > 0 ? euro(inv.mahnkostenBetrag!) : null, true)}
            {zeile('Stand', inv.paymentStatus)}
            {zeile('Gemahnt', inv.mahnstufe
              ? `Stufe ${inv.mahnstufe}${inv.gemahntAm ? ` am ${datumAT(inv.gemahntAm)}` : ''}${inv.mahnfrist ? `, Frist bis ${datumAT(inv.mahnfrist)}` : ''}`
              : null)}
            {zeile('Storno', inv.cancellationNote)}
            {zeile('Stornorechnung', inv.stornoNummer, true)}
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

        {verlauf}
      </div>
    </BottomSheet>
  );
}
