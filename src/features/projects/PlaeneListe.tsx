import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';
import IconButton from '@/components/IconButton';
import { datumAusMs } from '@/lib/datum';

/**
 * Pläne und Dokumente einer Baustelle als Liste — zum Antippen.
 *
 * Bilder zeigen eine kleine Vorschau, PDFs ein Kürzel. HEIC bekommt keine
 * Vorschau: ausser Safari zeigt kein Browser sie an, und ein leerer Rahmen
 * sähe aus wie ein kaputtes Bild.
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
}: {
  dokumente: WithId<BaustellenDokument>[];
  adressen: Map<string, string>;
  /** Nur für die, die löschen dürfen. */
  onLoeschen?: (d: WithId<BaustellenDokument>) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {dokumente.map((d) => {
        const url = adressen.get(d.pfad);
        const vorschau = url && d.mime.startsWith('image/') && d.mime !== 'image/heic';
        const kuerzel = d.mime === 'application/pdf' ? 'PDF' : 'BILD';
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
                {[groesse(d.bytes), datum(d.createdAt), d.hochgeladenVonName].filter(Boolean).join(' · ')}
              </p>
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
