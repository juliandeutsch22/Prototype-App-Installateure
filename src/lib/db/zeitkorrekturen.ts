import type { TimeEntry } from '@/types';
import { abfragen, derClient } from './pg/kern';
import { objektAlsZeile, zeileAlsObjekt } from './pg/felder';
export interface Zeitkorrektur {
  id: string; companyId: string; userId: string; eintragId: string; datum: string;
  stand: 'offen' | 'umgesetzt' | 'abgelehnt' | 'zurueckgezogen'; wunsch: string; vorher: Record<string, unknown>;
  entscheidung?: string; entschiedenVon?: string; angelegtAm: number; entschiedenAm?: number;
}
export function zeitkorrekturenLaden(companyId: string, offen: boolean) {
  return abfragen<Zeitkorrektur>('zeitkorrekturen', companyId, { ...(offen ? { wo: [{ art: 'gleich' as const, feld: 'stand', wert: 'offen' }] } : {}), sortiere: { feld: 'angelegtAm', absteigend: true } });
}
export async function zeitkorrekturBeantragen(eintragId: string, wunsch: string, id: string) {
  const { error } = await derClient().rpc('zeit_korrektur_beantragen', { p_id: id, p_eintrag: eintragId, p_wunsch: wunsch });
  if (error) throw new Error(error.message);
}
export async function zeitkorrekturEntscheiden(id: string, stand: string, grund: string, eintrag?: Partial<TimeEntry>, geaendertAm?: string) {
  const { error } = await derClient().rpc('zeit_korrektur_entscheiden', { p_id: id, p_stand: stand, p_grund: grund,
    p_geaendert_am: geaendertAm ?? null, p_eintrag: eintrag ? objektAlsZeile('time_entries', eintrag) : null });
  if (error) throw new Error(error.message);
}
export type KorrekturBuchung = TimeEntry & { korrekturStand: string };
export async function korrekturBuchungLaden(id: string): Promise<KorrekturBuchung | null> {
  const { data, error } = await derClient().from('time_entries').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...zeileAlsObjekt<TimeEntry>('time_entries', data), korrekturStand: String(data.updated_at) } : null;
}

export async function zeitkorrekturLaden(companyId: string, id: string): Promise<Zeitkorrektur | null> {
  const zeilen = await abfragen<Zeitkorrektur>('zeitkorrekturen', companyId, { wo: [{ art: 'gleich', feld: 'id', wert: id }], grenze: 1 });
  return zeilen[0] ?? null;
}
