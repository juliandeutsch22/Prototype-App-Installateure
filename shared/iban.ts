/**
 * IBAN und BIC prüfen (Testbericht Runde 3, H3).
 *
 * Alle Belege im Pilotbetrieb trugen „IBAN AT74123456“ — zehn Zeichen, eine
 * österreichische IBAN hat zwanzig. Niemand hatte es bemerkt, weil nichts
 * prüfte. Eine falsche IBAN auf einer Rechnung schickt das Geld des Kunden
 * ins Leere oder zu jemand anderem.
 *
 * Geprüft wird, was sich ohne Bankverzeichnis sicher sagen lässt: die Länge
 * je Land und die Prüfziffer (ISO 7064, Modulo 97). Dieselbe Regel steht in
 * der Datenbank (`app.iban_fehler`); die Oberfläche sagt es nur früher.
 */

/** Länge der IBAN je Land — SEPA-Raum. Andere Länder: 15 bis 34 Zeichen. */
export const IBAN_LAENGEN: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GI: 23, GL: 18, GR: 27, HR: 21, HU: 28,
  IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

/** Ohne Leerzeichen, in Grossbuchstaben — so wird gespeichert und geprüft. */
export function ibanNormal(iban: string | null | undefined): string {
  return (iban ?? '').replace(/\s+/g, '').toUpperCase();
}

/** In Vierergruppen, wie auf Belegen üblich: „AT61 1904 3002 3457 3201“. */
export function ibanAnzeige(iban: string | null | undefined): string {
  return ibanNormal(iban).replace(/(.{4})/g, '$1 ').trim();
}

function mod97(iban: string): number {
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const ziffern = /[A-Z]/.test(z) ? String(z.charCodeAt(0) - 55) : z;
    for (const d of ziffern) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest;
}

/** Was an einer IBAN nicht stimmt — `null`, wenn sie stimmt oder leer ist. */
export function ibanFehler(iban: string | null | undefined): string | null {
  const n = ibanNormal(iban);
  if (!n) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(n)) {
    return 'Die IBAN beginnt mit dem Länderkürzel und zwei Prüfziffern, danach nur Buchstaben und Ziffern.';
  }
  const land = n.slice(0, 2);
  const soll = IBAN_LAENGEN[land];
  if (soll && n.length !== soll) {
    return `Eine IBAN aus ${land} hat ${soll} Zeichen, diese hat ${n.length}.`;
  }
  if (!soll && (n.length < 15 || n.length > 34)) {
    return `Eine IBAN hat 15 bis 34 Zeichen, diese hat ${n.length}.`;
  }
  if (mod97(n) !== 1) return 'Die Prüfziffer der IBAN stimmt nicht — bitte jede Stelle vergleichen.';
  return null;
}

/** Was an einem BIC nicht stimmt — `null`, wenn er stimmt oder leer ist. */
export function bicFehler(bic: string | null | undefined): string | null {
  const n = ibanNormal(bic);
  if (!n) return null;
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(n)) {
    return 'Ein BIC hat 8 oder 11 Zeichen: vier Buchstaben für die Bank, zwei für das Land, dann Ort und Filiale (z. B. BKAUATWW).';
  }
  return null;
}
