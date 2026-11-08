/**
 * Der Verlauf eines Geschäftsobjekts in Worten (M01b).
 *
 * Die Datenbank hält Spaltennamen und Rohwerte fest („contact_phone“,
 * „0.2“) — das ist, was gespeichert war, und gehört so ins Journal. Lesen
 * soll es aber das Büro: „Telefon 0664 1 → 0664 2“, „USt-Satz 20 % → 10 %“.
 *
 * DIE LISTEN NENNEN JEDE PROTOKOLLIERTE SPALTE. Was hier fehlt, steht in der
 * Ausnahmeliste des Triggers (`20261106100000_aenderungsjournal.sql`) —
 * `tests/supabase/aenderungsjournal.test.ts` vergleicht beides mit dem
 * Schema, damit eine neue Spalte nicht still als Rohname erscheint oder
 * fehlt. Die Namen sind die der jeweiligen Akte.
 */
import type { Objektart, ObjektVerlaufZeile } from '@/lib/db/objektVerlauf';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import { EINSTUFUNGEN } from '@/lib/einstufung';
import { tageText } from '@/features/vacations/abwesenheitText';

/** Was eine Anzeige außer dem Wert braucht: Namen zu Kennungen der Belegschaft. */
export interface VerlaufKontext {
  name?: (uid: string) => string | undefined;
  /** Die Bezeichnung eines Tops (Beteiligte einer Liegenschaft, M02c). */
  top?: (id: string) => string | undefined;
  /** Der Name eines Kunden (Beteiligte einer Liegenschaft, M02c). */
  kunde?: (id: string) => string | undefined;
}

type Format = (w: unknown, k: VerlaufKontext) => string;

const ZAHL = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });
const leer = (w: unknown) =>
  w === null || w === undefined || w === '' || (Array.isArray(w) && w.length === 0)
  || (typeof w === 'object' && !Array.isArray(w) && Object.keys(w as object).length === 0);
const zahlVon = (w: unknown) => Number(w);

const text: Format = (w) => (leer(w) ? '—' : String(w));
const datum: Format = (w) => (leer(w) ? '—' : datumAT(String(w).slice(0, 10)));
const zeitpunkt: Format = (w) => (leer(w) ? '—' : wann(Date.parse(String(w))));
const janein: Format = (w) => (w === true ? 'ja' : w === false ? 'nein' : '—');
const zahl: Format = (w) => (leer(w) ? '—' : ZAHL.format(zahlVon(w)));
const geld: Format = (w) => (leer(w) ? '—' : euro(zahlVon(w)));
const prozent: Format = (w) => (leer(w) ? '—' : `${ZAHL.format(zahlVon(w))} %`);
/** Ein Anteil wie der USt-Satz (0.2 = 20 %). */
const anteil: Format = (w) => (leer(w) ? '—' : `${ZAHL.format(zahlVon(w) * 100)} %`);
const stunden: Format = (w) => (leer(w) ? '—' : `${ZAHL.format(zahlVon(w))} h`);
const monate: Format = (w) => (leer(w) ? '—' : `${ZAHL.format(zahlVon(w))} ${zahlVon(w) === 1 ? 'Monat' : 'Monate'}`);
const auswahl = (namen: Record<string, string>): Format => (w) => (leer(w) ? '—' : namen[String(w)] ?? String(w));
const personen: Format = (w, k) => {
  if (leer(w) || !Array.isArray(w)) return '—';
  // Eine Kennung ohne Namen: die Person ist nicht mehr in der Belegschaft (oder die Liste noch nicht da).
  return w.map((uid) => k.name?.(String(uid)) ?? 'unbekannte Person').join(', ');
};
const WOCHENTAGE: [number, string][] = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
const wochentage: Format = (w) => {
  if (leer(w) || !Array.isArray(w)) return '—';
  const tage = w.map(Number);
  return WOCHENTAGE.filter(([n]) => tage.includes(n)).map(([, t]) => t).join(', ') || '—';
};
const tagessoll: Format = (w) => {
  if (leer(w) || typeof w !== 'object') return '—';
  const soll = w as Record<string, unknown>;
  return WOCHENTAGE.filter(([n]) => soll[String(n)] != null)
    .map(([n, t]) => `${t} ${ZAHL.format(Number(soll[String(n)]))} Std.`).join(' · ') || '—';
};
const einstufung = auswahl(Object.fromEntries(EINSTUFUNGEN.map((e) => [e.wert, e.name])));
const kundenart = auswahl({ privat: 'Privatperson', unternehmen: 'Unternehmen' });
const rabattArt = auswahl({ percent: 'Prozent', amount: 'Betrag' });
const rechnungsart = auswahl({ einzel: 'Rechnung', anzahlung: 'Anzahlungsrechnung', teil: 'Teilrechnung', schluss: 'Schlussrechnung' });
const ruecklassArt = auswahl({ haft: 'Haftrücklass', deckung: 'Deckungsrücklass' });
// Dieselben Wörter wie `eingangText.ts` — hier ohne Abhängigkeit vom Bereich, wie die übrigen Listen.
const eingangStand = auswahl({ offen: 'Offen', uebernommen: 'Übernommen', abgelehnt: 'Abgelehnt' });
const eingangQuelle = auswahl({
  telefon: 'Telefon', email: 'E-Mail', hausverwaltung: 'Hausverwaltung', versicherung: 'Versicherung',
  persoenlich: 'Persönlich', sonstige: 'Sonstige',
});
const dringlichkeit = auswahl({ normal: 'Normal', dringend: 'Dringend', notfall: 'Notfall' });
// Dieselben Wörter wie `ROLLE_TEXT` in `liegenschaftText.ts` und `app.beteiligter_rolle_text`.
const beteiligtenRolle = auswahl({
  eigentuemer: 'Eigentümer', hausverwaltung: 'Hausverwaltung', betreiber: 'Betreiber', nutzer: 'Nutzer bzw. Mieter',
  auftraggeber: 'Auftraggeber', rechnungsempfaenger: 'Rechnungsempfänger', versicherung: 'Versicherung',
  lieferadresse: 'Lieferadresse',
});
/** Ein Top über seine Kennung; ohne Namen ist es gelöscht oder (noch) nicht geladen. */
const topName: Format = (w, k) => (leer(w) ? 'die ganze Liegenschaft' : k.top?.(String(w)) ?? 'ein anderes Top');
/** Ein Kunde über seine Kennung — ohne Kunden standen freie Angaben da. */
const kundeName: Format = (w, k) => (leer(w) ? 'freie Angaben' : k.kunde?.(String(w)) ?? 'ein anderer Kunde');

type Feld = [spalte: string, name: string, format: Format];

/** Die Kopfangaben, die Angebot und Rechnung teilen — Rabatt und Summen. */
const RABATT_UND_SUMMEN: Feld[] = [
  ['subtotal_netto', 'Zwischensumme netto', geld],
  ['discount_mode', 'Rabatt als', rabattArt],
  ['discount_value', 'Rabattwert', zahl],
  ['discount_label', 'Rabattbezeichnung', text],
  ['discount_amount', 'Rabatt', geld],
  ['total_netto', 'Summe netto', geld],
  ['vat_rate', 'USt-Satz', anteil],
  ['total_vat', 'USt', geld],
  ['total_brutto', 'Summe brutto', geld],
];

/** Was im Verlauf lesbar steht — je Objektart in dieser Reihenfolge. */
export const VERLAUF_FELDER: Record<Objektart, Feld[]> = {
  kunde: [
    ['name', 'Name', text],
    ['kundennummer', 'Kundennummer', text],
    ['kundenart', 'Kundenart', kundenart],
    ['lieferantennummer', 'Unsere Lieferantennummer', text],
    ['contact_name', 'Ansprechpartner', text],
    ['contact_phone', 'Telefon', text],
    ['email', 'E-Mail', text],
    ['address', 'Rechnungsanschrift', text],
    ['strasse', 'Straße', text],
    ['plz', 'PLZ', text],
    ['ort', 'Ort', text],
    ['land', 'Land', text],
    ['vat_id', 'UID-Nummer', text],
    ['notes', 'Notiz', text],
    ['active', 'Aktiv', janein],
  ],
  baustelle: [
    ['project_number', 'Baustellennummer', text],
    ['bezeichnung', 'Bezeichnung', text],
    ['customer_name', 'Kunde', text],
    ['address', 'Baustellenadresse', text],
    ['description', 'Auftragsumfang', text],
    ['status', 'Stand', text],
    ['billing_mode', 'Abrechnung', text],
    ['estimated_hours', 'Stundenbudget', stunden],
    ['start_date', 'Beginn', datum],
    ['end_date', 'Ende geplant', datum],
    ['contact_name', 'Ansprechpartner vor Ort', text],
    ['contact_phone', 'Telefon vor Ort', text],
    ['assigned_employees', 'Team', personen],
    ['project_managers', 'Projektleitung', personen],
    // M02c: Liegenschaft und Top — die Bezeichnungen; die Kennungen sind ausgenommen.
    ['liegenschaft_bezeichnung', 'Liegenschaft', text],
    ['top_bezeichnung', 'Top', text],
  ],
  angebot: [
    ['quote_number', 'Angebotsnummer', text],
    ['status', 'Stand', text],
    ['customer_name', 'Kunde', text],
    ['address', 'Ort der Leistung', text],
    ['quote_date', 'Angebotsdatum', datum],
    ['valid_until', 'Gültig bis', datum],
    ['project_number', 'Baustelle', text],
    ['kalkulierte_stunden', 'Kalkulierte Stunden', stunden],
    ...RABATT_UND_SUMMEN,
    ['notes', 'Anmerkungen', text],
    // M02c: Liegenschaft und Top — die Bezeichnungen; die Kennungen sind ausgenommen.
    ['liegenschaft_bezeichnung', 'Liegenschaft', text],
    ['top_bezeichnung', 'Top', text],
  ],
  rechnung: [
    ['invoice_number', 'Rechnungsnummer', text],
    ['art', 'Art', rechnungsart],
    ['payment_status', 'Stand', text],
    ['customer_name', 'Kunde', text],
    ['address', 'Anschrift', text],
    ['customer_vat_id', 'UID des Kunden', text],
    ['project_number', 'Baustelle', text],
    ['invoice_date', 'Rechnungsdatum', datum],
    ['due_date', 'Fällig', datum],
    ['leistung_von', 'Leistung von', datum],
    ['leistung_bis', 'Leistung bis', datum],
    ['leistungsort', 'Leistungsort', text],
    ['bestellnummer', 'Bestellnummer des Kunden', text],
    ...RABATT_UND_SUMMEN,
    ['gesamt_netto', 'Gesamt netto', geld],
    ['gesamt_vat', 'Gesamt USt', geld],
    ['gesamt_brutto', 'Gesamt brutto', geld],
    ['reverse_charge', 'Reverse Charge', janein],
    ['steuerbefreiung', 'Steuerbefreiung', text],
    ['skonto_prozent', 'Skonto', prozent],
    ['skonto_bis', 'Skonto bis', datum],
    ['ruecklass_art', 'Rücklass', ruecklassArt],
    ['ruecklass_prozent', 'Rücklass in Prozent', prozent],
    ['ruecklass_betrag', 'Rücklassbetrag', geld],
    ['ruecklass_bis', 'Rücklass fällig am', datum],
    ['ruecklass_garantie_am', 'Bankgarantie am', datum],
    ['ruecklass_garantie_bank', 'Bank der Garantie', text],
    ['ruecklass_garantie_nr', 'Nummer der Garantie', text],
    ['ruecklass_garantie_bis', 'Garantie gültig bis', datum],
    ['cancellation_note', 'Storno', text],
    ['cancelled_at', 'Storniert am', zeitpunkt],
    ['storno_nummer', 'Stornorechnung', text],
    ['storno_am', 'Stornorechnung am', zeitpunkt],
  ],
  zahlung: [
    ['datum', 'Datum', datum],
    ['betrag', 'Betrag', geld],
    ['art', 'Art', text],
    ['hinweis', 'Hinweis', text],
  ],
  wartung: [
    ['customer_name', 'Kunde', text],
    ['anlage', 'Anlage', text],
    ['address', 'Standort', text],
    ['intervall_monate', 'Intervall', monate],
    ['zuletzt_am', 'Zuletzt gewartet', datum],
    ['faellig_am', 'Nächster Termin', datum],
    ['offene_baustelle', 'Eingeplant auf Baustelle', text],
    ['letzte_baustelle', 'Letzte Baustelle', text],
    ['aktiv', 'Aktiv', janein],
    ['hinweis', 'Hinweis', text],
    ['hersteller', 'Hersteller', text],
    ['typ', 'Typ', text],
    ['seriennummer', 'Seriennummer', text],
    ['baujahr', 'Baujahr', text],
    ['preis', 'Preis je Wartung', geld],
    ['liegenschaft_bezeichnung', 'Liegenschaft', text],
    ['top_bezeichnung', 'Top', text],
  ],
  eingang: [
    ['nummer', 'Eingangsnummer', text],
    ['stand', 'Stand', eingangStand],
    ['quelle', 'Quelle', eingangQuelle],
    ['auftraggeber_nummer', 'Nummer des Auftraggebers', text],
    ['kunde_name', 'Kunde', text],
    ['neukunde_name', 'Neuer Kunde', text],
    ['neukunde_strasse', 'Straße des neuen Kunden', text],
    ['neukunde_plz', 'PLZ des neuen Kunden', text],
    ['neukunde_ort', 'Ort des neuen Kunden', text],
    ['neukunde_telefon', 'Telefon des neuen Kunden', text],
    ['neukunde_email', 'E-Mail des neuen Kunden', text],
    ['ort', 'Ort des Einsatzes', text],
    ['ansprechpartner_name', 'Ansprechpartner vor Ort', text],
    ['ansprechpartner_telefon', 'Telefon vor Ort', text],
    ['anliegen', 'Anliegen', text],
    ['dringlichkeit', 'Dringlichkeit', dringlichkeit],
    ['wunschtermin', 'Wunschtermin', datum],
    ['eingegangen_am', 'Eingegangen am', zeitpunkt],
    ['abgelehnt_grund', 'Grund der Ablehnung', text],
    ['liegenschaft_bezeichnung', 'Liegenschaft', text],
    ['top_bezeichnung', 'Top', text],
  ],
  /*
    M02c: die Liegenschaft, ihre Tops und Beteiligten. Die Anschrift als
    Zeile rechnet die Datenbank aus den Teilen; die Kennung der Liegenschaft
    steht bei Top und Beteiligtem als Bezug.
  */
  liegenschaft: [
    ['bezeichnung', 'Bezeichnung', text],
    ['strasse', 'Straße', text],
    ['plz', 'PLZ', text],
    ['ort', 'Ort', text],
    ['land', 'Land', text],
    ['notiz', 'Notiz', text],
    ['aktiv', 'Aktiv', janein],
  ],
  top: [
    ['bezeichnung', 'Bezeichnung', text],
    ['lage', 'Stockwerk bzw. Lage', text],
    ['notiz', 'Notiz', text],
    ['aktiv', 'Aktiv', janein],
  ],
  beteiligter: [
    ['rolle', 'Rolle', beteiligtenRolle],
    ['top_id', 'Top', topName],
    ['customer_id', 'Kunde', kundeName],
    ['name', 'Name', text],
    ['telefon', 'Telefon', text],
    ['email', 'E-Mail', text],
    ['hinweis', 'Hinweis', text],
    ['gueltig_ab', 'Gültig ab', datum],
    ['gueltig_bis', 'Gültig bis', datum],
  ],
  benutzer: [
    ['name', 'Name', text],
    ['email', 'Anmeldename', text],
    ['role', 'Rolle', text],
    ['active', 'Aktiv', janein],
    ['einstufung', 'Einstufung', einstufung],
    ['lehrbeginn', 'Lehrbeginn', datum],
    ['lehrzeit_monate', 'Lehrzeit', monate],
    ['stunden_ins_budget', 'Stunden ins Projekt-Budget', janein],
    ['eintritt', 'Eintrittsdatum', datum],
    ['kunden_pflegen', 'Kunden pflegen', janein],
    ['katalog_einspielen', 'Katalog einspielen', janein],
    ['einkauf_sehen', 'Einkaufspreise sehen', janein],
    ['rechnungen_lesen', 'Rechnungen lesen', janein],
    ['fuehrt_zeitkonto', 'Zeitkonto', janein],
    ['weekly_target_hours', 'Wochenstunden', zahl],
    ['yearly_vacation_days', 'Urlaubstage pro Jahr', zahl],
    ['work_days', 'Arbeitstage', wochentage],
    ['tagessoll', 'Tagessoll je Wochentag', tagessoll],
    ['app_start_date', 'Saldo-Startdatum', datum],
    ['initial_overtime', 'Start-Saldo (Stunden)', zahl],
    ['initial_vacation_days', 'Urlaub zu Beginn', zahl],
  ],
};

export interface VerlaufEintrag {
  /** „Geändert von Erna Beispiel“ */
  titel: string;
  /** „06.11.2026, 14:03“ */
  zeit: string;
  /** Je Angabe eine Zeile: „Telefon 0664 1 → 0664 2“. */
  zeilen: string[];
}

function wann(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const ART: Record<'angelegt' | 'geaendert' | 'geloescht', string> = {
  angelegt: 'Angelegt',
  geaendert: 'Geändert',
  geloescht: 'Gelöscht',
};
const ZAHLUNG: Record<'angelegt' | 'geaendert' | 'geloescht', string> = {
  angelegt: 'Zahlung erfasst',
  geaendert: 'Zahlung geändert',
  geloescht: 'Zahlung gelöscht',
};
/** Was unter seinem Bezug steht (Zahlung, Top, Beteiligter) — der Titel sagt, was es war. */
const UNTER: Partial<Record<Objektart, Record<'angelegt' | 'geaendert' | 'geloescht', string>>> = {
  zahlung: ZAHLUNG,
  top: { angelegt: 'Top angelegt', geaendert: 'Top geändert', geloescht: 'Top gelöscht' },
  beteiligter: { angelegt: 'Beteiligter eingetragen', geaendert: 'Beteiligter geändert', geloescht: 'Beteiligter entfernt' },
};

/** Die Zeilen einer Änderung: je Spalte alt → neu, oder dass die Werte gelöscht sind. */
function aenderungsZeilen(z: ObjektVerlaufZeile, k: VerlaufKontext): string[] {
  const felder = VERLAUF_FELDER[z.objektart] ?? [];
  const bekannt = new Set(felder.map(([s]) => s));
  const zeilen: string[] = [];
  for (const [spalte, name, format] of felder) {
    const w = z.aenderungen[spalte] as { alt?: unknown; neu?: unknown; entfernt?: boolean } | undefined;
    if (!w) continue;
    if (w.entfernt) {
      // Beim Beteiligten gingen sie mit ihm selbst (M02c), sonst mit den Daten des Kunden.
      zeilen.push(z.objektart === 'beteiligter'
        ? `${name} geändert (Werte mit dem Beteiligten gelöscht)`
        : `${name} geändert (Werte mit den Kundendaten gelöscht)`);
      continue;
    }
    const alt = format(w.alt, k);
    const neu = format(w.neu, k);
    // „“ statt nichts, eine leere statt keiner Liste: für den Leser dasselbe.
    if (alt !== neu) zeilen.push(`${name} ${alt} → ${neu}`);
  }
  // Eine Spalte, die die Liste (noch) nicht kennt, verschwindet nicht.
  for (const spalte of Object.keys(z.aenderungen)) {
    if (!bekannt.has(spalte)) zeilen.push(`Angabe „${spalte}“ geändert`);
  }
  return zeilen;
}

/** Die Angaben eines vorhandenen Verlaufs (Mahnung, Ausführung, …) und sein Titel. */
function quellenEintrag(z: ObjektVerlaufZeile): { titel: string; zeilen: string[] } {
  const a = z.aenderungen;
  const zeilen: string[] = [];
  switch (z.art) {
    case 'gemahnt':
      zeilen.push(`Mahndatum ${datum(a.datum, {})}`, `Frist ${datum(a.frist, {})}`);
      if (Number(a.spesen) > 0) zeilen.push(`Spesen ${geld(a.spesen, {})}`);
      return { titel: `Gemahnt (Stufe ${String(a.stufe)})`, zeilen };
    case 'ausgefuehrt':
      zeilen.push(`Am ${datum(a.am, {})}`);
      if (!leer(a.baustelle)) zeilen.push(`Baustelle ${String(a.baustelle)}`);
      return { titel: 'Wartung ausgeführt', zeilen };
    case 'konto_umgestellt':
      zeilen.push(`Anmeldung jetzt mit ${a.nach === 'benutzername' ? 'Benutzername' : 'E-Mail-Adresse'}`);
      if (!leer(a.grund)) zeilen.push(`Grund: ${String(a.grund)}`);
      return { titel: 'Konto umgestellt', zeilen };
    case 'urlaubsanspruch_angepasst':
    case 'urlaubsanspruch_entfernt': {
      const tage = Number(a.tage);
      zeilen.push(`Urlaubsjahr ${String(a.urlaubsjahr)}`, `${tage > 0 ? '+' : ''}${tageText(tage)}`);
      if (!leer(a.grund)) zeilen.push(`Grund: ${String(a.grund)}`);
      return {
        titel: z.art === 'urlaubsanspruch_angepasst' ? 'Urlaubsanspruch angepasst' : 'Anpassung des Urlaubsanspruchs entfernt',
        zeilen,
      };
    }
    default:
      return { titel: 'Eintrag', zeilen };
  }
}

/** Eine Zeile des Verlaufs in Worten. */
export function verlaufEintrag(z: ObjektVerlaufZeile, k: VerlaufKontext = {}): VerlaufEintrag {
  let titel: string;
  let zeilen: string[];
  if (z.art === 'angelegt' || z.art === 'geaendert' || z.art === 'geloescht') {
    const unter = UNTER[z.objektart];
    titel = (unter ?? ART)[z.art];
    zeilen = z.art === 'geaendert' ? aenderungsZeilen(z, k) : [];
    if (z.art === 'geaendert' && zeilen.length === 0) zeilen.push('Keine sichtbare Änderung');
    // Zahlung, Top und Beteiligter haben keine eigene Akte: woran man sie erkennt, steht dabei. Ebenso bei allem Gelöschten.
    if ((unter || z.art === 'geloescht') && z.bezeichnung) zeilen.unshift(z.bezeichnung);
  } else {
    ({ titel, zeilen } = quellenEintrag(z));
  }
  return { titel: `${titel}${z.vonName ? ` von ${z.vonName}` : ''}`, zeit: wann(z.am), zeilen };
}

/** Seit wann aufgezeichnet wird — davor weiß niemand mehr, was geändert wurde (Altdaten). */
export const JOURNAL_SEIT = '2026-11-06';
