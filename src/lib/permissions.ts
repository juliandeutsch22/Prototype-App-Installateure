import type { Role } from '@/types';

/**
 * Rollen-Prädikate, 1:1 aus der Legacy-App übernommen (docs §2).
 * Administrator ist Superuser; Geschäftsführung deckt die Leitungsfunktionen ab.
 * Diese Helfer steuern die UI — die HARTE Durchsetzung liegt in firestore.rules.
 */
export const isAdmin = (r: Role) => r === 'Administrator';

/**
 * Projektleitung: dieselben Rechte wie die Geschäftsführung, MIT EINER
 * Ausnahme — die Zeitkonten der Mitarbeiter bleiben ihr verschlossen.
 *
 * Ein Projektleiter plant Baustellen, verteilt Material und rechnet ab. Was
 * ein einzelner Monteur an Überstunden, Krankenständen und Urlaub angesammelt
 * hat, geht ihn nichts an; das ist Sache von Geschäftsführung und
 * Buchhaltung. Krankenstände sind zudem Gesundheitsdaten nach Art. 9 DSGVO,
 * die nur bekommen darf, wer sie für seine Aufgabe braucht.
 */
export const isProjektleiter = (r: Role) => r === 'Projektleiter';

/**
 * Leitungsebene für alles, was Baustellen, Material und Abrechnung angeht.
 * Der Projektleiter zählt hier dazu — beim Zeitkonto (canEditTime) bewusst
 * nicht.
 */
export const isGF = (r: Role) =>
  r === 'Geschäftsführung' || isProjektleiter(r) || isAdmin(r);

/** Nur die echte Geschäftsführung, ohne Projektleitung. */
export const isTopLevel = (r: Role) => r === 'Geschäftsführung' || isAdmin(r);

export const isMitarbeiter = (r: Role) => r === 'Mitarbeiter' || isAdmin(r);
export const isVerw = (r: Role) => r === 'Verwaltung' || isAdmin(r);
export const isBuch = (r: Role) => r === 'Buchhaltung' || isAdmin(r);

export const canOrder = (r: Role) => isMitarbeiter(r) || isVerw(r) || isGF(r);

/**
 * Zeitkonten aller Mitarbeiter einsehen und korrigieren.
 * Der Projektleiter ist hier ausgenommen — das ist der einzige Unterschied
 * zur Geschäftsführung.
 */
export const canEditTime = (r: Role) => isBuch(r) || isTopLevel(r);

export const canManageProjects = (r: Role) => isGF(r);
export const canManageUsers = (r: Role) => isGF(r);

/**
 * Administratoren anlegen, ändern und löschen darf nur ein Administrator.
 *
 * Sonst könnte sich eine Geschäftsführung selbst zum Superuser machen oder
 * den letzten Administrator entfernen — die Rollenhierarchie wäre damit
 * wirkungslos. Serverseitig steht dieselbe Grenze in firestore.rules.
 */
export const canManageAdmins = (r: Role) => isAdmin(r);

export const canInvoice = (r: Role) => isGF(r) || isBuch(r);
export const canProcessOrders = (r: Role) => isVerw(r) || isGF(r);

/** Soll/Ist-Saldo gilt nur für diese Rollen (Leitung ausgenommen). */
export const shouldShowOvertime = (r: Role) =>
  r === 'Mitarbeiter' || r === 'Verwaltung' || r === 'Buchhaltung';
