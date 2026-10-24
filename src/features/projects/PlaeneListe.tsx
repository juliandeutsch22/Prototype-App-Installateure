import { useEffect, useRef, useState } from 'react';
import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';
import IconButton from '@/components/IconButton';
import { grundAus } from '@/lib/fehlerGrund';
import { dokumentAdresse, dokumentBild } from '@/lib/db/baustellenDokumente';
import { datumAusMs } from '@/lib/datum';
import { kuerzelFuer } from './dokumentKuerzel';

/**
 * Pläne und Dokumente einer Baustelle als Liste — zum Antippen.
 *
 * Bilder zeigen eine kleine Vorschau, alles andere ein Kürzel. HEIC bekommt
 * keine Vorschau: ausser Safari zeigt kein Browser sie an, und ein leerer
 * Rahmen sähe aus wie ein kaputtes Bild.
 *
 * GEÖFFNET WIRD BEIM ANTIPPEN (A14, 24.10.2026), über eine Adresse, die erst
 * dann entsteht und eine Minute gilt. Der Speicher prüft dabei die Freigabe:
 * steht ein Dokument inzwischen auf „nur fürs Büro“, öffnet es der Monteur
 * nicht mehr, auch wenn die Liste es noch zeigt. Die Vorschau holt das Bild
 * mit der Anmeldung, ohne Adresse.
 */

/** Was der Browser selbst zeigt — alles andere wird mit seinem Namen heruntergeladen. */
function zeigbar(mime: string): boolean {
  return mime === 'application/pdf' || (mime.startsWith('image/') && mime !== 'image/heic') || mime.startsWith('text/');
}

/** Die kleine Vorschau eines Bildes: erst geholt, wenn sie ins Bild kommt. */
function Vorschau({ pfad }: { pfad: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [sichtbar, setSichtbar] = useState(typeof IntersectionObserver === 'undefined');
  const rahmen = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (sichtbar || !rahmen.current) return;
    const beobachter = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setSichtbar(true);
    });
    beobachter.observe(rahmen.current);
    return () => beobachter.disconnect();
  }, [sichtbar]);

  useEffect(() => {
    if (!sichtbar) return;
    let weg = false;
    let adresse: string | null = null;
    dokumentBild(pfad)
      .then((b) => {
        if (weg) return;
        adresse = URL.createObjectURL(b);
        setUrl(adresse);
      })
      // Ohne Vorschau bleibt der leere Rahmen; geöffnet wird trotzdem beim Antippen.
      .catch(() => undefined);
    return () => {
      weg = true;
      if (adresse) URL.revokeObjectURL(adresse);
    };
  }, [pfad, sichtbar]);

  return (
    <span ref={rahmen} aria-hidden="true" className="block h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-line">
      {url && <img src={url} alt="" className="h-12 w-12 object-cover" />}
    </span>
  );
}

function groesse(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function datum(ms?: number): string {
  return datumAusMs(ms);
}

export default function PlaeneListe({
  dokumente,
  onLoeschen,
  onNurBuero,
}: {
  dokumente: WithId<BaustellenDokument>[];
  /** Nur für die, die löschen dürfen. */
  onLoeschen?: (d: WithId<BaustellenDokument>) => void;
  /** Nur für die, die hochladen dürfen: „nur fürs Büro“ umschalten. */
  onNurBuero?: (d: WithId<BaustellenDokument>, nurBuero: boolean) => void;
}) {
  /** Welches Dokument sich gerade nicht öffnen liess — der Grund steht an seiner Zeile. */
  const [fehler, setFehler] = useState<{ id: string; text: string } | null>(null);

  /*
    DAS FENSTER ÖFFNET SICH NOCH IM KLICK (wie beim Nachweis, Runde 3, G26):
    Safari öffnet ein neues Fenster nur unmittelbar auf eine Berührung, nicht
    nach dem Warten auf die Adresse. Erst ein leeres Fenster, dann die Adresse.
  */
  async function oeffnen(d: WithId<BaustellenDokument>) {
    const anzeigen = zeigbar(d.mime);
    const fenster = anzeigen ? window.open('', '_blank') : null;
    setFehler(null);
    try {
      const adresse = await dokumentAdresse(d, !anzeigen);
      if (fenster) {
        // Wie `noopener`: die Datei bekommt keinen Zugriff auf die App.
        fenster.opener = null;
        fenster.location.href = adresse;
      } else if (anzeigen) {
        window.open(adresse, '_blank', 'noopener');
      } else {
        // Word, Excel, E-Mails: herunterladen, mit dem ursprünglichen Namen.
        window.location.assign(adresse);
      }
    } catch (err) {
      fenster?.close();
      setFehler({ id: d.id, text: grundAus(err, 'Lässt sich nicht öffnen — vielleicht ist es inzwischen nur fürs Büro.') });
    }
  }

  return (
    <ul className="divide-y divide-line">
      {dokumente.map((d) => {
        const vorschau = d.mime.startsWith('image/') && d.mime !== 'image/heic';
        const kuerzel = kuerzelFuer(d.mime);
        return (
          <li key={d.id} className="flex items-center gap-3 py-2">
            {vorschau ? (
              <Vorschau pfad={d.pfad} />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-line text-xs font-semibold text-ink-muted"
              >
                {kuerzel}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="link block max-w-full truncate text-left text-sm"
                onClick={() => void oeffnen(d)}
              >
                {d.dateiname}
              </button>
              {fehler?.id === d.id && <p role="alert" className="text-sm text-danger">{fehler.text}</p>}
              <p className="text-xs text-ink-muted">
                {[d.nurBuero ? 'Nur Büro' : '', groesse(d.bytes), datum(d.createdAt), d.hochgeladenVonName]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {/*
                IN DER TEXTSPALTE, nicht neben der Zeile: die Ablage steht in
                der Akte in einer schmalen Spalte, und ein Knopf daneben nahm
                dem Dateinamen die Breite (Messung 12.10.2026).
              */}
              {onNurBuero && (
                <button
                  type="button"
                  className="link inline-flex min-h-touch items-center text-sm"
                  onClick={() => onNurBuero(d, !d.nurBuero)}
                >
                  {d.nurBuero ? 'Für Monteure freigeben' : 'Nur fürs Büro'}
                </button>
              )}
            </div>
            {onLoeschen && (
              <IconButton label={`${d.dateiname} löschen`} tone="danger" onClick={() => onLoeschen(d)}>
                ✕
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
