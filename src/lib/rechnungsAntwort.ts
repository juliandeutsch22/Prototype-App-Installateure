/** Transportabbruch ist kein nachgewiesener Rollback. Ohne Versuchsschlüssel
 * kann ein reiner Listenvergleich die fehlende Antwort nicht sicher ersetzen. */
export class RechnungsAntwortUnklar extends Error {
  constructor() {
    super('Die Antwort auf die Rechnungserstellung wurde unterbrochen. Ob die Rechnung erstellt wurde, ist noch nicht sicher. Bitte zuerst die Rechnungsliste prüfen.');
    this.name = 'RechnungsAntwortUnklar';
  }
}
