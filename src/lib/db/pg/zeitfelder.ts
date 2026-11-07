/**
 * Die freien Zeitfelder (M06b, N01) — auf Postgres.
 *
 * Definitionen schreiben nur die Funktionen (`zeitfeld_speichern`,
 * `zeitfeld_typ_wechseln`, `zeitfeld_reihenfolge`); Werte schreibt niemand
 * eigens — sie reisen mit der Buchung (`TimeEntry.zeitfelder`) und der
 * Auslöser an `time_entries` prüft und schreibt sie. Hier steht nur Lesen und
 * der Aufruf der Funktionen.
 */
import type { ZeitfeldDefinition, ZeitfeldFassung, Zeitfeldwert } from '@/types';
import type { ZeitfeldPflicht, ZeitfeldRegeln, ZeitfeldTyp } from '@/lib/zeitfelder';
import { abfragen, derClient, type WithId } from './kern';

/** Alle Felder des Betriebs — auch beendete: ihre Werte bleiben mit Name und Typ lesbar. */
export function listZeitfeldDefinitionen(companyId: string): Promise<WithId<ZeitfeldDefinition>[]> {
  return abfragen<ZeitfeldDefinition>('zeitfeld_definitionen', companyId, { sortiere: { feld: 'reihenfolge' } });
}

/** Die geltende Fassung — die jüngste; `null`, solange keine veröffentlicht ist. */
export async function getAktuelleZeitfeldFassung(companyId: string): Promise<ZeitfeldFassung | null> {
  const zeilen = await abfragen<ZeitfeldFassung>('zeitfeld_fassungen', companyId, {
    sortiere: { feld: 'nummer', absteigend: true },
    grenze: 1,
  });
  return zeilen[0] ?? null;
}

/** Bestimmte Fassungen — die der Buchungen auf dem Schirm. */
export function listZeitfeldFassungen(companyId: string, nummern: readonly number[]): Promise<WithId<ZeitfeldFassung>[]> {
  if (nummern.length === 0) return Promise.resolve([]);
  return abfragen<ZeitfeldFassung>('zeitfeld_fassungen', companyId, {
    wo: [{ art: 'in', feld: 'nummer', werte: [...new Set(nummern)] }],
  });
}

/**
 * Die Werte eines Zeitraums — einer Person oder (Büro) aller, die der
 * Zeilenschutz zeigt. Der Zeitraum gilt für den Tag der Buchung. Seitenweise
 * über `abfragen`: ein Monat des ganzen Betriebs kann mehr Werte tragen, als
 * der Server auf einmal ausgibt.
 */
export function listFeldwerte(companyId: string, von: string, bis: string, userId?: string): Promise<WithId<Zeitfeldwert>[]> {
  return abfragen<Zeitfeldwert>('zeitbuchung_feldwerte', companyId, {
    wo: [
      ...(userId ? [{ art: 'gleich' as const, feld: 'userId', wert: userId }] : []),
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
  });
}

/** Was die Definitionsseite schickt. */
export interface ZeitfeldEntwurf {
  id?: string;
  name: string;
  typ: ZeitfeldTyp;
  regeln: ZeitfeldRegeln;
  giltStaende: string[];
  giltRollen: string[];
  pflicht: ZeitfeldPflicht;
  aktiv: boolean;
}

function alsAufruf(f: ZeitfeldEntwurf) {
  return {
    id: f.id ?? null,
    name: f.name,
    typ: f.typ,
    regeln: f.regeln,
    gilt_staende: f.giltStaende,
    gilt_rollen: f.giltRollen,
    pflicht: f.pflicht,
    aktiv: f.aktiv,
  };
}

/** Anlegen oder ändern (ohne Typwechsel); liefert Kennung und die nun geltende Fassung. */
export async function zeitfeldSpeichern(f: ZeitfeldEntwurf): Promise<{ id: string; fassung: number | null }> {
  const { data, error } = await derClient().rpc('zeitfeld_speichern', { p_feld: alsAufruf(f) });
  if (error) throw new Error(error.message);
  const d = data as { id: string; fassung: number | null };
  return { id: d.id, fassung: d.fassung ?? null };
}

/** Typwechsel: neues Feld, das alte endet. */
export async function zeitfeldTypWechseln(altId: string, f: ZeitfeldEntwurf): Promise<{ id: string; fassung: number | null }> {
  const { data, error } = await derClient().rpc('zeitfeld_typ_wechseln', { p_alt: altId, p_feld: alsAufruf({ ...f, id: undefined }) });
  if (error) throw new Error(error.message);
  const d = data as { id: string; fassung: number | null };
  return { id: d.id, fassung: d.fassung ?? null };
}

/** Die Reihenfolge — ergibt keine Fassung. */
export async function zeitfeldReihenfolge(ids: string[]): Promise<void> {
  const { error } = await derClient().rpc('zeitfeld_reihenfolge', { p_ids: ids });
  if (error) throw new Error(error.message);
}
