import { QueryClient, useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { AUFBEWAHREN_MS, beimNutzerwechsel, liveLeeren } from './liveSpeicher';

/**
 * Was eine Seite zuletzt geladen hat, über den Seitenwechsel hinweg
 * (Laden ohne Springen, Stufe 3 — Stand-Datei Abschnitt 16.3).
 *
 * WARUM. Jeder Wechsel lud bisher alles neu: wer von der Startseite zur
 * Zeiterfassung und zurück ging, sah dieselben Platzhalter ein zweites Mal
 * und wartete dieselben Sekunden. So machen es andere Apps: beim zweiten
 * Besuch steht sofort der letzte Stand da, und im Hintergrund wird
 * nachgesehen, ob sich etwas geändert hat („stale-while-revalidate“).
 *
 * ZWEI WEGE, EIN SPEICHER:
 *   - Einmal geladene Daten über TanStack Query (`useZwischengespeichert`).
 *   - Live-Listen (`abonnieren` in `db/pg/kern.ts`) merken sich ihren
 *     letzten Bestand in `liveSpeicher.ts` und zeigen ihn beim nächsten
 *     Abonnieren sofort, bis der Kanal den frischen liefert.
 *
 * WEM DIE DATEN GEHÖREN. Ein Gerät wird geteilt — die Werkstatt-Tablette,
 * das Büro. Was die Geschäftsführung sah, darf der Monteur nach ihr nicht
 * zu sehen bekommen, auch nicht für einen Augenblick. Darum
 *   - trägt jeder Schlüssel Benutzer und Betrieb (`schluessel`),
 *   - wirft `zwischenspeicherFuer` (`liveSpeicher.ts`) beim Wechsel des
 *     Benutzers alles andere weg, bevor die Seiten des neuen Benutzers
 *     abonnieren,
 *   - und eine Live-Liste, deren Antwort erst nach dem Wechsel kommt, merkt
 *     sich nichts mehr (`liveGeneration`).
 */

export const abfrageSpeicher = new QueryClient({
  defaultOptions: {
    queries: {
      /*
        DIE APP VERHÄLT SICH SONST WIE BISHER — nur der zweite Besuch ist neu.
        `always`: ohne Netz scheitert die Abfrage wie bisher und die Seite sagt
        es; TanStack würde sie sonst anhalten, und es stünde ewig ein
        Platzhalter da. Keine Wiederholung: ein Fehler stünde sonst erst nach
        drei Versuchen da. Kein Nachladen beim Zurückkehren ins Fenster oder
        nach dem Wiederverbinden: das täte die App bisher auch nicht, und eine
        Zahl, die sich ohne Zutun ändert, ist genau das Springen, um das es
        geht.
      */
      networkMode: 'always',
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Beim Wiederkommen sofort der letzte Stand — und im Hintergrund frisch geholt.
      staleTime: 0,
      gcTime: AUFBEWAHREN_MS,
    },
  },
});

/**
 * Der Schlüssel einer Abfrage: Name, Benutzer, Betrieb, dann was sie sonst
 * bestimmt. Benutzer und Betrieb stehen immer an zweiter und dritter Stelle —
 * beim Wechsel des Benutzers erkennt der Speicher daran, was einem anderen
 * gehört. Und eine Antwort unter dem Schlüssel des alten Benutzers kann dem
 * neuen nie gezeigt werden.
 */
export function schluessel(
  name: string,
  wer: { uid: string; companyId: string },
  ...rest: unknown[]
): QueryKey {
  return [name, wer.uid, wer.companyId, ...rest];
}

// Beim Wechsel des Benutzers: was einem anderen gehört, geht auch hier weg.
beimNutzerwechsel((wer) => {
  abfrageSpeicher.removeQueries({ predicate: (q) => `${String(q.queryKey[1])}@${String(q.queryKey[2])}` !== wer });
});

/** Alles weg — für die Prüfungen. */
export function zwischenspeicherLeeren(): void {
  liveLeeren();
  abfrageSpeicher.clear();
}

/**
 * `useQuery` auf dem Speicher der App. Ohne eigenen Provider: so braucht keine
 * Ansicht und keine Prüfung einen Umbau, nur weil eine Seite zwischenspeichert.
 */
export function useZwischengespeichert<T>(
  optionen: UseQueryOptions<T, Error, T, QueryKey>,
): UseQueryResult<T, Error> {
  return useQuery(optionen, abfrageSpeicher);
}
