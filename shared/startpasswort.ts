/**
 * Ein zufälliges Startpasswort — im Browser (Mitarbeiter anlegen) und in den
 * Edge Functions (erster Administrator mit Benutzername, Wiederherstellung
 * über den Notzugang; Testbericht 30.09.2026, P1 und P2).
 */
const PW_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Zufälliges Initialpasswort. Bewusst über crypto.getRandomValues statt
 * Math.random (nicht kryptografisch sicher und damit vorhersagbar).
 * Verwechselbare Zeichen (0/O, 1/l/I) sind ausgelassen, weil das Passwort
 * am Telefon durchgegeben werden kann, wenn die Mail nicht ankommt.
 */
export function generatePassword(length = 14): string {
  /*
    OHNE FESTES MUSTER (Testbericht 30.09.2026, G12). Vorher endete jedes
    Startpasswort auf „A1!“ — drei Zeichen, die jeder kannte, der einmal
    eines gesehen hatte. Jetzt steht je ein Gross-, ein Kleinbuchstabe und
    eine Ziffer an zufälliger Stelle; der Rest ist zufällig.
  */
  const zufall = (n: number) => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] % n;
  };
  const zeichen = Array.from({ length }, () => PW_ALPHABET[zufall(PW_ALPHABET.length)]);
  const pflicht = [PW_KLEIN, PW_GROSS, PW_ZIFFERN];
  const stellen = new Set<number>();
  while (stellen.size < pflicht.length) stellen.add(zufall(length));
  [...stellen].forEach((stelle, i) => {
    zeichen[stelle] = pflicht[i][zufall(pflicht[i].length)];
  });
  return zeichen.join('');
}

const PW_KLEIN = 'abcdefghijkmnopqrstuvwxyz';
const PW_GROSS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PW_ZIFFERN = '23456789';
