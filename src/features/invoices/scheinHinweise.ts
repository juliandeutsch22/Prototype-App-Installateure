import type { Invoice, WorkSheet } from '@/types';
import type { Ausgabe } from './ausgegebenesMaterial';
import { artikelZuordnung, normName } from './materialPositionen';

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
 *
 * Verglichen wird wie in `materialOhneSchein`: über die Katalogkennung, wo
 * beide Seiten eine tragen, sonst über den Namen.
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
      const kennungen = new Set((r.positions ?? []).map((p) => p.materialId).filter(Boolean));
      const artikel = [...new Set(namen
        .filter((z) => (z.materialId && kennungen.has(z.materialId)) || aufRechnung.has(normName(z.name)))
        .map((z) => z.name.trim()))];
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
  ausgaben: Array<Pick<Ausgabe, 'name' | 'menge'> & { materialId?: string | null }>,
  bis?: string,
): OffenerEntwurf[] {
  const ausgegeben = new Set(ausgaben.filter((a) => a.menge > 0).map((a) => normName(a.name)));
  const kennungen = new Set(ausgaben.filter((a) => a.menge > 0 && a.materialId).map((a) => a.materialId));
  const out: OffenerEntwurf[] = [];
  for (const s of scheine) {
    if (s.status !== 'Entwurf' || (bis && s.datum > bis)) continue;
    const artikel = [...new Set((s.material ?? [])
      .filter((z) => z.menge > 0
        && ((z.materialId && kennungen.has(z.materialId)) || ausgegeben.has(normName(z.name))))
      .map((z) => z.name.trim()))];
    if (artikel.length > 0) out.push({ scheinId: s.id, datum: s.datum, artikel });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

export interface SchonOhneSchein {
  scheinId: string;
  datum: string;
  /** Die frühere Rechnung, die den Artikel ohne Schein trägt. */
  rechnung: string;
  artikel: Array<{
    name: string;
    einheit: string;
    /** Was jene Rechnung davon trägt, ohne dass einer ihrer Scheine es bringt. */
    aufRechnung: number;
    /** Was dieser Schein davon bringt. */
    aufSchein: number;
  }>;
}

const menge = (x: number) => Math.round(x * 1000) / 1000;

/**
 * MATERIAL, DAS SCHON OHNE SCHEIN VERRECHNET IST (Testbericht Runde 6, M4).
 *
 * Eine Teilrechnung übernahm 6 Pressfittings aus dem Lager; die
 * Schlussrechnung brachte mit dem Schein vom 22.10. noch einmal 5 — ohne ein
 * Wort, weil der Schein NACH dem Zeitraum der Teilrechnung lag und
 * `nachgetrageneScheine` nur Scheine in einem schon abgerechneten Zeitraum
 * sieht. Gemeldet wird jetzt jeder Artikel eines Scheins dieser Rechnung, den
 * eine frühere gültige Rechnung der Baustelle (ohne Anzahlungen) über das
 * hinaus trägt, was ihre eigenen Scheine bringen — also aus dem Lager
 * übernommen oder von Hand eingesetzt —, gleich welcher Zeitraum.
 *
 * Abgezogen wird auch hier nichts: dieselbe Menge kann zu Recht zweimal
 * dastehen (der Rest der Rüstliste, später doch verbaut). Was schon
 * `nachgetrageneScheine` meldet (derselbe Schein, dieselbe Rechnung), steht
 * nicht zweimal da.
 */
export function schonOhneScheinVerrechnet(
  /** Die Scheine, deren Material auf dieser Rechnung steht. */
  scheine: Array<Pick<WorkSheet, 'datum' | 'material'> & { id: string }>,
  rechnungen: Array<Pick<Invoice, 'invoiceNumber' | 'paymentStatus' | 'art' | 'positions' | 'linkedWorkSheets'>>,
  /** Alle Scheine der Baustelle — für das, was die früheren Rechnungen mit ihren Scheinen trugen. */
  alleScheine: Array<Pick<WorkSheet, 'material'> & { id: string }>,
  schonGemeldet: Array<Pick<NachgetragenerSchein, 'scheinId' | 'rechnung'>> = [],
): SchonOhneSchein[] {
  const scheinNach = new Map(alleScheine.map((x) => [x.id, x]));
  const gemeldet = new Set(schonGemeldet.map((n) => `${n.scheinId}|${n.rechnung}`));
  const out: SchonOhneSchein[] = [];
  for (const r of rechnungen) {
    if (r.paymentStatus === 'Storniert' || r.art === 'anzahlung') continue;
    // Eine Zuordnung je Rechnung: Positionen, ihre Scheine und dieser Schein auf denselben Artikel.
    const artikel = artikelZuordnung();
    const ohneSchein = new Map<string, { menge: number; einheit: string }>();
    for (const p of r.positions ?? []) {
      if ((p.art ?? 'position') !== 'position' || !(p.qty > 0) || !normName(p.label)) continue;
      const k = artikel(p.label, p.materialId);
      const bisher = ohneSchein.get(k);
      ohneSchein.set(k, { menge: menge((bisher?.menge ?? 0) + p.qty), einheit: bisher?.einheit || p.unit || '' });
    }
    for (const id of r.linkedWorkSheets ?? []) {
      for (const z of scheinNach.get(id)?.material ?? []) {
        if (!(z.menge > 0) || !normName(z.name)) continue;
        const k = artikel(z.name, z.materialId);
        const bisher = ohneSchein.get(k);
        if (bisher) bisher.menge = menge(bisher.menge - z.menge);
      }
    }
    for (const s of scheine) {
      if (gemeldet.has(`${s.id}|${r.invoiceNumber}`)) continue;
      const treffer = new Map<string, SchonOhneSchein['artikel'][number]>();
      for (const z of s.material ?? []) {
        if (!(z.menge > 0) || !normName(z.name)) continue;
        const k = artikel(z.name, z.materialId);
        const dort = ohneSchein.get(k);
        if (!dort || dort.menge <= 0) continue;
        const bisher = treffer.get(k);
        if (bisher) bisher.aufSchein = menge(bisher.aufSchein + z.menge);
        else treffer.set(k, { name: z.name.trim(), einheit: z.einheit || dort.einheit, aufRechnung: dort.menge, aufSchein: z.menge });
      }
      if (treffer.size > 0) {
        out.push({ scheinId: s.id, datum: s.datum, rechnung: r.invoiceNumber, artikel: [...treffer.values()] });
      }
    }
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum) || a.rechnung.localeCompare(b.rechnung));
}
