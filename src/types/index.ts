/**
 * Zentrale Datentypen. Abgeleitet aus dem Legacy-Datenmodell
 * (siehe docs/LEGACY-ANALYSIS.md) und um `companyId` (Mandantenfähigkeit)
 * ergänzt. Jedes Dokument JEDER Collection trägt `companyId`.
 *
 * Hinweise zur Treue gegenüber dem Bestand (Spec §6: "an bestehende Felder
 * anpassen"):
 *  - Es existieren real FÜNF Rollen (nicht drei) — alle bleiben erhalten,
 *    damit bestehende Nutzerdokumente nicht brechen.
 *  - Projekte werden überall per String `projectNumber` verknüpft, nicht per
 *    Dokument-ID. Beibehalten.
 *  - Nutzer sind per `uid` (Firebase-Auth-UID) verknüpft, nicht per Doc-ID.
 *  - `timeEntries` haben start/end/Pause; "hours" wird daraus berechnet.
 *    Sprach-Einträge dürfen zusätzlich `hours` direkt setzen.
 */
import type { Einstufung, FruehereEinstufung, Satzklasse, Stufensaetze } from '@/lib/einstufung';
import type { Materialaufschlag } from '@/lib/aufschlag';


export type Role =
  | 'Mitarbeiter'
  | 'Verwaltung'
  | 'Buchhaltung'
  /**
   * Projektleitung: wie die Geschäftsführung, aber ohne Einblick in die
   * Zeitkonten der Mitarbeiter. Siehe lib/permissions.ts.
   */
  | 'Projektleiter'
  | 'Geschäftsführung'
  | 'Administrator';

export const ROLES: Role[] = [
  'Mitarbeiter',
  'Verwaltung',
  'Buchhaltung',
  'Projektleiter',
  'Geschäftsführung',
  'Administrator',
];

/** Quelle eines Eintrags: manuell erfasst oder per KI-Sprachextraktion. */
export type EntrySource = 'manual' | 'voice';

/** companies/{companyId} — Mandanten-Stammdaten + Branding + Rechnungskopf. */
export interface Company {
  id: string;
  name: string;
  brandColor?: string; // Hex, Primärfarbe
  brandForeground?: string; // Hex, Vordergrund auf Primärfarbe
  accentColor?: string; // Hex, Akzent (z. B. Aktion/Hervorhebung)
  accentForeground?: string; // Hex, Vordergrund auf Akzent
  logoUrl?: string;
  // Rechnungs-Stammdaten (ersetzen die hartkodierten "Perl"-Werte im PDF)
  addressLine?: string; // "Musterstraße 1 · 1010 Wien" — seit 30.09.2026 aus den Teilen (M12)
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  land?: string;
  /** Das Firmenbuchgericht (§ 14 UGB), z. B. „Landesgericht Wiener Neustadt“ (M12). */
  firmenbuchgericht?: string | null;
  contactLine?: string; // "Tel · Mail · Web"
  iban?: string;
  bic?: string;
  bankName?: string;
  vatId?: string; // UID-Nummer, z. B. "ATU12345678"
  companyRegister?: string; // FN
  /*
    `defaultVatRate` STAND HIER UND WURDE NIE GELESEN.

    Drei Einrichtungsskripte schrieben es, kein einziger Aufrufer holte es je
    ab: gerechnet wird ausschliesslich mit `rates.vatRate`, und das ist in den
    Einstellungen gepflegt. Ein zweites Feld für dieselbe Zahl ist die
    klassische Falle — wer es setzt, wundert sich, warum die Rechnung eine
    andere Steuer ausweist.

    Bestehende Betriebe tragen es noch in ihren Stammdaten; es dort zu
    entfernen wäre eine Wanderung durch fremde Daten für nichts.
  */
  /**
   * Die Vorsätze der Nummernkreise und des Fuhrparks.
   *
   * VIER EINSTELLUNGEN STATT VIER FEST VERDRAHTETER ZEICHENFOLGEN. Was hier
   * nicht gesetzt ist, fällt auf `PRAEFIX_VORGABE` zurück — mit einer
   * Ausnahme: das Kennzeichen hat KEINE Vorgabe. `WZ` stand fest im Code und
   * ist der Bezirkskenner eines bestimmten Bezirks; ihn als Vorgabe zu
   * behalten hiesse, ihn jedem neuen Betrieb aufzustempeln.
   *
   * Die Regeln stehen in `lib/praefixe.ts`, die Grenze in der Datenbank
   * (`companies_praefix_*`). Geändert werden darf nur von der Spitze — das
   * setzt die Richtlinie `companies_aendern` durch, nicht das Formular.
   */
  praefixRechnung?: string;
  praefixAngebot?: string;
  praefixBaustelle?: string;
  praefixKennzeichen?: string;

  /** Stundensätze und Zuschläge, gepflegt von der Geschäftsführung. */
  rates?: InvoiceRates;
  /**
   * Was eine Arbeitsstunde den BETRIEB kostet — nicht, was sie dem Kunden
   * verrechnet wird.
   *
   * Die Unterscheidung ist der ganze Punkt der Nachkalkulation. `rates.fach`
   * ist der ERLÖS; die Kosten sind Lohn plus Lohnnebenkosten plus anteilige
   * Gemeinkosten und liegen erfahrungsgemäß deutlich darunter. Wer beide
   * verwechselt, bekommt eine Marge von null und hält sie für ein Ergebnis.
   *
   * Bewusst ein einziger Mischsatz je Qualifikation statt echter Personalkosten
   * je Mitarbeiter: die Gehälter einzelner Monteure gehören nicht in eine
   * Baustellenauswertung, die die Projektleitung ansieht.
   *
   * NUR ZUM SCHREIBEN (seit 29.09.2026, offene Punkte B1): die Datenbank legt
   * das Feld in `betrieb_kostensaetze` um, die nur die Spitze liest, und es
   * kommt mit dem Betrieb immer leer zurück. Gelesen wird über
   * `lib/db/kosten.ts`.
   */
  costRates?: {
    /** Kosten je Facharbeiterstunde. */
    fach: number;
    /** Kosten je Helferstunde. */
    helper: number;
    /** Kosten je Stufe (4.1); leer wie bei den Verrechnungssätzen. */
    stufen?: Stufensaetze;
  };
  /**
   * Wer Urlaubsanträge entscheiden darf — uids, zusätzlich zur Leitung.
   *
   * Die Rolle allein reicht als Antwort nicht: in dem einen Betrieb entscheidet
   * die Buchhaltung, im anderen ein Vorarbeiter, im dritten ausschließlich der
   * Chef. Das ist eine betriebliche Festlegung und keine Eigenschaft der
   * Software.
   *
   * NICHT GESETZT heißt: es bleibt beim Ausgangszustand — Buchhaltung,
   * Geschäftsführung, Administration. Sonst hätte das Einführen dieses Feldes
   * bestehenden Betrieben stillschweigend Rechte entzogen.
   *
   * Geschäftsführung und Administration können IMMER entscheiden und stehen
   * deshalb nicht in dieser Liste. Wären sie abwählbar, könnte eine
   * Fehleingabe den ganzen Betrieb aussperren — und niemand könnte sie
   * zurücknehmen, weil auch das Ändern dieser Liste ihnen vorbehalten ist.
   */
  vacationApprovers?: string[];
  /**
   * Wie nicht verbrauchter Urlaub zum Jahreswechsel behandelt wird.
   *
   * `verjaehrung` (Vorgabe) ist die gesetzliche Lesart: der Rest wird
   * übertragen und verjährt zwei Jahre nach dem Jahr, in dem er entstand
   * (§ 4 Abs 5 UrlG). `stichtag` ist die vereinbarte: übertragen wird
   * ebenfalls, was aus früheren Jahren offen ist, verfällt aber an
   * `urlaubStichtag`.
   *
   * DIE VORGABE IST DAS GESETZ UND NICHT DAS FRÜHERE VERHALTEN. Bis hierher
   * warf die App den Rest am 1. Jänner weg. Das als dritte Wahlmöglichkeit
   * anzubieten hiesse, einen Fehler zur Einstellung zu erklären.
   */
  /**
   * Zeigt beim Anlegen einer Rechnung die Auswahl Anzahlung / Teil / Schluss.
   *
   * AUS IST DIE VORGABE. Die Auswahl steht in der Maske, in der jede Rechnung
   * dieses Betriebs entsteht — auch die vierhundert im Jahr, die schlicht
   * Rechnungen sind. Ein Betrieb, der nie eine Anzahlung stellt, bekäme ein
   * Feld, das er jedes Mal überliest.
   *
   * Bereits ausgestellte Belege bleiben unberührt: sie behalten ihre Art,
   * ihre Abzüge und ihre Gesamtleistung und drucken unverändert, auch wenn
   * der Betrieb die Arten später wieder abdreht.
   */
  rechnungsarten?: boolean;
  /**
   * Alle Mitarbeiter sehen einen reinen Lese-Wochenplan: wer ist wo, und wer
   * ist abwesend — ohne Grund. Ab Werk aus.
   */
  wochenplanFuerAlle?: boolean;
  /**
   * 24. und 31. Dezember als halbe Tage (Kollektivvertrag Metallgewerbe):
   * Soll bis 12 Uhr, beide Urlaubstage zusammen einer, Arbeit danach mit
   * 100 % Zuschlag ausgewiesen. Ab Werk an; siehe `tagesAnteil`.
   */
  dezemberHalbtage?: boolean;
  /**
   * Die Nachtzeit, 'HH:MM' (Testbericht 30.09.2026, M35). Vorgabe 22:00–06:00;
   * nur die Stunden darin tragen den Nachtzuschlag. Siehe `lib/lohnregeln.ts`.
   */
  nachtVon?: string;
  nachtBis?: string;
  /**
   * Überstundenmodell: `zeitkonto` (Vorgabe, Gleitzeit mit Saldo) oder
   * `tagesgrenze` — Stunden über der Grenze eines Tages als Überstunden 50 %,
   * ausgewiesen in Lohn-CSV und Stundennachweis, nie als Geld.
   */
  ueberstundenModell?: 'zeitkonto' | 'tagesgrenze';
  /** Bei `tagesgrenze`: über dem Tagessoll oder über zehn Stunden (Gleitzeit). */
  ueberstundenGrenze?: 'tagessoll' | 'zehn';
  /** Bei `tagesgrenze`: Arbeit an Sonn- und Feiertagen als Überstunden 100 %. */
  ueberstundenHundertSonnFeiertag?: boolean;
  /**
   * Über wie viele Wochen der Schnitt von 48 Std. gilt (§ 9 Abs 4 AZG: 17;
   * ein Kollektivvertrag kann bis 52 zulassen). Ab Werk 17.
   */
  durchrechnungWochen?: number;
  /** Die Projektleitung ist im Einsatzplan einteilbar und sieht „Mein Einsatzplan“ (M38). Ab Werk aus. */
  projektleitungImEinsatzplan?: boolean;
  /**
   * Mitarbeiter dürfen ihren Einsatzplan als Kalender abonnieren. Ab Werk
   * aus: Kundenname und Adresse gehen damit an den Kalenderdienst der Person
   * (Google, Apple, Microsoft). Ausschalten beendet alle Abos.
   */
  kalenderAboErlaubt?: boolean;
  /**
   * Zwei-Faktor-Anmeldung für Administrator und Geschäftsführung Pflicht
   * (Runde 3, H1). Einschalten nur mit eigenem zweiten Faktor.
   */
  zweiFaktorPflicht?: boolean;
  /** Abweichende Tage je Anlass der Dienstverhinderung (Schlüssel → Arbeitstage), leer = Vorbelegung. */
  freistellungAnlaesse?: Record<string, number> | null;
  /** Ab so vielen Kalendertagen unbezahlt am Stück schlägt die App die Kürzung des Anspruchs vor. */
  kuerzungAbTagen?: number;
  /** Vorschlag für den Grund der Steuerbefreiung auf Rechnungen mit 0 % (A2). */
  steuerbefreiungVorgabe?: string;
  urlaubUebertrag?: 'verjaehrung' | 'stichtag';
  /** 'MM-DD'. Nur bei `urlaubUebertrag === 'stichtag'` gesetzt. */
  urlaubStichtag?: string | null;
  /**
   * 'MM-DD' — wann das Urlaubsjahr BEGINNT und der neue Anspruch entsteht.
   *
   * Vorgabe `01-01`, also das Kalenderjahr; das ist der häufigste Fall, weil
   * der Kollektivvertrag das Urlaubsjahr in vielen Branchen darauf umstellt.
   * Bis zum 20.09.2026 war der 1. Jänner fest verdrahtet — für jeden Betrieb
   * mit einem anderen Urlaubsjahr rechnete die App still falsch.
   *
   * NICHT ABGEBILDET: das Arbeitsjahr je Mitarbeiter (Jahrestag des
   * Eintritts). Dort hätte jede Person ihren eigenen Stichtag. Das ist eine
   * benannte Grenze, siehe die Migration.
   */
  urlaubJahresbeginn?: string;
  /**
   * Welche Bereiche der App dieser Betrieb benutzt.
   *
   * Gespeichert werden nur die ABWEICHUNGEN vom Standard; was fehlt, gilt wie
   * in `lib/module.ts` festgelegt. Damit ändert sich für bestehende Betriebe
   * nichts, solange niemand etwas umstellt — und ein später hinzukommendes
   * Modul erscheint automatisch mit seinem Standard, statt bei allen zu
   * fehlen.
   *
   * KEINE SICHERHEITSGRENZE. Ein abgeschaltetes Modul nimmt den Weg weg, nicht
   * das Recht; wer als Buchhaltung Rechnungen anlegen darf, darf das
   * weiterhin. Was serverseitig geschützt ist, ist dieses Feld selbst — sonst
   * schaltete sich jeder frei, was er will.
   */
  modules?: Record<string, boolean>;
  createdAt?: number;
}

/**
 * Verrechnungssätze eines Betriebs. Zuschläge sind ANTEILE des Stundensatzes
 * (0.5 = +50 %), nicht eigene Sätze: eine Preiserhöhung beim Grundsatz wirkt
 * damit automatisch auf alle Zuschläge, wie es Kollektivverträge vorgeben.
 */
export interface InvoiceRates {
  /** Monteur / Facharbeiter, €/h */
  fach: number;
  /**
   * Helfer, €/h. Gilt für Personen mit der Einstufung Helfer und für
   * Buchungen mit dem Haken „als Helfer“ (Ausnahme, geht vor).
   */
  helper: number;
  /** Zuschlag für Nachtarbeit, Anteil (0.5 = +50 %). */
  nightSurcharge: number;
  /** Zuschlag für Notdienst, Anteil (1 = +100 %). */
  emergencySurcharge: number;
  /** Umsatzsteuer, Anteil (0.2 = 20 %). */
  vatRate: number;
  /** Zahlungsziel in Tagen. */
  dueDays: number;
  /**
   * Sätze je Stufe (4.1): Obermonteur und Lehrjahre, €/h. Ohne feste
   * Vorgabe — leer heisst beim Obermonteur Facharbeiter-, beim Lehrling
   * Helfersatz (siehe `verrechnungssatz`).
   */
  stufen?: Stufensaetze;
  /**
   * Materialaufschlag (M31): Standard und je Warengruppe, Prozent auf den
   * Einkaufspreis. Ohne Angabe kein Vorschlag für den Verkaufspreis.
   */
  materialaufschlag?: Materialaufschlag;
  /**
   * Mahnspesen je Stufe, in Euro — [Erinnerung, Mahnung, letzte Mahnung].
   *
   * OHNE VORGABE. Was ein Betrieb verrechnen darf, hängt am Aufwand und am
   * Vertrag; eine voreingestellte Zahl sähe aus wie eine Auskunft darüber.
   * Nicht gesetzt heisst null — dann steht auf der Mahnung keine Spesenzeile.
   */
  mahnspesen?: number[];
  /**
   * Mahnspesen je Stufe an PRIVATKUNDEN (ohne UID). Nicht gesetzt heisst: es
   * gelten `mahnspesen` — so verrechnet ein Betrieb, der seine Spesen vor der
   * Trennung eingetragen hat, unverändert weiter. Siehe `mahnkosten`.
   */
  mahnspesenVerbraucher?: number[];
  /** An Firmenkunden die Pauschale nach § 458 UGB statt der Spesen je Stufe. */
  pauschale458?: boolean;
  /**
   * Basiszinssatz der OeNB in % (darf negativ sein) — nur für Verzugszinsen
   * zwischen Unternehmern (§ 456 UGB). Gilt nur zusammen mit
   * `basiszinssatzAb`, dem Beginn seines Halbjahres; siehe `verzugszinsen`.
   */
  basiszinssatz?: number;
  basiszinssatzAb?: string;
  /**
   * Der Verlauf der Basiszinssätze, je Halbjahr einer (Testbericht
   * 30.09.2026, G30) — für ältere, noch offene Forderungen. Ersetzt beim
   * nächsten Speichern den einzelnen Satz darüber.
   */
  basiszinssaetze?: { ab: string; satz: number }[];
  /**
   * Skonto, das neue Rechnungen zusagen: Prozent und Frist in Tagen ab
   * Rechnungsdatum. Beides leer heisst kein Skonto — die Vorgabe ab Werk.
   */
  skontoProzent?: number;
  skontoTage?: number;
}

/** users/{docId} — Auth-Verknüpfung über `uid`, nicht Doc-ID. */
export interface AppUser {
  id: string; // Kennung der Zeile (in der Altanwendung als docId gelesen)
  companyId: string;
  uid: string; // Firebase Auth UID
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  weeklyTargetHours?: number; // default 40
  yearlyVacationDays?: number; // default 25
  initialOvertime?: number; // Startsaldo Überstunden (kann negativ sein)
  /**
   * Resturlaub am `appStartDate` — was die Person mitbringt.
   *
   * `undefined`/`null` heisst NICHT ANGEGEBEN, nicht „null Tage": dann gilt
   * der volle Jahresanspruch, also genau das Verhalten von vorher. Kann
   * negativ sein, wer im Vorgriff mehr genommen hat, als ihm zusteht.
   */
  initialVacationDays?: number | null;
  appStartDate?: string | null; // 'YYYY-MM-DD' ab dem Soll/Ist gilt
  workDays?: number[]; // 0=So..6=Sa, default [1,2,3,4,5]
  /**
   * Der Tag, an dem die Person im Betrieb angefangen hat (Testbericht
   * 30.09.2026, M6) — getrennt vom Saldo-Startdatum, ab dem das Zeitkonto in
   * der App rechnet. Bei einem Neueintritt sind beide gleich. Vor ihm lässt
   * sich nicht buchen (M7).
   */
  eintritt?: string | null;
  /**
   * Optional: Stunden je Wochentag, Schlüssel wie `workDays` ("0" = Sonntag
   * … "6" = Samstag), etwa ein kurzer Freitag (M5). Ohne Angabe gilt
   * Wochenstunden durch Arbeitstage — siehe `tagessollStunden`.
   */
  tagessoll?: Record<string, number> | null;
  /**
   * Einstufung (Testbericht 30.09.2026, 4.1): bestimmt den Satz der Stunden,
   * nicht die Rechte. Ohne Angabe zählt die Person wie ein Facharbeiter.
   */
  einstufung?: Einstufung | null;
  /** Nur beim Lehrling: Lehrbeginn und Lehrzeit in Monaten — daraus das Lehrjahr. */
  lehrbeginn?: string | null;
  lehrzeitMonate?: number | null;
  /** Frühere Stufen, jede bis zum Tag ihrer Umstufung — schreibt nur die Datenbank (Runde 3, M13). */
  einstufungVerlauf?: FruehereEinstufung[] | null;
  /** Nur beim Lehrling: zählen seine Stunden ins Projekt-Budget? Ab Werk ja (03.10.2026). */
  stundenInsBudget?: boolean;
  /** Freigabe „Kunden pflegen“ — wirkt für Verwaltung und Buchhaltung (siehe `darfKundenPflegen`). */
  kundenPflegen?: boolean;
  /** Freigaben seit 30.09.2026 (M37, M38) — wirken nur in der passenden Rolle. */
  katalogEinspielen?: boolean;
  einkaufSehen?: boolean;
  rechnungenLesen?: boolean;
  /** Nur Geschäftsführung: führt ein Zeitkonto (siehe `fuehrtZeitkonto`). */
  fuehrtZeitkonto?: boolean;
  createdAt?: number;
}

/** Im Client gehaltenes Profil des angemeldeten Nutzers. */
export interface CurrentUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  docId: string;
  /** Aus der eigenen Zeile in `users`; die Grenze zieht die Datenbank. */
  kundenPflegen?: boolean;
  /** Freigaben seit 30.09.2026 (M37, M38) — wirken nur in der passenden Rolle. */
  katalogEinspielen?: boolean;
  einkaufSehen?: boolean;
  rechnungenLesen?: boolean;
  fuehrtZeitkonto?: boolean;
  /** Eintritt und Saldo-Start — die Buchungsmaske warnt davor (M7). */
  eintritt?: string | null;
  appStartDate?: string | null;
  /** Die eigene Einstufung — die Maske bietet „Berufsschule“ nur Lehrlingen an (4.1). */
  einstufung?: Einstufung | null;
}

/**
 * userPrefs/{uid} — persönliche Einstellungen, vom Nutzer SELBST gepflegt.
 *
 * Bewusst nicht in `users`: dort darf nur die Geschäftsführung schreiben
 * (Rolle, Wochensoll, Urlaubsanspruch sind nichts, was der Mitarbeiter selbst
 * ändern soll). Seine Benachrichtigungen und die Geräte, auf denen er sie
 * empfängt, gehören dagegen ihm.
 */
export interface UserPrefs {
  id: string; // = uid
  companyId: string;
  userId: string;
  /** Benachrichtigung, wenn eine neue Materialanforderung eingeht (Verwaltung/GF). */
  notifyNewOrder?: boolean;
  /** Benachrichtigung, wenn die eigene Anforderung abholbereit ist (Monteur). */
  notifyOrderReady?: boolean;
  /**
   * Benachrichtigung bei Eilzustellungen der eigenen Baustellen
   * (Projektleitung). Eigener Schalter, weil das eine andere Dringlichkeit
   * ist als die Sammelmeldung über neue Anforderungen: wer die abschaltet,
   * will damit nicht auch den Eilfall verpassen.
   */
  notifyUrgentDelivery?: boolean;
  /**
   * Abwesenheiten: neuer Urlaubs-/ZA-Antrag (wer entscheidet), die
   * Entscheidung darüber (der Antragsteller), Krankmeldungen (das Büro).
   */
  notifyAbwesenheit?: boolean;
  /**
   * Push-Token je Gerät. Ein Mensch hat Telefon und Rechner, beide sollen
   * die Meldung bekommen; ein abgemeldetes Gerät wird wieder entfernt.
   */
  pushTokens?: string[];
  updatedAt?: number;
}

/** projects/{id} — verknüpft über `projectNumber`. */
/**
 * Ein Kunde — wer beauftragt und wer bezahlt.
 *
 * Bis hierher gab es ihn nicht: der Kunde war ein Textfeld an der Baustelle
 * und wurde bei jedem Auftrag neu getippt. Die Folgen sind strukturell, nicht
 * kosmetisch — keine Kundenhistorie („was haben wir dort zuletzt gemacht?"),
 * ein Tippfehler spaltet denselben Kunden in zwei, kein Wartungsvertrag, kein
 * Mahnwesen auf Kundenebene. Für ein Gewerk, das von wiederkehrender
 * Kundschaft lebt, ist das die teuerste Lücke.
 *
 * ABGRENZUNG ZUR BAUSTELLE, und die ist wichtig: Hier steht die
 * RECHNUNGSadresse und der HAUPT-Ansprechpartner. Die Baustelle behält ihre
 * eigene Adresse und ihren eigenen Ansprechpartner vor Ort — eine
 * Hausverwaltung kann zwanzig Baustellen haben, und der Monteur fährt nicht
 * zur Rechnungsadresse. Das ist keine Dopplung, sondern zweierlei.
 */
/**
 * Ein Handwerksschein (Regie- oder Arbeitsschein).
 *
 * Der Beleg, den der Kunde auf der Baustelle unterschreibt. Regiestunden sind
 * die am häufigsten bestrittene Rechnungsposition; ohne unterschriebenen
 * Schein lässt sich eine Mehrstunde im Zweifel nicht durchsetzen.
 *
 * DIE ZENTRALE ENTSCHEIDUNG: Der Schein KOPIERT die Zeiten und das Material,
 * er referenziert sie nicht. Die Buchhaltung kann einen Zeiteintrag
 * nachträglich korrigieren — bei einer Referenz änderte sich damit
 * rückwirkend, was der Kunde unterschrieben hat. Das ist das genaue Gegenteil
 * der sonst geltenden Regel, hier aber zwingend: mit der Unterschrift wird
 * der Inhalt festgeschrieben.
 */
/**
 * Ein Angebot.
 *
 * Schließt die Kette nach vorne: Anfrage → Angebot → Auftrag → Baustelle.
 * Ohne diesen Schritt beginnt alles bei der Baustelle, und die kalkulierten
 * Stunden werden ein zweites Mal von Hand eingetippt — die Budget-Ampel misst
 * dann gegen eine Zahl ohne Herkunft.
 *
 * Positionen und Summen haben bewusst dieselbe Form wie bei der Rechnung
 * (`InvoicePosition`, `calcTotals`): ein Angebot ist rechnerisch dasselbe,
 * nur nach vorne gerichtet. Zwei getrennte Rechenwege hätten früher oder
 * später zwei verschiedene Summen für dieselben Positionen ergeben.
 */
export interface Quote {
  id: string;
  companyId: string;
  /** 'AN-YYYY-NNNN' */
  quoteNumber: string;
  customerId?: string;
  customerName: string;
  /** Wo gearbeitet werden soll — noch keine Baustelle, die gibt es erst mit dem Auftrag. */
  address?: string;
  quoteDate: string;
  /** Bindefrist. Ein Angebot ohne Ablauf bindet den Betrieb unbegrenzt an seine Preise. */
  validUntil: string;
  status: 'Entwurf' | 'Versendet' | 'Angenommen' | 'Abgelehnt';
  positions: {
    label: string;
    qty: number;
    unit: string;
    unitPrice: number;
    netto: number;
    /**
     * Zählt diese Position ins Stundenbudget? Fehlt bei Angeboten von vor dem
     * 24.09.2026 — dann ist es unbekannt, nicht „nein".
     */
    istArbeitszeit?: boolean;
    /** Titel und Text tragen keinen Preis (M18); ohne Angabe eine Position. */
    art?: 'position' | 'titel' | 'text';
    /** Nachlass auf diese Position in Prozent; das Netto ist schon nach Abzug. */
    rabattProzent?: number | null;
    /** Aus dem Katalog übernommen — der Artikel, nur zum Nachsehen. */
    materialId?: string | null;
  }[];
  discount?: InvoiceDiscount | null;
  discountAmount?: number;
  subtotalNetto: number;
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  vatRate: number;
  /**
   * Die kalkulierten Facharbeiterstunden.
   *
   * Getrennt von den Positionen gehalten, weil genau diese Zahl beim
   * Zuschlag als Stundenbudget in die Baustelle wandert — und damit zur
   * Messlatte der Budget-Ampel wird. Aus den Positionen ließe sie sich zwar
   * ableiten, aber nur solange niemand eine Position mit der Einheit „h"
   * einfügt, die keine Arbeitszeit ist (Anfahrtspauschale etwa).
   */
  kalkulierteStunden: number;
  notes?: string;
  /** Bei Annahme: die Baustelle, die daraus entstanden ist. */
  projectNumber?: string;
  /**
   * Dieselbe Baustelle als Kennung — die Datenbank löst sie beim Schreiben
   * aus `projectNumber` auf. Nur lesen: sie überlebt ein späteres Umbenennen
   * der Baustellennummer, die Nummer am Angebot nicht.
   */
  projectId?: string;
  /**
   * Die Fassung, die dieses Angebot überarbeitet (Testbericht 30.09.2026,
   * M17). Ein versendetes Angebot ändert sich nicht; überarbeitet wird es als
   * neuer Entwurf mit eigener Nummer, der hierher verweist.
   */
  vorgaengerId?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Ein Plan, Foto oder Dokument an einer Baustelle.
 *
 * Das Büro lädt hoch, der Monteur sieht die Pläne der Baustellen, auf die er
 * gehört — Team, Leitung oder ein Einsatz dort. Die Datei liegt im Speicher
 * (`baustellendokumente`), die Zeile sagt, wo.
 */
export interface BaustellenDokument {
  id: string;
  companyId: string;
  /** Die Baustelle als Kennung — übersteht ein Umbenennen der Nummer. */
  projectId: string;
  /** `baustellen/{betrieb}/{baustelle}/{kennung}.{endung}` */
  pfad: string;
  /** Der Name, unter dem die Datei hochgeladen wurde. */
  dateiname: string;
  mime: string;
  bytes: number;
  hochgeladenVon?: string;
  hochgeladenVonName?: string;
  createdAt?: number;
}

export interface WorkSheet {
  id: string;
  companyId: string;
  projectNumber: string;
  customerId?: string;
  customerName: string;
  /** Baustellenadresse, zum Zeitpunkt der Unterschrift. */
  address?: string;
  /** Leistungsdatum (der Tag, über den der Schein geht). */
  datum: string;
  /**
   * „Verworfen" ist der aufgegebene ENTWURF, nicht der widerrufene Beleg.
   *
   * Der Storno zieht einen unterschriebenen Schein aus dem Verkehr und
   * braucht dafür einen Grund — der Kunde hat etwas in der Hand. Ein Entwurf
   * hat das Haus nie verlassen: der Auftrag ist geplatzt, oder er wurde
   * versehentlich angelegt. Er wird deshalb gekennzeichnet, nicht gelöscht,
   * und lässt sich als einziger Zustand wieder aufnehmen.
   */
  status: 'Entwurf' | 'Unterschrieben' | 'Storniert' | 'Verworfen';
  abrechnung: Abrechnungsart;
  /** Die kopierten Positionen — nach der Unterschrift unveränderlich. */
  zeiten: WorkSheetZeit[];
  material: WorkSheetMaterial[];
  notizen?: string;
  erstelltVonUid: string;
  erstelltVonName: string;
  unterschriften?: {
    monteur?: WorkSheetUnterschrift;
    kunde?: WorkSheetUnterschrift;
  };
  /**
   * SHA-256 über den eingefrorenen Inhalt, serverseitig gerechnet.
   *
   * Der eigentliche Manipulationsschutz. Ein qualifizierter Zeitstempel nach
   * eIDAS käme von einem Vertrauensdiensteanbieter und kostet; für einen
   * Rapportzettel ist er nicht nötig. Der Hash dagegen beweist, dass ein
   * vorgelegtes PDF genau das ist, was unterschrieben wurde.
   */
  inhaltHash?: string;
  /**
   * Fotos vom Einsatz — FREIWILLIG, nie Voraussetzung.
   *
   * WARUM OPTIONAL UND NICHT PFLICHT. Ein Datei-Upload scheitert bei
   * schwachem Empfang viel eher als der Schreibvorgang des Scheins (der
   * übrigens NICHT über das Ausgangsfach läuft — ganz ohne Netz geht auch das
   * Unterschreiben nicht). Wäre auch nur ein Foto Bedingung, hinge der
   * ganze Beleg an einem Balken Empfang — und der Monteur stünde mit einem
   * Kunden vor sich da, der unterschreiben will.
   *
   * Was die App dafür tut: sie sagt VOR dem Unterschreiben, wenn ein Bild
   * noch nicht oben ist, statt es still fallen zu lassen.
   */
  fotos?: WorkSheetFoto[];
  /** Zeitpunkt des Einfrierens, vom SERVER. */
  unterschriebenAm?: number;
  stornoGrund?: string;
  storniertVonName?: string;
  /** Wer den Entwurf aufgegeben hat — ohne Grund: er war nie beim Kunden. */
  verworfenVonName?: string;
  createdAt?: number;
}

export interface WorkSheetZeit {
  datum: string;
  mitarbeiter: string;
  von?: string;
  bis?: string;
  pauseMin?: number;
  /** Gerechnete Arbeitszeit in Minuten — als Zahl kopiert, nicht neu gerechnet. */
  minuten: number;
  taetigkeit?: string;
  helfer?: boolean;
}

export interface WorkSheetMaterial {
  name: string;
  menge: number;
  einheit?: string;
}

/**
 * Ein Foto am Schein.
 *
 * DIE BILDDATEI LIEGT IM DATEISPEICHER, nicht in der Tabelle — ein Handyfoto
 * wiegt Megabyte, und die gehören nicht in eine Zeile, die bei jeder Abfrage
 * mitkommt. Hier steht nur, wo es liegt und was drinsteht.
 *
 * `hash` IST DER GRUND, WARUM DAS FUNKTIONIERT. Die Prüfsumme des Scheins
 * kann die Bilddatei nicht mitrechnen, sie sieht nur die Zeilen. Ohne einen
 * Inhalts-Hash liesse sich die Datei im Speicher nach der Unterschrift
 * austauschen, ohne dass irgendetwas auffiele — der Beleg wäre dann genau
 * dort löchrig, wo er beweisen soll. Der Hash steht im Dokument, geht in die
 * Prüfsumme ein und ist damit vom Einfrieren mitgeschützt.
 */
export interface WorkSheetFoto {
  /** Pfad in Firebase Storage. */
  pfad: string;
  /** SHA-256 der hochgeladenen Bytes, hexadezimal. */
  hash: string;
  /** Grösse der komprimierten Datei in Byte — für die Anzeige. */
  bytes: number;
  /** Wann am Gerät aufgenommen bzw. gewählt. */
  geraetZeit: number;
}

/**
 * Eine Unterschrift samt Umständen.
 *
 * BEWUSST OHNE biometrische Merkmale. Schreibgeschwindigkeit und Druckverlauf
 * wären auf kapazitiven Touchscreens ohne Stift ohnehin überwiegend Fiktion —
 * `PointerEvent.pressure` liefert dort konstant 1.0 — und rechtlich ein
 * biometrisches Datum nach Art. 9 DSGVO mit Einwilligungspflicht. Der
 * Streitfall ist praktisch nie eine gefälschte Unterschrift, sondern eine
 * bestrittene Stundenzahl; dagegen hilft der eingefrorene Inhalt.
 */
export interface WorkSheetUnterschrift {
  /** Name in Druckbuchstaben — ein Strich ohne zuordenbaren Namen ist wenig wert. */
  name: string;
  /**
   * Das Unterschriftsbild als PNG-Data-URL (~10 KB).
   *
   * FEHLT IN LISTEN (seit 10.10.2026): sie zeigen nur, wer unterschrieben
   * hat. Wer das Bild braucht — das PDF —, holt den ganzen Schein
   * (`getWorkSheet`); `buildWorkSheetPdf` druckt ohne Bild nicht.
   */
  bild?: string;
  /**
   * Zeit des GERÄTS bei der Unterschrift.
   *
   * Zusätzlich zur Serverzeit, und das ist kein Zierrat: Der Monteur steht im
   * Keller ohne Empfang. Eine offline erfasste Unterschrift synchronisiert
   * später, und die Serverzeit wäre dann die Zeit der Übertragung, nicht die
   * der Unterschrift. Wer nur eine der beiden speichert, hat im Streitfall
   * einen Zeitstempel, der die falsche Frage beantwortet.
   */
  geraetZeit: number;
}

export interface Customer {
  id: string;
  companyId: string;
  /** Firmenname oder „Familie Huber". */
  name: string;
  /**
   * Rechnungsadresse — NICHT die Baustellenadresse. Seit 30.09.2026 (M12)
   * setzt die Datenbank sie aus Straße, PLZ, Ort und Land zusammen.
   */
  address?: string;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  /** ISO-Code, Vorgabe „AT“. */
  land?: string;
  /** Die alte Zeile liess sich nicht eindeutig zerlegen — bitte prüfen (M12). */
  adressePruefen?: boolean;
  /** Kunden- bzw. Debitorennummer (M12, für den Export an die Kanzlei). */
  kundennummer?: string | null;
  contactName?: string;
  contactPhone?: string;
  /** Für den späteren Versand von Handwerksscheinen und Rechnungen. */
  email?: string;
  /** UID-Nummer für Rechnungen an Unternehmen. */
  vatId?: string;
  /**
   * Privatperson oder Unternehmen (Testbericht 30.09.2026, M10) — für
   * Verzugszinsen und Mahnpauschale. Ohne Angabe gilt: wer eine UID hat.
   */
  kundenart?: 'privat' | 'unternehmen' | null;
  notes?: string;
  active?: boolean;
  createdAt?: number;
}



/**
 * Wie eine Baustelle abgerechnet wird (Testbericht 30.09.2026, M16):
 * nach Aufwand (Regie), zum vereinbarten Festpreis (Pauschal) oder zu den
 * Einheitspreisen des Angebots mit den Mengen nach Aufmaß.
 */
export type Abrechnungsart = 'Regie' | 'Pauschal' | 'Einheitspreis';
export interface Project {
  id: string;
  companyId: string;
  projectNumber: string; // Geschäftsschlüssel, z. B. "2024-001"
  /**
   * Verknüpfter Kunde. Optional, weil Baustellen aus der Zeit vor den
   * Kundenstammdaten keinen haben — sie tragen den Namen weiterhin nur als
   * Text und lassen sich in der Kundenverwaltung nachträglich zuordnen.
   */
  customerId?: string;
  /**
   * Kundenname als Kopie.
   *
   * Bewusst redundant: die Baustellenlisten zeigen den Namen und sollen dafür
   * nicht zusätzlich die Kundensammlung laden müssen. Wird ein Kunde
   * umbenannt, ziehen die verknüpften Baustellen im selben Schreibvorgang
   * nach — sonst liefen Anzeige und Stammdaten auseinander.
   */
  customerName: string;
  address?: string;
  description?: string;
  status: 'Aktiv' | 'Pausiert' | 'Abgeschlossen';
  /**
   * Wie diese Baustelle abgerechnet wird.
   *
   * Steht an der Baustelle und nicht am einzelnen Zeiteintrag: entschieden
   * wird das beim Auftrag, nicht täglich neu. Für den Monteur heißt das
   * NULL zusätzliche Tipparbeit — und ein vergessener Haken kann nicht
   * passieren, weil es keinen gibt.
   *
   * Der Handwerksschein braucht die Angabe: auf einer Regiebaustelle sind die
   * bestätigten Stunden die Rechnungsgrundlage, auf einer Pauschalbaustelle
   * belegt derselbe Schein nur, DASS gearbeitet wurde.
   */
  billingMode?: Abrechnungsart;
  /**
   * Freiwilliger Name der Baustelle („Bad 2. OG“) — steht im Titel vor dem
   * Kunden (Testbericht 30.09.2026, G4). Ohne ihn ist der Titel der Kunde.
   */
  bezeichnung?: string;
  estimatedHours?: number;
  startDate?: string;
  endDate?: string;
  contactName?: string;
  contactPhone?: string;
  assignedEmployees?: string[]; // Array von uids
  /**
   * Verantwortliche Projektleitung — eine oder mehrere. Sie bekommt die
   * Meldungen zu Eilzustellungen dieser Baustelle, weil sie das Material auf
   * dem Weg mitnehmen kann. Ohne Zuordnung gibt es für eine Eilbestellung
   * niemanden zu benachrichtigen; die Oberfläche sagt das dann auch.
   */
  projectManagers?: string[]; // Array von uids
  createdAt?: number;
}

/**
 * materials/{id} — Katalog.
 *
 * Er trägt inzwischen ZWEI Preise, und die Unterscheidung ist der ganze
 * Punkt: der Verkaufspreis geht auf die Rechnung, der Einkaufspreis in die
 * Nachkalkulation. Sein ursprünglicher Zweck bleibt daneben bestehen — dass
 * ein Monteur auf der Baustelle benennen kann, was ihm die Projektleitung
 * bringen soll; die Anforderung selbst trägt weiterhin keinen Preis.
 */
export interface Material {
  id: string;
  companyId: string;
  name: string;
  category?: string;
  stock: number;
  articleNumber?: string;
  unit?: string;
  /**
   * Verkaufspreis netto je Einheit, in Euro.
   *
   * OHNE IHN GEHT MATERIAL NICHT AUF DIE RECHNUNG. Genau das war die Lücke:
   * die Stunden liefen automatisch durch, das Material tippte das Büro von
   * Hand nach — bei einem Installateur schnell die Hälfte der Summe.
   *
   * Der EINKAUFSpreis steht getrennt darunter, mit eigener Schreibgrenze:
   * er ist Margendaten und gehört der Geschäftsführung, während diesen Preis
   * hier die Verwaltung pflegt.
   */
  verkaufspreis?: number;
  /**
   * Einkaufspreis netto je Einheit, in Euro — was der BETRIEB zahlt.
   *
   * Die andere Hälfte der Rechnung. Der Verkaufspreis darüber bestimmt den
   * Erlös, dieser die Kosten; wer beide verwechselt, bekommt in der
   * Nachkalkulation für jedes Material einen Deckungsbeitrag von null und
   * hält ihn für ein Ergebnis — dieselbe Falle wie beim Stundensatz.
   *
   * ÄNDERN DARF IHN NUR DIE GESCHÄFTSFÜHRUNG, nicht die Verwaltung, die den
   * Katalog sonst pflegt: er ist Margendaten. Die Grenze steht in
   * `app.materialfelder_geschuetzt` und läuft zwischen den FELDERN, nicht
   * zwischen den Rollen. Seit dem 29.09.2026 gilt das auch fürs LESEN
   * (offene Punkte B1): die Datenbank legt das Feld in
   * `material_einkaufspreise` um, die nur die Spitze liest; mit dem Artikel
   * kommt es immer leer zurück. Gelesen wird über `lib/db/kosten.ts`.
   *
   * NICHT GESETZT heisst „nicht hinterlegt", nicht „kostet nichts". Die
   * Nachkalkulation nennt solche Artikel beim Namen, statt sie mit null
   * anzusetzen.
   */
  einkaufspreis?: number;
  /**
   * Der Grosshändler führt den Artikel nicht mehr.
   *
   * GELÖSCHT WIRD ER TROTZDEM NICHT. Ein Löschsatz im DATANORM-Katalog sagt
   * nur, dass es ihn dort nicht mehr gibt — nicht, dass er nie auf einem
   * Handwerksschein oder einer Rechnung stand. Verschwände er, fehlte er
   * rückwirkend in jeder Auswertung. Er bleibt also im Katalog, wird dort
   * gekennzeichnet und für NEUE Erfassungen nicht mehr angeboten.
   */
  ausgelaufen?: boolean;
  /**
   * Führt der Betrieb den Artikel im Lager (Testbericht 30.09.2026, M30)?
   * Ein Katalogartikel ist es nicht von selbst — nach einem DATANORM-Import
   * stünden sonst zehntausende Artikel im Bestand. Wer Bestand hat, wird von
   * der Datenbank geführt; abschalten geht nur bei Bestand null.
   */
  lagerartikel?: boolean;
  /** Mindestmenge (M30): darunter gilt der Artikel als knapp. Leer: höchstens 5 frei. */
  mindestmenge?: number | null;
  /** Warengruppe aus DATANORM (M31) — bestimmt einen abweichenden Aufschlag. */
  warengruppe?: string | null;
}

/**
 * materialOrders/{id} — Anforderung oder Retoure.
 *
 * Eine „Bestellung" ist hier eine interne Anforderung des Monteurs an die
 * Projektleitung, keine Bestellung beim Lieferanten und kein Rechnungsposten.
 */
/**
 * Material, das das Büro selbst auf die Einkaufsliste setzt — etwa um das
 * Lager aufzufüllen. Keine Anforderung: niemand wartet darauf, und „geliefert"
 * heisst, es liegt im Lager.
 */
export interface EinkaufPosten {
  id: string;
  companyId: string;
  supplierId?: string | null;
  /** Katalogartikel; ohne ihn steht nur der Name da. */
  materialId?: string | null;
  materialName: string;
  menge: number;
  einheit?: string | null;
  notiz?: string | null;
  angelegtVonUid?: string | null;
  angelegtVonName?: string | null;
  bestelltAm?: number | null;
  geliefertAm?: number | null;
  /** Erwarteter Liefertermin ('YYYY-MM-DD') — nur an bestellten Posten. */
  liefertermin?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Eine Bewegung im Lager (Testbericht 30.09.2026, M28): jede Änderung des
 * Bestands, mit Art, Menge (Vorzeichen), Bestand danach und Beleg.
 */
export interface Lagerbewegung {
  id: string;
  companyId: string;
  materialId: string;
  /** `einladen_zurueck`: „eingeladen“ in der Rüstliste am selben Tag zurückgenommen (Runde 3, G15). */
  art: 'anfangsbestand' | 'eingang' | 'entnahme' | 'retoure' | 'inventur' | 'zugang' | 'abgang' | 'einladen_zurueck';
  menge: number;
  bestandNachher: number;
  grund?: string | null;
  lieferant?: string | null;
  lieferschein?: string | null;
  bezug?: string | null;
  materialOrderId?: string | null;
  erfasstVon?: string | null;
  erfasstVonName?: string | null;
  createdAt?: number;
}

/**
 * Eine Umstellung der Anmeldung zwischen E-Mail und Benutzername
 * (02.10.2026) — wer, wann, wohin, warum. Ohne Adressen.
 */
export interface KontoUmstellung {
  id: string;
  userId: string;
  nach: 'mail' | 'benutzername';
  grund?: string | null;
  durch: string;
  durchName?: string | null;
  am: number;
}

/**
 * Eine Abfrage der Kunden-UID bei VIES — der Nachweis, wie VIES geantwortet
 * hat. Name und Anschrift stehen so da, wie VIES sie liefert; manche Staaten
 * geben sie nicht heraus. Die Abfrage-ID gibt es nur, wenn die eigene UID in
 * den Firmendaten steht und VIES sie anerkennt (`eigeneUid`).
 */
export interface UidPruefung {
  id: string;
  customerId: string;
  uid: string;
  gueltig: boolean;
  name?: string | null;
  adresse?: string | null;
  abfrageId?: string | null;
  eigeneUid?: string | null;
  /** Warum VIES keine Abfrage-ID vergeben hat (seit Runde 3, G21). */
  ohneIdGrund?: string | null;
  /** Zeitpunkt laut VIES. */
  abgefragtAm: number;
  durch: string;
  durchName?: string | null;
  am: number;
}

/** Das Kalender-Abo einer Person — der Link selbst steht nirgends. */
/** Das eigene Abo oder der ganze Einsatzplan (Plan 10.4, PR B) — zwei getrennte Links. */
export type KalenderAboArt = 'eigen' | 'gesamt';

export interface KalenderAbo {
  angelegtAm: number;
  zuletztAbgerufen?: number | null;
}

/**
 * Ein Eintrag im Fehlerprotokoll — ein Absturz, ein unbehandelter Fehler oder
 * ein von Hand gemeldetes Problem. Ohne Inhaltsdaten; nur `beschreibung` ist
 * frei getippt.
 */
export interface FehlerEintrag {
  id: string;
  companyId: string;
  userId?: string | null;
  art: 'absturz' | 'fehler' | 'meldung';
  nachricht?: string | null;
  stapel?: string | null;
  pfad?: string | null;
  fassung?: string | null;
  geraet?: string | null;
  beschreibung?: string | null;
  createdAt?: number;
}

export interface MaterialOrder {
  id: string;
  companyId: string;
  /**
   * Der Katalogartikel — `null` bei einer frei getippten Anforderung („nicht
   * im Katalog"). Lager und Einkaufsliste suchen dann über den Namen
   * (`app.katalogeintrag`) und ziehen nichts ab, was sie nicht finden.
   */
  materialId: string | null;
  materialName: string;
  quantity: number;
  note?: string;
  projectNumber?: string;
  status: 'Offen' | 'In Bearbeitung' | 'Abholbereit' | 'Erledigt';
  /**
   * Eilzustellung: die Projektleitung der Baustelle wird sofort verständigt
   * und noch einmal, sobald das Material abholbereit ist — sie fährt ohnehin
   * hin und kann es mitnehmen. Setzt eine gewählte Baustelle voraus, denn
   * ohne sie gibt es keine zuständige Projektleitung.
   */
  isUrgent?: boolean;
  transactionType: 'order' | 'return';
  condition?: string; // nur Retoure
  userId: string; // uid
  userName?: string;
  processed?: boolean; // Lagerabzug-Guard
  isBilled?: boolean;
  invoiceNumber?: string;
  source?: EntrySource;
  /**
   * Woher das Material kommt: `lager` aus dem Regal, `einkauf` über die
   * Einkaufsliste beim Grosshändler. Fehlt, solange niemand nachgesehen hat.
   */
  beschaffung?: 'lager' | 'einkauf' | null;
  /** Bei welchem Grosshändler eingekauft wird. */
  supplierId?: string | null;
  /** Wann die Einkaufsliste mit dieser Zeile hinausging. */
  bestelltAm?: number | null;
  /** Wann die Ware eingetroffen ist — ab da liegt sie im Lager. */
  geliefertAm?: number | null;
  /** Erwarteter Liefertermin ('YYYY-MM-DD') — nur an bestellten Zeilen, vom Lager gesetzt. */
  liefertermin?: string | null;
  /** Seit wann abholbereit — setzt nur die Datenbank. */
  abholbereitSeit?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Eine Position der Ruestliste — ein Artikel, den der Monteur mitnehmen soll.
 */
export interface RuestPosition {
  /**
   * Stabil ueber Umsortieren und Umbenennen hinweg.
   *
   * An dieser Kennung haengt der Haken „eingeladen". Waere sie die
   * Listenposition, ruecke der Haken mit, sobald der Planer eine Zeile
   * einfuegt — und der Monteur laedt die falsche Kiste ein.
   */
  id: string;
  /** Katalogartikel, wenn es einer ist. Freie Zeilen tragen keinen. */
  materialId?: string;
  name: string;
  menge: number;
  einheit?: string;
}

/**
 * einsatzMaterial/{companyId}_{date}_{projectNumber} — die Ruestliste.
 *
 * WAS SIE IST UND WAS NICHT. Sie sagt „nimm das mit", nicht „das muss
 * besorgt werden". Das Zweite gibt es schon als Materialanforderung
 * (`MaterialOrder`), und die beiden zu vermischen waere teuer: die
 * Verwaltung bekaeme eine Arbeitsliste voller Dinge, die im Regal stehen,
 * und der Lagerstand wuerde zweimal abgezogen — einmal beim Erledigen der
 * Anforderung, einmal wenn der Monteur das Material tatsaechlich mitnimmt.
 * Eine Ruestliste bewegt den Bestand deshalb NICHT.
 *
 * WARUM EIN EIGENES DOKUMENT UND NICHT EIN FELD AM EINSATZ. `assignments`
 * traegt EINE ZEILE JE MITARBEITER. Material am Einsatz hiesse: vier
 * Monteure, vier Kopien derselben Liste — und ein Haken, von dem niemand
 * sagen kann, fuer wen er gilt. Material gehoert zum Paar aus TAG und
 * BAUSTELLE, nicht zur Person. Die Kiste steht einmal im Bus.
 *
 * DIE KENNUNG IST BERECHENBAR, damit die Startseite je Einsatz genau ein
 * Dokument liest, ohne Abfrage. Sie ist aber KEINE Sicherheitsgrenze: die
 * liegt wie ueberall am Feld `companyId`.
 */
export interface EinsatzMaterial {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  projectNumber: string;
  /**
   * Wer an diesem Tag auf dieser Baustelle eingeteilt ist.
   *
   * Steht hier doppelt (die Wahrheit steht in `assignments`), und zwar aus
   * einem Grund: nur so kann die Sicherheitsregel „darf dieser Monteur
   * abhaken?" ohne einen Nachschlag beantworten. Die Kennungen der Einsaetze
   * sind zufaellig, eine Regel kaeme mit `get()` gar nicht an sie heran.
   * Gepflegt wird das Feld beim Speichern der Einteilung UND beim Speichern
   * der Liste.
   */
  uids: string[];
  positionen: RuestPosition[];
  /**
   * Was schon im Bus ist: Positions-Kennung -> wer und wann.
   *
   * EIGENES FELD, NICHT EIN HAKEN IN DER POSITION. Nur so laesst sich in
   * den Regeln die Grenze ziehen: der Monteur darf `geladen` schreiben und
   * sonst nichts. Laege der Haken innerhalb von `positionen`, koennte keine
   * Regel „Haken gesetzt" von „ganze Liste ueberschrieben" unterscheiden.
   *
   * Die Zeit kommt vom Geraet, nicht vom Server. Sie ist eine Anzeige
   * („eingeladen von Max, 06:12"), keine Grundlage fuer eine Entscheidung —
   * und ein Serverzeitstempel ist in einer verschachtelten Karte nicht zu
   * haben, ohne die Regel aufzuweichen.
   */
  geladen?: Record<string, {
    von: string;
    am: number;
    /** Vom Lager abgebucht beim Einladen (Nachtest 01.10.2026) — Menge und Artikel. */
    gebucht?: number;
    material?: string;
  }>;
  updatedAt?: number;
  updatedBy?: string;
}

/** timeEntries/{id} — Zeiterfassung. */
export interface TimeEntry {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  /**
   * `Zeitausgleich`: zählt null Stunden Ist; das Soll bleibt. Damit sinkt
   * das Zeitguthaben um genau die Zeit, die jemand frei nimmt. Ohne Von/Bis
   * gilt er für den ganzen Tag, mit Von/Bis für diese Stunden.
   */
  status: TagesStatus;
  startTime?: string; // 'HH:MM'
  endTime?: string; // 'HH:MM'
  breakDuration?: number; // Minuten
  travelTime?: number; // Minuten (Wegzeit)
  /** Direkt gesetzte Stunden (v. a. Sprach-Einträge). Greift nur, wenn keine
   * Zeitspanne (start+end) gesetzt ist — siehe calcWorkMin. */
  hours?: number;
  /**
   * Nachtarbeit. SEIT 06.10.2026 (Runde 3, M4) setzt die Datenbank das
   * Kennzeichen aus Von und Bis und der Nachtzeit des Betriebs; nur ohne
   * Von/Bis gilt noch der Haken. Gezählt wird mit `nachtArbeitMin`.
   */
  isNightWork?: boolean;
  /**
   * Bewusst NICHT als Nachtarbeit gezählt — mit diesem Grund (Runde 3, M4).
   * Leer heisst: die Stunden in der Nachtzeit zählen von selbst.
   */
  nachtAbgewaehlt?: string | null;
  /** Notdienst / Störungseinsatz außerhalb der regulären Zeit. */
  isEmergency?: boolean;
  customerName?: string;
  projectNumber?: string;
  helperName?: string;
  vehiclePlate?: string;
  comment?: string;
  isHelper?: boolean;
  /**
   * Der Satz aus der Einstufung der Person am Tag der Buchung — gesetzt von
   * der Datenbank, nie von der Maske (4.1). Leer bei Buchungen von vor der
   * Einstufung: sie zählen wie bisher. Siehe `satzklasse`.
   */
  satz?: Satzklasse | null;
  /**
   * Nur beim Lehrling: zählt diese Buchung ins Projekt-Budget? Den Stand vom
   * Tag setzt die Datenbank (Entscheidung 03.10.2026). Leer heisst: zählt.
   */
  insBudget?: boolean | null;
  userId: string; // uid
  userName?: string;
  source?: EntrySource;
  isBilled?: boolean;
  invoiceNumber?: string;
  createdAt?: number;
  lastEditedBy?: string;
  lastEditedByUid?: string;
  /**
   * Wer die Buchung angelegt hat — gesetzt von der Datenbank, nie von der
   * Maske (Runde 3, M2). Daran hängt, ob eine Buchung „vom Büro gebucht“ ist.
   * Leer bei älteren Buchungen, deren Anleger nicht eindeutig war.
   */
  angelegtVon?: string | null;
  /**
   * Nur beim Berufsschultag: die Unterrichtszeit in Minuten (Runde 3, M1).
   * Sie zählt in der Prüfung der Arbeitszeitgrenzen statt des Tagessolls;
   * leer heisst Tagessoll. Das Zeitkonto rechnet weiter mit dem Tagessoll.
   */
  unterrichtMin?: number | null;
  /**
   * Aus welchem genehmigten Urlaubsantrag dieser Eintrag entstanden ist.
   *
   * Nur bei `status === 'Urlaub'` gesetzt und nur bei Einträgen, die die
   * Genehmigung automatisch angelegt hat. Wird ein Urlaub nachträglich
   * storniert, sind daran genau die Tage zu finden, die wieder verschwinden
   * müssen — ohne dass ein von Hand gebuchter Urlaubstag mit gelöscht wird.
   */
  vacationId?: string;
  /** Aus welcher Krankmeldung dieser Eintrag entstanden ist — wie `vacationId`. */
  krankmeldungId?: string;
  /** Aus welchem bestätigten Sonderurlaub dieser Eintrag entstanden ist — wie `vacationId`. */
  freistellungId?: string;
}

/**
 * `Berufsschule` (4.1): erfüllt das Tagessoll wie ein Urlaubstag, ist nicht
 * verrechenbar und nur bei Lehrlingen möglich; eingetragen über
 * `berufsschule_speichern`, auch als Zeitraum (Blocklehrgang).
 */
export type TagesStatus =
  | 'Anwesend' | 'Krank' | 'Urlaub' | 'Zeitausgleich' | 'Berufsschule'
  /** Sonderurlaub, Pflegefreistellung, unbezahlter Urlaub (Plan 10.3) — nur über `freistellungen`. */
  | 'Dienstverhinderung' | 'Pflegefreistellung' | 'Unbezahlt';

/**
 * vacations/{id} — ein Urlaubsantrag.
 *
 * WARUM EIGENE SAMMLUNG UND NICHT NUR EIN TAGESSTATUS. „Urlaub" gab es schon
 * als Status eines Zeiteintrags, und damit konnte sich jeder seinen Urlaub
 * selbst eintragen — genehmigt war er deshalb nicht. Es fehlte das, worum es
 * beim Urlaub eigentlich geht: ein Antrag, eine Entscheidung darüber, und für
 * beide Seiten die Gewissheit, woran man ist.
 *
 * Der Zeiteintrag bleibt trotzdem die Grundlage der Stundenrechnung. Er wird
 * bei der Genehmigung erzeugt — siehe `vacationId` oben. Damit rechnen Saldo,
 * Monatsbilanz und Auswertung unverändert weiter, und ein genehmigter
 * Urlaubstag taucht nicht als „Zeit fehlt" auf der Startseite auf.
 */
export interface Vacation {
  id: string;
  companyId: string;
  userId: string; // uid des Antragstellers
  /** Name als Kopie — die Genehmigungsliste soll nicht alle Nutzer laden. */
  userName: string;
  von: string; // 'YYYY-MM-DD'
  bis: string; // 'YYYY-MM-DD', einschließlich
  /**
   * Arbeitstage im Zeitraum, zum Zeitpunkt des Antrags gerechnet.
   *
   * Als Kopie festgehalten, nicht bei jeder Anzeige neu ermittelt: ändert
   * jemand später die Arbeitstage eines Mitarbeiters, soll ein bereits
   * genehmigter Urlaub nicht rückwirkend anders lang werden.
   */
  tage: number;
  status: 'Beantragt' | 'Genehmigt' | 'Abgelehnt' | 'Storniert';
  /** Anmerkung des Antragstellers. */
  notiz?: string;
  entschiedenVonUid?: string;
  entschiedenVonName?: string;
  entschiedenAm?: number;
  /**
   * Begründung bei Ablehnung oder Storno.
   *
   * Pflicht in der Oberfläche: eine Ablehnung ohne Grund ist für den, der sie
   * bekommt, nicht von Willkür zu unterscheiden.
   */
  grund?: string;
  createdAt?: number;
  /**
   * Urlaub oder Zeitausgleich. Fehlt das Feld (ältere Anträge), ist es Urlaub.
   *
   * Nur Urlaub zählt gegen den Urlaubsanspruch; Zeitausgleich geht vom
   * Zeitguthaben ab.
   */
  art?: 'Urlaub' | 'Zeitausgleich';
  /** Stundenweiser Zeitausgleich an einem Tag: 'HH:MM'. */
  zaVon?: string | null;
  zaBis?: string | null;
  /** Wie viele Stunden der Zeitausgleich kostet. */
  zaStunden?: number | null;
  /** Das Zeitguthaben in Stunden, wie es der Antragsteller beim Antrag sah. */
  saldoBeiAntrag?: number | null;
  /** Gesetzt, wenn der Urlaub aus einem Betriebsurlaub stammt. */
  betriebsurlaubId?: string | null;
}

/**
 * krankmeldungen/{id} — ohne Genehmigung, mit den Krank-Tagen im Zeitkonto.
 *
 * Lesen dürfen nur die Person selbst und das Büro (Art. 9 DSGVO). Eine
 * Diagnose gehört nicht hinein.
 */
export interface Krankmeldung {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  von: string;
  bis: string;
  notiz?: string | null;
  gemeldetVonUid?: string | null;
  gemeldetVonName?: string | null;
  createdAt?: number;
}

/**
 * urlaubsanspruch_anpassungen/{id} — mehr oder weniger Urlaub in EINEM
 * Urlaubsjahr, mit Grund (Elternkarenz, Präsenzdienst, unbezahlter Urlaub).
 * Entfernt wird mit Grund; die Zeile bleibt.
 */
export interface UrlaubsanspruchAnpassung {
  id: string;
  companyId: string;
  userId: string;
  /** Benannt nach dem Kalenderjahr, in dem das Urlaubsjahr beginnt. */
  urlaubsjahr: number;
  /** Negativ = weniger Anspruch. */
  tage: number;
  grund: string;
  angelegtVonName?: string | null;
  entferntAm?: number | null;
  entferntVonName?: string | null;
  entferntGrund?: string | null;
  createdAt?: number;
}

/**
 * freistellungen/{id} — Sonderurlaub (Dienstverhinderung), Pflegefreistellung
 * oder unbezahlter Urlaub (Plan 10.3). Lesen: die Person und das Büro.
 */
export interface Freistellung {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  art: 'dienstverhinderung' | 'pflegefreistellung' | 'unbezahlt';
  anlass?: string | null;
  ereignisDatum?: string | null;
  von: string;
  bis: string;
  zeitVon?: string | null;
  zeitBis?: string | null;
  kindUnter12?: boolean;
  zusatzwoche?: boolean;
  notiz?: string | null;
  status: 'Beantragt' | 'Bestätigt' | 'Abgelehnt' | 'Storniert';
  /** Nur bis zur Entscheidung. */
  nachweisPfad?: string | null;
  nachweisGeprueftVonName?: string | null;
  nachweisGeprueftAm?: number | null;
  teilungFreigegeben?: boolean;
  /** Gutgeschriebene Minuten — gesetzt beim Bestätigen. */
  minuten?: number | null;
  /**
   * Sonderurlaub über dem Kontingent des Anlasses (Runde 3, G17): die
   * Tage darüber als Urlaub gebucht oder mit Grund als Sonderurlaub bestätigt.
   */
  ueberKontingent?: 'urlaub' | 'sonderurlaub' | null;
  ueberTage?: number | null;
  ueberGrund?: string | null;
  /** Der Urlaubsantrag, der die Tage darüber trägt. */
  ueberUrlaubId?: string | null;
  entschiedenVonName?: string | null;
  entschiedenAm?: number | null;
  grund?: string | null;
  createdAt?: number;
}

/** betriebsurlaube/{id} — der Betrieb hat zu. */
export interface Betriebsurlaub {
  id: string;
  companyId: string;
  von: string;
  bis: string;
  bezeichnung: string;
  /** Wurde der Zeitraum allen aktiven Mitarbeitern als Urlaub gebucht? */
  urlaubAbbuchen: boolean;
  /** Wer in diesem Zeitraum arbeitet: kein Urlaub gebucht, in der Planung verfügbar. */
  ausgenommen?: string[];
  angelegtVonName?: string | null;
  createdAt?: number;
}

/** assignments/{id} — Einsatzplanung: ein Dokument pro (Datum × Projekt × Mitarbeiter). */
export interface Assignment {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  projectNumber: string;
  userId: string; // uid
  userName?: string;
  asHelper?: boolean;
  comment?: string;
  /**
   * Optional die Uhrzeit des Einsatzes, 'HH:MM' (Testbericht 30.09.2026,
   * M34). Ohne Angabe gilt der ganze Tag.
   */
  zeitVon?: string | null;
  zeitBis?: string | null;
  createdBy?: string;
  createdAt?: number;
}

/** Die Arten eines Termins (Plan 10.4) — „Lieferung" ist das Aviso des Großhändlers. */
export const TERMIN_ARTEN = [
  'Kundentermin',
  'Besichtigung',
  'Baustellenbesprechung',
  'Abnahme',
  'Lieferung',
  'Behörde',
  'Sonstiges',
] as const;
export type TerminArt = (typeof TERMIN_ARTEN)[number];

/**
 * termine/{id} — ein Termin, der kein Einsatz ist (Plan 10.4). Er bucht
 * nichts. Er hängt an einer Baustelle ODER an einem Kunden (Besichtigung vor
 * der Baustelle).
 */
export interface Termin {
  id: string;
  companyId: string;
  art: TerminArt;
  datum: string; // 'YYYY-MM-DD'
  /** 'HH:MM'; beim Aviso das Zeitfenster. Ohne Angabe: irgendwann am Tag. */
  zeitVon?: string | null;
  zeitBis?: string | null;
  projectNumber?: string | null;
  customerId?: string | null;
  teilnehmer: string[];
  /** Name und Adresse von Baustelle bzw. Kunde — gesetzt von der Datenbank. */
  ortName?: string | null;
  ortAdresse?: string | null;
  notiz?: string | null;
  angelegtVonUid?: string | null;
  angelegtVonName?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

/** invoices/{id} */
/**
 * Was eine Rechnung IST — und nicht bloss, wie sie heisst.
 *
 * `einzel` ist die ganze Leistung auf einem Beleg: der Normalfall beim
 * Notdiensteinsatz. Die anderen drei gehören zu einer Baustelle, die über
 * Monate läuft:
 *
 *   anzahlung  vor der Leistung, auf die künftige Leistung
 *   teil       nach einem abgeschlossenen Bauabschnitt
 *   schluss    zum Schluss — und sie MUSS die vorher verrechneten
 *              Teilentgelte samt Steuer abziehen (§ 11 Abs 12 UStG)
 *
 * WARUM DAS EIN FELD IST UND KEIN TEXT IM BETREFF: an der Art hängt, ob die
 * Schlussrechnung abziehen muss und ob die Nachkalkulation den Erlös doppelt
 * zählt. Beides lässt sich einer Überschrift nicht ansehen.
 */
export type RechnungsArt = 'einzel' | 'anzahlung' | 'teil' | 'schluss';

/**
 * Eine abgezogene Vorrechnung, wie sie auf der Schlussrechnung steht.
 *
 * KOPIE, KEIN VERWEIS — aus demselben Grund wie die Positionen: der Abzug
 * muss auch dann noch so auf dem Beleg stehen, wie der Kunde ihn bekommen
 * hat, wenn die abgezogene Rechnung später storniert wird.
 *
 * `netto`, `vat` und `brutto` sind die Beträge der ABGEZOGENEN Rechnung,
 * positiv aufgeschrieben. Abgezogen werden sie beim Rechnen; ein negatives
 * Vorzeichen zusätzlich im Feld wäre eine Verneinung zu viel.
 */
export interface Vorrechnung {
  /** Kennung der abgezogenen Rechnung — daran hängt die Prüfung auf Doppelabzug. */
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  netto: number;
  vat: number;
  brutto: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string; // 'RE-YYYY-NNNN'
  projectNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  /**
   * Was DIESE Rechnung fordert — nicht, was die Baustelle insgesamt kostet.
   *
   * Bei einer Schlussrechnung ist das der Rest nach Abzug der Teilentgelte.
   * Daran hängen die offenen Posten, der Mahnlauf und der Zahlungsstand, und
   * die dürfen nicht die volle Leistung ansetzen, von der drei Viertel längst
   * verrechnet und bezahlt sind. Die volle Leistung steht in `gesamt*`.
   */
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  /** Fehlt bei Altbestand — der ist durchwegs `einzel`, so wie die Vorgabe. */
  art?: RechnungsArt;
  /**
   * Die abgezogenen Vorrechnungen. Nur bei einer Schluss- oder Teilrechnung
   * belegt; sonst gar nicht da.
   */
  vorrechnungen?: Vorrechnung[];
  /**
   * Die GESAMTE Leistung der Baustelle, vor Abzug der Vorrechnungen.
   *
   * Steht nur auf einer Rechnung, die abzieht — sonst wäre sie dasselbe wie
   * `total*` und damit eine zweite Wahrheit über dieselbe Zahl.
   */
  gesamtNetto?: number;
  gesamtVat?: number;
  gesamtBrutto?: number;
  /**
   * Positionen zum Zeitpunkt der Rechnungslegung. Eine Rechnung ist ein
   * Dokument, kein Blick auf die aktuellen Daten: würde man sie später aus
   * den Zeiteinträgen neu berechnen, änderte sich eine bereits verschickte
   * Rechnung, sobald jemand einen Eintrag korrigiert.
   */
  positions?: {
    label: string; qty: number; unit: string; unitPrice: number; netto: number;
    /** Titel und Text tragen keinen Preis (M18); ohne Angabe eine Position. */
    art?: 'position' | 'titel' | 'text';
    /** Nachlass auf diese Position in Prozent; das Netto ist schon nach Abzug. */
    rabattProzent?: number | null;
    /** Der Katalogartikel aus dem Angebot (Runde 3, M12) — für den Einkaufspreis. */
    materialId?: string | null;
  }[];
  /** Summe der Positionen VOR Rabatt. Ohne sie liesse sich der Rabatt im
   *  Nachhinein nicht mehr nachvollziehen. */
  subtotalNetto?: number;
  /**
   * Gewaehrter Rabatt, wie er auf der Rechnung steht. `null` heisst
   * ausdruecklich „kein Rabatt": ein Feld, das gar nicht da ist, liesse sich
   * von „ohne Rabatt ausgestellt" nicht unterscheiden.
   */
  discount?: InvoiceDiscount | null;
  /** Der daraus errechnete Abzug in Euro — festgehalten, nicht neu gerechnet. */
  discountAmount?: number;
  /** Angewandter USt-Satz (0.2 = 20 %). Bei Reverse Charge 0. */
  vatRate?: number;
  /**
   * BAULEISTUNG MIT ÜBERGANG DER STEUERSCHULD — § 19 Abs 1a UStG.
   *
   * Der Normalfall ist: der Betrieb weist 20 % aus, kassiert sie und führt
   * sie ab. Erbringt er eine BAULEISTUNG an einen anderen Bauunternehmer —
   * also als Subunternehmer —, kehrt sich das um: die Rechnung geht netto
   * hinaus, und der Empfänger schuldet die Steuer selbst.
   *
   * WARUM DAS EIN EIGENES FELD IST und nicht einfach `vatRate: 0`. Beides
   * ergibt dieselbe Summe und bedeutet etwas völlig anderes. „0 %" ist ein
   * Steuersatz; Reverse Charge ist ein Übergang der Steuerschuld, der auf dem
   * Beleg ausdrücklich benannt werden MUSS (§ 11 Abs 1a UStG) und im Journal
   * getrennt auszuweisen ist. Wer die beiden Fälle über eine Null
   * zusammenlegt, kann sie im Nachhinein nicht mehr unterscheiden.
   *
   * WAS SCHIEFGEHT, WENN ES FEHLT: der Betrieb schreibt 20 % auf eine
   * Rechnung an einen Baumeister. Der zahlt sie nicht und verlangt eine
   * Berichtigung — die ausgewiesene Steuer schuldet der Betrieb bis dahin
   * trotzdem (§ 11 Abs 12 UStG).
   */
  reverseCharge?: boolean;
  /**
   * Der Grund der Steuerbefreiung, wie er auf der Rechnung steht — Pflicht bei
   * 0 % ohne Reverse Charge (§ 11 Abs 1 Z 3 lit e UStG, offene Punkte A2).
   * Festgehalten wie die Anschrift: der Nachdruck ergibt denselben Beleg.
   */
  steuerbefreiung?: string;
  /**
   * Die UID des Leistungsempfängers, festgehalten zum Zeitpunkt der Rechnung.
   *
   * Bei Reverse Charge Pflicht: ohne sie ist der Übergang der Steuerschuld
   * nicht belegt. Kopiert und nicht verknüpft — aus demselben Grund wie die
   * Anschrift: ein Beleg ist ein Dokument, kein Blick auf die aktuellen
   * Stammdaten.
   */
  customerVatId?: string;
  /**
   * Die Anschrift des EMPFÄNGERS, wie sie auf dem Beleg steht — festgehalten,
   * nicht verknüpft.
   *
   * Seit dem Prüflauf 25.09.2026 (P2-02) die Anschrift aus dem Kundenstamm;
   * vorher stand hier die der Baustelle, und Altbestand trägt sie weiter. Ein
   * Nachdruck liest sie von hier und ergibt damit denselben Beleg.
   */
  address?: string;
  /**
   * Der Ort der Leistung — die Anschrift der Baustelle, wo sie von der des
   * Empfängers abweicht. Steht als eigene Zeile auf dem Beleg. Altbestand hat
   * ihn nicht.
   */
  leistungsort?: string;
  /**
   * Die Bestellnummer des Kunden (seit 05.10.2026). Steht als eigene Zeile
   * auf dem Beleg; Firmen und Hausverwaltungen ordnen die Rechnung darüber
   * zu. Leer: keine angegeben.
   */
  bestellnummer?: string | null;
  /**
   * Haft- oder Deckungsrücklass (seit 05.10.2026). Mindert den Zahlbetrag,
   * nicht das Entgelt; der Mahnlauf übergeht ihn bis `ruecklassBis`. Den
   * Betrag (brutto) rechnet die Datenbank beim Anlegen.
   */
  ruecklassArt?: 'haft' | 'deckung' | null;
  ruecklassProzent?: number | null;
  ruecklassBetrag?: number | null;
  ruecklassBis?: string | null;
  /**
   * Abgelöst durch Bankgarantie (seit 10.10.2026): der Tag der Ablöse — ab
   * dann ist der Rücklass fällig, früher als vereinbart —, Bank, Nummer und
   * Ablauf der Garantie. Nicht eingefroren: kommt nach der Ausstellung dazu.
   */
  ruecklassGarantieAm?: string | null;
  ruecklassGarantieBank?: string | null;
  ruecklassGarantieNr?: string | null;
  ruecklassGarantieBis?: string | null;
  /**
   * Leistungszeitraum — der Tag oder Zeitraum, über den die Leistung erbracht
   * wurde.
   *
   * PFLICHTANGABE nach § 11 Abs 1 Z 4 UStG. Sie fehlte auf jeder bisher
   * geschriebenen Rechnung: dort standen Rechnungsdatum, Zahlungsziel und
   * Baustellennummer, und die Positionen hiessen schlicht
   * „Facharbeiterstunden". Ohne den Zeitraum ist die Rechnung formal
   * unvollständig, und beim Kunden wackelt der Vorsteuerabzug.
   *
   * Vorbelegt aus den verrechneten Belegen, aber ÄNDERBAR: eine Rechnung
   * kann sich bewusst auf einen anderen Zeitraum beziehen als den, den die
   * Buchungen zufällig aufspannen — etwa bei einer Teilrechnung oder wenn
   * eine Nacharbeit später gebucht wurde.
   *
   * Sind beide gleich, steht auf dem Beleg „Leistungsdatum", sonst
   * „Leistungszeitraum".
   */
  leistungVon?: string;
  leistungBis?: string;
  /**
   * WO DIE RECHNUNG STEHT — abgeleitet, nicht gesetzt.
   *
   * Bis zum 19.09.2026 war das ein Haken: jemand stellte „Bezahlt" ein, und
   * damit galt die Rechnung als erledigt. Seit es Zahlungseingänge gibt,
   * rechnet die Datenbank diesen Wert aus ihnen (`app.zahlstand_setzen`), und
   * ein Schreibversuch von Hand wird abgewiesen.
   *
   * Die einzigen beiden Ausnahmen sind kein Widerspruch: „Überfällig" hängt
   * am Datum und nicht am Geld, und „Storniert" ist eine Entscheidung des
   * Betriebs. Beide darf die Ansicht weiterhin setzen.
   */
  paymentStatus:
    | 'Offen'
    | 'Überfällig'
    | 'Teilbezahlt'
    | 'Bezahlt'
    | 'Überzahlt'
    | 'Storniert';
  /**
   * Summe aller Zahlungseingänge zu dieser Rechnung.
   *
   * Bewusst redundant zu `zahlungseingaenge` — und zwar aus demselben Grund
   * wie `faelligAm` an der Wartung: die Liste zeigt dreihundert Rechnungen
   * mit ihrem Restbetrag, und ohne diese Zahl wäre das je Zeile eine eigene
   * Abfrage. Geschrieben wird sie NUR von der Datenbank.
   */
  bezahltBetrag?: number;
  linkedEntries?: string[];
  linkedOrders?: string[];
  /**
   * Handwerksscheine, deren Material in dieser Rechnung steckt.
   *
   * WARUM HIER UND NICHT AM SCHEIN. Zeiteinträge tragen ein `isBilled`; beim
   * Schein geht das nicht — er ist nach der Unterschrift eingefroren, und die
   * Rules lassen nur noch den Storno zu. Das ist richtig so: ein Beleg, den
   * der Kunde unterschrieben hat, darf sich nicht mehr ändern.
   *
   * Also merkt sich die RECHNUNG, welche Scheine sie verbraucht hat. Der
   * Storno gibt sie damit von selbst wieder frei — anders als ein Feld am
   * Schein, das jemand zurücksetzen müsste.
   */
  linkedWorkSheets?: string[];
  cancellationNote?: string | null;
  cancelledAt?: number | null;
  /**
   * DIE STORNORECHNUNG (offene Punkte B7): ihre Nummer aus dem Rechnungskreis
   * und wann sie ausgestellt wurde. Leer, solange keine ausgestellt ist — bis
   * dahin lässt sich ein Storno am selben Tag noch aufheben, danach nicht
   * mehr. Vergeben nur von `stornorechnung_ausstellen`.
   */
  stornoNummer?: string | null;
  stornoAm?: number | null;
  /** Zugesagtes Skonto in % und bis wann (eingefroren mit der Rechnung). */
  skontoProzent?: number | null;
  skontoBis?: string | null;
  /** Summe der Skonto-Einträge — abgeleitet wie `bezahltBetrag`, darin enthalten. */
  skontoBetrag?: number;
  /**
   * MAHNWESEN — wie oft und wann gemahnt wurde.
   *
   * Vorher gab es nur den Status „Überfällig". Er wurde beim Öffnen der Liste
   * gesetzt und angezeigt; das Mahnen selbst führte der Betrieb im Kopf. Ab
   * der dritten Stufe geht es hier nicht weiter — was dann folgt, entscheidet
   * ein Mensch mit einem Anwalt oder einem Inkassobüro.
   *
   * `mahnfrist` ist die NEUE Frist aus der letzten Mahnung, nicht das
   * ursprüngliche Zahlungsziel. Beide werden gebraucht: das eine sagt, wie
   * lange der Verzug dauert, das andere, wann die nächste Stufe ansteht.
   */
  mahnstufe?: number;
  gemahntAm?: string;
  mahnfrist?: string;
  /** Die auf der letzten Mahnung ausgewiesenen Spesen, in Euro. */
  mahnspesen?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Rabatt auf eine Rechnung.
 *
 * Entweder ein Anteil ('percent', 5 = 5 %) oder ein fester Betrag in Euro.
 * Beides zusammen gibt es bewusst nicht: zwei Rabatte auf derselben Rechnung
 * sind fuer den Kunden nicht nachvollziehbar, und die Reihenfolge ihrer
 * Anwendung waere Auslegungssache.
 */
/**
 * Ein Zahlungseingang zu einer Rechnung.
 *
 * WARUM EINE EIGENE SAMMLUNG UND KEIN FELD AN DER RECHNUNG. Teilzahlungen
 * sind im Handwerk der Normalfall — Anzahlung, Abschlag, Rest. Ein Betrag am
 * Beleg könnte immer nur den letzten festhalten; die Frage „wann kam wie
 * viel" wäre danach nicht mehr zu beantworten, und genau an ihr hängen
 * Skonto, Verzugszinsen und eine ehrliche Liste offener Posten.
 */
export interface Zahlungseingang {
  id: string;
  companyId: string;
  /** Die Rechnung, auf die gezahlt wurde. */
  invoiceId: string;
  /** Wertstellung laut Kontoauszug, nicht der Tag der Erfassung. */
  datum: string;
  /**
   * Der Betrag in Euro. NEGATIV ist erlaubt und meint eine Rückzahlung —
   * derselbe Vorgang mit umgekehrtem Vorzeichen. Ohne ihn bliebe eine
   * überzahlte Rechnung für immer überzahlt.
   */
  betrag: number;
  art: 'Überweisung' | 'Bar' | 'Karte' | 'Sonstiges' | 'Skonto';
  /** Freitext: „Skonto gezogen", „Teilzahlung laut Vereinbarung". */
  hinweis?: string;
  /** Wer ihn erfasst hat — eine Zahl ohne Herkunft lässt sich nicht klären. */
  erfasstVon?: string;
  erfasstVonName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface InvoiceDiscount {
  mode: 'percent' | 'amount';
  value: number;
  /** Was auf der Rechnung steht, z. B. „Stammkundenrabatt". */
  label?: string;
}

/**
 * wartungen/{id} — eine wiederkehrende Wartung, die der Betrieb schuldet.
 *
 * NICHT DASSELBE WIE EIN TERMIN. Ein Termin steht im Einsatzplan und ist
 * vorbei, wenn er vorbei ist. Diese Vereinbarung überlebt ihre Ausführung:
 * beim Eintragen der erledigten Wartung rückt der nächste Termin nach. Genau
 * darin liegt der Wert — der Betrieb muss sich nichts merken.
 */
export interface Wartung {
  id: string;
  companyId: string;
  /** Der Kunde, dem die Anlage gehört. Ohne ihn gäbe es niemanden anzurufen. */
  customerId: string;
  /**
   * Kundenname als Kopie — dieselbe Überlegung wie bei den Baustellen: die
   * Liste zeigt den Namen und soll dafür nicht die Kundensammlung laden.
   */
  customerName: string;
  /** Was gewartet wird, in Worten: „Therme Vaillant ecoTEC, Keller". */
  anlage: string;
  /**
   * Wo die Anlage steht.
   *
   * AUSDRÜCKLICH NICHT die Rechnungsadresse des Kunden. Eine Hausverwaltung
   * hat eine Adresse und zwanzig Heizungen an zwanzig anderen. Leer heisst:
   * es gilt die Kundenadresse.
   */
  address?: string;
  /** Abstand zwischen zwei Wartungen, in ganzen Monaten. */
  intervallMonate: number;
  /** Wann zuletzt gewartet wurde. Fehlt bei einer neu übernommenen Anlage. */
  zuletztAm?: string;
  /**
   * Der nächste Termin — abgeleitet, aber gespeichert.
   *
   * Bewusst redundant zu `zuletztAm` + `intervallMonate`: nur ein
   * gespeichertes Feld lässt sich abfragen. Berechnet würde die Frage „was ist
   * fällig?" jedes Dokument des Betriebs in den Browser laden. Geschrieben
   * wird es an genau einer Stelle (`wartungErledigt`), gerechnet an genau
   * einer (`naechsterTermin`).
   */
  faelligAm: string;
  /**
   * Ruht die Vereinbarung?
   *
   * Gekündigte Verträge werden nicht gelöscht: die Historie „bis 2027
   * gewartet" ist der Grund, warum man den Kunden zwei Jahre später wieder
   * anruft.
   */
  aktiv: boolean;
  /** Freitext — Gerätenummer, Schlüsselübergabe, wer aufsperrt. */
  hinweis?: string;
  /** Baustelle, auf der zuletzt gewartet wurde — für den Weg in die Historie. */
  letzteBaustelle?: string;
  /** Anlagendaten (Testbericht 30.09.2026, M39) — vorher, wenn überhaupt, im Freitext. */
  hersteller?: string | null;
  typ?: string | null;
  seriennummer?: string | null;
  baujahr?: number | null;
  /** Vereinbarter Preis je Wartung, netto in Euro (M39). */
  preis?: number | null;
  /**
   * Die Baustelle, die für die ANSTEHENDE Wartung schon angelegt ist.
   *
   * DAS IST DER UNTERSCHIED ZWISCHEN „ZU TUN" UND „SCHON EINGEPLANT", und
   * ohne ihn war die Liste der fälligen Wartungen nicht abarbeitbar: wer sie
   * am Montag durchgeht und drei Baustellen anlegt, sieht am Dienstag
   * dieselben drei Zeilen im selben Rot. Beim zweiten Durchgang entsteht die
   * Baustelle ein zweites Mal.
   *
   * Getrennt von `letzteBaustelle` gehalten, weil es zwei verschiedene
   * Aussagen sind: hier steht, was ansteht, dort, was gewesen ist. Beim
   * Eintragen der erledigten Wartung wandert der Wert von hier nach dort und
   * wird hier geleert — in EINEM Schreibvorgang, damit kein Zustand entsteht,
   * in dem er in beiden Feldern steht.
   */
  offeneBaustelle?: string;
  createdAt?: number;
  updatedAt?: number;
}

