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
  | 'Geschäftsführung'
  | 'Administrator';

export const ROLES: Role[] = [
  'Mitarbeiter',
  'Verwaltung',
  'Buchhaltung',
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
   * Push-Token je Gerät. Ein Mensch hat Telefon und Rechner, beide sollen
   * die Meldung bekommen; ein abgemeldetes Gerät wird wieder entfernt.
   */
  pushTokens?: string[];
  updatedAt?: number;
}

/** projects/{id} — verknüpft über `projectNumber`. */
export interface Project {
  id: string;
  companyId: string;
  projectNumber: string; // Geschäftsschlüssel, z. B. "2024-001"
  customerName: string;
  address?: string;
  description?: string;
  status: 'Aktiv' | 'Pausiert' | 'Abgeschlossen';
  estimatedHours?: number;
  startDate?: string;
  endDate?: string;
  contactName?: string;
  contactPhone?: string;
  assignedEmployees?: string[]; // Array von uids
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
