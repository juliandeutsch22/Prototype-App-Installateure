/**
 * Das fachübergreifende Änderungsjournal (M01 / U04) — nur lesen.
 *
 * Geschrieben wird es ausschließlich serverseitig über
 * `app.journal_schreiben(...)` (`20261106120000_aenderungsjournal.sql`),
 * aufgerufen aus den Fachbefehlen in derselben Transaktion. Die App hat
 * dafür bewusst keinen Schreibweg. Lesen dürfen Führung und Buchhaltung
 * (Zeilenschutz); feinere objektbezogene Regeln folgen mit den
 * Fachpaketen.
 *
 * Die fachlichen Bestandsverläufe (Zeitbuchungen E50, Lager, Wartung)
 * bleiben in ihren Tabellen führend und werden in der Ansicht
 * eingeblendet — nicht hierhin kopiert.
 */
import { abfragen } from './kern';

export interface JournalZeile {
  /** Fachlicher Objekttyp, z. B. 'baustelle', 'angebot', 'rechnung'. */
  objekt: string;
  objektId: string;
  /** Typisierte Aktion des Fachbefehls, z. B. 'fassung.freigegeben'. */
  aktion: string;
  /** Pflicht bei Korrektur/Übersteuerung, sonst leer. */
  grund?: string;
  /** Vorgangskennung des auslösenden Befehls (Idempotenzbezug). */
  vorgang?: string;
  /** Geänderte Inhalte: je Feld `{ alt, neu }` bzw. fachlicher Stand. */
  daten: Record<string, unknown>;
  vonUid?: string;
  vonName?: string;
  /** Millisekunden — `am` ist ein Zeitpunkt (`spaltentypen.ts`). */
  am: number;
}

/** Der Verlauf EINES Objekts, neueste zuerst. */
export function listJournalObjekt(companyId: string, objekt: string, objektId: string) {
  return abfragen<JournalZeile>('aenderungsjournal', companyId, {
    wo: [
      { art: 'gleich', feld: 'objekt', wert: objekt },
      { art: 'gleich', feld: 'objektId', wert: objektId },
    ],
    sortiere: { feld: 'am', absteigend: true },
  });
}

/**
 * Die letzten Journalzeilen eines ObjektTYPS im Betrieb, neueste zuerst.
 * `grenze` begrenzt nur die Vorschau; die vollständige Fortsetzung läuft
 * über die seitenweise Abfrage der Datenschicht (kein stiller Deckel).
 */
export function listJournalTyp(companyId: string, objekt: string, grenze?: number) {
  return abfragen<JournalZeile>('aenderungsjournal', companyId, {
    wo: [{ art: 'gleich', feld: 'objekt', wert: objekt }],
    sortiere: { feld: 'am', absteigend: true },
    grenze,
  });
}
