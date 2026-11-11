/**
 * WO DIE LEISTE STEHT (E77, 11.11.2026) — „die Leiste darf den Text nicht
 * verdecken“.
 *
 * Gesucht wird ein freier Platz in der Nähe der Blase, in dieser Reihenfolge:
 * daneben auf der freien Seite (oben bündig, dann unten bündig), erst als
 * eine Zeile, dann zweizeilig (Reaktionen oben, Handlungen darunter); dann
 * über und unter der Blase auf der Seite des Absenders. Frei heißt: kein
 * Hindernis (Blasen, Reaktionen, Tageszeilen, Namen, Zustand) wird berührt,
 * und die Leiste liegt ganz im sichtbaren Teil des Verlaufs.
 *
 * Findet sich nichts — am Tablet die Regel, am Schreibtisch bei langen
 * Zeilen zwischen fremden Blasen —, gibt es `null`: dann rückt der Verlauf
 * auseinander und die Leiste bekommt eine eigene Zeile (`Gespraech.tsx`).
 * Verdecken ist nie die Lösung.
 */

export interface Kasten { links: number; oben: number; rechts: number; unten: number }
export interface Groesse { breite: number; hoehe: number }
export interface Platz { links: number; oben: number; zeilen: 1 | 2 }

/** Abstand zur Blase und zu jedem Hindernis. */
export const LEISTE_ABSTAND = 6;

const schneidet = (a: Kasten, b: Kasten, rand: number) =>
  a.links < b.rechts + rand && a.rechts > b.links - rand && a.oben < b.unten + rand && a.unten > b.oben - rand;

export function leistenPlatz({
  blatt,
  zeile,
  eigene,
  eine,
  zwei,
  hindernisse,
  grenze,
}: {
  /** Die Blase selbst. */
  blatt: Kasten;
  /** Alles, was zur Nachricht gehört (Blase und Reaktionen) — darunter beginnt „unter der Blase“. */
  zeile: Kasten;
  /** Die eigenen stehen rechts, frei ist links; bei den anderen umgekehrt. */
  eigene: boolean;
  eine: Groesse;
  zwei: Groesse;
  hindernisse: readonly Kasten[];
  /** Der sichtbare Teil des Verlaufs. */
  grenze: Kasten;
}): Platz | null {
  const a = LEISTE_ABSTAND;
  const kandidaten: Platz[] = [];
  for (const [g, zeilen] of [[eine, 1], [zwei, 2]] as const) {
    const links = eigene ? blatt.links - a - g.breite : blatt.rechts + a;
    kandidaten.push({ links, oben: blatt.oben, zeilen }, { links, oben: blatt.unten - g.hoehe, zeilen });
  }
  const buendig = eigene ? blatt.rechts - eine.breite : blatt.links;
  kandidaten.push({ links: buendig, oben: blatt.oben - a - eine.hoehe, zeilen: 1 }, { links: buendig, oben: zeile.unten + a, zeilen: 1 });

  for (const k of kandidaten) {
    const g = k.zeilen === 1 ? eine : zwei;
    const kasten: Kasten = { links: k.links, oben: k.oben, rechts: k.links + g.breite, unten: k.oben + g.hoehe };
    const drin = kasten.links >= grenze.links && kasten.rechts <= grenze.rechts && kasten.oben >= grenze.oben && kasten.unten <= grenze.unten;
    // Die eigene Blase ist ein Hindernis wie jedes andere: die Leiste liegt nie auf ihr.
    if (drin && !schneidet(kasten, blatt, 2) && !hindernisse.some((h) => schneidet(kasten, h, 2))) return k;
  }
  return null;
}

/** Ein `DOMRect` als Kasten. */
export const alsKasten = (r: DOMRect | DOMRectReadOnly): Kasten => ({ links: r.left, oben: r.top, rechts: r.right, unten: r.bottom });
