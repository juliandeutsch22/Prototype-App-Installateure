/**
 * Rechnung und Angebot per Mail (F16) — über die Edge Function `beleg-mail`.
 *
 * Die App erzeugt das PDF wie beim „PDF laden“ und reicht es mit Empfänger,
 * Betreff und Text weiter; Rechte, Rate-Limit und Protokoll entscheidet die
 * Datenbank, den Versand die Function. Ist der Versand nicht eingerichtet,
 * kommt das als eigener Fall zurück (`BelegMailNichtEingerichtet`) — dann
 * bietet die App den bisherigen Weg an.
 */
import type { BelegArt } from '@shared/belegMail';
import { NICHT_EINGERICHTET } from '@shared/belegMail';
import { base64 } from '@shared/smtp';
import { abfragen, derClient } from './kern';

/** Der Versand ist (noch) nicht eingerichtet — kein Fehler der Eingabe. */
export class BelegMailNichtEingerichtet extends Error {}

export interface BelegMailStand {
  eingerichtet: boolean;
  /** Die Absenderadresse der Plattform, wenn eingerichtet. */
  absender?: string;
}

/** Den Rumpf einer abgelehnten Antwort auspacken — die Meldung der Function, nicht „non-2xx“. */
async function grund(error: unknown): Promise<{ text: string; code?: string }> {
  const rumpf = await (error as { context?: Response }).context?.json?.().catch(() => undefined) as
    | { error?: string; code?: string } | undefined;
  return { text: rumpf?.error ?? (error as Error).message, code: rumpf?.code };
}

export async function belegMailStand(): Promise<BelegMailStand> {
  const { data, error } = await derClient().functions.invoke('beleg-mail', { body: { pruefen: true } });
  if (error) throw new Error((await grund(error)).text);
  const d = data as { eingerichtet?: boolean; absender?: string } | null;
  return { eingerichtet: d?.eingerichtet === true, ...(d?.absender ? { absender: d.absender } : {}) };
}

export interface BelegMailAuftrag {
  art: BelegArt;
  beleg: string;
  an: string[];
  /** Blindkopie an die Antwortadresse des Betriebs. */
  kopie: boolean;
  betreff: string;
  text: string;
  pdf: Blob;
  /** Steht ein Annahme-Link im Text? Die Datenbank prüft, dass es einen offenen gibt. */
  mitLink?: boolean;
}

export interface BelegMailErgebnis {
  versand: string;
  an: string[];
  kopie: string | null;
  /** Ein Entwurf ist dadurch versendet. */
  angebotVersendet?: boolean;
  hinweis?: string;
}

export async function belegPerMail(a: BelegMailAuftrag): Promise<BelegMailErgebnis> {
  const anhang = base64(new Uint8Array(await a.pdf.arrayBuffer()));
  const { data, error } = await derClient().functions.invoke('beleg-mail', {
    body: {
      art: a.art, beleg: a.beleg, an: a.an, kopie: a.kopie, betreff: a.betreff, text: a.text, anhang,
      mitLink: a.mitLink === true,
    },
  });
  if (error) {
    const g = await grund(error);
    if (g.code === NICHT_EINGERICHTET) throw new BelegMailNichtEingerichtet(g.text);
    throw new Error(g.text);
  }
  const d = data as BelegMailErgebnis;
  return { versand: d.versand, an: d.an, kopie: d.kopie ?? null, ...(d.angebotVersendet ? { angebotVersendet: true } : {}), ...(d.hinweis ? { hinweis: d.hinweis } : {}) };
}

/** Ein Versuch, wie er im Protokoll steht. */
export interface BelegVersand {
  id: string;
  art: BelegArt;
  belegNummer: string;
  an: string[];
  kopieAn?: string | null;
  betreff: string;
  anhangName: string;
  mitLink: boolean;
  zustand: 'laeuft' | 'versendet' | 'gescheitert';
  fehler?: string | null;
  /** Millisekunden. */
  angefragtAm: number;
  vonName?: string | null;
}

/**
 * Die letzten Versände eines Belegs, der jüngste zuerst. Bei einer Rechnung
 * auch die ihrer Mahnungen (sie tragen die Rechnung mit) — so sieht das Büro
 * vor dem Senden alles, was zu dieser Forderung hinausging.
 */
export function listBelegVersand(companyId: string, art: BelegArt, belegId: string): Promise<BelegVersand[]> {
  return abfragen<BelegVersand>('beleg_versand', companyId, {
    wo: [{ art: 'gleich', feld: art === 'rechnung' ? 'invoiceId' : art === 'mahnung' ? 'mahnungId' : 'quoteId', wert: belegId }],
    sortiere: { feld: 'angefragtAm', absteigend: true },
    grenze: 20,
  });
}
