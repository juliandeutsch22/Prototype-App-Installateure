/**
 * Was beide Datenquellen gemeinsam haben — und das ist genau eine Sache.
 *
 * WARUM DIESE DATEI BLEIBT, OBWOHL SIE FAST LEER IST. Zwanzig Ansichten
 * importieren `WithId` von hier. Sie umzustellen wäre die einzige Änderung
 * ausserhalb der Datenschicht in dieser ganzen Stufe gewesen — und die Zusage
 * lautet, dass keine Ansicht angefasst wird.
 *
 * WAS FRÜHER HIER STAND, liegt jetzt in `fs/core.ts`: die Firestore-Helfer
 * (`queryTenant`, `createInTenant` und die durchgereichten Bausteine des
 * SDK). Sie gehören zur Firestore-Seite und nicht in die Mitte; solange sie
 * hier standen, zog jede Ansicht, die nur `WithId` brauchte, das
 * Firestore-SDK in ihren Typgraphen.
 *
 * Das Gegenstück auf der Postgres-Seite ist `pg/kern.ts`. Beide benutzen
 * DIESE Kennung, damit es nicht zwei gibt, die zufällig gleich aussehen.
 */

/** Ein Datensatz samt seiner Kennung. */
export type WithId<T> = T & { id: string };
