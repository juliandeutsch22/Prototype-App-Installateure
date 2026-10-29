import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import BottomSheet from './BottomSheet';
import Button from './Button';
import LotZeichnung from './LotZeichnung';
import { dateiGroesse } from '@/lib/dateiGroesse';

/** Eine ausgewählte Datei — mit dem Grund, warum sie nicht hochgeht, oder einem Hinweis. */
export interface AblageDatei {
  id: string;
  datei: File;
  /** Geht nicht hoch (falscher Typ, zu groß, beim Hochladen gescheitert). */
  problem: string | null;
  /** Geht hoch, verdient aber einen Blick (etwa: klingt nach einem Beleg aus dem Büro). */
  hinweis: string | null;
}

/**
 * DOKUMENTE HINZUFÜGEN — erst sammeln, dann hochladen (Konzept „Illustrationen
 * im Arbeitsablauf“, 29.10.2026).
 *
 * Vorher ging eine Datei hoch, sobald sie gewählt war. Wer zehn Pläne auf
 * einmal wählte und einen falschen dabei hatte, erfuhr erst danach davon, und
 * eine versehentlich gewählte Datei lag schon bei den Monteuren. Jetzt steht
 * jede gewählte Datei mit Größe und Zustand in einer Liste, lässt sich
 * entfernen, und erst „Hochladen“ schreibt.
 *
 * DIE ABLAGEFLÄCHE trägt eine durchgezogene Linie, keine gestrichelte (Regel
 * der Linie „Lot“); zieht man Dateien darüber, wird sie petrolfarben. Am
 * Telefon gibt es kein Ziehen — dort sagt die Fläche nur „Dateien auswählen“.
 */
export default function DokumentAblage({
  open,
  titel,
  unterzeile,
  erlaubt,
  accept,
  eingabeId,
  dateien,
  laeuft,
  fortschritt,
  zusatz,
  onDateien,
  onEntfernen,
  onHochladen,
  onClose,
}: {
  open: boolean;
  titel: string;
  unterzeile?: ReactNode;
  /** Was angenommen wird, in Worten: „PDF, Bilder, Word, Excel und E-Mails bis 25 MB“. */
  erlaubt: string;
  accept: string;
  eingabeId: string;
  dateien: readonly AblageDatei[];
  laeuft: boolean;
  fortschritt: string | null;
  /** Einstellungen für diese Ablage, etwa „Nur fürs Büro“. */
  zusatz?: ReactNode;
  onDateien: (dateien: File[]) => void;
  onEntfernen: (id: string) => void;
  onHochladen: () => void;
  onClose: () => void;
}) {
  const feld = useRef<HTMLInputElement>(null);
  const [darueber, setDarueber] = useState(false);
  // dragenter/dragleave feuern auch für jedes Kind der Fläche — gezählt, damit sie nicht flackert.
  const tiefe = useRef(0);
  const gueltig = dateien.filter((d) => !d.problem).length;

  function ziehen(e: DragEvent<HTMLDivElement>, art: 'rein' | 'raus' | 'drueber') {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    if (art === 'rein') tiefe.current += 1;
    if (art === 'raus') tiefe.current = Math.max(0, tiefe.current - 1);
    setDarueber(tiefe.current > 0);
  }

  return (
    <BottomSheet
      open={open}
      auchBreit
      titel={titel}
      label={titel}
      // Während des Hochladens bleibt das Fenster offen — sonst wüsste niemand, was ankam.
      onClose={() => {
        if (!laeuft) onClose();
      }}
    >
      <div className="lot-ablage-fenster">
        {unterzeile && <p className="lot-ablage-unterzeile">{unterzeile}</p>}

        <div
          className="lot-ablage"
          data-darueber={darueber || undefined}
          onDragEnter={(e) => ziehen(e, 'rein')}
          onDragOver={(e) => ziehen(e, 'drueber')}
          onDragLeave={(e) => ziehen(e, 'raus')}
          onDrop={(e) => {
            e.preventDefault();
            tiefe.current = 0;
            setDarueber(false);
            if (laeuft) return;
            const neu = Array.from(e.dataTransfer.files ?? []);
            if (neu.length > 0) onDateien(neu);
          }}
        >
          <LotZeichnung motiv="ablage" art="hinweis" />
          <div className="lot-ablage-text">
            <h3>
              <span className="lot-ablage-fein">Dateien hier ablegen</span>
              <span className="lot-ablage-grob">Vom Gerät hinzufügen</span>
            </h3>
            <p>
              <span className="lot-ablage-fein">oder auf deinem Gerät auswählen · </span>
              {erlaubt}
            </p>
            <input
              ref={feld}
              id={eingabeId}
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              aria-label="Dokumente auswählen"
              onChange={(e) => {
                const neu = Array.from(e.target.files ?? []);
                // Zurücksetzen, damit dieselbe Datei ein zweites Mal gewählt werden kann.
                e.target.value = '';
                if (neu.length > 0) onDateien(neu);
              }}
            />
            <Button variant="secondary" disabled={laeuft} onClick={() => feld.current?.click()}>
              Dateien auswählen
            </Button>
          </div>
        </div>

        {dateien.length > 0 && (
          <section aria-label="Ausgewählte Dateien">
            <h3 className="lot-ablage-titel">Ausgewählte Dateien</h3>
            <ul className="lot-ablage-liste">
              {dateien.map((d) => (
                <li key={d.id}>
                  <div className="min-w-0">
                    <p className="lot-ablage-name">{d.datei.name}</p>
                    <p className="lot-ablage-zustand" data-stand={d.problem ? 'fehl' : d.hinweis ? 'warn' : undefined}>
                      {dateiGroesse(d.datei.size)} · {d.problem ?? d.hinweis ?? 'Bereit zum Hochladen'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    groesse="klein"
                    disabled={laeuft}
                    aria-label={`${d.datei.name} entfernen`}
                    onClick={() => onEntfernen(d.id)}
                  >
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {zusatz}

        {fortschritt && (
          <p className="lot-ablage-unterzeile" role="status">
            {fortschritt}
          </p>
        )}

        <div className="fuss-aktionen">
          <Button variant="ghost" disabled={laeuft} onClick={onClose}>
            Abbrechen
          </Button>
          <Button loading={laeuft} disabled={gueltig === 0} onClick={onHochladen}>
            {gueltig > 1 ? `${gueltig} Dateien hochladen` : 'Hochladen'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
