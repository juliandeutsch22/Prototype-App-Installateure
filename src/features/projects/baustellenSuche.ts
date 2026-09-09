import { normProjectNumber } from '@/lib/time';

/**
 * Was ein Suchbegriff in der Baustellenliste meint — und was sich damit
 * serverseitig holen lässt.
 *
 * WARUM ES DAS BRAUCHT. Die Suche filterte den geladenen Bestand: die
 * jüngsten dreihundert. Eine Baustelle von vor vier Jahren war damit nicht zu
 * finden, egal was jemand eintippte. Seit dem 08.09. sagt die Liste
 * wenigstens, dass ihre Grenze greift — aber „weiter laden, bis die von 2022
 * dabei ist" ist keine Suche, sondern Blättern.
 *
 * WARUM NICHT ALLES SERVERSEITIG. Firestore kann keine Volltextsuche. Nach
 * Kundenname oder Adresse liesse sich nur mit einem zusätzlich gepflegten
 * Feld suchen, das auf jedem Altbestand erst nachgetragen werden müsste — und
 * bis dahin fände die Suche alte Baustellen STILLSCHWEIGEND nicht. Genau das
 * Verhalten, das hier verschwinden soll. Ausserdem findet keine dieser
 * Lösungen Treffer in der Wortmitte: „huber" fände „Familie Huber", „uber"
 * nicht mehr — heute findet es beides.
 *
 * Deshalb dieselbe Trennung wie bei den Scheinen, und sie steht auch in der
 * Oberfläche:
 *
 *   Baustellennummer   — serverseitig, exakt, ohne neues Feld
 *   Kunde und Adresse  — nur im geladenen Bestand
 *
 * Das deckt ab, wonach in der Verwaltung tatsächlich gesucht wird, wenn die
 * Baustelle alt ist: nach ihrer Nummer. Sie steht auf dem Schein, auf der
 * Rechnung und im Zeiteintrag.
 */

export type BaustellenSuche =
  | { art: 'nummer'; nummer: string; formen: string[] }
  | { art: 'text' };

/**
 * Wie eine Baustellennummer aussieht: eine vierstellige Jahreszahl, ein
 * Trenner, dann Ziffern.
 *
 * STRENGER ALS BEI DEN SCHEINEN, und das ist Absicht. Dort gilt alles mit
 * einer Ziffer als Nummer, weil eine Scheinsuche sonst kaum je serverseitig
 * liefe. Hier stehen Hausnummern im Bestand — „Grazbachgasse 12" ist ein
 * Adressfragment und keine Baustellennummer, und eine Abfrage danach fände
 * verlässlich nichts.
 */
const NUMMER = /^(?:pr-)?(\d{4})[-/](\d{1,4})$/i;

export function deuteBaustellenSuche(text: string): BaustellenSuche {
  const t = text.trim();
  const treffer = NUMMER.exec(t);
  if (!treffer) return { art: 'text' };

  const nummer = normProjectNumber(t).replace('/', '-');

  /*
    ZWEI SCHREIBWEISEN, EINE ABFRAGE. Altbestände tragen ein führendes „PR-",
    neuere nicht. Firestore vergleicht Zeichenketten genau, also muss die
    Abfrage beide Formen enthalten — sonst findet die Suche ausgerechnet die
    alten Baustellen nicht, um die es hier geht.
  */
  return { art: 'nummer', nummer, formen: [nummer, `PR-${nummer}`] };
}

/** Was die Oberfläche über den Begriff sagt, bevor jemand sucht. */
export function baustellenSuchHinweis(suche: BaustellenSuche): string {
  if (suche.art === 'nummer') {
    return `Auf dem Server nach Baustelle ${suche.nummer} suchen — auch ausserhalb der geladenen Liste.`;
  }
  return 'Nach Kunde und Adresse wird nur im geladenen Bestand gesucht. Eine ältere Baustelle findet sich über ihre Nummer (etwa 2024-031) — die geht auf den Server.';
}
