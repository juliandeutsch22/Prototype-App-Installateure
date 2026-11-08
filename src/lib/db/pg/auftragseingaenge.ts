/**
 * Auftragseingang (M02b, A03/A11) — auf Postgres.
 *
 * Erfassen und Ändern gehen direkt auf die Tabelle; wer darf und welche
 * Spalten, entscheiden Zeilenschutz und Spaltenrechte
 * (`20261107300000_auftragseingang.sql`). Nummer, Stand und „wer, wann“
 * setzt die Datenbank. Umwandeln, ablehnen, wieder öffnen und den Kunden
 * anlegen nur über ihre Funktionen — jede in einem Zug.
 */
import type { Abrechnungsart, Auftragseingang, EingangStand } from '@/types';
import { aendern, anlegen, derClient, loeschen, zaehlen, abfragen } from './kern';
import { zeileAlsObjekt } from './felder';
import { oderUeberSpalten } from './suche';

const TABELLE = 'auftragseingaenge';

/** Wie viele Eingänge eine Seite der Liste trägt — „Weitere anzeigen“ holt die nächste. */
export const EINGANG_SEITE = 50;

/** Was am Eingang erfasst und geändert wird — der Rest gehört der Datenbank. */
export type EingangEingabe = Pick<
  Auftragseingang,
  | 'quelle' | 'auftraggeberNummer' | 'customerId' | 'neukundeName' | 'neukundeStrasse' | 'neukundePlz'
  | 'neukundeOrt' | 'neukundeTelefon' | 'neukundeEmail' | 'ort' | 'ansprechpartnerName'
  | 'ansprechpartnerTelefon' | 'anliegen' | 'dringlichkeit' | 'wunschtermin' | 'eingegangenAm'
  // M02c: Liegenschaft und Top — die Bezeichnungen setzt die Datenbank.
  | 'liegenschaftId' | 'topId'
>;

/** Wo die nächste Seite beginnt — nach dieser Zeile, in der Reihenfolge der Liste. */
export interface EingangZeiger {
  rang: number;
  /** Der Zeitpunkt, wie Postgres ihn schreibt — auf die Mikrosekunde. */
  amRoh: string;
  id: string;
}

export interface EingangSeite {
  zeilen: Auftragseingang[];
  /** `null`, wenn die Seite nicht voll war — dann gibt es nichts weiter. */
  weiter: EingangZeiger | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ein Wert für eine `or`-Bedingung, in Anführungszeichen — Zeitpunkte tragen Doppelpunkte und Pluszeichen. */
function zitiert(wert: string): string {
  if (/["\\]/.test(wert)) throw new Error(`Unbrauchbarer Wert für die Liste: ${wert}`);
  return `"${wert}"`;
}

/** Leere Felder als `null`: „nichts angegeben“ ist keine leere Zeichenkette, und ein leeres Datum nimmt Postgres nicht. */
function bereinigt(e: Partial<EingangEingabe>): Record<string, unknown> {
  const raus: Record<string, unknown> = {};
  for (const [feld, wert] of Object.entries(e)) {
    if (wert === undefined) continue;
    raus[feld] = typeof wert === 'string' ? (wert.trim() === '' ? null : wert.trim()) : wert;
  }
  return raus;
}

/**
 * Eine Seite der Eingänge eines Stands.
 *
 * DIE REIHENFOLGE KOMMT VOM SERVER. Offen: Notfall, dringend, normal, je
 * nach Eingang (der älteste zuerst — er wartet am längsten). Übernommen und
 * abgelehnt: der jüngste zuerst. Weitergeblättert wird über den Schlüssel
 * der letzten Zeile, nicht über eine Stelle: kommt zwischen zwei Seiten ein
 * Eingang dazu, stünde sonst einer doppelt da.
 */
export async function listEingaenge(
  companyId: string,
  o: { stand: EingangStand; suche?: string; nach?: EingangZeiger | null },
): Promise<EingangSeite> {
  const teile: string[] = [];
  const suche = oderUeberSpalten(['nummer', 'kunde_name', 'ort', 'anliegen', 'auftraggeber_nummer'], o.suche ?? '');
  if (suche) teile.push(`or(${suche})`);
  const offen = o.stand === 'offen';
  if (o.nach) {
    if (!UUID.test(o.nach.id)) throw new Error(`Keine Kennung: ${o.nach.id}`);
    const am = zitiert(o.nach.amRoh);
    const id = zitiert(o.nach.id);
    teile.push(offen
      ? `or(dringlichkeit_rang.gt.${o.nach.rang},and(dringlichkeit_rang.eq.${o.nach.rang},eingegangen_am.gt.${am}),`
        + `and(dringlichkeit_rang.eq.${o.nach.rang},eingegangen_am.eq.${am},id.gt.${id}))`
      : `or(eingegangen_am.lt.${am},and(eingegangen_am.eq.${am},id.gt.${id}))`);
  }

  let abfrage = derClient()
    .from(TABELLE)
    .select('*,am_roh:eingegangen_am::text')
    .eq('company_id', companyId)
    .eq('stand', o.stand);
  if (teile.length > 0) abfrage = abfrage.or(`and(${teile.join(',')})`);
  abfrage = offen
    ? abfrage.order('dringlichkeit_rang', { ascending: true }).order('eingegangen_am', { ascending: true })
    : abfrage.order('eingegangen_am', { ascending: false });
  const { data, error } = await abfrage.order('id', { ascending: true }).limit(EINGANG_SEITE);
  if (error) throw new Error(error.message);

  const roh = (data ?? []) as Record<string, unknown>[];
  const zeilen = roh.map((z) => zeileAlsObjekt<Auftragseingang>(TABELLE, z));
  const letzte = roh[roh.length - 1];
  return {
    zeilen,
    weiter: roh.length === EINGANG_SEITE && letzte
      ? { rang: Number(letzte.dringlichkeit_rang), amRoh: String(letzte.am_roh), id: String(letzte.id) }
      : null,
  };
}

/** Wie viele Eingänge offen sind und wie viele davon dringend oder ein Notfall — gezählt, nicht geholt. */
export async function zaehleOffeneEingaenge(companyId: string): Promise<{ offen: number; dringend: number; notfall: number }> {
  const [offen, dringend, notfall] = await Promise.all([
    zaehlen(TABELLE, companyId, { wo: [{ art: 'gleich', feld: 'stand', wert: 'offen' }] }),
    zaehlen(TABELLE, companyId, {
      wo: [{ art: 'gleich', feld: 'stand', wert: 'offen' }, { art: 'gleich', feld: 'dringlichkeit', wert: 'dringend' }],
    }),
    zaehlen(TABELLE, companyId, {
      wo: [{ art: 'gleich', feld: 'stand', wert: 'offen' }, { art: 'gleich', feld: 'dringlichkeit', wert: 'notfall' }],
    }),
  ]);
  return { offen, dringend, notfall };
}

/** Ein Eingang — oder `null`, wenn es ihn nicht gibt oder er nicht lesbar ist. */
export async function getEingang(companyId: string, id: string): Promise<Auftragseingang | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await derClient().from(TABELLE).select('*')
    .eq('company_id', companyId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? zeileAlsObjekt<Auftragseingang>(TABELLE, data as Record<string, unknown>) : null;
}

/** Aus welchem Eingang eine Baustelle bzw. ein Angebot entstand — für „Aus Eingang …“. */
export async function getEingangZu(
  companyId: string,
  ziel: { projectId: string } | { quoteId: string },
): Promise<Pick<Auftragseingang, 'id' | 'nummer'> | null> {
  const [spalte, wert] = 'projectId' in ziel ? ['project_id', ziel.projectId] : ['quote_id', ziel.quoteId];
  if (!UUID.test(wert)) return null;
  const { data, error } = await derClient().from(TABELLE).select('id, nummer')
    .eq('company_id', companyId).eq(spalte, wert).order('eingegangen_am', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: String(data.id), nummer: String(data.nummer) } : null;
}

/**
 * Die Eingänge eines Kunden, der jüngste zuerst — für die Kundenakte.
 * Mit Obergrenze; die Akte sagt, wenn sie greift.
 */
export function listEingaengeDesKunden(companyId: string, customerId: string, max = 50) {
  return abfragen<Auftragseingang>(TABELLE, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    sortiere: { feld: 'eingegangenAm', absteigend: true },
    grenze: max,
  });
}

/** Erfassen. Nummer, Stand und wer erfasst hat setzt die Datenbank. */
export function eingangAnlegen(companyId: string, e: EingangEingabe): Promise<string> {
  return anlegen(TABELLE, companyId, bereinigt(e));
}

/** Ändern — nur solange offen (Zeilenschutz). */
export function eingangAendern(id: string, e: Partial<EingangEingabe>): Promise<void> {
  return aendern(TABELLE, id, bereinigt(e));
}

/** Die vereinbarte Besichtigung am Eingang festhalten (oder lösen, mit `null`). */
export function eingangTerminSetzen(id: string, terminId: string | null): Promise<void> {
  return aendern(TABELLE, id, { terminId });
}

/** Löschen — nur offene und abgelehnte, nur die Führung (Zeilenschutz). */
export function eingangLoeschen(id: string): Promise<void> {
  return loeschen(TABELLE, id);
}

/** Zur Baustelle — ein zweiter Aufruf gibt dieselbe zurück (`neu: false`). */
export async function eingangZuBaustelle(
  id: string,
  praefix: string,
  abrechnung: Abrechnungsart,
): Promise<{ projectId: string; projectNumber: string; neu: boolean }> {
  const { data, error } = await derClient().rpc('eingang_zu_baustelle', {
    p_eingang: id, p_praefix: praefix, p_abrechnung: abrechnung,
  });
  if (error) throw new Error(error.message);
  const d = data as { project_id?: string; project_number?: string; neu?: boolean } | null;
  if (!d?.project_id) throw new Error('Die Baustelle konnte nicht angelegt werden.');
  return { projectId: d.project_id, projectNumber: String(d.project_number ?? ''), neu: d.neu !== false };
}

/** Zum Angebotsentwurf — ein zweiter Aufruf gibt denselben zurück (`neu: false`). */
export async function eingangZuAngebot(id: string): Promise<{ quoteId: string; quoteNumber: string; neu: boolean }> {
  const { data, error } = await derClient().rpc('eingang_zu_angebot', { p_eingang: id });
  if (error) throw new Error(error.message);
  const d = data as { quote_id?: string; quote_number?: string; neu?: boolean } | null;
  if (!d?.quote_id) throw new Error('Das Angebot konnte nicht angelegt werden.');
  return { quoteId: d.quote_id, quoteNumber: String(d.quote_number ?? ''), neu: d.neu !== false };
}

export async function eingangAblehnen(id: string, grund: string): Promise<void> {
  const { error } = await derClient().rpc('eingang_ablehnen', { p_eingang: id, p_grund: grund });
  if (error) throw new Error(error.message);
}

export async function eingangWiederOeffnen(id: string): Promise<void> {
  const { error } = await derClient().rpc('eingang_wieder_oeffnen', { p_eingang: id });
  if (error) throw new Error(error.message);
}

/** Aus den Angaben zum neuen Kunden den Kunden anlegen — der Eingang bleibt offen. */
export async function eingangKundeAnlegen(id: string): Promise<string> {
  const { data, error } = await derClient().rpc('eingang_kunde_anlegen', { p_eingang: id });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string' || !data) throw new Error('Der Kunde konnte nicht angelegt werden.');
  return data;
}
