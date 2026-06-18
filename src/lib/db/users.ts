import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, Role } from '@/types';
import { queryTenant } from './core';

const COLLECTION = 'users';

/**
 * Rohes Firestore-Dokument der `users`-Collection. Felder sind teils snake_case
 * (Legacy). Diese Schicht normalisiert sie in den camelCase-Typ AppUser, ohne
 * die gespeicherten Felder zu verändern.
 */
interface RawUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  weeklyTargetHours?: number;
  yearlyVacationDays?: number;
  initial_overtime?: number;
  app_start_date?: string | null;
  work_days?: number[];
  companyId: string;
}

function normalize(raw: RawUser & { id: string }): AppUser {
  return {
    id: raw.id,
    companyId: raw.companyId,
    uid: raw.uid,
    name: raw.name,
    email: raw.email,
    role: raw.role,
    active: raw.active,
    weeklyTargetHours: raw.weeklyTargetHours,
    yearlyVacationDays: raw.yearlyVacationDays,
    initialOvertime: raw.initial_overtime,
    appStartDate: raw.app_start_date ?? null,
    workDays: raw.work_days,
  };
}

export async function listUsers(companyId: string): Promise<AppUser[]> {
  const rows = await queryTenant<RawUser>(COLLECTION, companyId);
  return rows.map(normalize);
}

export async function getUserByUid(_companyId: string, uid: string): Promise<AppUser | null> {
  // users sind per uid geschlüsselt (users/{uid}) -> direktes get.
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) return null;
  return normalize({ id: snap.id, ...(snap.data() as RawUser) });
}
