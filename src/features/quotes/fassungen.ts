import type { Quote } from '@/types';

/**
 * DIE FASSUNGEN EINES ANGEBOTS (Runde 6, G15) — alle, die über
 * `vorgaengerId` mit diesem zusammenhängen, soweit sie geladen sind.
 *
 * Gebraucht für zwei Auskünfte vor dem Annehmen: welche offenen Fassungen
 * danach als ersetzt gelten, und ob eine andere schon angenommen ist (dann
 * nimmt die Datenbank nicht an — `app.angebot_fassung_pruefen`).
 */
export function fassungenVon<T extends Pick<Quote, 'vorgaengerId' | 'status'> & { id: string }>(
  q: T,
  bekannte: T[],
): T[] {
  const alle = new Map([...bekannte, q].map((x) => [x.id, x]));
  // Je Angebot seine Nachfolger — einmal gebaut, dann in beide Richtungen gelaufen.
  const nachfolger = new Map<string, string[]>();
  for (const x of alle.values()) {
    if (x.vorgaengerId) nachfolger.set(x.vorgaengerId, [...(nachfolger.get(x.vorgaengerId) ?? []), x.id]);
  }
  const drin = new Set([q.id]);
  const offen = [q.id];
  while (offen.length > 0) {
    const id = offen.pop()!;
    const nachbarn = [...(nachfolger.get(id) ?? []), alle.get(id)?.vorgaengerId ?? ''];
    for (const n of nachbarn) {
      if (n && alle.has(n) && !drin.has(n)) {
        drin.add(n);
        offen.push(n);
      }
    }
  }
  return [...drin].filter((id) => id !== q.id).map((id) => alle.get(id)!);
}

/** Was das Annehmen über die anderen Fassungen sagt — für den Dialog. */
export function fassungsHinweis<T extends Pick<Quote, 'vorgaengerId' | 'status' | 'quoteNumber'> & { id: string }>(
  q: T,
  bekannte: T[],
): { angenommen?: T; ersetzt: T[] } {
  const andere = fassungenVon(q, bekannte);
  return {
    angenommen: andere.find((x) => x.status === 'Angenommen'),
    ersetzt: andere.filter((x) => x.status === 'Entwurf' || x.status === 'Versendet'),
  };
}
