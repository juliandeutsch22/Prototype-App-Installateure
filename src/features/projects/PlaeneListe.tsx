import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';
import IconButton from '@/components/IconButton';
import { datumAusMs } from '@/lib/datum';
import { kuerzelFuer } from './dokumentKuerzel';

/**
 * Pläne und Dokumente einer Baustelle als Liste — zum Antippen.
 *
 * Bilder zeigen eine kleine Vorschau, alles andere ein Kürzel. HEIC bekommt
 * keine Vorschau: ausser Safari zeigt kein Browser sie an, und ein leerer
 * Rahmen sähe aus wie ein kaputtes Bild.
 */

function groesse(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function datum(ms?: number): string {
  return datumAusMs(ms);
}

export default function PlaeneListe({
  dokumente,
  adressen,
  onLoeschen,
  onNurBuero,
}: {
  dokumente: WithId<BaustellenDokument>[];
  adressen: Map<string, string>;
  /** Nur für die, die löschen dürfen. */
  onLoeschen?: (d: WithId<BaustellenDokument>) => void;
  /** Nur für die, die hochladen dürfen: „nur fürs Büro“ umschalten. */
  onNurBuero?: (d: WithId<BaustellenDokument>, nurBuero: boolean) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {dokumente.map((d) => {
        const url = adressen.get(d.pfad);
        const vorschau = url && d.mime.startsWith('image/') && d.mime !== 'image/heic';
        const kuerzel = kuerzelFuer(d.mime);
        return (
          <li key={d.id} className="flex items-center gap-3 py-2">
            {vorschau ? (
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-12 w-12 shrink-0 rounded-sm border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-line text-xs font-semibold text-ink-muted"
              >
                {kuerzel}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link block truncate text-sm"
                >
                  {d.dateiname}
                </a>
              ) : (
                // Ohne Adresse lässt sich die Datei nicht öffnen — das wird
                // gesagt, statt einen Link zu zeigen, der ins Leere führt.
                <span className="block truncate text-sm text-ink">
                  {d.dateiname} <span className="text-warning">(gerade nicht abrufbar)</span>
                </span>
              )}
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
