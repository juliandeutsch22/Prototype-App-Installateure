/**
 * Der letzte Ausweg, wenn das Übernehmen einer neuen Fassung NICHT greift.
 *
 * WAS AUS DEM BETRIEB GEMELDET WURDE, mehrfach und zuletzt wieder: „bei der
 * am Homescreen gespeicherten Version funktioniert das automatische Updaten
 * immer noch nicht, ich muss sie jedes Mal löschen und neu speichern."
 *
 * WARUM DIE BISHERIGEN VORKEHRUNGEN DAS NICHT LÖSEN KONNTEN. Sie stecken
 * alle IN der App — im Service Worker, in der Prüfung auf `/fassung.txt`, im
 * stillen Übernehmen beim Kaltstart. Läuft auf dem Telefon eine Fassung, die
 * einen Fehler in genau diesem Ablauf hat, dann ist der Weg zur Fassung, die
 * ihn behebt, ausgerechnet über den kaputten Ablauf versperrt. Das Telefon
 * kommt aus eigener Kraft nicht mehr heraus, egal wie oft ausgeliefert wird.
 * Genau das erklärt „jedes Mal löschen und neu speichern": das Löschen vom
 * Startbildschirm ist die einzige Handlung, die den Speicher wirklich räumt.
 *
 * WAS HIER DAGEGEN STEHT, sind zwei Dinge, und sie hängen an keinem der
 * Teile, die versagen können:
 *
 *   1. Ein Knopf, der von Hand tut, was das Löschen und Neuhinzufügen tut —
 *      ohne dass jemand das Symbol vom Startbildschirm werfen muss.
 *   2. Eine selbsttätige Notbremse: wenn die App einen Wechsel VERSUCHT hat
 *      und danach immer noch auf derselben Fassung steht, während der Server
 *      eine andere anbietet, ist der normale Weg bewiesenermaßen kaputt.
 *      Dann wird einmal hart geräumt.
 *
 * WAS DABEI NICHT ANGEFASST WIRD: die Anmeldung und die gespeicherten Daten.
 * Beide liegen in IndexedDB und im lokalen Speicher, nicht im Cache. Geräumt
 * werden nur die vorgehaltenen PROGRAMMDATEIEN — also genau das, was zu alt
 * sein kann. Wer den Knopf drückt, muss sich danach nicht neu anmelden.
 */

/** Von welcher Fassung aus zuletzt ein Wechsel versucht wurde. */
const VERSUCH = 'perl:letzterVersuch';

/** Für welche Fassung bereits hart geräumt wurde — höchstens einmal je Fassung. */
const HART = 'perl:hartErneuert';

/**
 * Der lokale Speicher, oder `null`.
 *
 * Im privaten Fenster wirft schon der ZUGRIFF, nicht erst das Schreiben.
 * Ohne diesen Umweg risse das die ganze Startprüfung mit.
 */
function speicher(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function lesen(schluessel: string): string | null {
  try {
    return speicher()?.getItem(schluessel) ?? null;
  } catch {
    return null;
  }
}

function schreiben(schluessel: string, wert: string | null): void {
  try {
    const s = speicher();
    if (!s) return;
    if (wert === null) s.removeItem(schluessel);
    else s.setItem(schluessel, wert);
  } catch {
    // Voller oder gesperrter Speicher. Dann gibt es eben keine Notbremse —
    // die App läuft weiter wie bisher.
  }
}

/**
 * Merken, dass von DIESER Fassung aus gewechselt werden soll.
 *
 * Der Merker liegt bewusst im LOKALEN Speicher, nicht im Sitzungsspeicher:
 * er muss den Neustart überleben, denn erst danach lässt sich sagen, ob der
 * Wechsel etwas gebracht hat. Ein Sitzungsspeicher überlebt zwar das
 * Neuladen, aber nicht das Beenden der Startbildschirm-App durch iOS — und
 * genau dazwischen liegt der Fall, den es zu erkennen gilt.
 */
export function uebernahmeVormerken(fassung: string): void {
  schreiben(VERSUCH, fassung);
}

/**
 * Beim Start: hat der letzte Wechsel gewirkt?
 *
 * Läuft jetzt eine ANDERE Fassung als die, von der aus gewechselt wurde, war
 * er erfolgreich — dann verfallen beide Merker. Sonst blieben sie liegen und
 * die Notbremse bliebe für immer scharf.
 */
export function uebernahmeAufraeumen(fassung: string): void {
  const versuch = lesen(VERSUCH);
  if (versuch === null || versuch === fassung) return;
  schreiben(VERSUCH, null);
  schreiben(HART, null);
}

/**
 * Steckt die App fest — und darf deshalb JETZT hart geräumt werden?
 *
 * Beide Bedingungen müssen gelten:
 *   — Es wurde von genau dieser Fassung aus ein Wechsel versucht. Ohne einen
 *     gescheiterten Versuch ist der normale Weg nicht widerlegt, und ein
 *     hartes Räumen wäre eine überzogene Antwort auf einen gewöhnlichen
 *     Deploy.
 *   — Für diese Fassung wurde noch nicht geräumt. Diese zweite Bedingung ist
 *     die wichtigere: hilft das Räumen nicht (weil der Fehler woanders
 *     liegt), lädt das Telefon sonst in Dauerschleife neu und ist auf der
 *     Baustelle unbrauchbar. Lieber einmal vergeblich als endlos.
 */
export function darfHartErneuern(fassung: string): boolean {
  if (lesen(VERSUCH) !== fassung) return false;
  if (lesen(HART) === fassung) return false;
  schreiben(HART, fassung);
  return true;
}

/**
 * Alles Vorgehaltene wegräumen und neu starten.
 *
 * DIE REIHENFOLGE IST WICHTIG. Erst wird der Service Worker abgemeldet, dann
 * werden die Speicher gelöscht, erst danach wird geladen. Andersherum könnte
 * der noch zuständige Worker die alte Hülle ein letztes Mal ausliefern — und
 * das Räumen wäre umsonst gewesen.
 *
 * Dass die Speicher leer sind, macht die Frage nach dem genauen Zeitpunkt
 * des Abmeldens nebenbei gegenstandslos: selbst ein Worker, der die
 * Navigation noch beantwortet, findet nichts mehr vorzuhalten und geht ans
 * Netz.
 *
 * Geladen wird IMMER, auch wenn das Abmelden oder Löschen scheitert. Eine
 * App, die auf dem alten Stand stehen bleibt, weil das Aufräumen nicht ganz
 * durchlief, wäre das Gegenteil dessen, was der Knopf verspricht.
 */
export async function appHartErneuern(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const anmeldungen = await navigator.serviceWorker.getRegistrations();
      await Promise.all(anmeldungen.map((a) => a.unregister().catch(() => false)));
    }
  } catch {
    // Kein Worker, keine Berechtigung: dann bleibt das Löschen der Speicher.
  }

  try {
    if (typeof caches !== 'undefined') {
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n).catch(() => false)));
    }
  } catch {
    // Abgeschaltete Website-Daten. Dann gibt es auch nichts Altes.
  }

  window.location.reload();
}
