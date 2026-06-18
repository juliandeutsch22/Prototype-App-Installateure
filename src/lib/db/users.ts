import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

/** Felder, die das Benutzerformular bearbeitet (camelCase im UI). */
export interface UserProfileInput {
  name: string;
  email: string;
  role: Role;
  active: boolean;
  weeklyTargetHours?: number;
  workDays?: number[];
  appStartDate?: string | null;
  initialOvertime?: number;
}

/** Schreibt das users/{uid}-Dokument (Legacy-Feldnamen beibehalten). */
function toRaw(companyId: string, uid: string, p: UserProfileInput) {
  return {
    uid,
    companyId, // immer aus dem Auth-Kontext des Admins
    name: p.name,
    email: p.email,
    role: p.role,
    active: p.active,
    weeklyTargetHours: p.weeklyTargetHours ?? 38.5,
    work_days: p.workDays ?? [1, 2, 3, 4, 5],
    app_start_date: p.appStartDate ?? null,
    initial_overtime: p.initialOvertime ?? 0,
  };
}

/** Legt das Firestore-Profil an (uid = Doc-ID). Die Cloud Function setzt Claims. */
export function createUserDoc(companyId: string, uid: string, p: UserProfileInput) {
  return setDoc(doc(db, COLLECTION, uid), toRaw(companyId, uid, p));
}

/** Aktualisiert Rolle/Stunden/Status; companyId bleibt unverändert. */
export function updateUserDoc(uid: string, data: Partial<ReturnType<typeof toRaw>>) {
  const { companyId: _ignore, ...rest } = data as { companyId?: string };
  void _ignore;
  return updateDoc(doc(db, COLLECTION, uid), rest);
}

export function deleteUserDoc(uid: string) {
  return deleteDoc(doc(db, COLLECTION, uid));
}
