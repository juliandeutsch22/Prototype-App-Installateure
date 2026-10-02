/**
 * Adress- und Telefon-Verknuepfungen.
 *
 * Bewusst ohne React: die Regeln, wie aus einer Freitext-Adresse ein
 * Kartenlink und aus einer getippten Nummer ein waehlbarer Link wird, sind
 * reine Zeichenketten-Arbeit und gehoeren nicht in eine Komponente. So sind
 * sie auch ohne gerendertes Bauteil pruefbar.
 */

/**
 * Kartenlink. Bewusst die Google-Maps-SUCHE und nicht eine Koordinate: die
 * Adressen stammen aus einem Freitextfeld und sind mal vollstaendig, mal nur
 * „Hauptstrasse 12, Wiener Neustadt". Die Suche kommt damit zurecht, eine
 * Koordinatenabfrage nicht.
 */
export function mapsUrl(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

/**
 * Waehlbare Form einer getippten Nummer.
 *
 * `tel:` vertraegt keine Leerzeichen, Schraegstriche oder Klammern — und
 * genau so stehen Nummern in der Praxis in den Stammdaten: „0664 123 45 67",
 * „+43 (0)2622/12345". Ziffern und ein fuehrendes Plus bleiben, alles andere
 * faellt weg. Ein Plus MITTEN in der Nummer ist ein Tippfehler und wuerde den
 * Anruf scheitern lassen.
 */
export function telUrl(nummer: string): string {
  return `tel:${telefonInternational(nummer)}`;
}

/**
 * Die Nummer in internationaler Form ohne Leerzeichen — „+436641234567“
 * (Nachtest 01.10.2026, U2: Links als `tel:+43…`). Österreich ist das Land
 * ohne Vorwahl: eine führende 0 wird +43, eine führende 00 wird +.
 */
export function telefonInternational(nummer: string): string {
  const roh = nummer.replace(/[^\d+]/g, '');
  // Ein Plus zählt nur vorn; mitten in der Nummer ist es ein Tippfehler.
  const plus = roh.startsWith('+');
  const ziffern = roh.replace(/\+/g, '');
  let int = plus ? `+${ziffern}` : ziffern.startsWith('00') ? `+${ziffern.slice(2)}` : ziffern.startsWith('0') ? `+43${ziffern.slice(1)}` : ziffern;
  // „+43 (0)2622/12345“: die 0 nach der Landesvorwahl wird nicht mitgewählt.
  if (int.startsWith('+430')) int = `+43${int.slice(4)}`;
  return int;
}

/** Vorwahlen mit drei Ziffern nach der 0 — Landeshauptstädte und Mobilnetze; die übrigen haben vier. */
const DREISTELLIG = /^(316|662|732|512|463|6\d\d|7[2-8]0)/;

/**
 * WIE EINE NUMMER DASTEHT — überall gleich (U2). In Listen standen
 * „0660 6322503“, „06606322503“ und „+43 3112 12345“ nebeneinander.
 *
 * Österreichische Nummern in der Inlandsform mit einem Leerzeichen nach der
 * Vorwahl: „0664 1234567“, „01 2345678“, „0316 123456“, „03112 12345“. Wien
 * hat die 1, Mobilnetze und Landeshauptstädte drei Ziffern, sonst vier.
 * Ausländische Nummern bleiben, wie sie eingetragen sind. Gespeichert wird
 * nichts anders — nur die Anzeige.
 */
export function telefonAnzeige(nummer: string): string {
  const roh = nummer.trim();
  const int = telefonInternational(roh);
  if (!int.startsWith('+43')) return roh;
  const national = int.slice(3);
  if (national.length < 4) return roh;
  const laenge = national.startsWith('1') ? 1 : DREISTELLIG.test(national) ? 3 : 4;
  return `0${national.slice(0, laenge)} ${national.slice(laenge)}`;
}

/**
 * Schreibbare Form einer hinterlegten Adresse.
 *
 * `mailto:` vertraegt keine Leerzeichen und keine spitzen Klammern — und
 * genau so stehen Adressen in Stammdaten, wenn sie jemand aus einer Mail
 * herauskopiert hat: „ Max Muster <max@example.at> ". Herausgeholt wird die
 * Adresse selbst; steht keine da, gibt es auch keinen Link.
 */
export function mailUrl(adresse: string): string | null {
  const roh = adresse.trim();
  const inKlammern = /<([^>]+)>/.exec(roh);
  const kandidat = (inKlammern ? inKlammern[1] : roh).trim();
  // Bewusst grob geprueft: ein Zeichen, ein @, ein Punkt danach. Eine strenge
  // Pruefung wuerde gueltige Adressen abweisen, und eine ungueltige schadet
  // hier nichts — das Mailprogramm meldet sich.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kandidat)) return null;
  return `mailto:${kandidat}`;
}
