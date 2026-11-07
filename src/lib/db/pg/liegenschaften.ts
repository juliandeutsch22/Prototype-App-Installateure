/**
 * Liegenschaften, Tops und Beteiligte (M02c, A09) — auf Postgres.
 *
 * Angelegt, geändert und gelöscht wird direkt auf den Tabellen; wer darf,
 * entscheiden Zeilenschutz (wie Kunden: pflegen, wer Kunden pflegen darf)
 * und die Unterfähigkeit `kunden.liegenschaften`, die der Server bei jedem
 * Schreiben prüft (`20261108300000_liegenschaften.sql`). Die Liste sucht auf
 * dem Server, auch über die Beteiligten (`liegenschaften_suche`).
 */
import type { Liegenschaft, LiegenschaftBeteiligter, LiegenschaftTop, Project, Wartung } from '@/types';
import { abfragen, aendern, anlegen, derClient, loeschen, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';

const LIEGENSCHAFTEN = 'liegenschaften';
const TOPS = 'liegenschaft_tops';
const BETEILIGTE = 'liegenschaft_beteiligte';

/** Wie viele Liegenschaften eine Seite der Liste trägt — „Weitere anzeigen“ holt die nächste. */
export const LIEGENSCHAFT_SEITE = 50;

/** Wie viele Baustellen bzw. Wartungen die Akte einer Liegenschaft zeigt; sie sagt, wenn die Grenze greift. */
export const AKTE_GRENZE = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wo die nächste Seite beginnt — nach dieser Liegenschaft (Bezeichnung, dann Kennung). */
export interface LiegenschaftZeiger {
  bezeichnung: string;
  id: string;
}

export interface LiegenschaftSeite {
  zeilen: Liegenschaft[];
  /** `null`, wenn die Seite nicht voll war — dann gibt es nichts weiter. */
  weiter: LiegenschaftZeiger | null;
}

/** Was an einer Liegenschaft erfasst wird — Anschrift als Zeile setzt die Datenbank. */
export type LiegenschaftEingabe = Pick<Liegenschaft, 'bezeichnung' | 'strasse' | 'plz' | 'ort' | 'land' | 'notiz' | 'aktiv'>;
export type TopEingabe = Pick<LiegenschaftTop, 'bezeichnung' | 'lage' | 'notiz' | 'aktiv'>;
export type BeteiligterEingabe = Pick<
  LiegenschaftBeteiligter,
  'rolle' | 'topId' | 'customerId' | 'name' | 'telefon' | 'email' | 'hinweis' | 'gueltigAb' | 'gueltigBis'
>;

/** Leere Felder als `null` — „nichts angegeben“ ist keine leere Zeichenkette, und ein leeres Datum nimmt Postgres nicht. */
function bereinigt<T extends object>(e: Partial<T>): Record<string, unknown> {
  const raus: Record<string, unknown> = {};
  for (const [feld, wert] of Object.entries(e)) {
    if (wert === undefined) continue;
    raus[feld] = typeof wert === 'string' ? (wert.trim() === '' ? null : wert.trim()) : wert;
  }
  return raus;
}

/**
 * Eine Seite der Liegenschaften, nach Bezeichnung — gesucht auf dem Server
 * über Bezeichnung, Anschrift und Beteiligte (freie Angaben und Name des
 * Kunden). Weitergeblättert wird über den Schlüssel der letzten Zeile.
 */
export async function listLiegenschaften(
  companyId: string,
  o: { suche?: string; nurAktive?: boolean; nach?: LiegenschaftZeiger | null; grenze?: number } = {},
): Promise<LiegenschaftSeite> {
  const grenze = o.grenze ?? LIEGENSCHAFT_SEITE;
  if (o.nach && !UUID.test(o.nach.id)) throw new Error(`Keine Kennung: ${o.nach.id}`);
  const { data, error } = await derClient().rpc('liegenschaften_suche', {
    p_betrieb: companyId,
    p_suche: o.suche?.trim() || null,
    p_nur_aktive: o.nurAktive ?? true,
    p_nach_bezeichnung: o.nach?.bezeichnung ?? null,
    p_nach_id: o.nach?.id ?? null,
    p_grenze: grenze,
  });
  if (error) throw new Error(error.message);
  const zeilen = ((data ?? []) as Record<string, unknown>[]).map((z) => zeileAlsObjekt<Liegenschaft>(LIEGENSCHAFTEN, z));
  const letzte = zeilen[zeilen.length - 1];
  return {
    zeilen,
    weiter: zeilen.length === grenze && letzte ? { bezeichnung: letzte.bezeichnung, id: letzte.id } : null,
  };
}

/** Eine Liegenschaft — oder `null`, wenn es sie nicht gibt oder sie nicht lesbar ist. */
export async function getLiegenschaft(companyId: string, id: string): Promise<Liegenschaft | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await derClient().from(LIEGENSCHAFTEN).select('*')
    .eq('company_id', companyId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? zeileAlsObjekt<Liegenschaft>(LIEGENSCHAFTEN, data as Record<string, unknown>) : null;
}

/** Bestimmte Liegenschaften, nach Kennung — für die Kundenakte (seine Beteiligungen). */
export async function listLiegenschaftenByIds(companyId: string, ids: string[]): Promise<WithId<Liegenschaft>[]> {
  const eindeutig = [...new Set(ids.filter((x) => UUID.test(x)))];
  if (eindeutig.length === 0) return [];
  return abfragen<Liegenschaft>(LIEGENSCHAFTEN, companyId, { wo: [{ art: 'in', feld: 'id', werte: eindeutig }] });
}

export function liegenschaftAnlegen(companyId: string, e: LiegenschaftEingabe): Promise<string> {
  return anlegen(LIEGENSCHAFTEN, companyId, bereinigt(e));
}

export function liegenschaftAendern(id: string, e: Partial<LiegenschaftEingabe>): Promise<void> {
  return aendern(LIEGENSCHAFTEN, id, bereinigt(e));
}

/** Nur ohne Baustellen, Wartungen und Eingänge — sonst lehnt der Server mit einem Satz ab. */
export function liegenschaftLoeschen(id: string): Promise<void> {
  return loeschen(LIEGENSCHAFTEN, id);
}

/**
 * Die Tops einer Liegenschaft, nach Bezeichnung. Ohne Grenze: die Menge ist
 * durch das Haus begrenzt, und eine Grenze schnitte still ein Top aus der
 * Wahl (`abfragegrenzen.test.ts`, Ausnahme mit Grund).
 */
export function listTops(companyId: string, liegenschaftId: string): Promise<WithId<LiegenschaftTop>[]> {
  return abfragen<LiegenschaftTop>(TOPS, companyId, {
    wo: [{ art: 'gleich', feld: 'liegenschaftId', wert: liegenschaftId }],
    sortiere: { feld: 'bezeichnung' },
  });
}

export function topAnlegen(companyId: string, liegenschaftId: string, e: TopEingabe): Promise<string> {
  return anlegen(TOPS, companyId, { ...bereinigt(e), liegenschaftId });
}

export function topAendern(id: string, e: Partial<TopEingabe>): Promise<void> {
  return aendern(TOPS, id, bereinigt(e));
}

export function topLoeschen(id: string): Promise<void> {
  return loeschen(TOPS, id);
}

/**
 * Die Beteiligten einer Liegenschaft (samt denen ihrer Tops). Ohne Grenze
 * aus demselben Grund wie die Tops: begrenzt durch das Haus.
 */
export function listBeteiligte(companyId: string, liegenschaftId: string): Promise<WithId<LiegenschaftBeteiligter>[]> {
  return abfragen<LiegenschaftBeteiligter>(BETEILIGTE, companyId, {
    wo: [{ art: 'gleich', feld: 'liegenschaftId', wert: liegenschaftId }],
    sortiere: { feld: 'createdAt' },
  });
}

/** Woran ein Kunde beteiligt ist — für die Kundenakte, mit Obergrenze; die Akte sagt, wenn sie greift. */
export function listBeteiligungenDesKunden(companyId: string, customerId: string, max = 50) {
  return abfragen<LiegenschaftBeteiligter>(BETEILIGTE, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

export function beteiligterAnlegen(companyId: string, liegenschaftId: string, e: BeteiligterEingabe): Promise<string> {
  return anlegen(BETEILIGTE, companyId, { ...bereinigt(e), liegenschaftId });
}

export function beteiligterAendern(id: string, e: Partial<BeteiligterEingabe>): Promise<void> {
  return aendern(BETEILIGTE, id, bereinigt(e));
}

/**
 * Entfernen ist Löschen — mit den Werten im Journal (Name, Telefon, E-Mail
 * werden dort „entfernt“, die Rolle bleibt). Geht auch, wenn die
 * Liegenschaften gerade ausgeschaltet sind.
 */
export function beteiligterEntfernen(id: string): Promise<void> {
  return loeschen(BETEILIGTE, id);
}

/** Aus freien Angaben einen Kunden machen — in einem Zug; ein zweiter Aufruf gibt denselben zurück. */
export async function beteiligterZuKunde(id: string): Promise<string> {
  const { data, error } = await derClient().rpc('liegenschaft_beteiligter_zu_kunde', { p_beteiligter: id });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string' || !data) throw new Error('Der Kunde konnte nicht angelegt werden.');
  return data;
}

/**
 * Die Baustellen einer Liegenschaft (auf Wunsch nur eines Tops), die
 * jüngste zuerst — mit Obergrenze; die Akte sagt, wenn sie greift.
 */
export function listBaustellenDerLiegenschaft(
  companyId: string, liegenschaftId: string, topId?: string | null, max = AKTE_GRENZE,
): Promise<WithId<Project>[]> {
  return abfragen<Project>('projects', companyId, {
    wo: [
      { art: 'gleich', feld: 'liegenschaftId', wert: liegenschaftId },
      ...(topId ? [{ art: 'gleich' as const, feld: 'topId', wert: topId }] : []),
    ],
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
}

/** Die Wartungen einer Liegenschaft (auf Wunsch nur eines Tops), nach Fälligkeit — mit Obergrenze. */
export function listWartungenDerLiegenschaft(
  companyId: string, liegenschaftId: string, topId?: string | null, max = AKTE_GRENZE,
): Promise<WithId<Wartung>[]> {
  return abfragen<Wartung>('wartungen', companyId, {
    wo: [
      { art: 'gleich', feld: 'liegenschaftId', wert: liegenschaftId },
      ...(topId ? [{ art: 'gleich' as const, feld: 'topId', wert: topId }] : []),
    ],
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}
