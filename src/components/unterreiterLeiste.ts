import { createContext, type ReactNode } from 'react';

/*
  DIE REITERLEISTE EINER UNTERSEITE STEHT UNTER DEREN SEITENKOPF (31.10.2026).
  Vorher stand sie darüber: in den Einstellungen begann die Überschrift
  dadurch 117 px tiefer als auf jeder anderen Seite, und beim Wechsel der
  Unterseite sprang der Titel unter einer Leiste hin und her. `Unterreiter`
  reicht die Leiste hierüber an den Seitenkopf der Unterseite; meldet sich
  keiner an (eine Unterseite ohne Kopf), zeichnet sie `Unterreiter` selbst.
*/
export const UnterreiterLeiste = createContext<ReactNode>(null);

/** Der Seitenkopf meldet sich an; zurück kommt die Abmeldung. */
export const UnterreiterAnmeldung = createContext<(() => () => void) | null>(null);
