import { httpsCallable } from 'firebase/functions';
import type { NeuerBetrieb } from '@shared/plattform';
import { functions } from './firebase';
import type { VoiceExtractResponse } from '@/features/voice/types';

/** Ruft die serverseitige KI-Extraktion auf. API-Schlüssel bleiben im Server. */
export const callVoiceExtract = httpsCallable<
  { audioBase64: string; mimeType: string },
  VoiceExtractResponse
>(functions, 'voiceExtract');

/**
 * Baut die Monatsbilanzen eines Mandanten neu auf.
 *
 * Einmalig anzustoßen — danach hält der Trigger sie aktuell und ein
 * nächtlicher Lauf heilt Abweichungen. Erst nach diesem Aufbau benutzt das
 * Zeitkonto die Bilanzen; vorher rechnet es weiter direkt aus den Buchungen.
 */
export const callBilanzenNeuAufbauen = httpsCallable<
  Record<string, never>,
  { mitarbeiter: number; bilanzen: number }
>(functions, 'bilanzenNeuAufbauen');

/**
 * Entscheidet ueber einen Urlaubsantrag.
 *
 * Serverseitig, weil die Genehmigung fremde Zeiteintraege lesen UND schreiben
 * muss: lesen, um bereits gebuchte Tage nicht zu ueberschreiben, schreiben,
 * damit der genehmigte Urlaub im Zeitkonto steht. Beides darf ein
 * Genehmigender nicht selbst — Zeiteintraege tragen Kranken- und Urlaubstage
 * und damit Gesundheitsdaten nach Art. 9 DSGVO.
 *
 * Solange nur Buchhaltung und Leitung genehmigen durften, fiel das nicht auf.
 * Sobald die Geschaeftsfuehrung frei festlegt, WER genehmigt, geht es nicht
 * mehr — und die Grenze aufzumachen waere die falsche Reihenfolge.
 */
export const callUrlaubEntscheiden = httpsCallable<
  {
    vacationId: string;
    entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
    grund?: string;
    entscheiderName?: string;
  },
  { status: string; angelegt: number; uebersprungen: number; entfernt: number }
>(functions, 'urlaubEntscheiden');

/**
 * Stellt die Positionen fuer einen Handwerksschein zusammen.
 *
 * Serverseitig, weil der Schein die Stunden der GANZEN Mannschaft eines Tages
 * braucht — ein Monteur darf die Zeiteintraege seiner Kollegen aber nicht
 * lesen (Kranken- und Urlaubstage sind Gesundheitsdaten nach Art. 9 DSGVO).
 * Die Function gibt nur Anwesenheitszeiten EINER Baustelle an EINEM Tag
 * zurueck; die Datenschutzgrenze bleibt, wo sie ist.
 *
 * MATERIAL kommt hier NICHT mehr her — der Monteur traegt es beim Erstellen
 * selbst ein. Warum, steht in `functions/src/scheinVorbereiten.ts`.
 */
export const callScheinVorbereiten = httpsCallable<
  { projectNumber: string; datum: string },
  {
    zeiten: Array<{
      datum: string;
      mitarbeiter: string;
      von?: string;
      bis?: string;
      pauseMin?: number;
      minuten: number;
      taetigkeit?: string;
      helfer?: boolean;
    }>;
  }
>(functions, 'scheinVorbereiten');

/**
 * Sichert den eigenen Mandanten sofort an den zweiten Ort.
 *
 * Denselben Lauf macht `datenAusleitung` jede Nacht. Von Hand gibt es ihn,
 * weil eine Sicherung, die niemand je ausgeloest hat, keine ist: der Knopf
 * zeigt in einem Zug, ob die Berechtigungen stimmen, ob das Ziel erreichbar
 * ist und wie gross der Stand tatsaechlich ist.
 */
export const callDatenAusleitungJetzt = httpsCallable<
  Record<string, never>,
  { companyId: string; zeilen: number; bytes: number; pfad: string; geraeumt: number; ziel: string }
>(functions, 'datenAusleitungJetzt');

/**
 * Laedt den kompletten Mandantenbestand als Datei herunter (DSGVO Art. 15/20).
 *
 * NICHT dasselbe wie die Ausleitung: hier kommt alles in EINER Antwort
 * zurueck, und die ist bei 10 MB gedeckelt. Fuer einen Betrieb mit Historie
 * ist die naechtliche Ausleitung der verlaessliche Weg; dieser hier ist der
 * bequeme fuer eine Auskunft.
 */
export const callExportCompanyData = httpsCallable<
  Record<string, never>,
  {
    companyId: string;
    exportedAt: string;
    anzahl: Record<string, number>;
    data: Record<string, unknown[]>;
  }
>(functions, 'exportCompanyData');

/**
 * Einen neuen Betrieb anlegen — nur für den globalen Administrator.
 *
 * Der Aufruf ist der EINZIGE Weg dieses Kontos in die Daten, und er schreibt
 * ausschliesslich: ein leeres Firmendokument, den ersten Administrator, einen
 * Eintrag ins Anlageprotokoll. Gelesen werden kann mit diesem Konto nichts —
 * sein Token trägt keine `companyId`, und daran hängt jede einzelne Regel.
 * Warum das so gebaut ist, steht in `shared/plattform.ts`.
 */
export const callBetriebAnlegen = httpsCallable<
  NeuerBetrieb,
  { companyId: string; ersterAdminUid: string; passwortLink: string }
>(functions, 'betriebAnlegen');
