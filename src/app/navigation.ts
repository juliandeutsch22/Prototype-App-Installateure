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
export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', roles: ['Mitarbeiter', 'Verwaltung', 'Buchhaltung'], group: 'Allgemein' },

  { path: '/time', label: 'Zeiterfassung', roles: ['Mitarbeiter', 'Verwaltung'], group: 'Außendienst' },
  { path: '/voice', label: 'KI-Erfassung', roles: ['Mitarbeiter', 'Verwaltung'], group: 'Außendienst' },
  { path: '/order', label: 'Material bestellen', roles: ['Mitarbeiter', 'Verwaltung'], group: 'Außendienst' },
  { path: '/my-schedule', label: 'Mein Einsatzplan', roles: ['Mitarbeiter'], group: 'Außendienst' },
  { path: '/my-projects', label: 'Meine Baustellen', roles: ['Mitarbeiter'], group: 'Außendienst' },

  { path: '/admin-projects', label: 'Baustellen', roles: ['Verwaltung'], group: 'Verwaltung' },
  { path: '/admin-orders', label: 'Bestellungen', roles: ['Verwaltung'], group: 'Verwaltung' },
  { path: '/assignments', label: 'Einsatzplanung', roles: ['Verwaltung'], group: 'Verwaltung' },
  { path: '/user-mgmt', label: 'Benutzerverwaltung', roles: ['Verwaltung'], group: 'Verwaltung' },

  { path: '/invoices', label: 'Rechnungen', roles: ['Verwaltung', 'Buchhaltung'], group: 'Buchhaltung' },
  { path: '/accounting', label: 'Buchhaltung', roles: ['Buchhaltung'], group: 'Buchhaltung' },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canAccess(role: Role, path: string): boolean {
  const item = NAV.find((i) => i.path === path);
  return item ? item.roles.includes(role) : false;
}
