import type { Invoice, Wartung } from '@/types';
import { norm } from './assemble';
import type { InvoicePosition } from './totals';

/**
 * DER VEREINBARTE PREIS EINER WARTUNG AUF DIE RECHNUNG (Testbericht Runde 6, M9).
 *
 * Eine Wartung trägt ihren Preis je Wartung (netto, M39). Er stand nur in der
 * Wartungsliste: die Baustelle aus der Wartung kannte ihn nicht, und ohne
 * gebuchte Stunden kam statt einer Vorschau „Keine offenen Stunden und kein
 * offenes Material“. Verrechnet wurde die Wartung so gar nicht — oder nach
 * Stunden statt zur vereinbarten Pauschale.
 *
 * Jetzt schlägt die Vorschau für jede Wartung, deren Baustelle diese ist und
 * die einen Preis hat, die Zeile „Wartung … laut Vereinbarung“ vor. Ein
 * VORSCHLAG, übernommen auf Klick: ob neben der Pauschale noch Stunden oder
 * Material verrechnet werden, steht im Wartungsvertrag und nicht in dieser
 * App — beides von selbst einzusetzen, verrechnete doppelt.
 *
 * Steht die Wartung schon auf einer gültigen Rechnung dieser Baustelle, sagt
 * der Vorschlag, auf welcher — statt ein zweites Mal angeboten zu werden. Ein
 * Storno gibt sie wieder frei.
 *
 * SEIT M01e ÜBER DIE KENNUNG, NICHT ÜBER DEN TEXT. Eine übernommene Zeile
 * trägt die Kennung der Wartung bis zum Anlegen mit; die Rechnung führt sie
 * dann in `linkedWartungen`, und die Datenbank lässt je Durchgang nur eine
 * gültige Rechnung zu (`20261106300000_wartung_abdeckung.sql`). Vorher
 * erkannte die Vorschau „schon verrechnet“ am Zeilentext — nach dem
 * Umbenennen der Anlage oder einer umformulierten Zeile kam dieselbe Wartung
 * ein zweites Mal.
 */
export interface WartungVorschlag {
  /** Die Wartung — als Schlüssel für „übernommen“. */
  schluessel: string;
  label: string;
  preis: number;
  /**
   * Nummer der gültigen Rechnung, auf der die Wartung schon steht — die
   * jüngste, wenn jeder Durchgang dieser Baustelle verrechnet ist; sonst `null`.
   */
  schonAuf: string | null;
  /**
   * Der Tag der Ausführung auf dieser Baustelle — der Leistungstag, wenn die
   * Rechnung sonst keinen Zeitraum hat. `null`, solange nur eingeplant ist.
   */
  am: string | null;
}

export function wartungsZeile(w: Pick<Wartung, 'anlage'>): string {
  return `Wartung ${w.anlage.trim()} laut Vereinbarung`;
}

const gleich = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

const SCHLUESSEL = 'wartung:';

/** Die Kennung der Wartung hinter einem Vorschlag. */
export function wartungsKennung(v: Pick<WartungVorschlag, 'schluessel'>): string {
  return v.schluessel.slice(SCHLUESSEL.length);
}

type RechnungDerBaustelle = Pick<Invoice, 'invoiceNumber' | 'projectNumber' | 'paymentStatus' | 'positions'>
  & Partial<Pick<Invoice, 'invoiceDate' | 'linkedWartungen'>>;

export function wartungsVorschlaege(
  wartungen: Array<Pick<Wartung, 'anlage' | 'preis'> & {
    id: string;
    ausgefuehrtAm?: string | null;
    /**
     * Wie viele Durchgänge der Wartung diese Baustelle trägt: ihre
     * Ausführungen hier, und einer mehr, solange die Wartung hier eingeplant
     * ist (`wartungenDerBaustelle`). Ohne Angabe einer — so viele gültige
     * Rechnungen dürfen die Wartung tragen, wie die Datenbank auch zählt.
     */
    durchgaenge?: number;
  }>,
  rechnungenDerBaustelle: RechnungDerBaustelle[],
  projectNumber: string,
): WartungVorschlag[] {
  const pn = norm(projectNumber);
  const gueltige = rechnungenDerBaustelle.filter((r) => norm(r.projectNumber) === pn && r.paymentStatus !== 'Storniert');
  return wartungen
    // Ohne Preis — oder mit null — gibt es nichts vorzuschlagen; verrechnet wird dann nach Aufwand.
    .filter((w) => (w.preis ?? 0) > 0 && w.anlage?.trim())
    .map((w) => {
      const label = wartungsZeile(w);
      const treffer = gueltige.filter((r) =>
        (r.linkedWartungen ?? []).includes(w.id)
        /*
          RÜCKFALL FÜR ALTDATEN: Rechnungen von vor M01e tragen keine
          Wartungsabdeckung, und die Produktion wird nicht umgeschrieben. Für
          sie bleibt der Textabgleich, sonst käme eine dort längst
          verrechnete Wartung wieder als Vorschlag. Er gilt NUR für
          Rechnungen ganz ohne Wartungsabdeckung: wer eine trägt, ist nach
          der Kennung verrechnet, und ein gleichlautender Text daneben
          spricht nicht für eine andere Wartung.
        */
        || ((r.linkedWartungen ?? []).length === 0
          && (r.positions ?? []).some((p) => gleich(p.label ?? '', label))));
      const offen = treffer.length < Math.max(1, w.durchgaenge ?? 1);
      const zuletzt = [...treffer].sort((a, b) =>
        (b.invoiceDate ?? '').localeCompare(a.invoiceDate ?? '') || b.invoiceNumber.localeCompare(a.invoiceNumber))[0];
      return {
        schluessel: `${SCHLUESSEL}${w.id}`, label, preis: w.preis as number,
        schonAuf: offen ? null : zuletzt?.invoiceNumber ?? null, am: w.ausgefuehrtAm ?? null,
      };
    });
}

/**
 * Die Kennungen der Wartungen, deren Zeile in der Vorschau steht — für
 * `linkedWartungen`. Eine entfernte Zeile nimmt ihre Kennung mit; eine
 * umformulierte behält sie.
 */
export function wartungenDerPositionen(positionen: readonly InvoicePosition[]): string[] {
  return [...new Set(positionen.flatMap((p) => (p.wartungId ? [p.wartungId] : [])))];
}

/** Die Positionen, wie sie auf die Rechnung kommen — ohne die Kennung, die nur die Vorschau braucht. */
export function ohneWartungskennung(positionen: readonly InvoicePosition[]): Omit<InvoicePosition, 'wartungId'>[] {
  return positionen.map(({ wartungId: _weg, ...p }) => {
    void _weg;
    return p;
  });
}

/** Der Vorschlag als Rechnungszeile: eine Wartung, eine Pauschale. */
export function wartungAlsPosition(v: WartungVorschlag): InvoicePosition {
  return { label: v.label, qty: 1, unit: 'Pauschale', unitPrice: v.preis, netto: v.preis };
}

/** Die übernommene Zeile in der Vorschau: dieselbe, mit der Kennung der Wartung. */
export function wartungAlsVorschauzeile(v: WartungVorschlag): InvoicePosition {
  return { ...wartungAlsPosition(v), wartungId: wartungsKennung(v) };
}
