/**
 * Kunden zusammenführen (Durchsicht 15.11.2026, F9) — was die Ansicht
 * rechnet, ohne Datenbank: welche Stammfelder sich unterscheiden, welche
 * Wahl vorbelegt ist, was am Ende gilt und was vorher gesagt werden muss.
 * Zusammengeführt wird in der Datenbank (`kunden_zusammenfuehren`).
 */
import type { Customer } from '@/types';
import type {
  KundenUeberNamen,
  KundenZahlen,
  Stammfeld,
  StammfeldHerkunft,
  ZusammenfuehrenVorschau,
} from '@/lib/db/customers';

type Kunde = Pick<
  Customer,
  'name' | 'address' | 'contactName' | 'contactPhone' | 'email' | 'vatId' | 'kundennummer' | 'kundenart'
  | 'lieferantennummer' | 'notes' | 'active'
>;

const KUNDENART: Record<string, string> = { privat: 'Privatperson', unternehmen: 'Unternehmen' };

/** Die Stammfelder in der Reihenfolge der Kundenakte — mit dem Wert, wie er dort steht. */
export const STAMMFELDER: readonly { feld: Stammfeld; name: string; wert: (k: Kunde) => string }[] = [
  { feld: 'name', name: 'Name', wert: (k) => k.name ?? '' },
  { feld: 'kundennummer', name: 'Kundennummer', wert: (k) => k.kundennummer ?? '' },
  { feld: 'kundenart', name: 'Kundenart', wert: (k) => (k.kundenart ? KUNDENART[k.kundenart] ?? k.kundenart : '') },
  { feld: 'vat_id', name: 'UID-Nummer', wert: (k) => k.vatId ?? '' },
  // Straße, PLZ, Ort und Land gehören zusammen — eine Wahl für die ganze Anschrift.
  { feld: 'anschrift', name: 'Rechnungsanschrift', wert: (k) => k.address ?? '' },
  { feld: 'contact_name', name: 'Ansprechpartner', wert: (k) => k.contactName ?? '' },
  { feld: 'contact_phone', name: 'Telefon', wert: (k) => k.contactPhone ?? '' },
  { feld: 'email', name: 'E-Mail', wert: (k) => k.email ?? '' },
  { feld: 'lieferantennummer', name: 'Unsere Lieferantennummer', wert: (k) => k.lieferantennummer ?? '' },
  { feld: 'notes', name: 'Notiz', wert: (k) => k.notes ?? '' },
];

const gleich = (a: string, b: string) => a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');

/** Die Felder, in denen sich die beiden unterscheiden — nur dort gibt es etwas zu wählen. */
export function unterschiede(bleibt: Kunde, geht: Kunde): Stammfeld[] {
  return STAMMFELDER.filter((f) => !gleich(f.wert(bleibt), f.wert(geht))).map((f) => f.feld);
}

/**
 * Die Vorbelegung: was der bleibende Kunde hat, gewinnt — außer er hat dort
 * nichts. Zwei verschiedene Notizen werden beide behalten; eine Notiz zu
 * verwerfen, die jemand bewusst geschrieben hat, soll niemand übersehen.
 */
export function vorgabeWahl(bleibt: Kunde, geht: Kunde): Partial<Record<Stammfeld, StammfeldHerkunft>> {
  const wahl: Partial<Record<Stammfeld, StammfeldHerkunft>> = {};
  for (const feld of unterschiede(bleibt, geht)) {
    const f = STAMMFELDER.find((s) => s.feld === feld)!;
    const hier = f.wert(bleibt).trim();
    const dort = f.wert(geht).trim();
    if (feld === 'notes' && hier && dort) wahl[feld] = 'beide';
    else wahl[feld] = hier ? 'bleibt' : 'geht';
  }
  return wahl;
}

/** Der Wert eines Felds nach dem Zusammenführen — so, wie die Datenbank ihn setzt. */
export function wertDanach(feld: Stammfeld, bleibt: Kunde, geht: Kunde, wahl: Partial<Record<Stammfeld, StammfeldHerkunft>>): string {
  const f = STAMMFELDER.find((s) => s.feld === feld)!;
  const w = wahl[feld] ?? 'bleibt';
  if (w === 'beide') return [f.wert(bleibt).trim(), f.wert(geht).trim()].filter(Boolean).join('\n\n');
  return (w === 'geht' ? f.wert(geht) : f.wert(bleibt)).trim();
}

/**
 * Was die Datenbank abwiese, schon vorher: eine Privatperson mit UID-Nummer
 * (`app.kunde_uid`). Ohne Kundenart macht die UID den Kunden zum Unternehmen —
 * das ist erlaubt.
 */
export function wahlFehler(bleibt: Kunde, geht: Kunde, wahl: Partial<Record<Stammfeld, StammfeldHerkunft>>): string | null {
  const uid = wertDanach('vat_id', bleibt, geht, wahl);
  const art = (wahl.kundenart === 'geht' ? geht : bleibt).kundenart;
  if (uid && art === 'privat') {
    return 'Eine Privatperson hat keine UID-Nummer — bitte bei der Kundenart „Unternehmen“ wählen oder die UID-Nummer weglassen.';
  }
  return null;
}

const MEHRZAHL: Record<keyof KundenZahlen | keyof KundenUeberNamen, [string, string]> = {
  baustellen: ['Baustelle', 'Baustellen'],
  angebote: ['Angebot', 'Angebote'],
  rechnungen: ['Rechnung', 'Rechnungen'],
  scheine: ['Handwerksschein', 'Handwerksscheine'],
  wartungen: ['Wartung', 'Wartungen'],
  termine: ['Termin', 'Termine'],
  eingaenge: ['Auftragseingang', 'Auftragseingänge'],
  beteiligungen: ['Beteiligung an einer Liegenschaft', 'Beteiligungen an Liegenschaften'],
  uidPruefungen: ['UID-Prüfung', 'UID-Prüfungen'],
  verlauf: ['Eintrag im Verlauf', 'Einträge im Verlauf'],
  beteiligungenDoppelt: ['doppelte Beteiligung', 'doppelte Beteiligungen'],
};

const anzahl = (n: number, schluessel: keyof typeof MEHRZAHL) =>
  `${n} ${MEHRZAHL[schluessel][n === 1 ? 0 : 1]}`;

/** Was wandert, je Bereich eine Zeile — nur, was es gibt. */
export function wandertZeilen(zahlen: KundenZahlen): string[] {
  const reihe: (keyof KundenZahlen)[] = [
    'baustellen', 'angebote', 'rechnungen', 'scheine', 'wartungen', 'termine', 'eingaenge', 'beteiligungen',
    'uidPruefungen', 'verlauf',
  ];
  return reihe.filter((k) => zahlen[k] > 0).map((k) => anzahl(zahlen[k], k));
}

const summeUeberNamen = (n: KundenUeberNamen) =>
  n.baustellen + n.angebote + n.rechnungen + n.scheine + n.wartungen;

/** Die Altbelege ohne Kundenbezug mit dem Namen der Dublette, als Aufzählung. */
export function ueberNamenText(n: KundenUeberNamen): string {
  const teile = (['baustellen', 'angebote', 'rechnungen', 'scheine', 'wartungen'] as const)
    .filter((k) => n[k] > 0).map((k) => anzahl(n[k], k));
  return teile.length <= 1 ? teile.join('') : `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
}

/** Was vor dem Zusammenführen gesagt werden muss — als Sätze. */
export function hinweise(v: ZusammenfuehrenVorschau, wahl: Partial<Record<Stammfeld, StammfeldHerkunft>>): string[] {
  const s: string[] = [];
  const belege = v.zahlen.rechnungen + v.zahlen.angebote + v.zahlen.scheine;
  if (belege > 0 || summeUeberNamen(v.ueberNamen) > 0) {
    s.push('Ausgestellte Rechnungen, versendete Angebote und unterschriebene Scheine behalten Name und Anschrift, mit denen sie hinausgingen — es wandert nur die Zuordnung zum Kunden.');
  }
  if (summeUeberNamen(v.ueberNamen) > 0) {
    s.push(v.nameEindeutig
      ? `Dazu ${ueberNamenText(v.ueberNamen)} ohne Kundenverknüpfung, die den Namen „${v.geht.name}“ tragen (ältere Daten) — sie gehören damit ebenfalls zu „${wertDanach('name', v.bleibt, v.geht, wahl)}“.`
      : `${ueberNamenText(v.ueberNamen)} ohne Kundenverknüpfung tragen den Namen „${v.geht.name}“, den auch ein anderer Kunde trägt — sie bleiben, wie sie sind, weil nicht feststeht, zu wem sie gehören.`);
  }
  const nrBleibt = v.bleibt.kundennummer?.trim() ?? '';
  const nrGeht = v.geht.kundennummer?.trim() ?? '';
  if (nrBleibt && nrGeht && nrBleibt !== nrGeht) {
    const neu = wahl.kundennummer === 'geht' ? nrGeht : nrBleibt;
    const alt = neu === nrBleibt ? nrGeht : nrBleibt;
    s.push(`Im Export an die Buchhaltung stehen die Rechnungen künftig unter Kundennummer ${neu}, nicht mehr unter ${alt}. Bitte der Kanzlei sagen, dass sie die beiden Personenkonten zusammenlegt.`);
  }
  if (v.zahlen.beteiligungenDoppelt > 0) {
    s.push(`${anzahl(v.zahlen.beteiligungenDoppelt, 'beteiligungenDoppelt')} (gleiche Liegenschaft, Rolle und Zeitraum) ${v.zahlen.beteiligungenDoppelt === 1 ? 'wird' : 'werden'} zusammengelegt.`);
  }
  if (v.bleibt.active === false && v.geht.active !== false) {
    s.push('Der Kunde ist danach wieder aktiv — an der Dublette hing laufende Arbeit.');
  }
  return s;
}
