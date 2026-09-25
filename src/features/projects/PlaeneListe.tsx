import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';
import IconButton from '@/components/IconButton';
import { List, ListRow } from '@/components/ListRow';
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
    <List>
      {dokumente.map((d) => {
        const url = adressen.get(d.pfad);
        const vorschau = url && d.mime.startsWith('image/') && d.mime !== 'image/heic';
        const kuerzel = d.mime === 'application/pdf' ? 'PDF' : 'BILD';
        return (
          <ListRow
            key={d.id}
            vorne={
              vorschau ? (
                <img src={url} alt="" loading="lazy" className="zeile-bild" />
              ) : (
                <span aria-hidden="true" className="zeile-kuerzel">
                  {kuerzel}
                </span>
              )
            }
            title={
              url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="textlink block truncate"
                >
                  {d.dateiname}
                </a>
              ) : (
                // Ohne Adresse lässt sich die Datei nicht öffnen — das wird
                // gesagt, statt einen Link zu zeigen, der ins Leere führt.
                <span className="block truncate">
                  {d.dateiname} <span className="text-warning">(gerade nicht abrufbar)</span>
                </span>
              )
            }
            subtitle={[groesse(d.bytes), datum(d.createdAt), d.hochgeladenVonName]
              .filter(Boolean)
              .join(' · ')}
          >
            {onLoeschen && (
              <IconButton label={`${d.dateiname} löschen`} tone="danger" onClick={() => onLoeschen(d)}>
                ✕
              </IconButton>
            )}
          </ListRow>
        );
      })}
    </List>
  );
}
