/**
 * Die UID des Leistungsempfängers — § 11 Abs 1 Z 2 UStG.
 *
 * WAS DAS GESETZ VERLANGT. Übersteigt der Gesamtbetrag einer Rechnung
 * 10.000 Euro und geht sie an ein Unternehmen für dessen Unternehmen, gehört
 * die UID-Nummer des EMPFÄNGERS auf den Beleg. Sie ist dort Pflichtangabe wie
 * das Datum oder die Nummer.
 *
 * WEN ES TRIFFT, WENN SIE FEHLT: nicht den Aussteller, sondern den KUNDEN.
 * Ihm steht der Vorsteuerabzug erst zu, wenn sämtliche Merkmale vorliegen.
 * Wird die UID binnen eines Monats nachgereicht, wirkt die Berichtigung
 * zurück; später erst ab dem Tag der Ergänzung. Aus einer vergessenen Zeile
 * wird so ein Anruf, eine Korrekturrechnung und im schlimmsten Fall ein
 * verlorener Vorsteuerabzug beim Geschäftspartner.
 *
 * WAS DIE APP HIER NICHT ENTSCHEIDET. Ob der Empfänger Unternehmer ist, steht
 * in keinem Datenfeld — die App hat nur ein Indiz: eine hinterlegte UID im
 * Kundenstamm. Deshalb wird gewarnt, nicht gesperrt. Eine Rechnung über
 * 12.000 Euro an eine Privatperson ist vollkommen in Ordnung und braucht
 * keine Empfänger-UID; nur weiss das der Betrieb und nicht die Software.
 *
 * ZUR ABGRENZUNG VON REVERSE CHARGE (`reverseCharge.ts`): dort ist die UID
 * IMMER Pflicht, unabhängig vom Betrag — sie belegt den Übergang der
 * Steuerschuld. Hier geht es um die betragsabhängige Pflicht der gewöhnlichen
 * Rechnung. Beide Regeln stehen getrennt, weil sie aus verschiedenen
 * Bestimmungen kommen und verschiedene Folgen haben.
 */

/**
 * Ab diesem Gesamtbetrag ist die Empfänger-UID Pflicht — BRUTTO.
 *
 * „Gesamtbetrag" ist der Rechnungsbetrag einschliesslich Umsatzsteuer. Mit
 * dem Nettobetrag gerechnet läge die Grenze faktisch bei 12.000 Euro brutto,
 * und dazwischen gingen Rechnungen ohne Pflichtangabe hinaus.
 */
export const UID_PFLICHT_AB_BRUTTO = 10_000;

export interface UidPruefung {
  /** Verlangt das Gesetz die UID auf diesem Beleg? */
  pflicht: boolean;
  /** Pflicht, aber nicht da. */
  fehlt: boolean;
  /** Was dem Betrieb dazu gesagt wird — leer, wenn nichts zu sagen ist. */
  text: string;
}

/**
 * Braucht dieser Beleg die UID des Empfängers, und hat er sie?
 *
 * Bei Reverse Charge gilt die Pflicht unabhängig vom Betrag; die
 * Vollständigkeitsprüfung dafür steht in `pruefeReverseCharge` und meldet
 * sich mit eigenem Wortlaut. Hier wird sie deshalb nur mitgeführt, damit
 * `pflicht` die Wahrheit sagt — doppelt gewarnt wird nicht.
 */
export function pruefeEmpfaengerUid(args: {
  bruttoBetrag: number;
  reverseCharge: boolean;
  uid: string | undefined;
}): UidPruefung {
  const hat = !!args.uid?.trim();
  const ueberGrenze = args.bruttoBetrag > UID_PFLICHT_AB_BRUTTO;
  const pflicht = ueberGrenze || args.reverseCharge;

  if (!pflicht || hat) return { pflicht, fehlt: false, text: '' };
  if (args.reverseCharge) {
    // Reverse Charge meldet sich selbst — hier nur den Zustand melden.
    return { pflicht, fehlt: true, text: '' };
  }
  /*
    DIE GRENZE STEHT AUSGESCHRIEBEN IM SATZ, nicht formatiert.

    `toLocaleString('de-AT')` trennt Tausender in dieser Laufzeit mit einem
    geschützten Leerzeichen — „10 000". Nach ÖNORM richtig, aber abhängig von
    den Gebietsdaten der Umgebung: dieselbe Warnung sähe anderswo anders aus.
    Ein Hinweis auf eine Bestimmung ist fester Text, kein gerechneter Betrag.
  */
  return {
    pflicht,
    fehlt: true,
    text:
      'Über 10.000 € brutto gehört die UID-Nummer des Kunden auf die Rechnung ' +
      '(§ 11 Abs 1 Z 2 UStG) — sonst fehlt ihm der Vorsteuerabzug. Bei einer ' +
      'Privatperson kann das Feld leer bleiben.',
  };
}
