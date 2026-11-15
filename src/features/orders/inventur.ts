/**
 * Inventur als Zählliste (Durchsicht 15.11.2026, F14) — was die Ansicht
 * rechnet: Fortschritt, Filter, Worte für Abweichung und Ergebnis, der
 * vorgeschlagene Grund und die Zeilen für Zählliste und Protokoll (PDF und
 * CSV). Gebucht wird in der Datenbank (`inventur_buchen`).
 */
import type { InventurErgebnis, ZaehllisteVoll, ZaehllistenZeile } from '@/lib/db/inventur';
import { fmtMenge } from '@/lib/belegLayout';
import { csvZelle } from '@/lib/csvZelle';
import { datumAusMs } from '@/lib/datum';

export type ZaehlFilter = 'offen' | 'gezaehlt' | 'alle';

/** Wie viele Zeilen gezählt sind. */
export function fortschritt(zeilen: readonly Pick<ZaehllistenZeile, 'gezaehlt'>[]): { gezaehlt: number; gesamt: number } {
  return { gezaehlt: zeilen.filter((z) => z.gezaehlt != null).length, gesamt: zeilen.length };
}

/** Die Zeilen, die der Filter zeigt — Suche über Name, Artikelnummer und Warengruppe. */
export function zeilenFiltern<Z extends Pick<ZaehllistenZeile, 'gezaehlt' | 'name' | 'artikelnummer' | 'warengruppe'>>(
  zeilen: readonly Z[],
  filter: ZaehlFilter,
  suche: string,
): Z[] {
  const q = suche.trim().toLowerCase();
  return zeilen.filter((z) =>
    (filter === 'alle' || (filter === 'offen' ? z.gezaehlt == null : z.gezaehlt != null))
    && (!q || [z.name, z.artikelnummer, z.warengruppe].some((w) => w?.toLowerCase().includes(q))));
}

/**
 * „+2 Stk“, „−1,5 m“ — in der Ansicht mit echtem Minus, damit es neben dem
 * Plus gleich breit liest. IM PDF NICHT: die Grundschrift von jsPDF kennt
 * U+2212 nicht und schreibt die ganze Zeile dann als Zeichensalat — das
 * Vorzeichen wäre weg. Dort steht der Bindestrich.
 */
export function abweichungText(n: number | null | undefined, einheit: string, minus = '−'): string {
  if (n == null) return '—';
  if (n === 0) return 'stimmt';
  return `${n > 0 ? '+' : minus}${fmtMenge(Math.abs(n))} ${einheit}`;
}

const ERGEBNIS: Record<InventurErgebnis, string> = {
  gebucht: 'gebucht',
  ueberholt: 'überholt — danach einzeln inventiert',
  nicht_gezaehlt: 'nicht gezählt — Bestand unverändert',
};

export function ergebnisText(z: Pick<ZaehllistenZeile, 'ergebnis' | 'abweichung'>): string {
  if (!z.ergebnis) return '';
  if (z.ergebnis === 'gebucht') return z.abweichung ? 'Abweichung gebucht' : 'stimmt';
  return ERGEBNIS[z.ergebnis];
}

/** Der vorgeschlagene Grund: Ort und Tag der Zählung — so steht er im Bewegungsprotokoll. */
export function vorgabeGrund(ort: string, stichtag: number | null, heute: number): string {
  return `Inventur ${ort} ${datumAusMs(stichtag ?? heute)}`;
}

/** Wann gezählt wird — für Kopf und Protokoll. */
export function zaehlzeitText(stichtag: number | null): string {
  if (stichtag == null) return 'je Artikel beim Eintragen';
  const d = new Date(stichtag);
  const uhr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
  return `zum Stichtag ${datumAusMs(stichtag)}, ${uhr} Uhr`;
}

/** Die Zeilen der Zählliste zum Ausdrucken: gezählt wird auf Papier, die Spalte bleibt leer, wo nichts steht. */
export function zaehllistenTabelle(zeilen: readonly ZaehllistenZeile[]): string[][] {
  return zeilen.map((z, i) => [
    String(i + 1),
    z.artikelnummer ?? '',
    z.name,
    z.einheit,
    z.gezaehlt == null ? '' : fmtMenge(z.gezaehlt),
  ]);
}

/** Die Zeilen des Protokolls einer gebuchten Liste. */
export function protokollTabelle(zeilen: readonly ZaehllistenZeile[]): string[][] {
  return zeilen.map((z) => [
    z.artikelnummer ?? '',
    z.name,
    z.einheit,
    z.soll == null ? '' : fmtMenge(z.soll),
    z.gezaehlt == null ? '' : fmtMenge(z.gezaehlt),
    z.ergebnis === 'gebucht' ? abweichungText(z.abweichung, z.einheit, '-') : '',
    z.bestandNachher == null ? '' : fmtMenge(z.bestandNachher),
    [ergebnisText(z), z.grund].filter(Boolean).join(' · '),
  ]);
}

/** Das Protokoll als CSV (Semikolon, für Excel und die Kanzlei) — Mengen als Zahl mit Komma. */
export function protokollCsv(liste: ZaehllisteVoll): string {
  const zahl = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
  const kopf = ['Ort', 'Gezählt', 'Art.-Nr.', 'Artikel', 'Einheit', 'Soll', 'Gezählt (Menge)', 'Abweichung',
    'Bestand nachher', 'Ergebnis', 'Grund', 'Gezählt von', 'Gezählt am'];
  const zeilen = liste.zeilen.map((z) => [
    liste.ortName, zaehlzeitText(liste.stichtag), z.artikelnummer ?? '', z.name, z.einheit, zahl(z.soll), zahl(z.gezaehlt),
    z.ergebnis === 'gebucht' ? zahl(z.abweichung) : '', zahl(z.bestandNachher), ergebnisText(z),
    z.grund ?? (z.ergebnis === 'gebucht' ? liste.grund ?? '' : ''), z.gezaehltVonName ?? '',
    z.gezaehltAm == null ? '' : datumAusMs(z.gezaehltAm),
  ]);
  return [kopf, ...zeilen].map((r) => r.map(csvZelle).join(';')).join('\r\n');
}

/** „Inventur_Fahrzeug_W-1A_2026-12-31.pdf“ — erkennbar im Download-Ordner. */
export function inventurDateiname(art: 'Zaehlliste' | 'Inventurprotokoll', ort: string, isoDatum: string, endung: 'pdf' | 'csv'): string {
  const name = ort.trim().replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_|_$/g, '') || 'Lager';
  return `${art}_${name}_${isoDatum}.${endung}`;
}
