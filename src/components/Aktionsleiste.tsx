import type { ReactNode } from 'react';

/**
 * Die feste Leiste unten an Formularen (Designlinie „Fassung 3",
 * docs/design/linie.md § 6/8 D).
 *
 * AM TELEFON klebt sie über der Reiterleiste (`--reiter-hoehe` aus
 * Layout.tsx): Summe und Knöpfe bleiben im Blick, egal wie lang das
 * Formular ist — wer unten angekommen ist, muss nicht zurückblättern, um zu
 * sehen, was er gleich bucht. AM SCHREIBTISCH steht sie ohne Fläche
 * rechtsbündig unter dem Formular.
 *
 * `links` ist der Nebenknopf (Abbrechen, Zurück), `rechts` der Hauptknopf;
 * am Telefon im Verhältnis 1:2, damit der Daumen den richtigen trifft.
 */
export default function Aktionsleiste({
  summe,
  links,
  rechts,
}: {
  summe?: { name: ReactNode; wert: ReactNode };
  links?: ReactNode;
  rechts: ReactNode;
}) {
  return (
    <div className="aktionsleiste">
      {summe && (
        <p className="aktionsleiste-summe">
          <span>{summe.name}</span>
          <b>{summe.wert}</b>
        </p>
      )}
      <div className="aktionsleiste-knoepfe">
        {links}
        {rechts}
      </div>
    </div>
  );
}
