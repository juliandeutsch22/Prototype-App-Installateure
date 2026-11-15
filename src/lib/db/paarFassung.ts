/**
 * Die Fassung eines Paares aus Tag und Baustelle (Durchsicht 15.11.2026, P1).
 *
 * Einsatz und Rüstliste werden je Paar als Ganzes ersetzt. Damit dabei keine
 * fremde Änderung still überschrieben wird, schickt das Formular mit, auf
 * welchem Stand seine Eingabe beruht; weicht die Datenbank ab, lehnt sie mit
 * `SL409` ab (`supabase/migrations/20261115500000_einsatz_fassung.sql`).
 *
 * Der Stand ist der INHALT, keine Prüfsumme: dieselben Felder, die das
 * Formular an den Live-Daten vergleicht. Die Datenbank bringt beide Seiten in
 * dieselbe Form; hier muss nichts gleich gerechnet werden wie dort.
 */

/** Eine Zeile der Einteilung: Person, als Helfer, Aufgabe, von, bis (HH:MM oder leer). */
export type EinteilungsZeile = [string, boolean, string, string, string];
/** Eine Position der Rüstliste: Kennung, Artikel (oder leer), Name, Menge, Einheit (oder leer). */
export type ListenZeile = [string, string, string, number, string];

/** Worauf eine Eingabe beruht. Ein fehlender Teil wird nicht geprüft. */
export interface PaarGrundlage {
  einteilung?: EinteilungsZeile[];
  liste?: ListenZeile[];
}

/** Der Code, mit dem die Datenbank ein Speichern auf überholtem Stand ablehnt. */
export const PAAR_GEAENDERT_CODE = 'SL409';

/**
 * Abgelehnt, weil das Paar inzwischen anders aussieht. `stand` ist, wie der
 * abweichende Teil in der Datenbank JETZT steht — damit lässt sich bewusst
 * auf genau diesem Stand speichern, auch bevor seine Live-Meldung da ist.
 */
export class PaarGeaendert extends Error {
  constructor(
    message: string,
    readonly teil: 'einteilung' | 'liste',
    /** `null`: die Datenbank hat den Stand nicht mitgeschickt — dann gilt, was live kommt. */
    readonly stand: EinteilungsZeile[] | ListenZeile[] | null,
  ) {
    super(message);
    this.name = 'PaarGeaendert';
  }
}

/** Aus der Antwort der Datenbank die Ablehnung lesen — oder `null`, wenn es eine andere war. */
export function paarGeaendertAus(fehler: { code?: string; message: string; details?: string | null }): PaarGeaendert | null {
  if (fehler.code !== PAAR_GEAENDERT_CODE) return null;
  try {
    const d = JSON.parse(fehler.details ?? '') as { teil?: string; stand?: unknown };
    const teil = d.teil === 'liste' ? 'liste' : 'einteilung';
    const stand = Array.isArray(d.stand) ? (d.stand as EinteilungsZeile[] | ListenZeile[]) : null;
    return new PaarGeaendert(fehler.message, teil, stand);
  } catch {
    // Ohne lesbares Detail bleibt es eine Ablehnung — nur ohne den neuen Stand.
    return new PaarGeaendert(fehler.message, 'einteilung', null);
  }
}
