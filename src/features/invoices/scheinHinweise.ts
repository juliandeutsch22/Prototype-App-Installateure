import type { Invoice, WorkSheet } from '@/types';
import type { Ausgabe } from './ausgegebenesMaterial';
import { normName } from './materialPositionen';

/**
 * Zwei Hinweise zur Rechnungsvorschau (24.10.2026) — dort, wo eine Rechnung
 * Material doppelt bringen oder auslassen kann und nur der Mensch weiß,
 * was stimmt.
 *
 * WARUM HINWEISE UND KEINE AUTOMATIK. Beide Fälle hängen an einem Schein,
 * der sich nach einer Rechnung ändert. Eine Regel, die still abzieht oder
 * ergänzt, kann genauso falsch liegen — und eine still gekürzte Rechnung
 * fällt niemandem auf. Gezeigt wird deshalb, was zusammengehört, zum
 * Zeitpunkt der Entscheidung.
 */

export interface NachgetragenerSchein {
  scheinId: string;
  datum: string;
  /** Die Rechnung, deren Zeitraum den Tag des Scheins schon abdeckt. */
  rechnung: string;
  /** Material des Scheins, das auf dieser Rechnung schon als Position steht. */
  artikel: string[];
}

/**
 * Scheine dieser Vorschau, deren Tag in einem schon abgerechneten Zeitraum
 * liegt und deren Material auf jener Rechnung schon steht — etwa, weil es
 * dort aus dem Lager übernommen wurde. Nur gültige Rechnungen, keine
 * Anzahlungen; der Zeitraum endet mit „Leistung bis“, ohne sie am
 * Rechnungsdatum.
 */
export function nachgetrageneScheine(
  scheine: Array<Pick<WorkSheet, 'datum' | 'material'> & { id: string }>,
  rechnungen: Array<Pick<Invoice, 'invoiceNumber' | 'invoiceDate' | 'leistungBis' | 'paymentStatus' | 'art' | 'positions'>>,
): NachgetragenerSchein[] {
  const gueltig = rechnungen.filter((r) => r.paymentStatus !== 'Storniert' && r.art !== 'anzahlung');
  const out: NachgetragenerSchein[] = [];
  for (const s of scheine) {
    const namen = (s.material ?? []).filter((z) => z.menge > 0 && normName(z.name));
    if (!s.datum || namen.length === 0) continue;
    for (const r of gueltig) {
      const ende = r.leistungBis || r.invoiceDate;
      if (!ende || s.datum > ende) continue;
      const aufRechnung = new Set((r.positions ?? []).map((p) => normName(p.label)));
      const artikel = [...new Set(namen.filter((z) => aufRechnung.has(normName(z.name))).map((z) => z.name.trim()))];
      if (artikel.length === 0) continue;
      out.push({ scheinId: s.id, datum: s.datum, rechnung: r.invoiceNumber, artikel });
      break;
    }
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

export interface OffenerEntwurf {
  scheinId: string;
  datum: string;
  /** Material des Entwurfs, das vom Ausgegebenen abgezogen ist. */
  artikel: string[];
}

/**
 * Entwürfe dieser Baustelle, deren Material das Ausgegebene mindert
 * (`materialOhneSchein` zieht es ab, weil es mit dem Schein kommt). Wird
 * ein solcher Entwurf nach der Rechnung verworfen, fehlt sein Material —
 * also vorher unterschreiben oder verwerfen.
 */
export function offeneEntwuerfe(
  scheine: Array<Pick<WorkSheet, 'status' | 'datum' | 'material'> & { id: string }>,
  ausgaben: Array<Pick<Ausgabe, 'name' | 'menge'>>,
  bis?: string,
): OffenerEntwurf[] {
  const ausgegeben = new Set(ausgaben.filter((a) => a.menge > 0).map((a) => normName(a.name)));
  const out: OffenerEntwurf[] = [];
  for (const s of scheine) {
    if (s.status !== 'Entwurf' || (bis && s.datum > bis)) continue;
    const artikel = [...new Set((s.material ?? [])
      .filter((z) => z.menge > 0 && ausgegeben.has(normName(z.name)))
      .map((z) => z.name.trim()))];
    if (artikel.length > 0) out.push({ scheinId: s.id, datum: s.datum, artikel });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}
