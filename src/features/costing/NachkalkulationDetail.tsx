import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import BottomSheet from '@/components/BottomSheet';
import { Zustand } from '@/components/Badge';
import { Masslinie } from '@/components/Planlinie';
import { euro } from '@/lib/betrag';
import { fmtStd } from '@/lib/time';
import { margenTon } from './nachkalkulation';
import { fmtProzent, lueckenKurz, zeichenVon } from './nachkalkulationText';
import type { NachkalkulationZeile } from './nachkalkulationLaden';

/** Eine Zeile der Aufstellung: Wort, Betrag, darunter woher er kommt. */
function Posten({ wort, betrag, woher, summe = false }: { wort: string; betrag: ReactNode; woher?: ReactNode; summe?: boolean }) {
  return (
    <div className={summe ? 'nachkalk-posten nachkalk-posten-summe' : 'nachkalk-posten'}>
      <dt>{wort}</dt>
      <dd className="nachkalk-betrag">{betrag}</dd>
      {woher && <dd className="nachkalk-woher">{woher}</dd>}
    </div>
  );
}

/**
 * Woher das Material kommt, in Worten. Das Lager steht ausdrücklich da
 * (Befund 09.11.2026): wer Kosten sieht, die auf keinem Schein stehen, soll
 * wissen, dass sie aus den Ausgaben des Lagers kommen.
 */
const MATERIAL_HERKUNFT: Record<NonNullable<NachkalkulationZeile['materialQuelle']>, string> = {
  Scheine: 'aus den unterschriebenen Handwerksscheinen, zum Einkaufspreis',
  'Scheine und Lager': 'aus den unterschriebenen Handwerksscheinen und dem, was das Lager darüber hinaus ausgegeben hat, zum Einkaufspreis',
  Lager: 'aus dem, was das Lager für die Baustelle ausgegeben hat, zum Einkaufspreis — auf keinem Schein steht Material',
  Angebot: 'aus dem angenommenen Angebot — auf keinem Schein steht Material',
};

/**
 * DIE BAUSTELLE IM SEITENFENSTER (Auftrag 04.11.2026: „viel Text, sehr
 * unübersichtlich … eventuell mit einer Detailansicht, sodass nicht alles in
 * den kleinen Feldern stehen muss“).
 *
 * Die Zeile sagt nur noch, wie es steht: Kosten gegen Erlös, Deckungsbeitrag,
 * Marge, und ob Artikel ohne Einkaufspreis fehlen. Hier steht die Rechnung
 * dahinter — Erlös, Personal nach Facharbeit, Helfer und Lehrling, Material
 * und woher es kommt, der Deckungsbeitrag —, dazu die Artikel ohne
 * Einkaufspreis beim Namen und der Weg in die Akte der Baustelle. Gerechnet
 * wird hier nichts Neues: dieselben Zahlen wie in der Zeile, aufgeschlüsselt.
 */
export default function NachkalkulationDetail({
  k,
  laufend,
  katalogWeg,
  onClose,
}: {
  k: NachkalkulationZeile | null;
  /** Die Baustelle läuft noch: ein Zwischenstand, kein Ergebnis. */
  laufend: boolean;
  /** Wohin, um Einkaufspreise zu pflegen — nur, wer den Katalog öffnen darf. */
  katalogWeg?: string;
  onClose: () => void;
}) {
  if (!k) return null;
  const kosten = k.personalkosten + k.materialkosten;
  const stunden = [
    k.fachStunden > 0 || (k.helferStunden === 0 && k.lehrlingStunden === 0)
      ? `${fmtStd(k.fachStunden * 60)} h Facharbeit${k.personalJe.fach > 0 ? ` (${euro(k.personalJe.fach)})` : ''}` : null,
    k.helferStunden > 0 ? `${fmtStd(k.helferStunden * 60)} h Helfer (${euro(k.personalJe.helfer)})` : null,
    k.lehrlingStunden > 0 ? `${fmtStd(k.lehrlingStunden * 60)} h Lehrling (${euro(k.personalJe.lehrling)})` : null,
  ].filter(Boolean).join(' · ');
  return (
    <BottomSheet
      open
      auchBreit
      breit
      onClose={onClose}
      label={`Nachkalkulation ${k.projectNumber}`}
      titel={k.customerName}
      stempel={k.projectNumber}
    >
      <div className="nachkalk-detail text-sm">
        <div className="nachkalk-kopf">
          <p className="nachkalk-db">
            {euro(k.deckungsbeitrag)}
            <small>Deckungsbeitrag</small>
          </p>
          <Zustand stand={zeichenVon(margenTon(k))}>
            {k.margeProzent === null ? 'keine Aussage' : `${fmtProzent(k.margeProzent)} vom Erlös`}
          </Zustand>
        </div>
        {laufend && <p className="text-warning">Zwischenstand — es kommen noch Stunden dazu.</p>}

        {k.erloes > 0 && (
          <Masslinie
            ist={kosten}
            soll={k.erloes}
            istText={`Kosten ${euro(kosten)}`}
            sollText={`Erlös ${euro(k.erloes)}`}
            ueberText={kosten > k.erloes ? `+${euro(kosten - k.erloes)}` : undefined}
            name={`Kosten ${euro(kosten)} von ${euro(k.erloes)} Erlös, Deckungsbeitrag ${euro(k.deckungsbeitrag)}`}
          />
        )}

        <section className="nachkalk-gruppe" aria-label="Aufstellung">
          <h3 className="nachkalk-titel">Aufstellung</h3>
          <dl>
            <Posten
              wort="Erlös"
              betrag={k.erloes > 0 ? euro(k.erloes) : '—'}
              woher={
                k.erloesQuelle === 'Rechnungen'
                  ? (k.rechnungen === 1 ? 'aus 1 Rechnung, netto' : `aus ${k.rechnungen} Rechnungen, netto`)
                  : k.erloesQuelle === 'Angebot'
                    ? 'aus dem angenommenen Angebot, netto — noch nicht verrechnet'
                    : 'kein Erlös hinterlegt — weder Rechnung noch angenommenes Angebot'
              }
            />
            <Posten wort="− Personal" betrag={euro(k.personalkosten)} woher={stunden} />
            {/*
              Material steht nur als Betrag da, wenn welches eingerechnet ist.
              Ein „0,00 €" läse sich wie „kein Material verbaut" und wäre bei
              fehlenden Einkaufspreisen genau die falsche Auskunft.
            */}
            <Posten
              wort="− Material"
              betrag={k.materialkosten > 0 ? euro(k.materialkosten) : '—'}
              woher={
                k.materialkosten > 0
                  ? MATERIAL_HERKUNFT[k.materialQuelle ?? 'Scheine']
                  : k.materialLuecken.length > 0
                    ? 'nichts eingerechnet — siehe unten'
                    : 'nichts eingerechnet'
              }
            />
            <Posten
              summe
              wort="Deckungsbeitrag"
              betrag={euro(k.deckungsbeitrag)}
              woher={k.margeProzent === null ? 'ohne Erlös keine Marge' : `${fmtProzent(k.margeProzent)} vom Erlös`}
            />
          </dl>
        </section>

        {k.materialLuecken.length > 0 && (
          <section className="nachkalk-gruppe" aria-label="Ohne Einkaufspreis">
            <h3 className="nachkalk-titel">{lueckenKurz(k.materialLuecken.length)}</h3>
            <p className="text-warning">
              Nicht eingerechnet, weil kein Einkaufspreis hinterlegt ist — der Deckungsbeitrag ist um ihren Einkaufswert zu hoch.
            </p>
            <ul className="nachkalk-luecken">
              {k.materialLuecken.map((name) => <li key={name}>{name}</li>)}
            </ul>
            {katalogWeg && (
              <Link to={katalogWeg} className="link-weiter inline-flex min-h-touch items-center">
                Einkaufspreise im Katalog hinterlegen
              </Link>
            )}
          </section>
        )}

        <p className="text-ink-muted">
          Deckungsbeitrag, nicht Gewinn: Gemeinkosten sind nicht abgezogen, soweit sie nicht im Stundenkostensatz stecken.
        </p>

        {k.projektId && (
          <div className="nachkalk-aktionen">
            <Link to={`/admin-projects/${k.projektId}`} className="link-weiter inline-flex min-h-touch items-center">
              Akte der Baustelle öffnen
            </Link>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
