import type { Role } from '@/types';
import type { IconName } from '@/components/Icon';
import type { OffenePosten } from '@/lib/db/offenePosten';
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
  /**
   * Welche offene Zahl als Abzeichen an diesem Eintrag steht.
   *
   * ABSICHTLICH NUR AN DREI EINTRAEGEN. Ein Abzeichen taugt nur, solange es
   * die Ausnahme ist: was hier steht, ist normalerweise NULL, ist eine
   * Entscheidung und hat einen Besitzer. „Nicht eingetragene Zeiten" traefe
   * keines der drei — die stehen am Monatsende bei jedem offen, und niemand
   * kann sie wegentscheiden. Eine Zahl, die immer leuchtet, nimmt den beiden
   * anderen die Wirkung mit.
   *
   * Der Typ ist `keyof OffenePosten` und keine eigene Aufzaehlung: so kann
   * hier nichts stehen, was die Datenbank gar nicht zaehlt.
   */
  hinweis?: keyof OffenePosten;
}

/**
 * Navigations- und Zugriffsmatrix für die 11 Screens (vgl. Spec §2).
 * Diese Liste steuert UI-Sichtbarkeit; die HARTE Durchsetzung erfolgt
 * zusätzlich serverseitig im Zeilenschutz der Datenbank.
 */
const ALL: Role[] = [
  'Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter',
  'Geschäftsführung', 'Administrator',
];
/** Leitung inklusive Projektleitung — plant, verwaltet, rechnet ab. */
const LEAD: Role[] = ['Projektleiter', 'Geschäftsführung', 'Administrator'];
/** Ohne Projektleitung: alles rund um die Zeitkonten der Mitarbeiter. */
const TOP: Role[] = ['Geschäftsführung', 'Administrator'];
/**
 * Enger als TOP: die Administration allein.
 *
 * Für Dinge, die nicht das tägliche Geschäft der Geschäftsführung sind,
 * sondern die EINRICHTUNG des Betriebs — und deren Fehlgriff allen den Weg zu
 * ihrer Arbeit nimmt.
 */
const NUR_ADMIN: Role[] = ['Administrator'];

export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', short: 'Start', icon: 'home', roles: ALL, group: 'Allgemein' },

  // JEDE Rolle muss die eigene Zeit buchen können (auch die Buchhaltung:
  // Krankenstand und Urlaub). Legacy setzt den Tab unbedingt, ohne
  // Rollenprüfung (perl-installateur-web-app.html:1954).
  { path: '/time', label: 'Zeiterfassung', short: 'Zeit', icon: 'clock', roles: ALL, group: 'Außendienst' },
  /*
   * MATERIAL SIND DREI EIGENE BEREICHE, KEIN REITER MIT UNTERREITERN.
   *
   * Sie waren eine Zeit lang unter „Material" zusammengefasst, weil es
   * thematisch eines ist. Aus dem Betrieb kam die klare Rückmeldung, dass das
   * nicht stimmt: es sind drei verschiedene Tätigkeiten von drei
   * verschiedenen Leuten. Der Monteur fordert an, die Verwaltung arbeitet
   * Anforderungen ab, und Bestand führt, wer im Lager steht. Wer eines davon
   * tut, sucht es dort, wo es hingehört — und nicht hinter einem Unterreiter
   * in einem fremden Bereich.
   *
   * Deshalb auch verschiedene Gruppen: Anfordern ist Außendienst, das
   * Abarbeiten und der Bestand sind Verwaltung.
   */
  { path: '/material', label: 'Material anfordern', short: 'Material', icon: 'package', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Außendienst', modul: 'material' },
  // Nur REINE Mitarbeiter — Admin/GF sehen alle Baustellen über die
  // Verwaltungssicht (Legacy:1979 "nicht Admin, der sieht alle in Projekte").
  { path: '/my-schedule', label: 'Mein Einsatzplan', short: 'Plan', icon: 'calendar', roles: ['Mitarbeiter'], group: 'Außendienst', modul: 'einsatzplanung' },
  { path: '/my-projects', label: 'Meine Baustellen', short: 'Baustellen', icon: 'building', roles: ['Mitarbeiter'], group: 'Außendienst' },
  // Urlaub sieht JEDE Rolle: auch Buchhaltung und Verwaltung nehmen Urlaub,
  // und beantragen muessen ihn alle. Wer entscheiden darf, sieht in derselben
  // Ansicht zusaetzlich die offenen Antraege.
  { path: '/vacations', label: 'Urlaub', short: 'Urlaub', icon: 'calendar', roles: ALL, group: 'Außendienst', modul: 'urlaub', hinweis: 'urlaub' },
  // Der Schein gehoert in den Aussendienst: er entsteht vor Ort beim Kunden,
  // nicht im Buero.
  { path: '/worksheets', label: 'Handwerksscheine', short: 'Scheine', icon: 'clipboard', roles: ['Mitarbeiter', 'Buchhaltung', 'Verwaltung', ...LEAD], group: 'Außendienst', modul: 'scheine' },

  // Kunden VOR den Baustellen: der Kunde ist der Ausgangspunkt, die Baustelle
  // hängt an ihm. Auch die Buchhaltung braucht ihn — für die Rechnungsadresse.
  // Angebot vor Baustelle: so laeuft der Auftrag auch in Wirklichkeit.
  { path: '/quotes', label: 'Angebote', short: 'Angebote', icon: 'receipt', roles: ['Buchhaltung', ...LEAD], group: 'Verwaltung', modul: 'angebote' },
  { path: '/customers', label: 'Kunden', short: 'Kunden', icon: 'users', roles: ['Buchhaltung', 'Verwaltung', ...LEAD], group: 'Verwaltung' },
  // Wartungen bei den Kunden, nicht bei den Baustellen: eine Vereinbarung
  // gehört dem Kunden und überlebt jede einzelne Baustelle. Die Verwaltung
  // sieht sie mit — sie ruft an und vereinbart den Termin.
  { path: '/wartungen', label: 'Wartungen', short: 'Wartung', icon: 'clipboard', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung', modul: 'wartung' },
  { path: '/anforderungen', label: 'Anforderungen', short: 'Anford.', icon: 'clipboard', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung', modul: 'material', hinweis: 'anforderungen' },
  { path: '/lager', label: 'Lager', short: 'Lager', icon: 'package', roles: ['Verwaltung', ...LEAD], group: 'Verwaltung', modul: 'material' },
  { path: '/admin-projects', label: 'Baustellen', short: 'Baustellen', icon: 'building', roles: LEAD, group: 'Verwaltung' },
  { path: '/assignments', label: 'Einsatzplanung', short: 'Planung', icon: 'calendar', roles: LEAD, group: 'Verwaltung', modul: 'einsatzplanung' },
  // Wer angelegt wird und welche Rolle er bekommt, ist Eigentümersache und
  // nicht Sache der Bauleitung: mit dieser Ansicht vergibt man Rechte.
  { path: '/user-mgmt', label: 'Benutzerverwaltung', short: 'Benutzer', icon: 'users', roles: TOP, group: 'Verwaltung' },
  // Einstellungen: EIN Reiter für alles, was man einmal einstellt und dann
  // lange nicht mehr anfasst — die eigenen Meldungen, die Sätze des Betriebs
  // und die Module. Vorher waren das drei Reiter, zwei davon für Dinge, die
  // man im Monat vielleicht einmal öffnet.
  //
  // Der Reiter steht JEDER Rolle offen, weil die Meldungseinstellungen jedem
  // gehören. Was darunter enger ist, steht in UNTER — Sätze und Module sind
  // Geschäftsführungssache.
  { path: '/settings', label: 'Einstellungen', short: 'Einstellungen', icon: 'settings', roles: ALL, group: 'Allgemein' },

  // Margen sind Geschaeftsfuehrungssache — die Projektleitung sieht sie nicht.
  { path: '/costing', label: 'Nachkalkulation', short: 'Kalkulation', icon: 'chart', roles: TOP, group: 'Buchhaltung', modul: 'nachkalkulation' },
  // Rechnungen OHNE Projektleitung — so steht es auch in den Richtlinien, und
  // dort ist es die Wahrheit. Der Eintrag zeigte sie ihr trotzdem an; wer
  // klickte, landete in „Kein Zugriff".
  { path: '/invoices', label: 'Rechnungen', short: 'Rechnungen', icon: 'receipt', roles: ['Buchhaltung', ...TOP], group: 'Buchhaltung', modul: 'rechnungen', hinweis: 'mahnungen' },
  // Zeitkonten: bewusst OHNE Projektleitung. Ueberstunden, Krankenstaende und
  // Urlaub eines Monteurs gehen sie nichts an — Krankenstaende sind zudem
  // Gesundheitsdaten nach Art. 9 DSGVO.
  { path: '/accounting', label: 'Mitarbeiterübersicht', short: 'Übersicht', icon: 'chart', roles: ['Buchhaltung', ...TOP], group: 'Buchhaltung', modul: 'zeitkonten' },

];

/**
 * Was unter einem Reiter liegt.
 *
 * Nicht jede Ansicht verdient einen eigenen Reiter. „Anforderungen" und
 * „Lager" sind kein eigenes Thema — sie sind zwei Blicke auf Material. Die
 * Geschäftsführung sah dadurch 18 Reiter für vielleicht 14 Themen.
 *
 * Ein Eintrag ohne `roles` gilt für jeden, der den Reiter selbst sieht. Steht
 * eine Rollenliste da, ist die Unterseite ENGER als der Reiter — so kommt der
 * Monteur an seine Meldungen, ohne die Sätze des Betriebs zu sehen.
 */
export interface Unterseite {
  /** Letztes Pfadstück, z. B. `lager` für /material/lager. */
  pfad: string;
  label: string;
  roles?: Role[];
}

export const UNTER: Record<string, Unterseite[]> = {
  /*
   * EINSATZPLANUNG: ZWEI BLICKE AUF DASSELBE, deshalb Unterseiten.
   *
   * Bei Material war die Zusammenfassung falsch — dort sind es drei
   * verschiedene Taetigkeiten von drei verschiedenen Leuten. Hier ist es
   * EINE Person mit EINER Aufgabe: der Wochenplan beantwortet die Frage
   * „wer ist frei", die Tagesplanung traegt danach ein. Wer plant, braucht
   * beides nacheinander und nicht an zwei Orten.
   *
   * Der Tag steht zuerst: er ist der Ort, an dem geschrieben wird.
   */
  '/assignments': [
    { pfad: 'tag', label: 'Tag planen' },
    { pfad: 'woche', label: 'Wochenplan' },
  ],
  '/settings': [
    // MEIN KONTO ZUERST: das Einzige, was jede Rolle hier hat — das eigene
    // Passwort und die eigenen Meldungen. Der Pfad heißt weiterhin
    // `meldungen`: er steht in Lesezeichen und in verschickten Meldungen,
    // und eine tote Adresse dafür wäre ein Fehler ohne Not.
    { pfad: 'meldungen', label: 'Mein Konto' },
    // Was auf den Belegen steht — Briefkopf, Logo, UID, Bankverbindung.
    // Vor den Saetzen, weil es einmal beim Einrichten gebraucht wird und
    // danach selten: wer den Reiter oeffnet, sucht meistens genau das.
    { pfad: 'firma', label: 'Firmendaten', roles: TOP },
    // „und Kosten" steht dabei, weil hier auch die INTERNEN Kostensätze
    // liegen — die Grundlage der Nachkalkulation. Unter „Sätze und Zuschläge"
    // hat sie niemand vermutet; gefragt wurde stattdessen, wo das Feld
    // überhaupt sei.
    { pfad: 'saetze', label: 'Sätze und Kosten', roles: TOP },
    /*
      Der Kontenrahmen steht NEBEN den Sätzen und nicht darin: er gehört
      einer anderen Rolle. Welche Konten die Kanzlei bebucht, pflegt die
      BUCHHALTUNG — sie ist die Rolle, die mit ihr spricht. Sie dafür in die
      Sätze und Kostensätze zu lassen hiesse, ihr die Margendaten des Betriebs
      zu öffnen.
    */
    { pfad: 'konten', label: 'Kontenrahmen', roles: [...TOP, 'Buchhaltung'] },
    /*
      Einblick in den ganzen Betrieb zu gewähren ist eine Entscheidung der
      Spitze — dieselbe Grenze zieht die Datenbank. Sie steht am Ende der
      Einstellungen, weil sie selten gebraucht wird und nie beiläufig.
    */
    { pfad: 'support', label: 'Supportzugang', roles: TOP },
    // Welche Bereiche der Betrieb überhaupt benutzt. Diese Unterseite trägt
    // bewusst KEIN Modul: wäre die Modulverwaltung selbst abschaltbar, könnte
    // man sich aussperren und nie wieder hineinkommen.
    //
    // NUR ADMINISTRATION, seit 07.09.2026 — enger als der Rest der
    // Einstellungen. Sätze und Briefkopf ändert die Geschäftsführung im
    // Tagesgeschäft; ein abgeschaltetes Modul nimmt dagegen allen den Weg zu
    // ihrer Arbeit, und zwar unsichtbar: der Reiter ist einfach weg. Das ist
    // Einrichtung, keine Führung. Dieselbe Grenze steht in der Datenbank
    // — die Oberfläche allein wäre keine.
    { pfad: 'module', label: 'Module', roles: NUR_ADMIN },
    // Die Sicherung gehoert hierher und nicht in eine eigene Ecke: sie ist
    // etwas, das man einmal einrichtet, einmal prueft und danach selten
    // anfasst — wie die Saetze und die Module. Ein eigener Reiter dafuer
    // waere der Rueckfall in die 18 Reiter von frueher.
    { pfad: 'sicherung', label: 'Datensicherung', roles: TOP },
  ],
};

/** Die Unterseiten eines Reiters, die diese Rolle sehen darf. */
export function unterseitenFuer(basis: string, role: Role): Unterseite[] {
  return (UNTER[basis] ?? []).filter((s) => !s.roles || s.roles.includes(role));
}

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
  Mitarbeiter: ['/', '/time', '/my-schedule', '/material'],
  // Das Buero bearbeitet Anforderungen und pflegt Kunden.
  Verwaltung: ['/', '/material', '/customers', '/time'],
  // Die Buchhaltung lebt in den Rechnungen — die standen vorher unter „Mehr".
  Buchhaltung: ['/', '/invoices', '/accounting', '/time'],
  // Die Projektleitung plant und schaut auf Baustellen.
  Projektleiter: ['/', '/assignments', '/admin-projects', '/material'],
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

/**
 * Wie die Zahl an einem Menüpunkt heisst, wenn sie vorgelesen wird.
 *
 * EINZAHL UND MEHRZAHL GETRENNT, und das ist nicht Ziererei: „1 offene
 * Urlaubsanträge" ist der Satz, über den in dieser App schon einmal jemand
 * gestolpert ist („1 Tage fehlen", behoben am 16.09.). Wer einen Vorleser
 * benutzt, hört ihn im Gegensatz zum Sehenden ganz.
 */
export function hinweisWort(art: keyof OffenePosten, anzahl: number): string {
  const eins = anzahl === 1;
  switch (art) {
    case 'urlaub':
      return eins ? 'offener Urlaubsantrag' : 'offene Urlaubsanträge';
    case 'anforderungen':
      return eins ? 'offene Materialanforderung' : 'offene Materialanforderungen';
    case 'mahnungen':
      return eins ? 'fällige Mahnung' : 'fällige Mahnungen';
  }
}

/**
 * Die Zahl an einem Menüpunkt — 0, wenn keine dranhängt oder keine bekannt ist.
 *
 * `undefined` VON DER ABFRAGE HEISST „NICHT BEKANNT", nicht „nichts offen".
 * Beides führt hier zu 0 und damit zu keinem Abzeichen — der Unterschied
 * bleibt trotzdem wichtig, und deshalb setzt die Datenschicht auch keine 0
 * ein, wenn sie nichts weiss: eine Zahl, die niemand geprüft hat, sähe aus
 * wie eine Auskunft.
 */
export function hinweisZahl(item: NavItem, posten: OffenePosten | undefined): number {
  if (!item.hinweis || !posten) return 0;
  return posten[item.hinweis];
}

/**
 * Alle Zahlen hinter einer Gruppe von Einträgen zusammen.
 *
 * WOFÜR: der Knopf „Mehr" am Telefon verdeckt bis zu zwölf Bereiche. Ohne
 * diese Summe läge dort eine Meldung, die man nur findet, wenn man ohnehin
 * schon hinsieht — und das ist genau der Zustand, den die Abzeichen beenden
 * sollen.
 */
export function hinweisSumme(items: NavItem[], posten: OffenePosten | undefined): number {
  return items.reduce((s, i) => s + hinweisZahl(i, posten), 0);
}
