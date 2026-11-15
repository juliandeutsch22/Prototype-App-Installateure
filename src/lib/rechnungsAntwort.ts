/** Transportabbruch ist kein nachgewiesener Rollback. Ob die Rechnung
 * entstand, klärt seit G2 (15.11.2026) die Kennung des Versuchs
 * (`rechnungVersuchKlaeren`), nicht ein Vergleich der Liste. */
export class RechnungsAntwortUnklar extends Error {
  constructor() {
    super('Die Rechnungserstellung konnte nicht bestätigt werden. Ob die Rechnung erstellt wurde, wird geklärt, sobald die Verbindung steht.');
    this.name = 'RechnungsAntwortUnklar';
  }
}
