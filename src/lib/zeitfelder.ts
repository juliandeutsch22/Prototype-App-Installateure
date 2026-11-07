/**
 * DIE REGEL DER FREIEN ZEITFELDER (M06b, N01) — dieselbe wie auf dem Server.
 *
 * Ein Betrieb legt eigene Angaben zu Zeitbuchungen fest (Kostenstelle,
 * Kilometer, Auftragsnummer …). Geprüft wird zweimal: hier, damit die Maske
 * vor dem Speichern sagt, was fehlt — auch ohne Netz, wo sie die Buchung
 * vormerkt —, und in der Datenbank (`app.zeitfeld_wert_fehler`,
 * `app.zeitfeld_regeln_fehler`, `app.zeitfeld_gilt` und der Auslöser
 * `app.zeitfelder_pruefen` in `20261108200000_freie_zeitfelder.sql`), weil
 * die Oberfläche keine Grenze ist. Die Meldungen sind Wort für Wort
 * dieselben; `tests/supabase/zeitfelderRegel.test.ts` vergleicht beide Seiten
 * an denselben Fällen.
 *
 * HIER UND NICHT IN `shared/`: keine Edge Function braucht die Regel — die
 * Werte reisen mit der Zeile der Buchung, und die prüft die Datenbank selbst.
 *
 * WIE IN SQL: Text verliert nur Leerzeichen am Rand (`btrim`), Längen zählen
 * Zeichen, nicht UTF-16-Einheiten.
 */
import type { Role, TimeEntry } from '@/types';
import { datumAT } from '@/lib/datum';
import { leseZahl, zahlAlsText } from '@/lib/zahl';

export type ZeitfeldTyp = 'text' | 'zahl' | 'janein' | 'auswahl' | 'datum';
export type ZeitfeldPflicht = 'nie' | 'beim_buchen' | 'nur_buero';
export type ZeitfeldWert = string | number | boolean;

export interface ZeitfeldOption {
  /** Stabile Kennung — der Wert ist sie, nicht der Text. */
  id: string;
  text: string;
  /** Deaktiviert: an alten Werten lesbar, neu nicht mehr wählbar. */
  aktiv: boolean;
}

export interface ZeitfeldRegeln {
  /** Text: höchstens so viele Zeichen (Vorgabe 200, höchstens 2000). */
  laenge?: number;
  /** Zahl: Grenzen, Nachkommastellen (Vorgabe 0), Einheit. */
  min?: number;
  max?: number;
  stellen?: number;
  einheit?: string;
  /** Auswahl. */
  optionen?: ZeitfeldOption[];
}

/** Ein Feld, wie es eine veröffentlichte Fassung festhält — ohne Namen und Reihenfolge. */
export interface ZeitfeldRegel {
  typ: ZeitfeldTyp;
  regeln: ZeitfeldRegeln;
  staende: string[];
  rollen: string[];
  pflicht: ZeitfeldPflicht;
}

export const ZEITFELD_TYPEN: { wert: ZeitfeldTyp; name: string }[] = [
  { wert: 'text', name: 'Text' },
  { wert: 'zahl', name: 'Zahl' },
  { wert: 'janein', name: 'Ja/Nein' },
  { wert: 'auswahl', name: 'Auswahl' },
  { wert: 'datum', name: 'Datum' },
];

export const ZEITFELD_PFLICHTEN: { wert: ZeitfeldPflicht; name: string }[] = [
  { wert: 'nie', name: 'Freiwillig' },
  { wert: 'beim_buchen', name: 'Pflicht beim Buchen' },
  { wert: 'nur_buero', name: 'Ergänzt das Büro' },
];

/**
 * Die Stände, für die ein Feld gelten kann — die in der Buchungsmaske
 * erfasst werden. Krank, Urlaub, Berufsschule und Freistellungen entstehen
 * über Meldung oder Antrag; im Krankenstand nähme ein Freitext zudem
 * Diagnosen auf, die nicht hingehören.
 */
export const ZEITFELD_STAENDE = ['Anwesend', 'Zeitausgleich'] as const;

/** Wer bucht: jede Rolle. Gespeichert wird sortiert wie in SQL. */
export const ZEITFELD_ROLLEN: Role[] = [
  'Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `btrim` von Postgres: nur Leerzeichen am Rand. */
function btrim(s: string): string {
  return s.replace(/^ +/, '').replace(/ +$/, '');
}

/** Zeichen wie `char_length`, nicht UTF-16-Einheiten. */
function zeichen(s: string): number {
  return [...s].length;
}

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Eine Zahl in einer Meldung: ohne Nachkomma-Nullen, mit Komma (wie `app.zeitfeld_zahl_text`). */
export function zahlText(n: number): string {
  return String(n).replace('.', ',');
}

/** Nachkommastellen einer Zahl, wie sie im JSON steht. */
function nachkommastellen(n: number): number {
  let text = String(n);
  if (/e/i.test(text)) text = n.toFixed(20).replace(/0+$/, '');
  return (text.split('.')[1] ?? '').length;
}

/** Die Regeln einer Definition — `null`, wenn sie stimmen, sonst der Grund (wie `app.zeitfeld_regeln_fehler`). */
export function regelnFehler(typ: string, regeln: unknown): string | null {
  if (!istObjekt(regeln)) return 'Die Regeln haben keine gültige Form';
  const erlaubt: Record<string, string[]> = {
    text: ['laenge'], zahl: ['min', 'max', 'stellen', 'einheit'], auswahl: ['optionen'], janein: [], datum: [],
  };
  if (!(typ in erlaubt)) return 'Unbekannter Typ';
  const fremd = Object.keys(regeln).filter((k) => !erlaubt[typ].includes(k)).sort()[0];
  if (fremd !== undefined) return `Unbekannte Regel „${fremd}“`;

  if (typ === 'text' && 'laenge' in regeln) {
    const l = regeln.laenge;
    if (typeof l !== 'number' || !Number.isInteger(l) || l < 1 || l > 2000) return 'Die Länge muss zwischen 1 und 2000 Zeichen liegen';
  } else if (typ === 'zahl') {
    if (('min' in regeln && typeof regeln.min !== 'number') || ('max' in regeln && typeof regeln.max !== 'number')) {
      return 'Mindest- und Höchstwert müssen Zahlen sein';
    }
    if (typeof regeln.min === 'number' && typeof regeln.max === 'number' && regeln.min > regeln.max) {
      return 'Der Mindestwert liegt über dem Höchstwert';
    }
    if ('stellen' in regeln) {
      const s = regeln.stellen;
      if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 4) return 'Nachkommastellen: 0 bis 4';
    }
    if ('einheit' in regeln && (typeof regeln.einheit !== 'string' || zeichen(regeln.einheit) > 20)) {
      return 'Die Einheit hat höchstens 20 Zeichen';
    }
  } else if (typ === 'auswahl') {
    const optionen = regeln.optionen;
    if (!Array.isArray(optionen) || optionen.length === 0) return 'Eine Auswahl braucht mindestens eine Option';
    if (optionen.length > 100) return 'Höchstens 100 Optionen';
    const kennungen: string[] = [];
    const texte: string[] = [];
    let aktive = 0;
    for (const o of optionen) {
      if (!istObjekt(o) || typeof o.id !== 'string' || !UUID.test(o.id)) return 'Jede Option braucht eine Kennung';
      if (typeof o.text !== 'string' || btrim(o.text) === '' || zeichen(btrim(o.text)) > 80) {
        return 'Jede Option braucht einen Text (höchstens 80 Zeichen)';
      }
      if (typeof o.aktiv !== 'boolean') return 'Jede Option ist wählbar oder nicht';
      if (kennungen.includes(o.id)) return 'Eine Option steht doppelt';
      const t = btrim(o.text).toLowerCase();
      if (texte.includes(t)) return 'Zwei Optionen heißen gleich';
      kennungen.push(o.id);
      texte.push(t);
      if (o.aktiv) aktive += 1;
    }
    if (aktive === 0) return 'Mindestens eine Option muss wählbar sein';
  }
  return null;
}

/** Ein Wert, wie er gespeichert wird: Text ohne Ränder, leer ist kein Wert (wie `app.zeitfeld_wert_norm`). */
export function wertNorm(w: unknown): ZeitfeldWert | null {
  if (w === null || w === undefined) return null;
  if (typeof w === 'string') {
    const t = btrim(w);
    return t === '' ? null : t;
  }
  if (typeof w === 'number' || typeof w === 'boolean') return w;
  return w as ZeitfeldWert;
}

/**
 * Ein Wert gegen sein Feld — `null`, wenn er passt, sonst der Grund (wie
 * `app.zeitfeld_wert_fehler`). `alt`: der bisherige Wert derselben Buchung;
 * eine deaktivierte Option bleibt an ihm stehen.
 */
export function wertFehler(feld: Pick<ZeitfeldRegel, 'typ' | 'regeln'>, wert: unknown, alt?: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  const regeln = feld.regeln ?? {};
  switch (feld.typ) {
    case 'text': {
      if (typeof wert !== 'string') return 'Bitte einen Text eingeben';
      const laenge = regeln.laenge ?? 200;
      return zeichen(wert) > laenge ? `Höchstens ${laenge} Zeichen` : null;
    }
    case 'zahl': {
      if (typeof wert !== 'number' || !Number.isFinite(wert)) return 'Bitte eine Zahl eingeben';
      if (typeof regeln.min === 'number' && wert < regeln.min) return `Mindestens ${zahlText(regeln.min)}`;
      if (typeof regeln.max === 'number' && wert > regeln.max) return `Höchstens ${zahlText(regeln.max)}`;
      const stellen = regeln.stellen ?? 0;
      if (nachkommastellen(wert) > stellen) {
        return stellen === 0 ? 'Bitte eine ganze Zahl eingeben' : `Höchstens ${stellen} Nachkommastellen`;
      }
      return null;
    }
    case 'janein':
      return typeof wert === 'boolean' ? null : 'Bitte Ja oder Nein wählen';
    case 'auswahl': {
      if (typeof wert !== 'string') return 'Bitte eine Option wählen';
      const option = (regeln.optionen ?? []).find((o) => o.id === wert);
      if (!option) return 'Diese Option gibt es nicht';
      if (option.aktiv === false && alt !== wert) return 'Diese Option ist nicht mehr wählbar';
      return null;
    }
    case 'datum': {
      if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return 'Bitte ein Datum eingeben';
      const [j, m, t] = wert.split('-').map(Number);
      const d = new Date(Date.UTC(j, m - 1, t));
      if (d.getUTCFullYear() !== j || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== t) return 'Dieses Datum gibt es nicht';
      if (j < 1900 || j > 2100) return 'Bitte ein Datum zwischen 1900 und 2100';
      return null;
    }
    default:
      return 'Unbekannter Typ';
  }
}

/** Stammt die Buchung aus einem Antrag, einer Meldung oder einer Freistellung? Dann gilt kein Feld. */
export function ausAntrag(e: Pick<TimeEntry, 'vacationId' | 'krankmeldungId' | 'freistellungId'>): boolean {
  return !!(e.vacationId || e.krankmeldungId || e.freistellungId);
}

/** Gilt das Feld für diese Buchung — Stand und Rolle der gebuchten Person (wie `app.zeitfeld_gilt`)? */
export function feldGilt(
  feld: Pick<ZeitfeldRegel, 'staende' | 'rollen'>,
  status: string | undefined,
  rolle: string | undefined,
  ausEinemAntrag: boolean,
): boolean {
  return !ausEinemAntrag && (feld.staende ?? []).includes(status ?? '') && (feld.rollen ?? []).includes(rolle ?? '');
}

/** Was die Maske über ein Feld wissen muss: die Regel der Fassung und den Namen der Definition. */
export interface Zeitfeld extends ZeitfeldRegel {
  id: string;
  name: string;
  reihenfolge: number;
}

/** Eine veröffentlichte Fassung: Nummer und Schnappschuss je Feld-Kennung. */
export interface ZeitfeldSatz {
  nummer: number;
  felder: Record<string, ZeitfeldRegel>;
}

/** Was die Definition zum Anzeigen braucht (auch eines beendeten Felds). */
export interface ZeitfeldAnzeige {
  id: string;
  name: string;
  typ: ZeitfeldTyp;
  regeln: ZeitfeldRegeln;
  reihenfolge: number;
  aktiv: boolean;
}

/** Die Felder einer Fassung in der Reihenfolge der Definitionen, mit Namen. */
export function felderDerFassung(satz: ZeitfeldSatz | null | undefined, definitionen: readonly ZeitfeldAnzeige[]): Zeitfeld[] {
  if (!satz) return [];
  const nachId = new Map(definitionen.map((d) => [d.id, d]));
  return Object.entries(satz.felder)
    .map(([id, regel]) => ({ ...regel, id, name: nachId.get(id)?.name ?? 'Freie Angabe', reihenfolge: nachId.get(id)?.reihenfolge ?? 0 }))
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.id.localeCompare(b.id));
}

/**
 * DIE PRÜFUNG EINER EINGABE vor dem Speichern — dieselben Schritte wie der
 * Auslöser: jeder geänderte Wert gegen die Fassung, die das Gerät kennt; beim
 * Anlegen jede Pflichtangabe „beim Buchen“, die für die Buchung gilt; beim
 * Ändern bleibt eine solche Angabe (nach der Fassung der Buchung) stehen.
 * Gibt die Meldungen zurück — leer heißt: geht.
 */
export function eingabeFehler(a: {
  satz: ZeitfeldSatz;
  /** Fassung der Buchung beim Eintreffen — nur beim Ändern. */
  buchungsSatz?: ZeitfeldSatz | null;
  namen: ReadonlyMap<string, string>;
  werte: Record<string, unknown>;
  alteWerte?: Record<string, ZeitfeldWert>;
  status: string;
  rolle: string | undefined;
  ausEinemAntrag: boolean;
  neu: boolean;
}): string[] {
  const fehler: string[] = [];
  const name = (id: string) => a.namen.get(id) ?? 'Freie Angabe';
  const geaendert: Record<string, ZeitfeldWert | null> = {};
  for (const [id, roh] of Object.entries(a.werte)) {
    const neu = wertNorm(roh);
    const alt = a.alteWerte?.[id] ?? null;
    if (neu === alt) continue;
    geaendert[id] = neu;
    if (neu === null) continue;
    const feld = a.satz.felder[id];
    if (!feld) {
      fehler.push(`„${name(id)}“ ist in dieser Fassung kein Feld (mehr) — bitte neu laden`);
      continue;
    }
    if (!feldGilt(feld, a.status, a.rolle, a.ausEinemAntrag)) {
      fehler.push(`„${name(id)}“ gilt nicht für diese Buchung`);
      continue;
    }
    const f = wertFehler(feld, neu, alt ?? undefined);
    if (f) fehler.push(`${name(id)}: ${f}`);
  }
  if (a.neu) {
    const fehlend = Object.entries(a.satz.felder)
      .filter(([id, f]) => f.pflicht === 'beim_buchen' && feldGilt(f, a.status, a.rolle, a.ausEinemAntrag) && wertNorm(a.werte[id]) === null)
      .map(([id]) => id);
    // Wie in SQL: in der Reihenfolge der Definitionen (`namen` kommt in ihr).
    const stelle = [...a.namen.keys()];
    fehlend.sort((x, y) => (stelle.indexOf(x) - stelle.indexOf(y)) || x.localeCompare(y));
    if (fehlend.length > 0) fehler.push(`Bitte ausfüllen: ${fehlend.map(name).join(', ')}`);
  } else if (a.buchungsSatz) {
    const bleibt = Object.entries(geaendert)
      .filter(([id, w]) => {
        const f = a.buchungsSatz!.felder[id];
        return w === null && f?.pflicht === 'beim_buchen' && feldGilt(f, a.status, a.rolle, a.ausEinemAntrag);
      })
      .map(([id]) => id)
      .sort();
    if (bleibt.length > 0) fehler.push(`Pflichtangabe bleibt: ${bleibt.map(name).join(', ')}`);
  }
  return fehler;
}

/**
 * WAS AN EINER BUCHUNG OFFEN IST — gerechnet beim Lesen, nach der Fassung,
 * die beim Eintreffen der Buchung galt:
 *  - `nachpflege`: Pflicht beim Buchen, aber ohne Wert — das gibt es nur bei
 *    einer Buchung, die mit einer älteren Fassung (offline vorgemerkt) oder
 *    ohne Angaben (ältere App, Aufteilen) eingetroffen ist;
 *  - `fehlt`: „Ergänzt das Büro“ ohne Wert.
 * Nur Felder, die es noch gibt: ein beendetes lässt sich nicht mehr füllen.
 */
export function offeneAngaben(
  satz: ZeitfeldSatz | null | undefined,
  definitionen: readonly ZeitfeldAnzeige[],
  buchung: Pick<TimeEntry, 'status' | 'vacationId' | 'krankmeldungId' | 'freistellungId'>,
  rolle: string | undefined,
  werte: Record<string, ZeitfeldWert> | undefined,
): { fehlt: string[]; nachpflege: string[] } {
  const fehlt: string[] = [];
  const nachpflege: string[] = [];
  if (!satz) return { fehlt, nachpflege };
  const antrag = ausAntrag(buchung);
  for (const d of [...definitionen].sort((a, b) => a.reihenfolge - b.reihenfolge)) {
    const f = satz.felder[d.id];
    if (!f || !d.aktiv || f.pflicht === 'nie') continue;
    if (!feldGilt(f, buchung.status, rolle, antrag)) continue;
    if (werte?.[d.id] !== undefined && werte[d.id] !== null) continue;
    (f.pflicht === 'beim_buchen' ? nachpflege : fehlt).push(d.name);
  }
  return { fehlt, nachpflege };
}

/** Ein Wert als Text — für Liste, Monatsansicht und Export. */
export function wertText(feld: Pick<ZeitfeldAnzeige, 'typ' | 'regeln'>, wert: ZeitfeldWert | null | undefined): string {
  if (wert === null || wert === undefined) return '';
  switch (feld.typ) {
    case 'zahl':
      return typeof wert === 'number'
        ? `${zahlText(wert)}${feld.regeln?.einheit ? ` ${feld.regeln.einheit}` : ''}`
        : String(wert);
    case 'janein':
      return wert === true ? 'Ja' : wert === false ? 'Nein' : String(wert);
    case 'auswahl':
      return (feld.regeln?.optionen ?? []).find((o) => o.id === wert)?.text ?? String(wert);
    case 'datum':
      return datumAT(String(wert));
    default:
      return String(wert);
  }
}

/** Die Angaben einer Buchung als „Name: Wert“ in der Reihenfolge der Definitionen. */
export function angabenText(
  definitionen: readonly ZeitfeldAnzeige[],
  werte: Record<string, ZeitfeldWert> | undefined,
): string[] {
  if (!werte) return [];
  return [...definitionen]
    .sort((a, b) => a.reihenfolge - b.reihenfolge)
    .filter((d) => werte[d.id] !== undefined && werte[d.id] !== null)
    .map((d) => `${d.name}: ${wertText(d, werte[d.id])}`);
}

/**
 * Was ein Eingabefeld liefert, als Wert — oder der Grund, warum nicht.
 * Ja/Nein kommt aus einer Auswahl („ja“, „nein“, leer): ein Kästchen kennte
 * kein „keine Angabe“, und dann wäre eine Pflicht nie offen.
 */
export function wertAusEingabe(typ: ZeitfeldTyp, roh: string): { wert: ZeitfeldWert | null; fehler: string | null } {
  const t = btrim(roh ?? '');
  if (t === '') return { wert: null, fehler: null };
  if (typ === 'zahl') {
    const z = leseZahl(t, { negativ: true });
    return z.fehler || z.wert === null ? { wert: null, fehler: 'Bitte eine Zahl eingeben' } : { wert: z.wert, fehler: null };
  }
  if (typ === 'janein') {
    if (t === 'ja') return { wert: true, fehler: null };
    if (t === 'nein') return { wert: false, fehler: null };
    return { wert: null, fehler: 'Bitte Ja oder Nein wählen' };
  }
  return { wert: t, fehler: null };
}

/** Ein gespeicherter Wert als Inhalt des Eingabefelds. */
export function wertAlsEingabe(typ: ZeitfeldTyp, wert: ZeitfeldWert | null | undefined): string {
  if (wert === null || wert === undefined) return '';
  if (typ === 'janein') return wert === true ? 'ja' : wert === false ? 'nein' : '';
  if (typ === 'zahl' && typeof wert === 'number') return zahlAlsText(wert);
  return String(wert);
}

/** Die Überschrift einer Spalte im Export: der Name, bei einer Zahl mit Einheit. */
export function spaltenKopf(d: Pick<ZeitfeldAnzeige, 'name' | 'typ' | 'regeln'>): string {
  return d.typ === 'zahl' && d.regeln?.einheit ? `${d.name} (${d.regeln.einheit})` : d.name;
}

/** Ein Wert in einer Spalte des Exports — die Zahl ohne Einheit (die steht im Kopf). */
export function spaltenWert(d: Pick<ZeitfeldAnzeige, 'typ' | 'regeln'>, wert: ZeitfeldWert | null | undefined): string {
  if (wert === null || wert === undefined) return '';
  return d.typ === 'zahl' && typeof wert === 'number' ? zahlText(wert) : wertText(d, wert);
}

/**
 * Welche Felder der Export als Spalten führt: jedes, das in Gebrauch ist,
 * und jedes beendete, das an einer der Buchungen einen Wert trägt — in der
 * Reihenfolge der Definitionen. Ohne Felder keine Spalte: dann bleibt die
 * Datei Spalte für Spalte, wie sie war.
 */
export function exportSpalten(
  definitionen: readonly ZeitfeldAnzeige[],
  werte: ReadonlyMap<string, Record<string, ZeitfeldWert>>,
  eintragIds: readonly string[],
): ZeitfeldAnzeige[] {
  const mitWert = new Set<string>();
  for (const id of eintragIds) for (const f of Object.keys(werte.get(id) ?? {})) mitWert.add(f);
  return [...definitionen]
    .filter((d) => d.aktiv || mitWert.has(d.id))
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'));
}

/** Die Werte je Buchung aus den Zeilen der Tabelle. */
export function werteJeBuchung(zeilen: readonly { eintragId: string; feldId: string; wert: ZeitfeldWert }[]): Map<string, Record<string, ZeitfeldWert>> {
  const je = new Map<string, Record<string, ZeitfeldWert>>();
  for (const z of zeilen) {
    const w = je.get(z.eintragId) ?? {};
    w[z.feldId] = z.wert;
    je.set(z.eintragId, w);
  }
  return je;
}
