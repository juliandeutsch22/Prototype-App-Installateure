import { forwardRef, type CSSProperties } from 'react';
import { REAKTIONEN, REAKTION_NAME, type Nachricht, type Reaktion, type Reaktionszeichen } from '@/lib/db/nachrichten';
import Icon from '@/components/Icon';
import { HANDLUNGEN, type Handlung, type Moeglichkeiten } from './moeglichkeiten';
import { reaktionText, wer } from './reaktionen';

const meine = (n: Nachricht, z: Reaktionszeichen) => !!n.reaktionen.find((r) => r.zeichen === z)?.meine;

/**
 * DIE LEISTE BEIM DARÜBERFAHREN (E77, 11.11.2026; Konzept Variante A):
 * vorne die sechs Reaktionen, nach einer Linie die Handlungen als Zeichen.
 * Jedes nennt beim Darüberfahren seinen Namen (`title`) und der
 * Vorlesehilfe (`aria-label`). „Bearbeiten“ und „Melden“ öffnen danach ihr
 * Formular, „Löschen“ fragt nach, „Text kopieren“ kopiert sofort.
 *
 * Eckig wie jedes Blatt der Linie, ohne Schatten: eine Linie rundum. Wo sie
 * steht, entscheidet `leistenPlatz` — sie verdeckt nie Text.
 */
export const NachrichtLeiste = forwardRef<HTMLDivElement, {
  n: Nachricht;
  m: Moeglichkeiten;
  zeilen: 1 | 2;
  /** Frei schwebend (`absolute`) oder in einer eigenen Zeile des Verlaufs. */
  schwebend: boolean;
  /** In eigener Zeile: über oder unter der Blase. */
  seite: 'oben' | 'unten';
  /** Für den Finger (E79): 44-px-Ziele, in der schwebenden Leiste nach langem Drücken. */
  gross?: boolean;
  /** Die Maus auf der Leiste hält sie offen (E79: sonst geht sie mit der Maus von der Blase). */
  onZeigerHinein?: () => void;
  onZeigerHinaus?: () => void;
  style?: CSSProperties;
  onReagieren: (z: Reaktionszeichen, an: boolean) => void;
  onHandlung: (h: Handlung) => void;
}>(function NachrichtLeiste({ n, m, zeilen, schwebend, seite, gross = false, style, onReagieren, onHandlung, onZeigerHinein, onZeigerHinaus }, ref) {
  const handlungen = HANDLUNGEN.filter((h) => m[h.art]);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={`Zur Nachricht von ${n.eigene ? 'dir' : n.vonName}`}
      className="nachricht-leiste"
      data-zeilen={zeilen}
      data-schwebend={schwebend ? 'ja' : undefined}
      data-seite={seite}
      data-gross={gross ? 'ja' : undefined}
      onPointerEnter={onZeigerHinein}
      onPointerLeave={onZeigerHinaus}
      style={style}
    >
      {m.reagieren && (
        <div className="leiste-reaktionen">
          {REAKTIONEN.map((z) => (
            <button
              key={z}
              type="button"
              className="leiste-knopf leiste-zeichen"
              aria-label={`Reagieren: ${REAKTION_NAME[z]}`}
              aria-pressed={meine(n, z)}
              title={REAKTION_NAME[z]}
              onClick={() => onReagieren(z, !meine(n, z))}
            >
              <span aria-hidden="true">{z}</span>
            </button>
          ))}
        </div>
      )}
      {handlungen.length > 0 && (
        <div className="leiste-handlungen" data-getrennt={m.reagieren ? 'ja' : undefined}>
          {handlungen.map((h) => (
            <button
              key={h.art}
              type="button"
              className="leiste-knopf"
              data-ton={h.art === 'loeschen' ? 'gefahr' : undefined}
              aria-label={h.name}
              title={h.name}
              onClick={() => onHandlung(h.art)}
            >
              <Icon name={h.icon} size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * DIE REAKTIONEN UNTER DER BLASE: je Zeichen ein kleines weiches Feld mit
 * der Zahl (seit E78 ohne Rahmen). Die eigene ist Petrol-hell; ein Klick darauf nimmt
 * sie zurück, auf eine fremde setzt man dieselbe. Wer reagiert hat, nennt
 * das Darüberfahren (`title`), am Handy das lange Drücken (`onNamen`).
 */
export function ReaktionsKaestchen({
  reaktionen,
  ichUid,
  kannSetzen,
  onUmschalten,
  langDruck,
}: {
  reaktionen: Reaktion[];
  ichUid: string | undefined;
  /** Bei Schreibsperre lässt sich die eigene noch zurücknehmen, aber keine neue setzen. */
  kannSetzen: boolean;
  onUmschalten: (z: Reaktionszeichen, an: boolean) => void;
  langDruck: (r: Reaktion) => Record<string, unknown>;
}) {
  if (reaktionen.length === 0) return null;
  return (
    <div className="nachricht-reaktionen" role="group" aria-label="Reaktionen">
      {reaktionen.map((r) => (
        <button
          key={r.zeichen}
          type="button"
          className="reaktion"
          aria-pressed={r.meine}
          aria-label={`${reaktionText(r, ichUid)}${r.meine ? ' — zurücknehmen' : ''}`}
          title={wer(r, ichUid)}
          // Nicht `disabled`: das lange Drücken (wer hat reagiert) bleibt möglich.
          aria-disabled={!r.meine && !kannSetzen ? true : undefined}
          onClick={() => { if (r.meine || kannSetzen) onUmschalten(r.zeichen, !r.meine); }}
          {...langDruck(r)}
        >
          <span className="reaktion-zeichen" aria-hidden="true">{r.zeichen}</span>
          <span className="reaktion-zahl" aria-hidden="true">{r.anzahl}</span>
        </button>
      ))}
    </div>
  );
}
