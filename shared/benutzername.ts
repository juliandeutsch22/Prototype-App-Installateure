/**
 * Anmelden mit einem Benutzernamen statt einer E-Mail-Adresse.
 *
 * GEFRAGT: „Kann man sich auch mit einem Benutzernamen anmelden?" Nicht jeder
 * Monteur hat eine Adresse, die er auf dem Diensttelefon lesen will — und
 * manche haben gar keine.
 *
 * DER ANMELDEDIENST KENNT NUR ADRESSEN. Also bekommt ein solches Konto eine
 * KUNSTADRESSE: `manfred.huber@benutzer.senklot.invalid`. Die Endung
 * `.invalid` ist nach RFC 2606 reserviert und wird nie zugestellt — eine Mail
 * dorthin geht garantiert niemandem zu, auch keinem Fremden, dem eine echte
 * Domain eines Tages gehören könnte.
 *
 * DIE FOLGE, UND SIE IST GEWOLLT: „Passwort vergessen" per Mail gibt es für
 * diese Konten nicht. Das Passwort setzt die Geschäftsführung oder
 * Administration neu (Edge Function `passwort-vergeben`). Der Anmeldedienst
 * selbst meldet beim Rücksetzen an eine solche Adresse KEINEN Fehler — die
 * App muss den Weg deshalb selbst verstellen, sonst liefe eine Mail ins Leere
 * und niemand erführe davon.
 *
 * WARUM DER NAME ÜBER ALLE BETRIEBE EINDEUTIG IST: der Anmeldedienst verlangt
 * das für jede Adresse. Ein Betriebskürzel in der Adresse hätte das umgangen,
 * aber der Monteur müsste es bei jeder Anmeldung mittippen. Vergibt ein
 * anderer Betrieb denselben Namen, sagt die Anlage „schon vergeben" — mehr
 * erfährt dabei niemand.
 *
 * Diese Datei gilt im Browser UND in der Edge Function: liesse der eine einen
 * Namen durch, den der andere abweist, stünde ein Formular da, das nie
 * gelingt.
 */

/** Die Domain aller Kunstadressen. Nie zustellbar (RFC 2606). */
export const BENUTZER_DOMAIN = 'benutzer.senklot.invalid';

const ENDUNG = `@${BENUTZER_DOMAIN}`;

/** Ein Benutzernamen-Konto hat keine Adresse, an die ein Link gehen könnte. */
export const KEIN_MAILKONTO =
  'Für eine Anmeldung mit Benutzername gibt es keinen Link per E-Mail. '
  + 'Ein neues Passwort vergibt die Geschäftsführung oder Administration.';

/** Kürzester und längster erlaubter Benutzername. */
export const BENUTZERNAME_MIN = 3;
export const BENUTZERNAME_MAX = 40;

/**
 * Ist das die Kunstadresse eines Benutzernamen-Kontos?
 *
 * Gross/klein egal: der Anmeldedienst speichert Adressen klein, eine ältere
 * Zeile in der Belegschaft könnte es anders stehen haben.
 */
export function istBenutzerkonto(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(ENDUNG);
}

/** Der Benutzername hinter einer Kunstadresse — sonst `null`. */
export function benutzernameAus(email: string | null | undefined): string | null {
  if (!istBenutzerkonto(email)) return null;
  const e = (email as string).trim().toLowerCase();
  return e.slice(0, e.length - ENDUNG.length);
}

/** Was von einem Konto angezeigt wird: der Benutzername oder die Adresse. */
export function kontoAnzeige(email: string | null | undefined): string {
  return benutzernameAus(email) ?? (email ?? '');
}

/**
 * Was im Anmeldefeld steht → die Adresse, mit der angemeldet wird.
 *
 * Mit `@` ist es eine Adresse und bleibt, wie sie ist. Ohne `@` ist es ein
 * Benutzername: klein geschrieben, weil „Manfred.Huber" am Telefon mit
 * grossem Anfangsbuchstaben getippt wird und trotzdem gelingen soll.
 */
export function anmeldeAdresse(eingabe: string): string {
  const e = eingabe.trim();
  if (e.includes('@')) return e;
  return `${e.toLowerCase()}${ENDUNG}`;
}

/** Aus einem gültigen Benutzernamen die Kunstadresse. */
export function kunstadresse(benutzername: string): string {
  return `${benutzername.trim().toLowerCase()}${ENDUNG}`;
}

/**
 * Warum ein Benutzername nicht geht — oder `null`, wenn er geht.
 *
 * NUR a–z, 0–9, Punkt, Bindestrich und Unterstrich: der Name wird zum
 * vorderen Teil einer Adresse, und dort sind Umlaute, Leerzeichen und `@`
 * nicht zu haben. Am Anfang und Ende nur Buchstabe oder Ziffer, keine zwei
 * Punkte hintereinander — beides weist der Anmeldedienst sonst mit einer
 * Meldung ab, die niemand versteht.
 */
export function benutzernameFehler(roh: string): string | null {
  const name = roh.trim().toLowerCase();
  if (!name) return 'Der Benutzername fehlt.';
  if (name.length < BENUTZERNAME_MIN) {
    return `Der Benutzername braucht mindestens ${BENUTZERNAME_MIN} Zeichen.`;
  }
  if (name.length > BENUTZERNAME_MAX) {
    return `Der Benutzername darf höchstens ${BENUTZERNAME_MAX} Zeichen haben.`;
  }
  if (!/^[a-z0-9._-]+$/.test(name)) {
    return 'Erlaubt sind nur Kleinbuchstaben a–z, Ziffern, Punkt, Bindestrich und Unterstrich — '
      + 'also „ue" statt „ü" und keine Leerzeichen.';
  }
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) {
    return 'Der Benutzername muss mit einem Buchstaben oder einer Ziffer beginnen und enden.';
  }
  if (name.includes('..')) return 'Zwei Punkte hintereinander gehen nicht.';
  return null;
}
