/**
 * Bauleistung mit Übergang der Steuerschuld — § 19 Abs 1a UStG.
 *
 * WOFÜR. Erbringt der Betrieb eine Bauleistung an einen anderen
 * Bauunternehmer — also als Subunternehmer für einen Baumeister oder
 * Generalunternehmer —, geht die Umsatzsteuerschuld auf den Empfänger über.
 * Die Rechnung geht netto hinaus.
 *
 * WAS DER BELEG DANN TRAGEN MUSS:
 *   – KEINE ausgewiesene Umsatzsteuer,
 *   – den Hinweis auf den Übergang der Steuerschuld (§ 11 Abs 1a UStG),
 *   – die UID-Nummer des LEISTUNGSEMPFÄNGERS.
 *
 * Fehlt der Hinweis, ist der Beleg unvollständig. Wird stattdessen Steuer
 * ausgewiesen, obwohl der Übergang gilt, schuldet der Betrieb sie kraft
 * Rechnungslegung, bis er berichtigt (§ 11 Abs 12 UStG).
 *
 * WAS HIER BEWUSST NICHT STEHT: eine automatische Erkennung. Ob der Empfänger
 * „üblicherweise mit Bauleistungen beauftragt" ist, steht in keinem Datenfeld
 * und ist eine Beurteilung, keine Rechnung. Der Betrieb entscheidet je
 * Rechnung — die App sorgt dafür, dass die Entscheidung vollständig wird.
 */

/** Der Pflichtsatz auf dem Beleg. Wortlaut nach § 11 Abs 1a UStG. */
export const RC_HINWEIS =
  'Steuerschuld geht auf den Leistungsempfänger über (Bauleistung, § 19 Abs 1a UStG).';

export interface RcPruefung {
  /** Darf die Rechnung so angelegt werden? */
  vollstaendig: boolean;
  /** Was fehlt — leer, wenn nichts fehlt. */
  fehlt: string[];
}

/**
 * Ist die Rechnung als Reverse Charge vollständig?
 *
 * Die UID des Empfängers ist der Punkt. Ohne sie ist der Übergang nicht
 * belegt, und der Beleg taugt für den Empfänger nicht — er kann seine eigene
 * Steuerschuld damit nicht zuordnen.
 *
 * Die UID des AUSSTELLERS gehört ebenso dazu; sie steht in den Firmendaten
 * und auf jeder Rechnung in der Fusszeile. Fehlt sie dort, fehlt sie auch
 * hier — und dann ist der Beleg schon ohne Reverse Charge unvollständig.
 */
export function pruefeReverseCharge(
  aktiv: boolean,
  empfaengerUid: string | undefined,
  eigeneUid: string | undefined,
): RcPruefung {
  if (!aktiv) return { vollstaendig: true, fehlt: [] };
  const fehlt: string[] = [];
  if (!empfaengerUid?.trim()) fehlt.push('die UID-Nummer des Kunden');
  if (!eigeneUid?.trim()) fehlt.push('die eigene UID-Nummer in den Firmendaten');
  return { vollstaendig: fehlt.length === 0, fehlt };
}

/**
 * Der Steuersatz, der tatsächlich gilt.
 *
 * EINE STELLE, an der aus „Reverse Charge" die Null wird. Stünde diese
 * Entscheidung an drei Stellen — Vorschau, gespeicherte Rechnung, PDF —,
 * liefen sie irgendwann auseinander, und der Kunde bekäme einen Beleg mit
 * Steuer über einen Betrag ohne.
 */
export function geltenderSatz(aktiv: boolean, satz: number): number {
  return aktiv ? 0 : satz;
}

/**
 * Sieht die UID nach einer österreichischen UID aus?
 *
 * ABSICHTLICH NUR EINE FORMPRÜFUNG und keine Gültigkeitsabfrage: die läuft
 * über das MIAS-Verfahren beim Finanzamt und braucht einen Netzzugang, den
 * eine Rechnungsmaske nicht haben sollte. Was hier gefangen wird, ist der
 * Vertipper — eine fehlende Ziffer, ein vergessenes „ATU".
 *
 * Andere Länder haben andere Formen; deshalb wird eine fremde UID nicht
 * abgelehnt, sondern nur eine österreichische auf ihre Form geprüft.
 */
export function sichtAusWieUid(uid: string): boolean {
  const u = uid.trim().replace(/\s/g, '').toUpperCase();
  if (u.startsWith('ATU')) return /^ATU\d{8}$/.test(u);
  // Fremdes Land: mindestens zwei Buchstaben Länderkennung und etwas dahinter.
  return /^[A-Z]{2}[0-9A-Z]{6,14}$/.test(u);
}
