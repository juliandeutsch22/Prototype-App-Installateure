/**
 * Eine Frist um ein Versprechen legen.
 *
 * WARUM DAS EINE EIGENE DATEI IST. Eine Datenbankabfrage hat **keine
 * Zeitgrenze** — unter Firestore nicht und über `fetch` genauso wenig. Sie
 * wirft keinen Fehler und bricht nicht ab; sie wartet, bis eine Antwort
 * kommt. Ist die Verbindung tot, ohne dass der Client es schon gemerkt hat,
 * wartet der Aufrufer unbegrenzt, und der Benutzer sieht einen Ladebalken
 * ohne Ende.
 *
 * Genau das war zweimal ein gemeldeter Fehler: „der Schein lädt ewig" und
 * „auf dem iPhone lädt es manchmal gar nicht". Beide Male dieselbe Ursache,
 * beide Male an anderer Stelle. Deshalb steht die Frist jetzt hier und nicht
 * noch einmal im nächsten Formular.
 *
 * WANN MAN SIE NICHT BRAUCHT: bei Schreibvorgängen. Ein Schreibvorgang ohne
 * Empfang gehört nicht abgebrochen, sondern vorgemerkt — das erledigt
 * `lib/sync/ausgangsfach.ts`. Eine Frist wäre dort ein Rückschritt: sie
 * verlöre die Buchung, statt sie nachzureichen.
 */

/** Fehler, den eine abgelaufene Frist wirft. Unterscheidbar von echten Fehlern. */
export class FristAbgelaufen extends Error {
  constructor(ms: number) {
    super(`Keine Antwort innerhalb von ${Math.round(ms / 1000)} Sekunden.`);
    this.name = 'FristAbgelaufen';
  }
}

/**
 * Gibt das Ergebnis zurück — oder wirft `FristAbgelaufen`.
 *
 * Der Zeitgeber wird aufgeräumt, auch wenn das Versprechen zuerst fertig
 * wird. Ohne das hielte jeder Aufruf den Ablauf bis zum Ende der Frist am
 * Leben; in einer Liste mit vielen Zeilen summiert sich das.
 */
export function mitFrist<T>(p: Promise<T>, ms = 12000): Promise<T> {
  let uhr: ReturnType<typeof setTimeout>;
  const wecker = new Promise<never>((_, ab) => {
    uhr = setTimeout(() => ab(new FristAbgelaufen(ms)), ms);
  });
  return Promise.race([p, wecker]).finally(() => clearTimeout(uhr)) as Promise<T>;
}

/**
 * Wie `mitFrist`, aber mit einem Ausweichweg statt eines Fehlers.
 *
 * Für den Fall, dass es eine zweitbeste Antwort gibt — etwa den lokalen
 * Zwischenspeicher. Läuft die Frist ab, wird `ausweich()` versucht; scheitert
 * auch das, kommt der ursprüngliche Fehler.
 */
export async function mitFristOder<T>(
  p: Promise<T>,
  ausweich: () => Promise<T>,
  ms = 12000,
): Promise<T> {
  try {
    return await mitFrist(p, ms);
  } catch (e) {
    if (!(e instanceof FristAbgelaufen)) throw e;
    return await ausweich();
  }
}
