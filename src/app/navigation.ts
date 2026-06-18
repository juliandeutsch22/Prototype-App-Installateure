import type { Role } from '@/types';
import type { IconName } from '@/components/Icon';

export interface NavItem {
  /** Routenpfad (relativ zu /). */
  path: string;
  label: string;
  /** Kurzlabel für die mobile Tab-Bar (unter dem Icon). */
  short: string;
  /** Icon-Name (siehe components/Icon). */
  icon: IconName;
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
  { path: '/', label: 'Dashboard', short: 'Start', icon: 'home', roles: ALL, group: 'Allgemein' },

  { path: '/time', label: 'Zeiterfassung', short: 'Zeit', icon: 'clock', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  { path: '/voice', label: 'KI-Erfassung', short: 'KI', icon: 'mic', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  { path: '/order', label: 'Material bestellen', short: 'Material', icon: 'package', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  { path: '/my-schedule', label: 'Mein Einsatzplan', short: 'Plan', icon: 'calendar', roles: ['Mitarbeiter', 'Administrator'], group: 'Außendienst' },
  { path: '/my-projects', label: 'Meine Baustellen', short: 'Baustellen', icon: 'building', roles: ['Mitarbeiter', 'Administrator'], group: 'Außendienst' },

  { path: '/admin-projects', label: 'Baustellen', short: 'Baustellen', icon: 'building', roles: LEAD, group: 'Verwaltung' },
  { path: '/admin-orders', label: 'Bestellungen', short: 'Bestellungen', icon: 'clipboard', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/assignments', label: 'Einsatzplanung', short: 'Planung', icon: 'calendar', roles: LEAD, group: 'Verwaltung' },
  { path: '/user-mgmt', label: 'Benutzerverwaltung', short: 'Benutzer', icon: 'users', roles: LEAD, group: 'Verwaltung' },

  { path: '/invoices', label: 'Rechnungen', short: 'Rechnungen', icon: 'receipt', roles: ['Buchhaltung', ...LEAD], group: 'Buchhaltung' },
  { path: '/accounting', label: 'Mitarbeiterübersicht', short: 'Übersicht', icon: 'chart', roles: ['Buchhaltung', ...LEAD], group: 'Buchhaltung' },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canAccess(role: Role, path: string): boolean {
  const item = NAV.find((i) => i.path === path);
  return item ? item.roles.includes(role) : false;
}
