/**
 * Der Supportzugang — Freigaben und ihr Protokoll.
 *
 * WAS HIER NICHT STEHT: eine Funktion, die Einblick nimmt. Es gibt keine.
 * Der Supportzugang ändert nur, was `app.darf` beantwortet; gelesen wird
 * danach über dieselben Wege wie immer, mit derselben Datenschicht. Eine
 * zweite, „privilegierte" Datenschicht wäre die Stelle, an der die Grenze
 * eines Tages versehentlich anders verliefe.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { abfragen, aendern, anlegen, derClient, type WithId } from './kern';

/**
 * Wie weit ein Zugang reicht.
 *
 * `ansehen` ist der Normalfall und die Vorgabe: lesen, sonst nichts, bis zu
 * sieben Tage. `mitarbeiten` ist der Ernstfall — wie ein Administrator im
 * Betrieb, höchstens 24 Stunden, eigens gekennzeichnet. Zeitbuchungen,
 * Urlaube und Scheinfotos bleiben in BEIDEN Stufen verschlossen.
 */
export type SupportStufe = 'ansehen' | 'mitarbeiten';

export interface SupportFreigabe {
  companyId: string;
  /** Wer sie gewährt hat — leer beim Notzugang. */
  gewaehrtVon?: string | null;
  grund: string;
  notzugang: boolean;
  stufe: SupportStufe;
  giltBis: number;
  widerrufenAm?: number | null;
  widerrufenVon?: string | null;
  createdAt?: number;
}

export interface SupportZugriff {
  companyId: string;
  freigabeId: string;
  adminUid: string;
  bereich: string;
  wann: number;
}

/**
 * Was in EINEM Zugang angesehen wurde — je Bereich gezählt.
 *
 * Die Ansicht zeigt das statt der einzelnen Klicks: zwei Minuten Support
 * ergaben vierzehn Zeilen, und nach einem halben Jahr liest die niemand
 * mehr. Gezählt wird in der Datenbank, damit keine Lesegrenze die Zahlen
 * still verfälscht.
 */
export interface SupportBereich {
  freigabe_id: string;
  bereich: string;
  anzahl: number;
  zuletzt: string;
}

/** Eine offene Freigabe, so wie die Plattformseite sie sieht. */
export interface OffeneFreigabe {
  id: string;
  company_id: string;
  name: string;
  grund: string;
  notzugang: boolean;
  stufe: SupportStufe;
  gilt_bis: string;
}

const TABELLE = 'support_freigaben';

export function freigaben(
  companyId: string,
  grenze = 50,
  client?: SupabaseClient,
): Promise<WithId<SupportFreigabe>[]> {
  return abfragen<SupportFreigabe>(
    TABELLE,
    companyId,
    { sortiere: { feld: 'createdAt', absteigend: true }, grenze },
    client,
  );
}

/** Gilt gerade — nicht widerrufen und nicht abgelaufen. */
export function istOffen(f: SupportFreigabe, jetzt = Date.now()): boolean {
  return !f.widerrufenAm && f.giltBis > jetzt;
}

export function freigabeGeben(
  companyId: string,
  uid: string,
  grund: string,
  stunden: number,
  stufe: SupportStufe = 'ansehen',
  client?: SupabaseClient,
): Promise<string> {
  return anlegen(
    TABELLE,
    companyId,
    {
      gewaehrtVon: uid,
      grund: grund.trim(),
      stufe,
      giltBis: new Date(Date.now() + stunden * 3_600_000).toISOString(),
    },
    client,
  );
}

export function freigabeWiderrufen(
  id: string,
  uid: string,
  client?: SupabaseClient,
): Promise<void> {
  return aendern(
    TABELLE,
    id,
    { widerrufenAm: new Date().toISOString(), widerrufenVon: uid },
    client,
  );
}

export function zugriffe(
  companyId: string,
  grenze = 100,
  client?: SupabaseClient,
): Promise<WithId<SupportZugriff>[]> {
  return abfragen<SupportZugriff>(
    'support_zugriffe',
    companyId,
    { sortiere: { feld: 'wann', absteigend: true }, grenze },
    client,
  );
}

export async function bereiche(
  companyId: string,
  client?: SupabaseClient,
): Promise<SupportBereich[]> {
  const { data, error } = await derClient(client).rpc('support_bereiche', {
    p_company: companyId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupportBereich[];
}

/* ------------------------------------------------------------------ */
/* Die Plattformseite                                                  */
/* ------------------------------------------------------------------ */

export async function offeneFreigaben(client?: SupabaseClient): Promise<OffeneFreigabe[]> {
  const { data, error } = await derClient(client).rpc('support_freigaben_offen');
  if (error) throw new Error(error.message);
  return (data ?? []) as OffeneFreigabe[];
}

export async function notzugang(
  companyId: string,
  grund: string,
  stunden: number,
  client?: SupabaseClient,
): Promise<string> {
  const { data, error } = await derClient(client).rpc('support_notzugang', {
    p_company: companyId,
    p_grund: grund,
    p_stunden: stunden,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Festhalten, dass ein Bereich geöffnet wurde.
 *
 * DAS IST DAS EINZIGE, WAS EIN SUPPORTZUGANG SCHREIBT. Er tut es über den
 * gewöhnlichen Weg und nicht über eine Sonderfunktion: die Regel an der
 * Tabelle verlangt eine gültige Freigabe und die eigene Kennung, sonst
 * entsteht kein Eintrag.
 */
export async function zugriffMelden(
  companyId: string,
  freigabeId: string,
  bereich: string,
  client?: SupabaseClient,
): Promise<void> {
  const { error } = await derClient(client).from('support_zugriffe').insert({
    company_id: companyId,
    freigabe_id: freigabeId,
    bereich,
  });
  if (error) throw new Error(error.message);
}
