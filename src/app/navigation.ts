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
  group: 'Start' | 'Aufträge' | 'Geld' | 'Team' | 'Material' | 'Einstellungen';
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
  /**
   * Eine weitere Rolle, die den Eintrag nur mit Freigabe oder Betriebs-
   * einstellung bekommt (Testbericht 30.09.2026, M38): die Projektleitung
   * mit „Rechnungen lesen“, oder im Einsatzplan, wenn der Betrieb es
   * einschaltet. Die Grenze zieht die Datenbank.
   */
  zusatz?: { rolle: Role; wenn: keyof Zusatzrechte };
}

/** Was über die Rolle hinaus einen Eintrag öffnet — aus der eigenen Zeile und dem Betrieb. */
export interface Zusatzrechte {
  rechnungenLesen?: boolean;
  projektleitungImEinsatzplan?: boolean;
}

export function zusatzrechte(
  user: { rechnungenLesen?: boolean } | null | undefined,
  company: { projektleitungImEinsatzplan?: boolean } | null | undefined,
): Zusatzrechte {
  return {
    rechnungenLesen: user?.rechnungenLesen === true,
    projektleitungImEinsatzplan: company?.projektleitungImEinsatzplan === true,
  };
}

function eintragFuer(item: NavItem, role: Role, zusatz?: Zusatzrechte): boolean {
  return item.roles.includes(role)
    || (!!item.zusatz && item.zusatz.rolle === role && !!zusatz?.[item.zusatz.wenn]);
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
  // „Start“ wie in der unteren Leiste — zwei Namen für dieselbe Seite waren
  // einer zu viel (Analyse 03.10.2026, Paket 1).
  { path: '/', label: 'Start', short: 'Start', icon: 'home', roles: ALL, group: 'Start' },

  // JEDE Rolle muss die eigene Zeit buchen können (auch die Buchhaltung:
  // Krankenstand und Urlaub). Legacy setzt den Tab unbedingt, ohne
  // Rollenprüfung (perl-installateur-web-app.html:1954).
  { path: '/time', label: 'Zeiterfassung', short: 'Zeit', icon: 'clock', roles: ALL, group: 'Team' },
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
  { path: '/material', label: 'Material anfordern', short: 'Material', icon: 'package', roles: ['Mitarbeiter', 'Verwaltung', ...LEAD], group: 'Material', modul: 'material' },
  // Nur REINE Mitarbeiter — Admin/GF sehen alle Baustellen über die
  // Verwaltungssicht (Legacy:1979 "nicht Admin, der sieht alle in Projekte").
  { path: '/my-schedule', label: 'Mein Einsatzplan', short: 'Plan', icon: 'calendar', roles: ['Mitarbeiter'], group: 'Aufträge', modul: 'einsatzplanung', zusatz: { rolle: 'Projektleiter', wenn: 'projektleitungImEinsatzplan' } },
  { path: '/my-projects', label: 'Meine Baustellen', short: 'Baustellen', icon: 'building', roles: ['Mitarbeiter'], group: 'Aufträge' },
  // Urlaub sieht JEDE Rolle: auch Buchhaltung und Verwaltung nehmen Urlaub,
  // und beantragen muessen ihn alle. Wer entscheiden darf, sieht in derselben
  // Ansicht zusaetzlich die offenen Antraege.
  { path: '/vacations', label: 'Urlaub', short: 'Urlaub', icon: 'sun', roles: ALL, group: 'Team', modul: 'urlaub', hinweis: 'urlaub' },
  // Der Schein gehoert in den Aussendienst: er entsteht vor Ort beim Kunden,
  // nicht im Buero.
  { path: '/worksheets', label: 'Handwerksscheine', short: 'Scheine', icon: 'pencil', roles: ['Mitarbeiter', 'Buchhaltung', 'Verwaltung', ...LEAD], group: 'Aufträge', modul: 'scheine' },

  // Kunden VOR den Baustellen: der Kunde ist der Ausgangspunkt, die Baustelle
  // hängt an ihm. Auch die Buchhaltung braucht ihn — für die Rechnungsadresse.
  // Angebot vor Baustelle: so laeuft der Auftrag auch in Wirklichkeit.
  { path: '/quotes', label: 'Angebote', short: 'Angebote', icon: 'file', roles: ['Buchhaltung', ...LEAD], group: 'Aufträge', modul: 'angebote' },
  { path: '/customers', label: 'Kunden', short: 'Kunden', icon: 'contact', roles: ['Buchhaltung', 'Verwaltung', ...LEAD], group: 'Aufträge' },
  // Wartungen bei den Kunden, nicht bei den Baustellen: eine Vereinbarung
  // gehört dem Kunden und überlebt jede einzelne Baustelle. Die Verwaltung
  // sieht sie mit, NUR LESEND — anlegen, ändern und „erledigt“ bleiben bei
  // der Leitung (entschieden vom Betrieb am 24.09.2026, Prüflauf L4). Hier
  // stand vorher, sie „vereinbare den Termin“ — ohne einen einzigen Knopf dafür.
  { path: '/wartungen', label: 'Wartungen', short: 'Wartung', icon: 'wrench', roles: ['Verwaltung', ...LEAD], group: 'Aufträge', modul: 'wartung' },
  { path: '/anforderungen', label: 'Anforderungen', short: 'Anford.', icon: 'clipboard', roles: ['Verwaltung', ...LEAD], group: 'Material', modul: 'material', hinweis: 'anforderungen' },
  { path: '/lager', label: 'Lager', short: 'Lager', icon: 'archive', roles: ['Verwaltung', ...LEAD], group: 'Material', modul: 'material' },
  { path: '/admin-projects', label: 'Baustellen', short: 'Baustellen', icon: 'building', roles: LEAD, group: 'Aufträge' },
  { path: '/assignments', label: 'Einsatzplanung', short: 'Planung', icon: 'calendar', roles: LEAD, group: 'Aufträge', modul: 'einsatzplanung' },
  // Wer angelegt wird und welche Rolle er bekommt, ist Eigentümersache und
  // nicht Sache der Bauleitung: mit dieser Ansicht vergibt man Rechte.
  { path: '/user-mgmt', label: 'Benutzerverwaltung', short: 'Benutzer', icon: 'users', roles: TOP, group: 'Team' },
  // Einstellungen: EIN Reiter für alles, was man einmal einstellt und dann
  // lange nicht mehr anfasst — die eigenen Meldungen, die Sätze des Betriebs
  // und die Module. Vorher waren das drei Reiter, zwei davon für Dinge, die
  // man im Monat vielleicht einmal öffnet.
  //
  // Der Reiter steht JEDER Rolle offen, weil die Meldungseinstellungen jedem
  // gehören. Was darunter enger ist, steht in UNTER — Sätze und Module sind
  // Geschäftsführungssache.
  //
  // AM ENDE DER SEITENLEISTE, nicht an zweiter Stelle (Analyse 03.10.2026,
  // Paket 1): man öffnet ihn selten, und oben schob er die tägliche Arbeit
  // nach unten. Eine eigene Gruppe ohne Überschrift, damit er hinter der
  // Buchhaltung steht.
  { path: '/settings', label: 'Einstellungen', short: 'Einstellungen', icon: 'settings', roles: ALL, group: 'Einstellungen' },

  // Margen sind Geschaeftsfuehrungssache — die Projektleitung sieht sie nicht.
  { path: '/costing', label: 'Nachkalkulation', short: 'Kalkulation', icon: 'calculator', roles: TOP, group: 'Geld', modul: 'nachkalkulation' },
  // Rechnungen OHNE Projektleitung — so steht es auch in den Richtlinien, und
  // dort ist es die Wahrheit. Der Eintrag zeigte sie ihr trotzdem an; wer
  // klickte, landete in „Kein Zugriff".
  { path: '/invoices', label: 'Rechnungen', short: 'Rechnungen', icon: 'receipt', roles: ['Buchhaltung', ...TOP], group: 'Geld', modul: 'rechnungen', hinweis: 'mahnungen', zusatz: { rolle: 'Projektleiter', wenn: 'rechnungenLesen' } },
  // Zeitkonten: bewusst OHNE Projektleitung. Ueberstunden, Krankenstaende und
  // Urlaub eines Monteurs gehen sie nichts an — Krankenstaende sind zudem
  // Gesundheitsdaten nach Art. 9 DSGVO.
  { path: '/accounting', label: 'Mitarbeiterübersicht', short: 'Übersicht', icon: 'chart', roles: ['Buchhaltung', ...TOP], group: 'Team', modul: 'zeitkonten' },

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
  /**
   * Nur, wenn der Betrieb diese Einstellung eingeschaltet hat. Ohne sie gibt
   * es die Unterseite nicht — auch nicht per Adresse.
   */
  nurMitSchalter?: 'wochenplanFuerAlle';
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
  /*
    DIE WOCHE ZUERST (Linie „Lot“, Protokoll E2): `/assignments` führt auf
    den Wochenplan, die Planungsseite mit Seitenfenster. „Tag planen“ bleibt
    unter seiner Adresse erreichbar, für den einzelnen Tag mit Kalender.
    Seit Runde 4 ohne Reiterleiste (Umschalter „Woche | Monat | Tag“ auf der
    Seite); die Namen hier bleiben, weil Strg+K die Seiten unter ihnen findet.
  */
  '/assignments': [
    { pfad: 'woche', label: 'Wochenplan' },
    { pfad: 'tag', label: 'Tag planen' },
  ],
  /*
   * MEIN EINSATZPLAN — und, wenn der Betrieb es will, die ganze Woche des
   * Teams. Nur lesen: wer ist wo, wer ist abwesend (ohne Grund). Ohne den
   * Schalter bleibt es EINE Seite und damit ohne Leiste — für den Monteur
   * sieht alles aus wie bisher.
   */
  '/my-schedule': [
    { pfad: 'mein', label: 'Meine Einsätze' },
    { pfad: 'team', label: 'Team-Woche', nurMitSchalter: 'wochenplanFuerAlle' },
  ],
  '/settings': [
    /*
      DIE ÜBERSICHT ZUERST für die, die den Betrieb einrichten (Linie „Lot“,
      Protokoll E9): Suche über alle Unterseiten und der Einrichtungsstand.
      Die Unterseiten und ihre Adressen bleiben; wer nur sein Konto hat,
      landet wie bisher direkt dort (für alle anderen Rollen gilt der
      folgende Satz weiter).
    */
    { pfad: 'uebersicht', label: 'Übersicht', roles: [...TOP, 'Buchhaltung'] },
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
      DIE RECHNUNGSVORGABEN (Testbericht 30.09.2026, H10): Zahlungsziel,
      Skonto, Mahnspesen, Basiszinssatz — ohne die Stunden- und Kostensätze
      daneben. Seit 03.10.2026 (Paket 2) EIN Reiter für Buchhaltung und
      Leitung; vorher pflegte die Leitung dieselben Werte mitten in „Sätze
      und Kosten“.
    */
    { pfad: 'rechnung', label: 'Rechnungsvorgaben', roles: ['Buchhaltung', ...TOP] },
    // Bis zum 24.09.2026 standen beide auf „Sätze und Kosten" — dort sucht
    // niemand Rechnungsvorsätze oder den Urlaubsübertrag (Prüflauf, D10).
    { pfad: 'nummern', label: 'Nummernkreise', roles: TOP },
    { pfad: 'personal', label: 'Personal', roles: TOP },
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
    // KEIN FEHLERPROTOKOLL MEHR HIER (seit 25.09.2026): Abstürze und
    // „Problem melden" gehen an den Senklot-Support, der sie beheben kann —
    // die Geschäftsführung konnte mit Stapeln und Meldungen nichts anfangen.
  ],
};

/** Die Unterseiten eines Reiters, die diese Rolle sehen darf. */
export function unterseitenFuer(
  basis: string,
  role: Role,
  schalter?: Partial<Record<NonNullable<Unterseite['nurMitSchalter']>, boolean>>,
): Unterseite[] {
  return (UNTER[basis] ?? []).filter(
    (s) =>
      (!s.roles || s.roles.includes(role)) &&
      (!s.nurMitSchalter || !!schalter?.[s.nurMitSchalter]),
  );
}

/**
 * Was diese Rolle sehen darf UND was der Betrieb eingeschaltet hat.
 *
 * Beides zusammen, weil beides zusammengehört: die Rolle sagt, wer darf, das
 * Modul sagt, ob der Betrieb es überhaupt benutzt. Ein Eintrag ohne `modul`
 * gehört zum Kern und ist immer dabei.
 */
export function navForRole(
  role: Role,
  module?: Record<string, boolean>,
  zusatz?: Zusatzrechte,
): NavItem[] {
  const an = aktiveModule(module);
  return NAV.filter((item) => eintragFuer(item, role, zusatz) && (!item.modul || an.has(item.modul)));
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
  // Das Büro arbeitet Anforderungen ab und schlägt Kunden nach. „Material
  // anfordern“ stand hier bis zum 24.09.2026 — das ist Monteursarbeit, und die
  // eigentliche Arbeit samt Zähler lag unter „Mehr“ (Prüflauf L1). Anfordern
  // bleibt unter „Mehr“ erreichbar.
  Verwaltung: ['/', '/anforderungen', '/customers', '/time'],
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
  zusatz?: Zusatzrechte,
): { unten: NavItem[]; mehr: NavItem[] } {
  const sichtbar = navForRole(role, module, zusatz);
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
export const NAV_GROUPS = ['Start', 'Aufträge', 'Geld', 'Team', 'Material', 'Einstellungen'] as const;

/*
  DIE GRUPPEN DER LINIE „LOT“ (Protokoll Abschnitt 5): Start; Aufträge; Geld;
  Team; Material; Einstellungen unten. Vorher gliederte die Leiste nach
  Abteilungen (Außendienst, Verwaltung, Buchhaltung) — wer im Büro nach den
  Rechnungen suchte, musste wissen, dass sie „der Buchhaltung“ gehören. Die
  neuen Gruppen sagen, WORUM es geht. Die Einträge je Rolle sind exakt
  dieselben wie vorher, nur anders geordnet.

  Innerhalb einer Gruppe steht das Häufige oben: Baustellen und Planung vor
  Angeboten und Kunden.
*/
const REIHENFOLGE = [
  '/', '/admin-projects', '/assignments', '/my-schedule', '/my-projects', '/worksheets', '/quotes',
  '/customers', '/wartungen', '/invoices', '/costing', '/time', '/vacations', '/accounting',
  '/user-mgmt', '/material', '/anforderungen', '/lager', '/settings',
];
const rang = (p: string) => {
  const i = REIHENFOLGE.indexOf(p);
  return i < 0 ? REIHENFOLGE.length : i;
};

/** Gruppen, die in Seitenleiste und Blatt „Mehr“ ohne Überschrift stehen. */
export const OHNE_UEBERSCHRIFT: ReadonlySet<string> = new Set(['Start', 'Einstellungen']);

/** Sichtbare Navigation, nach Gruppen gebündelt (für übersichtliche Sidebar). */
export function navGroupsForRole(
  role: Role,
  module?: Record<string, boolean>,
  zusatz?: Zusatzrechte,
): { group: string; items: NavItem[] }[] {
  const visible = navForRole(role, module, zusatz);
  return NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((i) => i.group === group).sort((a, b) => rang(a.path) - rang(b.path)),
  })).filter((g) => g.items.length > 0);
}

/**
 * Darf diese Rolle diesen Pfad — und ist sein Modul an?
 *
 * Die Modulprüfung gehört hierher und nicht nur in die Navigation: sonst
 * käme man per URL weiterhin in einen Bereich, den der Betrieb abgeschaltet
 * hat. Unsichtbar ist nicht dasselbe wie zu.
 */
export function canAccess(
  role: Role,
  path: string,
  module?: Record<string, boolean>,
  zusatz?: Zusatzrechte,
): boolean {
  const item = NAV.find((i) => i.path === path);
  if (!item || !eintragFuer(item, role, zusatz)) return false;
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

/**
 * Welcher Bereich hinter einem Pfad steht — der Name aus dem Menü, so wie
 * ihn der Betrieb kennt. Akten und Unterseiten zählen zu ihrer Liste
 * (`/customers/k1` → „Kunden"), der einzelne Schein zu den Scheinen.
 */
export function bereichVon(pfad: string): string {
  if (pfad === '/worksheet' || pfad.startsWith('/worksheet/')) return 'Handwerksscheine';
  const treffer = NAV
    .filter((i) => i.path === pfad || (i.path !== '/' && pfad.startsWith(`${i.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return treffer?.label ?? NAV.find((i) => i.path === '/')!.label;
}
