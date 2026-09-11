/**
 * Zwischen den Feldnamen der App und den Spaltennamen der Datenbank.
 *
 * Die App spricht seit jeher `camelCase` (`companyId`, `breakDuration`), und
 * jede Ansicht, jeder Typ und jeder Test hängt daran. Postgres spricht
 * `snake_case`, und das ist dort keine Geschmacksfrage: unzitierte Bezeichner
 * werden klein geschrieben, also wäre `companyId` in SQL ohnehin `companyid`
 * — ein Feld, das sich nur noch mit Anführungszeichen ansprechen lässt.
 *
 * Also wird umgerechnet. DIE UMRECHNUNG IST MECHANISCH, und genau deshalb
 * braucht sie einen Wächter: `tests/supabase/felder.test.ts` prüft, dass jede
 * echte Spalte jeder echten Tabelle den Hin- und Rückweg unverändert
 * übersteht. Eine Spalte, die das nicht tut, fällt auf, bevor sie still Daten
 * verschluckt.
 */

/** `break_duration` → `breakDuration` */
export function alsFeld(spalte: string): string {
  return spalte.replace(/_([a-z0-9])/g, (_, z: string) => z.toUpperCase());
}

/** `breakDuration` → `break_duration` */
export function alsSpalte(feld: string): string {
  return feld.replace(/[A-Z]/g, (z) => `_${z.toLowerCase()}`);
}

/** Eine ganze Zeile aus der Datenbank in die Sprache der App. */
export function zeileAlsObjekt<T>(zeile: Record<string, unknown>): T {
  const raus: Record<string, unknown> = {};
  for (const [spalte, wert] of Object.entries(zeile)) raus[alsFeld(spalte)] = wert;
  return raus as T;
}

/**
 * Ein Objekt der App in eine Zeile für die Datenbank.
 *
 * `undefined` fällt heraus — nicht, weil Postgres das verlangte (es kennt nur
 * `null`), sondern weil „Feld nicht mitgeschickt" und „Feld ausdrücklich
 * geleert" zwei verschiedene Absichten sind. `null` bleibt deshalb stehen.
 * Das ist dieselbe Unterscheidung, die `stripUndefined` in der alten
 * Datenschicht getroffen hat.
 */
export function objektAlsZeile(daten: Record<string, unknown>): Record<string, unknown> {
  const raus: Record<string, unknown> = {};
  for (const [feld, wert] of Object.entries(daten)) {
    if (wert !== undefined) raus[alsSpalte(feld)] = wert;
  }
  return raus;
}
