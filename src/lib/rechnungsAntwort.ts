/** Transportabbruch ist kein nachgewiesener Rollback. Ohne Versuchsschlüssel
 * kann ein reiner Listenvergleich die fehlende Antwort nicht sicher ersetzen. */
export class RechnungsAntwortUnklar extends Error {
  constructor() {
    super('Die Rechnungserstellung konnte nicht bestätigt werden. Ob die Rechnung erstellt wurde, ist noch nicht sicher. Bitte zuerst die Rechnungsliste prüfen.');
    this.name = 'RechnungsAntwortUnklar';
  }
}
