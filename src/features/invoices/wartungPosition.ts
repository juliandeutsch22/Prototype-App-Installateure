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
 * Steht die Zeile schon auf einer gültigen Rechnung dieser Baustelle, sagt der
 * Vorschlag, auf welcher — statt ein zweites Mal angeboten zu werden. Ein
 * Storno gibt sie wieder frei.
 */
export interface WartungVorschlag {
  /** Die Wartung — als Schlüssel für „übernommen“. */
  schluessel: string;
  label: string;
  preis: number;
  /** Nummer der gültigen Rechnung, auf der die Zeile schon steht. */
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

export function wartungsVorschlaege(
  wartungen: Array<Pick<Wartung, 'anlage' | 'preis'> & { id: string; ausgefuehrtAm?: string | null }>,
  rechnungenDerBaustelle: Array<Pick<Invoice, 'invoiceNumber' | 'projectNumber' | 'paymentStatus' | 'positions'>>,
  projectNumber: string,
): WartungVorschlag[] {
  const pn = norm(projectNumber);
  const gueltige = rechnungenDerBaustelle.filter((r) => norm(r.projectNumber) === pn && r.paymentStatus !== 'Storniert');
  return wartungen
    // Ohne Preis — oder mit null — gibt es nichts vorzuschlagen; verrechnet wird dann nach Aufwand.
    .filter((w) => (w.preis ?? 0) > 0 && w.anlage?.trim())
    .map((w) => {
      const label = wartungsZeile(w);
      const treffer = gueltige.find((r) => (r.positions ?? []).some((p) => gleich(p.label ?? '', label)));
      return {
        schluessel: `wartung:${w.id}`, label, preis: w.preis as number,
        schonAuf: treffer?.invoiceNumber ?? null, am: w.ausgefuehrtAm ?? null,
      };
    });
}

/** Der Vorschlag als Rechnungszeile: eine Wartung, eine Pauschale. */
export function wartungAlsPosition(v: WartungVorschlag): InvoicePosition {
  return { label: v.label, qty: 1, unit: 'Pauschale', unitPrice: v.preis, netto: v.preis };
}
