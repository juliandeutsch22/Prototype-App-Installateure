/**
 * Welche Mengen je Einheit gelten (Testbericht 30.09.2026, M27).
 *
 * WAS DER BERICHT FAND. Wareneingang und Anforderung verlangten „mindestens
 * 1, ganzzahlig“ — Rohr, Kabel, Kilo und Liter liessen sich nicht sauber
 * buchen. Die Datenbank führt Mengen längst mit drei Nachkommastellen; die
 * Sperre stand nur in der Maske.
 *
 * WAS JETZT GILT. Meter, Laufmeter, Quadrat- und Kubikmeter, Kilo, Gramm,
 * Tonnen und Liter nehmen Nachkommastellen (höchstens drei). Alles andere —
 * Stück, Packung, Set, Rolle, Sack, Paar und jede unbekannte Einheit — zählt
 * ganze Stück: „2,5 Stück“ ist ein Tippfehler, und der fällt so auf.
 *
 * Dieselbe Liste steht in der Datenbank (`app.menge_mit_komma`); ein Test
 * hält beide gleich.
 */

/** Die Vorschlagsliste im Katalog — frei ergänzbar. */
export const EINHEITEN = ['Stk', 'm', 'lfm', 'm²', 'm³', 'kg', 'l', 'Pkg', 'Set', 'Rolle', 'Sack', 'Paar'];

/** Einheiten mit Nachkommastellen, klein geschrieben. */
export const EINHEITEN_MIT_KOMMA = [
  'm', 'lfm', 'lm', 'meter', 'mtr', 'm²', 'm2', 'qm', 'm³', 'm3', 'cbm',
  'kg', 'g', 't', 'l', 'liter', 'ltr',
];

export function mengeMitKomma(einheit: string | null | undefined): boolean {
  return EINHEITEN_MIT_KOMMA.includes((einheit ?? '').trim().toLowerCase());
}

/** Was an der Menge nicht stimmt — `null`, wenn sie passt. */
export function mengeFehler(menge: number | null | undefined, einheit: string | null | undefined): string | null {
  if (menge == null || !Number.isFinite(menge)) return 'Bitte eine Menge eintragen.';
  if (menge <= 0) return 'Die Menge muss größer als null sein.';
  if (!mengeMitKomma(einheit)) {
    if (!Number.isInteger(menge)) {
      return `In „${einheit?.trim() || 'Stk'}“ zählen ganze Stück — bitte eine ganze Zahl eintragen.`;
    }
    return null;
  }
  if (Math.abs(Math.round(menge * 1000) - menge * 1000) > 1e-6) {
    return 'Höchstens drei Nachkommastellen.';
  }
  return null;
}
