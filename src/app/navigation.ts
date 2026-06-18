import type { Role } from '@/types';

export interface NavItem {
  /** Routenpfad (relativ zu /). */
  path: string;
  label: string;
  /** Rollen, die diesen Screen sehen dürfen. */
  roles: Role[];
  /** Gruppierung in der Navigation. */
  group: 'Allgemein' | 'Außendienst' | 'Verwaltung' | 'Buchhaltung';
}

/**
 * Navigations- und Zugriffsmatrix für die 11 Screens (vgl. Spec §2).
 * Diese Liste steuert UI-Sichtbarkeit; die HARTE Durchsetzung erfolgt
 * zusätzlich serverseitig in firestore.rules (Spec §7).
 */
const ALL: Role[] = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Geschäftsführung', 'Administrator'];
const LEAD: Role[] = ['Geschäftsführung', 'Administrator'];

export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', roles: ALL, group: 'Allgemein' },

  { path: '/time', label: 'Zeiterfassung', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  { path: '/voice', label: 'KI-Erfassung', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  { path: '/order', label: 'Material bestellen', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  { path: '/my-schedule', label: 'Mein Einsatzplan', roles: ['Mitarbeiter', 'Administrator'], group: 'Außendienst' },
  { path: '/my-projects', label: 'Meine Baustellen', roles: ['Mitarbeiter', 'Administrator'], group: 'Außendienst' },

  { path: '/admin-projects', label: 'Baustellen', roles: LEAD, group: 'Verwaltung' },
  { path: '/admin-orders', label: 'Bestellungen', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/assignments', label: 'Einsatzplanung', roles: LEAD, group: 'Verwaltung' },
  { path: '/user-mgmt', label: 'Benutzerverwaltung', roles: LEAD, group: 'Verwaltung' },

  { path: '/invoices', label: 'Rechnungen', roles: ['Buchhaltung', ...LEAD], group: 'Buchhaltung' },
  { path: '/accounting', label: 'Mitarbeiterübersicht', roles: ['Buchhaltung', ...LEAD], group: 'Buchhaltung' },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canAccess(role: Role, path: string): boolean {
  const item = NAV.find((i) => i.path === path);
  return item ? item.roles.includes(role) : false;
}
