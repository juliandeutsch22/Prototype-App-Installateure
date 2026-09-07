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
  const ziffern = nummer.replace(/[^\d+]/g, '');
  const fuehrendesPlus = ziffern.startsWith('+');
  return `tel:${fuehrendesPlus ? '+' : ''}${ziffern.replace(/\+/g, '')}`;
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
