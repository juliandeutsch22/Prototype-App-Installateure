import { useEffect, useState } from 'react';
import { fotoAdresse } from '@/lib/db/scheinFotos';
import { groesse } from './fotos';
import type { WorkSheetFoto } from '@/types';

/**
 * Die Fotos eines Scheins, im Büro.
 *
 * WARUM DAS EINE EIGENE KOMPONENTE IST: die Bilder liegen in Firebase
 * Storage, und ihre Adressen müssen einzeln geholt werden. Stünde das in der
 * Liste, holte sie beim Öffnen die Adressen aller Scheine auf einmal — auf
 * einer Baustelle mit halbem Balken ist das keine Liste mehr. So passiert es
 * erst beim Aufklappen eines Scheins, und nur für dessen Bilder.
 *
 * DIE PRÜFSUMME STEHT DABEI. Sie ist der Grund, warum ein Foto überhaupt
 * etwas beweist: die Storage-Datei allein sagt nichts darüber, ob sie noch
 * die ist, die unterschrieben wurde. Wer im Streitfall nachsehen will,
 * braucht die Zeichen, nicht nur das Bild.
 */
export default function Fotostreifen({ fotos }: { fotos: WorkSheetFoto[] }) {
  const [adressen, setAdressen] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let weg = false;
    void Promise.all(
      fotos.map((f) =>
        fotoAdresse(f.pfad)
          .then((url) => [f.pfad, url] as const)
          .catch(() => null),
      ),
    ).then((paare) => {
      if (weg) return;
      const gefunden = paare.filter((p): p is readonly [string, string] => !!p);
      setAdressen(Object.fromEntries(gefunden));
      /*
        Fehlt eine Adresse, ist das eine Aussage und keine Panne: die Datei
        ist nicht mehr da, wo der Schein sie verzeichnet. Genau dieser Fall
        gehört benannt — er ist der Unterschied zwischen „lädt noch" und
        „der Beleg hat ein Loch".
      */
      setFehler(gefunden.length < fotos.length);
    });
    return () => {
      weg = true;
    };
  }, [fotos]);

  return (
    <>
      <span className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f) => {
          const url = adressen[f.pfad];
          return (
            <span key={f.pfad} className="block">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt="Aufnahme vom Einsatz"
                    loading="lazy"
                    className="aspect-square w-full rounded-sm border border-line object-cover"
                  />
                </a>
              ) : (
                <span className="flex aspect-square w-full items-center justify-center rounded-sm border border-line bg-surface-2 text-xs text-ink-muted">
                  …
                </span>
              )}
              <span className="mt-1 block font-mono text-xs text-ink-muted">
                {f.hash.slice(0, 12)}… · {groesse(f.bytes)}
              </span>
            </span>
          );
        })}
      </span>
      {fehler && (
        <span className="mt-1 block text-xs text-warning">
          Mindestens ein Bild liegt nicht mehr dort, wo der Schein es verzeichnet. Die Prüfsumme
          des Scheins weist es weiterhin aus — der Beleg ist damit nicht mehr vollständig belegbar.
        </span>
      )}
    </>
  );
}
