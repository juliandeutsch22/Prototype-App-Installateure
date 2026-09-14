import { httpsCallable } from 'firebase/functions';
import type { NeuerBetrieb } from '@shared/plattform';
import { functions } from './firebase';
import { nutztPostgres } from './db/quelle';
import { entscheiden } from './db/vacations';
import { vorbereiten, type ScheinZeit } from './db/workSheets';
import { auszug, type BetriebsAuszug } from './db/company';
import { betriebAnlegen, type BetriebAngelegt } from './db/plattform';
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
interface UrlaubsEingabe {
  vacationId: string;
  entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
  grund?: string;
  entscheiderName?: string;
}
type UrlaubsAntwort = { status: string; angelegt: number; uebersprungen: number; entfernt: number };

const urlaubAlsFunction = httpsCallable<UrlaubsEingabe, UrlaubsAntwort>(
  functions, 'urlaubEntscheiden',
);

/**
 * UNTER POSTGRES IST DAS KEINE FUNCTION MEHR, sondern ein Aufruf an die
 * Datenbank — in EINER Transaktion statt in einem Stapel, den ein Abbruch
 * halb stehen liesse.
 *
 * Die Form bleibt: die Ansicht bekommt `{ data }` und merkt nichts.
 */
export function callUrlaubEntscheiden(
  daten: UrlaubsEingabe,
): Promise<{ data: UrlaubsAntwort }> {
  return nutztPostgres()
    ? entscheiden(daten).then((data) => ({ data }))
    : urlaubAlsFunction(daten);
}

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
interface ScheinEingabe { projectNumber: string; datum: string }
type ScheinAntwort = { zeiten: ScheinZeit[] };

const scheinAlsFunction = httpsCallable<ScheinEingabe, ScheinAntwort>(
  functions, 'scheinVorbereiten',
);

/**
 * UNTER POSTGRES IST DAS KEINE FUNCTION MEHR, sondern eine Abfrage mit
 * erhoehten Rechten — dieselbe Grenze, ein Weg weniger.
 *
 * Die Form bleibt: die Ansicht bekommt `{ data }` und merkt nichts.
 */
export function callScheinVorbereiten(
  daten: ScheinEingabe,
): Promise<{ data: ScheinAntwort }> {
  return nutztPostgres()
    ? vorbereiten(daten.projectNumber, daten.datum).then((data) => ({ data }))
    : scheinAlsFunction(daten);
}

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
const auszugAlsFunction = httpsCallable<Record<string, never>, BetriebsAuszug>(
  functions, 'exportCompanyData',
);

/**
 * UNTER POSTGRES IST DAS KEINE FUNCTION MEHR, sondern eine Abfrage mit
 * erhoehten Rechten — und die Sammlungsliste kommt aus dem Katalog statt aus
 * einer Datei, die jemand pflegen muss.
 *
 * Die Form bleibt: die Ansicht bekommt `{ data }` und merkt nichts.
 */
export function callExportCompanyData(
  _daten: Record<string, never> = {},
): Promise<{ data: BetriebsAuszug }> {
  return nutztPostgres()
    ? auszug().then((data) => ({ data }))
    : auszugAlsFunction(_daten);
}

/**
 * Einen neuen Betrieb anlegen — nur für den globalen Administrator.
 *
 * Der Aufruf ist der EINZIGE Weg dieses Kontos in die Daten, und er schreibt
 * ausschliesslich: ein leeres Firmendokument, den ersten Administrator, einen
 * Eintrag ins Anlageprotokoll. Gelesen werden kann mit diesem Konto nichts —
 * sein Token trägt keine `companyId`, und daran hängt jede einzelne Regel.
 * Warum das so gebaut ist, steht in `shared/plattform.ts`.
 */
const betriebAlsFunction = httpsCallable<NeuerBetrieb, BetriebAngelegt>(
  functions, 'betriebAnlegen',
);

/**
 * UNTER POSTGRES IST DAS DIE EINE EDGE FUNCTION, die bleiben musste.
 *
 * Alles andere aus dem Functions-Bestand ist zu SQL geworden; ein
 * ANMELDEKONTO aber entsteht im Anmeldedienst und nicht in einer Tabelle.
 * Warum das keine Bequemlichkeit ist, steht im Kopf von
 * `supabase/functions/betrieb-anlegen/index.ts`.
 *
 * Die Form bleibt: die Ansicht bekommt `{ data }` und merkt nichts.
 */
export function callBetriebAnlegen(
  daten: NeuerBetrieb,
): Promise<{ data: BetriebAngelegt }> {
  return nutztPostgres()
    ? betriebAnlegen(daten).then((data) => ({ data }))
    : betriebAlsFunction(daten);
}
