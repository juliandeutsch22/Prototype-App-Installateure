/**
 * Geburtsdatum und Begründungen zu den Arbeitszeitgrenzen (05.10.2026).
 *
 * Beide Tabellen liest nur, wer sie braucht: die Person selbst und Büro samt
 * Leitung (Zeilenschutz in `20261005300000_arbeitszeit_grenzen.sql`). Wer und
 * wann eine Begründung schrieb, setzt die Datenbank.
 */
import { derClient } from './kern';

export interface Begruendung {
  id: string;
  userId: string;
  art: string;
  bezug: string;
  text: string;
  vonName: string | null;
  am: string;
}

/** Die Geburtsdaten des Betriebs: Kennung → Datum. Nur Büro und Leitung sehen alle. */
export async function listGeburtsdaten(companyId: string): Promise<Map<string, string>> {
  const { data, error } = await derClient()
    .from('geburtsdaten')
    .select('user_id, geburtsdatum')
    .eq('company_id', companyId)
    // Eine Zeile je Person — die Belegschaft, kein Verlauf.
    .limit(2000);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((z: { user_id: string; geburtsdatum: string }) => [z.user_id, z.geburtsdatum]));
}

export async function getGeburtsdatum(companyId: string, uid: string): Promise<string | null> {
  const { data, error } = await derClient()
    .from('geburtsdaten')
    .select('geburtsdatum')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { geburtsdatum: string } | null)?.geburtsdatum ?? null;
}

/** Setzen oder — mit `null` — entfernen. */
export async function setGeburtsdatum(companyId: string, uid: string, datum: string | null): Promise<void> {
  const tabelle = derClient().from('geburtsdaten');
  const { error } = datum
    ? await tabelle.upsert({ user_id: uid, company_id: companyId, geburtsdatum: datum }, { onConflict: 'user_id' })
    : await tabelle.delete().eq('company_id', companyId).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

export async function listBegruendungen(companyId: string, von: string, bis: string): Promise<Begruendung[]> {
  const { data, error } = await derClient()
    .from('arbeitszeit_begruendungen')
    .select('id, user_id, art, bezug, text, von_name, am')
    .eq('company_id', companyId)
    .gte('bezug', von)
    .lte('bezug', bis)
    // Je Person und Monat eine Handvoll — die Grenze fängt nur den Ausreisser.
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z: {
    id: string; user_id: string; art: string; bezug: string; text: string; von_name: string | null; am: string;
  }) => ({ id: z.id, userId: z.user_id, art: z.art, bezug: z.bezug, text: z.text, vonName: z.von_name, am: z.am }));
}

export async function setBegruendung(
  companyId: string,
  b: { userId: string; art: string; bezug: string; text: string },
): Promise<void> {
  const { error } = await derClient()
    .from('arbeitszeit_begruendungen')
    .upsert(
      { company_id: companyId, user_id: b.userId, art: b.art, bezug: b.bezug, text: b.text },
      { onConflict: 'company_id,user_id,art,bezug' },
    );
  if (error) throw new Error(error.message);
}

export async function removeBegruendung(companyId: string, id: string): Promise<void> {
  const { error } = await derClient()
    .from('arbeitszeit_begruendungen')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}
