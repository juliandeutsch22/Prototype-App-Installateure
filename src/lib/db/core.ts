/**
 * Was beide Datenquellen gemeinsam haben — und das ist genau eine Sache.
 *
 * WARUM DIESE DATEI BLEIBT, OBWOHL SIE FAST LEER IST. Zwanzig Ansichten
 * importieren `WithId` von hier. Sie umzustellen wäre die einzige Änderung
 * ausserhalb der Datenschicht in dieser ganzen Stufe gewesen — und die Zusage
 * lautet, dass keine Ansicht angefasst wird.
 *
 * WAS FRÜHER HIER STAND, sind die Firestore-Helfer (`queryTenant`,
 * `createInTenant` und die durchgereichten Bausteine des SDK). Solange sie
 * hier standen, zog jede Ansicht, die nur `WithId` brauchte, das
 * Firestore-SDK in ihren Typgraphen; mit Stufe 9 sind sie ganz weg.
 *
 * Die Arbeit macht heute `pg/kern.ts`. Diese Kennung bleibt hier, damit es
 * nicht zwei gibt, die zufällig gleich aussehen.
 */

/** Ein Datensatz samt seiner Kennung. */
export type WithId<T> = T & { id: string };
