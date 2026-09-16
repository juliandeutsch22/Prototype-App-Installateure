/**
 * Steht die Live-Verbindung — und darf man der Anzeige gerade glauben?
 *
 * WARUM DAS NICHT IN DER ANSICHT STEHT, sondern hier.
 *
 * Bisher meldete jedes Abonnement seinen Abriss über `onError` an die
 * Ansicht, die ihn abonniert hatte. Das hatte drei Folgen, und alle drei
 * waren im Betrieb zu sehen:
 *
 *   1. DIE MELDUNG GING NIE WIEDER WEG. Die Ansicht setzte `error`; der
 *      geglückte Wiederaufbau rief den Erfolgsrückruf, und der räumte den
 *      Fehler nicht weg. Ein kurzer Blick in einen anderen Browser-Tab
 *      hinterliess also einen roten Kasten, der bis zum Neuladen stand —
 *      obwohl die Verbindung längst wieder da war.
 *   2. SIE VERDECKTE DIE DATEN. `error` ersetzt in den meisten Ansichten den
 *      ganzen Inhalt. Die Liste war noch da und noch richtig; zu sehen war
 *      sie trotzdem nicht.
 *   3. SIE SPRACH VOM FALSCHEN GEGENSTAND. „Die Live-Verbindung für
 *      time_entries steht nicht (CLOSED)" nennt einen Tabellennamen und einen
 *      Zustandscode — beides Innenleben. Und sie tat so, als wäre es ein
 *      Problem DIESER Liste, dabei hängen alle Abonnements der App an
 *      derselben einen WebSocket-Verbindung.
 *
 * EIN ZUSTAND FÜR DIE GANZE APP, an einer Stelle gehalten. Eine Ansicht kann
 * ihn damit nicht vergessen zurückzusetzen; sie kommt gar nicht mehr daran.
 * Was hier steht, ist keine Fehlermeldung, sondern ein Vorbehalt: die
 * angezeigten Zahlen sind womöglich nicht mehr die neuesten.
 *
 * WAS HIER NICHT HINEINGEHÖRT: ein gescheitertes LADEN. Das ist ein Fehler
 * dieser einen Ansicht, er betrifft ihre Daten, und er gehört dorthin, wo die
 * Daten stehen sollten. Den Weg dafür gibt es weiterhin (`onError`).
 */

type Horcher = (steht: boolean) => void;

/**
 * Die Abonnements, die GERADE NICHT stehen — je eines mit eigenem Schlüssel.
 *
 * Eine Menge und keine Zahl: ein Abonnement, das zweimal „weg" meldet, darf
 * den Zähler nicht zweimal hochsetzen, sonst kommt die Anzeige nie wieder
 * herunter. Und ein Abonnement, das beim Verlassen der Ansicht abgeräumt
 * wird, muss seinen Eintrag mitnehmen können.
 */
const unterbrochen = new Set<string>();
const horcher = new Set<Horcher>();

/** Steht alles? */
export function verbindungSteht(): boolean {
  return unterbrochen.size === 0;
}

function verkuenden(vorher: boolean): void {
  const jetzt = verbindungSteht();
  if (jetzt === vorher) return;
  /*
    ÜBER DIE MENGE SELBST, nicht über eine Kopie. Hier stand erst `[...horcher]`
    mit der Begründung, ein Horcher, der sich mitten in der Runde abmeldet,
    risse die Schleife ab — das ist nachgemessen FALSCH: das Entfernen eines
    bereits besuchten Eintrags stört die Iteration einer `Set` nicht. Die
    Kopie hätte sogar geschadet: sie riefe einen Horcher noch auf, den ein
    anderer in derselben Runde abgemeldet hat.
  */
  for (const h of horcher) h(jetzt);
}

/**
 * Ein Abonnement meldet seinen Zustand.
 *
 * Gemeldet wird erst, wenn der Wiederaufbau aufgegeben hat — ein einzelner
 * Abriss ist der Normalfall und keine Nachricht wert. Die Entscheidung
 * darüber trifft `kanalHalten`, nicht diese Datei.
 */
export function meldeVerbindung(schluessel: string, steht: boolean): void {
  const vorher = verbindungSteht();
  if (steht) unterbrochen.delete(schluessel);
  else unterbrochen.add(schluessel);
  verkuenden(vorher);
}

/**
 * Ein Abonnement ist weg — mitsamt seinem Urteil.
 *
 * OHNE DIESE ZEILE BLIEBE DER HINWEIS EWIG STEHEN. Wer eine Ansicht mit
 * abgerissenem Abonnement verlässt, nimmt das Abonnement mit; sein „steht
 * nicht" wäre sonst eine Aussage über etwas, das es nicht mehr gibt.
 */
export function vergissVerbindung(schluessel: string): void {
  const vorher = verbindungSteht();
  unterbrochen.delete(schluessel);
  verkuenden(vorher);
}

/** Zusehen, wie sich der Zustand ändert. Gibt das Abmelden zurück. */
export function abonniereVerbindung(h: Horcher): () => void {
  horcher.add(h);
  return () => { horcher.delete(h); };
}

/**
 * Nur für Prüfungen: alles zurück auf Anfang.
 *
 * Der Zustand lebt im Modul und damit über eine einzelne Prüfung hinaus.
 * Ohne diese Zeile entschiede die Reihenfolge der Prüfungen über ihr
 * Ergebnis — der zuverlässigste Weg zu einem Lauf, dem niemand mehr glaubt.
 */
export function verbindungZuruecksetzen(): void {
  unterbrochen.clear();
  horcher.clear();
}
