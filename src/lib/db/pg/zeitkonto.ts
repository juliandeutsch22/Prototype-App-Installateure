/**
 * Das Zeitkonto aus der Datenbank (Durchsicht 15.11.2026, Z3, L1, L2).
 *
 * DER SALDO KOMMT ALS EINE ZAHL JE PERSON. Bis hierher holte jede Ansicht
 * Bilanzen und Buchungen und rechnete im Browser; wer ein Tagessoll je
 * Wochentag hatte, lud dafür jede Buchung seit dem Eintritt (L1), und die
 * Mitarbeiterübersicht je Eintrittsmonat den ganzen Betrieb (L2).
 * `zeitkonto_salden` rechnet dieselbe Zahl wie `calcOverallSaldo` — mit der
 * Arbeitszeit, die an jedem Tag galt (`arbeitszeit_verlauf`). Die Prüfung
 * `tests/supabase/zeitkontoSaldo.test.ts` vergleicht beide.
 *
 * Gelesen wird, was `time_entries_lesen` erlaubt: das eigene Konto, und das
 * Büro alle.
 */
import type { SaldoResult } from '@/lib/time';
import { derClient } from './kern';

type SaldoZeile = { user_id: string; saldo_h: number | string; tage_ohne_buchung: number; hat_konfig: boolean };

function alsSaldo(z: SaldoZeile): SaldoResult {
  return { saldoH: Number(z.saldo_h), daysWithoutEntry: Number(z.tage_ohne_buchung), hasConfig: z.hat_konfig };
}

/** Der Saldo aller Konten, die der Aufrufer lesen darf — eine Anfrage, eine Zeile je Person. */
export async function zeitkontoSalden(): Promise<Map<string, SaldoResult>> {
  const { data, error } = await derClient().rpc('zeitkonto_salden', {});
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as SaldoZeile[]).map((z) => [z.user_id, alsSaldo(z)]));
}

/** Der Saldo einer Person. Ohne Zeile (kein Zugriff, keine Person): keine Aussage. */
export async function zeitkontoSaldo(uid: string): Promise<SaldoResult> {
  const { data, error } = await derClient().rpc('zeitkonto_salden', { p_user: uid });
  if (error) throw new Error(error.message);
  const zeile = ((data ?? []) as SaldoZeile[])[0];
  return zeile ? alsSaldo(zeile) : { saldoH: 0, hasConfig: false, daysWithoutEntry: 0 };
}

/** Eine Monatsbilanz mit dem Soll des Monats — Minuten, `monat` als 'YYYY-MM'. */
export interface ZeitkontoMonat {
  userId: string;
  monat: string;
  sollMin: number;
  istMin: number;
  gutschriftMin: number;
  saldoMin: number;
  pflichttage: number;
  ohneBuchung: number;
}

/** Die Monatsbilanzen von `von` bis `bis` (je ein Tag im ersten und letzten Monat). */
export async function zeitkontoMonate(von: string, bis: string, uid?: string): Promise<ZeitkontoMonat[]> {
  const { data, error } = await derClient().rpc('zeitkonto_monate', { p_von: von, p_bis: bis, p_user: uid ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, number | string>>).map((z) => ({
    userId: String(z.user_id),
    monat: String(z.monat),
    sollMin: Number(z.soll_min),
    istMin: Number(z.ist_min),
    gutschriftMin: Number(z.gutschrift_min),
    saldoMin: Number(z.saldo_min),
    pflichttage: Number(z.pflichttage),
    ohneBuchung: Number(z.ohne_buchung),
  }));
}

/**
 * Arbeitszeit ab einem Tag eintragen (Geschäftsführung, Administration).
 * Mit eigenem Tagessoll sind die Wochenstunden seine Summe — das setzt die
 * Datenbank.
 */
export async function arbeitszeitAendern(daten: {
  userId: string;
  ab: string;
  wochenstunden: number;
  arbeitstage: number[];
  tagessoll: Record<string, number> | null;
}): Promise<void> {
  const { error } = await derClient().rpc('arbeitszeit_aendern', {
    p_user: daten.userId,
    p_ab: daten.ab,
    p_wochenstunden: daten.wochenstunden,
    p_arbeitstage: daten.arbeitstage,
    p_tagessoll: daten.tagessoll,
  });
  if (error) throw new Error(error.message);
}

export async function arbeitszeitAenderungEntfernen(userId: string, ab: string): Promise<void> {
  const { error } = await derClient().rpc('arbeitszeit_aenderung_entfernen', { p_user: userId, p_ab: ab });
  if (error) throw new Error(error.message);
}

/** Den Urlaubsanspruch ab einem Urlaubsjahr eintragen. */
export async function urlaubsanspruchAendern(userId: string, jahr: number, tage: number): Promise<void> {
  const { error } = await derClient().rpc('urlaubsanspruch_aendern', { p_user: userId, p_jahr: jahr, p_tage: tage });
  if (error) throw new Error(error.message);
}

export async function urlaubsanspruchAenderungEntfernen(userId: string, jahr: number): Promise<void> {
  const { error } = await derClient().rpc('urlaubsanspruch_aenderung_entfernen', { p_user: userId, p_jahr: jahr });
  if (error) throw new Error(error.message);
}

/** Was nach einem Tag noch an der Person hängt (Z2) — siehe `austritt_folgen`. */
export interface AustrittFolgen {
  buchungen: Array<{ status: string; anzahl: number; von: string; bis: string }>;
  urlaub: Array<{ id: string; art: string; status: string; von: string; bis: string }>;
  krank: Array<{ id: string; von: string; bis: string }>;
  freistellungen: Array<{ id: string; art: string; status: string; von: string; bis: string }>;
  korrekturen: number;
  einsaetze: { anzahl: number; von: string | null; bis: string | null };
  sitzung: { id: string; stand: string; seit: string | null } | null;
}

export async function austrittFolgen(userId: string, tag: string): Promise<AustrittFolgen> {
  const { data, error } = await derClient().rpc('austritt_folgen', { p_user: userId, p_tag: tag });
  if (error) throw new Error(error.message);
  return data as AustrittFolgen;
}

/** Die laufende Zeitsitzung einer ausgetretenen Person beenden (Büro). */
export async function zeitsitzungBeendenFuer(userId: string): Promise<void> {
  const { error } = await derClient().rpc('zeitsitzung_beenden_fuer', { p_user: userId });
  if (error) throw new Error(error.message);
}

/** Ein Eintrag im Verlauf des Monatsabschlusses (Z6) — der jüngste je Monat gilt. */
export interface Monatsabschluss {
  /** 'YYYY-MM' */
  monat: string;
  aktion: 'abgeschlossen' | 'geoeffnet';
  grund: string | null;
  vonName: string | null;
  am: string;
}

/** Der Verlauf der Monatsabschlüsse des Betriebs, jüngster zuerst. */
export async function listMonatsabschluesse(companyId: string): Promise<Monatsabschluss[]> {
  void companyId;
  const { data, error } = await derClient().from('zeit_monatsabschluesse')
    .select('monat, aktion, grund, von_name, am').order('am', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ monat: string; aktion: Monatsabschluss['aktion']; grund: string | null; von_name: string | null; am: string }>)
    .map((z) => ({ monat: z.monat.slice(0, 7), aktion: z.aktion, grund: z.grund, vonName: z.von_name, am: z.am }));
}

export async function monatAbschliessen(monat: string): Promise<void> {
  const { error } = await derClient().rpc('zeit_monat_abschliessen', { p_monat: `${monat}-01` });
  if (error) throw new Error(error.message);
}

export async function monatOeffnen(monat: string, grund: string): Promise<void> {
  const { error } = await derClient().rpc('zeit_monat_oeffnen', { p_monat: `${monat}-01`, p_grund: grund });
  if (error) throw new Error(error.message);
}
