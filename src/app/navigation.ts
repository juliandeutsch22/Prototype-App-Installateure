import type { Role } from '@/types';
import type { IconName } from '@/components/Icon';
import { VOICE_ENABLED } from '@/lib/features';

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
const ALL: Role[] = [
  'Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter',
  'Geschäftsführung', 'Administrator',
];
/** Leitung inklusive Projektleitung — plant, verwaltet, rechnet ab. */
const LEAD: Role[] = ['Projektleiter', 'Geschäftsführung', 'Administrator'];
/** Ohne Projektleitung: alles rund um die Zeitkonten der Mitarbeiter. */
const TOP: Role[] = ['Geschäftsführung', 'Administrator'];

export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', short: 'Start', icon: 'home', roles: ALL, group: 'Allgemein' },

  // Zeiterfassung + KI-Erfassung: JEDE Rolle muss die eigene Zeit buchen können
  // (auch Buchhaltung: Krankenstand/Urlaub). Legacy setzt den Tab unbedingt,
  // ohne Rollenprüfung (perl-installateur-web-app.html:1954).
  { path: '/time', label: 'Zeiterfassung', short: 'Zeit', icon: 'clock', roles: ALL, group: 'Außendienst' },
  { path: '/order', label: 'Material bestellen', short: 'Material', icon: 'package', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst' },
  // Nur REINE Mitarbeiter — Admin/GF sehen alle Baustellen über die
  // Verwaltungssicht (Legacy:1979 "nicht Admin, der sieht alle in Projekte").
  { path: '/my-schedule', label: 'Mein Einsatzplan', short: 'Plan', icon: 'calendar', roles: ['Mitarbeiter'], group: 'Außendienst' },
  { path: '/my-projects', label: 'Meine Baustellen', short: 'Baustellen', icon: 'building', roles: ['Mitarbeiter'], group: 'Außendienst' },
  // Urlaub sieht JEDE Rolle: auch Buchhaltung und Verwaltung nehmen Urlaub,
  // und beantragen muessen ihn alle. Wer entscheiden darf, sieht in derselben
  // Ansicht zusaetzlich die offenen Antraege.
  { path: '/vacations', label: 'Urlaub', short: 'Urlaub', icon: 'calendar', roles: ALL, group: 'Außendienst' },
  // Der Schein gehoert in den Aussendienst: er entsteht vor Ort beim Kunden,
  // nicht im Buero.
  { path: '/worksheets', label: 'Handwerksscheine', short: 'Scheine', icon: 'clipboard', roles: ['Mitarbeiter', 'Buchhaltung', 'Verwaltung', ...LEAD], group: 'Außendienst' },

  // Kunden VOR den Baustellen: der Kunde ist der Ausgangspunkt, die Baustelle
  // hängt an ihm. Auch die Buchhaltung braucht ihn — für die Rechnungsadresse.
  // Angebot vor Baustelle: so laeuft der Auftrag auch in Wirklichkeit.
  { path: '/quotes', label: 'Angebote', short: 'Angebote', icon: 'receipt', roles: ['Buchhaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/customers', label: 'Kunden', short: 'Kunden', icon: 'users', roles: ['Buchhaltung', 'Verwaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/admin-projects', label: 'Baustellen', short: 'Baustellen', icon: 'building', roles: LEAD, group: 'Verwaltung' },
  { path: '/admin-orders', label: 'Anforderungen', short: 'Anforderungen', icon: 'clipboard', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/stock', label: 'Lager', short: 'Lager', icon: 'package', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/assignments', label: 'Einsatzplanung', short: 'Planung', icon: 'calendar', roles: LEAD, group: 'Verwaltung' },
  { path: '/user-mgmt', label: 'Benutzerverwaltung', short: 'Benutzer', icon: 'users', roles: LEAD, group: 'Verwaltung' },
  // Stundensätze und Zuschläge sind Geschäftsführungssache — sie bestimmen,
  // was der Betrieb verrechnet.
  { path: '/settings', label: 'Einstellungen', short: 'Sätze', icon: 'settings', roles: LEAD, group: 'Verwaltung' },

  // Margen sind Geschaeftsfuehrungssache — die Projektleitung sieht sie nicht.
  { path: '/costing', label: 'Nachkalkulation', short: 'Kalkulation', icon: 'chart', roles: TOP, group: 'Buchhaltung' },
  { path: '/invoices', label: 'Rechnungen', short: 'Rechnungen', icon: 'receipt', roles: ['Buchhaltung', ...LEAD], group: 'Buchhaltung' },
  // Zeitkonten: bewusst OHNE Projektleitung. Ueberstunden, Krankenstaende und
  // Urlaub eines Monteurs gehen sie nichts an — Krankenstaende sind zudem
  // Gesundheitsdaten nach Art. 9 DSGVO.
  { path: '/accounting', label: 'Mitarbeiterübersicht', short: 'Übersicht', icon: 'chart', roles: ['Buchhaltung', ...TOP], group: 'Buchhaltung' },

  // Persönliche Einstellungen, für jede Rolle. Steht bewusst ganz am ENDE
  // der Liste: die mobile Tab-Bar zeigt die ersten vier Einträge, und dort
  // gehören Zeiterfassung und Material hin, nicht die Meldungseinstellungen.
  // In der Sidebar erscheint der Punkt über die Gruppe trotzdem oben.
  { path: '/notifications', label: 'Benachrichtigungen', short: 'Meldungen', icon: 'bell', roles: ALL, group: 'Allgemein' },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

/**
 * Die KI-Erfassung haengt am Schalter. Sie steht bewusst NICHT in NAV,
 * sondern wird nur bei Bedarf eingefuegt — so kann keine Ansicht sie
 * versehentlich mitzeigen.
 */
if (VOICE_ENABLED) {
  NAV.splice(2, 0, {
    path: '/voice', label: 'KI-Erfassung', short: 'KI', icon: 'mic',
    roles: ALL, group: 'Außendienst',
  });
}

/** Reihenfolge der Navigationsgruppen. */
export const NAV_GROUPS = ['Allgemein', 'Außendienst', 'Verwaltung', 'Buchhaltung'] as const;

/** Sichtbare Navigation, nach Gruppen gebündelt (für übersichtliche Sidebar). */
export function navGroupsForRole(role: Role): { group: string; items: NavItem[] }[] {
  const visible = navForRole(role);
  return NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

export function canAccess(role: Role, path: string): boolean {
  const item = NAV.find((i) => i.path === path);
  return item ? item.roles.includes(role) : false;
}
