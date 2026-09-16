/**
 * Die offenen Posten für die Abzeichen im Menü — auf Postgres.
 *
 * EINE ABFRAGE UND NICHT DREI. Die Zahlen werden bei jedem Seitenwechsel
 * geholt; als drei Abfragen wären das drei Umläufe je Klick, auf dem
 * Baustellen-Telefon über Mobilfunk. Die Rolleneingrenzung steht dabei
 * SERVERSEITIG (`public.offene_posten`) und nicht hier: ein Monteur soll die
 * offenen Urlaubsanträge nicht erst geliefert bekommen und dann von der
 * Oberfläche weggerechnet.
 */
import { derClient } from './kern';

export interface OffenePosten {
  /** Urlaubsanträge, die auf eine Entscheidung warten. */
  urlaub: number;
  /** Materialanforderungen im Zustand „Offen". */
  anforderungen: number;
  /** Rechnungen, bei denen heute eine Mahnung fällig wäre. */
  mahnungen: number;
}

/**
 * Was gerade offen ist — oder `undefined`, wenn es sich nicht sagen lässt.
 *
 * `undefined` HEISST „NICHT BEKANNT" UND NICHT „NICHTS OFFEN". Der
 * Unterschied ist der ganze Punkt: bei einem Fehler eine Null einzusetzen
 * wäre bequem und wäre eine Aussage, die niemand geprüft hat. Das Menü zeigt
 * dann gar kein Abzeichen — ein fehlender Hinweis ist ehrlicher als ein
 * falscher.
 *
 * `heute` kommt vom Aufrufer und nicht aus der Datenbank: die rechnet in UTC,
 * gearbeitet wird in Österreich. Der Mahnlauf nimmt aus demselben Grund
 * `todayStr()` — so zählt das Abzeichen denselben Tag, den die Liste zeigt.
 */
export async function ladeOffenePosten(heute: string): Promise<OffenePosten | undefined> {
  try {
    const { data, error } = await derClient()
      .rpc('offene_posten', { p_heute: heute })
      .maybeSingle();
    if (error || !data) return undefined;
    const z = data as Record<string, unknown>;
    return {
      urlaub: zahl(z.urlaub),
      anforderungen: zahl(z.anforderungen),
      mahnungen: zahl(z.mahnungen),
    };
  } catch {
    return undefined;
  }
}

/**
 * `count(*)` ist in Postgres ein `bigint`, und PostgREST liefert `bigint` als
 * ZEICHENKETTE aus — eine Zahl über 2^53 wäre in JavaScript sonst nicht mehr
 * genau. `"3" + 1` ergäbe hier `"31"`; deshalb wird umgewandelt und nicht
 * angenommen.
 */
function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
