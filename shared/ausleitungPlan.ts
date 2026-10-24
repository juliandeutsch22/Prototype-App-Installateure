/**
 * Die Entscheidungen der nächtlichen Ausleitung — ohne Firestore, ohne
 * Storage, ohne Firebase.
 *
 * WARUM GETRENNT. Die Ausleitung selbst besteht aus Lesen und Schreiben; was
 * daran schiefgehen kann, ist nicht das Lesen, sondern die Entscheidung
 * *welche Datei wann wieder gelöscht wird*. Ein Aufräumen, das einen Tag zu
 * weit greift, vernichtet genau den Stand, für den die Ausleitung gebaut
 * wurde — und es fällt erst auf, wenn man ihn braucht.
 *
 * Diese Datei importiert nichts, deshalb kann sie ohne Emulator und ohne
 * firebase-admin geprüft werden (`tests/unit/ausleitung.test.ts`). Die Cloud
 * Functions sind sonst ungetestet; hier ist wenigstens das Urteil geprüft,
 * auch wenn es das Schreiben nicht ist.
 */

/** 'YYYY-MM-DD' aus lokalen Komponenten (wie shared/feiertage.localDateStr). */
export function datumsStempel(d: Date): string {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${j}-${m}-${t}`;
}

/** Das Verzeichnis eines Mandanten im Zielspeicher. */
export function ausleitungsPraefix(companyId: string): string {
  return `ausleitung/${companyId}/`;
}

/**
 * Der Pfad eines Laufs.
 *
 * Ein Stand JE TAG, nicht je Lauf: läuft die Ausleitung an einem Tag zweimal
 * (etwa nach einem Fehlschlag von Hand angestoßen), überschreibt der zweite
 * Lauf den ersten, statt eine zweite Datei danebenzulegen. Sonst wüchse der
 * Speicher mit jedem Wiederholungsversuch, und beim Wiederanlauf müsste
 * jemand raten, welche der beiden die vollständige ist.
 */
export function ausleitungsPfad(companyId: string, datum: Date): string {
  return `${ausleitungsPraefix(companyId)}${datumsStempel(datum)}.jsonl`;
}

/**
 * Das Datum aus einem Ausleitungspfad, oder null wenn er nicht dazu passt.
 * Die weiteren Teile eines Stands (`…2026-09-02.<lauf>.teil-2.jsonl`)
 * gehören zu seinem Datum — sie gehen und bleiben mit ihm.
 */
export function datumAusPfad(pfad: string): string | null {
  const treffer = /(\d{4}-\d{2}-\d{2})(?:\.[0-9a-z]+\.teil-\d+)?\.jsonl$/.exec(pfad);
  return treffer ? treffer[1] : null;
}

/**
 * Wie gross ein Teil des Stands ungefähr wird (gezählt in Zeichen).
 *
 * BIS 10.10.2026 GING DER STAND IN EINEM STÜCK hinaus und musste dafür ganz
 * im Speicher der Function liegen; ab 256 MB brach die Ausleitung mit einer
 * Absage ab. Ein unterschriebener Schein trägt zwei Unterschriften zu je
 * rund 70 KB — ein Betrieb mit ein paar tausend Scheinen läge darüber. Jetzt
 * geht der Stand in Teilen hinaus; im Speicher liegen höchstens zwei.
 *
 * 8 MB STATT 32 MB (N1, 24.10.2026). Gemessen mit 288 MB Bestand: bei 32 MB
 * lagen vor jedem Hochladen 113–134 MB im Speicher (erster Teil, laufender
 * Teil, der daraus gefügte Text), das Kodieren fürs Hochladen kam dazu, und
 * beim sechsten Teil schlug die Grenze von 256 MB zu. Mit einem Ziel ausser
 * Haus wird jeder Teil noch zweimal kodiert (Prüfsumme, Hochladen). Bei 8 MB
 * bleibt der Bedarf bei einem Viertel davon — gleich, wie groß der Betrieb ist.
 */
export const TEIL_BYTES = 8 * 1024 * 1024;

/**
 * Wie viele Namen der Speicher je Abfrage höchstens nennt — und wie viele
 * Pfade er je Löschauftrag annimmt.
 */
export const LISTE_SEITE = 1000;

/**
 * Alle Namen unter einem Präfix, Seite für Seite.
 *
 * EINE SEITE REICHT NICHT (N1, 24.10.2026). 30 Tage Aufbewahrung mal die
 * Teile eines großen Betriebs sind schnell über 1.000 Dateien; bisher sah das
 * Aufräumen nur die ersten 1.000 (nach Namen, also die ältesten), und alles
 * dahinter blieb liegen — der Speicher wüchse Nacht für Nacht.
 */
export async function alleNamen(
  seite: (offset: number, limit: number) => Promise<string[]>,
  limit = LISTE_SEITE,
): Promise<string[]> {
  const alle: string[] = [];
  for (let offset = 0; ; offset += limit) {
    const namen = await seite(offset, limit);
    alle.push(...namen);
    if (namen.length < limit) return alle;
  }
}

/** Eine Liste in Blöcke zu höchstens `groesse` — für Löschaufträge. */
export function inBloecken<T>(liste: T[], groesse = LISTE_SEITE): T[][] {
  const bloecke: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) bloecke.push(liste.slice(i, i + groesse));
  return bloecke;
}

/**
 * Der Pfad des Teils `nr` eines Stands.
 *
 * DER ERSTE HEISST WIE BISHER, und er wird ZULETZT geschrieben: er trägt die
 * Zahl der Teile und ist damit die Unterschrift unter den ganzen Stand.
 * Scheitert ein Lauf mittendrin, bleibt der erste Teil des vorigen Laufs
 * unberührt — und mit ihm ein vollständiger Stand.
 *
 * DIE WEITEREN TRAGEN DEN LAUF IM NAMEN, damit ein zweiter Lauf am selben Tag
 * die Teile des ersten nicht überschreibt, bevor er selbst fertig ist.
 */
export function teilPfad(pfad: string, lauf: string, nr: number): string {
  return nr <= 1 ? pfad : pfad.replace(/\.jsonl$/, `.${lauf}.teil-${nr}.jsonl`);
}

/** Ist das ein weiterer Teil (nicht der erste)? Dann mit Lauf und Nummer. */
export function weitererTeil(pfad: string): { lauf: string; nr: number } | null {
  const t = /\.([0-9a-z]+)\.teil-(\d+)\.jsonl$/.exec(pfad);
  return t ? { lauf: t[1], nr: Number(t[2]) } : null;
}

/**
 * Die Kopfzeile eines Teils: `{"sammlung":"_teil","daten":{…}}`.
 *
 * WOZU. Der Rücklauf muss wissen, ob er ALLE Teile EINES Laufs vor sich hat:
 * ein fehlender Teil hiesse ein halber Betrieb, ein Teil aus einem anderen
 * Lauf ein Datensalat. Jeder Teil nennt seinen Lauf und seine Nummer, der
 * erste dazu die Zahl der Teile.
 */
export interface TeilKopf {
  lauf: string;
  nr: number;
  teile?: number;
}
export const TEIL_SAMMLUNG = '_teil';

/**
 * Zeilen in Teile schreiben, jeden mit seiner Kopfzeile.
 *
 * `abgeben(inhalt, nr)` bekommt jeden fertigen Teil und legt ihn hinaus, bevor
 * der nächste entsteht. Der erste bleibt bis zum Schluss im Speicher, weil
 * erst dann feststeht, wie viele Teile es sind — er geht als letzter.
 *
 * IN BYTES (N1, 24.10.2026). Die Ausleitung bekommt die Zeilen seitenweise als
 * fertiges zeilenweises JSON aus der Datenbank und reicht sie unverändert
 * weiter; ein Stück ist dann eine ganze Seite. Gezählt wird in Bytes, so wie
 * der Speicher zählt — vorher in Zeichen, und Umlaute machten einen Teil
 * etwas größer als die Grenze.
 */
export function inTeilen(
  lauf: string,
  grenze: number,
  abgeben: (inhalt: Uint8Array<ArrayBuffer>, nr: number) => Promise<void>,
) {
  const kodierer = new TextEncoder();
  let erster: Uint8Array<ArrayBuffer>[] | null = null;
  let teil: Uint8Array<ArrayBuffer>[] = [];
  let groesse = 0;
  let nr = 1;
  let zeilen = 0;
  let bytes = 0;
  const hinaus = async (n: number, stuecke: Uint8Array<ArrayBuffer>[], teile?: number) => {
    const k: TeilKopf = { lauf, nr: n, ...(teile ? { teile } : {}) };
    const kopf = kodierer.encode(jsonZeile(TEIL_SAMMLUNG, { ...k }));
    const inhalt = new Uint8Array(kopf.byteLength + stuecke.reduce((s, x) => s + x.byteLength, 0));
    inhalt.set(kopf, 0);
    let pos = kopf.byteLength;
    for (const x of stuecke) { inhalt.set(x, pos); pos += x.byteLength; }
    bytes += inhalt.byteLength;
    await abgeben(inhalt, n);
  };
  return {
    /**
     * Ein Stück anhängen — eine Zeile oder mehrere ganze; ist der Teil voll,
     * geht er vorher hinaus. `anzahl` sagt, wie viele Zeilen das Stück trägt.
     */
    async anhaengen(stueck: string | Uint8Array<ArrayBuffer>, anzahl = 1): Promise<void> {
      const b = typeof stueck === 'string' ? kodierer.encode(stueck) : stueck;
      if (groesse > 0 && groesse + b.byteLength > grenze) {
        if (nr === 1) erster = teil;
        else await hinaus(nr, teil);
        teil = [];
        groesse = 0;
        nr += 1;
      }
      teil.push(b);
      groesse += b.byteLength;
      zeilen += anzahl;
    },
    /** Den letzten und danach den ersten Teil hinauslegen. */
    async abschliessen(): Promise<{ teile: number; zeilen: number; bytes: number }> {
      if (nr === 1) {
        await hinaus(1, teil, 1);
      } else {
        await hinaus(nr, teil);
        await hinaus(1, erster ?? [], nr);
      }
      return { teile: nr, zeilen, bytes };
    },
  };
}

/**
 * Darf diese Datei weg?
 *
 * ZWEI SICHERHEITEN, beide absichtlich streng:
 *
 *   1. Was nicht wie ein Ausleitungsstand heißt, wird NIE gelöscht. Läge aus
 *      irgendeinem Grund etwas anderes im Verzeichnis, wäre ein Aufräumen,
 *      das es mitnimmt, ein Datenverlust ohne Ankündigung.
 *   2. Der jüngste Stand bleibt IMMER, auch wenn er älter ist als die
 *      Aufbewahrungsfrist. Ein Betrieb, bei dem die Ausleitung wochenlang
 *      scheitert, hätte sonst am Ende gar keinen Stand mehr — und zwar
 *      ausgerechnet dann, wenn niemand hinsieht. Lieber ein alter Stand als
 *      keiner.
 */
export function abgelaufeneStaende(
  pfade: string[],
  heute: Date,
  tage: number,
): string[] {
  const mitDatum = pfade
    .map((p) => ({ pfad: p, datum: datumAusPfad(p) }))
    .filter((e): e is { pfad: string; datum: string } => e.datum !== null);
  if (mitDatum.length <= 1) return [];

  /*
    DER JÜNGSTE STAND, NICHT DIE JÜNGSTE DATEI. Ein Lauf, der mittendrin
    scheitert, hinterlässt weitere Teile ohne ersten; sie sind kein Stand.
    Zählten sie mit, könnte nach Wochen voller Fehlschläge ausgerechnet der
    letzte vollständige Stand als abgelaufen gelten.
  */
  const vollstaendige = mitDatum.filter((e) => weitererTeil(e.pfad) === null);
  const juengstes = (vollstaendige.length > 0 ? vollstaendige : mitDatum)
    .reduce((a, b) => (a.datum >= b.datum ? a : b)).datum;

  const grenze = new Date(heute);
  grenze.setDate(grenze.getDate() - tage);
  const grenzStempel = datumsStempel(grenze);

  return mitDatum
    .filter((e) => e.datum < grenzStempel && e.datum !== juengstes)
    .map((e) => e.pfad);
}

/**
 * Eine Zeile im Ausleitungsstand.
 *
 * Zeilenweises JSON (NDJSON) und nicht EIN grosses Objekt: so lässt sich der
 * Stand schreiben und wieder einlesen, ohne ihn je vollständig im Speicher zu
 * halten. Bei 15.660 Zeiteinträgen ist das der Unterschied zwischen „läuft"
 * und „bricht ohne Meldung ab".
 */
export function jsonZeile(sammlung: string, zeile: Record<string, unknown>): string {
  return `${JSON.stringify({ sammlung, daten: zeile })}\n`;
}

/**
 * Die Sortierung, nach der eine Tabelle seitenweise gelesen wird — als
 * PostgREST-Parameter `order`.
 *
 * OHNE SORTIERUNG IST BLÄTTERN EIN GLÜCKSSPIEL (Prüflauf 25.09.2026, P3-16).
 * `Range: 0-499` und danach `500-999` sagen nur, WIE VIELE Zeilen kommen,
 * nicht WELCHE: ohne `order` darf die Datenbank sie bei jeder Abfrage anders
 * reihen, und dann fehlt eine Zeile im Stand, während eine andere zweimal
 * darin steht. Sortiert wird deshalb nach dem Primärschlüssel — der ist
 * eindeutig, also steht jede Zeile an genau einer Stelle.
 *
 * Ohne bekannten Schlüssel `null`: dann bleibt es beim Lesen ohne Ordnung,
 * wie bisher — lieber ein Stand als keiner.
 */
export function ordnungNachSchluessel(spalten: readonly string[] | undefined): string | null {
  if (!spalten || spalten.length === 0) return null;
  return spalten.map((s) => `${s}.asc`).join(',');
}

/**
 * Eine Tabelle vollständig lesen, Seite für Seite.
 *
 * ZU ENDE IST SIE, WENN EINE SEITE LEER ZURÜCKKOMMT — nicht, wenn eine
 * kürzer ist als erbeten. Der Server kappt jede Antwort bei seinem eigenen
 * Höchstwert (`max_rows`); liegt der unter der erbetenen Seitengrösse, ist
 * JEDE Seite „kürzer", und das alte `if (zeilen.length < SEITE) break`
 * hörte nach der ersten auf. Weitergezählt wird deshalb um das, was
 * tatsächlich kam. Das kostet je Tabelle eine leere Abfrage am Ende.
 *
 * `holen(von, bis)` liefert die Zeilen `von` bis `bis` (beide einschliesslich)
 * in einer festen Ordnung; `jeZeile` bekommt jede genau einmal. Zurück kommt
 * die Zahl der gelesenen Zeilen.
 */
export async function alleSeitenLesen<T>(
  holen: (von: number, bis: number) => Promise<T[]>,
  seite: number,
  jeZeile: (zeile: T) => void,
): Promise<number> {
  let von = 0;
  for (;;) {
    const zeilen = await holen(von, von + seite - 1);
    if (zeilen.length === 0) return von;
    for (const z of zeilen) jeZeile(z);
    von += zeilen.length;
  }
}
