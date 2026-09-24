/**
 * Das Fehlerprotokoll lesbar machen — gleiche Fehler zusammen.
 *
 * Ein Absturz nach einem Deploy trifft jeden, der die Ansicht öffnet. Als
 * Liste stünde derselbe Satz vierzigmal untereinander, und der zweite, andere
 * Fehler läge auf Seite drei. Zusammengefasst sieht man, WAS kaputt ist, wie
 * oft, seit welcher Fassung — und ob er seit der letzten noch vorkommt.
 */

export interface ProtokollZeile {
  id: string;
  art: 'absturz' | 'fehler' | 'meldung';
  nachricht?: string | null;
  stapel?: string | null;
  pfad?: string | null;
  fassung?: string | null;
  geraet?: string | null;
  beschreibung?: string | null;
  createdAt?: number;
  /** Wer — im Betrieb der Name, auf der Plattform leer. */
  wer?: string;
  /** Welcher Betrieb — nur auf der Plattform. */
  betrieb?: string;
}

export interface FehlerGruppe {
  schluessel: string;
  art: 'absturz' | 'fehler';
  nachricht: string;
  anzahl: number;
  zuerst: number;
  zuletzt: number;
  fassungen: string[];
  ansichten: string[];
  /** Wie viele verschiedene Personen oder Betriebe betroffen sind. */
  betroffen: number;
  /** Der jüngste Eintrag, für Stapel und Gerät. */
  beispiel: ProtokollZeile;
}

/** Technische Fehler nach Art und Meldung gebündelt, jüngster Vorfall zuerst. */
export function fehlerGruppen(zeilen: ProtokollZeile[]): FehlerGruppe[] {
  const gruppen = new Map<string, FehlerGruppe & { wer: Set<string> }>();
  for (const z of zeilen) {
    if (z.art === 'meldung') continue;
    const nachricht = (z.nachricht ?? '').trim() || '(ohne Meldung)';
    const schluessel = `${z.art}|${nachricht}`;
    const zeit = z.createdAt ?? 0;
    const g = gruppen.get(schluessel);
    const person = z.betrieb ?? z.wer ?? '';
    if (!g) {
      gruppen.set(schluessel, {
        schluessel,
        art: z.art,
        nachricht,
        anzahl: 1,
        zuerst: zeit,
        zuletzt: zeit,
        fassungen: z.fassung ? [z.fassung] : [],
        ansichten: z.pfad ? [z.pfad] : [],
        betroffen: 0,
        beispiel: z,
        wer: new Set(person ? [person] : []),
      });
      continue;
    }
    g.anzahl += 1;
    if (zeit < g.zuerst) g.zuerst = zeit;
    if (zeit > g.zuletzt) {
      g.zuletzt = zeit;
      g.beispiel = z;
    }
    if (z.fassung && !g.fassungen.includes(z.fassung)) g.fassungen.push(z.fassung);
    if (z.pfad && !g.ansichten.includes(z.pfad)) g.ansichten.push(z.pfad);
    if (person) g.wer.add(person);
  }
  return [...gruppen.values()]
    .map(({ wer, ...g }) => ({ ...g, betroffen: wer.size }))
    .sort((a, b) => b.zuletzt - a.zuletzt);
}

/** Die von Hand gemeldeten Probleme, jüngste zuerst. */
export function meldungen(zeilen: ProtokollZeile[]): ProtokollZeile[] {
  return zeilen
    .filter((z) => z.art === 'meldung')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
