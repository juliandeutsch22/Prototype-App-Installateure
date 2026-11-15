import type { Invoice } from '@/types';

/**
 * Die Rundungen, mit denen die App bis zur Umstellung am 15.11.2026 (G7)
 * gerechnet hat — NUR, um damals ausgestellte Belege wiederzuerkennen und
 * unverändert wiederzugeben. Gerechnet wird mit ihnen nichts Neues; dafür
 * gibt es genau eine Rundung (`cent` in `@/lib/betrag`).
 *
 * WARUM ES SIE NOCH GIBT. Ein ausgestellter Beleg wird nicht neu gerechnet
 * (Grundsatz: Altdaten werden nicht umgeschrieben). Die Zeilen, Summen und
 * Steuern stehen gespeichert in der Datenbank — der Nachdruck nimmt sie von
 * dort. Zwei Dinge sind aber nie gespeichert worden:
 *
 *   - der Skontobetrag im Zahlungssatz des PDFs („abzüglich 2 % Skonto:
 *     104,62 €“). Er wurde bei jedem Druck aus Satz und Betrag gerechnet.
 *     Seit der Umstellung hält die Datenbank ihn fest (`skonto_zugesagt`);
 *     für ältere Rechnungen ergibt diese Rundung, was damals gedruckt wurde.
 *   - ob eine Zeile „Menge × Preis“ mit der alten oder der neuen Rundung
 *     ergeben hat. Die E-Rechnung prüft das nach; eine alte Zeile über
 *     307,27 € (4,25 × 72,30) bleibt richtig und wird nicht abgewiesen.
 *
 * Die Grenze: eine App, die nach der Umstellung noch mit dem alten Stand lief
 * (Telefon nicht neu geladen), druckte den alten Skontobetrag, während die
 * Datenbank schon den neuen festhält. Das trifft nur Beträge genau auf einem
 * halben Cent und nur bis zum nächsten Laden der App.
 */

/** Wie `cent()` bis 15.11.2026 rundete (Zeilen, Rabatt, Umsatzsteuer). */
export function centBisher(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Wie `zugesagterSkonto()` bis 15.11.2026 rundete — ohne `EPSILON`. */
export function skontoBisher(inv: Pick<Invoice, 'totalBrutto' | 'skontoProzent' | 'ruecklassBetrag'>): number {
  const basis = (inv.totalBrutto ?? 0) - (inv.ruecklassBetrag ?? 0);
  return inv.skontoProzent ? Math.round(((basis * inv.skontoProzent) / 100) * 100) / 100 : 0;
}
