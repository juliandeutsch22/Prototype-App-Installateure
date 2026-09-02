import type { Role } from '@/types';
import type { IconName } from '@/components/Icon';
import { aktiveModule, type ModulId } from '@/lib/module';

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
  /**
   * Zu welchem abschaltbaren Modul dieser Eintrag gehört.
   *
   * Ohne Angabe: Kern — immer da. Startseite, Zeiterfassung, Kunden,
   * Baustellen, Benutzer und Einstellungen lassen sich nicht abschalten.
   */
  modul?: ModulId;
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
  // Die KI-Erfassung stand frueher als Sonderfall per Umgebungsschalter in
  // dieser Liste. Sie ist jetzt ein Modul wie jedes andere — mit dem
  // Unterschied, dass sie ohne hinterlegte Zugaenge gar nicht erst waehlbar
  // ist (siehe `verfuegbar` in lib/module.ts).
  { path: '/voice', label: 'KI-Erfassung', short: 'KI', icon: 'mic', roles: ALL, group: 'Außendienst', modul: 'ki' },
  { path: '/order', label: 'Material bestellen', short: 'Material', icon: 'package', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst', modul: 'material' },
  // Nur REINE Mitarbeiter — Admin/GF sehen alle Baustellen über die
  // Verwaltungssicht (Legacy:1979 "nicht Admin, der sieht alle in Projekte").
  { path: '/my-schedule', label: 'Mein Einsatzplan', short: 'Plan', icon: 'calendar', roles: ['Mitarbeiter'], group: 'Außendienst', modul: 'einsatzplanung' },
  { path: '/my-projects', label: 'Meine Baustellen', short: 'Baustellen', icon: 'building', roles: ['Mitarbeiter'], group: 'Außendienst' },
  // Urlaub sieht JEDE Rolle: auch Buchhaltung und Verwaltung nehmen Urlaub,
  // und beantragen muessen ihn alle. Wer entscheiden darf, sieht in derselben
  // Ansicht zusaetzlich die offenen Antraege.
  { path: '/vacations', label: 'Urlaub', short: 'Urlaub', icon: 'calendar', roles: ALL, group: 'Außendienst', modul: 'urlaub' },
  // Der Schein gehoert in den Aussendienst: er entsteht vor Ort beim Kunden,
  // nicht im Buero.
  { path: '/worksheets', label: 'Handwerksscheine', short: 'Scheine', icon: 'clipboard', roles: ['Mitarbeiter', 'Buchhaltung', 'Verwaltung', ...LEAD], group: 'Außendienst', modul: 'scheine' },

  // Kunden VOR den Baustellen: der Kunde ist der Ausgangspunkt, die Baustelle
  // hängt an ihm. Auch die Buchhaltung braucht ihn — für die Rechnungsadresse.
  // Angebot vor Baustelle: so laeuft der Auftrag auch in Wirklichkeit.
  { path: '/quotes', label: 'Angebote', short: 'Angebote', icon: 'receipt', roles: ['Buchhaltung', ...LEAD], group: 'Verwaltung', modul: 'angebote' },
  { path: '/customers', label: 'Kunden', short: 'Kunden', icon: 'users', roles: ['Buchhaltung', 'Verwaltung', ...LEAD], group: 'Verwaltung' },
  { path: '/admin-projects', label: 'Baustellen', short: 'Baustellen', icon: 'building', roles: LEAD, group: 'Verwaltung' },
  { path: '/admin-orders', label: 'Anforderungen', short: 'Anforderungen', icon: 'clipboard', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung', modul: 'material' },
  { path: '/stock', label: 'Lager', short: 'Lager', icon: 'package', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung', modul: 'material' },
  { path: '/assignments', label: 'Einsatzplanung', short: 'Planung', icon: 'calendar', roles: LEAD, group: 'Verwaltung', modul: 'einsatzplanung' },
  { path: '/user-mgmt', label: 'Benutzerverwaltung', short: 'Benutzer', icon: 'users', roles: LEAD, group: 'Verwaltung' },
  // Stundensätze und Zuschläge sind Geschäftsführungssache — sie bestimmen,
  // was der Betrieb verrechnet.
  { path: '/settings', label: 'Einstellungen', short: 'Sätze', icon: 'settings', roles: LEAD, group: 'Verwaltung' },
  // Welche Bereiche der Betrieb ueberhaupt benutzt. Kern: waere die
  // Modulverwaltung selbst abschaltbar, koennte man sich aussperren.
  { path: '/modules', label: 'Module', short: 'Module', icon: 'settings', roles: TOP, group: 'Verwaltung' },

  // Margen sind Geschaeftsfuehrungssache — die Projektleitung sieht sie nicht.
  { path: '/costing', label: 'Nachkalkulation', short: 'Kalkulation', icon: 'chart', roles: TOP, group: 'Buchhaltung', modul: 'nachkalkulation' },
  { path: '/invoices', label: 'Rechnungen', short: 'Rechnungen', icon: 'receipt', roles: ['Buchhaltung', ...LEAD], group: 'Buchhaltung', modul: 'rechnungen' },
  // Zeitkonten: bewusst OHNE Projektleitung. Ueberstunden, Krankenstaende und
  // Urlaub eines Monteurs gehen sie nichts an — Krankenstaende sind zudem
  // Gesundheitsdaten nach Art. 9 DSGVO.
  { path: '/accounting', label: 'Mitarbeiterübersicht', short: 'Übersicht', icon: 'chart', roles: ['Buchhaltung', ...TOP], group: 'Buchhaltung', modul: 'zeitkonten' },

  // Persönliche Einstellungen, für jede Rolle. Steht bewusst ganz am ENDE
  // der Liste: die mobile Tab-Bar zeigt die ersten vier Einträge, und dort
  // gehören Zeiterfassung und Material hin, nicht die Meldungseinstellungen.
  // In der Sidebar erscheint der Punkt über die Gruppe trotzdem oben.
  { path: '/notifications', label: 'Benachrichtigungen', short: 'Meldungen', icon: 'bell', roles: ALL, group: 'Allgemein' },
];

/**
 * Was diese Rolle sehen darf UND was der Betrieb eingeschaltet hat.
 *
 * Beides zusammen, weil beides zusammengehört: die Rolle sagt, wer darf, das
 * Modul sagt, ob der Betrieb es überhaupt benutzt. Ein Eintrag ohne `modul`
 * gehört zum Kern und ist immer dabei.
 */
export function navForRole(role: Role, module?: Record<string, boolean>): NavItem[] {
  const an = aktiveModule(module);
  return NAV.filter((item) => item.roles.includes(role) && (!item.modul || an.has(item.modul)));
}

/**
 * Die vier Plätze der mobilen Leiste — je Rolle AUSGESUCHT, nicht abgeschnitten.
 *
 * Vorher nahm das Layout die ersten vier Einträge der gefilterten Liste. Das
 * war keine Entscheidung, sondern ein Nebeneffekt der Listenreihenfolge: bei
 * der Buchhaltung stand deshalb „Urlaub" unten und die Rechnungen — das,
 * worin sie den ganzen Tag arbeitet — lagen unter „Mehr". Beim Einfügen eines
 * neuen Tabs verschob sich die Leiste stillschweigend mit.
 *
 * Jetzt steht je Rolle da, was sie täglich braucht. Fällt ein Eintrag weg,
 * weil sein Modul aus ist, rückt der nächste aus derselben Liste nach.
 */
const LEISTE: Record<Role, string[]> = {
  // Der Monteur: Zeit bucht er taeglich, den Plan schaut er morgens, Material
  // fordert er unterwegs an. Der Schein liegt unter „Mehr" — er entsteht am
  // Ende eines Einsatzes und ist von dort aus verlinkt.
  Mitarbeiter: ['/', '/time', '/my-schedule', '/order'],
  // Das Buero bearbeitet Anforderungen und pflegt Kunden.
  Verwaltung: ['/', '/admin-orders', '/customers', '/time'],
  // Die Buchhaltung lebt in den Rechnungen — die standen vorher unter „Mehr".
  Buchhaltung: ['/', '/invoices', '/accounting', '/time'],
  // Die Projektleitung plant und schaut auf Baustellen.
  Projektleiter: ['/', '/assignments', '/admin-projects', '/admin-orders'],
  Geschäftsführung: ['/', '/assignments', '/admin-projects', '/invoices'],
  Administrator: ['/', '/assignments', '/admin-projects', '/invoices'],
};

/** Die vier Einträge der mobilen Leiste, plus alles Übrige für „Mehr". */
export function tabBarForRole(
  role: Role,
  module?: Record<string, boolean>,
): { unten: NavItem[]; mehr: NavItem[] } {
  const sichtbar = navForRole(role, module);
  const wunsch = LEISTE[role] ?? [];
  const unten = wunsch
    .map((p) => sichtbar.find((i) => i.path === p))
    .filter((i): i is NavItem => !!i);
  // Auffuellen, falls ein Wunscheintrag wegen eines abgeschalteten Moduls
  // fehlt: eine Leiste mit drei Symbolen und einer Luecke saehe kaputt aus.
  for (const i of sichtbar) {
    if (unten.length >= 4) break;
    if (!unten.includes(i)) unten.push(i);
  }
  return { unten, mehr: sichtbar.filter((i) => !unten.includes(i)) };
}


/** Reihenfolge der Navigationsgruppen. */
export const NAV_GROUPS = ['Allgemein', 'Außendienst', 'Verwaltung', 'Buchhaltung'] as const;

/** Sichtbare Navigation, nach Gruppen gebündelt (für übersichtliche Sidebar). */
export function navGroupsForRole(
  role: Role,
  module?: Record<string, boolean>,
): { group: string; items: NavItem[] }[] {
  const visible = navForRole(role, module);
  return NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

/**
 * Darf diese Rolle diesen Pfad — und ist sein Modul an?
 *
 * Die Modulprüfung gehört hierher und nicht nur in die Navigation: sonst
 * käme man per URL weiterhin in einen Bereich, den der Betrieb abgeschaltet
 * hat. Unsichtbar ist nicht dasselbe wie zu.
 */
export function canAccess(role: Role, path: string, module?: Record<string, boolean>): boolean {
  const item = NAV.find((i) => i.path === path);
  if (!item || !item.roles.includes(role)) return false;
  return !item.modul || aktiveModule(module).has(item.modul);
}
