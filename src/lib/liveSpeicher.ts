/**
 * Wem der Zwischenspeicher gerade gehört — und der letzte Bestand der
 * Live-Listen (Laden ohne Springen, Stufe 3; das Warum steht in
 * `zwischenspeicher.ts`).
 *
 * EIN EIGENES, LEICHTES MODUL: `AuthContext` und die Datenschicht laden mit
 * jedem Start der App. Stünde das hier in `zwischenspeicher.ts`, käme
 * TanStack Query mit in den ersten Baustein, auch für wen nie eine Seite
 * öffnet, die es braucht.
 */

/** Wie lange ein Stand nach dem Verlassen der Seite aufbewahrt wird. */
export const AUFBEWAHREN_MS = 10 * 60_000;

/** Mehr Live-Listen merkt sich der Speicher nicht — die ältesten gehen zuerst. */
const LIVE_HOECHSTENS = 40;

/** Benutzer und Betrieb, denen der Speicher gerade gehört (`uid@companyId`). */
let nutzer: string | null = null;
let generation = 0;
const live = new Map<string, { zeilen: readonly unknown[]; zeit: number }>();
const beimWechsel = new Set<(wer: string | null) => void>();

/** Wer gerade angemeldet ist, soweit der Zwischenspeicher es weiß. */
export function speicherNutzer(): string | null {
  return nutzer;
}

/** Wer beim Wechsel des Benutzers mit aufräumen muss (der Speicher von TanStack Query). */
export function beimNutzerwechsel(f: (wer: string | null) => void): void {
  beimWechsel.add(f);
}

/**
 * Der angemeldete Benutzer oder sein Betrieb hat gewechselt (abgemeldet, ein
 * anderer angemeldet, ein Einblick des Supports begonnen oder beendet): alles,
 * was einem anderen gehört, geht weg. `AuthContext` ruft das in einem
 * Layout-Effekt — vor den Effekten der Seiten, die dann neu abonnieren.
 */
export function zwischenspeicherFuer(uid: string | null, companyId: string | null): void {
  const wer = uid && companyId ? `${uid}@${companyId}` : null;
  if (wer === nutzer) return;
  nutzer = wer;
  generation += 1;
  live.clear();
  for (const f of beimWechsel) f(wer);
}

/** Der Stand, zu dem eine Live-Liste ihren Bestand merkt; gilt nur bis zum nächsten Wechsel. */
export function liveGeneration(): number {
  return generation;
}

/** Der zuletzt gemerkte Bestand einer Live-Liste, wenn er nicht zu alt ist. */
export function liveLesen<T>(schl: string): readonly T[] | undefined {
  const e = live.get(schl);
  if (!e) return undefined;
  if (Date.now() - e.zeit > AUFBEWAHREN_MS) {
    live.delete(schl);
    return undefined;
  }
  return e.zeilen as readonly T[];
}

/** Merkt den Bestand einer Live-Liste — nur, wenn seit ihrem Beginn niemand gewechselt hat. */
export function liveMerken(schl: string, zeilen: readonly unknown[], gen: number): void {
  if (gen !== generation) return;
  live.delete(schl);
  live.set(schl, { zeilen, zeit: Date.now() });
  if (live.size > LIVE_HOECHSTENS) live.delete(live.keys().next().value as string);
}

/** Alle Live-Stände weg (Prüfungen). */
export function liveLeeren(): void {
  generation += 1;
  live.clear();
}
