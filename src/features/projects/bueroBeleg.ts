/**
 * Dateinamen, die nach einem Beleg des Büros klingen, nicht nach einem Plan.
 *
 * Im Launch-Check (25.09.2026, R1) lag ein Stundennachweis bei den Plänen —
 * sichtbar für jeden Monteur der Baustelle, mit den Stunden der Kollegen.
 * Ein Dateiname beweist nichts; er ist aber der einzige Anhaltspunkt vor dem
 * Hochladen, und gefragt wird nur, nicht verboten.
 */
const BUEROBELEG = /stunden|rechnung|lohn|gehalt|abrechnung|angebot|kalkulation|zeitkonto|saldo|krank|urlaub/i;

/**
 * SEIT 30.09.2026 AUCH DER NAME EINES MITARBEITERS (Testbericht H8): ein
 * „Nachweis_Max_Mustermann.pdf“ trägt Personaldaten, auch ohne das Wort
 * „Stunden“. Gezählt wird ein Name, dessen Teile (ab drei Buchstaben) alle im
 * Dateinamen stehen — „Max Mustermann“ in „stunden_max_mustermann_09“.
 */
export function klingtNachBueroBeleg(dateiname: string, personen: readonly string[] = []): boolean {
  if (BUEROBELEG.test(dateiname)) return true;
  const name = ` ${dateiname.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return personen.some((p) => {
    const teile = p.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);
    return teile.length > 0 && teile.every((t) => name.includes(` ${t} `));
  });
}
