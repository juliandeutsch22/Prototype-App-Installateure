/**
 * Der Katalogimport — Lieferanten, Rabattsätze, Lauf, Übernahme.
 *
 * WARUM DIE ZEILEN IN HÄPPCHEN GEHEN. Ein DATANORM-Katalog eines
 * Sanitärgrosshändlers hat nicht dreihundert Artikel, sondern vierzigtausend.
 * Als eine Ladung wäre das ein Aufruf jenseits jeder vernünftigen Grenze —
 * und bräche er in der Mitte ab, stünde die Hälfte in der Datenbank. Also
 * wandern die Zeilen in Blöcken in ein Zwischenlager, und erst die
 * Übernahme schreibt sie in EINER Transaktion in den Stamm.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { abfragen, anlegen, derClient, type WithId } from './kern';

export interface Lieferant {
  companyId: string;
  name: string;
  customerNumber?: string | null;
  contactLine?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface Rabattsatz {
  companyId: string;
  supplierId: string;
  gruppe: string;
  prozent: number;
}

/** Eine Zeile, so wie sie ins Zwischenlager geht. */
export interface DatanormZeile {
  zeile: number;
  artikelnummer: string;
  name: string;
  einheit?: string;
  preis?: number;
  preisArt: 'liste' | 'netto' | 'unbekannt';
  rabattgruppe?: string;
  warengruppe?: string;
  verarbeitung: 'neu' | 'aenderung' | 'loeschung';
}

export interface Lauf {
  companyId: string;
  supplierId: string;
  dateiname?: string | null;
  zeichensatz?: string | null;
  status: 'offen' | 'uebernommen' | 'verworfen';
  bericht?: Record<string, unknown> | null;
  angelegtVon?: string | null;
  createdAt?: number;
  abgeschlossenAm?: number | null;
}

/** Was die Übernahme getan hat — dieselben Zahlen stehen danach am Lauf. */
export interface UebernahmeBericht {
  angelegt: number;
  geaendert: number;
  ausgelaufen: number;
  loeschungOhneArtikel: number;
  preise: number;
  /**
   * Artikel mit Listenpreis, zu deren Rabattgruppe kein Satz hinterlegt ist.
   * Sie stehen im Katalog, haben aber keinen Einkaufspreis — und die
   * Nachkalkulation meldet die Lücke weiter. Das ist richtig so, muss aber
   * sichtbar sein.
   */
  ohneRabattsatz: number;
}

/**
 * Wie viele Zeilen je Aufruf.
 *
 * Gross genug, dass ein Katalog mit 40.000 Artikeln in achtzig Aufrufen
 * durch ist; klein genug, dass ein einzelner davon auch über eine
 * Mobilfunkverbindung ankommt.
 */
export const BLOCK = 500;

export function lieferanten(
  companyId: string,
  client?: SupabaseClient,
): Promise<WithId<Lieferant>[]> {
  return abfragen<Lieferant>('suppliers', companyId, { sortiere: { feld: 'name' } }, client);
}

export function lieferantAnlegen(
  companyId: string,
  name: string,
  client?: SupabaseClient,
): Promise<string> {
  return anlegen('suppliers', companyId, { name, active: true }, client);
}

export function rabattsaetze(
  companyId: string,
  supplierId: string,
  client?: SupabaseClient,
): Promise<WithId<Rabattsatz>[]> {
  return abfragen<Rabattsatz>(
    'rabattsaetze',
    companyId,
    { wo: [{ art: 'gleich', feld: 'supplierId', wert: supplierId }], sortiere: { feld: 'gruppe' } },
    client,
  );
}

/**
 * Einen Rabattsatz setzen oder ändern.
 *
 * Als Upsert, weil der Betrieb denselben Satz ein zweites Mal eintippt,
 * sobald sein Grosshändler neu verhandelt — und dann soll nicht eine zweite
 * Zeile daneben entstehen.
 */
export async function rabattsatzSetzen(
  companyId: string,
  supplierId: string,
  gruppe: string,
  prozent: number,
  client?: SupabaseClient,
): Promise<void> {
  const { error } = await derClient(client)
    .from('rabattsaetze')
    .upsert(
      { company_id: companyId, supplier_id: supplierId, gruppe, prozent },
      { onConflict: 'supplier_id,gruppe' },
    );
  if (error) throw new Error(error.message);
}

export function laufAnlegen(
  companyId: string,
  supplierId: string,
  dateiname: string,
  zeichensatz: string,
  bericht: Record<string, unknown>,
  client?: SupabaseClient,
): Promise<string> {
  return anlegen(
    'datanorm_laeufe',
    companyId,
    { supplierId, dateiname, zeichensatz, bericht, status: 'offen' },
    client,
  );
}

/**
 * Die gelesenen Zeilen ins Zwischenlager schicken.
 *
 * Bricht ein Block ab, wirft das hier — und der Lauf bleibt „offen" mit
 * unvollständigem Inhalt stehen. Genau deshalb schreibt erst die Übernahme
 * in den Stamm: ein abgebrochener Transport hinterlässt kein halbes Lager
 * im Katalog, sondern nur einen Lauf, den man verwirft.
 */
export async function zeilenSchicken(
  companyId: string,
  laufId: string,
  zeilen: DatanormZeile[],
  fortschritt?: (fertig: number) => void,
  client?: SupabaseClient,
): Promise<void> {
  const c = derClient(client);
  for (let i = 0; i < zeilen.length; i += BLOCK) {
    const block = zeilen.slice(i, i + BLOCK).map((z) => ({
      lauf_id: laufId,
      company_id: companyId,
      zeile: z.zeile,
      artikelnummer: z.artikelnummer,
      name: z.name,
      einheit: z.einheit ?? null,
      preis: z.preis ?? null,
      preis_art: z.preisArt,
      rabattgruppe: z.rabattgruppe ?? null,
      warengruppe: z.warengruppe ?? null,
      verarbeitung: z.verarbeitung,
    }));
    const { error } = await c.from('datanorm_zeilen').insert(block);
    if (error) throw new Error(error.message);
    fortschritt?.(Math.min(i + BLOCK, zeilen.length));
  }
}

export async function uebernehmen(
  laufId: string,
  client?: SupabaseClient,
): Promise<UebernahmeBericht> {
  const { data, error } = await derClient(client).rpc('datanorm_uebernehmen', { p_lauf: laufId });
  if (error) throw new Error(error.message);
  return data as UebernahmeBericht;
}

/**
 * Einen Lauf verwerfen.
 *
 * Die Zeilen gehen mit (`on delete cascade`) — was nicht übernommen wurde,
 * soll nicht in jeder nächtlichen Sicherung mitfahren.
 */
export async function laufVerwerfen(laufId: string, client?: SupabaseClient): Promise<void> {
  const { error } = await derClient(client)
    .from('datanorm_laeufe')
    .update({ status: 'verworfen', abgeschlossen_am: new Date().toISOString() })
    .eq('id', laufId);
  if (error) throw new Error(error.message);
  const weg = await derClient(client).from('datanorm_zeilen').delete().eq('lauf_id', laufId);
  if (weg.error) throw new Error(weg.error.message);
}

/** Das Protokoll: wer wann welchen Katalog eingespielt hat. */
export function laeufe(
  companyId: string,
  grenze = 50,
  client?: SupabaseClient,
): Promise<WithId<Lauf>[]> {
  return abfragen<Lauf>(
    'datanorm_laeufe',
    companyId,
    { sortiere: { feld: 'createdAt', absteigend: true }, grenze },
    client,
  );
}
