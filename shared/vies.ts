/**
 * Die Abfrage einer UID-Nummer bei VIES, dem Dienst der EU-Kommission
 * (Entscheidung vom 02.10.2026; offene Punkte E2).
 *
 * HIER STEHT NUR, WAS GEFRAGT UND WIE DIE ANTWORT GELESEN WIRD. Gerufen wird
 * VIES von der Serverfunktion `uid-pruefen`; die App fragt hier nur, ob sich
 * eine Nummer überhaupt bei VIES prüfen lässt — damit sie keinen Knopf
 * anbietet, der dann abgewiesen wird.
 *
 * DIE ABFRAGE-ID gibt VIES nur, wenn der Fragende seine eigene UID mitschickt
 * (die aus den Firmendaten). Sie belegt, dass genau dieser Betrieb zu genau
 * diesem Zeitpunkt gefragt hat. Ohne eigene UID — oder wenn VIES sie nicht
 * anerkennt — kommt das Ergebnis ohne ID; auch das wird festgehalten, und die
 * Akte sagt, warum die ID fehlt.
 */

export const VIES_ADRESSE = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

/**
 * Die Länderkennungen, die VIES kennt: die EU-Staaten (Griechenland als
 * „EL“) und Nordirland („XI“). Eine Schweizer, norwegische oder britische UID
 * lässt sich dort nicht prüfen.
 */
const VIES_LAENDER = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE',
  'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
]);

/** Großbuchstaben, ohne Leerzeichen, Punkte und Bindestriche — wie gespeichert. */
function normal(uid: string | null | undefined): string {
  return (uid ?? '').replace(/[\s.-]/g, '').toUpperCase();
}

/** Lässt sich diese UID bei VIES prüfen? Die Form prüft `uidFehler` vorher. */
export function beiViesPruefbar(uid: string | null | undefined): boolean {
  const u = normal(uid);
  return u.length > 2 && VIES_LAENDER.has(u.slice(0, 2));
}

/** Der Rumpf der Anfrage — mit der eigenen UID, wenn es eine prüfbare gibt. */
export function viesAnfrage(
  uid: string, eigeneUid?: string | null,
): { countryCode: string; vatNumber: string; requesterMemberStateCode?: string; requesterNumber?: string } {
  const u = normal(uid);
  const e = normal(eigeneUid);
  return {
    countryCode: u.slice(0, 2),
    vatNumber: u.slice(2),
    ...(beiViesPruefbar(e) ? { requesterMemberStateCode: e.slice(0, 2), requesterNumber: e.slice(2) } : {}),
  };
}

export type ViesErgebnis =
  | {
      art: 'ergebnis';
      gueltig: boolean;
      name: string | null;
      adresse: string | null;
      abfrageId: string | null;
      /** Zeitpunkt laut VIES, ISO. */
      zeitpunkt: string;
    }
  | { art: 'fehler'; code: string; text: string };

/**
 * Was die Fehlercodes von VIES dem Büro sagen. Fast alle heißen „später noch
 * einmal“: der Dienst eines Mitgliedstaats ist nicht erreichbar oder
 * überlastet. Das ist kein Ergebnis — festgehalten wird dann nichts.
 */
const FEHLER: Record<string, string> = {
  INVALID_INPUT: 'VIES hat die Nummer als unlesbar abgewiesen.',
  INVALID_REQUESTER_INFO: 'VIES erkennt die eigene UID-Nummer aus den Firmendaten nicht an.',
  SERVICE_UNAVAILABLE: 'VIES ist gerade nicht erreichbar. Bitte später noch einmal prüfen.',
  MS_UNAVAILABLE: 'Der Dienst dieses Landes antwortet gerade nicht. Bitte später noch einmal prüfen.',
  TIMEOUT: 'Der Dienst dieses Landes hat nicht rechtzeitig geantwortet. Bitte später noch einmal prüfen.',
  GLOBAL_MAX_CONCURRENT_REQ: 'VIES ist gerade überlastet. Bitte in ein paar Minuten noch einmal prüfen.',
  MS_MAX_CONCURRENT_REQ: 'Der Dienst dieses Landes ist gerade überlastet. Bitte in ein paar Minuten noch einmal prüfen.',
  VAT_BLOCKED: 'VIES gibt zu dieser Nummer keine Auskunft.',
  IP_BLOCKED: 'VIES nimmt von diesem Server gerade keine Anfragen an. Bitte später noch einmal prüfen.',
};

export function viesFehlerText(code: string): string {
  return FEHLER[code] ?? `VIES hat die Abfrage nicht beantwortet (${code || 'ohne Angabe'}). Bitte später noch einmal prüfen.`;
}

/** „---“ heißt bei VIES „keine Angabe“ — manche Staaten geben Namen nicht heraus. */
function angabe(wert: unknown): string | null {
  const t = typeof wert === 'string' ? wert.trim() : '';
  return t && t !== '---' ? t : null;
}

/** Die Antwort von VIES lesen — Ergebnis oder Fehler, nie etwas dazwischen. */
export function viesAntwortLesen(daten: unknown): ViesErgebnis {
  const d = (daten ?? {}) as Record<string, unknown>;
  const fehler = Array.isArray(d.errorWrappers) ? (d.errorWrappers[0] as { error?: unknown } | undefined) : undefined;
  if (d.actionSucceed === false || fehler) {
    const code = String(fehler?.error ?? '');
    return { art: 'fehler', code, text: viesFehlerText(code) };
  }
  // Ohne Ergebnis oder ohne Zeitpunkt ist es kein Nachweis.
  if (typeof d.valid !== 'boolean' || typeof d.requestDate !== 'string' || Number.isNaN(Date.parse(d.requestDate))) {
    return { art: 'fehler', code: '', text: viesFehlerText('') };
  }
  const zeitpunkt = new Date(d.requestDate).toISOString();
  return {
    art: 'ergebnis',
    gueltig: d.valid,
    name: angabe(d.name),
    adresse: angabe(d.address),
    abfrageId: angabe(d.requestIdentifier),
    zeitpunkt,
  };
}

/**
 * Der ganze Ablauf einer Prüfung — gefragt wird über `fragen`, damit er sich
 * ohne Netz prüfen lässt.
 *
 * Erkennt VIES die eigene UID nicht an, bleibt die Frage nach dem Kunden
 * trotzdem beantwortbar: ein zweites Mal, ohne eigene UID, und damit ohne
 * Abfrage-ID. `ohneIdGrund` sagt dann, warum die ID fehlt. Wirft, wenn VIES
 * gar nicht erreichbar ist.
 */
export async function viesPruefen(
  uid: string,
  eigeneUid: string | null | undefined,
  fragen: (rumpf: ReturnType<typeof viesAnfrage>) => Promise<unknown>,
): Promise<{ ergebnis: ViesErgebnis; eigeneGeschickt: string | null; ohneIdGrund: string | null }> {
  const eigene = beiViesPruefbar(eigeneUid) ? normal(eigeneUid) : null;
  const erstes = viesAntwortLesen(await fragen(viesAnfrage(uid, eigene)));
  if (erstes.art === 'fehler' && erstes.code === 'INVALID_REQUESTER_INFO' && eigene) {
    const zweites = viesAntwortLesen(await fragen(viesAnfrage(uid, null)));
    return { ergebnis: zweites, eigeneGeschickt: null, ohneIdGrund: erstes.text };
  }
  return {
    ergebnis: erstes,
    eigeneGeschickt: eigene,
    ohneIdGrund: eigene ? null : 'Ohne eigene UID-Nummer in den Firmendaten gibt VIES keine Abfrage-ID.',
  };
}
