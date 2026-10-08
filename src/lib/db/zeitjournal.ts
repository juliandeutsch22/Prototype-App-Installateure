import { abfragenSeite, type SeitenZeiger } from './pg/kern';

export interface ZeitAenderung {
  id: string;
  userId: string;
  userName: string;
  datum: string;
  art: 'angelegt' | 'geaendert' | 'geloescht';
  durchName: string;
  createdAt: number;
  vorher?: Record<string, unknown>;
  nachher?: Record<string, unknown>;
}

export function listZeitjournal(companyId: string, userId?: string, vor?: SeitenZeiger | null) {
  return abfragenSeite<ZeitAenderung>('zeitbuchungs_aenderungen', companyId, {
    wo: userId ? [{ art: 'gleich', feld: 'userId', wert: userId }] : [], vor,
  });
}
