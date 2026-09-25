/**
 * Stammdaten des Betriebs — auf Postgres.
 *
 * Sonderfall gegenüber `kern.ts`: `companies` ist KEINE mandantengefilterte
 * Tabelle — die Zeile IST der Mandant. Deshalb wird hier über die Kennung
 * gelesen und geschrieben; wer schreiben darf, entscheidet der Zeilenschutz
 * (Geschäftsführung/Administration) und, feldweise, der Trigger
 * `app.firmeneinstellungen_geschuetzt`.
 */
import type { Company } from '@/types';
import { derClient } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';

const BETRIEBE = 'companies';

export async function getCompany(companyId: string): Promise<Company | null> {
  const { data, error } = await derClient()
    .from(BETRIEBE).select('*').eq('id', companyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return zeileAlsObjekt<Company>(BETRIEBE, data as Record<string, unknown>);
}

/** Aktualisiert Stammdaten. `id` ist die Kennung und wird nie geschrieben. */
export async function updateCompany(
  companyId: string,
  data: Partial<Omit<Company, 'id'>>,
): Promise<void> {
  const zeile = objektAlsZeile(BETRIEBE, data);
  if (Object.keys(zeile).length === 0) return;
  /*
    Auch hier gilt: ein Schreibvorgang, der nichts trifft, ist ein Fehler.
    Wer nicht zur Spitze gehört, ändert die Einstellungen nicht — und darf
    das nicht als „gespeichert" zurückgemeldet bekommen.
  */
  const { error, count } = await derClient()
    .from(BETRIEBE).update(zeile, { count: 'exact' }).eq('id', companyId);
  if (error) throw new Error(error.message);
  if (count === 0) {
    throw new Error('Die Einstellungen dieses Betriebs lassen sich nicht ändern.');
  }
}

/** Der Betriebsbestand, so wie ihn der DSGVO-Auszug zurückgibt. */
export interface BetriebsAuszug {
  companyId: string;
  exportedAt: string;
  anzahl: Record<string, number>;
  data: Record<string, unknown[]>;
}

/**
 * Der ganze Bestand eines Betriebs in einer Antwort (DSGVO Art. 15/20).
 *
 * Bis zum Umzug war das eine Cloud Function mit einer von Hand gepflegten
 * Sammlungsliste — die neun von sechzehn Sammlungen umfasste. Hier kommt die
 * Liste aus dem Katalog: jede Tabelle mit `company_id` ist dabei.
 */
export async function auszug(): Promise<BetriebsAuszug> {
  const { data, error } = await derClient().rpc('betrieb_auszug');
  if (error) throw new Error(error.message);
  return data as BetriebsAuszug;
}

/** Die nächste laufende Nummer je Kreis — was der Zähler als Nächstes vergäbe. */
export interface NaechsteNummern {
  rechnung: number;
  angebot: number;
  baustelle: number;
}

/**
 * Ohne sie zu verbrauchen: die Vorschau in den Einstellungen und die
 * Vorschläge der Masken sollen dieselbe Nummer zeigen, die der Zähler danach
 * vergibt (Launch-Check 25.09.2026, K6 — dort stand ein festes Beispiel).
 */
export async function naechsteNummern(jahr: number): Promise<NaechsteNummern> {
  const { data, error } = await derClient().rpc('naechste_nummern', { p_jahr: jahr });
  if (error) throw new Error(error.message);
  const je = new Map(((data ?? []) as { art: string; naechste: number }[]).map((z) => [z.art, Number(z.naechste)]));
  return {
    rechnung: je.get('invoices') ?? 1001,
    angebot: je.get('quotes') ?? 1,
    baustelle: je.get('projects') ?? 1,
  };
}
