/**
 * Krankmeldungen und Betriebsurlaub — auf Postgres.
 *
 * GESCHRIEBEN WIRD NUR ÜBER DIE DATENBANKFUNKTIONEN. Beide Wege legen Tage
 * im Zeitkonto an (Krank, Urlaub) und räumen genau diese beim Zurücknehmen
 * wieder weg; das in einer Transaktion und an den Rechten des Aufrufers
 * vorbei, weil das Büro fremde Zeiteinträge schreibt. Gelesen wird direkt:
 * die Zeilenschutzregeln lassen jeden genau das sehen, was er darf.
 */
import type { Betriebsurlaub, Krankmeldung } from '@/types';
import { abfragen, derClient } from './kern';

/** Was eine Krankmeldung im Zeitkonto bewirkt hat — nur Zahlen. */
export interface KrankmeldungErgebnis {
  id: string;
  angelegt: number;
  entfernt: number;
  /** Tage mit einem anderen Eintrag (gearbeitet, Urlaub) — sie bleiben. */
  uebersprungen: number;
}

/** Die eigenen Krankmeldungen, jüngste zuerst. */
export function listEigeneKrankmeldungen(companyId: string, uid: string, max = 30) {
  return abfragen<Krankmeldung>('krankmeldungen', companyId, {
    wo: [{ art: 'gleich', feld: 'userId', wert: uid }],
    sortiere: { feld: 'von', absteigend: true },
    grenze: max,
  });
}

/**
 * Die Krankenstände des Betriebs, die ab `abIso` noch liefen — fürs Büro.
 *
 * Wer das nicht lesen darf, bekommt vom Zeilenschutz nur die eigenen.
 */
export function listKrankmeldungenAb(companyId: string, abIso: string, max = 300) {
  return abfragen<Krankmeldung>('krankmeldungen', companyId, {
    wo: [{ art: 'ab', feld: 'bis', wert: abIso }],
    sortiere: { feld: 'von', absteigend: true },
    grenze: max,
  });
}

/**
 * Eine Krankmeldung — für die Zeiterfassung, die von einem Krank-Tag aus zu
 * seiner Meldung führt. `null`, wenn es sie nicht (mehr) gibt oder sie nicht
 * gelesen werden darf.
 */
export async function getKrankmeldung(companyId: string, id: string) {
  const treffer = await abfragen<Krankmeldung>('krankmeldungen', companyId, {
    wo: [{ art: 'gleich', feld: 'id', wert: id }],
    grenze: 1,
  });
  return treffer[0] ?? null;
}

export async function krankmeldungSpeichern(daten: {
  id?: string | null;
  userId?: string | null;
  von: string;
  bis: string;
  notiz?: string;
  melderName?: string;
}): Promise<KrankmeldungErgebnis> {
  const { data, error } = await derClient().rpc('krankmeldung_speichern', {
    p_id: daten.id ?? null,
    p_user: daten.userId ?? null,
    p_von: daten.von,
    p_bis: daten.bis,
    p_notiz: daten.notiz ?? null,
    p_melder_name: daten.melderName ?? null,
  });
  if (error) throw new Error(error.message);
  return data as KrankmeldungErgebnis;
}

/**
 * Das Büro trägt Urlaub direkt ein — als genehmigten Antrag.
 *
 * Nicht als Tagesstatus in der Zeiterfassung: der stünde neben den Anträgen,
 * und die Urlaubsseite zeigte einen anderen Resturlaub als die
 * Mitarbeiterübersicht. Gebucht werden die freien Arbeitstage der Person.
 */
export async function urlaubEintragen(daten: {
  userId: string;
  von: string;
  bis: string;
  notiz?: string;
  name?: string;
}): Promise<{ id: string; tage: number; uebersprungen: number }> {
  const { data, error } = await derClient().rpc('urlaub_eintragen', {
    p_user: daten.userId,
    p_von: daten.von,
    p_bis: daten.bis,
    p_notiz: daten.notiz ?? null,
    p_name: daten.name ?? null,
  });
  if (error) throw new Error(error.message);
  const d = data as { id: string; tage: number; uebersprungen: number };
  return { id: d.id, tage: Number(d.tage), uebersprungen: Number(d.uebersprungen) };
}

/** Löscht die Meldung samt ihrer Krank-Tage; zurück kommt deren Zahl. */
export async function krankmeldungLoeschen(id: string): Promise<number> {
  const { data, error } = await derClient().rpc('krankmeldung_loeschen', { p_id: id });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Betriebsurlaube, die ab `abIso` noch dauern — zum Anzeigen und Löschen. */
export function listBetriebsurlaubeAb(companyId: string, abIso: string, max = 50) {
  return abfragen<Betriebsurlaub>('betriebsurlaube', companyId, {
    wo: [{ art: 'ab', feld: 'bis', wert: abIso }],
    sortiere: { feld: 'von' },
    grenze: max,
  });
}

/** Betriebsurlaube, die in einen Zeitraum hineinreichen — für die Planung. */
export function listBetriebsurlaubeImZeitraum(companyId: string, vonIso: string, bisIso: string) {
  return abfragen<Betriebsurlaub>('betriebsurlaube', companyId, {
    wo: [
      { art: 'ab', feld: 'bis', wert: vonIso },
      { art: 'bis', feld: 'von', wert: bisIso },
    ],
    sortiere: { feld: 'von' },
    // Überschneiden dürfen sie sich nicht; in einem Planungszeitraum liegen
    // also nur wenige.
    grenze: 50,
  });
}

export interface BetriebsurlaubErgebnis {
  id: string;
  mitarbeiter: number;
  tage: number;
  uebersprungen: number;
}

export async function betriebsurlaubAnlegen(daten: {
  von: string;
  bis: string;
  bezeichnung: string;
  abbuchen: boolean;
  name?: string;
}): Promise<BetriebsurlaubErgebnis> {
  const { data, error } = await derClient().rpc('betriebsurlaub_anlegen', {
    p_von: daten.von,
    p_bis: daten.bis,
    p_bezeichnung: daten.bezeichnung,
    p_abbuchen: daten.abbuchen,
    p_name: daten.name ?? null,
  });
  if (error) throw new Error(error.message);
  return data as BetriebsurlaubErgebnis;
}

export async function betriebsurlaubLoeschen(id: string): Promise<{ tage: number; mitarbeiter: number }> {
  const { data, error } = await derClient().rpc('betriebsurlaub_loeschen', { p_id: id });
  if (error) throw new Error(error.message);
  return data as { tage: number; mitarbeiter: number };
}
