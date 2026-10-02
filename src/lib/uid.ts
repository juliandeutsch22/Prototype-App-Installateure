/**
 * Die Form einer UID-Nummer — Österreich und die übrigen EU-Staaten
 * (Testbericht 30.09.2026, M10).
 *
 * NUR DIE FORM, NICHT DIE GÜLTIGKEIT. Ob die Nummer vergeben ist, sagt
 * VIES — abgefragt seit dem 02.10.2026 in der Kundenakte über die
 * Serverfunktion `uid-pruefen` (`shared/vies.ts`), mit festgehaltenem
 * Ergebnis. Was hier gefangen wird, ist der Vertipper beim Tippen: „ATU123",
 * eine Ziffer zu wenig, „GR" statt „EL".
 *
 * DIESELBEN MUSTER STEHEN IN DER DATENBANK (`app.uid_form_fehler`). Dort
 * entscheiden sie, hier sagen sie es früher und mit Beispiel — ein Test
 * hält beide Listen gleich.
 *
 * AUSSERHALB DER EU (Schweiz, Norwegen, Vereinigtes Königreich …) wird
 * nichts abgelehnt: dort gilt nur die grobe Form „Länderkennung und
 * Zeichen dahinter".
 */

interface UidForm {
  land: string;
  muster: RegExp;
  beispiel: string;
}

/** Die Muster, wie die EU-Kommission sie für VIES angibt. */
export const UID_FORMEN: Record<string, UidForm> = {
  AT: { land: 'Österreich', muster: /^ATU\d{8}$/, beispiel: 'ATU12345678' },
  BE: { land: 'Belgien', muster: /^BE[01]\d{9}$/, beispiel: 'BE0123456789' },
  BG: { land: 'Bulgarien', muster: /^BG\d{9,10}$/, beispiel: 'BG123456789' },
  CY: { land: 'Zypern', muster: /^CY\d{8}[A-Z]$/, beispiel: 'CY12345678X' },
  CZ: { land: 'Tschechien', muster: /^CZ\d{8,10}$/, beispiel: 'CZ12345678' },
  DE: { land: 'Deutschland', muster: /^DE\d{9}$/, beispiel: 'DE123456789' },
  DK: { land: 'Dänemark', muster: /^DK\d{8}$/, beispiel: 'DK12345678' },
  EE: { land: 'Estland', muster: /^EE\d{9}$/, beispiel: 'EE123456789' },
  EL: { land: 'Griechenland', muster: /^EL\d{9}$/, beispiel: 'EL123456789' },
  ES: { land: 'Spanien', muster: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, beispiel: 'ESX1234567X' },
  FI: { land: 'Finnland', muster: /^FI\d{8}$/, beispiel: 'FI12345678' },
  FR: { land: 'Frankreich', muster: /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/, beispiel: 'FR12345678901' },
  HR: { land: 'Kroatien', muster: /^HR\d{11}$/, beispiel: 'HR12345678901' },
  HU: { land: 'Ungarn', muster: /^HU\d{8}$/, beispiel: 'HU12345678' },
  IE: {
    land: 'Irland',
    muster: /^IE(\d{7}[A-WY][A-I]?|\d[A-Z+*]\d{5}[A-W])$/,
    beispiel: 'IE1234567WA',
  },
  IT: { land: 'Italien', muster: /^IT\d{11}$/, beispiel: 'IT12345678901' },
  LT: { land: 'Litauen', muster: /^LT(\d{9}|\d{12})$/, beispiel: 'LT123456789' },
  LU: { land: 'Luxemburg', muster: /^LU\d{8}$/, beispiel: 'LU12345678' },
  LV: { land: 'Lettland', muster: /^LV\d{11}$/, beispiel: 'LV12345678901' },
  MT: { land: 'Malta', muster: /^MT\d{8}$/, beispiel: 'MT12345678' },
  NL: { land: 'Niederlande', muster: /^NL\d{9}B\d{2}$/, beispiel: 'NL123456789B01' },
  PL: { land: 'Polen', muster: /^PL\d{10}$/, beispiel: 'PL1234567890' },
  PT: { land: 'Portugal', muster: /^PT\d{9}$/, beispiel: 'PT123456789' },
  RO: { land: 'Rumänien', muster: /^RO\d{2,10}$/, beispiel: 'RO1234567' },
  SE: { land: 'Schweden', muster: /^SE\d{12}$/, beispiel: 'SE123456789001' },
  SI: { land: 'Slowenien', muster: /^SI\d{8}$/, beispiel: 'SI12345678' },
  SK: { land: 'Slowakei', muster: /^SK\d{10}$/, beispiel: 'SK1234567890' },
  XI: {
    land: 'Nordirland',
    muster: /^XI(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
    beispiel: 'XI123456789',
  },
};

/** Grossbuchstaben, ohne Leerzeichen, Punkte und Bindestriche — so wird sie gespeichert. */
export function uidNormalisieren(uid: string | null | undefined): string {
  return (uid ?? '').replace(/[\s.-]/g, '').toUpperCase();
}

/**
 * Was an der Form nicht stimmt — `null`, wenn sie passt oder das Feld leer ist.
 */
export function uidFehler(uid: string | null | undefined): string | null {
  const u = uidNormalisieren(uid);
  if (!u) return null;
  if (u.startsWith('GR')) {
    return 'Griechische UID-Nummern beginnen mit „EL“, nicht mit „GR“.';
  }
  const kennung = u.slice(0, 2);
  const form = UID_FORMEN[kennung];
  if (form) {
    if (form.muster.test(u)) return null;
    if (kennung === 'AT') {
      return 'Eine österreichische UID-Nummer ist „ATU“ und acht Ziffern, z. B. ATU12345678.';
    }
    return `Diese UID-Nummer hat nicht die Form für ${form.land}, z. B. ${form.beispiel}.`;
  }
  if (/^[A-Z]{2}[0-9A-Z]{6,14}$/.test(u)) return null;
  return 'Das sieht nicht nach einer UID-Nummer aus: zwei Buchstaben für das Land, dann die Nummer, z. B. ATU12345678.';
}

/**
 * Hält die UID das Speichern auf? Nur, wenn sie GEÄNDERT wurde — wie in der
 * Datenbank. Eine alte, falsch geschriebene UID blockiert nicht, dass jemand
 * die Telefonnummer desselben Kunden nachträgt; die Maske zeigt sie trotzdem.
 */
export function uidSperrt(neu: string | null | undefined, bisher: string | null | undefined): string | null {
  if (uidNormalisieren(neu) === uidNormalisieren(bisher)) return null;
  return uidFehler(neu);
}

export type Kundenart = 'privat' | 'unternehmen';

/**
 * Gilt der Kunde als Unternehmer — für Verzugszinsen (§ 456 UGB) und die
 * Pauschale nach § 458 UGB? Die Kundenart entscheidet; ohne Angabe gilt wie
 * bisher: wer eine UID hat.
 */
export function istUnternehmerKunde(
  kunde: { kundenart?: Kundenart | null; vatId?: string | null } | null | undefined,
  uidAufBeleg?: string | null,
): boolean {
  if (uidNormalisieren(uidAufBeleg)) return true;
  if (!kunde) return false;
  if (kunde.kundenart) return kunde.kundenart === 'unternehmen';
  return !!uidNormalisieren(kunde.vatId);
}
