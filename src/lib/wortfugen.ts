/**
 * UMBRUCH AN DER WORTFUGE (D5, E86).
 *
 * Ein langer Titel brach am Handy, wo der Platz endete: „Wohnungseigentümerge-
 * meinschaft“, „Mitarbeiterübersich-t“. Die Silbentrennung des Browsers hilft
 * nicht — sie trennt an der letzten Silbe, die noch passt, also genau dort.
 * Deutsch liest sich an der Fuge der Zusammensetzung: „Wohnungseigentümer-
 * gemeinschaft“. Dafür steht vor bekannten Grundwörtern ein weiches
 * Trennzeichen; es zeigt sich nur, wenn die Zeile dort wirklich bricht.
 *
 * Bereiche wie „12–14“ bleiben zusammen: dazwischen steht ein Wortverbinder,
 * sonst stand die 14 allein in der nächsten Zeile.
 *
 * Die Liste ist bewusst kurz und fachlich: Grundwörter aus Seitentiteln und aus
 * Namen von Kunden und Baustellen im Installationsgewerbe. Ein Wort ohne
 * bekanntes Grundwort bleibt, wie es ist — dann bricht es wie bisher.
 */

export const WEICHES_TRENNZEICHEN = '\u00ad';
const WORTVERBINDER = '\u2060';
const GESCHUETZTES_LEERZEICHEN = '\u00a0';

/** Längere zuerst ist nicht nötig: gesucht wird je Wort das längste passende Ende. */
const GRUNDWOERTER = [
  'gemeinschaft', 'gesellschaft', 'genossenschaft', 'eigentümer', 'verwaltung', 'immobilien',
  'übersicht', 'planung', 'erfassung', 'abrechnung', 'kalkulation', 'einstellungen', 'einstellung',
  'anforderungen', 'anforderung', 'installationen', 'installation', 'technik', 'sanierung',
  'eingang', 'scheine', 'schein', 'bestellungen', 'bestellung', 'lieferanten', 'wartungen', 'wartung',
  'rechnungen', 'rechnung', 'angebote', 'angebot', 'nachrichten', 'baustellen', 'baustelle',
  'mitarbeiter', 'benutzer', 'katalog', 'lager', 'bewegungen', 'zeiten', 'liegenschaften',
  'liegenschaft', 'straße', 'strasse', 'gasse', 'siedlung', 'anlagen', 'anlage', 'heizung',
  'lüftung', 'bauträger', 'auskunft', 'protokoll', 'verlauf', 'ordnung', 'vertrag', 'verträge',
];

/** Ab dieser Länge lohnt eine Fuge; kürzere Wörter passen in jede Zeile. */
const AB_LAENGE = 12;
/** So lang muss jedes Stück mindestens sein — „Nach-kalkulation“ ja, „B-austelle“ nie. */
const MIN_STUECK = 4;

function fugenImWort(wort: string): string {
  if (wort.length < AB_LAENGE) return wort;
  const klein = wort.toLocaleLowerCase('de-AT');
  let bestes = '';
  for (const g of GRUNDWOERTER) {
    if (g.length > bestes.length && klein.endsWith(g) && wort.length - g.length >= MIN_STUECK) bestes = g;
  }
  if (!bestes) return wort;
  const schnitt = wort.length - bestes.length;
  // Das Bestimmungswort kann selbst zusammengesetzt sein („Wohnungs|eigentümer|gemeinschaft“).
  return `${fugenImWort(wort.slice(0, schnitt))}${WEICHES_TRENNZEICHEN}${wort.slice(schnitt)}`;
}

/** Text mit weichen Trennzeichen an den Wortfugen und zusammengehaltenen Bereichen. */
export function wortfugen(text: string): string {
  return text
    .replace(/[\p{L}]+/gu, fugenImWort)
    // Nur Hausnummern („12–14“, „3a - 5“): eine Nummer wie „B-2026-0001“ bleibt unberührt.
    .replace(/(?<![\p{L}\d-])(\d{1,4}[a-z]?)(\s*)([–-])(\s*)(\d{1,4}[a-z]?)(?![\p{L}\d-])/gu,
      (_, von: string, l1: string, strich: string, l2: string, bis: string) =>
        `${von}${l1 ? GESCHUETZTES_LEERZEICHEN : WORTVERBINDER}${strich}${l2 ? GESCHUETZTES_LEERZEICHEN : WORTVERBINDER}${bis}`);
}
