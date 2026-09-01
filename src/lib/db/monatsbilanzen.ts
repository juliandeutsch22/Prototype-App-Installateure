import { doc, getDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { queryTenant } from './core';

/**
 * Monatsbilanzen lesen — die verdichtete Buchungsgeschichte.
 *
 * Geschrieben werden sie ausschließlich serverseitig (functions/src/
 * monatsbilanz.ts). Hier wird nur gelesen, und zwar mit einer harten
 * Bedingung: ohne gültigen Vollständigkeits-Marker werden sie NICHT benutzt.
 *
 * Der Grund ist kein Vorsichtsprinzip, sondern eine konkrete Gefahr. Eine
 * fehlende Bilanz ist von einem Monat ohne Buchungen nicht zu unterscheiden.
 * Wer die Bilanzen ungeprüft summiert, bekommt bei einem lückenhaften
 * Bestand einen zu niedrigen Saldo — ohne Fehlermeldung, ohne Hinweis, und
 * die Zahl geht auf den Lohnzettel. Der Rückfall auf die direkte Rechnung ist
 * langsamer und richtig; das ist in dieser Reihenfolge zu bewerten.
 */

const BILANZEN = 'monthlyStats';
const MARKER = 'monthlyStatsMeta';

export interface Monatsbilanz {
  monat: string;
  anwesendMin: number;
  krankTage: number;
  urlaubTage: number;
  tage: string[];
}

/** 'YYYY-MM' aus einem ISO-Datum. */
export function monatVon(datum: string): string {
  return datum.slice(0, 7);
}

/**
 * Ab welchem Monat die Bilanzen dieses Mitarbeiters lückenlos vorliegen.
 *
 * `null` heißt: nie aufgebaut, oder der Aufbau brach ab. Beides führt zum
 * Rückfall.
 */
export async function bilanzMarker(
  companyId: string,
  uid: string,
): Promise<{ vollstaendigAb: string } | null> {
  const snap = await getDoc(doc(db, MARKER, `${companyId}_${uid}`));
  if (!snap.exists()) return null;
  const d = snap.data() as { vollstaendigAb?: string };
  return d.vollstaendigAb ? { vollstaendigAb: d.vollstaendigAb } : null;
}

/**
 * Die Bilanzen eines Mitarbeiters ab einem Monat.
 *
 * Begrenzt über `userId` und einen Monatsbereich. Die Menge wächst mit den
 * Dienstjahren, aber nur um zwölf Dokumente im Jahr statt um zweihundertzwanzig
 * — nach zehn Jahren 120 statt 2.200.
 */
export async function listBilanzen(
  companyId: string,
  uid: string,
  abMonat: string,
): Promise<Monatsbilanz[]> {
  const rows = await queryTenant<Monatsbilanz>(
    BILANZEN,
    companyId,
    where('userId', '==', uid),
    where('monat', '>=', abMonat),
  );
  return rows.sort((a, b) => a.monat.localeCompare(b.monat));
}
