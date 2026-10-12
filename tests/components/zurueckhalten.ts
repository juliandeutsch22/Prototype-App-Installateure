/**
 * EINE ANTWORT ZURÜCKHALTEN — und erst freigeben, wenn danach gefragt wurde.
 *
 * Gefunden am 12.10.2026 (Stand 18, K1): mehrere Ansichtstests hielten eine
 * Antwort zurück und warteten mit `expect(fn).toHaveBeenCalled()` auf die
 * Anfrage. Die Mock-Funktion zählt aber die Aufrufe der Tests davor mit —
 * die Bedingung war sofort erfüllt. War die Ansicht unter Last in der CI noch
 * nicht so weit, gab der Test eine Antwort frei, nach der niemand gefragt
 * hatte; die spätere Anfrage bekam nie eine, und die Seite blieb bei „Wird
 * geladen“. Lokal war die Ansicht immer schneller.
 *
 * `gefragt` sagt, ob GENAU DIESE Antwort angefragt wurde; `liefern` vorher
 * zu rufen, wirft — der Fehler fällt im Test auf, nicht als Hänger.
 */
export function zurueckhalten<T>() {
  let gefragt = false;
  let geben: ((wert: T) => void) | null = null;
  return {
    /** Als Umsetzung des Mocks: `fn.mockImplementationOnce(h.antwort)`. */
    antwort: () =>
      new Promise<T>((ok) => {
        gefragt = true;
        geben = ok;
      }),
    get gefragt() {
      return gefragt;
    },
    liefern(wert: T) {
      if (!geben) throw new Error('Freigegeben, bevor danach gefragt wurde — erst auf `gefragt` warten.');
      geben(wert);
    },
  };
}
