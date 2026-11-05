/**
 * Das Änderungsprotokoll einer Zeitbuchung in Worten (E50).
 *
 * Die Datenbank hält Spaltennamen und Rohwerte fest („end_time“,
 * „15:00:00“) — das ist, was gespeichert war, und gehört so ins Protokoll.
 * Lesen soll es aber ein Monteur oder die Buchhaltung: „Ende 15:00 → 14:00“.
 * Was niemand außer der Datenbank versteht (Kennungen von Antrag,
 * Krankmeldung, Baustelle), steht nicht als Zeile da; ändert sich nur so
 * etwas, sagt das Protokoll „Verknüpfung geändert“ statt nichts.
 */
import type { VerlaufZeile } from '@/lib/db/zeitbuchungVerlauf';
import { datumAT } from '@/lib/datum';

type Format = (w: unknown) => string;

const leer = (w: unknown) => w === null || w === undefined || w === '';
const text: Format = (w) => (leer(w) ? '—' : String(w));
const uhrzeit: Format = (w) => (leer(w) ? '—' : String(w).slice(0, 5));
const minuten: Format = (w) => (leer(w) ? '—' : `${Number(w)} Min.`);
const janein: Format = (w) => (w === true ? 'ja' : w === false ? 'nein' : '—');
const tag: Format = (w) => (leer(w) ? '—' : datumAT(String(w)));

/** Was im Protokoll lesbar steht — in dieser Reihenfolge. */
const FELDER: [spalte: string, name: string, format: Format][] = [
  ['date', 'Tag', tag],
  ['status', 'Art', text],
  ['start_time', 'Beginn', uhrzeit],
  ['end_time', 'Ende', uhrzeit],
  ['break_duration', 'Pause', minuten],
  ['travel_time', 'Fahrzeit', minuten],
  ['customer_name', 'Kunde', text],
  ['project_number', 'Baustelle', text],
  ['comment', 'Notiz', text],
  ['is_night_work', 'Nachtarbeit', janein],
  ['nacht_abgewaehlt', 'Nachtarbeit abgewählt', text],
  ['is_emergency', 'Notdienst', janein],
  ['is_helper', 'Als Helfer', janein],
  ['helper_name', 'Helfer', text],
  ['vehicle_plate', 'Fahrzeug', text],
  ['unterricht_min', 'Unterricht', minuten],
  ['wegzeit_min', 'Weg zur Schule', minuten],
  ['ins_budget', 'Ins Baustellenbudget', janein],
  ['is_billed', 'Verrechnet', janein],
  ['invoice_number', 'Rechnung', text],
  ['user_name', 'Name', text],
];

const ART: Record<VerlaufZeile['art'], string> = {
  angelegt: 'Angelegt',
  geaendert: 'Geändert',
  geloescht: 'Gelöscht',
};

export interface VerlaufEintrag {
  /** „Geändert von Erna Beispiel“ */
  titel: string;
  /** „05.11.2026, 14:03“ */
  zeit: string;
  /** Je Angabe eine Zeile: „Ende 15:00 → 14:00“ oder beim Anlegen „Beginn 07:00“. */
  zeilen: string[];
}

function wann(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Eine Zeile des Protokolls in Worten. */
export function verlaufEintrag(z: VerlaufZeile): VerlaufEintrag {
  const titel = `${ART[z.art]}${z.vonName ? ` von ${z.vonName}` : ''}`;
  const zeilen: string[] = [];
  if (z.art === 'geaendert') {
    for (const [spalte, name, format] of FELDER) {
      const w = z.aenderungen[spalte] as { alt: unknown; neu: unknown } | undefined;
      if (w) zeilen.push(`${name} ${format(w.alt)} → ${format(w.neu)}`);
    }
    if (zeilen.length === 0) zeilen.push('Verknüpfung geändert (Antrag, Meldung oder Baustelle)');
  } else {
    for (const [spalte, name, format] of FELDER) {
      const w = z.aenderungen[spalte];
      // Beim ganzen Stand nur, was etwas sagt: keine leeren Felder, kein „nein“.
      if (!leer(w) && w !== false) zeilen.push(`${name} ${format(w)}`);
    }
  }
  return { titel, zeit: wann(z.am), zeilen };
}

/** Seit wann aufgezeichnet wird — davor weiß niemand mehr, was geändert wurde (Altdaten). */
export const PROTOKOLL_SEIT = '2026-11-05';
