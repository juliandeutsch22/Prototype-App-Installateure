/**
 * `firebase-admin/messaging` als Ersatz.
 *
 * Zwei Dinge sind hier prüfbar und sonst unsichtbar: WER eine Meldung bekommt
 * — falsch bestimmt, erfährt der halbe Betrieb, was ihn nichts angeht — und
 * ob ungültige Tokens danach wirklich verschwinden.
 */

export interface Sendung {
  tokens: string[];
  data: Record<string, string>;
}

export const gesendet: Sendung[] = [];

/** Tokens, die der Dienst als endgültig ungültig meldet. */
let tote = new Set<string>();

export function messagingLeeren() {
  gesendet.length = 0;
  tote = new Set();
}

export function tokenIstTot(...t: string[]) {
  for (const x of t) tote.add(x);
}

export function getMessaging() {
  return {
    async sendEachForMulticast({ tokens, data }: { tokens: string[]; data: Record<string, string> }) {
      gesendet.push({ tokens: [...tokens], data });
      const responses = tokens.map((t) =>
        tote.has(t)
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true },
      );
      return {
        responses,
        successCount: responses.filter((r) => r.success).length,
        failureCount: responses.filter((r) => !r.success).length,
      };
    },
  };
}
