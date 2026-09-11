/**
 * Schreiben ohne Empfang — das, was Firestore geschenkt hat und Postgres nicht.
 *
 * FIRESTORE nahm einen Schreibvorgang offline in einen lokalen Zwischenspeicher,
 * sendete ihn selbsttätig nach und meldete eine späte Ablehnung. Genau darauf
 * steht diese App: der Monteur bucht seine Zeit im Keller, im Rohbau, in der
 * Tiefgarage. SUPABASE tut davon nichts — ohne Netz scheitert der Aufruf.
 *
 * Diese Datei baut die fehlende Eigenschaft nach. Sie ist bewusst frei von
 * Supabase- und Browser-Bezügen: das Lager und der Sender werden hineingereicht.
 * Dadurch lässt sich jede Regel hier gegen einen erfundenen Server prüfen, und
 * derselbe Code trägt später im Browser wie im Test.
 *
 * Die vier Eigenschaften, auf die es ankommt, und warum:
 *
 *   1. DIE KENNUNG KOMMT VOM GERÄT. Nur wenn der Monteur die Kennung seiner
 *      Zeile schon kennt, bevor der Server sie bestätigt hat, darf derselbe
 *      Vorgang zweimal ankommen, ohne zweimal zu landen. Ohne das gibt es kein
 *      gefahrloses Nachsenden — nur Raten.
 *
 *   2. „VORGEMERKT" WIRD ERST GESAGT, WENN ES STIMMT. Schlägt schon das Ablegen
 *      im Lager fehl, ist der Vorgang verloren; dann muss ein Fehler kommen und
 *      keine Beruhigung. Eine falsche Bestätigung ist schlimmer als eine
 *      ehrliche Fehlermeldung.
 *
 *   3. EINE ABLEHNUNG ERREICHT DEN MONTEUR, AUCH MINUTEN SPÄTER. Der Server
 *      kann einen vorgemerkten Vorgang am Ende verweigern — eine Regel, die
 *      nicht greift, ein inzwischen gesperrtes Konto. Solche Vorgänge sind
 *      endgültig verloren. Sie zu verschlucken hiesse, dass der Monteur eine
 *      Bestätigung bekommt und nie erfährt, dass seine Buchung fehlt.
 *
 *   4. DIE REIHENFOLGE BLEIBT. „Anlegen" und das spätere „Ändern" derselben
 *      Zeile dürfen sich nicht überholen. Deshalb hält das Nachsenden beim
 *      ersten Vorgang an, der nicht durchgeht, statt den Rest vorzuziehen.
 */

/** Wie heute: bestätigt oder vorgemerkt. */
export type WriteOutcome = 'confirmed' | 'queued';

export type Schreibart = 'anlegen' | 'aendern';

/** Ein vorgemerkter Schreibvorgang. */
export interface Vormerkung {
  /** Kennung der VORMERKUNG — fortlaufend, bestimmt die Reihenfolge. */
  folge: number;
  /** Kennung der ZEILE. Sie macht das Nachsenden wiederholbar. */
  zeile: string;
  tabelle: string;
  art: Schreibart;
  daten: Record<string, unknown>;
  /** Nur bei unklarem Ausgang hochgezählt, nie bei fehlendem Netz. */
  versuche: number;
  angelegt: number;
}

export type Sendeergebnis =
  /** Der Server hat bestätigt. */
  | { art: 'ok' }
  /**
   * Der Server hat verweigert — Zeilenschutz, Beschränkung, gesperrtes Konto.
   * Endgültig: ein zweiter Versuch ändert daran nichts.
   */
  | { art: 'abgelehnt'; grund: string }
  /** Nichts ist angekommen. Kein Grund, irgendetwas aufzugeben. */
  | { art: 'kein-netz' }
  /**
   * Der Server hat geantwortet, aber unbrauchbar (Serverfehler,
   * Zeitüberschreitung). Ob der Vorgang angekommen ist, weiss niemand — und
   * genau deshalb ist Eigenschaft 1 die Bedingung für einen zweiten Versuch.
   */
  | { art: 'unklar'; grund: string };

export type Sender = (v: Vormerkung) => Promise<Sendeergebnis>;

/** Das dauerhafte Lager. Im Browser IndexedDB, im Test eine Karte. */
export interface Lager {
  alle(): Promise<Vormerkung[]>;
  ablegen(v: Vormerkung): Promise<void>;
  entfernen(folge: number): Promise<void>;
  ersetzen(v: Vormerkung): Promise<void>;
  naechsteFolge(): Promise<number>;
}

/**
 * Wie oft ein unklarer Ausgang wiederholt wird, bevor er als Ablehnung gilt.
 *
 * Ohne Obergrenze bliebe eine vergiftete Zeile für immer vorn in der
 * Warteschlange liegen und hielte alles dahinter auf — der Monteur sähe nie
 * wieder eine seiner Buchungen ankommen und erführe auch nicht, warum.
 */
export const VERSUCHE_GRENZE = 5;

export type Melder = (fehler: { zeile: string; tabelle: string; grund: string }) => void;

let melder: Melder | null = null;

/** Einmal beim Start setzen. `null` meldet ab. */
export function beiVormerkungFehlgeschlagen(cb: Melder | null): void {
  melder = cb;
}

function melden(zeile: string, tabelle: string, grund: string): void {
  try {
    melder?.({ zeile, tabelle, grund });
  } catch {
    // Ein Fehler in der Meldung darf den Nachsendelauf nicht mitreissen.
  }
}

/** Meldungstext für einen vorgemerkten Schreibvorgang. */
export function vorgemerktMeldung(was: string): string {
  return `${was} — ohne Verbindung gespeichert, wird automatisch gesendet.`;
}

export interface Auftrag {
  tabelle: string;
  art: Schreibart;
  /** Die vom Gerät vergebene Kennung der Zeile. */
  zeile: string;
  daten: Record<string, unknown>;
}

/** Meldet der Browser gar keine Verbindung? */
function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Schreibt, und merkt vor, wenn nicht anders möglich.
 *
 * Wirft nur dann, wenn der Vorgang WIRKLICH verloren ist: der Server hat ihn
 * abgelehnt, oder er liess sich nicht einmal vormerken.
 */
export async function schreiben(
  auftrag: Auftrag,
  lager: Lager,
  sender: Sender,
  istOffline: () => boolean = offline,
): Promise<WriteOutcome> {
  const v: Vormerkung = {
    folge: 0, // wird beim Vormerken vergeben
    zeile: auftrag.zeile,
    tabelle: auftrag.tabelle,
    art: auftrag.art,
    daten: auftrag.daten,
    versuche: 0,
    angelegt: Date.now(),
  };

  // Steht schon beim Absenden fest, dass keine Verbindung besteht, gibt es
  // nichts zu versuchen. Vier Sekunden Kreisel wären hier reine Schikane.
  if (istOffline()) {
    await vormerken(v, lager);
    return 'queued';
  }

  // Liegt schon etwas im Fach, MUSS der neue Vorgang dahinter — sonst überholt
  // ein „Ändern" das „Anlegen", auf das es sich bezieht.
  const wartendes = await lager.alle();
  if (wartendes.length > 0) {
    await vormerken(v, lager);
    return 'queued';
  }

  const ergebnis = await sender(v);
  if (ergebnis.art === 'ok') return 'confirmed';
  if (ergebnis.art === 'abgelehnt') throw new Error(ergebnis.grund);

  await vormerken(v, lager);
  return 'queued';
}

/**
 * Legt ab und gibt erst dann Entwarnung.
 *
 * Scheitert das Lager selbst — kein Platz, privater Modus, gesperrter Speicher
 * —, dann ist der Vorgang weg. Das muss der Aufrufer erfahren.
 */
async function vormerken(v: Vormerkung, lager: Lager): Promise<void> {
  const folge = await lager.naechsteFolge();
  await lager.ablegen({ ...v, folge });
}

export interface Bericht {
  gesendet: number;
  abgelehnt: number;
  /** Liegt noch etwas im Fach? */
  offen: number;
}

/**
 * Sendet nach, was im Fach liegt — in der Reihenfolge, in der es hineinkam.
 *
 * Hält beim ersten Vorgang an, der nicht durchgeht. Das ist Absicht: wer bei
 * fehlendem Netz weitermacht, schickt nur Fehlschläge hinterher, und wer eine
 * unklare Antwort überspringt, dreht die Reihenfolge um.
 */
export async function nachsenden(lager: Lager, sender: Sender): Promise<Bericht> {
  const warteschlange = (await lager.alle()).sort((a, b) => a.folge - b.folge);
  let gesendet = 0;
  let abgelehnt = 0;

  /**
   * Was beim Aufgeben mit weggeräumt wurde.
   *
   * Die Schleife läuft über einen ABZUG der Warteschlange; eine Ablehnung
   * entfernt aber auch Nachfolger, die in diesem Abzug noch stehen. Ohne
   * diese Merkliste würde eine gerade verworfene Zeile gleich darauf doch
   * gesendet — und der Monteur bekäme eine Buchung, von der er eben die
   * Meldung erhalten hat, dass sie verloren ist.
   */
  const verworfen = new Set<number>();

  for (const v of warteschlange) {
    if (verworfen.has(v.folge)) continue;
    const ergebnis = await sender(v);

    if (ergebnis.art === 'ok') {
      await lager.entfernen(v.folge);
      gesendet += 1;
      continue;
    }

    if (ergebnis.art === 'kein-netz') break;

    if (ergebnis.art === 'unklar') {
      const versucht = { ...v, versuche: v.versuche + 1 };
      if (versucht.versuche < VERSUCHE_GRENZE) {
        await lager.ersetzen(versucht);
        break;
      }
      abgelehnt += await aufgeben(v, lager, `${ergebnis.grund} (nach ${VERSUCHE_GRENZE} Versuchen)`, verworfen);
      continue;
    }

    abgelehnt += await aufgeben(v, lager, ergebnis.grund, verworfen);
  }

  const offen = (await lager.alle()).length;
  return { gesendet, abgelehnt, offen };
}

/**
 * Gibt einen Vorgang auf — und mit ihm alles, was auf derselben Zeile
 * dahinter wartet.
 *
 * WARUM DIE NACHFOLGER MIT. Wird das „Anlegen" abgelehnt, muss das „Ändern"
 * derselben Zeile zwangsläufig auch scheitern. Beide einzeln zu melden wäre
 * zwei Meldungen für einen Fehler; das zweite stillschweigend liegen zu lassen
 * wäre eine Warteschlange, die nie leer wird.
 */
async function aufgeben(
  v: Vormerkung,
  lager: Lager,
  grund: string,
  verworfen: Set<number>,
): Promise<number> {
  const betroffen = (await lager.alle()).filter(
    (x) => x.zeile === v.zeile && x.tabelle === v.tabelle && x.folge >= v.folge,
  );
  for (const x of betroffen) {
    await lager.entfernen(x.folge);
    verworfen.add(x.folge);
  }
  melden(v.zeile, v.tabelle, grund);
  return betroffen.length;
}
