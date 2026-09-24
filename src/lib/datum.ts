/**
 * Ein Datum, wie es in Österreich geschrieben wird: 24.09.2026.
 *
 * DREI FORMATE STANDEN NEBENEINANDER (Prüflauf 24.09.2026, D1): „2026-09-24"
 * in Zeiterfassung, Rechnungen, Angeboten und Scheinen, „24.09.2026" im
 * Urlaub, „24.9.2027" in Wartungen und Akten — Letzteres, weil
 * `toLocaleDateString('de-AT')` ohne Angaben Tag und Monat nicht auffüllt.
 * Angezeigt wird jetzt überall dieses eine; gespeichert und in Eingabefeldern
 * bleibt es beim ISO-Datum, das die Datenbank und `<input type="date">`
 * verlangen.
 *
 * AUS DEM TEXT GELESEN, NICHT ÜBER `Date`: ein Kalendertag hat keine Uhrzeit
 * und keine Zeitzone, und `new Date('2026-09-24')` ist Mitternacht in UTC —
 * westlich davon schon der 23.
 */
export function datumAT(iso?: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  // Was kein ISO-Datum ist, wird nicht erraten, sondern so gezeigt, wie es ist.
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Ein Zeitpunkt (Millisekunden) als Kalendertag in der Zeit des Geräts. */
export function datumAusMs(ms?: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
