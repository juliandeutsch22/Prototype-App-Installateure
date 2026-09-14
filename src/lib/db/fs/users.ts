import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, Role } from '@/types';
import { queryTenant } from './core';
import {
  DEFAULT_WEEKLY_HOURS, DEFAULT_VACATION_DAYS, DEFAULT_WORK_DAYS,
  type UserProfileInput,
} from '../benutzerVorgaben';

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

/** Schreibt das users/{uid}-Dokument (Legacy-Feldnamen beibehalten). */
function toRaw(companyId: string, uid: string, p: UserProfileInput) {
  return {
    uid,
    companyId, // immer aus dem Auth-Kontext des Admins
    name: p.name,
    email: p.email,
    role: p.role,
    active: p.active,
    weeklyTargetHours: p.weeklyTargetHours ?? DEFAULT_WEEKLY_HOURS,
    yearlyVacationDays: p.yearlyVacationDays ?? DEFAULT_VACATION_DAYS,
    work_days: p.workDays ?? DEFAULT_WORK_DAYS,
    app_start_date: p.appStartDate ?? null,
    initial_overtime: p.initialOvertime ?? 0,
  };
}

/** Stammdaten eines bestehenden Nutzers ändern (Doc-ID = uid). */
export function updateUserProfile(uid: string, p: Partial<UserProfileInput>) {
  const raw: Record<string, unknown> = {};
  if (p.name !== undefined) raw.name = p.name;
  if (p.role !== undefined) raw.role = p.role;
  if (p.active !== undefined) raw.active = p.active;
  if (p.weeklyTargetHours !== undefined) raw.weeklyTargetHours = p.weeklyTargetHours;
  if (p.yearlyVacationDays !== undefined) raw.yearlyVacationDays = p.yearlyVacationDays;
  if (p.workDays !== undefined) raw.work_days = p.workDays;
  if (p.appStartDate !== undefined) raw.app_start_date = p.appStartDate;
  if (p.initialOvertime !== undefined) raw.initial_overtime = p.initialOvertime;
  return updateDoc(doc(db, COLLECTION, uid), raw);
}

/** Legt das Firestore-Profil an (uid = Doc-ID). Die Cloud Function setzt Claims. */
export function createUserDoc(companyId: string, uid: string, p: UserProfileInput) {
  return setDoc(doc(db, COLLECTION, uid), toRaw(companyId, uid, p));
}

// Bewusst KEIN Löschen von Benutzern: timeEntries, materialOrders und
// assignments verweisen über die uid auf den Nutzer und würden verwaisen.
// Der Legacy-Prototyp kennt ebenfalls nur Deaktivieren (active: false),
// das die Anmeldung sperrt und den Nutzer aus Auswertungen nimmt.
