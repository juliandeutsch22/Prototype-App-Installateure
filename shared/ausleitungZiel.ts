/**
 * Wohin die Sicherung ausser Haus geht — und ob sie überhaupt hingeht.
 *
 * WARUM DAS EIN EIGENES MODUL IST. Die Entscheidung „ist ein Ziel
 * eingerichtet oder nicht" trennt zwei Zustände, die nach aussen sehr
 * ähnlich aussehen und völlig verschiedene Dinge bedeuten:
 *
 *   NICHT EINGERICHTET  Der Stand liegt nur im eigenen Projekt. Das ist eine
 *                       bekannte, benannte Lücke — kein Fehler.
 *   EINGERICHTET, ABER  Die Sicherung ausser Haus BLEIBT AUS. Das ist ein
 *   GESCHEITERT         Fehler, und zwar der stillste, den dieses System
 *                       haben kann: alles sieht grün aus, und im Ernstfall
 *                       ist nichts da.
 *
 * Die beiden zu verwechseln wäre der teuerste Fehler dieser Funktion.
 */
import { datumsStempel } from './ausleitungPlan.ts';
import { signiere, inhaltsHash, pfadKodieren } from './s3Signatur.ts';

export interface Zielspeicher {
  endpunkt: string;
  region: string;
  eimer: string;
  schluessel: string;
  geheimnis: string;
}

/**
 * Das Ziel aus der Umgebung — oder `null`, wenn keines eingerichtet ist.
 *
 * ALLE FÜNF ODER KEINES. Eine halb gesetzte Einrichtung ist kein Ziel,
 * sondern ein Fehler beim Einrichten; sie stillschweigend als „kein Ziel" zu
 * behandeln hiesse, jemandem seine halbe Arbeit zu verschweigen. Deshalb
 * wirft es hier — mit dem Namen des fehlenden Feldes.
 */
export function zielAusUmgebung(umgebung: Record<string, string | undefined>): Zielspeicher | null {
  const felder = {
    endpunkt: umgebung.SICHERUNG_S3_ENDPUNKT,
    region: umgebung.SICHERUNG_S3_REGION,
    eimer: umgebung.SICHERUNG_S3_EIMER,
    schluessel: umgebung.SICHERUNG_S3_SCHLUESSEL,
    geheimnis: umgebung.SICHERUNG_S3_GEHEIMNIS,
  };
  const gesetzt = Object.entries(felder).filter(([, w]) => (w ?? '').trim() !== '');
  if (gesetzt.length === 0) return null;
  if (gesetzt.length < 5) {
    const fehlt = Object.entries(felder)
      .filter(([, w]) => (w ?? '').trim() === '')
      .map(([n]) => `SICHERUNG_S3_${n.toUpperCase()}`);
    throw new Error(`Der Zielspeicher ist halb eingerichtet — es fehlt: ${fehlt.join(', ')}`);
  }
  return felder as Zielspeicher;
}

/**
 * Der Pfad eines Standes im Zielspeicher.
 *
 * JE LAUF EINER, nicht je Tag — und das ist der Unterschied zum Eimer im
 * eigenen Projekt.
 *
 * Dort überschreibt ein zweiter Lauf am selben Tag den ersten; das ist
 * gewollt, damit der Speicher nicht mit Wiederholungsversuchen zuwächst.
 * Hier geht das NICHT: das Dienstkonto im Zielspeicher darf ausdrücklich nur
 * ANLEGEN — nicht überschreiben und nicht löschen. Genau diese Beschränkung
 * ist der Sinn der Sicherung ausser Haus: wer morgen das Projekt übernimmt,
 * hat damit einen Schlüssel, mit dem er die abgelegten Stände nicht
 * vernichten kann.
 *
 * Ein zweiter Lauf mit demselben Pfad liefe deshalb in eine Abweisung — und
 * die sähe aus wie ein kaputter Zugang, obwohl der Zugang genau so gewollt
 * ist. Deshalb trägt der Pfad die Uhrzeit.
 */
export function zielPfad(companyId: string, jetzt: Date): string {
  const zeit = jetzt.toISOString().slice(11, 19).replace(/:/g, '');
  return `ausleitung/${companyId}/${datumsStempel(jetzt)}/${zeit}.jsonl`;
}

/**
 * Der fertige Aufruf, mit dem ein Stand ausser Haus geht.
 *
 * WARUM DAS HIER STEHT UND NICHT IN DER FUNCTION. Alles daran lässt sich
 * prüfen — Adresse, Verfahren, Kopfzeilen, Signatur —, solange es nicht mit
 * dem `fetch` verwachsen ist. In der Function bliebe genau ein Schritt
 * übrig, den keine Prüfung hier ersetzen kann: ob der Zielspeicher den
 * Aufruf annimmt. Das beantwortet nur der echte Eimer, und dafür gibt es den
 * Knopf in den Einstellungen.
 *
 * DER EIMER STEHT IM PFAD, nicht im Hostnamen. Beide Formen sind bei S3
 * üblich; die Pfadform ist die, die Google Cloud Storage unter
 * `storage.googleapis.com` erwartet, und sie kommt ohne eigenen DNS-Namen je
 * Eimer aus. Signiert wird genau das, was danach in der Adresse steht — jede
 * Abweichung zwischen beidem ergibt ein 403 ohne Begründung.
 */
export async function putAnfrage(
  ziel: Zielspeicher, pfad: string, inhalt: string, jetzt: Date,
): Promise<{ url: string; kopfzeilen: Record<string, string> }> {
  const imPfad = `${ziel.eimer}/${pfad}`;
  const kopfzeilen = await signiere({
    endpunkt: ziel.endpunkt,
    region: ziel.region,
    verb: 'PUT',
    pfad: imPfad,
    inhalt,
    schluessel: ziel.schluessel,
    geheimnis: ziel.geheimnis,
    jetzt,
    kopfzeilen: {
      // Bei S3 Pflicht — und der Grund, warum sich der Inhalt unterwegs
      // nicht austauschen lässt.
      'x-amz-content-sha256': await inhaltsHash(inhalt),
      'Content-Type': 'application/x-ndjson',
    },
  });
  return { url: `${ziel.endpunkt}/${pfadKodieren(imPfad)}`, kopfzeilen };
}
