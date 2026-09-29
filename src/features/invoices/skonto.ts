import type { Invoice, RechnungsArt } from '@/types';
import { zahlstand } from './zahlstand';

/**
 * Skonto (offene Punkte B7, Teil 2).
 *
 * DIE BEDINGUNG STEHT AUF DER RECHNUNG, der Abzug ist ein Zahlungseingang der
 * Art „Skonto". So gleicht er den Rest aus, und alles, was mit dem Rest
 * rechnet — offene Posten, Mahnlauf, Startseite —, bleibt ohne Änderung
 * richtig. Die Datenbank prüft dieselben Grenzen (`app.skonto_passt`,
 * Migration `20260929160000_skonto.sql`); hier stehen sie, damit die Maske
 * nur anbietet, was dort durchgeht.
 */

const runde = (n: number) => Math.round(n * 100) / 100;

/** `n` Tage auf einen ISO-Tag, in UTC gerechnet — ohne Sommerzeitfallen. */
function tagePlus(isoTag: string, n: number): string {
  return new Date(Date.parse(`${isoTag}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Was eine neue Rechnung zusagt — oder `null`.
 *
 * NUR AUF EINZEL- UND SCHLUSSRECHNUNG. Auf einer Anzahlung zöge die
 * Schlussrechnung später die volle Anzahlung ab, obwohl der Kunde weniger
 * gezahlt hat. Die Frist endet spätestens mit dem Zahlungsziel.
 */
export function skontoBedingung(o: {
  prozent?: number;
  tage?: number;
  rechnungsdatum: string;
  zahlungsziel: string;
  art?: RechnungsArt;
}): { skontoProzent: number; skontoBis: string } | null {
  const prozent = o.prozent ?? 0;
  const tage = Math.floor(o.tage ?? 0);
  if (!(prozent > 0 && prozent < 100) || !(tage > 0)) return null;
  if ((o.art ?? 'einzel') !== 'einzel' && o.art !== 'schluss') return null;
  const bis = tagePlus(o.rechnungsdatum, tage);
  return { skontoProzent: prozent, skontoBis: bis < o.zahlungsziel ? bis : o.zahlungsziel };
}

/** Der zugesagte Abzug in Euro, vom Rechnungsbetrag (der Forderung dieses Belegs). */
export function zugesagterSkonto(inv: Pick<Invoice, 'totalBrutto' | 'skontoProzent'>): number {
  return inv.skontoProzent ? runde((inv.totalBrutto ?? 0) * inv.skontoProzent / 100) : 0;
}

/**
 * Darf der Rest nach dieser Zahlung als Skonto ausgeglichen werden — und wie
 * viel ist es?
 *
 * Nur innerhalb der Frist (maßgeblich ist der Tag der Zahlung), und nur, wenn
 * das, was nach der Zahlung offen bliebe, nicht mehr ist als der noch nicht
 * genutzte Skonto. Sonst hat der Kunde schlicht zu wenig gezahlt.
 */
export function skontoZumAusgleich(
  inv: Pick<Invoice, 'totalBrutto' | 'bezahltBetrag' | 'paymentStatus' | 'skontoProzent' | 'skontoBis' | 'skontoBetrag'>,
  datum: string,
  betrag: number,
): number | null {
  if (!inv.skontoProzent || !inv.skontoBis || inv.paymentStatus === 'Storniert') return null;
  if (!datum || datum > inv.skontoBis || !(betrag > 0)) return null;
  const bleibt = runde(zahlstand(inv).rest - betrag);
  const frei = runde(zugesagterSkonto(inv) - (inv.skontoBetrag ?? 0));
  return bleibt > 0 && bleibt <= frei ? bleibt : null;
}
