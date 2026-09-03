/**
 * Die Wochenrechnung des Wochenplans — getrennt von der Ansicht, weil sie
 * für sich prüfbar ist.
 *
 * Beide Funktionen rechnen LOKAL und nicht über `toISOString`. Das ist kein
 * Stilfrage: `toISOString` rechnet in UTC und liefert in Mitteleuropa vor
 * 02:00 Uhr (Sommerzeit) noch den Vortag. Eine Woche, die am Montag beginnt,
 * begänne damit gelegentlich am Sonntag.
 */

/** 'YYYY-MM-DD' aus einem Datum — lokal. */
export function lokalesDatum(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${t}`;
}

/**
 * Der Montag der Woche, in der dieses Datum liegt.
 *
 * `getDay()` zählt ab Sonntag (0). Der Sonntag gehört in Österreich ans ENDE
 * der Woche, also sechs Tage zurück statt einen vor — der Fehler, den man
 * hier macht, verschiebt jede Sonntagswoche um sieben Tage.
 */
export function montagDer(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const versatz = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + versatz);
  return lokalesDatum(d);
}

/** Die sieben Tage ab einem Montag. */
export function wocheAb(montag: string): string[] {
  const start = new Date(`${montag}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return lokalesDatum(d);
  });
}

/** Eine Woche vor oder zurück. */
export function wocheVerschoben(montag: string, wochen: number): string {
  const d = new Date(`${montag}T00:00:00`);
  d.setDate(d.getDate() + wochen * 7);
  return lokalesDatum(d);
}
