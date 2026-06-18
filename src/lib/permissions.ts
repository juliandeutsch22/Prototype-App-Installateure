import type { Role } from '@/types';

/**
 * Rollen-Prädikate, 1:1 aus der Legacy-App übernommen (docs §2).
 * Administrator ist Superuser; Geschäftsführung deckt die Leitungsfunktionen ab.
 * Diese Helfer steuern die UI — die HARTE Durchsetzung liegt in firestore.rules.
 */
export const isAdmin = (r: Role) => r === 'Administrator';
export const isGF = (r: Role) => r === 'Geschäftsführung' || isAdmin(r);
export const isMitarbeiter = (r: Role) => r === 'Mitarbeiter' || isAdmin(r);
export const isVerw = (r: Role) => r === 'Verwaltung' || isAdmin(r);
export const isBuch = (r: Role) => r === 'Buchhaltung' || isAdmin(r);

export const canOrder = (r: Role) => isMitarbeiter(r) || isVerw(r) || isGF(r);
export const canEditTime = (r: Role) => isBuch(r) || isGF(r);
export const canManageProjects = (r: Role) => isGF(r);
export const canManageUsers = (r: Role) => isGF(r);
export const canInvoice = (r: Role) => isGF(r) || isBuch(r);
export const canProcessOrders = (r: Role) => isVerw(r) || isGF(r);

/** Soll/Ist-Saldo gilt nur für diese Rollen (GF & Admin ausgenommen). */
export const shouldShowOvertime = (r: Role) =>
  r === 'Mitarbeiter' || r === 'Verwaltung' || r === 'Buchhaltung';
