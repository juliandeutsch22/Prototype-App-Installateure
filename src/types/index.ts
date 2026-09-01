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
  addressLine?: string; // "Musterstraße 1 · 1010 Wien"
  contactLine?: string; // "Tel · Mail · Web"
  iban?: string;
  bic?: string;
  bankName?: string;
  vatId?: string; // UID-Nummer, z. B. "ATU12345678"
  companyRegister?: string; // FN
  defaultVatRate?: number; // z. B. 0.20
  /** Stundensätze und Zuschläge, gepflegt von der Geschäftsführung. */
  rates?: InvoiceRates;
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
   * Helfer, €/h. Gilt für Einsätze, die im Zeiteintrag als Helferarbeit
   * gekennzeichnet sind — nicht für eine Person dauerhaft.
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
}

/** users/{docId} — Auth-Verknüpfung über `uid`, nicht Doc-ID. */
export interface AppUser {
  id: string; // Firestore-Doc-ID (in Legacy als docId gelesen)
  companyId: string;
  uid: string; // Firebase Auth UID
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  weeklyTargetHours?: number; // default 40
  yearlyVacationDays?: number; // default 25
  initialOvertime?: number; // Startsaldo Überstunden (kann negativ sein)
  appStartDate?: string | null; // 'YYYY-MM-DD' ab dem Soll/Ist gilt
  workDays?: number[]; // 0=So..6=Sa, default [1,2,3,4,5]
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
  status: 'Entwurf' | 'Unterschrieben' | 'Storniert';
  abrechnung: 'Regie' | 'Pauschal';
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
  /** Zeitpunkt des Einfrierens, vom SERVER. */
  unterschriebenAm?: number;
  stornoGrund?: string;
  storniertVonName?: string;
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
  /** Das Unterschriftsbild als PNG-Data-URL (~10 KB). */
  bild: string;
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
  /** Rechnungsadresse — NICHT die Baustellenadresse. */
  address?: string;
  contactName?: string;
  contactPhone?: string;
  /** Für den späteren Versand von Handwerksscheinen und Rechnungen. */
  email?: string;
  /** UID-Nummer für Rechnungen an Unternehmen. */
  vatId?: string;
  notes?: string;
  active?: boolean;
  createdAt?: number;
}

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
  billingMode?: 'Regie' | 'Pauschal';
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
 * Bewusst ohne Preis: Material wird über diese App nicht verrechnet. Der
 * Katalog dient allein dazu, dass ein Monteur auf der Baustelle benennen kann,
 * was ihm die Projektleitung bringen soll.
 */
export interface Material {
  id: string;
  companyId: string;
  name: string;
  category?: string;
  stock: number;
  articleNumber?: string;
  unit?: string;
}

/**
 * materialOrders/{id} — Anforderung oder Retoure.
 *
 * Eine „Bestellung" ist hier eine interne Anforderung des Monteurs an die
 * Projektleitung, keine Bestellung beim Lieferanten und kein Rechnungsposten.
 */
export interface MaterialOrder {
  id: string;
  companyId: string;
  materialId: string;
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
  createdAt?: number;
  updatedAt?: number;
}

/** timeEntries/{id} — Zeiterfassung. */
export interface TimeEntry {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  status: 'Anwesend' | 'Krank' | 'Urlaub';
  startTime?: string; // 'HH:MM'
  endTime?: string; // 'HH:MM'
  breakDuration?: number; // Minuten
  travelTime?: number; // Minuten (Wegzeit)
  /** Direkt gesetzte Stunden (v. a. Sprach-Einträge). Greift nur, wenn keine
   * Zeitspanne (start+end) gesetzt ist — siehe calcWorkMin. */
  hours?: number;
  /** Nachtarbeit — wird bewusst manuell gesetzt, nicht aus der Uhrzeit geraten. */
  isNightWork?: boolean;
  /** Notdienst / Störungseinsatz außerhalb der regulären Zeit. */
  isEmergency?: boolean;
  customerName?: string;
  projectNumber?: string;
  helperName?: string;
  vehiclePlate?: string;
  comment?: string;
  isHelper?: boolean;
  userId: string; // uid
  userName?: string;
  source?: EntrySource;
  isBilled?: boolean;
  invoiceNumber?: string;
  createdAt?: number;
  lastEditedBy?: string;
  lastEditedByUid?: string;
  lastEditedAt?: number;
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
  materials?: Array<{ matId: string; name: string; unit?: string; qty: number }>;
  createdBy?: string;
  pickedUpMaterials?: string[];
  createdAt?: number;
}

/** invoices/{id} */
export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string; // 'RE-YYYY-NNNN'
  projectNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  /**
   * Positionen zum Zeitpunkt der Rechnungslegung. Eine Rechnung ist ein
   * Dokument, kein Blick auf die aktuellen Daten: würde man sie später aus
   * den Zeiteinträgen neu berechnen, änderte sich eine bereits verschickte
   * Rechnung, sobald jemand einen Eintrag korrigiert.
   */
  positions?: { label: string; qty: number; unit: string; unitPrice: number; netto: number }[];
  /** Summe der Positionen VOR Rabatt. Ohne sie liesse sich der Rabatt im
   *  Nachhinein nicht mehr nachvollziehen. */
  subtotalNetto?: number;
  /**
   * Gewaehrter Rabatt, wie er auf der Rechnung steht. `null` heisst
   * ausdruecklich „kein Rabatt" — Firestore laesst undefined nicht zu.
   */
  discount?: InvoiceDiscount | null;
  /** Der daraus errechnete Abzug in Euro — festgehalten, nicht neu gerechnet. */
  discountAmount?: number;
  /** Angewandter USt-Satz (0.2 = 20 %). */
  vatRate?: number;
  /** Anschrift der Baustelle zum Zeitpunkt der Rechnungslegung. */
  address?: string;
  paymentStatus: 'Offen' | 'Überfällig' | 'Bezahlt' | 'Storniert';
  linkedEntries?: string[];
  linkedOrders?: string[];
  cancellationNote?: string | null;
  cancelledAt?: number | null;
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
export interface InvoiceDiscount {
  mode: 'percent' | 'amount';
  value: number;
  /** Was auf der Rechnung steht, z. B. „Stammkundenrabatt". */
  label?: string;
}

/** followUps/{id} — neuer optionaler Typ aus dem KI-Magic-Moment (Spec §6). */
export interface FollowUp {
  id: string;
  companyId: string;
  projectNumber?: string;
  title: string;
  dueWeek?: string; // ISO-Woche, z. B. "2026-W26"
  createdFrom: 'voice' | 'manual';
  done: boolean;
  createdAt?: number;
}
